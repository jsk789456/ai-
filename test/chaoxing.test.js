// 超星学习通（chaoxing.com）平台专项测试
// 覆盖：递归 iframe 下钻、.TiMu 提取、题干清洗、平台识别、字体加密检测、视频门禁连刷
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runScript(html, url, onWindow) {
  const captured = [];
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
        if (opts.data) captured.push(opts.data);
        if (opts.onload) setTimeout(() => opts.onload({ responseText: '{"answer":"B"}', status: 200 }), 5);
      };
      window.GM_setClipboard = () => {};
      window.GM_openInTab = () => {};
      window.prompt = () => null;
    },
  });
  const w = dom.window;
  if (onWindow) onWindow(w);
  const s = w.document.createElement('script');
  s.textContent = code;
  w.document.body.appendChild(s);
  return { dom, w, captured };
}

function panelTextOf(w) {
  return (w.document.querySelector('#uaa-body') || { textContent: '' }).textContent;
}

(async () => {
  console.log('== 超星学习通平台专项测试 ==');

  // 测试 1：递归 iframe 下钻 + .TiMu 提取 + 题干清洗
  {
    const html = '<!doctype html><html><body><div id="outer">外层无表单</div><iframe id="f"></iframe></body></html>';
    const { w, captured } = runScript(html, 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterld=1', (w) => {
      const f = w.document.getElementById('f');
      f.contentDocument.body.innerHTML = '<form><div class="TiMu" typename="单选题">'
        + '<div class="Zy_TItle"><div class="clearfix">【1】中国的首都是哪里？(2.5分)</div></div>'
        + '<ul><li><input type="radio" name="q1" value="A">北京</li>'
        + '<li><input type="radio" name="q1" value="B">上海</li></ul></div></form>';
    });
    await sleep(1600);
    const pt = panelTextOf(w);
    check('超星：平台识别为「超星学习通（已适配）」', pt.indexOf('超星学习通') >= 0);
    check('超星：递归扫描穿透 iframe 命中内层 .TiMu（日志含 1 个 iframe）', pt.indexOf('含 1 个 iframe') >= 0);
    check('超星：题干清洗去掉题号【1】与分数(2.5分)，保留核心语义', captured.length > 0 && captured.every((d) => {
      const j = JSON.parse(d);
      return j.stem.indexOf('【1】') < 0 && j.stem.indexOf('(2.5分)') < 0 && j.stem.indexOf('首都') >= 0;
    }));
    const fDoc = w.document.getElementById('f').contentDocument;
    check('超星：AI 作答选择了 B（上海）', fDoc.querySelector('input[name="q1"][value="B"]').checked === true);
  }

  // 测试 2：平台适配器识别（无题目页）
  {
    const html = '<!doctype html><html><body><p>课程学习页</p></body></html>';
    const { w } = runScript(html, 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterld=1');
    await sleep(800);
    const pt = panelTextOf(w);
    check('超星：平台识别日志 = 超星学习通（已适配）', pt.indexOf('平台识别：超星学习通') >= 0);
  }

  // 测试 3：字体加密检测（超星域名 + PUA 私有区字符 \uE123\uE456）
  {
    const pua = String.fromCharCode(0xE123)+String.fromCharCode(0xE456)+' 题目内容';
    const html = '<!doctype html><html><body><p>' + pua + '</p></body></html>';
    const { w } = runScript(html, 'https://mooc1.chaoxing.com/work/doHomeWorkNew');
    await sleep(800);
    const pt = panelTextOf(w);
    check('超星：检测到字体加密并给出提示', pt.indexOf('字体加密') >= 0);
  }

  // 测试 4：视频门禁（超星 video + 下一节按钮）
  {
    const html = '<!doctype html><html><body><video id="video_html5_api"></video><a id="prevNextFocusNext" title="下一节">下一节</a></body></html>';
    const { w } = runScript(html, 'https://mooc1.chaoxing.com/mycourse/studentstudy?chapterld=1');
    await sleep(800);
    const pt = panelTextOf(w);
    check('超星：视频门禁机制被识别', pt.indexOf('视频门禁') >= 0);
    check('超星：注入「⚡ 速学本节视频」按钮', !!w.document.getElementById('uaa-fastvideo-btn'));
  }

  console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
