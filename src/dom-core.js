const _DP_FOLLOWING = (typeof Node !== 'undefined') ? Node.DOCUMENT_POSITION_FOLLOWING : 4;

const ADAPTERS = [];

function registerAdapter(adapter) {
  if (!adapter || typeof adapter.match !== 'function') {
    throw new Error('adapter 必须包含 match(url) 函数');
  }
  ADAPTERS.push(adapter);
  return adapter;
}

function listAdapters() {
  return ADAPTERS.map((a) => a.name);
}

function getAdapterForUrl(url) {
  let fallback = null;
  for (const a of ADAPTERS) {
    if (a.universal) { if (!fallback) fallback = a; continue; }
    try {
      if (a.match(url)) return a;
    } catch (_) {
    }
  }
  return fallback;
}

registerAdapter({
  name: 'universal(通用扫描/任意网站)',
  universal: true,
  match: () => true,
});

function optionLetter(i) {
  return String.fromCharCode(65 + i);
}

// 题干最大保留长度（见 extractBySelectors：医学长病例题必须完整）
const STEM_MAX = 1200;

// 平台自定义题型名归一（超星等平台用 typename="单选题" 属性标注题型）
function normalizeTypeName(name) {
  const s = String(name || '');
  if (!s) return '';
  if (/多选/.test(s)) return 'multiple';
  if (/判断/.test(s)) return 'judge';
  if (/填空/.test(s)) return 'blank';
  if (/单选|选择/.test(s)) return 'single';
  return '';
}

// 题干清洗：去掉题号前缀（【1】/1./(1)）与分数后缀（(2.5分)），避免干扰 AI 识别（超星等平台常见）
function cleanStem(s) {
  if (!s) return '';
  let t = String(s).replace(/\s+/g, ' ').trim();
  t = t.replace(/^\s*[\[【(（]?\s*\d+\s*[\]】)）]?\s*[.、)）]?\s*/, '');
  t = t.replace(/\s*[（(]\s*\d+(\.\d+)?\s*分\s*[）)]\s*$/, '');
  t = t.replace(/\s*（\s*本题.*?）\s*$/, '');
  return t.trim();
}

function extractBySelectors(root, selectors) {
  if (!selectors || !selectors.qBlock) return [];
  const blocks = root.querySelectorAll(selectors.qBlock);
  const out = [];
  blocks.forEach((block) => {
    let typeNameRaw = block.getAttribute('typename') || block.getAttribute('data-type-name') || block.getAttribute('data-type') || '';
    if (!typeNameRaw && selectors.typeName) {
      const tn = block.querySelector(selectors.typeName);
      if (tn) typeNameRaw = tn.textContent;
    }
    const typeName = normalizeTypeName(typeNameRaw);
    const type = (typeName || detectType(block)).toLowerCase();
    const stemEl = selectors.stem ? block.querySelector(selectors.stem) : null;
    // 题干上限放宽到 1200 字：医学 A2/A3/A4 病例题题干常 400~800 字，
    // 原先截到 200 字会把主诉/体征/检验值腰斩，AI 只能瞎猜（正确率低的头号原因）。
    const stem = cleanStem(stemEl ? stemEl.textContent : block.textContent).slice(0, STEM_MAX);
    const q = { type, stem, containerEl: block, options: [], blankEls: [] };

    // A3/A4 共用病例/材料块：无选项、无填空输入框、文本够长 → 单独收成 type='material'，
    // 由 attachSharedMaterial 贴给后面的小问。注意必须在分支前判定：
    // 材料块没有任何 input，detectType 会误判为 blank，走到 else 分支时永远等不到它。
    const optEls = block.querySelectorAll(selectors.option);
    if (optEls.length === 0
      && !block.querySelector(selectors.blankInput || 'input[type=text], textarea')
      && q.stem.length >= 30) {
      q.type = 'material'; out.push(q); return;
    }

    if (type === 'blank') {
      const bs = selectors.blankInput || 'input[type=text], textarea';
      q.blankEls = Array.from(block.querySelectorAll(bs));
    } else {
      optEls.forEach((opt, i) => {
        let text;
        if (selectors.optTextFn && typeof selectors.optTextFn === 'function') {
          text = selectors.optTextFn(opt);
        } else {
          const tEl = selectors.optText ? opt.querySelector(selectors.optText) : null;
          text = (tEl || opt).textContent;
        }
        text = cleanOpt((text || '').trim());
        // 选项元素本身无文本（如裸 input）：回退取父节点文本（超星 .TiMu 内 li>input 结构等）
        if (!text && opt.tagName === 'INPUT' && opt.parentElement) text = opt.parentElement.textContent.trim();
        q.options.push({ text: text, el: opt, index: i });
      });
    }
    out.push(q);
  });
  return out;
}

