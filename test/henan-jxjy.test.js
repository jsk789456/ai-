// 河南专技继续教育 · 刷课驱动专项测试：真实跑一遍「加载课程 → 开始学习 → 上报进度 → 完成弹窗」
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PLAIN = path.join(__dirname, '..', 'dist', 'universal-auto-answer.plain.user.js');
const src = fs.readFileSync(PLAIN, 'utf8');

// 模拟河南专技平台后端：学生 / 年份课程 / 章节详情 / 学习上报
function makeBackend() {
  const backend = {
    calls: { study: [], detail: [] },
    student: { id: 100, name: '姜老师' },
    years: [2026, 2025],
    courses: [
      { id: 1, name: '公需课A', credit: 2, card_year: 2026, chapter_count: 2, completed_count: 0, progress: 0 },
      { id: 2, name: '公需课B', credit: 1, card_year: 2026, chapter_count: 1, completed_count: 0, progress: 0 },
    ],
    chapters: {
      1: [
        { id: 11, serial: 1, name: '第一章', duration: 120, position: 0, progress: 0 },
        { id: 12, serial: 2, name: '第二章', duration: 120, position: 0, progress: 0 },
      ],
      2: [
        { id: 21, serial: 1, name: '第一章', duration: 120, position: 0, progress: 0 },
      ],
    },
  };
  backend.fetch = (url, opts = {}) => {
    const u = String(url);
    const params = {};
    try {
      new URL(u, 'https://x').searchParams.forEach((v, k) => { params[k] = v; });
    } catch (_) {}
    if (opts.body) {
      try { new URLSearchParams(opts.body).forEach((v, k) => { params[k] = v; }); } catch (_) {}
    }
    let data = { code: 0, msg: 'ok' };
    if (u.includes('/StudentInfo')) {
      data.student = backend.student;
    } else if (u.includes('/MyCoursePC')) {
      data.years = backend.years;
      data.userCourseList = backend.courses;
    } else if (u.includes('/Course') && !u.includes('Study')) {
      const id = params.id;
      backend.calls.detail.push(Number(id));
      data.courseChapter = backend.chapters[id] || [];
    } else if (u.includes('/CourseStudy')) {
      const courseid = Number(params.courseid);
      const serial = Number(params.chapter);
      const duration = Number(params.duration) || 120;
      const position = Number(params.position) || 0;
      const progress = Math.min(100, Math.round((position / duration) * 100));
      backend.calls.study.push({ courseid, serial, position, progress });
      // 同步推进章节进度，保证第二次拉详情时能看到完成
      const chs = backend.chapters[courseid] || [];
      chs.forEach((ch) => { if (ch.serial === serial) { ch.position = position; ch.progress = progress; } });
      data.progress = progress;
    } else {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(data)) });
  };
  return backend;
}

function bootWith(html, opts = {}) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'https://www.jxjyedu.org.cn/',
    beforeParse(window) {
      const store = {};
      window.GM_getValue = (k, d) => (opts.gm && opts.gm[k] != null) ? opts.gm[k] : (k in store ? store[k] : d);
      window.GM_setValue = (k, v) => { if (opts.gm) opts.gm[k] = v; store[k] = v; };
      window.GM_registerMenuCommand = (name, cb) => { try { (window.__uaaMenus = window.__uaaMenus || {})[name] = cb; } catch (_) {} };
      window.GM_xmlhttpRequest = () => {};
      window.GM_openInTab = () => {};
      window.GM_setClipboard = () => {};
      window.prompt = () => null;
      const backend = opts.backend || makeBackend();
      window.fetch = (url, init) => backend.fetch(url, init);
      window.__backend = backend;
    },
  });
  const w = dom.window;
  const s = w.document.createElement('script');
  s.textContent = src;
  w.document.body.appendChild(s);
  return w;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
}

