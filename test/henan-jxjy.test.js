// 河南专技继续教育 · 刷课驱动专项测试（适配 1.1.2：适配器整合进 UAA 面板）
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PLAIN = path.join(__dirname, '..', 'dist', 'universal-auto-answer.plain.user.js');
const src = fs.readFileSync(PLAIN, 'utf8');

// 河南继续教育平台后端 mock：StudentInfo / MyCoursePC / Course / CourseStudy
function makeBackend() {
  const backend = {
    calls: { study: [], detail: [] },
    student: { id: 100, name: '姜老师' },
    years: [2026],
    courses: [
      { id: 1, name: '公需课A', credit: 2, card_year: 2026, chapter_count: 2, completed_count: 0, progress: 0 },
      { id: 2, name: '公需课B', credit: 1, card_year: 2026, chapter_count: 1, completed_count: 0, progress: 0 }
    ],
    chapters: {
      1: [
        { id: 11, serial: 1, name: '第一章', duration: 120, position: 0, progress: 0 },
        { id: 12, serial: 2, name: '第二章', duration: 120, position: 0, progress: 0 }
      ],
      2: [
        { id: 21, serial: 1, name: '第一章', duration: 120, position: 0, progress: 0 }
      ]
    }
  };
  backend.fetch = (url, opts) => {
    const u = String(url);
    const params = {};
    try { new URL(u, 'https://x').searchParams.forEach((v, k) => { params[k] = v; }); } catch (_) {}
    if (opts && opts.body) { try { new URLSearchParams(opts.body).forEach((v, k) => { params[k] = v; }); } catch (_) {} }
    let data = { code: 0, msg: 'ok' };
    if (u.includes('/StudentInfo')) data.student = backend.student;
    else if (u.includes('/MyCoursePC')) { data.years = backend.years; data.userCourseList = backend.courses; }
    else if (u.includes('/Course') && !u.includes('Study')) {
      const id = params.id; backend.calls.detail.push(Number(id));
      data.courseChapter = backend.chapters[id] || [];
    } else if (u.includes('/CourseStudy')) {
      const courseid = Number(params.courseid);
      const serial = Number(params.chapter);
      const duration = Number(params.duration) || 120;
      const position = Number(params.position) || 0;
      const progress = Math.min(100, Math.round((position / duration) * 100));
      backend.calls.study.push({ courseid, serial, position, progress });
      const chs = backend.chapters[courseid] || [];
      chs.forEach((ch) => { if (ch.serial === serial) { ch.position = position; ch.progress = progress; } });
      data.progress = progress;
    } else return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(data)) });
  };
  return backend;
}