function detectType(block) {
  const inputs = block.querySelectorAll('input');
  if (inputs.length === 0) return 'blank';
  const types = new Set(Array.from(inputs).map((i) => (i.type || '').toLowerCase()));
  if (types.has('radio')) return 'single';
  if (types.has('checkbox')) return 'multiple';
  if (types.has('text') || types.has('textarea')) return 'blank';
  return 'single';
}

// ===== A3/A4 型共用题干（组题材料）识别 =====
// 医学考试常见结构：一段病例/材料下面挂 2~5 个小问，小问题干只有"（1）该患者最可能的诊断是"。
// 不带材料直接问 AI 等于让它凭空猜 —— 这是组题正确率崩掉的元凶。
// 策略：题目序列里认出"材料块"，把它作为紧随其后的短小问的共用前缀。
// 材料块本身没有选项，会被 passFilter 挡掉，所以在 extractBySelectors 里单独收成 type='material'。

// 病例/材料描述特征（足以证明这段文本自带情境）
const RE_CASE = /(患者|病人|男[，,]|女[，,]|\d+\s*岁|主诉|查体|体检|入院|既往|病史|现病史|实验室|血常规|尿常规|生化|B超|CT|MRI|心电图|胸片|胃镜|病理|病例|病历|材料[一二三四五六七八九十\d]*[:：]?|以下是|试[题卷]|(?:阅读|请看|根据)[^。；]{0,20}(?:材料|病例|病例摘要|内容))/;
// 提问语气标志（有这些说明它本身是完整问句，不是材料）
const RE_ASK = /(以下哪项|下列哪些项|下列哪项|下列哪些|哪[一种个]项|正确的是|错误的是|不正确|除外|不属于|不符合|是最|称为|是指|定义是|首选|最可能|最常见|主要的|关键的|应首选|应[选择采用]|属于)/;

function isMaterialStem(stem) {
  const s = String(stem || '').trim();
  if (s.length < 30) return false;
  if (/[？?]/.test(s)) return false;      // 有问号 → 是问句不是材料
  return RE_CASE.test(s) && !RE_ASK.test(s);
}

// 往题目序列里回填共用材料：material 之后的短小问会自动带上材料前缀，
// 遇到新的自足长题干或新材料块时重置，避免把 A 组材料错贴到 B 组题上。
function attachSharedMaterial(questions) {
  if (!questions || questions.length < 2) return questions;
  let mat = '';
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q) continue;
    const s = String(q.stem || '').trim();
    if (q.type === 'material') { mat = s; continue; }
    if (!s) continue;
    // 自足的长问句：本组结束，清空材料
    if (s.length >= 60 || (/[？?]/.test(s) && s.length >= 45)) { mat = ''; continue; }
    if (isMaterialStem(s)) { mat = s; continue; }
    if (mat && s.length < 60) {
      q.sharedMaterial = mat;
      q.stem = mat + ' ' + s;
    }
  }
  return questions.filter((q) => q && q.type !== 'material'); // 材料已并入小问，不再单列
}

function heuristicScan(root) {
  const doc = root && root.nodeType === 9 ? root : (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!doc) return [];
  const scope = root && root.nodeType !== 9 ? root : doc;

  const allInputs = Array.from(scope.querySelectorAll('input, textarea'));
  const choiceInputs = allInputs.filter((i) => {
    const t = (i.type || (i.tagName === 'TEXTAREA' ? 'textarea' : '')).toLowerCase();
    return t === 'radio' || t === 'checkbox';
  });

  const groups = groupChoices(choiceInputs);
  const choiceContainers = new Set();
  const questions = [];
  for (const g of groups) {
    const q = buildChoiceQuestion(g.inputs);
    if (q && passFilter(q)) {
      questions.push(q);
      if (q.containerEl) choiceContainers.add(q.containerEl);
    }
  }

  const textInputs = allInputs.filter((i) => {
    const t = (i.type || (i.tagName === 'TEXTAREA' ? 'textarea' : '')).toLowerCase();
    return t === 'text' || t === 'textarea' || t === '';
  });
  for (const inp of textInputs) {
    if (Array.from(choiceContainers).some((c) => c.contains(inp))) continue;
    const q = buildBlankQuestion(inp);
    if (q && passFilter(q)) questions.push(q);
  }

  return questions;
}

