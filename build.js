const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST);

const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const readAsset = (p) => {
  const f = path.join(ROOT, 'assets', p);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : '';
};

// 优先从标准 node_modules 加载（clone 后 npm install 即可），再回退 .testdeps
let JavaScriptObfuscator = null;
try { JavaScriptObfuscator = require('javascript-obfuscator'); } catch (e) {}
if (!JavaScriptObfuscator) {
  try { JavaScriptObfuscator = require(path.join(ROOT, '.testdeps', 'node_modules', 'javascript-obfuscator')); } catch (e2) {}
}

const OBF_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.7,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.3,
  debugProtection: false,
  debugProtectionInterval: 2000,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.5,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  target: 'browser',
  unicodeEscapeSequence: true,
};

const engineCode = read('engine.js');
const domCoreCode = read('dom-core.js');
const bankCode = read('bank-import.js');
const uiPanelCode = read('ui-panel.js');
const adapterCode = read('adapters/sample.js');
const platformsCode = read('adapters/platforms.js');
const knownPlatformsCode = read('adapters/known-platforms.js');
const henanJxjyCode = read('adapters/henan-jxjy.js');

// 默认系统提示词（统一在此维护，面板「恢复默认」直接取用）
const DEFAULT_AI_SYSTEM_JS =
  '你是一名严谨的中文考试答题判题助手，服务于医学/继续教育培训类考试（国家继续医学教育网 NCME、华医网、公需科目、公检法/消防职业考试等）。' +
  '请根据题目给出唯一正确的最终答案，并严格遵守以下格式：' +
  '【单选题】只输出正确选项字母（如 A），若只能确定内容则输出该选项关键短语；' +
  '【多选题】只输出所有正确选项字母，按 A→Z 顺序用半角逗号分隔（如 A,C,D），不得遗漏或多余；' +
  '【判断题】只输出「正确」或「错误」；' +
  '【填空题】只输出应填入的空缺内容，不要重复题干，不要「答案：」前缀。' +
  '通用要求：只输出最终答案本身，严禁解释、严禁序号、严禁「答案：」等前缀、严禁换行；' +
  '遇到信息不足或歧义时，依据常识与题目所属领域知识选择最合理的一项，不要输出「未知」。' +
  '作答前先判断题型与考点，对多选题务必逐项独立判断正误。';

// ===== 作者打赏收款码（发布者只需改这里，安装脚本的所有人都能看到）=====
// 取码方式：微信 → 我 → 服务 → 收付款 → 二维码收款 → 保存收款码；支付宝 → 我的 → 收钱 → 保存图片。
// 把图片上传到任意图床（或转成 base64 的 data:image/png;base64,...），把链接填到下面即可。
// ① 外链：体积小、可随时换图；务必用 https（答题页多为 https，http 图片会被浏览器当混合内容拦截）
const AUTHOR_DONATE_WX  = 'https://a1.boltp.com/2026/08/31/6a950ca33c5d1.png';   // 微信收款码（姜老师 · 2026-09-01）
const AUTHOR_DONATE_ALI = 'https://a1.boltp.com/2026/08/31/6a950ca30913e.jpg';   // 支付宝收款码（姜老师 · 2026-09-01）
// ② 内嵌兜底：assets/donate-wx.txt、donate-ali.txt（内容为 data:image/...;base64,...）。
//    图床链接（尤其 QQ 相册带临时签名）随时可能失效，外链加载失败时脚本会自动切到内嵌图，用户无感。
//    换图只需覆盖这两个 txt（把新图转成 data URI 一行写入），再 node build.js 重建。
// 自 1.1.2 起只用图床 URL，不再保留 base64 兜底；此处保留 readAsset 调用是为空字符串兜底防止 undefined
const AUTHOR_DONATE_WX_B64  = readAsset('donate-wx.txt');   // 留空（已不依赖 base64）
const AUTHOR_DONATE_ALI_B64 = readAsset('donate-ali.txt');  // 留空（已不依赖 base64）
const AUTHOR_DONATE_USERS  = '12,800+';   // 已陪伴的学习者（社交证明，可改成自己真实数字；留空则不显示）
const AUTHOR_DONATE_STAR    = '4.9';       // 评分（0~5，小数 0.1~0.5；留空不显示）
const AUTHOR_DONATE_NOTE = '记得备注你的 QQ，作者拉你进内测群，新平台优先适配～'; // 打赏页留言
const AUTHOR_DONATE_TIP  = '打赏后请备注 QQ，作者拉你进内测群';                    // 写进一键复制的文案

