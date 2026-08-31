/*
 * integration.test.js — 把生成的单文件脚本在 jsdom 里真正跑起来，
 * 验证「主逻辑编排」这条测试套件从未覆盖的路径：
 *   脚本加载 -> 创建浮窗 -> 扫描题目 -> 调 AI(callAI) -> 解析 -> 自动填答
 * 同时 mock 全部 GM_* API，覆盖「有 Key 走 AI」与「无 Key 走演示兜底」两种场景。
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const distPath = path.join(__dirname, '..', 'dist', 'universal-auto-answer.user.js');
const dist = fs.readFileSync(distPath, 'utf8');
const script = dist.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/, '');

let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? '  -> ' + extra : '')); }
}

/**
 * 在独立 jsdom 中运行脚本（隔离不同场景的 mock 状态）。
 * @param {string} html   页面 HTML
 * @param {string} keyVal 模拟的 API Key（'' 表示无 Key）
 * @returns {{window, menuCommands, aiCalls:()=>number, error:?Error}}
 */
function runInDom(html, keyValue, opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: opts.url || 'https://example.com/exam' });
  const { window } = dom;
  const menuCommands = [];
  let aiCalls = 0;
  let lastUrl = '';
  let lastHeaders = null;
  let lastData = '';
  const aiAnswers = ['A'];
  // 真实落盘存储（用于验证本地题库持久化：AI 答过的题写入 uaa_ai_cache）
  const store = {};
  window.GM_getValue = (k, d) => {
    if (k === 'uaa_sb_anon') return keyValue;
    if (k === 'uaa_sf_key') return opts.sfKey || '';
    if (Object.prototype.hasOwnProperty.call(store, k)) return store[k];
    return d;
  };
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_registerMenuCommand = (name, fn) => menuCommands.push({ name, fn });
  window.GM_openInTab = () => {};
  window.GM_setClipboard = () => {};
  window.prompt = () => null;
  window.GM_xmlhttpRequest = (o) => {
    aiCalls++;
    lastUrl = o.url || '';
    lastHeaders = o.headers || null;
    lastData = o.data || '';
    let resp;
    if (/siliconflow\.cn/.test(o.url)) {
      // 直连模式：硅基流动返回 OpenAI 格式
      resp = opts.sfResp || { choices: [{ message: { content: opts.sfAnswer || 'A' } }] };
    } else {
      const ans = aiAnswers[aiCalls - 1] || 'A';
      resp = opts.mockResp || { answer: ans };
    }
    setTimeout(() => {
      try { o.onload({ responseText: JSON.stringify(resp) }); } catch (e) {}
    }, 0);
  };
  let error = null;
  try { vm.runInContext(script, dom.getInternalVMContext(), { filename: 'uaa.user.js' }); }
  catch (e) { error = e; }
  return { window, menuCommands, aiCalls: () => aiCalls, lastUrl: () => lastUrl, lastHeaders: () => lastHeaders, lastData: () => lastData, store: () => store, error };
}