function groupChoices(inputs) {
  const byName = new Map();
  const noName = [];
  for (const inp of inputs) {
    const nm = inp.name || '';
    if (nm) {
      if (!byName.has(nm)) byName.set(nm, []);
      byName.get(nm).push(inp);
    } else {
      noName.push(inp);
    }
  }
  const groups = [];
  for (const arr of byName.values()) {
    if (arr.length >= 1) groups.push({ inputs: arr, name: arr[0].name });
  }
  if (noName.length) {
    const containerMap = new Map();
    for (const inp of noName) {
      const c = nearestContainerWithSibling(inp, noName);
      if (c) {
        if (!containerMap.has(c)) containerMap.set(c, []);
        containerMap.get(c).push(inp);
      } else {
        groups.push({ inputs: [inp], name: '' });
      }
    }
    for (const arr of containerMap.values()) {
      if (arr.length >= 1) groups.push({ inputs: arr, name: '' });
    }
  }
  return groups;
}

function nearestContainerWithSibling(inp, siblings) {
  let el = inp.parentElement;
  while (el) {
    const same = siblings.some((s) => s !== inp && el.contains(s));
    if (same) return el;
    el = el.parentElement;
  }
  return null;
}

function leastCommonAncestor(nodes) {
  if (!nodes.length) return null;
  if (nodes.length === 1) return nodes[0].parentElement || nodes[0];
  const paths = nodes.map((n) => {
    const p = [];
    let e = n.parentElement;
    while (e) { p.unshift(e); e = e.parentElement; }
    return p;
  });
  let common = null;
  const minLen = Math.min.apply(null, paths.map((p) => p.length));
  for (let i = 0; i < minLen; i++) {
    const el = paths[0][i];
    if (paths.every((p) => p[i] === el)) common = el;
    else break;
  }
  return common || (nodes[0].ownerDocument && nodes[0].ownerDocument.body) || nodes[0];
}

function buildChoiceQuestion(inputs) {
  const container = leastCommonAncestor(inputs);
  const stem = getStemFromContainer(container, inputs);
  const options = inputs.map((inp, i) => ({ text: getOptionText(inp), el: inp, index: i }));
  let type;
  if (isJudge(options)) type = 'judge';
  else if (inputs.every((i) => (i.type || '').toLowerCase() === 'checkbox')) type = 'multiple';
  else type = 'single';
  return { type, stem, containerEl: container, options, blankEls: [] };
}

function isJudge(options) {
  if (options.length !== 2) return false;
  const a = judgeTruth(options[0].text);
  const b = judgeTruth(options[1].text);
  return a !== null && b !== null && a !== b;
}

function getStemFromContainer(container, inputs) {
  if (!container) return '';
  const firstInput = inputs[0];
  const legend = container.querySelector && container.querySelector('legend');
  if (legend && legend.textContent.trim()) return legend.textContent.trim();
  const titleSel = '[class*=title],[class*=stem],[class*=question],[class*=topic],[class*=caption],[class*=q-text],h1,h2,h3,h4,h5,h6,b,strong';
  const titleEls = Array.from(container.querySelectorAll ? container.querySelectorAll(titleSel) : []);
  for (const te of titleEls) {
    if (firstInput && (te.compareDocumentPosition(firstInput) & _DP_FOLLOWING)) {
      const txt = te.textContent.trim();
      if (txt && txt.length < 200) return txt;
    }
  }
  return cleanStem(textBeforeNode(container, firstInput));
}

function textBeforeNode(container, node) {
  const parts = [];
  const walk = (el) => {
    for (const child of el.childNodes) {
      if (child === node) return;
      if (child.nodeType === 3) {
        const s = child.textContent.replace(/\s+/g, ' ').trim();
        if (s) parts.push(s);
      } else if (child.nodeType === 1) {
        if (node && child.contains(node)) { walk(child); return; }
        walk(child);
      }
    }
  };
  walk(container);
  return parts.join(' ').trim();
}