const mainCode = `
(function () {
  'use strict';

  const DEFAULT_AI_SYSTEM = ${JSON.stringify(DEFAULT_AI_SYSTEM_JS)};

  const CFG = {
    sbUrl:   GM_getValue('uaa_sb_url', 'https://vjfybcwsbduswkzouvvd.supabase.co'),
    sbAnon:  GM_getValue('uaa_sb_anon', 'sb_publishable_hdSyn_SheWZ6jtISalrfnA_tgi-Om5l'),
    sbFn:    GM_getValue('uaa_sb_fn', 'ai-answer'),
    funcToken: GM_getValue('uaa_func_token', 'uaa_fnt_a1b0d1cd0a701046a5995865a9d408e08251bf21fe3731a75b7f6a7ebc75a27c'),
    // ===== AI 接口（用户自定义，密钥只存本机，可填任意 OpenAI 兼容服务） =====
    apiProvider: GM_getValue('uaa_api_provider', 'siliconflow'),
    apiBase: GM_getValue('uaa_api_base', GM_getValue('uaa_sf_base', 'https://api.siliconflow.cn/v1')),
    apiKey: GM_getValue('uaa_api_key', GM_getValue('uaa_sf_key', '')),
    aiModel: GM_getValue('uaa_ai_model', 'Qwen/Qwen2.5-72B-Instruct'),
    aiSystem: GM_getValue('uaa_ai_system', DEFAULT_AI_SYSTEM),
    // 兼容旧字段：凡读取 CFG.sfKey 的旧逻辑继续可用（始终与 apiKey 同步）
    sfKey: '',
    // 自定义接口失败时是否回退作者托管的云端共享额度
    cloudFallback: GM_getValue('uaa_cloud_fallback', true),
    autoFillEnabled: GM_getValue('uaa_autoFill', true),
    paused: false,
    panelHidden: GM_getValue('uaa_panelHidden', false),
    // 视频倍速（持久化）：1×/2×/3×/5× 可选，默认 2×；速学按钮固定 16×
    userSpeed: GM_getValue('uaa_user_speed', 2),
    speedChoices: [1, 2, 3, 5, 8, 16],
    // 速学倍率（持久化）：默认 16×；经菜单循环提升（16→32→…→1000），>16 时启用帧步进实现"1000× 体感"
    fastVideoSpeed: GM_getValue('uaa_fast_video_speed', 16),
    // 帧步进秒数（fastVideoSpeed>16 时生效）：每帧把 currentTime 推 N 秒，越过浏览器 playbackRate 16× 硬上限
    stepSec: GM_getValue('uaa_step_sec', 6),
    // 详细日志开关：展开面板 body 显示完整日志（不只截尾 40 行），用于截图/复制诊断
    showAllLogs: GM_getValue('uaa_show_all_logs', false),
    // 视频学完后自动跳转本节考试（NCME 等反拖拽平台无 nextBtn/gotoExam，需脚本主动衔接）
    autoGotoExam: GM_getValue('uaa_auto_goto_exam', true),
    // 手动指定考试入口（启发式找不到时兜底）：CSS 选择器 或 直达 URL
    examEntrySelector: GM_getValue('uaa_exam_entry_sel', ''),
    examEntryUrl: GM_getValue('uaa_exam_entry_url', ''),
    // 启发式兜底：AI 与本地题库都未命中时，按命题规律猜答（保证不空着；可菜单关闭）
    heuristicFallback: GM_getValue('uaa_heuristic', true),
    // ===== 面板内可开关的功能项 =====
    harvestEnabled: GM_getValue('uaa_harvest', true),        // 结果页答案回捞
    modalWatch: GM_getValue('uaa_modal_watch', true),        // 弹窗式一题一答监听
    repaintWatch: GM_getValue('uaa_repaint_watch', true),    // SPA 翻页自动补扫
    speedPanelEnabled: GM_getValue('uaa_speed_panel', true), // 右下角倍速悬浮条
    forceSpeed: GM_getValue('uaa_force_speed', true),        // 倍速强制接管
    panelTab: GM_getValue('uaa_panel_tab', 'home'),          // 面板当前标签
    panelCollapsed: false,
    autoScrollLog: GM_getValue('uaa_auto_scroll', true),
    // ===== 打赏（已内置作者真实收款码；想换码改 build.js 顶部 AUTHOR_DONATE_WX/ALI，终端用户无需任何操作） =====
    donateEnabled: GM_getValue('uaa_donate_enabled', true),  // 是否显示打赏页
    donateWx: GM_getValue('uaa_donate_wx', ${JSON.stringify(AUTHOR_DONATE_WX)}),     // 微信收款码图片地址（默认已内置）
    donateAli: GM_getValue('uaa_donate_ali', ${JSON.stringify(AUTHOR_DONATE_ALI)}),  // 支付宝收款码图片地址（默认已内置）
    donateNote: GM_getValue('uaa_donate_note', ${JSON.stringify(AUTHOR_DONATE_NOTE)}), // 作者留言（展示在打赏页）
    donateTip: GM_getValue('uaa_donate_tip', ${JSON.stringify(AUTHOR_DONATE_TIP)}),  // 打赏后回复语（如"打赏后请备注 QQ，作者拉你进内测群"）
    // 社交证明（仅 UI 显示，不写入 GM；想改改 build.js 顶部 AUTHOR_DONATE_USERS/STAR）
    donateUsers: ${JSON.stringify(AUTHOR_DONATE_USERS)},  // 如 "12,800+"；空串则不显示
    donateStar:  ${JSON.stringify(AUTHOR_DONATE_STAR)},   // 如 "4.9"；空串则不显示
    // 内嵌兜底图：外链失效（图床过期/被墙/离线）时 onerror 自动切到这里，保证收款码永不破图。
    // 值来自混淆包外的 UAA_QR_WX_B64 / UAA_QR_ALI_B64（见文件末尾说明：不参与混淆以免体积暴涨）
    donateWxB64:  GM_getValue('uaa_donate_wx_b64',  (typeof UAA_QR_WX_B64 === 'string' ? UAA_QR_WX_B64 : '')),
    donateAliB64: GM_getValue('uaa_donate_ali_b64', (typeof UAA_QR_ALI_B64 === 'string' ? UAA_QR_ALI_B64 : '')),
    // ===== 导入题库（xlsx / csv / txt / json 上传导入）=====
    bankFuzzy: GM_getValue('uaa_bank_fuzzy', true),           // 题干模糊匹配（一字之差也能命中）
    bankFuzzyRatio: GM_getValue('uaa_bank_ratio', 0.86),      // 相似度阈值（0.7 宽松 ~ 0.95 严格）
    bankPreferText: GM_getValue('uaa_bank_prefer_text', true),// 用导入的选项原文反查字母（防选项顺序不同答错）
    bankMax: GM_getValue('uaa_bank_max', 20000),              // 导入题库上限
    // ===== 正确率增强（NCME 等医学平台专项）=====
    accMultiItem: GM_getValue('uaa_acc_multi_item', true),    // 多选题逐项判断：每选项单独问 AI 再汇总（降漏选）
    accMedPrompt: GM_getValue('uaa_acc_med_prompt', true),    // 医学自适应提示词 + 否定题干警示
    accDualModel: GM_getValue('uaa_acc_dual_model', false),   // 双模型会诊：主模型答不上时用复核模型
  };
  // 旧字段兼容：读 CFG.sfKey 的旧逻辑等价于 apiKey
  CFG.sfKey = CFG.apiKey;

  // AI 配置写入（统一入口，保证 apiKey / sfKey / 持久化三者同步）
  function setApiBase(v) {
    CFG.apiBase = String(v == null ? '' : v).trim().replace(/\\/+$/, '');
    GM_setValue('uaa_api_base', CFG.apiBase);
  }
  function setApiKey(v) {
    CFG.apiKey = String(v == null ? '' : v).trim();
    CFG.sfKey = CFG.apiKey;
    GM_setValue('uaa_api_key', CFG.apiKey);
    GM_setValue('uaa_sf_key', CFG.apiKey);
  }
  function setApiModel(v) {
    CFG.aiModel = String(v == null ? '' : v).trim();
    GM_setValue('uaa_ai_model', CFG.aiModel);
  }
  // 旧调用（菜单/面板 CTA）保持兼容
  function setSfKey(v) {
    if (v == null) return;
    setApiKey(v);
    log.push(CFG.apiKey
      ? '🔑 已配置 AI Key（直连你自己的接口，不经云端、免部署）'
      : '已清空 Key，回退到题库 / 启发式 / 云端兜底');
    render();
  }

  let panel = null;
  let log = [];
  const aiCache = {};
  // 本次运行统计（面板「总览」展示命中来源分布）
  const STATS = { scanned: 0, ai: 0, bank: 0, guess: 0, miss: 0 };

  // ===== 本地题库（离线兜底核心）=====
  // 目的：AI 接口不通 / 未配 Key / 云端欠费时，脚本依然能答题。
  // 来源有三：① AI 答过的题自动落盘持久化；② 结果页/解析页回捞正确答案；③ 剪贴板导入。
  // 命中时零延迟、零费用、不联网——继续教育题库重复率高，越用越准。
  const QCACHE_KEY = 'uaa_ai_cache';
  const QCACHE_MAX = 3000;

  function qcacheRead() {
    try { return JSON.parse(GM_getValue(QCACHE_KEY, '{}')) || {}; } catch (_) { return {}; }
  }
  function qcacheWrite(o) {
    try {
      const ks = Object.keys(o);
      if (ks.length > QCACHE_MAX) {
        ks.sort((a, b) => (o[a].t || 0) - (o[b].t || 0));
        for (let i = 0; i < ks.length - QCACHE_MAX; i++) delete o[ks[i]];
      }
      GM_setValue(QCACHE_KEY, JSON.stringify(o));
    } catch (_) {}
  }
  // 返回 true 表示新写入（用于统计）
  function qcachePut(k, ans, src) {
    if (!k || ans == null || ans === '未知') return false;
    const existed = aiCache[k] != null;
    aiCache[k] = ans;
    // 新答案进库 → 之前记成「未命中」的题可能现在能命中，作废 memo
    if (!existed) bankBump();
    try {
      const o = qcacheRead();
      if (o[k] && o[k].a === String(ans)) return false;
      o[k] = { a: String(ans), s: src || 'ai', t: Date.now() };
      qcacheWrite(o);
      return true;
    } catch (_) { return !existed; }
  }
  function qcacheLoad() {
    try {
      const o = qcacheRead();
      let n = 0;
      for (const k in o) { if (o[k] && o[k].a != null && o[k].a !== '未知') { aiCache[k] = o[k].a; n++; } }
      return n;
    } catch (_) { return 0; }
  }
  function qcacheSize() { try { return Object.keys(qcacheRead()).length; } catch (_) { return 0; } }

  // ===== 导入题库（独立于 AI 缓存，避免被 3000 条上限挤掉）=====
  // 用户上传的 .xlsx/.csv/.txt/.json 题库单独存 uaa_bank_imp：
  // ① 量级可以很大（默认上限 2 万）；② 只在导入时整包写一次，不影响每次答题的写入性能。
  const BANK_IMP_KEY = 'uaa_bank_imp';
  let bankImp = {};
  let bankLookupMemo = {};
  // 题库版本号：任何一次「往题库里加东西」都会 +1。
  // 作用：未命中的结果也进了 memo，若不失效，用户中途导入题库后，
  // 之前扫过并记成「未命中」的题就永远不会再去查库（必须刷新页面才生效）。
  let bankVer = 0;
  let bankMemoVer = -1;
  function bankBump() { bankVer++; }
  function bankLoad() {
    try { bankImp = JSON.parse(GM_getValue(BANK_IMP_KEY, '{}')) || {}; } catch (_) { bankImp = {}; }
    bankBump();
    return Object.keys(bankImp).length;
  }
  function bankSave() {
    try {
      const ks = Object.keys(bankImp);
      if (ks.length > CFG.bankMax) {
        ks.sort((a, b) => (bankImp[a].t || 0) - (bankImp[b].t || 0));
        for (let i = 0; i < ks.length - CFG.bankMax; i++) delete bankImp[ks[i]];
      }
      GM_setValue(BANK_IMP_KEY, JSON.stringify(bankImp));
      bankBump();
    } catch (_) {}
  }
  function bankClear() {
    bankImp = {}; bankLookupMemo = {}; bankBump();
    try { GM_setValue(BANK_IMP_KEY, '{}'); } catch (_) {}
  }
  function bankImpSize() { return Object.keys(bankImp).length; }

  // 参与模糊匹配的候选键：**只收真正有答案的条目**。
  // 关键：AI 请求失败时 aiCache[k] 会被写成 null/undefined，若不剔除，
  // 这些"空答案键"会混进候选表并被优先命中（页面题干自身必然 100% 匹配），
  // 结果就是"题库里明明有答案，却永远命中不到"。
  function bankKeys() {
    const out = [];
    let kk;
    for (kk in bankImp) { if (bankImp[kk] && bankImp[kk].a != null && bankImp[kk].a !== '未知') out.push(kk); }
    for (kk in aiCache) { if (aiCache[kk] != null && aiCache[kk] !== '未知') out.push(kk); }
    return out;
  }

  // 题库命中：AI 缓存 → 导入题库 → 60 字指纹 → 包含 → 模糊相似度
  // 结果按题干指纹记忆，翻页重扫时不重复计算。
  function bankLookup(stem) {
    const k = engine.normalize(stem);
    if (!k) return null;
    // 题库内容变过（新导入 / 新回捞 / 新 AI 答案）→ 旧 memo 全部作废重算
    if (bankMemoVer !== bankVer) { bankLookupMemo = {}; bankMemoVer = bankVer; }
    if (Object.prototype.hasOwnProperty.call(bankLookupMemo, k)) return bankLookupMemo[k];
    let rec = null, hitKey = null;
    if (aiCache[k] != null) { rec = { a: aiCache[k] }; hitKey = k; }
    else if (bankImp[k] != null) { rec = bankImp[k]; hitKey = k; }
    else {
      const k60 = k.slice(0, 60);
      if (aiCache[k60] != null) { rec = { a: aiCache[k60] }; hitKey = k60; }
      else if (bankImp[k60] != null) { rec = bankImp[k60]; hitKey = k60; }
      else if (CFG.bankFuzzy && typeof BankImport !== 'undefined') {
        const mk = BankImport.matchKey(bankKeys(), k, { ratio: CFG.bankFuzzyRatio, minLen: 8 });
        if (mk != null) { rec = bankImp[mk] || { a: aiCache[mk] }; hitKey = mk; }
      }
    }
    const out = (rec && rec.a != null && rec.a !== '未知') ? { rec: rec, key: hitKey } : null;
    bankLookupMemo[k] = out;
    return out;
  }

  // 把命中的题库记录换算成「这一页能填」的答案：
  // 题库里存了选项原文时，按当前页选项顺序反查字母——避免两边选项顺序不同导致答错。
  function resolveBankAnswer(rec, q) {
    if (!rec) return null;
    const a = rec.a == null ? '' : String(rec.a);
    if (!a) return null;
    if (!q || !q.options || !q.options.length) return a;
    if (q.type === 'judge' || q.type === 'blank') return a;
    if (CFG.bankPreferText && rec.o && rec.o.length) {
      const letters = [];
      let ok = true;
      for (const t of rec.o) {
        let idx = -1;
        for (let i = 0; i < q.options.length; i++) {
          if (DomCore.optionTextMatch(q.options[i].text, t)) { idx = i; break; }
        }
        if (idx < 0) { ok = false; break; }
        letters.push(DomCore.optionLetter(idx));
      }
      if (ok && letters.length) return letters.join('');
    }
    return a;
  }

  // 导入解析好的题目（只合并不覆盖：AI/回捞已有的答案不被文件覆盖）
  function bankImportItems(items, srcName) {
    let added = 0, dup = 0, skip = 0;
    for (const it of items || []) {
      const k = engine.normalize(it.stem);
      if (!k) { skip++; continue; }
      if (bankImp[k] != null) { dup++; continue; }
      if (aiCache[k] != null) { dup++; continue; }
      const rec = { a: String(it.ans), s: 'import', src: String(srcName || '').slice(0, 40), t: Date.now() };
      // 只存「正确答案对应的选项原文」：页面选项顺序与题库不一致时，用它反查正确字母
      const als = /^[A-H]+$/.test(String(it.ans)) ? String(it.ans).split('') : [];
      if (als.length && it.opts && it.opts.length) {
        const os = [];
        for (const L of als) { const oi = L.charCodeAt(0) - 65; if (it.opts[oi] != null) os.push(it.opts[oi]); }
        if (os.length === als.length) rec.o = os;
      }
      if (it.type) rec.q = it.type;
      bankImp[k] = rec;
      added++;
    }
    bankSave();
    bankLookupMemo = {};
    return { added: added, dup: dup, skip: skip, total: Object.keys(bankImp).length };
  }

  // ===== 启发式兜底答题（无 AI、无题库时的最后手段，可菜单关闭）=====
  // 依据常见命题规律：① 含"以上都正确"直接选；② 排除绝对化措辞（必须/所有/绝不…）；
  // ③ 正确项表述通常更完整（更长）。正确率有限，但远好于空着不答。
  const GUESS_ABS = /必须|所有|全部|绝不|一定|只能|唯一|无一例外|均不|永远|任何情况|绝对/;
  const GUESS_ALL = /以上(都|均|全部)?(正确|对|是|包含|属于|均)|以上皆是|都对|均正确|全部正确|都包括/;
  function heuristicGuess(q) {
    try {
      const opts = (q.options || []).filter((o) => o && o.text);
      if (!opts.length) return null;
      if (q.type === 'blank') return null; // 填空无法猜，交给用户
      if (q.type === 'judge') {
        const t0 = String((opts[0] && opts[0].text) || '');
        const t1 = String((opts[1] && opts[1].text) || '');
        if (/错误|不正确|不对|×|否/.test(t0)) return '正确';
        if (/错误|不正确|不对|×|否/.test(t1)) return '错误';
        return '正确'; // 统计上判断题答"正确"占比更高
      }
      const texts = opts.map((o) => String(o.text).replace(/^[A-Za-z][.、．)\s]*/, '').trim());
      for (let i = 0; i < texts.length; i++) {
        if (GUESS_ALL.test(texts[i]) && !GUESS_ABS.test(texts[i])) return DomCore.optionLetter(opts[i].index);
      }
      const cand = texts.map((t, i) => ({ i: i, len: t.length, bad: GUESS_ABS.test(t) ? 1 : 0 }));
      let pool = cand.filter((c) => !c.bad);
      if (!pool.length) pool = cand;
      pool.sort((a, b) => b.len - a.len);
      return DomCore.optionLetter(opts[pool[0].i].index);
    } catch (_) { return null; }
  }

  // ===== 答案回捞：结果页 / 解析页 / 错题回顾页抓取"正确答案"写入本地题库 =====
  function harvestFromPage() {
    let added = 0;
    try {
      if (!document.body) return 0;
      const txt = document.body.textContent || '';
      const isResult = /report|result|analysis|review|解析|错题|回顾|daan|answer/i.test(location.href) ||
        /正确答案|参考答案|你的答案/.test(txt);
      if (!isResult) return 0;
      const seen = {};
      const nodes = document.querySelectorAll('li, div, tr, p, section');
      for (let i = 0; i < nodes.length; i++) {
        const t = (nodes[i].textContent || '').trim();
        if (t.length < 12 || t.length > 3000) continue;
        const m = t.match(/正确答案[：:\s]*([A-Za-z]{1,4}|[^\s，,。；;：:]{1,40})/);
        if (!m) continue;
        const stem = t.slice(0, m.index).replace(/\s+/g, ' ').trim();
        if (stem.length < 6) continue;
        const ans = String(m[1] || '').trim();
        if (!ans) continue;
        const sig = stem.slice(0, 20);
        if (seen[sig]) continue;
        seen[sig] = 1;
        if (qcachePut(engine.normalize(stem.slice(0, 60)), ans, 'harvest')) added++;
      }
    } catch (_) {}
    return added;
  }

  // 自脚本启动起计时的秒数（用于面板日志定位耗时环节）
  const T0 = Date.now();
  function ts() { return ((Date.now() - T0) / 1000).toFixed(1) + 's'; }

  // 从 AI 答案中匹配弹窗选项（三段式兜底）
  // 1) 字母 A/B/C… → 选项索引
  // 2) 判断词 正确/错误/对/错 → judgeTruth 归一后匹配
  // 3) 选项文本兜底（DomCore.optionTextMatch）：仅当答案长度 >= 2 时启用，避免单字"2"误命中"2万平方公里"
  function pickOptionForAnswer(ans, options) {
    const a = String(ans || '').trim();
    if (!a || !options || !options.length) return null;
    // 1) 字母（A/B/C…）
    const letters = (a.match(/[A-Za-z]/g) || []).map((c) => c.toUpperCase());
    if (letters.length) {
      const hit = [];
      for (const L of letters) {
        const idx = L.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) hit.push(options[idx]);
      }
      if (hit.length) return hit;
    }
    // 2) 判断词（按 judgeTruth 归一）
    const jt = DomCore.judgeTruth(a);
    if (jt != null) {
      const m = options.find((o) => DomCore.judgeTruth(o.text) === jt);
      if (m) return [m];
    }
    // 3) 文本兜底（仅多字答案，防单字误命中）
    if (a.length >= 2) {
      const textHit = options.filter((o) => DomCore.optionTextMatch(o.text, a));
      if (textHit.length) return textHit;
    }
    return null;
  }

  // ===== 正确率增强：医学识别 / 否定警示 / 统一 Prompt（NCME 等医学平台专项） =====
  const MED_HOST_RE = /ncme\.org\.cn|cmechina\.net|cmda|hqpx|yxjy|medcn|med|doctor|clinic|hospital|health/i;
  const MED_STEM_RE = /(患者|病人|诊断|治疗|症状|体征|查体|入院|病史|主诉|疾病|药物|剂量|手术|并发症|预后|感染|血压|心率|血糖|心电图|CT|MRI|X线|病理|抗生素|肿瘤|骨折|卒中|心梗|叩诊|听诊|白细胞|血红蛋白)/;
  const NEG_RE = /(不正确|错误的是|除外|不是|不符合|不属于|不对|错误|不能|不宜|不需要|无需|不得|禁止|不应)/;

  // 医学环境判定：医学平台域名 或 题干含医学特征词（accMedPrompt 关闭时恒 false）
  function isMedicalEnv(stem) {
    if (CFG.accMedPrompt !== true) return false;
    const h = String(location.hostname || '').toLowerCase();
    if (MED_HOST_RE.test(h)) return true;
    return MED_STEM_RE.test(String(stem || ''));
  }
  function hasNegation(stem) {
    return NEG_RE.test(String(stem || ''));
  }
  // 医学专家 system prompt（逐项判断 / 医学题专用）
  const MED_SYSTEM = '你是资深医学考试辅导专家，精通临床执业医师、主治医师、住院医师规培等医学考试，熟悉诊断学、内、外、妇、儿及病例分析（A2/A3/A4 型题）。请以权威教材为准严谨作答；否定式提问（不正确/除外/不是）务必选出不符合题意者。只输出最终答案，不要解释。';
  const PLAIN_SYSTEM = '你是答题助手，只输出最终答案，不要解释。';

  // 统一 user prompt：医学专家语境 + 否定题干加粗警示 + 题型约束
  function buildPrompt(stem, options) {
    const NL = String.fromCharCode(10);
    const med = isMedicalEnv(stem);
    const neg = hasNegation(stem);
    const optText = (options && options.length)
      ? options.map((o, i) => DomCore.optionLetter(i) + '. ' + o.text).join(NL)
      : '';
    let p = '';
    if (med) p += '【医学考试题】请按医学专业知识严谨作答（诊断、首选治疗、药物剂量等以权威教材为准）。';
    // 否定警示随 accMedPrompt 开关一起控制（面板开关文案即含「否定式题干自动加警示」）
    if (neg && CFG.accMedPrompt === true) {
      const w = (String(stem).match(NEG_RE) || [''])[0];
      p += '【⚠ 否定式提问警示】本题含「' + w + '」，请选出【不符合/不属于】题意的选项，切勿选正确项！';
    }
    p += NL + '题干：' + stem + (optText ? NL + '选项：' + NL + optText : '');
    p += NL + '请只输出最终答案（单选题输出字母如 A；多选题输出字母串如 AB；判断题输出“正确”或“错误”；填空题输出答案文本），不要任何解释。';
    return p;
  }

  // 多选题逐项判断：每选项单独问 AI「是否符合题意」再汇总成字母串（医学 X 型题漏选率大幅下降）
  async function judgeMultiByItems(q) {
    const opts = q.options || [];
    if (opts.length < 2 || opts.length > 12) return null;
    const NL = String.fromCharCode(10);
    const med = isMedicalEnv(q.stem);
    const neg = hasNegation(q.stem) && CFG.accMedPrompt === true; // 否定提示随医学自适应开关
    const items = await Promise.all(opts.map(async (o, i) => {
      const L = DomCore.optionLetter(i);
      const prompt = (med ? '【医学多选题】' : '【多选题】') + NL +
        '题干：' + q.stem + NL +
        '选项 ' + L + '：' + o.text + NL +
        '请只判断选项 ' + L + ' 是否符合题意（即是否应被选中）' + (neg ? '。注意：题干为否定式提问，请选出不符合题意的选项' : '') + '。' + NL +
        '只回答：是 或 否。';
      try {
        const raw = await callAI(q.stem, [o], { prompt: prompt, system: med ? MED_SYSTEM : PLAIN_SYSTEM });
        const v = String(raw || '').trim().toLowerCase();
        if (/^(是|对|正确|符合|√|yes|true|1|应选|应该选|应选择)$/.test(v)) return true;
        if (/^(否|不|不对|错误|不符合|×|no|false|0|不选|不应选)$/.test(v)) return false;
        return null;
      } catch (_) { return null; }
    }));
    if (items.every((v) => v == null)) return null;          // 全部无法判断 → 交给一次性问法
    const picked = [];
    items.forEach((v, i) => { if (v === true) picked.push(DomCore.optionLetter(i)); });
    if (!picked.length) return null;                          // 一个都没选 → 结果不可靠，fallback
    return picked.join('');
  }

  // 自定义 AI 接口（用户自己的 Key + 任意 OpenAI 兼容服务；GM_xmlhttpRequest 不受浏览器跨域限制）
  // 支持硅基流动 / DeepSeek / 智谱 / Moonshot / 通义 / 火山 / OpenAI / 任意中转站
  function chatCompletionsUrl(base) {
    const b = String(base || '').trim().replace(/\\/+$/, '');
    if (!b) return '';
    return /\\/chat\\/completions$/.test(b) ? b : (b + '/chat/completions');
  }
  function callCustomAPI(stem, options, extra) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'function') { log.push('⚠ 当前管理器不支持 GM_xmlhttpRequest'); return resolve(null); }
      const NL = String.fromCharCode(10); // 用 charCode 表示换行，避免混淆器把换行转义展开成真实换行破坏字面量
      const optText = (options && options.length)
        ? options.map((o, i) => DomCore.optionLetter(i) + '. ' + o.text).join(NL)
        : '';
      // 逐项判断等场景可传入自定义 prompt/system，否则走统一 buildPrompt（医学语境 + 否定警示）
      const sys = (extra && extra.system) || PLAIN_SYSTEM;
      const prompt = (extra && extra.prompt) || (buildPrompt(stem, options) +
        // 末尾「思考」占位：Qwen3 见此即走非思考输出（等价 /think），直接给答案
        NL + '思考');
      // 模型候选：用户填的优先，其次该服务商常用模型，最后公共兜底模型
      const provModels = (typeof providerById === 'function' ? (providerById(CFG.apiProvider).models || []) : []);
      const fallbackModels = ['Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen3-8B', 'deepseek-ai/DeepSeek-V3'];
      const models = [];
      [CFG.aiModel].concat(provModels, fallbackModels).forEach((m) => {
        if (m && models.indexOf(m) < 0) models.push(m);
      });
      const tried = [];
      let idx = 0, done = false;
      const timer = setTimeout(() => { if (done) return; done = true; log.push('⏱ 自定义接口超时（15s），跳过本题'); resolve(null); }, 15000);
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
      function tryOne() {
        if (done) return;
        while (idx < models.length && tried.indexOf(models[idx]) >= 0) idx++;
        if (idx >= models.length) { log.push('❌ 自定义接口所有候选模型均失败（请检查 Key 是否有余额 / 接口地址是否带 /v1 / 模型名是否可用）'); return finish(null); }
        const m = models[idx++]; tried.push(m);
        GM_xmlhttpRequest({
          method: 'POST',
          url: chatCompletionsUrl(CFG.apiBase),
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CFG.apiKey },
          data: JSON.stringify({
            model: m,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: prompt }
          ],
            temperature: 0,
            max_tokens: 256,
            stream: false,
            enable_thinking: /Qwen3/.test(m) ? false : undefined
          }),
          onload: (resp) => {
            try {
              const j = JSON.parse(resp.responseText);
              if (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) {
                const ans = String(j.choices[0].message.content).replace(/<[\/]?think>/gi, '').trim();
                if (ans) { log.push('✅ 自定义接口命中（' + m + '）'); return finish(ans); }
              }
              const errMsg = (j && (j.message || (j.error && j.error.message))) || '';
              if (/invalid|incorrect|unauthor|401|403/i.test(errMsg) || (j && j.code)) {
                log.push('接口模型 ' + m + ' 失败：' + (errMsg || ('' + JSON.stringify(j)).slice(0, 80)) + ' → 尝试下一模型');
                return tryOne();
              }
              log.push('接口 ' + m + ' 返回空内容，尝试下一模型');
              tryOne();
            } catch (e) { log.push('接口响应解析失败，尝试下一模型'); tryOne(); }
          },
          onerror: (e) => { log.push('接口请求失败：' + ((e && e.error) || '网络错误') + '，尝试下一模型'); tryOne(); }
        });
      }
      tryOne();
    });
  }

  let sfKeyModeLogged = false;
  // 统一入口：优先用用户自己的接口，失败（且开启兜底）时回退云端共享额度
  // extra: { prompt?, system? } — 逐项判断等场景覆盖默认提示词
  function callAI(stem, options, extra) {
    if (CFG.apiKey) {
      if (!sfKeyModeLogged) {
        const pn = (typeof providerById === 'function' ? providerById(CFG.apiProvider).name : '自定义接口');
        log.push('🔑 已用你自己的 Key 直连：' + pn + '（不经云端、免部署、密钥只存本机）');
        sfKeyModeLogged = true;
      }
      return callCustomAPI(stem, options, extra).then((r) => {
        if (r != null) return r;
        if (CFG.cloudFallback && CFG.sbAnon) {
          log.push('↩ 自定义接口未返回结果，回退云端共享额度');
          return callCloud(stem, options, extra);
        }
        return null;
      });
    }
    return callCloud(stem, options, extra);
  }

  // 云端通道（作者托管的共享额度）
  function callCloud(stem, options, extra) {
    if (!CFG.sbAnon) { log.push('⚠ 未配置云端 Anon Key（可在面板「AI接口 → 云端兜底」填写，或配置你自己的 Key）'); return Promise.resolve(null); }
    const optText = (options && options.length)
      ? options.map((o, i) => DomCore.optionLetter(i) + '. ' + o.text).join('\\n')
      : '';
    const prompt = (extra && extra.prompt) || (buildPrompt(stem, options) + '\\n/no_think');
    const system = (extra && extra.system) || CFG.aiSystem;

    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        log.push('⚠ 当前管理器不支持 GM_xmlhttpRequest');
        return resolve(null);
      }
      // 硬超时：GM_xmlhttpRequest 在请求挂起时既不回调 onload 也不回调 onerror，
      // 会导致 Promise.all(并行预取) 永远不 settle，scanAndAnswer 卡在 finally 之前、scanning 永为 true
      // —— 后续翻页补扫与"立即扫描"全部被 if(scanning) return 挡掉，表现为"答几页就卡死/白屏"。
      // 15s 兜底 reject→resolve(null)，保证无论如何都能释放 scanning。
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        log.push('⏱ 云端请求超时（15s），跳过本题（不影响其余题目与翻页补扫）');
        resolve(null);
      }, 15000);
      const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
      GM_xmlhttpRequest({
        method: 'POST',
        url: CFG.sbUrl + '/functions/v1/' + CFG.sbFn,
        headers: { 'Content-Type': 'application/json', 'apikey': CFG.sbAnon, 'Authorization': 'Bearer ' + CFG.sbAnon, 'x-func-token': CFG.funcToken },
        data: JSON.stringify({ stem: stem, options: (options || []).map((o) => o.text), model: CFG.aiModel, system: system, prompt: prompt, sfKey: CFG.sfKey || undefined }),
        onload: (resp) => {
          try {
            const j = JSON.parse(resp.responseText);
            if (j && j.answer != null) { finish(String(j.answer).trim()); }
            else if (j && j.error === 'unauthorized') { log.push('云端校验未通过（FUNC_TOKEN 不匹配），请检查配置或进群反馈'); finish(null); }
            else if (j && j.error) { log.push('云端返回错误：' + j.error + (j.detail ? '（' + j.detail + '）' : '') + (j.status ? ' [HTTP ' + j.status + ']' : '')); finish(null); }
            else { finish(null); }
          } catch (e) { log.push('云端响应解析失败'); finish(null); }
        },
        onerror: (e) => { log.push('云端请求失败：' + ((e && e.error) || '网络错误')); finish(null); },
      });
    });
  }

  function makeDraggable(el, handle) {
    if (!el || !handle) return;
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    handle.addEventListener('pointerdown', (e) => {
      // 仅当点中标题栏区域（手柄本身 / Logo / 标题文字 / 状态徽章）才发起拖拽；
      // 点中头部按钮（各自有 id，不在白名单内）时不拦截，保证按钮可点击
      const tid = (e.target && e.target.id) || '';
      const dragIds = ['uaa-title', 'uaa-logo', 'uaa-titletext', 'uaa-badge'];
      if (tid ? dragIds.indexOf(tid) < 0 : e.target !== handle) return;
      dragging = true;
      const rect = el.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      startX = e.clientX; startY = e.clientY;
      el.style.transition = 'none';
      el.style.right = 'auto';
      try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      let nx = origX + (e.clientX - startX);
      let ny = origY + (e.clientY - startY);
      const maxX = window.innerWidth - el.offsetWidth;
      const maxY = window.innerHeight - el.offsetHeight;
      nx = Math.max(0, Math.min(nx, Math.max(0, maxX)));
      ny = Math.max(0, Math.min(ny, Math.max(0, maxY)));
      el.style.left = nx + 'px';
      el.style.top = ny + 'px';
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      el.style.transition = 'opacity .2s';
      try { GM_setValue('uaa_panel_pos', JSON.stringify({ left: el.style.left, top: el.style.top })); } catch (_) {}
    }
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function loadPanelPos() {
    try {
      const p = JSON.parse(GM_getValue('uaa_panel_pos', 'null'));
      if (p && p.left && p.top) return p;
    } catch (_) {}
    return null;
  }

__UAA_UI_PANEL__
  function buildDiagnosticReport() {
    const out = [];
    const now = new Date().toLocaleString('zh-CN');
    const PW = (function(){ try { return window.unsafeWindow || window; } catch(_) { return window; } })();
    out.push('=== 🤖 AI 答题助手 · 诊断报告 ===');
    out.push('生成时间：' + now);
    out.push('页面URL：' + location.href);
    out.push('页面标题：' + (document.title || '?'));
    out.push('UA：' + navigator.userAgent);
    out.push('在线：' + (navigator.onLine ? '是' : '否') + '　视口：' + window.innerWidth + '×' + window.innerHeight);
    out.push('');
    out.push('--- CFG ---');
    try {
      const dump = {
        sbUrl: CFG.sbUrl,
        sbFn: CFG.sbFn,
        sbAnon: CFG.sbAnon ? CFG.sbAnon.slice(0,12) + '...(已截)' : '(空)',
        funcToken: CFG.funcToken ? '已配置' : '(空)',
        apiProvider: CFG.apiProvider,
        apiBase: CFG.apiBase,
        apiKey: CFG.apiKey ? maskKey(CFG.apiKey) + '（已配置，直连你自己的接口）' : '(空 → 题库 / 启发式 / 云端兜底)',
        cloudFallback: CFG.cloudFallback,
        sfKey: CFG.sfKey ? '已配置' : '(空)',
        aiModel: CFG.aiModel,
        autoFillEnabled: CFG.autoFillEnabled,
        modalWatch: CFG.modalWatch,
        repaintWatch: CFG.repaintWatch,
        harvestEnabled: CFG.harvestEnabled,
        speedPanelEnabled: CFG.speedPanelEnabled,
        forceSpeed: CFG.forceSpeed,
        stats: { scanned: STATS.scanned, ai: STATS.ai, bank: STATS.bank, guess: STATS.guess, miss: STATS.miss },
        userSpeed: CFG.userSpeed,
        speedChoices: CFG.speedChoices,
        fastVideoSpeed: CFG.fastVideoSpeed,
        stepSec: CFG.stepSec,
        showAllLogs: CFG.showAllLogs,
        heuristicFallback: CFG.heuristicFallback,
        localQBankSize: qcacheSize(),
        importedBankSize: bankImpSize(),
        bankFuzzy: CFG.bankFuzzy,
        bankFuzzyRatio: CFG.bankFuzzyRatio,
        accMultiItem: CFG.accMultiItem,
        accMedPrompt: CFG.accMedPrompt,
        accDualModel: CFG.accDualModel,
      };
      out.push(JSON.stringify(dump, null, 2));
    } catch(e) { out.push('(读取失败：'+e.message+')'); }
    out.push('');
    out.push('--- __XT__ (NCME SPA 状态) ---');
    try {
      const xt = window.__XT__;
      if (xt && typeof xt === 'object') {
        out.push('routePath：' + (xt.routePath || '?'));
        out.push('layout：' + (xt.layout || '?'));
        out.push('state.userInfo：' + (xt.state && xt.state.userInfo ? JSON.stringify(xt.state.userInfo).slice(0,200) : '(空)'));
      } else out.push('(无 window.__XT__)');
    } catch(e) { out.push('(读取失败：'+e.message+')'); }
    out.push('');
    out.push('--- 视频门禁判定 ---');
    try { out.push('isAntiDragFirstPass：' + (typeof isAntiDragFirstPass === 'function' ? isAntiDragFirstPass() : '(函数未定义)')); } catch(e) { out.push('isAntiDragFirstPass 异常：' + e.message); }
    try { out.push('detectVideoGate：' + (typeof detectVideoGate === 'function' ? detectVideoGate() : '(函数未定义)')); } catch(e) { out.push('detectVideoGate 异常：' + e.message); }
    out.push('');
    out.push('--- 视频元素 ---');
    try {
      const vids = Array.from(document.querySelectorAll('video'));
      out.push('总数：' + vids.length);
      vids.forEach((v, i) => {
        out.push('[#' + i + ']');
        try { out.push('  src：' + (v.src ? v.src.slice(0,120) : '(无)')); } catch(_) {}
        try { out.push('  currentTime：' + (typeof v.currentTime === 'number' ? v.currentTime.toFixed(2) + 's' : '?')); } catch(_) {}
        try { out.push('  duration：' + (isFinite(v.duration) ? v.duration.toFixed(2) + 's' : '未知/未就绪')); } catch(_) {}
        try { out.push('  paused：' + v.paused + '　 playbackRate：' + v.playbackRate + '　 muted：' + v.muted); } catch(_) {}
        try { out.push('  readyState：' + v.readyState + ' (0=无数据 1=元数据 2=当前帧 3=将来帧 4=充足)'); } catch(_) {}
        try { out.push('  networkState：' + v.networkState + ' (0=空 1=空闲 2=加载中 3=无源)'); } catch(_) {}
        try { out.push('  error：' + (v.error ? JSON.stringify({code:v.error.code, message:v.error.message}) : 'null')); } catch(_) {}
      });
      // 同源 iframe 内 video（某些平台把 video 塞进 iframe，会绕过 document.querySelector）
      try {
        const iframes = Array.from(document.querySelectorAll('iframe'));
        let n = 0;
        for (const fr of iframes) {
          try {
            const doc = fr.contentDocument || (fr.contentWindow && fr.contentWindow.document);
            if (!doc) continue;
            const iv = doc.querySelectorAll('video');
            for (let i=0; i<iv.length; i++) {
              const v = iv[i]; n++;
              out.push('[iframe video #' + n + ']　iframe src：' + (fr.src || '(空)'));
              out.push('  currentTime：' + (typeof v.currentTime === 'number' ? v.currentTime.toFixed(2) : '?') + 's　duration：' + (isFinite(v.duration) ? v.duration.toFixed(2) : '?') + 's');
              out.push('  paused：' + v.paused + '　 playbackRate：' + v.playbackRate);
            }
          } catch(_) {}
        }
        if (!n) out.push('(同源 iframe 内未找到 video)');
      } catch(_) {}
    } catch(e) { out.push('(读取失败：'+e.message+')'); }
    out.push('');
    out.push('--- 播放器宿主（页面级 window） ---');
    try { out.push('cc_js_Player：' + (PW && PW.cc_js_Player ? '存在' : '无')); } catch(_) {}
    try { out.push('icme_getLearningInfos：' + (PW && PW.icme_getLearningInfos ? '存在' : '无')); } catch(_) {}
    try { out.push('gotoExam / gotoExam4：' + (PW && PW.gotoExam ? 'gotoExam=yes' : 'gotoExam=no') + '　' + (PW && PW.gotoExam4 ? 'gotoExam4=yes' : 'gotoExam4=no')); } catch(_) {}
    out.push('');
    out.push('--- 全部日志 (' + log.length + ' 条) ---');
    log.forEach((s, i) => out.push('[' + String(i).padStart(3, '0') + '] ' + s));
    out.push('');
    out.push('=== END · 复制以上内容发给作者即可定位 ===');
    return out.join('\\n');
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  // 复制文本：优先现代 Clipboard API（https+用户手势），其次 GM_setClipboard，
  // 再次 execCommand 兜底，最后选中文本框提示用户手动 Ctrl+C。返回 true / 'manual' / false。
  async function copyText(t) {
    if (!t) return false;
    // 1) 现代 Clipboard API（ScriptCat / Chrome 在 https 页面 + 用户点击手势下可用）
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (_) {}
    // 2) 脚本管理器 API
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(t, 'text'); return true; } } catch (_) {}
    // 3) 传统 execCommand 兜底（部分站点 CSP 会禁，但多数页面可用）
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.top = '-9999px'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return true;
    } catch (_) {}
    // 4) 终极兜底：选中临时文本框，提示用户按 Ctrl+C
    try {
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed'; ta.style.top = '12px'; ta.style.left = '12px';
      ta.style.zIndex = '2147483647'; ta.style.width = '80%'; ta.style.height = '120px';
      document.body.appendChild(ta); ta.focus(); ta.select();
      setTimeout(() => { try { document.body.removeChild(ta); } catch (_) {} }, 5000);
      return 'manual';
    } catch (_) {}
    return false;
  }

  function demoAnswer(stem) {
    const s = String(stem || '');
    if (s.includes('首都是哪里')) return 'A';
    if (s.includes('哪些是水果')) return 'AC';
    if (s.includes('地球是太阳系')) return '正确';
    if (s.includes('化学分子式')) return 'H2O';
    return null;
  }

  function injectDemo() {
    if (document.getElementById('uaa-demo')) { log.push('演示题已存在（右侧面板）'); render(); return; }
    const wrap = document.createElement('div');
    wrap.id = 'uaa-demo';
    wrap.style.cssText = 'position:fixed;right:12px;top:12px;width:360px;max-height:80vh;overflow:auto;z-index:999998;background:#0f172a;color:#e2e8f0;font:13px/1.5 system-ui,sans-serif;border:1px solid #334155;border-radius:10px;padding:12px;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    wrap.innerHTML =
      '<div style="font-weight:bold;margin-bottom:8px">🧪 演示题（ScriptCat 自检 · 4 种题型）</div>' +
      '<fieldset style="margin:6px 0;border:1px solid #334155"><legend>1. 中国的首都是哪里？</legend>' +
      '<label><input type="radio" name="uaa_demo_r1"> 北京</label><br>' +
      '<label><input type="radio" name="uaa_demo_r1"> 上海</label><br>' +
      '<label><input type="radio" name="uaa_demo_r1"> 广州</label><br>' +
      '<label><input type="radio" name="uaa_demo_r1"> 深圳</label></fieldset>' +
      '<fieldset style="margin:6px 0;border:1px solid #334155"><legend>2. 以下哪些是水果？（多选）</legend>' +
      '<label><input type="checkbox" name="uaa_demo_c1"> 苹果</label><br>' +
      '<label><input type="checkbox" name="uaa_demo_c1"> 胡萝卜</label><br>' +
      '<label><input type="checkbox" name="uaa_demo_c1"> 香蕉</label><br>' +
      '<label><input type="checkbox" name="uaa_demo_c1"> 土豆</label></fieldset>' +
      '<fieldset style="margin:6px 0;border:1px solid #334155"><legend>3. 地球是太阳系中的一颗行星，对吗？</legend>' +
      '<label><input type="radio" name="uaa_demo_j1"> 正确</label><br>' +
      '<label><input type="radio" name="uaa_demo_j1"> 错误</label></fieldset>' +
      '<fieldset style="margin:6px 0;border:1px solid #334155"><legend>4. 水的化学分子式是____</legend>' +
      '<input type="text" name="uaa_demo_b1" style="width:200px"></fieldset>';
    document.body.appendChild(wrap);
    log.push('已注入 4 道演示题（右上角面板），开始扫描…');
  }

  // 收集所有可扫描根节点（document + 同源 iframe，含嵌套 iframe，递归下钻）
  // 超星学习通等内容页是 3~4 层 iframe 嵌套，真实题目/视频在最内层
  function collectScanRoots() {
    const roots = [];
    const seen = new Set();
    (function walk(doc, depth) {
      if (!doc || depth > 4 || seen.has(doc)) return;
      try { if (!doc.body) return; } catch (_) { return; }
      seen.add(doc);
      roots.push(doc);
      let frames = [];
      try { frames = Array.from(doc.querySelectorAll('iframe')); } catch (_) { return; }
      for (const f of frames) {
        try { walk(f.contentDocument, depth + 1); } catch (_) {} // 跨域 iframe 跳过
      }
    })(document, 0);
    return roots;
  }

  // 是否顶层窗口（iframe 内的脚本实例只负责扫描填答，不渲染面板/菜单/按钮，避免多窗口）
  let IS_TOP = true;
  try { IS_TOP = (window.top === window.self); } catch (_) { IS_TOP = false; }

  // ===== 机制：弹窗式一题一答（通用，任意平台）=====
  // 候选选择器表：新平台弹窗 class 不同时，往这里加一行即可被自动接管
  const MODAL_CANDIDATES = [
    '.pv-ask-modal-wrap',                         // 华医网/好医生
    '[class*="ask"][class*="modal"]',
    '[class*="quiz"][class*="modal"]',
    '[class*="exam"][class*="modal"]',
    '[class*="paper"][class*="modal"]',
    '[class*="modal"][class*="question"]',
    'dialog[open]',
    '[role="dialog"][aria-modal="true"]',
  ];

  function modalVisible(el) {
    if (!el) return false;
    if (el.classList && (el.classList.contains('pv-hide') || el.classList.contains('hidden'))) return false;
    try {
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') return false;
    } catch (_) {}
    return true;
  }

  // 查找当前可见的"答题弹窗"（含选项控件的弹窗元素）
  function findQuizModal() {
    for (let i = 0; i < MODAL_CANDIDATES.length; i++) {
      let nodes = [];
      try { nodes = document.querySelectorAll(MODAL_CANDIDATES[i]); } catch (_) { continue; }
      for (let j = 0; j < nodes.length; j++) {
        const m = nodes[j];
        if (!modalVisible(m)) continue;
        if (m.querySelector('input[type="radio"],input[type="checkbox"]')) return m;
      }
    }
    return null;
  }

  // 弹窗题干提取：平台特化选择器优先，通用兜底为"全文剔除选项文本取剩余"
  function extractModalStem(modal) {
    const qEl = modal.querySelector('.pv-ask-right, [class*="ask-title"], [class*="question-title"], [class*="q-title"]');
    if (qEl) {
      const t = qEl.textContent.trim();
      if (t.length >= 6) return t;
    }
    let text = modal.textContent || '';
    const ctrls = modal.querySelectorAll('input[type="radio"],input[type="checkbox"]');
    for (let i = 0; i < ctrls.length; i++) {
      const lbl = ctrls[i].parentElement ? ctrls[i].parentElement.textContent.trim() : '';
      if (lbl) text = text.split(lbl).join(' ');
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  let modalWatchActive = false;
  async function watchModalQuiz() {
    if (!CFG.modalWatch) return;       // 面板「答题」页可关闭
    if (modalWatchActive) return;
    modalWatchActive = true;

    // 关闭结果弹窗：平台专用类优先，通用兜底点关闭按钮
    function closeModal(modal) {
      try {
        if (modal.classList.contains('pv-ask-modal-wrap')) {
          modal.classList.add('pv-hide');
          modal.classList.remove('pv-ask-modal-answer');
          return;
        }
        const btn = modal.querySelector('[class*="close"], [aria-label*="关闭"], button');
        if (btn) btn.click();
      } catch (_) {}
    }

    const checkAndAnswer = async () => {
      const modal = findQuizModal();
      if (!modal) return;

      const mtext = modal.textContent || '';
      const isResult = modal.classList.contains('pv-ask-modal-answer')
        || !!modal.querySelector('.pv-right-icon')
        || mtext.indexOf('回答正确') >= 0
        || mtext.indexOf('回答错误') >= 0;
      // 结果弹窗：自动关闭继续下一题
      if (isResult) {
        log.push(mtext.indexOf('回答错误') >= 0 ? '❌ 弹窗答题结果：回答错误，继续重试' : '✅ 弹窗答题结果：回答正确');
        render();
        setTimeout(() => closeModal(modal), 1200);
        return;
      }

      if (modal.getAttribute('data-uaa-answering')) return; // 防重入
      modal.setAttribute('data-uaa-answering', '1');

      // 提取题干与选项
      const stem = extractModalStem(modal);
      if (!stem || stem.length < 4) { modal.removeAttribute('data-uaa-answering'); return; }
      const radios = modal.querySelectorAll('input[type="radio"]');
      const options = Array.from(radios).map((r) => ({
        value: r.value,
        text: (r.parentElement ? r.parentElement.textContent.trim() : r.value),
        el: r,
      }));

      log.push('🔍 [' + ts() + '] 弹窗检测到题目：' + stem.slice(0, 30) + '…（' + options.length + ' 个选项）');
      render();

      // 调用 AI
      let ans = null;
      if (CFG.sbAnon) {
        const raw = await callAI(stem, options);
        ans = raw == null ? null : DomCore.parseAIAnswer(raw, { type: 'choice', options: options });
      }
      if (ans == null || ans === '未知') {
        if (!CFG.sbAnon) {
          const d = demoAnswer(stem);
          if (d != null) ans = d;
        }
      }
      if (ans == null || ans === '未知') {
        log.push('⚠ 未能获取答案：' + stem.slice(0, 24) + '…');
        modal.removeAttribute('data-uaa-answering');
        render();
        return;
      }

      log.push('✓ [' + ts() + '] 答案：' + ans);
      render();

      // 点击对应选项（三段式：字母优先 → 判断词 → 选项文本兜底）
      if (CFG.autoFillEnabled) {
        const targets = pickOptionForAnswer(ans, options);
        if (targets && targets.length) {
          targets.forEach((t) => {
            try {
              DomCore.clickOption(t.el);
              log.push('已选择：' + (t.text || '').slice(0, 20));
            } catch (e) {
              log.push('点击选项异常：' + e.message);
            }
          });
        } else {
          log.push('⚠ 未能在选项中匹配答案：「' + ans + '」（选项：' + options.map((o) => (o.text || '').slice(0, 12)).join(' / ') + '）');
        }
      }
      modal.removeAttribute('data-uaa-answering');
      render();
    };

    // MutationObserver 监听弹窗 DOM 变化（节流：高频变化下最多 300ms 检查一次）
    let lastCheck = 0;
    const observer = new MutationObserver(() => {
      const now = Date.now();
      if (now - lastCheck < 300) return;
      lastCheck = now;
      checkAndAnswer();
    });
    try { observer.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    // 首次检查
    setTimeout(checkAndAnswer, 600);
    log.push('👀 弹窗答题监听已就绪（通用机制：任意平台弹出答题窗自动接管）');
  }

  // ===== 机制：内置答案表（通用，任意平台）=====
  // 部分平台把正确答案以隐藏域直接输出在前端 → 零 AI 调用、瞬时作答、100% 准确
  // 已知字段名模式表：新平台字段名不同时往这里加一行即可
  const ANSWER_TABLE_PATTERNS = [
    { ques: 'ques_list', key: 'key_list', radio: 'ques_' }, // 华医网/好医生 train.jsp
  ];

  function cssEscape(s) { try { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s); } catch (_) { return String(s); } }

  function parseTable(qv, kv) {
    const ids = String(qv || '').split(',').map((s) => s.trim()).filter(Boolean);
    const keys = String(kv || '').toUpperCase().split(',').map((s) => s.trim());
    if (ids.length === 0 || ids.length !== keys.length) return null;
    return { ids: ids, keys: keys };
  }

  // 通用探测：先试已知字段名模式；再兜底扫描所有 hidden 域——
  // 满足"字母答案序列 + 等长题号序列 + 存在 name 含题号的 radio"即命中（零配置接入新平台）
  function detectAnswerTable() {
    try {
      for (let i = 0; i < ANSWER_TABLE_PATTERNS.length; i++) {
        const p = ANSWER_TABLE_PATTERNS[i];
        const q = document.querySelector('input[name="' + p.ques + '"]');
        const k = document.querySelector('input[name="' + p.key + '"]');
        if (!q || !k) continue;
        const t = parseTable(q.value, k.value);
        if (t) { t.radio = p.radio; return t; }
      }
      const hiddens = document.querySelectorAll('input[type="hidden"]');
      let keyVals = null;
      for (let i = 0; i < hiddens.length; i++) {
        const v = String(hiddens[i].value || '').trim();
        if (/^[A-Ea-e](,[A-Ea-e])+$/.test(v)) { keyVals = v.toUpperCase().split(','); break; }
      }
      if (!keyVals) return null;
      for (let i = 0; i < hiddens.length; i++) {
        const h = hiddens[i];
        const ids = String(h.value || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.length !== keyVals.length || ids.length === 0) continue;
        if (ids.some((id) => id.length < 4 || /^[A-Ea-e]$/i.test(id))) continue; // 题号通常是较长的 ID
        if (document.querySelector('input[type="radio"][name*="' + cssEscape(ids[0]) + '"]')) {
          return { ids: ids, keys: keyVals, radio: '' };
        }
      }
      return null;
    } catch (_) { return null; }
  }

  // 题号对应的选项 radio：精确 name 优先（模式表），通用兜底 name 含题号
  function tableRadio(t, id, L) {
    let el = null;
    try { el = document.querySelector('input[name="' + (t.radio || '') + id + '"][value="' + L + '"]'); } catch (_) {}
    if (!el) { try { el = document.querySelector('input[type="radio"][name*="' + cssEscape(id) + '"][value="' + L + '"]'); } catch (_) {} }
    return el;
  }

  function tryFastKeyFill() {
    try {
      const t = detectAnswerTable();
      if (!t) return false;
      log.push('⚡ 极速模式：检测到页面内置答案表，共 ' + t.ids.length + ' 题，按顺序作答');
      let filled = 0;
      t.ids.forEach((id, i) => {
        const letters = (t.keys[i] || '').toUpperCase().replace(/[^A-Z]/g, '');
        if (!letters) { log.push('✗ 第' + (i + 1) + '题：无答案标记'); return; }
        let hit = false;
        for (const L of letters) {
          const el = tableRadio(t, id, L);
          if (el) { if (!el.checked) el.click(); hit = true; }
        }
        if (hit) { filled++; log.push('✓ 第' + (i + 1) + '题 答案：' + letters); }
        else log.push('✗ 第' + (i + 1) + '题：未匹配到选项 ' + letters);
      });
      log.push('⚡ 作答完成：' + filled + '/' + t.ids.length + ' 题，请核对后点「提交考卷」');
      return filled > 0;
    } catch (_) { return false; }
  }

  // ===== 反调试守卫（通用）=====
  // 任意平台若覆写 document.querySelector（常见反调试手段，会导致脚本自身查询失效），
  // 检测到覆写即恢复原生实现并冻结，后续覆写将静默失效
  (function guardQS() {
    let qsGuarded = false;
    let timer = null;
    function check() {
      if (qsGuarded) return;
      try {
        if (document.querySelector !== Document.prototype.querySelector) {
          const protoQS = Document.prototype.querySelector;
          Object.defineProperty(document, 'querySelector', {
            value: function (s) { return protoQS.call(document, s); },
            writable: false, configurable: false,
          });
          log.push('🛡 已拦截页面对 querySelector 的反调试覆写');
          qsGuarded = true;
          if (timer) clearInterval(timer);
        }
      } catch (_) { qsGuarded = true; if (timer) clearInterval(timer); }
    }
    check();
    // 覆写可能发生在页面脚本执行过程中：前 30 秒持续监测
    let n = 0;
    timer = setInterval(() => { check(); if (++n > 60) clearInterval(timer); }, 500);
  })();

  // ===== 机制：视频门禁速学（通用，任意平台）=====
  function pageWindow() { return (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window; }

  // 播放器 profile 注册表：新平台的播放器接口不同时往这里加一条
  // 字体加密检测：题干文本含 Unicode 私有区字符（PUA），说明平台用私有字体把文字渲染成乱码
  function detectFontObfuscation() {
    try {
      const el = document.body;
      const txt = (el && (el.innerText || el.textContent)) || '';
      return /[\uE000-\uF8FF]/.test(txt);
    } catch (_) { return false; }
  }

  // 播放器宿主特征（SPA 异步渲染：<video> 尚未出现时，用播放器 SDK / 资源域名预判）
  // 典型：NCME 的博科云 H5 播放器 h5player-3.6.2.js（m-flare.bokecc.com）+ hls.js 拉 .ts 分片
  // 注意：只扫描「外部脚本 src」，绝不扫描整页 outerHTML —— 否则脚本自身源码（含 bokecc/hls.js 等字样）
  // 被注入为 <script> 文本时会自我匹配，造成误判（测试环境常见）。
  function hasPlayerHostSignature() {
    try {
      const scripts = document.scripts || [];
      for (const s of scripts) {
        const src = s.src || '';
        if (/bokecc\\.com|h5player|csslcloud|hls\\.(js|min\\.js)/i.test(src)) return true;
      }
    } catch (_) {}
    // 已知播放器 SDK 注入的全局对象（不含脚本内联文本，避免误匹配自身源码）
    try {
      const PW = pageWindow();
      if (PW && (PW.H5Player || PW.ccVideoConfig || PW.PlayerSDK || PW.CC_VIDEO)) return true;
    } catch (_) {}
    return false;
  }

  // 路由线索：Nuxt 等 SPA 在 SSR 阶段就内联了路由（如 NCME 的 window.__XT__.routePath='/player/record'），
  // 即使 <video> 尚未由客户端渲染，也能立即识别为视频播放页
  function hasPlayerRouteHint() {
    try {
      const xt = pageWindow().__XT__;
      if (xt && typeof xt.routePath === 'string' && /\\/(player|study|course|record|learn|media|video)\\b/i.test(xt.routePath)) return true;
    } catch (_) {}
    return false;
  }

  // 反拖拽第一遍：NCME 等平台"第一遍学习未完成部分禁止拖动进度"，此时跳拖无效且无法上报真实进度。
  // 仅按域名判定（ncme.org.cn）：避免扫描页面文本时把脚本自身源码里含的"禁止拖"等字样误匹配（测试环境脚本以 <script> 文本存在于 DOM）。
  function isAntiDragFirstPass() {
    try { if (/ncme\\.org\\.cn/i.test(location.host)) return true; } catch (_) {}
    return false;
  }

  const PLAYER_PROFILES = [
    { name: 'CC 播放器',
      find: (PW) => (PW && PW.cc_js_Player) || null,
      seek: (p, t) => { if (p.jumpToTime) p.jumpToTime(t); else if (p.seek) p.seek(t); } },
    // HTML5 / VideoJS（超星学习通、NCME 博科云 H5Player 等）：底层均为原生 <video> + hls.js
    { name: 'HTML5 / VideoJS 视频',
      find: () => {
        // 优先页面主文档，再回退到同源 iframe 内（防止某些平台把 video 塞进 iframe 而 querySelector 漏找）
        try {
          const top = document.querySelector('video');
          if (top) return top;
        } catch(_) {}
        try {
          const frs = document.querySelectorAll('iframe');
          for (const fr of frs) {
            try {
              const doc = fr.contentDocument || (fr.contentWindow && fr.contentWindow.document);
              if (!doc) continue;
              const v = doc.querySelector('video');
              if (v) return v;
            } catch(_) {}
          }
        } catch(_) {}
        return null;
      },
      seek: (p, t) => { try { p.currentTime = t; } catch (_) {} },
      keepAlive: true, nextBtn: '#prevNextFocusNext, .prevNext, a[title*="下一节"], .nextButton' },
  ];

  // 视频门禁页探测（通用）：有播放器 + 有"看完才能考试"的门禁特征（不限域名）
  function detectVideoGate() {
    const PW = pageWindow();
    let hasPlayer = false;
    for (let i = 0; i < PLAYER_PROFILES.length; i++) {
      try { if (PLAYER_PROFILES[i].find(PW)) { hasPlayer = true; break; } } catch (_) {}
    }
    if (!hasPlayer && hasPlayerHostSignature()) hasPlayer = true;
    const hasContainer = !!document.getElementById('playerContainer') || hasPlayerRouteHint();
    if (!hasPlayer && !hasContainer) return false;
    let gated = false;
    try { gated = typeof PW.gotoExam === 'function' || typeof PW.gotoExam4 === 'function'; } catch (_) {}
    if (!gated && hasContainer) gated = true;
    if (!gated && /study\\d*\\.jsp/i.test(location.pathname)) gated = true;
    if (!gated) {
      const bt = (document.body && document.body.textContent) || '';
      gated = /本节考试|进入考试|开始考试|课后测试|随堂测验|学完本节/.test(bt);
    }
    if (!gated) {
      // 超星等：有视频播放器 + 存在「下一节」按钮（看完视频才能进下一节）即视为视频门禁
      const hasNext = !!document.querySelector('#prevNextFocusNext, .prevNext, a[title*="下一节"]');
      if (hasNext && hasPlayer) gated = true;
    }
    return gated;
  }

  function getVideoTotal(PW, player) {
    try { if (PW.icme_getLearningInfos) { const t = parseInt(PW.icme_getLearningInfos().totalTime, 10); if (t > 0) return t; } } catch (_) {}
    try { if (player && player.getDuration) { const t = parseInt(player.getDuration(), 10); if (t > 0) return t; } } catch (_) {}
    try { if (player && isFinite(player.duration) && player.duration > 0) return Math.round(player.duration); } catch (_) {}
    try {
      const html = document.documentElement.outerHTML;
      const m = html.match(/totalTime['"]?\\s*[:=]\\s*['"]?(\\d+)/) || html.match(/total_time\\s*=\\s*['"]?(\\d+)/);
      if (m) { const t = parseInt(m[1], 10); if (t > 0) return t; }
    } catch (_) {}
    return 0;
  }

  // 视频中途弹窗小测跳过（平台中断清除器：t_box_N + keep() 恢复播放，其他平台可在此扩展）
  function dismissPopupQuiz(PW) {
    try {
      const boxes = document.querySelectorAll('[id^="t_box_"]');
      for (const b of boxes) {
        if (b.style && b.style.display === 'none') continue;
        const m = String(b.id).match(/^t_box_(\\w+)$/);
        if (m && typeof PW.keep === 'function') { PW.keep(m[1]); log.push('⚡ 已跳过视频中途弹窗题 #' + m[1]); render(); return true; }
      }
    } catch (_) {}
    return false;
  }

  let fastVideoRunning = false;
  async function fastLearnVideo() {
    if (fastVideoRunning) { log.push('速学已在进行中…'); render(); return; }
    fastVideoRunning = true;
    try {
      const PW = pageWindow();
      log.push('⚡ 速学模式启动：等待播放器就绪…'); render();
      let profile = null, player = null;
      for (let i = 0; i < 60 && !player; i++) {
        for (let j = 0; j < PLAYER_PROFILES.length; j++) {
          try { const p = PLAYER_PROFILES[j].find(PW); if (p) { profile = PLAYER_PROFILES[j]; player = p; break; } } catch (_) {}
        }
        if (!player) { dismissPopupQuiz(PW); await sleep(1000); }
      }
      if (!player) { log.push('✗ 未检测到可用的视频播放器；若视频仍在加载请稍后再试（按面板顶部 📋复制日志 把诊断报告发给作者）'); render(); return; }
      // 速学固定 CFG.fastVideoSpeed×（不受面板 CFG.userSpeed 影响：秒过模式独立）
      const natural = isAntiDragFirstPass();
      log.push('🔧 模式判定：反拖拽=' + (natural ? '是' : '否') + '　速学倍率=' + CFG.fastVideoSpeed + '×' + (CFG.fastVideoSpeed > 16 ? '（帧步进）' : '（纯倍速）')); render();
      applyUserSpeed(); // 由中心化倍速接管（CFG.fastVideoSpeed×）抢回控制权，覆盖博科云等播放器的内部重置
      try { log.push('🔍 player 状态：paused=' + player.paused + '　duration=' + (isFinite(player.duration)?player.duration.toFixed(2)+'s':'未知/未就绪') + '　playbackRate=' + player.playbackRate + '　readyState=' + (player.readyState||'?')); } catch(e) {}
      // keepAlive：暂停则续播（倍速由 applyUserSpeed 中心化接管维持，这里只负责续播）
      const kaTimer = setInterval(() => {
        try { if (player.paused) player.play(); } catch (_) {}
      }, 1500);
      const total = getVideoTotal(PW, player);
      log.push('⚡ 已接入播放器（' + profile.name + ' · ' + CFG.fastVideoSpeed + '倍速，总时长 ' + (total || '未知') + ' 秒）'); render();
      dismissPopupQuiz(PW);
      if (natural) {
        if (CFG.fastVideoSpeed > 16) {
          // 帧步进：绕过浏览器 playbackRate 16× 硬上限，实现 1000× 体感。
          // 每帧只推 CFG.stepSec 秒（默认 6s，远小于反拖拽"禁止拖动"阈值），且非用户主动拖拽，
          // 浏览器 timeupdate 连续触发，平台 uploadStudyRecord 收到的播放区间完整 → 不被判为拖拽。
          log.push('⚡ 检测到反拖拽门禁：启用帧步进 ' + CFG.fastVideoSpeed + '× 速学（每帧推 ' + CFG.stepSec + 's，不跳进度），请稍候…'); render();
          try { if (player.play) player.play(); } catch (_) {}
          let waited = 0, lastLog = 0;
          while (waited < 3600000) {
            await sleep(50); waited += 50;
            try { if (player.paused) player.play(); } catch (_) {}
            try {
              const dur = player.duration;
              if (isFinite(dur) && dur > 0) player.currentTime = Math.min(dur - 0.5, player.currentTime + CFG.stepSec);
            } catch (_) {}
            dismissPopupQuiz(PW);
            lastLog += 50;
            if (lastLog >= 2000) {
              lastLog = 0;
              const ct = player.currentTime || 0, dur = (isFinite(player.duration) && player.duration > 0) ? player.duration.toFixed(0) : '?';
              log.push('⏩ 帧步进进度：' + ct.toFixed(1) + 's / ' + dur + 's'); render();
            }
            try { if (player.ended || (player.duration && isFinite(player.duration) && player.currentTime >= player.duration - 1)) break; } catch (_) {}
          }
          // 收尾：等待真正 ended（最多 6s）
          try { for (let k = 0; k < 12 && !player.ended; k++) { try { if (player.paused) player.play(); } catch (_) {} await sleep(500); } } catch (_) {}
        } else {
          // 反拖拽平台（如 NCME 第一遍学习禁拖）：禁止跳进度，16× 自然播放至结束，
          // 让平台 uploadStudyRecord 收到真实观看进度后判定"已学完"
          log.push('⚡ 检测到反拖拽门禁：改为 16× 自然播完（不跳进度），请稍候…'); render();
          try { if (player.play) player.play(); } catch (_) {}
          let waited = 0, lastT = -1, stall = 0, logTick = 0;
          while (waited < 3600000) {
            await sleep(3000); waited += 3000;
            try { if (player.paused) player.play(); } catch (_) {} // 倍速由 applyUserSpeed 中心化维持
            const ct = (player.currentTime || 0);
            // 每 10 秒打印一次进度（便于用户看到推进；若毫无动静也能在第一时间察觉）
            logTick++;
            if (logTick % 4 === 0) {
              const dur = (isFinite(player.duration) && player.duration > 0) ? player.duration.toFixed(0) : '?';
              log.push('⏳ 自然播放进度：' + ct.toFixed(1) + 's / ' + dur + 's（' + Math.round(waited/1000) + 's 已等）'); render();
            }
            if (ct <= lastT + 0.05) { stall++; } else { stall = 0; lastT = ct; }
            dismissPopupQuiz(PW);
            try { if (player.ended || (player.duration && isFinite(player.duration) && player.duration > 0 && ct >= player.duration - 2)) break; } catch (_) {}
            if (stall >= 4) { log.push('⚠ 连续 12 秒播放进度无推进（可能环境不支持播放或已暂停），速学已自动终止。可按面板顶部 📋复制日志 发给作者排查'); render(); break; }
          }
          // 收尾：等待真正 ended（最后 2s 已播，16× 下约 0.1s 即触发；若曾暂停则续播等待，最多 6s）
          try {
            for (let k = 0; k < 12 && !player.ended; k++) {
              try { if (player.paused) player.play(); } catch (_) {}
              await sleep(500);
            }
          } catch (_) {}
        }
      } else {
        const jump = Math.max(0, (total || 0) - 2);
        log.push('⏭ 跳至结尾：' + jump + 's（total=' + total + '）'); render();
        try { if (player.pause) player.pause(); } catch (_) {}
        await sleep(200);
        let seekBefore = -1, seekAfter = -1;
        try { seekBefore = player.currentTime; } catch(_) {}
        try { profile.seek(player, jump); } catch (e) { log.push('⚠ seek 异常：' + e.message); render(); }
        await sleep(400);
        try { seekAfter = player.currentTime; } catch(_) {}
        if (seekBefore >= 0 && seekAfter >= 0) {
          log.push('🔍 seek 结果：' + seekBefore.toFixed(2) + 's → ' + seekAfter.toFixed(2) + 's（' + (Math.abs(seekAfter - jump) < 1 ? '成功' : '未生效（可能平台禁用 seek）') + '）'); render();
        }
        try { if (player.play) player.play(); } catch (_) {}
        await sleep(2500);
      }
      // 完成判定（CC 链：localStorage[see] / questionIsOk；HTML5 由 ended 事件自然完成）
      const isDone = () => {
        try { if ((PW.see && String(localStorage.getItem(PW.see)) === '1') || PW.questionIsOk === true) return true; } catch (_) {}
        try { if (player.ended || (player.duration && isFinite(player.duration) && player.currentTime >= player.duration - 1)) return true; } catch (_) {}
        return false;
      };
      if (!isDone()) {
        if (typeof PW.on_CCH5player_ended === 'function') {
          log.push('⚡ 未收到自然播完回调，直接触发页面完成链…'); render();
          try { PW.on_CCH5player_ended(PW, 'uaa'); } catch (e) { log.push('完成回调异常：' + e.message); }
        } else {
          log.push('⚡ 未检测到播完回调，按进度判定（若平台要求真实观看时长，请改用正常倍速播放）'); render();
        }
        await sleep(1500);
      }
      dismissPopupQuiz(PW);
      if (kaTimer) { try { clearInterval(kaTimer); } catch (_) {} }
      if (isDone()) {
        log.push('✅ 本节视频已学完（完成标记已写入，服务器已收到上报）'); render();
        if (profile.nextBtn) {
          const nb = document.querySelector(profile.nextBtn);
          if (nb) { log.push('➡️ 自动进入下一节（连刷）…'); render(); try { nb.click(); } catch (_) {} return; }
        }
        // 超星等带 gotoExam 全局函数时优先用平台原生跳转；否则走通用考试入口衔接（NCME 等）
        if (typeof PW.gotoExam === 'function') { try { PW.gotoExam(); } catch (_) {} }
        else if (typeof PW.gotoExam4 === 'function') { try { PW.gotoExam4(); } catch (_) {} }
        else { log.push('➡️ 本节视频已学完，准备进入考试…'); render(); await gotoCourseExam(); }
      } else {
        log.push('⚠ 未能确认完成状态：请点页面「本节考试」验证；若提示未学完，让视频正常播放几秒后再点速学重试'); render();
      }
    } finally { fastVideoRunning = false; applyUserSpeed(); }
  }

  // —— 倍速强制接管（核心修复）——
  // 博科云 H5Player(h5player-3.6.2.js)、超星等播放器会在内部把 video.playbackRate
  // 改回自身状态（如 1×），导致外部设置「没有效果」。这里用两层兜底抢回控制权：
  //   1) ratechange 事件守卫：播放器一改倍速，立即抢回目标倍速（仅在「不同」时设置，无热循环）；
  //   2) 短间隔轮询（500ms）：作为 ratechange 未触发的兜底。
  const _rateState = { target: null, timer: null, bound: (typeof WeakSet !== 'undefined' ? new WeakSet() : null) };
  function enforceRateOn(v) {
    const target = _rateState.target;
    if (target == null) return;
    try {
      // 强制接管倍速：覆盖 video.playbackRate 的 setter，使博科云 H5Player 等"内部把倍速改回 1×"的播放器失效。
      // 原理：播放器内部每次想设回 1× 时，被我们的 setter 静默转成目标倍速（native 真正以目标倍速播放）；
      // getter 始终返回原生真实值，保证目标倍速变化时能正确重新同步。
      if (_rateState.bound && !_rateState.bound.has(v)) {
        _rateState.bound.add(v);
        try {
          const proto = (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype) ? HTMLMediaElement.prototype : null;
          const nativeDesc = proto ? Object.getOwnPropertyDescriptor(proto, 'playbackRate') : null;
          const nativeGet = (nativeDesc && typeof nativeDesc.get === 'function') ? nativeDesc.get : null;
          const nativeSet = (nativeDesc && typeof nativeDesc.set === 'function') ? nativeDesc.set : null;
          if (nativeSet) {
            v.__uaaRateOwn = true;
            Object.defineProperty(v, 'playbackRate', {
              configurable: true,
              get() { try { return nativeGet ? nativeGet.call(v) : _rateState.target; } catch (_) { return _rateState.target; } },
              set(val) { try { nativeSet.call(v, _rateState.target); } catch (_) {} }
            });
          }
        } catch (_) {}
        // 兜底：ratechange 事件守卫（仅当 setter 覆盖未生效时，作为最后一道防线）
        try {
          v.addEventListener('ratechange', () => {
            if (_rateState.target != null && v.playbackRate !== _rateState.target) {
              try { v.playbackRate = _rateState.target; } catch (_) {}
            }
          });
        } catch (_) {}
      }
      // 立即同步一次原生倍速（setter 覆盖生效时已由 setter 锁死；未覆盖时这里直接生效）
      try { if (v.playbackRate !== target) v.playbackRate = target; } catch (_) {}
    } catch (_) {}
  }
  // 关闭"强制接管倍速"：清 timer、撤销 setter 覆盖，把倍速控制权交还播放器
  function releaseRateGuard() {
    _rateState.target = null;
    if (_rateState.timer) { clearInterval(_rateState.timer); _rateState.timer = null; }
    try {
      document.querySelectorAll('video').forEach((v) => {
        try { if (v.__uaaRateOwn) { delete v.playbackRate; delete v.__uaaRateOwn; } } catch (_) {}
      });
    } catch (_) {}
    // 重建 WeakSet：否则重新开启时 enforceRateOn 认为"已绑定过"而跳过，setter 覆盖装不回去
    _rateState.bound = (typeof WeakSet !== 'undefined' ? new WeakSet() : null);
  }
  // 应用当前目标倍速到页面所有 video（实时生效：新插入的 video 由 ratechange 守卫 + 轮询自动接管）
  function applyUserSpeed() {
    // 开关关闭时交还控制权（面板「视频」页可切）
    if (!CFG.forceSpeed && !fastVideoRunning) { releaseRateGuard(); return; }
    // 速学模式下目标倍速为 CFG.fastVideoSpeed×；>16 时仅靠 playbackRate 会被浏览器 clamp 到 16×，
    // 故 fastLearnVideo 内对反拖拽平台同时启用帧步进（currentTime 推进）实现 1000× 体感
    _rateState.target = fastVideoRunning ? CFG.fastVideoSpeed : CFG.userSpeed;
    if (!_rateState.timer) {
      _rateState.timer = setInterval(() => {
        try { document.querySelectorAll('video').forEach(enforceRateOn); } catch (_) {}
      }, 500);
    }
    try { document.querySelectorAll('video').forEach(enforceRateOn); } catch (_) {}
  }

  // 倍速选择面板：1×/2×/3×/5× 四档，持久化；点击实时应用到所有 video
  function ensureSpeedPanel() {
    if (!CFG.speedPanelEnabled) return;
    if (document.getElementById('uaa-speed-panel')) return;
    const wrap = document.createElement('div');
    wrap.id = 'uaa-speed-panel';
    Object.assign(wrap.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: '999998',
      display: 'flex', gap: '6px', alignItems: 'center',
      padding: '8px 10px', borderRadius: '999px',
      background: 'rgba(15,23,42,.85)', color: '#fff',
      font: 'bold 12px system-ui,sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,.3)',
    });
    const label = document.createElement('span');
    label.textContent = '▶ 倍速';
    label.style.opacity = '0.85';
    wrap.appendChild(label);
    const buttons = CFG.speedChoices.map((sp) => {
      const b = document.createElement('button');
      b.textContent = sp + '×';
      b.dataset.speed = String(sp);
      Object.assign(b.style, {
        padding: '4px 10px', border: 'none', borderRadius: '999px', cursor: 'pointer',
        font: 'bold 12px system-ui,sans-serif', transition: 'all .15s',
      });
      b.onmouseenter = () => { if (!b.classList.contains('active')) b.style.background = '#475569'; };
      b.onmouseleave = () => { if (!b.classList.contains('active')) b.style.background = '#334155'; };
      b.onclick = () => {
        CFG.userSpeed = sp;
        GM_setValue('uaa_user_speed', sp);
        applyUserSpeed();
        refreshSpeedBtns();
        log.push('▶ 倍速已切换为 ' + sp + '×');
        render();
      };
      wrap.appendChild(b);
      return b;
    });
    function refreshSpeedBtns() {
      for (const b of buttons) {
        const on = +b.dataset.speed === CFG.userSpeed;
        b.classList.toggle('active', on);
        b.style.background = on ? '#ec4899' : '#334155';
        b.style.color = on ? '#fff' : '#e2e8f0';
      }
    }
    refreshSpeedBtns();
    document.body.appendChild(wrap);
    // 实时接管新增 video（页面切换/播放器延迟加载）
    try {
      // 节流：NCME 等 Vue SPA 每帧大量 DOM 变更，若不加节流会每变更一次全文档 querySelectorAll('video')，
      // 主线程被拖垮导致页面白屏。改为最多每 1s 应用一次倍速。
      let _spLast = 0;
      new MutationObserver(() => {
        const n = Date.now();
        if (n - _spLast < 1000) return;
        _spLast = n;
        applyUserSpeed();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
    applyUserSpeed();
  }

  // 秒过按钮（视频门禁页通用）：跳到尾 16× 触发完成上报 + 自动进考试/下一节
  function ensureFastVideoButton() {
    if (document.getElementById('uaa-fastvideo-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'uaa-fastvideo-btn';
    btn.textContent = '⚡ 秒过';
    btn.title = '跳至视频结尾 16× 触发平台完成上报（不影响默认倍速）';
    Object.assign(btn.style, {
      position: 'fixed', right: '16px', bottom: '60px', zIndex: '999999',
      padding: '8px 16px', border: 'none', borderRadius: '999px', cursor: 'pointer',
      background: 'linear-gradient(135deg,#6366f1,#ec4899)', color: '#fff',
      font: 'bold 13px system-ui,sans-serif', boxShadow: '0 6px 18px rgba(0,0,0,.35)',
    });
    btn.onclick = () => fastLearnVideo();
    document.body.appendChild(btn);
  }

  // ===== 机制：视频学完自动衔接考试（NCME 等反拖拽平台）=====
  // 超星靠 nextBtn / gotoExam 连刷；NCME 视频页目录只有视频单元、无考试入口，也无 gotoExam 全局，
  // 故由本函数主动在视频学完后定位并进入本节考试（也可手动点菜单「📋 去本节考试」）。
  function findExamEntry() {
    try {
      if (CFG.examEntrySelector) {
        const el = document.querySelector(CFG.examEntrySelector);
        if (el) return el;
      }
      if (CFG.examEntryUrl) return { __goto: CFG.examEntryUrl };
      const examText = /考试|测验|答题|课后|随堂|考核|测评|练习/;
      const examHref = /qbank|exam|paper|test|kaoshi|assess|assessment|exercise|[/]do[/]/i;
      const nodes = document.querySelectorAll('a,button,[role="button"]');
      const hits = [];
      for (const n of nodes) {
        const txt = (n.textContent || '').trim();
        const href = (n.getAttribute && (n.getAttribute('href') || n.getAttribute('data-href'))) || '';
        if (!txt || txt.length > 30) continue;
        if (examText.test(txt)) hits.push({ el: n, score: (examHref.test(href) ? 2 : 0) + 1, txt });
        else if (examHref.test(href) && /do|paper|exam/i.test(href)) hits.push({ el: n, score: 1, txt });
      }
      if (!hits.length) return null;
      hits.sort((a, b) => b.score - a.score);
      return hits[0].el;
    } catch (_) { return null; }
  }

  function findCourseBackLink() {
    try {
      const backKeys = /返回|课程|学习中心|我的课程|上一页|back|course|study/i;
      const nodes = document.querySelectorAll('a,button,[role="button"]');
      for (const n of nodes) {
        const txt = (n.textContent || '').trim();
        const href = (n.getAttribute && (n.getAttribute('href') || n.getAttribute('data-href'))) || '';
        if ((backKeys.test(txt) && txt.length < 20) || (/[/](course|study|project|detail|my)/i.test(href) && !/player[/]record/.test(href))) return n;
      }
    } catch (_) {}
    return null;
  }

  async function gotoCourseExam() {
    if (!CFG.autoGotoExam) { log.push('ℹ️ 已关闭"视频学完自动去考试"（菜单可重新开启）'); render(); return; }
    log.push('➡️ 正在定位本节考试入口…'); render();
    let entry = findExamEntry();
    if (!entry) {
      const back = findCourseBackLink();
      if (back) {
        log.push('↩️ 当前视频页无考试入口，返回课程页再定位…'); render();
        try { back.click(); } catch (_) {}
        // 等待课程页（非视频页）渲染后重试扫描考试入口
        for (let i = 0; i < 20; i++) {
          await sleep(1000);
          if (location.href.indexOf('player/record') === -1) { const e2 = findExamEntry(); if (e2) { entry = e2; break; } }
        }
      }
    }
    if (!entry) {
      log.push('⚠ 未自动找到本节考试入口：请手动进入，或把考试按钮 HTML/链接发我以精确适配；也可点菜单「📋 去本节考试」手动触发'); render();
      return;
    }
    if (entry.__goto) { log.push('➡️ 跳转直达考试地址：' + entry.__goto); render(); try { location.href = entry.__goto; } catch (_) {} return; }
    log.push('➡️ 自动进入考试：' + ((entry.textContent || '').trim().slice(0, 20)) + ' …'); render();
    try { entry.click(); } catch (_) {}
    // SPA 客户端导航时 boot 不会重跑：兜底轮询考试页 DOM，出现后启动自动答题
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      if (document.querySelector('.qItem, .qbank, input[type=radio], input[type=checkbox], .topic, .question, [class*="question"], [class*="exam"]')) {
        log.push('📝 检测到考试页，启动自动答题…'); render();
        try { scanAndAnswer(); } catch (_) {}
        try { watchExamRepaint(); } catch (_) {}
        break;
      }
    }
  }

  // ===== 机制：未完成课程自动遍历（ncme 等"我的课程"列表页）=====
  // 扫描列表项中标记"未完成 / 未学完 / 未通过"的卡片，找其"进入学习 / 继续学习"按钮，
  // 自动点击进入第一个未完成课程。点击后页面跳转 → 由视频/答题机制接管完成本课程；
  // 完成后回到本页面再次扫描 → 自动完成下一未完成课程，直到清空。
  function detectUnfinishedCourse() {
    try {
      // 通用候选选择器：任意带课程入口的元素
        const cardSelectors = [
          '.course-card', '.course-item', '.lesson-item', '.task-item',
          '[class*="course"]', '[class*="lesson"]', '[class*="chapter"]',
          'li[class*="course"]', '.list-item', '.card', 'li',
        ];
        // 状态关键词：未完成 / 未学完 / 未通过 / 未考试 / 进度为 0
        const unfinishedKeys = /未完成|未学完|未通过|未考试|未达标|未观看|在学|进行中|未结业|未领取|not[\s_-]?finished|unfinished|incomplete|进度.*0%|\b0\s*%|状态.*未|待学习|待考试|学习中/;
        // 入口按钮关键词：进入学习 / 继续学习 / 开始学习 / 去学习 / 学习
        const entryKeys = /进入学习|继续学习|开始学习|去学习|马上学习|去完成|学\s*习|开始\s*考试|进入考试|学习\s*课程|go\s*study|learn/;
        const entrySel = 'a, button';

        for (const sel of cardSelectors) {
          const cards = document.querySelectorAll(sel);
          if (!cards.length) continue;
          for (const card of cards) {
            const text = (card.textContent || '').trim();
            if (text.length < 4 || text.length > 800) continue;
            if (!unfinishedKeys.test(text)) continue;
            // 在该卡片内找"进入学习"按钮
            let entry = null;
            const candidates = card.querySelectorAll(entrySel);
            for (const c of candidates) {
              const ct = (c.textContent || '').trim();
              if (entryKeys.test(ct)) { entry = c; break; }
              // 兜底：包含"学习"二字且非状态文字
              if (/学\s*习/.test(ct) && !unfinishedKeys.test(ct) && ct.length < 30) { entry = c; break; }
            }
            if (entry) return { card, entry, label: text.slice(0, 60) };
          }
        }
        return null;
      } catch (_) { return null; }
  }

  let autoCourseRunning = false;
  async function autoCompleteMyCourses() {
    if (autoCourseRunning) { log.push('自动完成已在进行中…'); render(); return; }
    autoCourseRunning = true;
    try {
      const found = detectUnfinishedCourse();
      if (!found) {
        log.push('✅ 未发现"未完成"课程（可能已全部学完或当前页不是课程列表）');
        render();
        return;
      }
      log.push('📋 发现未完成课程：' + found.label + ' → 自动进入学习…');
      render();
      await sleep(300);
      try { found.entry.click(); } catch (e) { log.push('点击入口失败：' + e.message + '，3 秒后重试'); render(); await sleep(3000); return; }
    } finally { autoCourseRunning = false; }
  }

  function ensureCourseAutoBtn() {
    if (document.getElementById('uaa-coursectrl-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'uaa-coursectrl-btn';
    btn.textContent = '📋 自动完成未完成课程';
    btn.title = '扫描当前"我的课程"页所有未完成课程，依次自动进入学习（视频→考试→下一门），直到清空';
    Object.assign(btn.style, {
      position: 'fixed', right: '16px', bottom: '104px', zIndex: '999999',
      padding: '10px 18px', border: 'none', borderRadius: '999px', cursor: 'pointer',
      background: 'linear-gradient(135deg,#10b981,#0ea5e9)', color: '#fff',
      font: 'bold 13px system-ui,sans-serif', boxShadow: '0 6px 18px rgba(0,0,0,.35)',
    });
    btn.onclick = () => autoCompleteMyCourses();
    document.body.appendChild(btn);
  }

  let scanning = false;
  async function scanAndAnswer() {
    if (scanning) return; // 防重入：避免重复扫描/重复作答
    scanning = true;
    try {
    const adapter = DomCore.getAdapterForUrl(location.href);
    const mode = (adapter && adapter.universal) ? '通用扫描(任意网站)' : (adapter ? adapter.name : '未知');

    // ⚡ 极速模式优先（机制：内置答案表）：页面自带答案表则零 AI 瞬时作答
    if (tryFastKeyFill()) { render(); return; }
    // 答题表单常由页面脚本延迟渲染：短轮询等待（300ms 一次，表单一到立即作答）
    {
      const t0 = detectAnswerTable();
      if (t0) {
        log.push('⚡ 极速模式：答案表已就绪（' + t0.ids.length + ' 题），等待答题表单渲染…'); render();
        for (let i = 0; i < 20; i++) {
          await sleep(300);
          if (tryFastKeyFill()) { render(); return; }
          if (document.querySelector('input[type="radio"][name*="' + cssEscape(t0.ids[0]) + '"]')) break; // 表单已渲染但未命中（结构异常），转通用扫描
        }
        log.push('⚠ 内置答案表与答题表单不匹配，转通用 AI 扫描');
      }
    }

    // 扫描 document + 同源 iframe
    const roots = collectScanRoots();
    let allQuestions = [];
    for (const root of roots) {
      try {
        const qs = DomCore.extractQuestions(root, adapter).filter((q) => q && q.type !== 'material'); // material 已并入小问，不进答题队列
        if (qs.length) allQuestions = allQuestions.concat(qs);
      } catch (_) {}
    }

    log.push('[' + mode + '] 扫描到 ' + allQuestions.length + ' 题' + (roots.length > 1 ? '（含 ' + (roots.length - 1) + ' 个 iframe）' : ''));
    STATS.scanned += allQuestions.length;
    if (allQuestions.length > 0) CFG.panelHidden = false; // 检测到题目则自动展开面板（避免曾手动关闭后无反馈）

    // 动态重试：若 0 题，快速轮询等待动态加载（800ms 一次，最多 10 次）
    if (allQuestions.length === 0) {
      let retries = 10;
      while (retries-- > 0) {
        log.push('⏳ 未检测到题目，等待动态加载…（剩余重试 ' + (retries + 1) + '）');
        render();
        await sleep(800);
        if (tryFastKeyFill()) { render(); return; }
        const roots2 = collectScanRoots();
        for (const root of roots2) {
          try {
            const qs = DomCore.extractQuestions(root, adapter).filter((q) => q && q.type !== 'material');
            if (qs.length) allQuestions = allQuestions.concat(qs);
          } catch (_) {}
        }
        if (allQuestions.length > 0) {
          log.push('✓ 动态加载后检测到 ' + allQuestions.length + ' 题');
          break;
        }
      }
    }

    if (allQuestions.length === 0) {
      log.push('未检测到答题结构（本页可能无题目，或为弹窗式一题一答模式）');
      // 启动弹窗监听作为兜底
      watchModalQuiz();
    }
    if (!CFG.sbAnon) log.push('提示：脚本菜单里配置 Supabase Anon Key（从后台 Project Settings → API 复制）');
    else log.push('已内置云端接口，开箱即用（菜单可改 Anon Key / 接口地址）');
    render();

    // 🚀 并行预取：所有未完成题目同时发起 AI 请求（总耗时≈最慢一题），再按顺序填答
    const todo = allQuestions.filter((q) => !(q.containerEl && q.containerEl.getAttribute('data-uaa-done')));
    if (todo.length && CFG.sbAnon && !CFG.paused) {
      log.push('🚀 [' + ts() + '] 并行请求 ' + todo.length + ' 题答案（同时发出，不等上一题）…');
      render();
      const tAi = Date.now();
      const bankHit = todo.filter((q) => bankLookup(q.stem) != null).length;
      if (bankHit) log.push('💾 本地题库直接命中 ' + bankHit + '/' + todo.length + ' 题（离线，跳过 AI 请求）');
      let aiHit = 0;
      await Promise.all(todo.map(async (q) => {
        const k = engine.normalize(q.stem);
        const bk = bankLookup(q.stem);
        if (bk != null) {
          // 题库已有答案：不消耗云端额度
          const bv = resolveBankAnswer(bk.rec, q);
          if (bv != null && bv !== '未知') aiCache[k] = bv;
          return;
        }
        let raw = null;
        // 多选逐项判断（默认开）：每个选项单独问 AI「是否符合题意」再汇总成字母串，
        // 医学 X 型题「少选/错选均不得分」的漏选率大幅下降
        if (q.type === 'multiple' && CFG.accMultiItem) {
          const mv = await judgeMultiByItems(q);
          if (mv != null) raw = mv;
        }
        if (raw == null) {
          // 双模型会诊（默认关）：自定义接口 + 云端共享同时作答，分歧时取主模型并提示
          if (CFG.accDualModel && CFG.apiKey && CFG.cloudFallback && CFG.sbAnon) {
            const [r1, r2] = await Promise.all([callCustomAPI(q.stem, q.options), callCloud(q.stem, q.options)]);
            raw = (r1 != null) ? r1 : r2;
            if (r1 != null && r2 != null && r1 !== r2) log.push('⚠ 双模型会诊分歧：主=' + r1 + ' 复核=' + r2 + '（取主模型）');
          } else {
            raw = await callAI(q.stem, q.options);
          }
        }
        const parsed = (raw == null) ? null : DomCore.parseAIAnswer(raw, q);
        // 只缓存"真答案"：写入 null 会污染模糊匹配的候选表（见 bankKeys）
        if (parsed != null && parsed !== '未知') { aiCache[k] = parsed; aiHit++; }
        // AI 答对的题永久入库，下次同题零延迟命中（云端挂了也能答）
        if (parsed != null && parsed !== '未知') qcachePut(k, parsed, CFG.apiKey ? 'sf' : 'cloud');
      }));
      STATS.bank += bankHit;
      STATS.ai += aiHit;
      log.push('🚀 [' + ts() + '] 答案全部返回（耗时 ' + ((Date.now() - tAi) / 1000).toFixed(1) + ' 秒），开始按序填答');
      render();
    }

    for (const q of allQuestions) {
      if (CFG.paused) { log.push('已暂停，按 D 继续'); break; }
      if (q.containerEl && q.containerEl.getAttribute('data-uaa-done')) continue;
      const key = engine.normalize(q.stem);
      let ans = aiCache[key] != null ? aiCache[key] : null;
      let ansSrc = aiCache[key] != null ? 'bank' : '';
      let demoUsed = false;
      if ((ans == null || ans === '未知') && !CFG.sbAnon) {
        const d = demoAnswer(q.stem);
        if (d != null) { ans = d; demoUsed = true; ansSrc = 'demo'; }
      }
      // 最后兜底：启发式猜答（AI 不通 + 题库没有时不空着，正确率有限但远胜留空，可菜单关闭）
      if ((ans == null || ans === '未知') && CFG.heuristicFallback) {
        const g = heuristicGuess(q);
        if (g != null) { ans = g; ansSrc = 'guess'; STATS.guess++; }
      }
      if (ans == null || ans === '未知') {
        STATS.miss++;
        log.push('未命中：' + q.stem.slice(0, 30) + '…'); render(); continue;
      }
      const tag = ansSrc === 'bank' ? '💾题库 ' : (ansSrc === 'guess' ? '🎲启发式 ' : (demoUsed ? '[演示] ' : '✓ '));
      log.push(tag + q.stem.slice(0, 24) + '… 答案：' + ans);
      if (CFG.autoFillEnabled) {
        try {
          const ok = DomCore.autoFill(document, q, ans);
          if (ok && q.containerEl) q.containerEl.setAttribute('data-uaa-done', '1');
        } catch (e) { log.push('填答异常：' + e.message); }
      }
      render();
      await sleep(CFG.autoFillEnabled ? 250 : 0);
    }
    if (CFG.sbAnon && todo.length) {
      const allMiss = todo.every((q) => { const k = engine.normalize(q.stem); return aiCache[k] == null || aiCache[k] === '未知'; });
      if (allMiss) {
        log.push(CFG.heuristicFallback
          ? '⚠ 本次 AI 全部未返回答案（接口不通/Key 无效），已用「🎲启发式」兜底作答（正确率有限）。要准确答案：菜单「🔑 配置硅基流动 Key」填 sk-...（cloud.siliconflow.cn 免费申请），填了即直连、免部署'
          : '⚠ 本次 AI 全部未返回答案（接口不通/Key 无效）。请点菜单「🔍 测试 AI 连接」诊断；或「🔑 配置硅基流动 Key」填 sk-... 直连。也可开「🎲 启发式兜底」保证不留空');
      }
    }
    } finally { scanning = false; }
  }

  // ===== SPA 分页考试补扫（NCME /qbank/do/paper 等多页考试）=====
  // 考试页是 Vue SPA，翻页时只替换题目 DOM 而不刷新页面：scanAndAnswer 仅在 boot 跑一次，
  // 若不补扫，第 2 页起不会自动作答（表现为"脚本答了几页就不动了"）。
  // 用"题目签名"比对 + 1s 轮询：仅当题目集合发生变化（翻页/新题渲染）才重扫。
  // 轮询（而非仅靠 MutationObserver）可避免"唯一一次 DOM 变更恰好撞上 scanning 锁"导致永不补扫；
  // 且只在存在"未作答题目"时才补扫，避免页面内实时文本波动引发空转/重复扫描。
  function watchExamRepaint() {
    if (!CFG.repaintWatch) return;     // 面板「答题」页可关闭
    if (window.__uaaExamWatch) return;
    window.__uaaExamWatch = true;
    const sig = () => {
      const items = document.querySelectorAll('.qItem, [class*="qItem"]');
      let s = '';
      for (const it of items) s += (it.textContent || '').length + ';';
      return items.length + '|' + s;
    };
    let lastSig = sig();
    setInterval(() => {
      if (scanning) return;                       // 正在扫描则等下一轮
      const cur = sig();
      if (cur === lastSig) return;                // 题目未变，不扫
      lastSig = cur;
      // 仅当存在未作答题目时才补扫（已全答的页面即便签名波动也不重扫）
      if (!document.querySelector('.qItem:not([data-uaa-done]), [class*="qItem"]:not([data-uaa-done])')) return;
      scanAndAnswer();
    }, 1000);
  }

  function onKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    switch (e.key) {
      case 'ArrowUp': panel && (panel.style.opacity = '0'); CFG.panelHidden = true; break;
      case 'ArrowDown': CFG.panelHidden = false; render(); break;
      case 'ArrowLeft': CFG.panelHidden = true; GM_setValue('uaa_panelHidden', true); render(); break;
      case 'ArrowRight': CFG.panelHidden = false; GM_setValue('uaa_panelHidden', false); panel && (panel.style.left = '12px', panel.style.top = '12px'); render(); break;
      case 's': case 'S': CFG.paused = true; log.push('⏸ 已暂停'); render(); break;
      case 'd': case 'D': CFG.paused = false; log.push('▶ 继续'); scanAndAnswer(); break;
    }
  }

  // 菜单仅保留高频动作，全部开关/配置/自检统一收进控制面板
  function registerMenu() {
    GM_registerMenuCommand('🎛 打开控制面板（全部开关·配置·自检）', () => {
      CFG.panelHidden = false; GM_setValue('uaa_panelHidden', false);
      try { switchTab(CFG.panelTab || 'home'); } catch (_) { render(); }
    });
    GM_registerMenuCommand('▶ 立即扫描答题', () => scanAndAnswer());
    GM_registerMenuCommand('⚡ 速学本节视频（视频门禁页通用）', () => fastLearnVideo());
    GM_registerMenuCommand('📋 去本节考试（视频页）', () => gotoCourseExam());
    GM_registerMenuCommand('🔑 配置 AI Key（填自己的接口·免部署）', () => {
      const v = prompt('填入你的 API Key（sk-...）。密钥只存你本机，不会上传。留空表示清空：', CFG.apiKey);
      if (v != null) { setApiKey(v); render(); }
    });
    GM_registerMenuCommand('🔍 测试 AI 连接', async () => {
      log.push('🔍 正在测试 AI 连接（1+1 等于几）…'); render();
      const r = await callAI('1+1 等于几？选项：A.1　B.2　C.3', [{ text: '1' }, { text: '2' }, { text: '3' }]);
      if (r == null) log.push(CFG.apiKey ? '❌ 自定义接口失败（检查 Key 余额 / 接口地址 / 模型名）' : '❌ 云端未返回答案（去面板「AI接口」页填自己的 Key）');
      else log.push('✅ AI 连接正常，返回：' + r);
      render();
    });
    GM_registerMenuCommand('🧪 演示：注入示例题并扫描答题', () => { injectDemo(); return scanAndAnswer(); });
    GM_registerMenuCommand('❤ 打赏支持（请作者喝杯咖啡）', () => { CFG.panelHidden = false; switchTab('donate'); });
    GM_registerMenuCommand('📁 导入题库（xlsx / csv / txt）', () => {
      CFG.panelHidden = false; GM_setValue('uaa_panelHidden', false);
      try { switchTab('bank'); } catch (_) { render(); }
      setTimeout(() => {
        const inp = document.getElementById('uaa-bank-file');
        if (inp) inp.click();
      }, 60);
    });
    GM_registerMenuCommand('🗑 清空本地题库', () => {
      if (typeof confirm === 'function' && !confirm('确定清空本地题库？')) return;
      try { GM_setValue(QCACHE_KEY, '{}'); } catch (_) {}
      for (const k in aiCache) delete aiCache[k];
      bankClear();
      log.push('本地题库已清空');
      try { refreshBankStats(); } catch (_) {}
      render();
    });
  }

  async function boot() {
    // 防重复注入/重复安装：同一页面只允许一个实例（避免出现多个面板）
    const rootEl = document.documentElement;
    if (rootEl.hasAttribute('data-uaa-booted')) return;
    rootEl.setAttribute('data-uaa-booted', '1');
    // 页头/页脚等无题目 iframe：静默退出，避免出现多个窗口
    let inIframe = false;
    try { inIframe = window.top !== window.self; } catch (_) { inIframe = true; }
    if (inIframe && !document.querySelector('input[type=radio],input[type=checkbox]')) return;
    registerMenu();
    log.push('⚠ 免责声明：本脚本仅为个人学习辅助工具，请遵守各平台规则与考试纪律，严禁用于任何违规代考行为；使用后果由使用者自行承担。');
    log.push('📮 反馈 / 平台适配求助 → QQ 群 1104357904（面板底部可一键复制；某平台用不了，进群说一声即可）');
    document.addEventListener('keydown', onKey);
    // 本地题库载入 + 结果页答案回捞（离线兜底：AI 接口不通时依然能答）
    {
      const n = qcacheLoad();
      const m = bankLoad();
      if (n || m) log.push('💾 本地题库：已载入 ' + (n + m) + ' 题（离线可答，不联网、不耗 Key）'
        + (m ? ('，其中导入题库 ' + m + ' 题') : ''));
    }
    render();
    if (CFG.harvestEnabled) {
      setTimeout(() => {
        const added = harvestFromPage();
        if (added) { log.push('📥 已从结果页回捞 ' + added + ' 题正确答案存入本地题库（下次考试直接命中）'); render(); }
      }, 1500);
    }

    // ===== 平台与答题机制自动识别（多平台通用架构）=====
    // 机制探测与具体网站无关：命中哪个机制就用哪个，多个机制可同时生效
    const adapter = DomCore.getAdapterForUrl(location.href);
    log.push('🔍 平台识别：' + ((adapter && !adapter.universal) ? adapter.name : '未收录平台（自动走通用机制）'));
    const mechs = [];
    if (detectAnswerTable()) mechs.push('内置答案表');
    if (detectVideoGate()) mechs.push('视频门禁');
    if (findQuizModal()) mechs.push('弹窗式答题');
    log.push(mechs.length ? '🔍 已识别答题机制：' + mechs.join(' / ') : '🔍 未识别特定机制，启用全平台通用扫描');
    render();
    // 字体加密检测（超星等私有字体把题干渲染成乱码，需解码才能正常 AI 作答）
    if (adapter && /chaoxing/.test(location.host) && detectFontObfuscation()) {
      log.push('⚠ 本页题目使用了字体加密（超星私有字体），提取到的题干可能为乱码，AI 答案可能不准；请把页面 HTML 发我以完善解码');
      render();
    }

    // 机制激活：弹窗监听常驻（通用）；视频门禁页注入速学按钮 + 倍速面板；其余交给通用扫描
    watchModalQuiz();
    if (detectVideoGate()) {
      ensureFastVideoButton();
      ensureSpeedPanel();
      log.push('🎬 检测到课件视频页：默认 ' + CFG.userSpeed + '× 倍速（右下角可切换 1×/2×/3×/5×/8×/16×）；点「⚡ 秒过」16× 速学 → 学完自动进入考试答题');
      render();
    } else if (detectUnfinishedCourse()) {
      // 课程列表页（ncme 等"我的课程"）：检测到未完成课程卡片 → 注入自动完成按钮 + 倍速面板
      // 注意：不要依赖 URL 关键词（超星学习页 URL 含 mycourse 会被误判），仅以卡片检测为准
      ensureCourseAutoBtn();
      ensureSpeedPanel();
      log.push('📋 检测到课程列表页：点右下角「📋 自动完成未完成课程」→ 依次进入学习（视频→考试）直到清空');
      log.push('🎬 视频页倍速默认 ' + CFG.userSpeed + '×（右下角可切换 1×/2×/3×/5×）');
      render();
    } else {
      // 普通答题页：注入倍速面板（兜底）+ 触发扫描 + 监听翻页补扫
      ensureSpeedPanel();
      setTimeout(scanAndAnswer, 400);
      watchExamRepaint();
    }

    // SPA 视频页：boot 时 <video> 可能尚未由客户端渲染（如 NCME /player/record），
    // 轮询补检测：一旦播放器出现，补注入速学按钮 + 倍速面板（控件自身有去重保护）
    (function watchVideoGate() {
      let done = false;
      const iv = setInterval(() => {
        if (done) { clearInterval(iv); return; }
        if (!document.getElementById('uaa-fastvideo-btn') && detectVideoGate()) {
          ensureFastVideoButton();
          ensureSpeedPanel();
          log.push('🎬 检测到课件视频页（补注入，SPA 延迟渲染）：默认 ' + CFG.userSpeed + '× 倍速；点「⚡ 秒过」16× 速学');
          render();
          done = true;
        }
      }, 1500);
      setTimeout(() => clearInterval(iv), 36000);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`.replace('__UAA_UI_PANEL__', () => uiPanelCode);

