/*
 * accuracy.test.js — 正确率增强专项测试（NCME 等医学平台低正确率的对症增强）
 *
 * 覆盖：
 *   1. 多选题逐项判断：每选项单独问 AI「是/否」再汇总字母串（医学 X 型题防漏选）
 *   2. 医学自适应 Prompt：医学平台/医学特征词自动加【医学考试题】前缀
 *   3. 否定式题干警示：题干含「错误的是/除外/不是」自动加警示并选不符合项
 *   4. 非医学题干走通用提示词（不误伤普通题）
 *   5. accMedPrompt 关闭时恒走通用提示词（即使 NCME 域名）
 *   6. 逐项判断可关：关闭后多选题回到一次性问法（1 次请求）
 *   7. 豆包（火山方舟）预设模型 + 「去申请 Key」按钮打开官方控制台
 *   8. 「申请教程」一键注入分步教程（火山方舟专版）
 *   9. 双模型会诊默认关 + 面板开关持久化
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PLAIN = path.join(__dirname, '..', 'dist', 'universal-auto-answer.plain.user.js');
const src = fs.readFileSync(PLAIN, 'utf8');

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * 启动脚本。opts:
 *  - url      页面地址（默认 NCME 答题页，医学环境）
 *  - store    预置的 GM 存储
 *  - answer   mock AI 返回的固定答案
 *  - xhrResp  自定义应答函数 (body, callIndex) => answer 字符串；返回 null 走默认
 */
function bootWith(html, opts = {}) {
  const store = Object.assign({}, opts.store || {});
  const reqs = [];
  const state = { reqs, store, openedUrl: '' };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'https://www.ncme.org.cn/qbank/do/paper?paperId=1',
    beforeParse(window) {
      window.GM_getValue = (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d);
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_registerMenuCommand = (name, cb) => {
        try { (window.__uaaMenus = window.__uaaMenus || {})[name] = cb; } catch (_) {}
      };
      window.GM_xmlhttpRequest = (o) => {
        reqs.push({ url: o.url, headers: o.headers || {}, data: o.data || '' });
        setTimeout(() => {
          try {
            let ans = 'B';
            if (opts.xhrResp) {
              let body = null;
              try { body = JSON.parse(o.data || '{}'); } catch (_) {}
              const r = opts.xhrResp(body, reqs.length);
              if (r != null) ans = r;
            } else if (opts.answer != null) ans = opts.answer;
            o.onload({ responseText: JSON.stringify({ answer: ans, choices: [{ message: { content: ans } }] }) });
          } catch (e) {}
        }, 0);
      };
      window.GM_openInTab = (u) => { state.openedUrl = u || ''; };
      window.GM_setClipboard = () => {};
      window.prompt = () => null;
      window.confirm = () => true;
    },
  });
  const w = dom.window;
  const s = w.document.createElement('script');
  s.textContent = src;
  w.document.body.appendChild(s);
  state.window = w;
  return state;
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra != null ? '  | ' + extra : '')); }
}
const $ = (w, sel) => w.document.querySelector(sel);

function multiHtml(stem, optsArr) {
  return '<!doctype html><html><body><fieldset><legend>1. ' + stem + '</legend>' +
    optsArr.map((t, i) => '<label><input type="checkbox" name="q1" value="' + String.fromCharCode(65 + i) + '"> ' + String.fromCharCode(65 + i) + '. ' + t + '</label>').join('') +
    '</fieldset></body></html>';
}
function singleHtml(stem, optsArr) {
  return '<!doctype html><html><body><fieldset><legend>1. ' + stem + '</legend>' +
    optsArr.map((t, i) => '<label><input type="radio" name="q1" value="' + String.fromCharCode(65 + i) + '"> ' + String.fromCharCode(65 + i) + '. ' + t + '</label>').join('') +
    '</fieldset></body></html>';
}
function checkedVals(w, name) {
  return Array.from(w.document.querySelectorAll('input[name="' + name + '"]:checked')).map((i) => i.value).sort().join('');
}

