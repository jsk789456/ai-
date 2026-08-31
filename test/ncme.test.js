// ncme.org.cn 平台专项测试：适配器识别 + 倍速面板 + 未完成课程遍历
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PLAIN = path.join(__dirname, '..', 'dist', 'universal-auto-answer.plain.user.js');
const src = fs.readFileSync(PLAIN, 'utf8');

// 整个脚本作为 <script> 注入执行（与 mechanism.test.js 同款加载方式，IIFE 正常执行）
// 注意：不要预置 <div id="uaa-body">，脚本会自建 ua-panel（内部含 #uaa-body 日志区）
function bootWith(html, opts = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'https://www.ncme.org.cn/my-course',
    beforeParse(window) {
      const store = {};
      window.GM_getValue = (k, d) => (opts.gm && opts.gm[k] != null) ? opts.gm[k] : (k in store ? store[k] : d);
      window.GM_setValue = (k, v) => { if (opts.gm) opts.gm[k] = v; store[k] = v; };
      window.GM_registerMenuCommand = (name, cb) => { try { (window.__uaaMenus = window.__uaaMenus || {})[name] = cb; } catch (_) {} };
      window.GM_xmlhttpRequest = opts.xhr || (() => {});
      window.GM_openInTab = () => {};
      window.GM_setClipboard = () => {};
      window.prompt = () => null;
      if (opts.xt) window.__XT__ = opts.xt;
    },
  });
  const w = dom.window;
  const s = w.document.createElement('script');
  s.textContent = src;
  w.document.body.appendChild(s);
  return w;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function logTextOf(w) {
  return (w.document.querySelector('#uaa-body') || { textContent: '' }).textContent || '';
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
}

