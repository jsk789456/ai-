// 跨平台机制通用性专项测试：全部使用"非华医网/非好医生"的未知域名，
// 验证 弹窗式答题 / 内置答案表 / 视频门禁 三种机制无需任何平台配置即可自动命中
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

function runScript(html, url, aiAnswer) {
  const dom = new JSDOM(html, {
    url: url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      const store = {};
      window.GM_getValue = (k, d) => (k in store ? store[k] : d);
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = (opts) => {
        if (opts.onload) setTimeout(() => opts.onload({ responseText: '{"answer":"' + (aiAnswer || 'B') + '"}', status: 200 }), 5);
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

function panelTextOf(w) {
  return (w.document.querySelector('#uaa-body') || { textContent: '' }).textContent;
}

(async () => {
  console.log('== 跨平台机制通用性测试（均为未收录平台的陌生域名）==');

  // 测试 1：弹窗机制 —— 未知平台弹出 class="quiz-modal-box" 的答题弹窗，自动接管作答
  {
    const html = '<!doctype html><html><body>'
      + '<div class="quiz-modal-box">'
      + '<div class="q-title">中国的首都是哪里？</div>'
      + '<label><input type="radio" name="mq1" value="A">北京</label>'
      + '<label><input type="radio" name="mq1" value="B">上海</label>'
      + '<label><input type="radio" name="mq1" value="C">广州</label>'
      + '</div></body></html>';
    const { w } = runScript(html, 'https://www.xuexi-exam.cn/quiz.html');
    await new Promise((r) => setTimeout(r, 1800));
    const pt = panelTextOf(w);
    check('未知平台：boot 识别出"弹窗式答题"机制', pt.indexOf('弹窗式答题') >= 0);
    check('未知平台：弹窗题目被检测到', pt.indexOf('弹窗检测到题目') >= 0);
    check('未知平台：弹窗自动选择 B（上海）', w.document.querySelector('input[name="mq1"][value="B"]').checked === true);
  }

  // 测试 2：内置答案表机制 —— 未知平台自定义字段名（qid_str/ans_str），通用探测命中极速模式
  {
    const ids = ['aa11bb22cc33dd44', 'ee55ff66gg77hh88', '11aa22bb33cc44dd', '55ff66gg77hh88ee'];
    const keys = ['C', 'A', 'D', 'B'];
    let form = '<input type="hidden" name="qid_str" value="' + ids.join(',') + '">'
      + '<input type="hidden" name="ans_str" value="' + keys.join(',') + '">';
    ids.forEach((id) => {
      ['A', 'B', 'C', 'D'].forEach((L) => {
        form += '<p><input type="radio" name="q_' + id + '" value="' + L + '">' + L + '</p>';
      });
    });
    const html = '<!doctype html><html><body><form>' + form + '</form></body></html>';
    const { w } = runScript(html, 'https://www.moka-exam.cn/paper.html');
    await new Promise((r) => setTimeout(r, 1500));
    const pt = panelTextOf(w);
    check('未知平台：自定义字段名答案表命中极速模式', pt.indexOf('⚡ 极速模式') >= 0);
    let allOk = true;
    ids.forEach((id, i) => {
      const el = w.document.querySelector('input[name="q_' + id + '"][value="' + keys[i] + '"]');
      if (!el || el.checked !== true) allOk = false;
    });
    check('未知平台：极速模式按序作答 C/A/D/B', allOk);
  }

  // 测试 3：视频门禁机制 —— 未知平台 CC 风格播放器 + gotoExam，速学按钮注入并跳尾
  {
    const html = '<!doctype html><html><body><div id="playerContainer"></div><script>'
      + 'window.cc_js_Player = { pos: 5, getPosition: function(){ return this.pos; }, jumpToTime: function(t){ this.pos = t; }, play: function(){}, pause: function(){} };'
      + 'window.icme_getLearningInfos = function(){ return { totalTime: "600" }; };'
      + 'window.__goto = 0; window.gotoExam = function(){ window.__goto++; };'
      + '</script></body></html>';
    const { w } = runScript(html, 'https://www.ketang.cn/study.html');
    await new Promise((r) => setTimeout(r, 800));
    const btn = w.document.getElementById('uaa-fastvideo-btn');
    check('未知平台：视频门禁识别并注入速学按钮', !!btn);
    check('未知平台：机制日志含"视频门禁"', panelTextOf(w).indexOf('视频门禁') >= 0);
    if (btn) {
      btn.click();
      await new Promise((r) => setTimeout(r, 2000));
      check('未知平台：速学跳至视频结尾（600-2=598）', w.cc_js_Player.getPosition() === 598);
    } else {
      check('未知平台：速学跳至视频结尾（600-2=598）', false);
    }
  }

  console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
