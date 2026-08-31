/*
 * 面板视觉预览生成器
 * 用 jsdom 真实加载脚本 → 逐个切换 6 个标签 → 抓取面板真实 DOM（含样式与日志）
 * → 拼成一个静态 HTML，便于不开油猴也能直观确认界面效果。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'dist', 'universal-auto-answer.plain.user.js'), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><html><body>
  <video id="v1"></video>
  <fieldset><legend>1. 中国的首都是哪里？</legend>
  <label><input type="radio" name="q1" value="A"> A. 北京</label>
  <label><input type="radio" name="q1" value="B"> B. 上海</label>
  <label><input type="radio" name="q1" value="C"> C. 广州</label></fieldset>
</body></html>`;

// 生成一张"示例收款码"（SVG data URI），让打赏页在预览里也能看到真实观感
function fakeQr(title) {
  const N = 21, M = 10, PAD = 15, SIZE = N * M + PAD * 2;
  let blocks = '';
  const isFinder = (r, c) => {
    const inBox = (r0, c0) => r >= r0 && r < r0 + 8 && c >= c0 && c < c0 + 8;
    return inBox(0, 0) || inBox(0, N - 8) || inBox(N - 8, 0);
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (isFinder(r, c)) continue;
      if (r > 7 && r < 13 && c > 6 && c < 14) continue;   // 中间留白放文字
      const h = (r * 31 + c * 17 + title.length * 7) % 11;
      if (h < 5) blocks += '<rect x="' + (PAD + c * M) + '" y="' + (PAD + r * M) + '" width="' + M + '" height="' + M + '"/>';
    }
  }
  const finder = (r0, c0) =>
    '<rect x="' + (PAD + c0 * M) + '" y="' + (PAD + r0 * M) + '" width="' + (7 * M) + '" height="' + (7 * M) + '"/>' +
    '<rect x="' + (PAD + (c0 + 1) * M) + '" y="' + (PAD + (r0 + 1) * M) + '" width="' + (5 * M) + '" height="' + (5 * M) + '" fill="#fff"/>' +
    '<rect x="' + (PAD + (c0 + 2) * M) + '" y="' + (PAD + (r0 + 2) * M) + '" width="' + (3 * M) + '" height="' + (3 * M) + '"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + SIZE + '" height="' + SIZE + '">' +
    '<rect width="100%" height="100%" fill="#fff"/>' +
    '<g fill="#111">' + blocks + finder(0, 0) + finder(0, N - 8) + finder(N - 8, 0) + '</g>' +
    '<rect x="' + (SIZE / 2 - 46) + '" y="' + (SIZE / 2 - 20) + '" width="92" height="40" rx="8" fill="#fff" opacity=".92"/>' +
    '<text x="' + SIZE / 2 + '" y="' + (SIZE / 2 + 5) + '" font-size="15" text-anchor="middle" fill="#111" font-family="sans-serif">' + title + '</text>' +
    '</svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// 优先用真实收款码（assets/donate-*.txt 里的 data URI），没有则退回示例码
const realQr = (n) => {
  const f = path.join(ROOT, 'assets', 'donate-' + n + '.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
};

const SEED_BANK = {
  '中国的首都是': { a: 'A', s: 'cloud', t: 1 },
  '水的化学式是': { a: 'B', s: 'harvest', t: 2 },
  '以下属于抗生素的是': { a: 'A,C', s: 'harvest', t: 3 },
};

(async () => {
  const store = {
    uaa_ai_cache: JSON.stringify(SEED_BANK),
    uaa_api_key: 'sk-demo-xxxxxxxxxxxx8888',
    uaa_api_base: 'https://api.siliconflow.cn/v1',
    uaa_ai_model: 'Qwen/Qwen2.5-72B-Instruct',
    uaa_api_provider: 'siliconflow',
    uaa_donate_wx: realQr('wx') || fakeQr('微信收款码'),
    uaa_donate_ali: realQr('ali') || fakeQr('支付宝收款码'),
    uaa_donate_wx_b64: realQr('wx'),
    uaa_donate_ali_b64: realQr('ali'),
    uaa_donate_note: '记得备注你的 QQ，作者拉你进内测群，新平台优先适配～',
    uaa_donate_tip: '打赏后请备注 QQ，作者拉你进内测群',
  };
  const dom = new JSDOM(PAGE, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://www.ncme.org.cn/qbank/do/paper?paperId=28502226',
    beforeParse(window) {
      window.GM_getValue = (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d);
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = (o) => setTimeout(() => {
        try { o.onload({ responseText: JSON.stringify({ choices: [{ message: { content: 'A' } }] }) }); } catch (e) {}
      }, 0);
      window.GM_openInTab = () => {};
      window.GM_setClipboard = () => {};
      window.prompt = () => null;
      window.confirm = () => true;
    },
  });
  const w = dom.window;
  const s = w.document.createElement('script');
  s.textContent = src;
  w.document.body.appendChild(s);
  await sleep(1200);

  const css = w.document.getElementById('uaa-style').textContent;
  const shots = [];
  const tabs = [['home', '总览'], ['quiz', '答题'], ['video', '视频'], ['ai', 'AI接口'], ['bank', '题库'], ['donate', '❤打赏'], ['diag', '诊断']];
  for (const [id, label] of tabs) {
    const btn = w.document.querySelector('[data-tab="' + id + '"]');
    if (btn) btn.click();
    await sleep(60);
    const p = w.document.getElementById('uaa-panel');
    shots.push({ id, label, html: p.outerHTML });
  }

  const shotsHtml = shots.map((s2) =>
    '    <figure class="shot"><figcaption>' + s2.label + '</figcaption>' + s2.html + '</figure>'
  ).join('\n');

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>AI 智能答题助手 · 控制面板预览</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; padding:28px 22px 40px; background:
      radial-gradient(1200px 600px at 12% -10%, #1e293b 0%, transparent 60%),
      radial-gradient(900px 500px at 90% 10%, #312e81 0%, transparent 55%),
      linear-gradient(160deg,#070b14 0%,#0b1120 60%,#060910 100%);
    color:#e8ecf5; font:14px/1.6 "Segoe UI",system-ui,"Microsoft YaHei",sans-serif; min-height:100vh; }
  header { max-width:1500px; margin:0 auto 22px; }
  h1 { margin:0 0 6px; font-size:22px; letter-spacing:.5px;
       background:linear-gradient(90deg,#fff,#a5b4fc); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .sub { color:#8b96ad; font-size:12.5px; }
  .wrap { max-width:1500px; margin:0 auto; display:flex; flex-wrap:wrap; gap:22px; align-items:flex-start; }
  figure.shot { margin:0; }
  figcaption { font-size:12px; color:#a5b4fc; margin-bottom:8px; letter-spacing:1px; }
  /* 预览覆盖：面板脱离 fixed 定位，便于并排展示 */
  #uaa-panel { position:static !important; left:auto !important; top:auto !important;
    width:398px !important; max-height:none !important; animation:none !important; margin:0; }
  footer { max-width:1500px; margin:26px auto 0; color:#6b7689; font-size:11.5px; line-height:1.7; }
</style>
<style id="uaa-style">${css}</style>
</head><body>
<header>
  <h1>🤖 AI 智能答题助手 · 统一控制面板</h1>
  <div class="sub">7 大标签 · 逐项开关 · 自定义 AI 接口 · 打赏支持 · 一键自检 —— 下方为脚本在 jsdom 中真实渲染的界面快照</div>
</header>
<div class="wrap">
${shotsHtml}
</div>
<footer>
  ⚠ 本预览仅用于确认界面效果；实际使用时脚本以浮窗形式吸附在页面左上角，可拖动、可收起（快捷键 ↑ / ↓）。<br>
  仅供个人学习辅助与自测，请遵守平台规则与考试纪律，严禁违规代考。
</footer>
</body></html>`;

  const out = path.join(ROOT, 'panel-preview.html');
  fs.writeFileSync(out, html, 'utf8');
  console.log('✓ 预览已生成 -> ' + out + ' (' + html.length + ' 字节，' + shots.length + ' 个标签快照)');
  // jsdom 内的定时器/MutationObserver 会阻止进程退出，这里主动结束
  try { dom.window.close(); } catch (_) {}
  process.exit(0);
})();