(async () => {
  // ---------- 场景A：有 Key，验证 AI 调用 + 通用扫描填答单选 ----------
  const htmlA = `<!DOCTYPE html><html><body>
    <fieldset><legend>1. 中国的首都是哪里？</legend>
    <label><input type="radio" name="q1" value="A"> A. 北京</label>
    <label><input type="radio" name="q1" value="B"> B. 上海</label>
    <label><input type="radio" name="q1" value="C"> C. 广州</label></fieldset>
  </body></html>`;
  const A = runInDom(htmlA, 'test-key');
  await new Promise((r) => setTimeout(r, 3200));
  console.log('— 场景A：有 Key，AI 填答 —');
  check('A: 脚本启动未抛错', !A.error, A.error && A.error.message);
  check('A: 浮窗 #uaa-panel 已创建', !!A.window.document.getElementById('uaa-panel'));
  check('A: 浮窗含可拖动手柄 #uaa-title', !!A.window.document.getElementById('uaa-title'));
  check('A: 浮窗含 QQ 反馈群入口 #uaa-copyqq', !!A.window.document.getElementById('uaa-copyqq'));
  check('A: 面板底部文案含反馈群号', /1104357904/.test(A.window.document.getElementById('uaa-panel').textContent));
  check('A: AI 接口被调用', A.aiCalls() >= 1, 'aiCalls=' + A.aiCalls());
  check('A: 调用的是云端 Supabase 函数', /supabase\.co\/functions\/v1/.test(A.lastUrl()), A.lastUrl());
  check('A: 请求携带 FUNC_TOKEN 校验头', !!(A.lastHeaders() && A.lastHeaders()['x-func-token']), JSON.stringify(A.lastHeaders()));
  const cA = A.window.document.querySelectorAll('input[name=q1]:checked');
  check('A: 已自动勾选且为 A(北京)', cA.length === 1 && cA[0].value === 'A');

  // ---------- 场景B：无 Key，调用「演示」菜单命令，验证注入 4 题 + 本地答案兜底 ----------
  const htmlB = `<!DOCTYPE html><html><body><p>这是任意普通网页，无真实题目。</p></body></html>`;
  const B = runInDom(htmlB, '');
  await new Promise((r) => setTimeout(r, 300)); // 等 boot 渲染浮窗
  const demoCmd = B.menuCommands.find((m) => m.name.includes('演示'));
  let demoErr = null;
  if (demoCmd) { try { await demoCmd.fn(); } catch (e) { demoErr = e; } }
  console.log('— 场景B：无 Key，演示自检 —');
  check('B: 演示菜单命令存在', !!demoCmd);
  check('B: 演示命令执行未抛错', !demoErr, demoErr && demoErr.message);
  check('B: 未配置 Anon Key 时不发云端请求', B.aiCalls() === 0, 'aiCalls=' + B.aiCalls());
  check('B: 注入演示面板 #uaa-demo', !!B.window.document.getElementById('uaa-demo'));
  // 单选：北京
  const r1 = B.window.document.querySelectorAll('input[name=uaa_demo_r1]:checked');
  check('B: 单选勾选北京', r1.length === 1 && /北京/.test(r1[0].closest('label').textContent));
  // 多选：苹果 + 香蕉
  const c1 = B.window.document.querySelectorAll('input[name=uaa_demo_c1]:checked');
  const c1txt = Array.from(c1).map((i) => i.closest('label').textContent).join('|');
  check('B: 多选勾选苹果+香蕉', c1.length === 2 && /苹果/.test(c1txt) && /香蕉/.test(c1txt), c1txt);
  // 判断：正确
  const j1 = B.window.document.querySelectorAll('input[name=uaa_demo_j1]:checked');
  check('B: 判断勾选正确', j1.length === 1 && /正确/.test(j1[0].closest('label').textContent));
  // 填空：H2O
  const b1 = B.window.document.querySelector('input[name=uaa_demo_b1]');
  check('B: 填空填入 H2O', !!b1 && b1.value === 'H2O', 'value=' + (b1 && b1.value));

  // ---------- 场景C：云端返回错误，应透传详情且不误填 ----------
  const C = runInDom(htmlA, 'test-key', { mockResp: { error: 'sf_api_error', detail: 'Token is invalid.' } });
  await new Promise((r) => setTimeout(r, 3200));
  console.log('— 场景C：云端返回错误，透传且不误填 —');
  check('C: 脚本未抛错', !C.error, C.error && C.error.message);
  check('C: 仍调用云端函数', C.aiCalls() >= 1, 'aiCalls=' + C.aiCalls());
  const txtC = C.window.document.getElementById('uaa-panel').textContent;
  // 云端报错后 AI 无答案；若开了启发式兜底会猜一个（属预期：不留空），但绝不能当成"云端答案"入库
  check('C: 云端报错不作为有效答案入库', !C.store()['uaa_ai_cache'] || Object.keys(JSON.parse(C.store()['uaa_ai_cache'])).length === 0, String(C.store()['uaa_ai_cache']).slice(0, 60));
  check('C: 日志中明确区分（未把报错当 AI 答案）', !/✓ .*答案：/.test(txtC), txtC.slice(-160));
  check('C: 面板日志透传云端错误详情', /云端返回错误：sf_api_error（Token is invalid.）/.test(txtC), txtC.slice(-160));

  // ---------- 场景D：用户配置 sfKey → 直连硅基流动（绕过云端，免部署）----------
  const D = runInDom(htmlA, 'test-key', { sfKey: 'sk-testuser123' });
  await new Promise((r) => setTimeout(r, 3500));
  console.log('— 场景D：sfKey 直连硅基流动 —');
  check('D: sfKey 配置后走硅基流动直连', /siliconflow\.cn/.test(D.lastUrl()), D.lastUrl());
  check('D: 直连请求头携带 Bearer Key', /sk-testuser123/.test((D.lastHeaders() || {}).Authorization || ''), JSON.stringify(D.lastHeaders()));
  let parsedD = null; try { parsedD = JSON.parse(D.lastData()); } catch (e) {}
  check('D: 直连请求体为 OpenAI 格式(model)', !!(parsedD && parsedD.model), D.lastData());

  // ---------- 场景F：sfKey 直连真正填答（验证直连模式产出答案）----------
  const F = runInDom(htmlA, 'test-key', { sfKey: 'sk-fill123', sfAnswer: 'A' });
  await new Promise((r) => setTimeout(r, 3500));
  console.log('— 场景F：sfKey 直连填答 —');
  const cF = F.window.document.querySelectorAll('input[name=q1]:checked');
  check('F: 直连模式已自动勾选且为 A(北京)', cF.length === 1 && cF[0].value === 'A', 'checked=' + cF.length);

  // ---------- 场景E：点击「📋复制日志」应触发剪贴板写入（回归：拖拽手柄曾吞掉按钮点击）----------
  const E = runInDom(htmlA, 'test-key');
  await new Promise((r) => setTimeout(r, 200));
  let copied = null;
  E.window.GM_setClipboard = (v) => { copied = v; };
  const copyBtn = E.window.document.getElementById('uaa-copy-log');
  let clickErr = null;
  if (copyBtn) { try { copyBtn.click(); } catch (e) { clickErr = e; } }
  await new Promise((r) => setTimeout(r, 80));
  console.log('— 场景E：点击复制日志按钮触发剪贴板 —');
  check('E: 复制按钮 #uaa-copy-log 存在', !!copyBtn);
  check('E: 点击复制按钮未抛错', !clickErr, clickErr && clickErr.message);
  check('E: 点击后触发了剪贴板写入', typeof copied === 'string' && copied.length > 0, 'copied=' + (typeof copied));
  check('E: 复制内容为诊断报告', /诊断报告/.test(copied || ''), (copied || '').slice(0, 40));
  // 同时验证详情切换按钮点击也生效（同属原被吞的头部按钮）
  const toggleBtn = E.window.document.getElementById('uaa-toggle-all');
  let toggleErr = null;
  if (toggleBtn) { try { toggleBtn.click(); } catch (e) { toggleErr = e; } }
  await new Promise((r) => setTimeout(r, 50));
  check('E: 切换详细按钮点击未抛错', !toggleErr, toggleErr && toggleErr.message);

  // ---------- 场景G：无 Key 时面板显示「填 Key」横幅，点击内联按钮即配置（免找菜单）----------
  const G = runInDom(htmlA, 'test-key'); // 无 sfKey
  await new Promise((r) => setTimeout(r, 200));
  console.log('— 场景G：内联填 Key 横幅 —');
  const cta = G.window.document.getElementById('uaa-keycta');
  check('G: 未配置 sfKey 时横幅 #uaa-keycta 存在', !!cta);
  check('G: 横幅默认可见（display=block）', !!cta && cta.style.display === 'block', cta && cta.style.display);
  // 点击「立即配置」→ 跳到面板「AI接口」页（统一 UI：配置集中在面板内完成）
  let savedKey = null;
  const origSetValue = G.window.GM_setValue;
  G.window.GM_setValue = (k, v) => { if (k === 'uaa_sf_key') savedKey = v; try { origSetValue(k, v); } catch (_) {} };
  const ctaSet = G.window.document.getElementById('uaa-cta-set');
  let ctaErr = null;
  if (ctaSet) { try { ctaSet.click(); } catch (e) { ctaErr = e; } }
  await new Promise((r) => setTimeout(r, 80));
  check('G: 点击「立即配置」未抛错', !ctaErr, ctaErr && ctaErr.message);
  const aiView = G.window.document.getElementById('uaa-view-ai');
  check('G: 点击后跳到「AI接口」页', !!aiView && aiView.classList.contains('on'));
  // 在 AI 接口页填写自己的 Key 并保存 → 应写入存储且横幅自动隐藏
  const keyInput = G.window.document.getElementById('uaa-apikey');
  check('G: AI接口页含 Key 输入框', !!keyInput);
  if (keyInput) {
    keyInput.value = 'sk-cta-user123';
    G.window.document.getElementById('uaa-ai-save').click();
  }
  await new Promise((r) => setTimeout(r, 80));
  check('G: 保存后已把 Key 写入存储', savedKey === 'sk-cta-user123', 'savedKey=' + savedKey);
  check('G: 配置后横幅自动隐藏', !!cta && cta.style.display === 'none', cta && cta.style.display);
  // 点击「去申请」应打开硅基流动官网
  let openedUrl = null;
  G.window.GM_openInTab = (u) => { openedUrl = u; };
  const ctaApply = G.window.document.getElementById('uaa-cta-apply');
  if (ctaApply) { try { ctaApply.click(); } catch (e) {} }
  check('G: 点击「去申请」打开 cloud.siliconflow.cn', /cloud\.siliconflow\.cn/.test(openedUrl || ''), openedUrl);

  // ---------- 场景H：本地题库持久化（AI 答过的题落盘，下次离线可答）----------
  const H = runInDom(htmlA, 'test-key');
  await new Promise((r) => setTimeout(r, 3400));
  console.log('— 场景H：本地题库持久化 —');
  let bankH = null;
  try { bankH = JSON.parse(H.store()['uaa_ai_cache'] || '{}'); } catch (e) {}
  const bankVals = bankH ? Object.keys(bankH).map((k) => bankH[k].a) : [];
  check('H: AI 答案已写入本地题库存储', !!bankH && Object.keys(bankH).length > 0, JSON.stringify(H.store()['uaa_ai_cache'] || '').slice(0, 80));
  check('H: 题库条目含答案 A', bankVals.indexOf('A') >= 0, JSON.stringify(bankVals));
  check('H: 题库条目带来源标记', !!bankH && /ai|cloud|sf/.test(String((Object.values(bankH)[0] || {}).s || '')), JSON.stringify(Object.values(bankH || {})[0]));

  // ---------- 场景I：AI 全失败时启发式兜底仍作答（不留空）----------
  const htmlI = `<!DOCTYPE html><html><body>
    <fieldset><legend>1. 关于DRG支付方式改革，下列说法正确的是？</legend>
    <label><input type="radio" name="q1" value="A"> A. 所有医院必须立即停止按项目付费</label>
    <label><input type="radio" name="q1" value="B"> B. DRG按疾病诊断相关分组付费，有助于医保基金精细化管理</label>
    <label><input type="radio" name="q1" value="C"> C. 绝不可能推广</label></fieldset>
  </body></html>`;
  const I = runInDom(htmlI, 'test-key', { mockResp: { answer: null } });
  await new Promise((r) => setTimeout(r, 3400));
  console.log('— 场景I：启发式兜底 —');
  const ib = I.window.document.querySelector('input[value="B"]');
  const ia = I.window.document.querySelector('input[value="A"]');
  check('I: AI 无答案时启发式选中了 B（最长且非绝对化）', !!ib && ib.checked === true, 'B.checked=' + (ib && ib.checked));
  check('I: 未选绝对化选项 A（含"所有""必须"）', !!ia && ia.checked === false, 'A.checked=' + (ia && ia.checked));
  let ibank = null;
  try { ibank = JSON.parse(I.store()['uaa_ai_cache'] || '{}'); } catch (e) {}
  check('I: 启发式答案不污染题库（不算作已确认答案）', !ibank || Object.keys(ibank).length === 0, JSON.stringify(ibank || {}).slice(0, 60));

  // ---------- 场景J：结果页/解析页回捞正确答案入库 ----------
  const htmlJ = `<!DOCTYPE html><html><body>
    <div><p>1. 全面预算管理制度的基本原则中，实行全口径、全过程、全员性预算管理</p>
    <p>正确答案：B</p></div>
    <div><p>2. 我国职工医保筹资增速与住院费用增速之间存在什么矛盾？</p>
    <p>正确答案：C</p></div>
  </body></html>`;
  const J = runInDom(htmlJ, 'test-key', { url: 'https://www.ncme.org.cn/qbank/do/report/paper?batchId=1' });
  await new Promise((r) => setTimeout(r, 2200));
  console.log('— 场景J：结果页答案回捞 —');
  let bankJ = null;
  try { bankJ = JSON.parse(J.store()['uaa_ai_cache'] || '{}'); } catch (e) {}
  const jVals = bankJ ? Object.keys(bankJ).map((k) => bankJ[k].a) : [];
  check('J: 结果页回捞写入题库', !!bankJ && Object.keys(bankJ).length >= 2, 'size=' + (bankJ ? Object.keys(bankJ).length : 0));
  check('J: 回捞到答案 B 与 C', jVals.indexOf('B') >= 0 && jVals.indexOf('C') >= 0, JSON.stringify(jVals));
  check('J: 回捞条目来源标记为 harvest', !!bankJ && /harvest/.test(String((Object.values(bankJ)[0] || {}).s || '')), JSON.stringify(Object.values(bankJ || {})[0]));

  console.log('\n结果：' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
})();