function getOptionText(input) {
  if (input.id) {
    const lab = Array.from(input.ownerDocument.querySelectorAll('label'))
      .find((l) => l.getAttribute('for') === input.id);
    if (lab) return cleanOpt(lab.textContent);
  }
  const pl = input.closest ? input.closest('label') : null;
  if (pl) return cleanOpt(pl.textContent);
  const parent = input.parentElement;
  if (parent) return cleanOpt(parentTextExcludingInputs(parent, input));
  return cleanOpt(siblingTextAfter(input));
}

function parentTextExcludingInputs(parent, input) {
  let txt = '';
  for (const child of parent.childNodes) {
    if (child === input) continue;
    if (child.nodeType === 3) txt += child.textContent;
    else if (child.nodeType === 1 && child !== input && !child.contains(input)) txt += child.textContent;
  }
  return txt;
}

function siblingTextAfter(input) {
  let txt = '';
  let n = input.nextSibling;
  while (n) {
    if (n.nodeType === 3) txt += n.textContent;
    else if (n.nodeType === 1) txt += n.textContent;
    n = n.nextSibling;
  }
  return txt;
}

function cleanOpt(s) {
  if (!s) return '';
  return s.replace(/\s+/g, ' ').trim()
    .replace(/^[A-Za-z0-9①-⑩Ⅰ-Ⅹ][.、)）\s]+/, '')
    .trim();
}

function buildBlankQuestion(input) {
  const container = input.closest ? (input.closest('div,li,td,p,label,fieldset,form,section,article') || input.parentElement) : input.parentElement;
  const containerText = (container ? container.textContent : '').replace(/\s+/g, ' ');
  const marker = /(_{2,}|_{3,}|（\s*）|（）|\(\s*\)|填空|请[填输]|空\s*格|作答|回答|回答题)/;
  if (!marker.test(containerText)) return null;
  const stem = getBlankStem(container, input);
  return { type: 'blank', stem, containerEl: container, options: [], blankEls: [input] };
}

function getBlankStem(container, input) {
  if (!container) return '';
  const t = (container.textContent || '').replace(/\s+/g, ' ').trim();
  return t.length > 200 ? t.slice(0, 200) : t;
}

function passFilter(q) {
  if (q.type === 'blank') {
    return q.blankEls && q.blankEls.length > 0;
  }
  if (!q.options || q.options.length < 2) return false;
  const emptyOpts = q.options.filter((o) => !(o.text && o.text.trim())).length;
  if (emptyOpts >= q.options.length) return false;

  const stem = (q.stem || '').trim();
  const hasQuestionMark = /[？?]/.test(stem);
  const hasNumber = /^\s*\d+[\.、)）]/.test(stem) || /第\s*\d+\s*[题部分]/.test(stem) || /[（(]\s*\d+\s*[）)]/.test(stem);
  const hasTi = /题|选择|判断|填空|作答|回答|答案|单选|多选/.test(stem);
  const optsShort = q.options.every((o) => (o.text || '').trim().length <= 120);
  const optsWithIndex = q.options.some((o) => /^[A-Za-z0-9①-⑩Ⅰ-Ⅹ][.、)）\s]/.test(o.text || ''));
  const optsAllShort = q.options.every((o) => (o.text || '').trim().length <= 40);

  const firstInput = q.containerEl && q.containerEl.querySelector && q.containerEl.querySelector('input');
  const nm = (firstInput && (firstInput.name || '')) || '';
  const nameBlack = /(token|csrf|remember|agree|subscribe|accept|cookie|search|query|keyword)/i.test(nm);
  if (nameBlack && !hasQuestionMark && !hasTi) return false;

  if (stem.length >= 3 && (hasQuestionMark || hasNumber || hasTi)) return true;
  if (optsShort && (optsWithIndex || optsAllShort)) return true;
  return false;
}