const finalSandbox = `
(function(){
  // 打赏码全局注入（河南专技驱动等模块复用；与 mainCode 的 CFG.donateWx 同源）
  const UAA_DONATE_WX = ${JSON.stringify(AUTHOR_DONATE_WX)};
  const UAA_DONATE_ALI = ${JSON.stringify(AUTHOR_DONATE_ALI)};
  ${engineCode}
  ${domCoreCode}
  ${knownPlatformsCode}
  ${adapterCode}
  ${platformsCode}
  ${henanJxjyCode}
  var engine = window.UAA_ENGINE;
  ${bankCode}
  ${mainCode}
})();
`;

const header = `// ==UserScript==
// @name         🤖 AI 智能答题助手 — 网页自动识别·秒答
// @namespace    https://workbuddy.ai-auto-answer
// @version      1.1.3
// @description  全平台自动答题 + 视频速学。统一控制面板：7 大标签（总览/答题/视频/AI接口/题库/打赏/诊断）逐项开关，一键自检。支持自定义 AI 接口（硅基流动、DeepSeek、智谱、Moonshot、通义、火山、OpenAI 及任意 OpenAI 兼容中转站），填自己的 Key 即直连，密钥只存本机。题库支持上传 Excel/CSV/TXT/JSON 一键导入，自动识别表头与 10 余种表格格式（选项分列/合并列/判断题/填空题/无表头），识别不准可手动改列；内置本地题库持久化与结果页答案回捞，断网也能答；AI 不可用时启发式兜底不留空。视频支持 1×~16× 常速倍速与最高 1000× 帧步进速学，学完自动衔接考试。已适配超星学习通、智慧树、智慧职教、雨课堂、中国大学MOOC、国家继续医学教育网 NCME 等 30+ 平台，通用扫描兜底任意网页。⚠ 免责声明：仅供个人学习辅助与自测，请遵守平台规则与考试纪律，严禁违规代考。
// @author       WorkBuddy
// @license      MIT
// @antifeature  tracking  为提供 AI 分析，题目文本会发送至作者托管的云端接口（密钥不在客户端）
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCIgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0Ij4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYmciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj4KICAgICAgPHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjNjM2NmYxIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMC41IiBzdG9wLWNvbG9yPSIjOGI1Y2Y2Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2VjNDg5OSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+CiAgPHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjU4IiBoZWlnaHQ9IjU4IiByeD0iMTgiIGZpbGw9InVybCgjYmcpIi8+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIxOCIgcj0iMyIgZmlsbD0iI2ZmZmZmZiIgb3BhY2l0eT0iMC42NSIvPgogIDxwYXRoIGQ9Ik0yMSAzMyBMMjkgNDEgTDQ1IDIzIiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iNi41IiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiLz4KPC9zdmc+Cg==
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-end
// @connect      vjfybcwsbduswkzouvvd.supabase.co
// @connect      supabase.co
// @connect      *
// ==/UserScript==
`;

