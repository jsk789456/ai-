// 华医网 train.jsp 极速模式 + 多面板防护 专项测试
// 模拟用户提供的真实 HTML 结构（ques_list + key_list + ques_<id> radio 组）
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const SCRIPT_PATH = path.join(__dirname, '..', 'dist', 'universal-auto-answer.plain.user.js');
const code = fs.readFileSync(SCRIPT_PATH, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

// 用户贴的真实题目结构（4 题，key_list=B,A,C,D）
function buildLis() {
  const ids = [
    '7a6d530135ae42d09d0ba1aa2a3d2e21',
    'fd9111fda7e94eb084a2222052b3f4bb',
    'cb26faeb005341b9b3379660eea11e1c',
    'd28722cb7750471eb5991b3db0a48324',
  ];
  const letters = ['A', 'B', 'C', 'D', 'E'];
  let lis = '';
  const stems = [
    '1.骨样骨瘤最具特征性的临床特征是',
    '2.骨母细胞瘤常伴有以下哪种基因异常',
    '3.以下哪种类型骨肉瘤属于低级别骨肉瘤',
    '4.普通型骨肉瘤的常见临床病理特征不包括',
  ];
  ids.forEach((id, i) => {
    let ps = '';
    letters.forEach((L) => {
      ps += '<p><input type="radio" name="ques_' + id + '" value="' + L + '" />' + L + ':选项' + L + '</p>';
    });
    lis += '<li><h3 class="name">' + stems[i] + '</h3><input type="hidden" name="cw_id" value=11830083>' + ps + '</li>';
  });
  return lis;
}

function buildCmeDom() {
  return '<!doctype html><html><head><title>课程学习</title></head><body>'
    + '<form method="post" name="form1" action="trainDo.jsp">'
    + '<input type="hidden" name="ques_num" value=20>'
    + '<ul class="exam_list">' + buildLis() + '</ul>'
    + '<input type="hidden" name="ques_list" value="7a6d530135ae42d09d0ba1aa2a3d2e21,fd9111fda7e94eb084a2222052b3f4bb,cb26faeb005341b9b3379660eea11e1c,d28722cb7750471eb5991b3db0a48324">'
    + '<input type="hidden" name="key_list" value=B,A,C,D>'
    + '<input type="hidden" name="answ_num_list" value=5,5,5,5>'
    + '<input type="button" value="" class="btn1" onClick="doSubmit()" />'
    + '</form></body></html>';
}

function runScriptInDom(html, url) {
  const dom = new JSDOM(html, {
    url: url || 'https://www.cmechina.net/cme/train.jsp?course_id=202601015559&paper_id=01&type=7&product_id=11830083',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      // GM_* 桩
      const store = {};
      window.GM_getValue = (k, d) => (k in store ? store[k] : d);
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = (opts) => {
        if (opts.onload) setTimeout(() => opts.onload({ responseText: '{"answer":"A"}', status: 200 }), 5);
      };
      window.GM_setClipboard = () => {};
      window.GM_openInTab = () => {};
      window.prompt = () => null;
    },
  });
  const w = dom.window;
  const scriptEl = w.document.createElement('script');
  scriptEl.textContent = code;
  w.document.body.appendChild(scriptEl);
  return { dom, w };
}