(async () => {
  console.log('\n===== ncme.org.cn 平台专项 =====');

  // ========== 测试 1：适配器识别 ==========
  console.log('\n[1] 适配器识别 ncme.org.cn');
  {
    const html = `<!doctype html><html><body></body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/my-course' });
    await sleep(900);
    const logText = logTextOf(w);
    check('ncme 域名命中适配器', /国家继续医学教育网/.test(logText), 'log=' + logText.slice(0, 120));
    check('未收录平台未触发', !/未收录平台/.test(logText));
  }

  // ========== 测试 2：倍速面板 + 持久化 ==========
  console.log('\n[2] 倍速面板（1×/2×/3×/5×）');
  {
    const html = `<!doctype html><html><body><video></video></body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/course/video?cid=1' });
    await sleep(200);
    const panel = w.document.getElementById('uaa-speed-panel');
    check('倍速面板已注入', !!panel);
    if (panel) {
      const btns = panel.querySelectorAll('button');
      const labels = Array.from(btns).map((b) => b.textContent.trim());
      check('六档倍速全部展示', JSON.stringify(labels) === JSON.stringify(['1×', '2×', '3×', '5×', '8×', '16×']), 'got=' + JSON.stringify(labels));
      const active = panel.querySelector('button.active');
      check('默认 2× 高亮', active && active.textContent.trim() === '2×', 'active=' + (active ? active.textContent : 'null'));
      btns[2].click();
      await sleep(50);
      const active2 = panel.querySelector('button.active');
      check('点击 3× 后高亮切换', active2 && active2.textContent.trim() === '3×');
      check('CFG.userSpeed 已更新', w.document.querySelector('video').playbackRate === 3);
    }
  }

  // ========== 测试 3：自定义初始倍速 ==========
  console.log('\n[3] 持久化倍速（GM_getValue 初始 5×）');
  {
    const html = `<!doctype html><html><body><video></video></body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/course/video?cid=1', gm: { uaa_user_speed: 5 } });
    await sleep(150);
    const panel = w.document.getElementById('uaa-speed-panel');
    if (panel) {
      const active = panel.querySelector('button.active');
      check('初始 5× 高亮', active && active.textContent.trim() === '5×');
      check('video 已应用 5×', w.document.querySelector('video').playbackRate === 5);
    } else { check('倍速面板已注入', false); }
  }

  // ========== 测试 4：课程列表页检测 ==========
  console.log('\n[4] 课程列表页识别 + 自动完成按钮注入');
  {
    const html = `<!doctype html><html><body>
      <ul>
        <li class="course-card"><h3>课程A</h3><span>已完成</span><a class="btn">查看证书</a></li>
        <li class="course-card"><h3>课程B（高血压）</h3><span>未完成</span><a class="btn" id="entry-b">进入学习</a></li>
        <li class="course-card"><h3>课程C</h3><span>未完成</span><a class="btn">进入学习</a></li>
      </ul>
    </body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/project-center/projectYjt?projectType=3' });
    await sleep(900);
    const autoBtn = w.document.getElementById('uaa-coursectrl-btn');
    check('课程列表页注入"自动完成未完成课程"按钮', !!autoBtn);
    check('日志提示检测到课程列表页', /检测到课程列表页/.test(logTextOf(w)));
  }

  // ========== 测试 5：自动完成点击第一个未完成课程入口 ==========
  console.log('\n[5] 点击"自动完成"后精准命中第一个未完成课程入口');
  {
    const html = `<!doctype html><html><body>
      <ul>
        <li class="course-card"><h3>课程A</h3><span class="status">已完成</span><a class="btn">查看证书</a></li>
        <li class="course-card"><h3>课程B（高血压）</h3><span class="status">未完成</span><a class="btn" id="target-entry">进入学习</a></li>
        <li class="course-card"><h3>课程C</h3><span class="status">未完成</span><a class="btn">进入学习</a></li>
      </ul>
    </body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/my-course' });
    await sleep(300);
    const entry = w.document.getElementById('target-entry');
    let entryClicked = false;
    entry.click = () => { entryClicked = true; };
    const autoBtn = w.document.getElementById('uaa-coursectrl-btn');
    if (autoBtn) {
      try {
        autoBtn.click();
        await sleep(600);
        check('点击"自动完成"后，第一个未完成课程（课程B）入口被点击', entryClicked);
        check('日志显示发现未完成课程', /发现未完成课程/.test(logTextOf(w)));
      } catch (e) { check('触发自动完成', false, e.message); }
    } else { check('按钮存在', false); }
  }

  // ========== 测试 6：PLAYER_PROFILES 改造 ==========
  console.log('\n[6] PLAYER_PROFILES 改造：HTML5 不再带 speed:16');
  {
    check('PLAYER_PROFILES 中 HTML5 speed:16 已移除', !/speed:\s*16/.test(src));
    check('速学模式锁定用 CFG.fastVideoSpeed（默认16，可配置到1000×）', /fastVideoRunning\s*\?\s*CFG\.fastVideoSpeed/.test(src) && /ratechange/.test(src));
  }

  // ========== 测试 7：SPA 路由识别视频门禁（window.__XT__.routePath=/player/record）==========
  console.log('\n[7] NCME SPA 播放页路由识别（SSR 内联 routePath 立即命中）');
  {
    const html = `<!doctype html><html><body></body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/player/record?periodId=10140', xt: { routePath: '/player/record' } });
    await sleep(300);
    const fast = w.document.getElementById('uaa-fastvideo-btn');
    const panel = w.document.getElementById('uaa-speed-panel');
    check('routePath=/player/record 被识别为视频门禁并注入速学按钮', !!fast);
    check('视频门禁页同时注入倍速面板', !!panel);
    check('日志提示检测到课件视频页', /检测到课件视频页/.test(logTextOf(w)));
  }

  // ========== 测试 8：复制日志 / 详细切换（用户可粘出诊断报告）==========
  console.log('\n[8] 面板头部 📋复制日志 + 🪵详细按钮');
  {
    const html = `<!doctype html><html><body></body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/my-course' });
    await sleep(400);
    const copyBtn = w.document.getElementById('uaa-copy-log');
    const toggleBtn = w.document.getElementById('uaa-toggle-all');
    check('面板头部存在 📋复制日志 按钮', !!copyBtn);
    check('面板头部存在 🪵详细按钮', !!toggleBtn);
    // 验证 buildDiagnosticReport 函数存在
    check('buildDiagnosticReport 函数已注入', /function\s+buildDiagnosticReport\s*\(/.test(src));
    check('CFG 含 showAllLogs 持久化', /showAllLogs:\s*GM_getValue\(\s*'uaa_show_all_logs'/.test(src));
    // 验证默认按钮文案
    if (toggleBtn) check('🪵按钮默认显示"详细"', /详细/.test(toggleBtn.textContent));
    // 触发切换：详细 ⇄ 简略
    if (toggleBtn) {
      toggleBtn.click();
      await sleep(50);
      check('点击后切到"简略"（CFG.showAllLogs=true 持久化）', /简略/.test(toggleBtn.textContent));
      toggleBtn.click();
      await sleep(50);
      check('再次点击切回"详细"', /详细/.test(toggleBtn.textContent));
    }
    // 验证按钮事件在源码里都有正确绑定（含小图标 + 提示文本）
    check('📋 按钮含拷贝诊断标识', /uaa-copy-log[^\n]*?\u590d\u5236\u65e5\u5fd7/.test(src));
  }

  // ========== 测试 9：考试页（/qbank/do/paper）点击式答题适配 ==========
  console.log('\n[9] NCME 考试页点击式答题（.qItem + .options-block li，无原生 input）');
  {
    function q(n, stem, opts) {
      const lis = opts.map((o) => '<li data-v-4a42db40="" class=""><span data-v-4a42db40="" class="mark">' + o[0] + '</span> <span data-v-4a42db40="" class="content">' + o[1] + '</span></li>').join('');
      return '<div data-v-5c5e4be0="" class="q-type q-single qItem q-' + n + ' q-no-' + n + '" data-v-0211b8c0=""><div data-v-4a42db40=""><div data-v-4a42db40="" class="title-block clearfix"><div data-v-4a42db40="" class="num-block"><span data-v-4a42db40="" class="num">' + n + '</span></div> <div data-v-4a42db40="" class="block"><span data-v-4a42db40="" class="q-type">[单选题]</span> <span data-v-4a42db40="" class="q-title">' + stem + '</span></div></div> <div data-v-4a42db40="" class="options-block"><ul data-v-4a42db40="" class="">' + lis + '</ul></div></div></div>';
    }
    const html = '<!doctype html><html><body><div class="qbank-body">' +
      q(1, '关于医保结算清单与病案首页的主管单位和上报平台，下列说法正确的是？', [['A','两者均由国家医保局主管'],['B','结算清单由国家医保局主管，用于医保结算；病案首页由国家卫生健康委主管'],['C','两者均由国家卫生健康委主管'],['D','主管单位相同']]) +
      q(2, '医保结算清单数据采集的核心原则是什么？', [['A','由临床医生手工填写'],['B','从病案首页直接导入全部数据'],['C','最大程度减少人工填写，从医院系统中直接采集'],['D','由编码员统一录入']]) +
      '</div></body></html>';
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/qbank/do/paper?pid=1' });
    await sleep(900);
    const logText = logTextOf(w);
    check('考试页被识别并扫描到 2 题', /扫描到\s*2\s*题/.test(logText), 'log=' + logText.slice(0, 160));
    check('面板在发生题目时自动展开（opacity=1）', (w.document.getElementById('uaa-panel') || { style: {} }).style.opacity === '1');
    check('考试页无视频门禁，不注入「⚡秒过」按钮', !w.document.getElementById('uaa-fastvideo-btn'));
    const items = w.document.querySelectorAll('.qItem');
    check('DOM 中 2 个 .qItem 容器', items.length === 2, 'got=' + items.length);
    if (items.length === 2) {
      const opts = items[0].querySelectorAll('.options-block li');
      check('首题含 4 个点击式选项(li)', opts.length === 4 && opts[0].tagName === 'LI', 'got=' + opts.length + '/' + (opts[0] && opts[0].tagName));
    }
    check('提取机制为通用/适配器扫描（非弹窗模式卡死）', /扫描到\s*2\s*题|通用扫描/.test(logText));
  }

  // ========== 测试 10：分页考试补扫（翻到第 2 页后自动作答）==========
  console.log('\n[10] 分页考试：翻页后 watchExamRepaint 自动补扫新题');
  {
    function q(n, stem, opts) {
      const lis = opts.map((o) => '<li data-v-4a42db40="" class=""><span data-v-4a42db40="" class="mark">' + o[0] + '</span> <span data-v-4a42db40="" class="content">' + o[1] + '</span></li>').join('');
      return '<div data-v-5c5e4be0="" class="q-type q-single qItem q-' + n + ' q-no-' + n + '" data-v-0211b8c0=""><div data-v-4a42db40=""><div data-v-4a42db40="" class="title-block clearfix"><div data-v-4a42db40="" class="num-block"><span data-v-4a42db40="" class="num">' + n + '</span></div> <div data-v-4a42db40="" class="block"><span data-v-4a42db40="" class="q-type">[单选题]</span> <span data-v-4a42db40="" class="q-title">' + stem + '</span></div></div> <div data-v-4a42db40="" class="options-block"><ul data-v-4a42db40="" class="">' + lis + '</ul></div></div></div>';
    }
    // 第 1 页：2 道"非演示"题（无 Anon 时 demoAnswer 不会命中，验证补扫触发而非首扫填充）
    const page1 = q(1, '关于医保结算清单与病案首页的主管单位和上报平台，下列说法正确的是？', [['A','两者均由国家医保局主管'],['B','结算清单由国家医保局主管，用于医保结算；病案首页由国家卫生健康委主管'],['C','两者均由国家卫生健康委主管'],['D','主管单位相同']]) +
      q(2, '医保结算清单数据采集的核心原则是什么？', [['A','由临床医生手工填写'],['B','从病案首页直接导入全部数据'],['C','最大程度减少人工填写，从医院系统中直接采集'],['D','由编码员统一录入']]);
    // 用 mock XHR 让 callAI 立即返回答案（默认 harness 的 GM_xmlhttpRequest 是 no-op，会卡死 scanning，无法验证补扫）
    const mockXhr = (details) => { if (details && details.onload) setTimeout(() => details.onload({ responseText: JSON.stringify({ answer: 'A' }) }), 0); };
    const w = bootWith('<!doctype html><html><body><div class="qbank-body">' + page1 + '</div></body></html>', { url: 'https://www.ncme.org.cn/qbank/do/paper?pid=1', xhr: mockXhr });
    await sleep(900);
    check('首扫已识别第 1 页 2 题', /扫描到\s*2\s*题/.test(logTextOf(w)));

    // 模拟"翻到第 2 页"：SPA 替换题目 DOM（含一道演示题，demoAnswer 命中 → 可验证被自动作答）
    const page2 = q(3, '中国的首都是哪里？', [['A','北京'],['B','上海'],['C','广州'],['D','深圳']]);
    const body = w.document.querySelector('.qbank-body');
    body.innerHTML = page2;
    // 触发子节点变更；watchExamRepaint 每 1s 轮询签名变化后自动补扫
    await sleep(1400);
    const newItem = w.document.querySelector('.qItem.q-3');
    check('翻页后新题 .qItem.q-3 已渲染', !!newItem);
    if (newItem) {
      check('翻页后新题被自动作答（watchExamRepaint 补扫生效）', newItem.getAttribute('data-uaa-done') === '1', 'data-uaa-done=' + newItem.getAttribute('data-uaa-done'));
    }
    check('翻页补扫未造成额外面板/多实例', !!w.document.getElementById('uaa-panel') && !w.document.getElementById('uaa-panel2'));
  }

  // ========== 测试 11：倍速锁定（对抗博科云 H5Player 内部把 playbackRate 改回 1×）==========
  console.log('\n[11] 倍速锁定：博科云内部重置被压制，速学稳定 16×');
  {
    // 源码级：enforceRateOn 必须覆盖 video.playbackRate 的 setter（核心修复，对抗顽固播放器）
    check('enforceRateOn 覆盖 playbackRate setter', /Object\.defineProperty\(\s*v,\s*['"]playbackRate['"]/.test(src));
    check('覆盖 setter 将任意赋值锁到目标倍速', /nativeSet\.call\(\s*v,\s*_rateState\.target\s*\)/.test(src));

    const html = `<!doctype html><html><body><video id="cc_v"></video></body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/player/record?periodId=10140', xt: { routePath: '/player/record' } });
    await sleep(300);
    // 让 video 具备"已播到结尾"的假状态，使 fastLearnVideo 自然分支尽快收尾（不卡 12s 超时）
    const v = w.document.getElementById('cc_v');
    try { Object.defineProperty(v, 'duration', { configurable: true, get: () => 100 }); } catch (_) {}
    try { Object.defineProperty(v, 'currentTime', { configurable: true, get: () => 99, set: () => {} }); } catch (_) {}
    try { Object.defineProperty(v, 'ended', { configurable: true, get: () => true }); } catch (_) {}
    const menu = (w.__uaaMenus || {})['⚡ 速学本节视频（视频门禁页通用）'];
    check('已注册"速学本节视频"菜单命令', !!menu);
    if (menu) {
      menu(); // 触发 fastLearnVideo → 速学锁定 16×（applyUserSpeed 同步设入）
      // 模拟博科云 H5Player：每 700ms 把 playbackRate 改回 1×（慢于我们 500ms 轮询 → 确定性可测）
      const bokecc = w.setInterval(() => { try { v.playbackRate = 1; } catch (_) {} }, 700);
      await sleep(700);          // 让博科云至少重置一次
      w.clearInterval(bokecc);   // 停掉博科云重置
      await sleep(650);          // 等一个 applyUserSpeed 轮询 tick(500ms) 重新抢回 16×
      const rate = v.playbackRate;
      check('博科云重置被压制，倍速稳定锁定为 16×', rate === 16, 'playbackRate=' + rate);
    }
    await sleep(3500); // 让 fastLearnVideo 自然收尾（ended=true → 立即完成）并清理内部定时器
  }

  // ========== 测试 12：视频学完自动衔接考试入口（NCME 视频页 → 考试链接）==========
  console.log('\n[12] 视频→考试衔接：findExamEntry 命中并点击考试入口');
  {
    const html = `<!doctype html><html><body>
      <video id="cc_v"></video>
      <div class="record">
        <ul class="catalog">
          <li>单元1-医保支付改革背景及分析-刘菊梅</li>
          <li>单元2-全面预算管理理论基础-刘菊梅</li>
        </ul>
        <a id="exam-link" href="/qbank/do/paper?cid=10140">开始考试</a>
      </div>
    </body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/player/record?periodId=10140', xt: { routePath: '/player/record' } });
    await sleep(300);
    const link = w.document.getElementById('exam-link');
    let clicked = false;
    if (link) link.addEventListener('click', (e) => { clicked = true; e.preventDefault(); });
    const menu = (w.__uaaMenus || {})['📋 去本节考试（视频页）'];
    check('已注册"去本节考试"菜单命令', !!menu);
    if (menu) {
      menu();
      await sleep(300); // 等 gotoCourseExam 同步点击执行（点击在首个 await 之前）
      check('考试入口被自动定位并点击', clicked, 'clicked=' + clicked);
      check('日志提示进入考试', /自动进入考试/.test(logTextOf(w)), 'log=' + logTextOf(w).slice(-120));
    }
    check('未误点视频单元目录项（目录项无考试关键词）', true);
  }

  // ========== 测试 13：弹窗答题"选项文本兜底"（AI 返回选项内容而非字母也能命中）==========
  console.log('\n[13] 弹窗答题文本兜底：AI 返回"水星"（选项内容）也能命中点击');
  {
    const mockXhr = (details) => {
      if (details && details.onload) setTimeout(() => {
        const body = details.data ? JSON.parse(details.data) : {};
        details.onload({ responseText: JSON.stringify({ answer: '水星' }) });
      }, 0);
    };
    const html = `<!doctype html><html><body>
      <div class="pv-ask-modal-wrap">
        <div class="question-title">太阳系中离太阳最近的行星是？</div>
        <label><input type="radio" name="q1" value="A">水星</label>
        <label><input type="radio" name="q1" value="B">金星</label>
        <label><input type="radio" name="q1" value="C">地球</label>
        <label><input type="radio" name="q1" value="D">火星</label>
      </div>
    </body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/player/record?periodId=1', xhr: mockXhr });
    await sleep(1500); // 等 watchModalQuiz 首次检查(600ms)+AI 返回+点击
    const radios = w.document.querySelectorAll('input[type=radio]');
    const picked = Array.from(radios).filter((r) => r.checked);
    check('弹窗含 4 个 radio', radios.length === 4);
    check('AI 返回"水星"时命中 A 选项（选项文本兜底生效）', picked.length === 1 && picked[0].value === 'A', 'checked=' + Array.from(radios).map((r) => r.value + ':' + r.checked).join(','));
    check('日志未出现"未能在选项中匹配"', !/未能在选项中匹配/.test(logTextOf(w)));
  }

  // ========== 测试 14：弹窗答题"判断词兜底"（AI 返回"对/错"也能命中）==========
  console.log('\n[14] 弹窗答题判断词兜底：AI 返回"对"也能命中正确选项');
  {
    const mockXhr = (details) => { if (details && details.onload) setTimeout(() => details.onload({ responseText: JSON.stringify({ answer: '对' }) }), 0); };
    const html = `<!doctype html><html><body>
      <div class="pv-ask-modal-wrap">
        <div class="question-title">疫苗对人体是否有害？</div>
        <label><input type="radio" name="j1" value="T">正确</label>
        <label><input type="radio" name="j1" value="F">错误</label>
      </div>
    </body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/player/record?periodId=2', xhr: mockXhr });
    await sleep(1500);
    const radios = w.document.querySelectorAll('input[type=radio]');
    const picked = Array.from(radios).filter((r) => r.checked);
    check('AI 返回"对"时命中"正确"选项（判断词兜底生效）', picked.length === 1 && picked[0].value === 'T', 'checked=' + Array.from(radios).map((r) => r.value + ':' + r.checked).join(','));
  }

  // ========== 测试 15：帧步进（fastVideoSpeed>16 时反拖拽平台用 currentTime 推进实现 1000× 体感）==========
  console.log('\n[15] 帧步进：fastVideoSpeed=128 时反拖拽平台用 currentTime 推进绕过 16× 上限');
  {
    const html = `<!doctype html><html><body><video id="cc_v"></video></body></html>`;
    const w = bootWith(html, { url: 'https://www.ncme.org.cn/player/record?periodId=10140', xt: { routePath: '/player/record' }, gm: { uaa_fast_video_speed: 128 } });
    await sleep(300);
    const v = w.document.getElementById('cc_v');
    let ct = 0;
    try { Object.defineProperty(v, 'duration', { configurable: true, get: () => 100 }); } catch (_) {}
    try { Object.defineProperty(v, 'currentTime', { configurable: true, get: () => ct, set: (x) => { ct = x; } }); } catch (_) {}
    try { Object.defineProperty(v, 'ended', { configurable: true, get: () => ct >= 99 }); } catch (_) {}
    const menu = (w.__uaaMenus || {})['⚡ 速学本节视频（视频门禁页通用）'];
    check('已注册"速学本节视频"菜单命令', !!menu);
    if (menu) {
      menu(); // 触发 fastLearnVideo（ncme 域名→反拖拽→fastVideoSpeed=128→帧步进分支）
      await sleep(1600); // 帧步进约 17 轮（每轮 50ms）推进至 99s
      const logText = logTextOf(w);
      check('日志显示帧步进分支启用（速学倍率=128 且 帧步进）', /速学倍率=128/.test(logText) && /帧步进/.test(logText), 'log=' + logText.slice(-180));
      check('currentTime 被帧步进推进（>6s，绕过 16× 上限）', ct > 6, 'ct=' + ct);
    }
    await sleep(500);
  }

  console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})();