(async () => {
  console.log('\n===== 河南专技继续教育 · 刷课驱动 =====');

  // ========== 测试 1：主站挂载 ==========
  console.log('\n[1] 主站控制台挂载（www.jxjyedu.org.cn）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(700);
    const d = w.document;
    check('使用指南按钮', !!d.getElementById('hn-guide-btn'));
    check('开始学习按钮', !!d.getElementById('hn-start-btn'));
    check('打赏按钮', !!d.getElementById('hn-donate-btn'));
    check('日志面板', !!d.getElementById('hn-log-panel'));
    check('未出现授权横幅（已去除商业化机制）', !d.getElementById('hn-banner') && !d.getElementById('qi-banner'));
    check('未出现跳转遮罩（主站不跳转）', !d.getElementById('hn-redirect-overlay'));
    w.close();
  }

  // ========== 测试 2：课程加载 ==========
  console.log('\n[2] 课程自动加载（StudentInfo + MyCoursePC）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(1200);
    const panel = w.document.getElementById('hn-log-panel');
    const text = panel ? panel.textContent : '';
    check('显示已登录', /✅ 已登录/.test(text), 'got=' + text.slice(0, 100));
    check('显示总进度状态', /总进度/.test(text), text.slice(0, 120));
    check('2 门课合计进度显示', /（0\/2 门完成）/.test(text), text.slice(0, 120));
    const startBtn = w.document.getElementById('hn-start-btn');
    check('登录后开始按钮可点（pointer-events:auto）', startBtn && startBtn.style.pointerEvents === 'auto', 'pe=' + (startBtn && startBtn.style.pointerEvents));
    w.close();
  }

  // ========== 测试 3：开始学习 → 上报 → 完成弹窗 ==========
  console.log('\n[3] 开始学习（并发上报 CourseStudy → 完成弹窗）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(900);
    const startBtn = w.document.getElementById('hn-start-btn');
    check('开始按钮存在', !!startBtn);
    if (startBtn) startBtn.click();
    await sleep(2800);
    const backend = w.__backend;
    check('CourseStudy 上报已触发', backend.calls.study.length >= 3, 'calls=' + backend.calls.study.length);
    check('章节详情被拉取（2 门课）', backend.calls.detail.length >= 2, 'detail=' + backend.calls.detail.length);
    const studyCourses = new Set(backend.calls.study.map((c) => c.courseid));
    check('两门课都有上报', studyCourses.size === 2, 'courses=' + JSON.stringify([...studyCourses]));
    const finalPos = backend.calls.study.map((c) => c.position);
    check('最终 position 到达 duration（120）', finalPos.every((p) => p >= 120), JSON.stringify(finalPos));
    const overlay = w.document.getElementById('hn-modal-overlay');
    const modalText = overlay ? overlay.textContent : '';
    check('完成弹窗出现', !!overlay, 'overlay=' + !!overlay);
    check('弹窗含「学习完成」', /学习完成/.test(modalText), modalText.slice(0, 80));
    check('弹窗含「感谢作者」按钮', /感谢作者/.test(modalText), modalText.slice(0, 80));
    const panel = w.document.getElementById('hn-log-panel');
    const text = panel ? panel.textContent : '';
    check('日志显示全部课程已学完', /全部课程已学完|完成/.test(text), text.slice(-120));
    w.close();
  }

  // ========== 测试 4：子站自动跳转遮罩 ==========
  console.log('\n[4] 子站自动跳转（nypx.jxjyedu.org.cn → 主站）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', { url: 'https://nypx.jxjyedu.org.cn/' });
    await sleep(400);
    const ov = w.document.getElementById('hn-redirect-overlay');
    check('跳转遮罩出现', !!ov);
    if (ov) {
      const text = ov.textContent;
      check('站点名正确（南阳理工学院）', /南阳理工学院/.test(text), text.slice(0, 60));
      check('含目标主站提示', /河南省继续教育学会/.test(text));
      const num = w.document.getElementById('hn-redirect-num');
      check('倒计时从 3 开始', num && num.textContent === '3', num && num.textContent);
    }
    await sleep(1200);
    const num2 = w.document.getElementById('hn-redirect-num');
    check('倒计时递减', num2 && num2.textContent !== '3', num2 && num2.textContent);
    check('子站不挂刷课控制台', !w.document.getElementById('hn-start-btn'));
    w.close();
  }

  // ========== 测试 5：非河南域名不激活 ==========
  console.log('\n[5] 其他平台不受影响（ncme.org.cn）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', { url: 'https://www.ncme.org.cn/my-course' });
    await sleep(600);
    check('无河南专技按钮', !w.document.getElementById('hn-guide-btn'));
    check('无跳转遮罩', !w.document.getElementById('hn-redirect-overlay'));
    w.close();
  }

  // ========== 测试 6：打赏按钮换成本项目收款码 ==========
  console.log('\n[6] 打赏弹窗使用本项目收款码');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(700);
    const btn = w.document.getElementById('hn-donate-btn');
    btn.click();
    await sleep(150);
    const ov = w.document.getElementById('hn-modal-overlay');
    const html = ov ? ov.innerHTML : '';
    check('打赏弹窗出现', !!ov);
    check('含微信收款码图片（本项目 URL）', /photogzmaz\.photo\.store\.qq\.com/.test(html), html.slice(0, 150));
    w.close();
  }

  console.log(`\n河南专技刷课驱动：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