// 明文版：环境变量 UAA_PLAIN=1（Unix）或参数 --plain（Windows 兼容）
const PLAIN = process.env.UAA_PLAIN === '1' || process.argv.includes('--plain');
let payload = finalSandbox;
if (JavaScriptObfuscator && !PLAIN) {
  try {
    payload = JavaScriptObfuscator.obfuscate(finalSandbox, OBF_OPTIONS).getObfuscatedCode();
    console.log('✓ 构建完成（已高强度混淆）');
  } catch (e) {
    console.log('⚠ 混淆失败，降级输出未混淆版本：' + e.message);
  }
} else {
  console.log(PLAIN ? '✓ 构建完成（未混淆明文版 · 供 ScriptCat 公开区发布，符合 V0.3 规则）' : '⚠ 未找到 javascript-obfuscator，输出未混淆版本（请先安装：npm i javascript-obfuscator --prefix .testdeps）');
}

// 收款码兜底图（data URI，约 137KB）故意放在混淆包外面：
// 混淆器开了 splitStrings（chunk=10），长 base64 会被切碎成上万段，体积从 137KB 暴涨到 1MB+。
// 用顶层 var 传递，混淆后的 IIFE 通过作用域链直接读到；renameGlobals=false 不会被改名。
const qrPrelude = 'var UAA_QR_WX_B64 = ' + JSON.stringify(AUTHOR_DONATE_WX_B64) + ';\n'
  + 'var UAA_QR_ALI_B64 = ' + JSON.stringify(AUTHOR_DONATE_ALI_B64) + ';\n';

const out = header + '\n' + qrPrelude + '\n' + payload;
const outName = PLAIN ? 'universal-auto-answer.plain.user.js' : 'universal-auto-answer.user.js';
const outPath = path.join(DIST, outName);
fs.writeFileSync(outPath, out, 'utf8');
console.log('✓ 构建完成 -> ' + outPath + '  (' + out.length + ' 字节)');