(async () => {
  console.log('\n===== 正确率增强专项 =====');

  // [1] 多选题逐项判断（NCME 医学环境）：4 选项 → 4 次逐项请求 → 汇总勾选
  console.log('\n[1] 多选题逐项判断');
  {
    const pick = { A: true, B: false, C: true, D: false };
    const st = bootWith(multiHtml('患者，男，56岁，急性胸痛3小时，以下哪些检查对诊断最有帮助？',
      ['心电图', '血常规', '肌钙蛋白', '胸部X线']), {
      store: { uaa_heuristic: false, uaa_acc_multi_item: true, uaa_acc_med_prompt: true },
      xhrResp: (body) => {
        const m = ((body && body.prompt) || '').match(/选项 ([A-D])：/);
        const L = m ? m[1] : '';
        return pick[L] ? '是' : '否';
      },
    });
    const w = st.window;
    await sleep(2500);
    check('逐项：发出 4 次逐项请求（每选项一次）', st.reqs.length === 4, '实际 ' + st.reqs.length);
    const asked = st.reqs.map((r) => {
      const m = ((() => { try { return JSON.parse(r.data).prompt; } catch (_) { return ''; } })() || '').match(/选项 ([A-D])：/);
      return m ? m[1] : '';
    }).sort().join('');
    check('逐项：四个选项各问一次（ABCD）', asked === 'ABCD', asked);
    const allItem = st.reqs.every((r) => {
      try { return (JSON.parse(r.data).prompt || '').indexOf('请只判断选项') >= 0; } catch (_) { return false; }
    });
    check('逐项：每次请求均为「请只判断选项 X」', allItem);
    const allMed = st.reqs.every((r) => {
      try { return (JSON.parse(r.data).prompt || '').indexOf('【医学多选题】') >= 0; } catch (_) { return false; }
    });
    check('逐项：医学环境带【医学多选题】前缀', allMed);
    const allMedSys = st.reqs.every((r) => {
      try { return (JSON.parse(r.data).system || '').indexOf('医学考试辅导专家') >= 0; } catch (_) { return false; }
    });
    check('逐项：system 为医学专家提示词', allMedSys);
    check('逐项：汇总勾选 A+C（B/D 判定为否）', checkedVals(w, 'q1') === 'AC', 'checked=' + checkedVals(w, 'q1'));
  }

  // [2] 医学特征词 + 否定式题干 → 单选自动带警示，仍正常作答
  console.log('\n[2] 医学否定式题干警示');
  {
    const st = bootWith(singleHtml('关于高血压患者的药物治疗，下列说法错误的是？',
      ['应在医生指导下用药', '血压正常后即可自行停药']), {
      url: 'https://example.com/exam',
      store: { uaa_heuristic: false },
      answer: 'B',
    });
    const w = st.window;
    await sleep(2500);
    let body = null;
    try { body = JSON.parse(st.reqs[0].data); } catch (_) {}
    check('警示：prompt 含【否定式提问警示】', !!body && (body.prompt || '').indexOf('否定式提问警示') >= 0);
    check('警示：警示词精确命中「错误的是」', !!body && (body.prompt || '').indexOf('错误的是') >= 0);
    check('警示：医学特征词（血压）触发【医学考试题】', !!body && (body.prompt || '').indexOf('【医学考试题】') >= 0);
    check('警示：普通问法 system 仍为默认提示词', !!body && (body.system || '').indexOf('答题判题助手') >= 0,
      body && body.system);
    check('警示：仍正常作答勾选 B', checkedVals(w, 'q1') === 'B', 'checked=' + checkedVals(w, 'q1'));
  }

  // [3] 非医学题干 → 通用提示词，不误伤
  console.log('\n[3] 非医学题干走通用提示词');
  {
    const st = bootWith(singleHtml('中国的首都是哪里？', ['北京', '上海']), {
      url: 'https://example.com/exam',
      store: { uaa_heuristic: false },
      answer: 'A',
    });
    const w = st.window;
    await sleep(2500);
    let body = null;
    try { body = JSON.parse(st.reqs[0].data); } catch (_) {}
    check('通用：不带【医学考试题】前缀', !!body && (body.prompt || '').indexOf('医学考试题') < 0);
    check('通用：不带否定警示', !!body && (body.prompt || '').indexOf('否定式提问警示') < 0);
    check('通用：仍正常作答勾选 A', checkedVals(w, 'q1') === 'A', 'checked=' + checkedVals(w, 'q1'));
  }

  // [4] accMedPrompt 关闭 → NCME 域名也不加医学前缀
  console.log('\n[4] 医学自适应可关（NCME 域名也走通用）');
  {
    const st = bootWith(singleHtml('关于高血压患者的药物治疗，下列说法错误的是？',
      ['应在医生指导下用药', '血压正常后即可自行停药']), {
      store: { uaa_heuristic: false, uaa_acc_med_prompt: false },
      answer: 'B',
    });
    const w = st.window;
    await sleep(2500);
    let body = null;
    try { body = JSON.parse(st.reqs[0].data); } catch (_) {}
    check('关闭后：不带【医学考试题】前缀', !!body && (body.prompt || '').indexOf('医学考试题') < 0);
    check('关闭后：不带否定警示', !!body && (body.prompt || '').indexOf('否定式提问警示') < 0);
    check('关闭后：仍正常作答勾选 B', checkedVals(w, 'q1') === 'B', 'checked=' + checkedVals(w, 'q1'));
  }

  // [5] 逐项判断可关 → 多选题一次性问法（1 次请求，返回 AB）
  console.log('\n[5] 逐项判断关闭 → 一次性问法');
  {
    const st = bootWith(multiHtml('以下哪些是水果？', ['苹果', '香蕉', '土豆']), {
      store: { uaa_heuristic: false, uaa_acc_multi_item: false },
      answer: 'AB',
    });
    const w = st.window;
    await sleep(2500);
    check('一次性：多选只发 1 次整体请求', st.reqs.length === 1, '实际 ' + st.reqs.length);
    let body = null;
    try { body = JSON.parse(st.reqs[0].data); } catch (_) {}
    check('一次性：请求含全部选项文本（题干+选项一起问）',
      !!body && (body.prompt || '').indexOf('苹果') >= 0 && (body.prompt || '').indexOf('土豆') >= 0);
    check('一次性：返回 AB 正确勾选 A+B', checkedVals(w, 'q1') === 'AB', 'checked=' + checkedVals(w, 'q1'));
  }

  // [6] 豆包预设模型 + 去申请 Key 按钮
  console.log('\n[6] 豆包（火山方舟）预设与申请入口');
  {
    const st = bootWith('<!doctype html><html><body></body></html>', {});
    const w = st.window;
    await sleep(350);
    const aiTab = w.document.querySelector('[data-tab="ai"]');
    if (aiTab) aiTab.click();
    await sleep(80);
    const prov = w.document.getElementById('uaa-provider');
    check('面板：服务商下拉存在', !!prov);
    if (prov) {
      prov.value = 'volc';
      prov.dispatchEvent(new w.Event('change'));
      await sleep(100);
      const dl = w.document.getElementById('uaa-modellist');
      check('豆包：datalist 含 doubao-seed-1-6-250615',
        !!dl && (dl.innerHTML || '').indexOf('doubao-seed-1-6-250615') >= 0,
        dl && dl.innerHTML.slice(0, 120));
      const m = w.document.getElementById('uaa-model');
      check('豆包：模型输入框自动填充旗舰模型', !!m && m.value === 'doubao-seed-1-6-250615', m && m.value);
      const ak = w.document.getElementById('uaa-apply-key');
      check('豆包：申请按钮文案含「豆包」', !!ak && /豆包/.test(ak.textContent || ''));
      if (ak) ak.click();
      await sleep(40);
      check('豆包：点击打开火山方舟控制台', /console\.volcengine\.com\/ark/.test(st.openedUrl || ''), st.openedUrl);
    }
  }

  // [7] 申请教程一键注入（切到豆包后展示火山方舟专版）
  console.log('\n[7] 申请教程注入');
  {
    const st = bootWith('<!doctype html><html><body></body></html>', {});
    const w = st.window;
    await sleep(350);
    const aiTab = w.document.querySelector('[data-tab="ai"]');
    if (aiTab) aiTab.click();
    await sleep(80);
    const prov = w.document.getElementById('uaa-provider');
    if (prov) {
      prov.value = 'volc';
      prov.dispatchEvent(new w.Event('change'));
      await sleep(100);
    }
    const ag = w.document.getElementById('uaa-apply-guide');
    check('教程：申请教程按钮存在', !!ag);
    if (ag) {
      ag.click();
      await sleep(40);
      const box = w.document.getElementById('uaa-testresult');
      check('教程：注入 #uaa-testresult', !!box && (box.textContent || '').indexOf('申请步骤') >= 0);
      check('教程：火山方舟专版含「API Key 管理」', !!box && /API Key 管理/.test(box.textContent || ''));
      check('教程：含接入点 ID（ep-xxx）说明', !!box && /ep-xxx/.test(box.innerHTML || ''));
      // 日志区是渲染时刷新的：切一次标签触发 render 后再断言
      if (aiTab) { aiTab.click(); await sleep(40); }
      const log = (w.document.querySelector('#uaa-body') || { textContent: '' }).textContent;
      check('教程：日志记录「已展示…申请教程」', /已展示「火山方舟 豆包」申请教程/.test(log || ''), log && log.slice(-80));
    }
  }

  // [8] 双模型会诊默认关 + 开关持久化
  console.log('\n[8] 双模型会诊开关');
  {
    const st = bootWith('<!doctype html><html><body></body></html>', {});
    const w = st.window;
    await sleep(350);
    // quiz 视图是惰性构建的：先切到「答题」标签再查开关
    const quizTab = w.document.querySelector('[data-tab="quiz"]');
    if (quizTab) quizTab.click();
    await sleep(60);
    const sw = w.document.querySelector('#uaa-view-quiz [data-sw="accDualModel"]');
    check('会诊：开关存在', !!sw);
    check('会诊：默认关闭（无 .on）', !!sw && !sw.classList.contains('on'));
    if (sw) {
      sw.click();
      await sleep(60);
      const sw2 = w.document.querySelector('#uaa-view-quiz [data-sw="accDualModel"]');
      check('会诊：点击后持久化 uaa_acc_dual_model=true', st.store['uaa_acc_dual_model'] === true);
      check('会诊：点击后开关高亮', !!sw2 && sw2.classList.contains('on'));
      const log = (w.document.querySelector('#uaa-body') || { textContent: '' }).textContent;
      check('会诊：日志提示需配复核 Key', /双模型会诊：开（主模型答不上时用复核模型/.test(log || ''), log && log.slice(-90));
    }
  }

  console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