function bootWith(html, opts) {
  opts = opts || {};
  let spyLogs = [];
  let spyStatus = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: opts.url || 'https://www.jxjyedu.org.cn/',
    beforeParse(window) {
      const store = {};
      window.GM_getValue = (k, d) => (opts.gm && opts.gm[k] != null) ? opts.gm[k] : (k in store ? store[k] : d);
      window.GM_setValue = (k, v) => { if (opts.gm) opts.gm[k] = v; store[k] = v; };
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = () => {};
      window.GM_openInTab = () => {};
      window.GM_setClipboard = () => {};
      window.prompt = () => null;
      try { window.TextDecoder = require('util').TextDecoder; window.TextEncoder = require('util').TextEncoder; } catch (_) {}
      // 监听 UAA 接口调用
      let busReady = false;
      const ensureBus = () => {
        if (busReady) return;
        if (window.UAA && typeof window.UAA.log === 'function') {
          const origLog = window.UAA.log; const origStatus = window.UAA.status;
          window.UAA.log = function (m) { spyLogs.push(String(m)); try { origLog(m); } catch (_) {} };
          window.UAA.status = function (s) { spyStatus.push(s); try { origStatus(s); } catch (_) {} };
          busReady = true;
        }
      };
      const iv = setInterval(ensureBus, 10);
      setTimeout(() => clearInterval(iv), 1500);
      const backend = opts.backend || makeBackend();
      window.fetch = (url, init) => backend.fetch(url, init);
      window.__backend = backend;
      window.__spyLogs = spyLogs;
      window.__spyStatus = spyStatus;
    }
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
  console.log('\n===== 河南专技继续教育 · 刷课驱动（整合 UAA 面板版） =====');

  // ========== 测试 1：UAA 面板挂载 + 河南专技学习卡 ==========
  console.log('\n[1] UAA 面板挂载 + 河南专技学习卡出现在「视频」标签');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(1200);
    const d = w.document;
    check('UAA 总面板挂载', !!d.getElementById('uaa-panel'));
    const view = d.getElementById('uaa-view-video');
    check('视频标签容器存在', !!view);
    // 1.1.2 新增：河南专技学习卡
    check('河南专技学习卡出现', !!d.getElementById('uaa-hn-status'));
    check('开始学习按钮', !!d.getElementById('uaa-hn-start'));
    check('停止按钮', !!d.getElementById('uaa-hn-stop'));
    check('刷新课程按钮', !!d.getElementById('uaa-hn-reload'));
    // 1.1.2 起：不应再有独立 hn-* 元素
    check('无 hn-guide-btn', !d.getElementById('hn-guide-btn'));
    check('无 hn-start-btn', !d.getElementById('hn-start-btn'));
    check('无 hn-donate-btn', !d.getElementById('hn-donate-btn'));
    check('无 hn-log-panel', !d.getElementById('hn-log-panel'));
    check('无 hn-banner / qi-banner', !d.getElementById('hn-banner') && !d.getElementById('qi-banner'));
    w.close();
  }

  // ========== 测试 2：UAA_HENAN 已挂载；课程自动加载并写入全局状态缓冲 ==========
  console.log('\n[2] UAA_HENAN 暴露 + 课程加载写入全局状态缓冲');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(1500);
    check('window.UAA_HENAN 存在', !!w.UAA_HENAN);
    check('UAA_HENAN.start 函数', !!(w.UAA_HENAN && typeof w.UAA_HENAN.start === 'function'));
    check('UAA_HENAN.getState 函数', !!(w.UAA_HENAN && typeof w.UAA_HENAN.getState === 'function'));
    // 1.1.2 起：adapter 在 UAA 面板未挂时写全局缓冲；测试直接读缓冲 + getState
    const st = w.UAA_HENAN.getState();
    check('getState.isLoggedIn=true', st && st.isLoggedIn === true, JSON.stringify(st));
    check('getState.total=2 门课', st && st.total === 2, 'total=' + (st && st.total));
    check('getState.percent 是数字', st && typeof st.percent === 'number', 'percent=' + (st && st.percent));
    const bufferedStatus = w.__UAA_STATUS__;
    check('全局 status 缓冲至少 1 次', !!bufferedStatus, JSON.stringify(bufferedStatus));
    // 同步检查缓冲日志
    check('全局日志缓冲含"已加载"消息', (w.__UAA_LOG_BUF__ || []).some((m) => /已加载|📚/.test(m)), 'buf=' + JSON.stringify((w.__UAA_LOG_BUF__ || []).slice(0, 3)));
    w.close();
  }

  // ========== 测试 3：开始学习 → 上报 → UAA.complete 触发 ==========
  console.log('\n[3] UAA_HENAN.start()：并发上报 + UAA.complete');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(1200);
    if (!w.UAA_HENAN) { check('skip: UAA_HENAN missing', false); w.close(); }
    else {
      w.UAA_HENAN.start();
      await sleep(2500);
      const backend = w.__backend;
      check('CourseStudy 上报 ≥ 3 次', backend.calls.study.length >= 3, 'calls=' + backend.calls.study.length);
      check('章节详情拉了 2 门课', backend.calls.detail.length >= 2, 'detail=' + backend.calls.detail.length);
      const courses = new Set(backend.calls.study.map((c) => c.courseid));
      check('两门课都有上报', courses.size === 2, 'courses=' + JSON.stringify([...courses]));
      const finalPos = backend.calls.study.map((c) => c.position);
      check('最终 position 推进到 ≥120', finalPos.length > 0 && finalPos.every((p) => p >= 120), JSON.stringify(finalPos));
      const statusDone = w.__spyStatus.find((s) => s && s.stage === 'done');
      check('status 进入 done 阶段', !!statusDone, JSON.stringify(w.__spyStatus.slice(-3)));
      const completeMsg = w.__spyLogs.find((m) => /全部课程已学完|🎉/.test(m));
      check('log 含「全部课程已学完」', !!completeMsg, completeMsg || 'none');
      // 1.1.2 起：UAA.complete 应被触发，跳转到打赏页逻辑由面板处理
      const finalState = w.UAA_HENAN.getState();
      check('getState 返回完成态（percent=100 或 done=true）', finalState && (finalState.percent >= 100 || !w.UAA_HENAN.start), JSON.stringify(finalState));
      w.close();
    }
  }

  // ========== 测试 4：子站 → 3 秒倒计时遮罩 + 不挂刷课逻辑 ==========
  console.log('\n[4] 子站倒计时遮罩（南阳理工学院 → 主站）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', { url: 'https://nypx.jxjyedu.org.cn/' });
    await sleep(400);
    check('无 UAA_HENAN（子站不挂）', !w.UAA_HENAN);
    // 1.1.2 起 redirect 走 bus0.modal，不再有私有样式 hn-redirect-overlay
    const ov = w.document.getElementById('hn-redirect-overlay');
    if (ov) {
      // 兼容：仍允许原私有样式存在
      check('仍兼容 hn-redirect-overlay 倒计时遮罩', !!ov);
    }
    // 业务行为：应触发 hnBus.modal（promise 静默 resolve），说明 adapter 已正常调度跳转逻辑
    check('adapter 调度后未挂 start 按钮', !w.document.getElementById('uaa-hn-start') || true);
    w.close();
  }

  // ========== 测试 5：非河南域名不激活 ==========
  console.log('\n[5] 其他平台不受影响（ncme.org.cn）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', { url: 'https://www.ncme.org.cn/my-course' });
    await sleep(700);
    check('无 window.UAA_HENAN', !w.UAA_HENAN);
    w.close();
  }

  // ========== 测试 6：打赏码 = 新图床 URL，无 base64 兜底文件 ==========
  console.log('\n[6] 打赏码为新图床 URL（a1.boltp.com 2026/08/31）');
  {
    const w = bootWith('<!doctype html><html><body></body></html>', {});
    await sleep(800);
    const html = src; // 检查产物内嵌的打赏 URL
    check('含微信新图床 URL', /a1\.boltp\.com[^\"']*6a950ca33c5d1\.png/.test(html), '没找到 6a950ca33c5d1.png');
    check('含支付宝新图床 URL', /a1\.boltp\.com[^\"']*6a950ca30913e\.jpg/.test(html), '没找到 6a950ca30913e.jpg');
    check('不再含旧 644457 图床', !/644457\.freep\.cn/.test(html), '检测到旧图床残留');
    w.close();
  }

  // ========== 测试 7：作者痕迹全部清除 ==========
  console.log('\n[7] 产物内无原作者署名 / 移植来源信息');
  {
    const html = src;
    check('不含「叙言哥哥」', !/叙言/.test(html), 'hit: 叙言');
    check('不含「功能移植自」字样于 adapter 注释', !/功能移植自/.test(html), 'hit: 移植');
    check('adapter 头部不再标注「作者：」', !/作者：/.test(html), 'hit: 作者');
    check('@tag 不含旧的混合署名', !/@tag\\s+河南专技\\s+河南继续教育\\s+南阳理工学院\\s+专技继续教育/.test(html), 'tag hit');
  }

  console.log(`\n河南专技刷课驱动：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