// ===== 机制：点击式答题（通用，第二阶段：纯 div/li/span 选项，无原生 input）=====
// 适配如国家继续医学教育网考试页（.qItem + .options-block li[data-mark]）等
// 任意"选项以 A/B/C/D 字母标记、点击选择"的页面，零平台硬编码也可命中。
function isClickOptionEl(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName;
  if (!/^(LI|DIV|A|BUTTON|LABEL|SPAN|DD|P|ARTICLE|SECTION|TR)$/.test(tag)) return false;
  if (el.querySelector && el.querySelector('input[type="radio"],input[type="checkbox"]')) return false; // 已归原生 radio 机制
  const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
  if (t.length < 1 || t.length > 220) return false;
  // 以单个字母/带圈数字序号开头（可带分隔符或紧贴，如 "A." / "A水星"）
  if (/^[A-Za-z\u2460-\u24EB\u2160-\u217B][.、)）\s]?/.test(t)) return true;
  // 判断题：对/错（√/×）标记开头
  if (/^[对错√×正误]/.test(t)) return true;
  // 含 mark/key/label/letter 类子元素且文本为单字母或单字（对/错）
  if (el.querySelector) {
    const mark = el.querySelector('[class*="mark"],[class*="key"],[class*="label"],[class*="letter"],[class*="prefix"]');
    if (mark && /^[A-Za-z\u2460-\u24EB\u2160-\u217B对错]$/.test((mark.textContent || '').trim())) return true;
  }
  return false;
}

function getClickOptText(o) {
  let t = '';
  if (o.querySelector) {
    const mark = o.querySelector('[class*="mark"],[class*="key"],[class*="label"],[class*="prefix"]');
    if (mark) t += mark.textContent + ' ';
  }
  t += (o.textContent || '');
  return cleanOpt(t);
}

function getClickStem(container, firstOpt) {
  let s = textBeforeNode(container, firstOpt);
  if (!s || s.length < 4) {
    const titleEl = container.querySelector && container.querySelector('[class*="title"],[class*="stem"],[class*="question"],[class*="topic"],[class*="caption"],[class*="q-text"],h1,h2,h3,h4');
    if (titleEl) s = titleEl.textContent;
  }
  return cleanStem(s || '');
}

function detectClickQuestions(root) {
  const doc = root && root.nodeType === 9 ? root : (root && root.ownerDocument) || (typeof document !== 'undefined' ? document : null);
  if (!doc) return [];
  const scope = root && root.nodeType !== 9 ? root : doc;
  const found = [];
  const containers = scope.querySelectorAll('ul, ol, [class*="options"],[class*="option"],[class*="opt"],[class*="choices"],[class*="choice"],[class*="answer"],[class*="select"],[class*="item"],[class*="q-item"],[class*="qItem"],[class*="question"],[class*="paper"]');
  for (const c of containers) {
    const opts = Array.from(c.children || []).filter(isClickOptionEl);
    if (opts.length < 2 || opts.length > 12) continue;
    // 选项组（如 ul）通常不含题干：向上爬祖先，直到某个祖先在首个选项"之前"含有题干文本
    let container = c;
    let guard = 0;
    while (container && container.parentElement && guard++ < 8) {
      const before = textBeforeNode(container, opts[0]);
      if (before && before.replace(/\s+/g, ' ').trim().length >= 4) break;
      container = container.parentElement;
    }
    const stem = getClickStem(container, opts[0]);
    if (!stem || stem.length < 4) continue;
    // 仅在疑似题目语境下接受（避免导航菜单/筛选器/分页等误命中）
    const ctx = (stem + ' ' + ((container.textContent || '').slice(0, 500))).replace(/\s+/g, ' ');
    if (!/([？?]|题|选择|判断|作答|回答|答案|单选|多选|正确|错误|对错|对|错|是否)/.test(ctx)) continue;
    const judge = opts.length === 2 && opts.every((o) => judgeTruth(getClickOptText(o)) != null);
    const type = judge ? 'judge' : 'single';
    const options = opts.map((o, i) => ({ text: getClickOptText(o), el: o, index: i }));
    const q = { type, stem, containerEl: container, options, blankEls: [] };
    if (!passFilter(q)) continue;
    found.push(q);
  }
  return found;
}

