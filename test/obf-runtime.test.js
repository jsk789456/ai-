/*
 * obf-runtime.test.js — 混淆产物运行时门禁
 *
 * 为什么要这个套件：
 *   发布给用户的是「混淆版」dist/universal-auto-answer.user.js。混淆器开启
 *   stringArray + base64 编码后，所有字符串都被抽进编码数组，**静态 grep 搜不到原文**，
 *   因此「打赏码换图床」「去原作者署名」这类改动，光靠 grep 无法证明混淆产物是对的。
 *   本套件把混淆版真正丢进 jsdom 跑一遍，从运行时 DOM/CFG 读值，作为发布前的最后一道闸。
 *
 * 覆盖：
 *   1. 混淆版可执行、面板可挂载
 *   2. 运行时打赏码 = 新图床 a1.boltp.com（微信 png / 支付宝 jpg）
 *   3. window.UAA 回调总线可用
 *   4. 河南专技站点下 window.UAA_HENAN 可用（证明 adapter 进了混淆包且未被优化掉）
 *   5. metadata @version 与 package.json 一致
 *   6. CSP：产物内不含 Function( / eval(
 *   7. 去原作者署名：运行时不得出现第三方脚本私有 UI
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const OBF = path.join(ROOT, 'dist', 'universal-auto-answer.user.js');
const src = fs.readFileSync(OBF, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  | ' + extra : '')); }
}
const $ = (w, sel) => w.document.querySelector(sel);
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** 在 jsdom 中执行混淆版。url 决定启用哪个平台适配器。 */
function bootObf(url) {
  const store = {};
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: url,
    beforeParse(window) {
      window.GM_getValue = (k, d) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : d);
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = (o) => { setTimeout(() => { try { o.onload({ responseText: '{}' }); } catch (e) {} }, 0); };
      window.GM_openInTab = () => {};
      window.GM_setClipboard = () => {};
      window.confirm = () => true;
      // 河南专技驱动走 window.fetch（不是 GM_xmlhttpRequest），jsdom 无 fetch 会让适配器初始化中断，
      // 从而误判「适配器没进混淆包」。这里给一个最小可用后端。
      window.fetch = () => Promise.resolve({
        ok: true, status: 200,
        text: () => Promise.resolve(JSON.stringify({
          code: 0, msg: 'ok',
          student: { name: 'obf-runtime' },
          years: [], userCourseList: [], courseChapter: [], progress: 0,
        })),
      });
    },
  });
  const w = dom.window;
  const s = w.document.createElement('script');
  s.textContent = src;
  w.document.body.appendChild(s);
  return { w, store };
}

(async () => {
  console.log('混淆产物运行时门禁：' + path.basename(OBF) + '（' + Buffer.byteLength(src) + ' 字节）');

  // ---------- 1. 可执行性 ----------
  const a = bootObf('https://www.ncme.org.cn/qbank/do/paper?paperId=1');
  await sleep(400);
  check('混淆版可在 jsdom 中正常执行并挂载面板 #uaa-panel', !!$(a.w, '#uaa-panel'));
  check('window.UAA 回调总线已暴露', a.w.UAA && typeof a.w.UAA.log === 'function' && typeof a.w.UAA.status === 'function');

  // ---------- 2. 打赏码（运行时读取，绕开 base64 stringArray） ----------
  const donateTab = $(a.w, '[data-tab="donate"]');
  check('打赏标签存在', !!donateTab);
  if (donateTab) { try { donateTab.click(); } catch (_) {} }
  await sleep(200);

  const wxSrc = ($(a.w, '#uaa-qrimg') || {}).src || '';
  check('运行时微信收款码 = 新图床 a1.boltp.com png', /a1\.boltp\.com\/2026\/08\/31\/6a950ca33c5d1\.png/.test(wxSrc), wxSrc);
  check('微信收款码不再是旧图床 644457.freep.cn', !/644457\.freep\.cn/.test(wxSrc), wxSrc);

  const aliChip = Array.from(a.w.document.querySelectorAll('#uaa-view-donate [data-donatepay]'))
    .find((e) => e.getAttribute('data-donatepay') === 'ali');
  if (aliChip) {
    aliChip.click();
    await sleep(120);
    const aliSrc = ($(a.w, '#uaa-qrimg') || {}).src || '';
    check('运行时支付宝收款码 = 新图床 a1.boltp.com jpg', /a1\.boltp\.com\/2026\/08\/31\/6a950ca30913e\.jpg/.test(aliSrc), aliSrc);
  } else {
    check('运行时支付宝收款码 = 新图床 a1.boltp.com jpg', false, '未找到支付宝切换 chip');
  }

  // ---------- 3. 河南专技适配器（混淆后仍在包内可用） ----------
  // 注意：河南驱动在 document-end 后还要拉 StudentInfo / MyCoursePC 两轮接口才完成初始化，
  //       混淆版执行更慢，等待需比明文版测试更长，否则会误判为「适配器丢失」。
  const b = bootObf('https://www.jxjyedu.org.cn/');
  await sleep(1800);
  check('河南主站下 window.UAA_HENAN 已暴露', !!b.w.UAA_HENAN);
  check('UAA_HENAN.getState() 返回结构正确', (() => {
    try {
      const st = b.w.UAA_HENAN.getState();
      return st && typeof st.total === 'number' && typeof st.percent === 'number' && typeof st.running === 'boolean';
    } catch (e) { return false; }
  })());
  check('河南主站已挂载面板（进度走统一面板）', !!$(b.w, '#uaa-panel'));
  check('面板内存在河南专技学习卡 #uaa-hn-status', !!$(b.w, '#uaa-hn-status'));
  check('面板内存在开始/停止/重载三个按钮', !!$(b.w, '#uaa-hn-start') && !!$(b.w, '#uaa-hn-stop') && !!$(b.w, '#uaa-hn-reload'));
  check('第三方脚本私有 UI 已彻底移除（hn-* 系列）', (() => {
    const ids = ['hn-guide-btn', 'hn-start-btn', 'hn-donate-btn', 'hn-log-panel', 'hn-modal-overlay', 'hn-redirect-overlay', 'hn-banner'];
    return ids.every((id) => !b.w.document.getElementById(id));
  })());

  // ---------- 4. 版本一致性 ----------
  const mv = (src.match(/\/\/\s*@version\s+([\d.]+)/) || [])[1] || '';
  check('产物 @version 与 package.json 一致', mv === pkg.version, '产物=' + mv + ' pkg=' + pkg.version);
  check('产物 @author 为 WorkBuddy', /@author\s+WorkBuddy/.test(src));
  check('产物无旧图床域名残留', !/644457\.freep\.cn/.test(src));

  // ---------- 5. CSP ----------
  check('产物不含 Function( 调用', (src.match(/\bFunction\(/g) || []).length === 0,
    'count=' + (src.match(/\bFunction\(/g) || []).length);
  check('产物不含 eval( 调用', (src.match(/\beval\(/g) || []).length === 0,
    'count=' + (src.match(/\beval\(/g) || []).length);

  console.log('\n混淆产物运行时门禁：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERR', e); process.exit(1); });