(async () => {
  console.log('== 华医网极速模式专项测试 ==');

  // 测试 1：极速模式按顺序作答，答案来自 key_list
  {
    const { w } = runScriptInDom(buildCmeDom());
    // 等待 boot -> setTimeout(scanAndAnswer, 1500)
    await new Promise((r) => setTimeout(r, 2200));
    const ids = [
      '7a6d530135ae42d09d0ba1aa2a3d2e21',
      'fd9111fda7e94eb084a2222052b3f4bb',
      'cb26faeb005341b9b3379660eea11e1c',
      'd28722cb7750471eb5991b3db0a48324',
    ];
    const keys = ['B', 'A', 'C', 'D'];
    ids.forEach((id, i) => {
      const sel = 'input[name="ques_' + id + '"][value="' + keys[i] + '"]';
      check('第' + (i + 1) + '题选中 ' + keys[i], w.document.querySelector(sel).checked === true);
    });
    // 其他选项不应被选
    check('第1题的 A 未被选', w.document.querySelector('input[name="ques_' + ids[0] + '"][value="A"]').checked === false);
    // 面板出现且只出现一个
    const panels = w.document.querySelectorAll('#uaa-panel');
    check('面板仅渲染 1 个', panels.length === 1);
    // 实例守卫已打上
    check('实例守卫 data-uaa-booted 已标记', w.document.documentElement.hasAttribute('data-uaa-booted'));
  }

  // 测试 2：无表单控件的 iframe（页头/页脚）不渲染面板（用真实 iframe 模拟）
  {
    const dom2 = new JSDOM('<!doctype html><html><body><iframe id="fra"></iframe></body></html>', {
      url: 'https://www.cmechina.net/train.jsp',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        window.GM_getValue = (k, d) => d;
        window.GM_setValue = () => {};
        window.GM_registerMenuCommand = () => {};
        window.GM_xmlhttpRequest = () => {};
        window.GM_setClipboard = () => {};
        window.GM_openInTab = () => {};
        window.prompt = () => null;
      },
    });
    const w = dom2.window;
    const fra = w.document.getElementById('fra');
    const fraDoc = fra.contentDocument;
    const fraWin = fra.contentWindow;
    // GM_* 桩挂到 iframe 自己的 window 上
    fraWin.GM_getValue = (k, d) => d;
    fraWin.GM_setValue = () => {};
    fraWin.GM_registerMenuCommand = () => {};
    fraWin.GM_xmlhttpRequest = () => {};
    fraWin.GM_setClipboard = () => {};
    fraWin.GM_openInTab = () => {};
    fraWin.prompt = () => null;
    // 确认真实 iframe 环境
    check('iframe 模拟环境成立（top!==self）', fraWin.top !== fraWin.self);
    // iframe 内无 radio/checkbox → 应静默退出
    fraDoc.body.innerHTML = '<div>页头内容，无表单</div>';
    const scriptEl = fraDoc.createElement('script');
    scriptEl.textContent = code;
    fraDoc.body.appendChild(scriptEl);
    await new Promise((r) => setTimeout(r, 800));
    const panels = fraDoc.querySelectorAll('#uaa-panel');
    check('无题目 iframe（模拟页头）不渲染面板', panels.length === 0);
    check('无题目 iframe 已标记实例守卫（不再重复启动）', fraDoc.documentElement.hasAttribute('data-uaa-booted'));
  }

  // 测试 3：key_list 与 ques_list 数量不匹配时回退 AI 扫描（不误触发极速）
  {
    const html = buildCmeDom().replace('value=B,A,C,D', 'value=B,A'); // 篡改为数量不匹配
    const { w } = runScriptInDom(html);
    await new Promise((r) => setTimeout(r, 2200));
    // 应回退到 AI 通用扫描路径（第1题可能通过桩 AI 得到 A）
    const panelText = (w.document.querySelector('#uaa-body') || { textContent: '' }).textContent;
    check('数量不匹配时不走极速模式（无极速日志）', panelText.indexOf('极速模式') < 0);
    check('回退通用扫描路径（有扫描日志）', panelText.indexOf('扫描到') >= 0);
  }

  // 测试 4：考试表单延迟渲染（页面脚本后插入 radio）→ 极速模式短轮询等待并瞬时作答
  {
    // 初始页面只有隐藏域（ques_list/key_list），答题表单由页面脚本延迟渲染
    const stripped = buildCmeDom().replace(/<p><input type="radio"[^>]*>[^<]*<\/p>/g, '');
    if (stripped.indexOf('type="radio"') >= 0) { check('测试 4 前置：radio 已被剥离', false); }
    const { w } = runScriptInDom(stripped);
    // 1 秒后模拟页面脚本动态插入答题表单
    setTimeout(() => {
      w.document.querySelector('ul.exam_list').innerHTML = buildLis();
    }, 1000);
    await new Promise((r) => setTimeout(r, 3200));
    const ids = [
      '7a6d530135ae42d09d0ba1aa2a3d2e21',
      'fd9111fda7e94eb084a2222052b3f4bb',
      'cb26faeb005341b9b3379660eea11e1c',
      'd28722cb7750471eb5991b3db0a48324',
    ];
    const keys = ['B', 'A', 'C', 'D'];
    let allOk = true;
    ids.forEach((id, i) => {
      const sel = 'input[name="ques_' + id + '"][value="' + keys[i] + '"]';
      const el = w.document.querySelector(sel);
      if (!el || el.checked !== true) allOk = false;
    });
    check('表单延迟渲染后极速模式仍按序作答 B/A/C/D', allOk);
    const panelText = (w.document.querySelector('#uaa-body') || { textContent: '' }).textContent;
    check('延迟渲染场景走的是极速模式（非 AI 逐题）', panelText.indexOf('⚡ 极速模式') >= 0);
  }

  console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