function autoFill(doc, question, answer) {
  if (!question || !answer) return false;
  const a = String(answer).trim();
  if (!a) return false;

  if (question.type === 'blank') {
    const blanks = question.blankEls || [];
    if (blanks.length === 0) return false;
    const parts = a.split(/[，,、]/).map((s) => s.trim()).filter(Boolean);
    if (blanks.length === 1) {
      setInputValue(blanks[0], a);
    } else {
      blanks.forEach((el, i) => setInputValue(el, parts[i] != null ? parts[i] : a));
    }
    return true;
  }

  if (question.type === 'judge') {
    const want = judgeTruth(a);
    if (want == null) return false;
    const target = question.options.find((o) => judgeTruth(o.text) === want);
    if (target) {
      clickOption(target.el);
      return true;
    }
    return false;
  }

  const letters = (a.match(/[A-Za-z]/g) || []).map((c) => c.toUpperCase());
  let picked = [];
  if (letters.length) {
    picked = question.options.filter((o) => letters.includes(optionLetter(o.index)));
  }
  if (picked.length === 0) {
    picked = question.options.filter((o) => optionTextMatch(o.text, a));
  }
  if (picked.length === 0) return false;
  picked.forEach((o) => clickOption(o.el));
  return true;
}

function optionTextMatch(optText, answer) {
  const A = String(optText || '').replace(/^[^.、)）]*[.、)）]\s*/, '').toLowerCase();
  const B = String(answer || '').replace(/[，,、]/g, ' ').toLowerCase().trim();
  if (A === B) return true;
  return A.includes(B.replace(/[a-z]\.?/, '').trim()) || B.includes(A.replace(/[a-z]\.?/, '').trim());
}

function judgeTruth(text) {
  const t = String(text || '').toLowerCase().trim();
  if (/^(对|正确|true|t|√|是|yes|y)/.test(t)) return true;
  if (/^(错|错误|false|f|×|否|no|n)/.test(t)) return false;
  return null;
}

function setInputValue(el, value) {
  if (!el) return;
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  const Ev = (el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.Event) || Event;
  el.dispatchEvent(new Ev('input', { bubbles: true }));
  el.dispatchEvent(new Ev('change', { bubbles: true }));
}

function clickOption(el) {
  if (!el) return;
  const Ev = (el.ownerDocument && el.ownerDocument.defaultView && el.ownerDocument.defaultView.Event) || Event;
  let input = el;
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') {
    input = el.querySelector('input');
  }
  if (input && (input.type === 'checkbox' || input.type === 'radio')) {
    input.checked = true;
    input.dispatchEvent(new Ev('click', { bubbles: true }));
    input.dispatchEvent(new Ev('change', { bubbles: true }));
  } else if (!input) {
    el.dispatchEvent(new Ev('click', { bubbles: true }));
  }
}

function parseAIAnswer(raw, question) {
  if (!raw) return null;
  const t = String(raw).replace(/\s+/g, ' ').trim();
  if (question && question.type === 'judge') {
    if (/错误|错|false|×/.test(t) && !/正确|对/.test(t)) return '错误';
    if (/正确|对|true|√/.test(t)) return '正确';
    return t;
  }
  if (question && question.type === 'blank') return t.replace(/^答案[：:]?\s*/, '');
  const letters = (t.match(/[A-Za-z]/g) || []).map((c) => c.toUpperCase());
  if (letters.length) {
    const opts = (question && question.options) || [];
    const valid = letters.filter((L) => (L.charCodeAt(0) - 65) < opts.length);
    return (valid.length ? valid : letters).join('');
  }
  return t;
}

function extractQuestions(doc, adapter) {
  const root = doc || (typeof document !== 'undefined' ? document : null);
  if (!root) return [];
  let qs;
  if (adapter && adapter.selectors && adapter.selectors.qBlock) {
    const bySel = extractBySelectors(root, adapter.selectors);
    if (bySel.length) qs = bySel;
    else qs = heuristicScan(root).concat(detectClickQuestions(root)); // 适配器选择器未命中（如 NCME 课程列表/视频页）：兜底通用扫描（含点击式答题）
  } else {
    const h = heuristicScan(root);
    qs = h.length ? h : detectClickQuestions(root); // 无原生 input 时，尝试点击式答题机制
  }
  return attachSharedMaterial(qs); // A3/A4 组题：把共用材料贴到后续小问
}

const DomCore = {
  registerAdapter,
  getAdapterForUrl,
  listAdapters,
  extractQuestions,
  heuristicScan,
  detectClickQuestions,
  extractBySelectors,
  autoFill,
  optionLetter,
  detectType,
  judgeTruth,
  optionTextMatch,
  parseAIAnswer,
  passFilter,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DomCore;
}
if (typeof window !== 'undefined') {
  window.DomCore = DomCore;
}
