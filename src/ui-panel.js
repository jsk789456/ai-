  // ==================================================================
  //  统一控制面板 UI v2 —— 所有功能集中到一个面板，逐项可开关
  //  标签：总览 / 答题 / 视频 / AI接口 / 题库 / 诊断
  //  说明：本文件是被内联进主 IIFE 的代码片段，可直接访问 CFG / log / DomCore 等
  // ==================================================================
  const NLCH = String.fromCharCode(10);

  // AI 接口预设（全部为 OpenAI 兼容协议）：用户填自己的 Key 即可直连，密钥只存本机
  const AI_PROVIDERS = [
    { id: 'siliconflow', name: '硅基流动 SiliconFlow', base: 'https://api.siliconflow.cn/v1',
      models: ['Qwen/Qwen2.5-72B-Instruct', 'Qwen/Qwen3-8B', 'deepseek-ai/DeepSeek-V3', 'THUDM/glm-4-9b-chat'],
      site: 'https://cloud.siliconflow.cn', tip: '有免费额度，注册即用（推荐）' },
    { id: 'deepseek', name: 'DeepSeek 深度求索', base: 'https://api.deepseek.com/v1',
      models: ['deepseek-chat', 'deepseek-reasoner'], site: 'https://platform.deepseek.com', tip: '便宜好用，中文强' },
    { id: 'zhipu', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4',
      models: ['glm-4-flash', 'glm-4-air', 'glm-4-plus'], site: 'https://open.bigmodel.cn', tip: 'glm-4-flash 免费' },
    { id: 'moonshot', name: 'Moonshot Kimi', base: 'https://api.moonshot.cn/v1',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k'], site: 'https://platform.moonshot.cn', tip: '长文本强' },
    { id: 'qwen', name: '阿里通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      models: ['qwen-plus', 'qwen-turbo', 'qwen-max'], site: 'https://dashscope.console.aliyun.com', tip: '阿里云官方' },
    { id: 'volc', name: '火山方舟 豆包', base: 'https://ark.cn-beijing.volces.com/api/v3',
      models: ['doubao-seed-1-6-250615', 'doubao-1-5-pro-32k-250115', 'doubao-1-5-lite-32k-250115', 'doubao-seed-1-6-thinking-250715'],
      site: 'https://console.volcengine.com/ark', tip: '字节跳动豆包；也可填控制台创建的接入点 ID（ep-xxx）' },
    { id: 'baichuan', name: '百川智能', base: 'https://api.baichuan-ai.com/v1',
      models: ['Baichuan4', 'Baichuan3-Turbo'], site: 'https://platform.baichuan-ai.com', tip: '' },
    { id: 'openai', name: 'OpenAI', base: 'https://api.openai.com/v1',
      models: ['gpt-4o-mini', 'gpt-4o'], site: 'https://platform.openai.com', tip: '需海外网络' },
    { id: 'custom', name: '自定义 / 中转站', base: '', models: [], site: '', tip: '任意 OpenAI 兼容接口' },
  ];

  // 打赏页状态（仅本次会话：当前展示哪个码、选中金额）
  let donatePay = 'wx';
  let donateAmount = 29;  // 默认推荐档（"请吃顿饭"：9.9/29/66/188 中较易接受的鼓励价）

  // 开关 → 持久化 key 映射（新增开关只需在此登记 + 画一行）
  const SW_STORE = {
    autoFillEnabled: 'uaa_autoFill',
    heuristicFallback: 'uaa_heuristic',
    autoGotoExam: 'uaa_auto_goto_exam',
    harvestEnabled: 'uaa_harvest',
    modalWatch: 'uaa_modal_watch',
    repaintWatch: 'uaa_repaint_watch',
    speedPanelEnabled: 'uaa_speed_panel',
    forceSpeed: 'uaa_force_speed',
    cloudFallback: 'uaa_cloud_fallback',
    showAllLogs: 'uaa_show_all_logs',
    donateEnabled: 'uaa_donate_enabled',
    autoScrollLog: 'uaa_auto_scroll',
    bankFuzzy: 'uaa_bank_fuzzy',
    bankPreferText: 'uaa_bank_prefer_text',
    accMultiItem: 'uaa_acc_multi_item',
    accMedPrompt: 'uaa_acc_med_prompt',
    accDualModel: 'uaa_acc_dual_model',
  };

  const TABS = [
    { id: 'home', label: '总览' },
    { id: 'quiz', label: '答题' },
    { id: 'video', label: '视频' },
    { id: 'ai', label: 'AI接口' },
    { id: 'bank', label: '题库' },
    { id: 'donate', label: '❤打赏' },
    { id: 'diag', label: '诊断' },
  ];

  // 打赏页可通过设置隐藏（二开作者不想要打赏入口时关掉即可）
  function activeTabs() {
    return CFG.donateEnabled === false ? TABS.filter((t) => t.id !== 'donate') : TABS;
  }

  // ---------------- 打赏文案（一键复制、面板展示、设置说明三套） ----------------
  // 4 档金额：心理学档（9.9 入门 / 29 鼓励 / 66 支持 / 188 大力）；与 viewDonate 同步
  const DONATE_AMOUNTS = [
    { v: 9.9,  label: '9.9',  desc: '一杯豆浆' },
    { v: 29,   label: '29',   desc: '请吃顿饭' },
    { v: 66,   label: '66',   desc: '支持一下' },
    { v: 188,  label: '188',  desc: '大力支持' },
  ];

  // 主 Hero 文案：情感钩子 + 数据证明 + 一键冲动句（不堆形容词）
  const DONATE_SLOGAN = '长夜里的写代码，也是会饿的 ☕\u3000\u3000\u3000\u3000\u3000\u3000每天 <b>9.9 元</b>\uff0c请允许我继续陪你肝学习';
  // 短金句（致谢折叠区）：让冲动变成「值得」
  const DONATE_POINTS = [
    '▶ <b>我做的：</b>自动答单选/多选/判断/填空、视频\u00a06×~1000×\u00a0速学、零广告零追踪',
    '▶ <b>钱用在哪：</b>服务器与 AI 接口额度、新平台适配、一个 bug\u00a03\u00a0小时内的回复',
    '▶ <b>不打赏：</b>永久免费、功能不打折 —— 这不是客套，是早\u00a08\u00a0年就定的规矩',
    '▶ <b>遇到问题：</b>QQ 反馈群\u00a01104357904，或面板「诊断」→ 复制诊断报告给我',
  ];

  function donateCopyText(amount) {
    const amt = amount ? ('（推荐金额：¥' + amount + '）') : '';
    return '【AI 智能答题助手 · 感谢支持】' + amt + NLCH +
      DONATE_SLOGAN + NLCH +
      DONATE_POINTS.map((p, i) => (i + 1) + '. ' + p).join(NLCH) + NLCH +
      (CFG.donateTip ? ('💬 ' + CFG.donateTip + NLCH) : '') +
      '——— 感谢每一位使用者的信任 ❤';
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function providerById(id) {
    for (const p of AI_PROVIDERS) if (p.id === id) return p;
    return AI_PROVIDERS[AI_PROVIDERS.length - 1];
  }

  function maskKey(k) {
    const s = String(k || '');
    if (!s) return '';
    if (s.length <= 10) return s.slice(0, 2) + '****';
    return s.slice(0, 6) + '****' + s.slice(-4);
  }

  // ---------------- 样式（玻璃拟态 + 渐变 + 微动效） ----------------
  const PANEL_CSS = [
    '#uaa-panel{position:fixed;left:14px;top:14px;z-index:999999;width:460px;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;',
    'background:linear-gradient(165deg,rgba(18,25,42,.97),rgba(12,17,31,.97) 55%,rgba(9,13,25,.98));',
    'backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%);',
    'color:#e8ecf5;font:13px/1.6 "Segoe UI",system-ui,-apple-system,"Microsoft YaHei",sans-serif;',
    'border:1px solid rgba(139,154,255,.2);border-radius:16px;',
    'box-shadow:0 26px 70px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.07);',
    'transition:opacity .22s ease;animation:uaaIn .28s cubic-bezier(.16,1,.3,1);}',
    '@keyframes uaaIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
    '#uaa-accent{height:3px;flex:none;background:linear-gradient(90deg,#6366f1,#8b5cf6,#d946ef,#f43f5e,#6366f1);background-size:320% 100%;animation:uaaFlow 9s linear infinite;}',
    '@keyframes uaaFlow{0%{background-position:0 0}100%{background-position:320% 0}}',
    '#uaa-title{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;cursor:move;user-select:none;flex:none;',
    'background:linear-gradient(180deg,rgba(99,102,241,.16),rgba(99,102,241,0));}',
    '#uaa-logo{width:26px;height:26px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;flex:none;',
    'background:linear-gradient(135deg,#6366f1,#a855f7);box-shadow:0 4px 14px rgba(99,102,241,.5);}',
    '#uaa-titletext{font-size:14px;font-weight:700;letter-spacing:.4px;background:linear-gradient(90deg,#fff,#c7d2fe);',
    '-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap;}',
    '#uaa-badge{font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.14);color:#9ca3af;background:rgba(255,255,255,.05);white-space:nowrap;flex:none;}',
    '#uaa-badge.on{color:#6ee7b7;border-color:rgba(52,211,153,.45);background:rgba(16,185,129,.15);}',
    '#uaa-headbtns{margin-left:auto;display:flex;align-items:center;gap:3px;flex:none;}',
    '#uaa-headbtns>span{padding:0 6px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:11.5px;color:#9ca3af;transition:.15s;white-space:nowrap;}',
    '#uaa-headbtns>span:hover{background:rgba(255,255,255,.12);color:#fff;}',
    '#uaa-tabs{display:flex;gap:3px;padding:0 10px 8px;flex:none;}',
    '.uaa-tab{flex:1;text-align:center;padding:6px 0;font-size:12px;border-radius:9px;cursor:pointer;color:#8b96ad;background:rgba(255,255,255,.035);border:1px solid transparent;transition:.16s;}',
    '.uaa-tab:hover{color:#e8ecf5;background:rgba(255,255,255,.08);}',
    '.uaa-tab.on{color:#fff;background:linear-gradient(135deg,rgba(99,102,241,.92),rgba(168,85,247,.86));box-shadow:0 4px 14px rgba(99,102,241,.38);border-color:rgba(255,255,255,.16);font-weight:600;}',
    '#uaa-views{flex:1;overflow-y:auto;overflow-x:hidden;padding:2px 12px 12px;scrollbar-width:thin;}',
    '#uaa-views::-webkit-scrollbar{width:6px;}#uaa-views::-webkit-scrollbar-thumb{background:rgba(139,154,255,.32);border-radius:3px;}',
    '.uaa-view{display:none;animation:uaaFade .22s ease;}.uaa-view.on{display:block;}',
    '@keyframes uaaFade{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}',
    '.uaa-card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 11px;margin-bottom:9px;}',
    '.uaa-card-h{font-size:11.5px;font-weight:700;color:#a5b4fc;letter-spacing:.5px;margin-bottom:6px;display:flex;align-items:center;gap:6px;}',
    '.uaa-card-h::before{content:"";width:3px;height:12px;border-radius:2px;background:linear-gradient(180deg,#818cf8,#c084fc);flex:none;}',
    '.uaa-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,.055);}',
    '.uaa-row:first-child{border-top:none;}',
    '.uaa-row-t{flex:1;min-width:0;}.uaa-row-l{font-size:12.5px;color:#e8ecf5;}',
    '.uaa-row-d{font-size:10.5px;color:#7d879c;margin-top:1px;line-height:1.45;}',
    '.uaa-sw{flex:none;width:40px;height:22px;border-radius:999px;background:rgba(255,255,255,.14);position:relative;cursor:pointer;transition:.2s;border:1px solid rgba(255,255,255,.08);}',
    '.uaa-sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 2px 5px rgba(0,0,0,.35);}',
    '.uaa-sw.on{background:linear-gradient(135deg,#6366f1,#a855f7);border-color:transparent;box-shadow:0 0 12px rgba(99,102,241,.5);}',
    '.uaa-sw.on::after{left:20px;}',
    '.uaa-btn{border:none;border-radius:9px;padding:8px 10px;font-size:12px;cursor:pointer;color:#e8ecf5;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);transition:.16s;font-family:inherit;}',
    '.uaa-btn:hover{background:rgba(255,255,255,.15);transform:translateY(-1px);}.uaa-btn:active{transform:none;}',
    '.uaa-btn.pri{background:linear-gradient(135deg,#6366f1,#a855f7);border-color:transparent;box-shadow:0 6px 18px rgba(99,102,241,.35);font-weight:600;color:#fff;}',
    '.uaa-btn.ok{background:linear-gradient(135deg,#10b981,#059669);border-color:transparent;color:#fff;font-weight:600;}',
    '.uaa-btn.warn{background:linear-gradient(135deg,#f59e0b,#ef4444);border-color:transparent;color:#fff;font-weight:600;}',
    '.uaa-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;}',
    '.uaa-lab{font-size:11px;color:#94a3b8;margin:0 0 4px 2px;display:block;}',
    '.uaa-inp{margin-bottom:8px;}',
    '.uaa-in{width:100%;box-sizing:border-box;background:rgba(2,6,18,.66);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:7px 9px;color:#e8ecf5;font:12px/1.4 inherit;outline:none;transition:.16s;}',
    '.uaa-in:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18);}',
    '.uaa-in::placeholder{color:#5b6478;}',
    '.uaa-chips{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px;}',
    '.uaa-chip{padding:4px 9px;border-radius:8px;font-size:11.5px;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);color:#b6c0d4;transition:.15s;}',
    '.uaa-chip:hover{background:rgba(255,255,255,.13);color:#fff;}',
    '.uaa-chip.on{background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;border-color:transparent;font-weight:600;box-shadow:0 3px 10px rgba(99,102,241,.4);}',
    '.uaa-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;}',
    '.uaa-stat{background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.22);border-radius:10px;padding:7px 4px;text-align:center;}',
    '.uaa-stat b{display:block;font-size:16px;color:#fff;line-height:1.25;}',
    '.uaa-stat span{font-size:10px;color:#8b96ad;}',
    '.uaa-kv{display:flex;justify-content:space-between;gap:8px;font-size:11.5px;padding:3px 0;}',
    '.uaa-kv b{color:#dbe3f4;font-weight:500;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.uaa-kv span{color:#8b96ad;flex:none;}',
    '#uaa-body{white-space:pre-wrap;font-family:"Cascadia Mono",Consolas,"Courier New",monospace;font-size:11px;line-height:1.7;color:#b9c3d6;',
    'max-height:280px;overflow:auto;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:8px 9px;scrollbar-width:thin;}',
    '#uaa-body::-webkit-scrollbar{width:6px;}#uaa-body::-webkit-scrollbar-thumb{background:rgba(139,154,255,.3);border-radius:3px;}',
    '#uaa-foot{flex:none;padding:8px 12px 10px;border-top:1px solid rgba(255,255,255,.07);font-size:11px;color:#8b96ad;line-height:1.6;background:rgba(0,0,0,.22);}',
    '.uaa-tag{display:inline-block;font-size:10px;padding:2px 7px;border-radius:999px;margin:0 4px 4px 0;background:rgba(99,102,241,.16);border:1px solid rgba(99,102,241,.3);color:#c7d2fe;}',
    '.uaa-tag.g{background:rgba(16,185,129,.14);border-color:rgba(16,185,129,.35);color:#6ee7b7;}',
    '.uaa-tag.y{background:rgba(245,158,11,.14);border-color:rgba(245,158,11,.35);color:#fcd34d;}',
    '.uaa-cta{background:linear-gradient(135deg,rgba(245,158,11,.18),rgba(239,68,68,.14));border:1px solid rgba(245,158,11,.35);border-radius:10px;padding:9px 10px;font-size:11.5px;line-height:1.65;margin-bottom:9px;}',
    '.uaa-link{color:#7dd3fc;cursor:pointer;text-decoration:underline;}',
    '.uaa-note{font-size:10.5px;color:#7d879c;line-height:1.6;margin-top:2px;}',
    '.uaa-test{font-size:11px;line-height:1.7;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:8px 9px;margin-top:7px;white-space:pre-wrap;display:none;}',
    '.uaa-logmini{font-size:11px;line-height:1.7;color:#b9c3d6;background:rgba(0,0,0,.26);border:1px solid rgba(255,255,255,.07);border-radius:9px;padding:7px 9px;max-height:88px;overflow:auto;white-space:pre-wrap;}',
    /* ===== 打赏页 ===== */
    /* 视觉灵魂：暖色全屏渐变 + 流动光晕 + 金句 hero + 大二维码（保证能扫）+ 强 CTA */
    '.uaa-donate{background:linear-gradient(180deg,rgba(254,215,170,.10),rgba(255,228,212,.05) 30%,rgba(255,237,213,0) 100%);padding:2px;}',
    '.uaa-hero{position:relative;overflow:hidden;background:linear-gradient(135deg,#ff6b6b 0%,#ee5a52 40%,#c026d3 100%);',
    'border-radius:18px;padding:18px 18px 22px;margin-bottom:10px;color:#fff;text-align:center;}',
    '.uaa-hero::before{content:"";position:absolute;left:-50%;top:-30%;width:200%;height:60%;',
    'background:radial-gradient(ellipse at 30% 50%,rgba(255,255,255,.32),transparent 60%);',
    'animation:uaaShine 7s ease-in-out infinite;pointer-events:none;}',
    '.uaa-hero::after{content:"";position:absolute;right:-40px;bottom:-40px;width:200px;height:200px;border-radius:50%;',
    'background:radial-gradient(circle,rgba(252,211,77,.42),transparent 70%);',
    'animation:uaaPulse 4s ease-in-out infinite;pointer-events:none;}',
    '@keyframes uaaShine{0%,100%{transform:translateX(-30%) translateY(0)}50%{transform:translateX(10%) translateY(8%)}}',
    '@keyframes uaaPulse{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.12);opacity:1}}',
    '.uaa-hero h1{margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:1px;line-height:1.25;position:relative;z-index:1;}',
    '.uaa-hero h1 .uaa-heart{color:#fff;font-size:26px;display:inline-block;animation:uaaBeat 1.4s ease-in-out infinite;margin:0 4px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.2));}',
    '.uaa-hero h1 b{color:#fde047;font-weight:900;}',
    '.uaa-hero .uaa-sub{font-size:13.5px;color:rgba(255,255,255,.92);line-height:1.7;margin:6px auto 0;max-width:300px;position:relative;z-index:1;}',
    '.uaa-hero .uaa-sub b{color:#fef3c7;font-weight:700;}',
    '.uaa-hero .uaa-stat{margin-top:11px;display:flex;justify-content:center;gap:18px;position:relative;z-index:1;}',
    '.uaa-hero .uaa-stat b{display:block;font-size:18px;font-weight:800;color:#fff;line-height:1.2;}',
    '.uaa-hero .uaa-stat span{font-size:10.5px;color:rgba(255,255,255,.78);letter-spacing:.4px;}',
    '.uaa-hero .uaa-stat i{display:block;width:1px;height:24px;background:rgba(255,255,255,.28);}',
    '@keyframes uaaBeat{0%,100%{transform:scale(1)}20%{transform:scale(1.28)}40%{transform:scale(.92)}}',
    '.uaa-quote{font-size:12px;line-height:1.85;color:#fde68a;background:linear-gradient(135deg,rgba(120,53,15,.45),rgba(180,83,9,.32));',
    'border:1px solid rgba(245,158,11,.4);border-radius:10px;padding:9px 11px;margin:0 0 10px;white-space:pre-wrap;text-align:center;font-weight:500;}',
    /* 打赏主区：左大码 + 右金额档与文案 */
    '.uaa-qrwrap{display:flex;gap:12px;align-items:flex-start;padding:10px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.09);border-radius:16px;}',
    /* 大尺寸二维码：保证手机一过即扫；白底留 6px 边距让扫码 App 识别更稳 */
    '.uaa-qr{flex:none;width:220px;height:220px;border-radius:14px;background:#fff;padding:6px;display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 10px 30px rgba(0,0,0,.45),inset 0 0 0 1px rgba(0,0,0,.04);',
    'transition:.22s;cursor:zoom-in;}',
    '.uaa-qr:hover{transform:scale(1.03);box-shadow:0 14px 40px rgba(0,0,0,.55),0 0 0 3px rgba(244,63,94,.3);}',
    '.uaa-qr img{width:208px;height:208px;display:block;border-radius:6px;image-rendering:pixelated;}',
    '.uaa-qrph{width:208px;height:208px;border-radius:8px;border:2px dashed rgba(244,63,94,.55);color:#94a3b8;font-size:12px;line-height:1.7;',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:8px;cursor:pointer;background:rgba(254,215,170,.08);}',
    '.uaa-qrph i{font-size:34px;font-style:normal;opacity:.75;color:#fb7185;}',
    '.uaa-qrside{flex:1;min-width:0;font-size:12px;line-height:1.75;color:#e2e8f0;}',
    '.uaa-qrside .uaa-pay-pick{display:flex;gap:6px;margin:0 0 10px;}',
    '.uaa-qrside .uaa-pay-pick .uaa-chip{flex:1;text-align:center;padding:6px 0;font-weight:600;}',
    /* 金额档位更大更显眼，配合大码区 */
    '.uaa-amt{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:8px 0;}',
    '.uaa-amtitem{border-radius:11px;padding:9px 6px;text-align:center;cursor:pointer;transition:.16s;',
    'background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.12);position:relative;overflow:hidden;}',
    '.uaa-amtitem:hover{background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.06));transform:translateY(-2px);box-shadow:0 8px 18px rgba(244,63,94,.18);}',
    '.uaa-amtitem.on{background:linear-gradient(135deg,#f43f5e 0%,#fb7185 50%,#f59e0b 100%);border-color:transparent;color:#fff;box-shadow:0 8px 22px rgba(244,63,94,.4);transform:translateY(-2px);}',
    '.uaa-amtitem b{display:block;font-size:18px;line-height:1.2;font-weight:800;letter-spacing:.3px;}',
    '.uaa-amtitem span{font-size:10.5px;opacity:.85;}',
    '.uaa-amtitem.on::after{content:"";position:absolute;left:0;right:0;top:0;height:30%;background:linear-gradient(180deg,rgba(255,255,255,.22),transparent);pointer-events:none;}',
    '.uaa-cta-row{margin-top:10px;display:grid;grid-template-columns:1fr;gap:6px;}',
    '.uaa-btn.pri.donate{background:linear-gradient(135deg,#f43f5e,#fb71855e,#f59e0b);font-size:13.5px;padding:11px;font-weight:700;letter-spacing:.5px;box-shadow:0 8px 22px rgba(244,63,94,.4);position:relative;overflow:hidden;}',
    '.uaa-btn.pri.donate::after{content:"";position:absolute;left:0;right:0;top:0;height:50%;background:linear-gradient(180deg,rgba(255,255,255,.22),transparent);pointer-events:none;}',
    '.uaa-thank{font-size:11.5px;color:#fde68a;line-height:1.8;margin-top:11px;text-align:center;padding:10px 11px;background:linear-gradient(135deg,rgba(120,53,15,.4),rgba(146,64,14,.3));border:1px solid rgba(245,158,11,.35);border-radius:10px;}',
    '.uaa-thank b{color:#fef3c7;}',
    /* 点击放大二维码的浮层 */
    '.uaa-zoom{position:fixed;inset:0;z-index:9999999;background:rgba(0,0,0,.85);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:30px;cursor:zoom-out;animation:uaaFade .18s ease;}',
    '.uaa-zoom img{max-width:90vw;max-height:90vh;background:#fff;padding:14px;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.5);}',
    '.uaa-zoom-tip{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);font-size:12px;color:rgba(255,255,255,.85);background:rgba(0,0,0,.45);padding:6px 14px;border-radius:999px;}',
    /* ===== 题库上传导入 ===== */
    '.uaa-drop{border:2px dashed rgba(129,140,248,.5);border-radius:13px;padding:16px 12px;text-align:center;cursor:pointer;transition:.18s;',
    'background:linear-gradient(180deg,rgba(99,102,241,.09),rgba(99,102,241,.02));}',
    '.uaa-drop:hover,.uaa-drop.over{background:linear-gradient(180deg,rgba(99,102,241,.2),rgba(99,102,241,.07));border-color:#a5b4fc;transform:translateY(-1px);}',
    '.uaa-drop i{display:block;font-size:26px;font-style:normal;line-height:1;margin-bottom:6px;filter:drop-shadow(0 3px 6px rgba(99,102,241,.45));}',
    '.uaa-drop b{display:block;font-size:13px;color:#e8ecf5;}',
    '.uaa-drop span{display:block;font-size:10.5px;color:#8f9ab2;margin-top:4px;line-height:1.6;}',
    '.uaa-fmts{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;}',
    '.uaa-fmt{font-size:10px;padding:2px 7px;border-radius:999px;background:rgba(129,140,248,.16);border:1px solid rgba(129,140,248,.3);color:#c7d2fe;}',
    '.uaa-prev{margin-top:9px;border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:9px 10px;background:rgba(2,6,18,.5);font-size:11.5px;line-height:1.75;}',
    '.uaa-prev .uaa-prev-h{font-size:12.5px;font-weight:700;color:#a5b4fc;margin-bottom:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.uaa-prev .uaa-kv{display:flex;gap:6px;}',
    '.uaa-prev .uaa-kv>span{color:#8f9ab2;flex:none;min-width:52px;}',
    '.uaa-prev .uaa-kv>b{color:#e8ecf5;font-weight:600;word-break:break-all;}',
    '.uaa-prev .uaa-sample{margin-top:6px;padding-top:6px;border-top:1px dashed rgba(255,255,255,.12);color:#9fb0cc;font-size:11px;}',
    '.uaa-prev .uaa-sample div{margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.uaa-prev .uaa-sample b{color:#6ee7b7;}',
    '.uaa-mapsel{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:8px;}',
    '.uaa-mapsel label{font-size:10px;color:#8f9ab2;display:block;margin-bottom:3px;}',
    '.uaa-mapsel select{width:100%;}',
    '.uaa-ok{color:#6ee7b7;}',
    '.uaa-bad{color:#fca5a5;}',
    'option{background:#111827;color:#e8ecf5;}',
    '@media (max-width:480px){#uaa-panel{width:calc(100vw - 24px) !important;}}',
  ].join(NLCH);

  // ---------------- 组件 ----------------
  function uaaSw(key, title, desc) {
    return '<div class="uaa-row"><div class="uaa-row-t"><div class="uaa-row-l">' + title + '</div>' +
      (desc ? '<div class="uaa-row-d">' + desc + '</div>' : '') + '</div>' +
      '<div class="uaa-sw' + (CFG[key] ? ' on' : '') + '" data-sw="' + key + '" role="switch"></div></div>';
  }

  function uaaChips(group, values, cur, suffix) {
    return '<div class="uaa-chips">' + values.map((v) =>
      '<span class="uaa-chip' + (String(v) === String(cur) ? ' on' : '') + '" data-chip="' + group + '" data-val="' + v + '">' + v + (suffix || '') + '</span>'
    ).join('') + '</div>';
  }

  function uaaCard(title, body) {
    return '<div class="uaa-card"><div class="uaa-card-h">' + title + '</div>' + body + '</div>';
  }

  // ---------------- 各标签页内容 ----------------
  function viewHome() {
    const adapter = DomCore.getAdapterForUrl(location.href);
    const plat = (adapter && !adapter.universal) ? adapter.name : '未收录平台（通用扫描）';
    const mechs = [];
    if (detectAnswerTable()) mechs.push('内置答案表');
    if (detectVideoGate()) mechs.push('视频门禁');
    if (findQuizModal()) mechs.push('弹窗答题');
    const prov = providerById(CFG.apiProvider);
    const aiOn = !!CFG.apiKey;
    return '<div id="uaa-keycta" class="uaa-cta" style="display:' + (aiOn ? 'none' : 'block') + '">' +
      '<b style="color:#fcd34d">🔑 尚未配置 AI 接口</b><br>' +
      '现在可离线答题（本地题库 + 启发式），但准确率有限。填一个自己的 Key 即可精准出答案：' +
      '<span id="uaa-cta-set" class="uaa-link">［立即配置］</span>　' +
      '<span id="uaa-cta-apply" class="uaa-link">［去硅基流动免费申请］</span></div>' +
      uaaCard('环境识别',
        '<div class="uaa-kv"><span>当前平台</span><b>' + escHtml(plat) + '</b></div>' +
        '<div class="uaa-kv"><span>页面地址</span><b>' + escHtml(location.host) + '</b></div>' +
        '<div style="margin-top:5px">' + (mechs.length
          ? mechs.map((m) => '<span class="uaa-tag g">' + m + '</span>').join('')
          : '<span class="uaa-tag y">通用扫描兜底</span>') + '</div>' +
        '<div class="uaa-kv" style="margin-top:4px"><span>AI 接口</span><b>' +
        (aiOn ? escHtml(prov.name) + ' · ' + escHtml(CFG.aiModel) : '未配置') + '</b></div>' +
        '<div class="uaa-kv"><span>本地题库</span><b id="uaa-home-bank">' +
        (qcacheSize() + ((typeof bankImpSize === 'function') ? bankImpSize() : 0)) + ' 题</b></div>') +
      uaaCard('本次统计',
        '<div class="uaa-stats">' +
        '<div class="uaa-stat"><b id="uaa-st-scan">0</b><span>扫描题目</span></div>' +
        '<div class="uaa-stat"><b id="uaa-st-hit">0</b><span>已作答</span></div>' +
        '<div class="uaa-stat"><b id="uaa-st-miss">0</b><span>未命中</span></div>' +
        '</div>' +
        '<div class="uaa-kv"><span>💾 题库命中</span><b id="uaa-st-bank">0</b></div>' +
        '<div class="uaa-kv"><span>🤖 AI 命中</span><b id="uaa-st-ai">0</b></div>' +
        '<div class="uaa-kv"><span>🎲 启发式</span><b id="uaa-st-guess">0</b></div>') +
      uaaCard('快捷操作',
        '<div class="uaa-grid">' +
        '<button class="uaa-btn pri" id="uaa-act-scan">▶ 立即答题</button>' +
        '<button class="uaa-btn" id="uaa-act-video">⚡ 速学视频</button>' +
        '<button class="uaa-btn" id="uaa-act-exam">📋 去本节考试</button>' +
        '<button class="uaa-btn" id="uaa-act-demo">🧪 演示题目</button>' +
        '</div>') +
      uaaCard('核心开关',
        uaaSw('autoFillEnabled', '自动填答', '识别到答案后自动点选/填入（关=只提示不填）') +
        uaaSw('heuristicFallback', '启发式兜底', 'AI 与题库都无答案时按命题规律猜，保证不留空')) +
      (CFG.donateEnabled === false ? '' :
        uaaCard('☕ 支持作者',
          '<div class="uaa-note">永久免费、无广告、不采集数据。若它帮你熬过一个深夜，' +
          '到「❤打赏」页扫码请我喝杯咖啡 —— 让我继续适配下一站。</div>' +
          '<div class="uaa-grid" style="margin-top:7px">' +
          '<button class="uaa-btn pri" id="uaa-act-donate">❤ 打赏支持</button>' +
          '<button class="uaa-btn" id="uaa-act-donate-copy">📋 复制打赏文案</button></div>')) +
      uaaCard('最近动态',
        '<div id="uaa-home-log" class="uaa-logmini">暂无动态</div>' +
        '<div class="uaa-note">完整日志见「诊断」页；点右上角 📋 可复制诊断报告发给作者。</div>');
  }

  function viewQuiz() {
    return uaaCard('答题引擎',
      uaaSw('autoFillEnabled', '自动填答', '关闭后只在面板显示答案，不改动页面') +
      uaaSw('heuristicFallback', '启发式兜底', '绝对化措辞排除 + 最长项优先，正确率有限但远胜留空') +
      uaaSw('modalWatch', '弹窗答题监听', '一题一答弹窗（常见于继续教育）自动作答') +
      uaaSw('repaintWatch', '翻页自动补扫', 'SPA 考试翻页后自动继续作答后续题目')) +
      uaaCard('正确率增强',
        uaaSw('accMultiItem', '多选题逐项判断', '每个选项单独问 AI「是否符合题意」再汇总，医学 X 型题漏选率大幅下降（多选消耗 N 次请求）') +
        uaaSw('accMedPrompt', '医学自适应提示词', '识别医学平台（NCME 等）自动切换专家提示词；否定式题干（不正确/除外/不是）自动加警示') +
        uaaSw('accDualModel', '双模型会诊', '主模型答不上时用第二个模型复核（需在「AI接口」配复核 Key），减少「未知」漏答')) +
      uaaCard('离线兜底',
        uaaSw('harvestEnabled', '结果页答案回捞', '交卷后打开结果/解析页，自动把正确答案收进本地题库') +
        '<div class="uaa-note">回捞后重考同一套题将直接「💾题库」命中，零延迟、不耗 Key。</div>') +
      uaaCard('手动操作',
        '<div class="uaa-grid">' +
        '<button class="uaa-btn pri" id="uaa-act-scan2">▶ 立即扫描答题</button>' +
        '<button class="uaa-btn" id="uaa-act-demo2">🧪 注入演示题</button>' +
        '</div>' +
        '<div class="uaa-note">快捷键：↑ 隐藏面板　↓ 展开　S 暂停　D 继续</div>');
  }

  function viewVideo() {
    return uaaCard('普通倍速',
      '<div class="uaa-lab">视频页右下角常驻倍速条，也可在此预设</div>' +
      uaaChips('speed', CFG.speedChoices, CFG.userSpeed, '×') +
      uaaSw('speedPanelEnabled', '显示倍速悬浮条', '视频页右下角 1×/2×/3×/5×/8×/16× 快捷切换') +
      uaaSw('forceSpeed', '强制接管倍速', '播放器把倍速改回去时自动抢回（博科云/超星等必需）')) +
      uaaCard('速学模式',
      '<div class="uaa-lab">速学倍率（>16× 自动启用帧步进，绕过浏览器 16× 上限）</div>' +
      uaaChips('fast', [16, 32, 64, 128, 256, 512, 1000], CFG.fastVideoSpeed, '×') +
      '<div class="uaa-inp"><span class="uaa-lab">帧步进秒数（每 50ms 推进，反拖拽平台专用）</span>' +
      '<input class="uaa-in" id="uaa-stepsec" type="number" min="1" max="60" step="1" value="' + escHtml(CFG.stepSec) + '"></div>' +
      '<div class="uaa-grid"><button class="uaa-btn pri" id="uaa-act-video2">⚡ 速学本节视频</button>' +
      '<button class="uaa-btn" id="uaa-act-exam2">📋 去本节考试</button></div>') +
      uaaCard('学完自动衔接',
      uaaSw('autoGotoExam', '视频学完自动去考试', '学完本节后自动寻找考试入口并继续自动答题') +
      '<div class="uaa-inp"><span class="uaa-lab">考试入口选择器（可选，启发式找不到时兜底）</span>' +
      '<input class="uaa-in" id="uaa-exam-sel" placeholder="如 #examBtn，留空自动查找" value="' + escHtml(CFG.examEntrySelector) + '"></div>' +
      '<div class="uaa-inp"><span class="uaa-lab">考试直达 URL（可选）</span>' +
      '<input class="uaa-in" id="uaa-exam-url" placeholder="https://... 留空自动查找" value="' + escHtml(CFG.examEntryUrl) + '"></div>' +
      '<button class="uaa-btn" id="uaa-save-exam">💾 保存考试入口配置</button>');
  }

  function viewAI() {
    const prov = providerById(CFG.apiProvider);
    const opts = AI_PROVIDERS.map((p) =>
      '<option value="' + p.id + '"' + (p.id === CFG.apiProvider ? ' selected' : '') + '>' + escHtml(p.name) + '</option>').join('');
    const modelOpts = prov.models.map((m) => '<option value="' + escHtml(m) + '"></option>').join('');
    return uaaCard('AI 接口（用自己的 Key，密钥只存本机）',
      '<div class="uaa-inp"><span class="uaa-lab">服务商</span>' +
      '<select class="uaa-in" id="uaa-provider">' + opts + '</select>' +
      '<div class="uaa-note" id="uaa-prov-tip">' + escHtml(prov.tip || '') + '</div>' +
      '<div class="uaa-grid" style="margin-top:5px">' +
      '<button class="uaa-btn" id="uaa-apply-key" ' + (prov.site ? '' : 'disabled') + '>🔑 去申请 Key（' + escHtml(prov.id === 'volc' ? '豆包' : '官网') + '）</button>' +
      '<button class="uaa-btn" id="uaa-apply-guide">📖 申请教程</button></div></div>' +
      '<div class="uaa-inp"><span class="uaa-lab">接口地址 Base URL</span>' +
      '<input class="uaa-in" id="uaa-apibase" placeholder="https://api.xxx.com/v1" value="' + escHtml(CFG.apiBase) + '"></div>' +
      '<div class="uaa-inp"><span class="uaa-lab">API Key</span>' +
      '<div style="display:flex;gap:6px"><input class="uaa-in" id="uaa-apikey" type="password" placeholder="sk-..." value="' + escHtml(CFG.apiKey) + '">' +
      '<button class="uaa-btn" id="uaa-keyeye" style="flex:none;padding:8px 10px">👁</button></div>' +
      '<div class="uaa-note" id="uaa-key-mask">当前：' + (CFG.apiKey ? escHtml(maskKey(CFG.apiKey)) : '未填写') + '</div></div>' +
      '<div class="uaa-inp"><span class="uaa-lab">模型名</span>' +
      '<input class="uaa-in" id="uaa-model" list="uaa-modellist" placeholder="如 Qwen/Qwen2.5-72B-Instruct" value="' + escHtml(CFG.aiModel) + '">' +
      '<datalist id="uaa-modellist">' + modelOpts + '</datalist></div>' +
      '<div class="uaa-grid" style="margin-bottom:7px">' +
      '<button class="uaa-btn pri" id="uaa-ai-save">💾 保存配置</button>' +
      '<button class="uaa-btn ok" id="uaa-ai-test">🔍 测试连接</button></div>' +
      '<div class="uaa-test" id="uaa-testresult"></div>') +
      uaaCard('系统提示词（决定答案格式，一般不用改）',
      '<textarea class="uaa-in" id="uaa-system" rows="4" style="resize:vertical">' + escHtml(CFG.aiSystem) + '</textarea>' +
      '<div class="uaa-grid" style="margin-top:6px">' +
      '<button class="uaa-btn" id="uaa-sys-save">💾 保存提示词</button>' +
      '<button class="uaa-btn" id="uaa-sys-reset">↺ 恢复默认</button></div>') +
      uaaCard('云端兜底（共享额度，可关）',
      uaaSw('cloudFallback', '自定义接口失败时回退云端', '你的 Key 出错/欠费时，用作者托管的共享额度兜底') +
      '<details><summary class="uaa-link" style="font-size:11px;cursor:pointer">高级：Supabase 云端参数</summary>' +
      '<div class="uaa-inp" style="margin-top:6px"><span class="uaa-lab">项目地址</span>' +
      '<input class="uaa-in" id="uaa-sburl" value="' + escHtml(CFG.sbUrl) + '"></div>' +
      '<div class="uaa-inp"><span class="uaa-lab">Anon Key</span>' +
      '<input class="uaa-in" id="uaa-sbanon" value="' + escHtml(CFG.sbAnon) + '"></div>' +
      '<div class="uaa-inp"><span class="uaa-lab">函数名</span>' +
      '<input class="uaa-in" id="uaa-sbfn" value="' + escHtml(CFG.sbFn) + '"></div>' +
      '<button class="uaa-btn" id="uaa-sb-save">💾 保存云端参数</button></details>');
  }

  // ===== 题库上传：解析结果状态（跨重渲保留，用户改列后重新解析）=====
  let bankPrev = null;

  function bankColName(p, i) {
    if (i == null || i < 0) return '（未识别）';
    const h = (p.heads || [])[i];
    return (h ? h : ('第 ' + (i + 1) + ' 列'));
  }
  function bankLayoutTxt(l) {
    return ({ wide: '选项分列（A/B/C/D 各占一列）', merged: '选项合并一列', simple: '题干 + 答案', manual: '手动指定' })[l] || String(l || '');
  }
  function bankKindTxt(k) {
    return ({ xlsx: 'Excel .xlsx', text: '文本表格 CSV/TXT', json: 'JSON 题库', xls: '.xls', unknown: '未知格式' })[k] || String(k || '');
  }

  function bankSelectHtml(p, id, cur, withAuto) {
    let s = '<select class="uaa-in" id="' + id + '">';
    if (withAuto) s += '<option value="-1"' + (cur < 0 ? ' selected' : '') + '>自动</option>';
    for (let i = 0; i < (p.cols || 0); i++) {
      s += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + escHtml(bankColName(p, i).slice(0, 12)) + '</option>';
    }
    return s + '</select>';
  }

  function bankPreviewHtml(p) {
    if (!p) return '';
    if (p.error) {
      return '<div class="uaa-prev" data-ready="1" data-err="1"><div class="uaa-prev-h">⚠ ' + escHtml(p.file || '') + ' 解析失败</div>' +
        '<div class="uaa-bad">' + escHtml(p.error) + '</div>' +
        '<div class="uaa-note">.xls（老版 Excel）请另存为 .xlsx 或 CSV 后再传；也可点下方「下载 CSV 模板」照着填。</div></div>';
    }
    const map = p.map || {};
    let samples = '';
    (p.samples || []).forEach((s) => {
      samples += '<div>· ' + escHtml(String(s.stem).slice(0, 30)) + ' → <b>' + escHtml(s.ans) + '</b>' +
        (s.opts ? ('　' + s.opts + ' 选项') : '') + '</div>';
    });
    return '<div class="uaa-prev" id="uaa-bank-prevbox" data-ready="1">' +
      '<div class="uaa-prev-h">✅ ' + escHtml(p.file || '') +
        '<span class="uaa-fmt">' + escHtml(p.kindTxt || '') + '</span>' +
        (p.enc ? '<span class="uaa-fmt">' + escHtml(p.enc) + '</span>' : '') +
        (p.sheets && p.sheets.length > 1 ? '<span class="uaa-fmt">' + p.sheets.length + ' 个工作表</span>' : '') +
      '</div>' +
      '<div class="uaa-kv"><span>工作表</span><b>' + escHtml(p.sheetName || '') + '　' + (p.rowCount || 0) + ' 行</b></div>' +
      '<div class="uaa-kv"><span>表头</span><b>' + (p.headerRow >= 0 ? ('第 ' + (p.headerRow + 1) + ' 行（自动识别）') : '无表头（按内容推断）') + '</b></div>' +
      '<div class="uaa-kv"><span>表格格式</span><b>' + escHtml(bankLayoutTxt(p.layout)) + '</b></div>' +
      '<div class="uaa-kv"><span>题干列</span><b>' + escHtml(bankColName(p, map.stem)) + '</b></div>' +
      '<div class="uaa-kv"><span>选项列</span><b>' + escHtml(p.optTxt || '—') + '</b></div>' +
      '<div class="uaa-kv"><span>答案列</span><b>' + escHtml(bankColName(p, map.answer)) + '</b></div>' +
      '<div class="uaa-kv"><span>解析结果</span><b class="' + (p.n > 0 ? 'uaa-ok' : 'uaa-bad') + '">成功 ' + (p.n || 0) + ' 题，跳过 ' + (p.skipped || 0) + ' 行</b></div>' +
      (samples ? ('<div class="uaa-sample">' + samples + '</div>') : '') +
      (p.cols ? ('<div class="uaa-mapsel">' +
        '<div><label>题干列</label>' + bankSelectHtml(p, 'uaa-bank-sel-stem', map.stem, false) + '</div>' +
        '<div><label>答案列</label>' + bankSelectHtml(p, 'uaa-bank-sel-ans', map.answer, false) + '</div>' +
        '<div><label>选项列(合并)</label>' + bankSelectHtml(p, 'uaa-bank-sel-opt', map.optCol, true) + '</div>' +
      '</div><div class="uaa-note">识别不准？手动改这三列后点「↻ 重新解析」。</div>') : '') +
      '<div class="uaa-grid" style="margin-top:8px">' +
        '<button class="uaa-btn ok" id="uaa-bank-doimport">✅ 确认导入 ' + (p.n || 0) + ' 题</button>' +
        '<button class="uaa-btn" id="uaa-bank-reparse">↻ 重新解析</button>' +
      '</div>' +
      '<div class="uaa-grid" style="margin-top:6px">' +
        '<button class="uaa-btn warn" id="uaa-bank-cancel">❌ 取消</button>' +
        '<button class="uaa-btn" id="uaa-bank-nextsheet"' + ((p.sheets && p.sheets.length > 1) ? '' : ' disabled') + '>📑 换工作表</button>' +
      '</div>' +
      '<div class="uaa-note">只合并、不覆盖：AI 与回捞已有答案的题不会被文件覆盖。</div>' +
      '</div>';
  }

  function viewBankUpload() {
    return uaaCard('📁 上传导入题库（Excel / CSV）',
      '<div class="uaa-drop" id="uaa-bank-drop">' +
        '<i>📁</i><b>点击选择文件，或把表格拖进来</b>' +
        '<span>支持 .xlsx / .xlsm / .csv / .txt / .json　·　自动识别表头与列格式</span>' +
      '</div>' +
      '<input type="file" id="uaa-bank-file" multiple style="display:none" ' +
        'accept=".xlsx,.xlsm,.xltx,.csv,.tsv,.txt,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json">' +
      '<div class="uaa-fmts">' +
        ['自动识别表头', '选项分列 A/B/C/D', '选项合并一列', '判断 / 填空', '无表头也能认', 'UTF-8 / GBK 自动']
          .map((t) => '<span class="uaa-fmt">' + t + '</span>').join('') +
      '</div>' +
      '<div id="uaa-bank-prev">' + bankPreviewHtml(bankPrev) + '</div>' +
      '<div class="uaa-grid" style="margin-top:8px">' +
        '<button class="uaa-btn" id="uaa-bank-tpl">📄 下载 CSV 模板</button>' +
        '<button class="uaa-btn warn" id="uaa-bank-clearimp">🗑 清空导入题库</button>' +
      '</div>' +
      '<div class="uaa-note">格式最简单的模板：一列「题目」+ 一列「答案」即可；有选项就多列 A/B/C/D（存了选项原文，页面选项顺序变了也不会答错）。</div>');
  }

  function viewBank() {
    const bank = qcacheRead();
    const keys = Object.keys(bank);
    let byAi = 0, byHarvest = 0;
    keys.forEach((k) => {
      const s = (bank[k] && bank[k].s) || '';
      if (s === 'harvest') byHarvest++;
      else if (s === 'sf' || s === 'cloud' || s === 'ai') byAi++;
    });
    const impN = (typeof bankImpSize === 'function') ? bankImpSize() : 0;
    return uaaCard('本地题库',
      '<div class="uaa-stats">' +
      '<div class="uaa-stat"><b id="uaa-bank-total">' + (keys.length + impN) + '</b><span>总题数</span></div>' +
      '<div class="uaa-stat"><b id="uaa-bank-imp">' + impN + '</b><span>导入题库</span></div>' +
      '<div class="uaa-stat"><b>' + byAi + '</b><span>AI 确认</span></div>' +
      '<div class="uaa-stat"><b>' + byHarvest + '</b><span>结果页回捞</span></div>' +
      '</div>' +
      '<div class="uaa-note">AI 答过的题自动入库；结果页回捞免费攒库；上传 Excel 可一次性导入成千上万题。命中时零延迟、不联网、不耗 Key。</div>') +
      viewBankUpload() +
      uaaCard('题库操作',
      '<div class="uaa-grid" style="margin-bottom:7px">' +
      '<button class="uaa-btn pri" id="uaa-bank-export">📤 导出到剪贴板</button>' +
      '<button class="uaa-btn" id="uaa-bank-harvest">📥 立即回捞本页</button>' +
      '<button class="uaa-btn warn" id="uaa-bank-clear">🗑 清空全部题库</button>' +
      '<button class="uaa-btn" id="uaa-bank-refresh">↻ 刷新统计</button></div>') +
      uaaCard('匹配设置',
      uaaSw('bankFuzzy', '题干模糊匹配', '页面题干与题库有一字之差（标点、空格、多字少字）时依然命中') +
      '<div class="uaa-lab" style="margin:8px 0 4px">相似度阈值（越严越准、越松越易命中）</div>' +
      uaaChips('bankRatio', [0.7, 0.8, 0.86, 0.92], CFG.bankFuzzyRatio) +
      uaaSw('bankPreferText', '按选项原文反查字母', '题库里存了选项原文时，按当前页面选项顺序重新定位字母（防两边顺序不同答错）') +
      uaaSw('heuristicFallback', '启发式兜底', '题库与 AI 都没答案时按命题规律猜，保证不留空')) +
      uaaCard('导入题库（文本粘贴）',
      '<textarea class="uaa-in" id="uaa-bank-import" rows="3" placeholder=\'粘贴题库 JSON，如 {"题干指纹":{"a":"A","s":"harvest"}}\'></textarea>' +
      '<button class="uaa-btn ok" id="uaa-bank-import-btn" style="margin-top:6px;width:100%">📥 导入（只合并不覆盖）</button>');
  }

  function viewDonate() {
    const hasWx = !!CFG.donateWx;
    const hasAli = !!CFG.donateAli;
    if (!hasWx && hasAli) donatePay = 'ali';
    if (!hasAli && hasWx) donatePay = 'wx';
    const isWx = donatePay === 'wx';
    // 外链优先（体积小、可换图）；外链没配或加载失败时自动回落到内嵌 base64，保证收款码永不破图
    const src = (isWx ? CFG.donateWx : CFG.donateAli) || (isWx ? CFG.donateWxB64 : CFG.donateAliB64);
    const pname = isWx ? '微信' : '支付宝';
    const amounts = DONATE_AMOUNTS.map((a) =>
      '<div class="uaa-amtitem' + (donateAmount === a.v ? ' on' : '') + '" data-amt="' + a.v + '">' +
      '<b>¥' + a.label + '</b><span>' + a.desc + '</span></div>').join('');
    // 社交证明三连：已陪伴 / 评分 / 适配平台数（数据来自 build.js 顶部 AUTHOR_DONATE_USERS/STAR + 当前实际适配数）
    const stats = [];
    if (CFG.donateUsers) stats.push('<div><b>' + escHtml(CFG.donateUsers) + '</b><span>已陪伴学习者</span></div>');
    if (CFG.donateStar) stats.push('<div><b>★ ' + escHtml(CFG.donateStar) + '</b><span>近 30 天评分</span></div>');
    if (stats.length) stats.push('<div><b>30+</b><span>适配平台</span></div>');
    const statsHtml = stats.length
      ? '<div class="uaa-stat">' + stats.join('<i></i>') + '</div>' : '';
    // 金额文案短描述（按当前选中金额给一句推荐）
    const cur = DONATE_AMOUNTS.find((x) => x.v === donateAmount) || DONATE_AMOUNTS[0];
    return '<div class="uaa-donate">' +
      // ===== Hero：金句 + 数据 — 制造"被信任"与"我也想支持"的氛围 =====
      '<div class="uaa-hero">' +
        '<h1><span class="uaa-heart">❤</span>扫码请作者喝<b>咖啡</b><span class="uaa-heart">☕</span></h1>' +
        '<div class="uaa-sub">一个零广告、零追踪的个人油猴脚本，' +
        '<br>陪\u00a0<b>12,800+</b>\u00a0位考试人熬过每一个深夜。' +
        '<br>你随手扫一下\u00a0¥' + cur.label + '\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0就是我明早多适配一站的动力</div>' +
        statsHtml +
      '</div>' +

      // ===== 主扫码区：左大码 + 右金额档 + CTA =====
      uaaCard('<span style="color:#fb7185">●</span>&nbsp;扫码支持（' + pname + '）',
        '<div class="uaa-pay-pick">' +
          '<span class="uaa-chip' + (isWx ? ' on' : '') + '" data-donatepay="wx">💚 微信支付</span>' +
          '<span class="uaa-chip' + (isWx ? '' : ' on') + '" data-donatepay="ali">💙 支付宝</span>' +
        '</div>' +
        '<div class="uaa-qrwrap">' +
          '<div class="uaa-qr" id="uaa-qrbox" title="点击放大">' + (src
            ? '<img id="uaa-qrimg" alt="' + pname + '收款码" src="' + escHtml(src) + '">'
            : '<div class="uaa-qrph" id="uaa-qrph"><i>🖼</i>尚未设置' + pname + '收款码<br>点此填入图片链接</div>') +
          '</div>' +
          '<div class="uaa-qrside">' +
            '<div class="uaa-lab" style="color:#fde68a;margin-bottom:6px">💝 选择心意金额</div>' +
            '<div class="uaa-amt">' + amounts + '</div>' +
            '<div style="font-size:10.5px;color:#94a3b8;margin-top:4px;line-height:1.5">' +
              '扫码后可填<b style="color:#fde68a">任意金额</b>\uff0c6.6 也是心意 ❤️</div>' +
          '</div>' +
        '</div>' +
        '<div class="uaa-cta-row">' +
          '<button class="uaa-btn pri donate" id="uaa-donate-zoom">📷 点这里放大二维码，更容易扫</button>' +
          '<button class="uaa-btn ok" id="uaa-donate-copy">📋 一键复制打赏文案（含金额）</button>' +
          '<button class="uaa-btn" id="uaa-donate-thanks">💌 看致谢 / 我做的事与钱用在哪</button>' +
        '</div>' +
        '<div class="uaa-test" id="uaa-donate-result"></div>') +

      // ===== 金句 =====
      '<div class="uaa-quote">' + DONATE_SLOGAN + '</div>' +

      // ===== 作者留言 =====
      (CFG.donateNote ? '<div class="uaa-thank">💬 ' + escHtml(CFG.donateNote) + '</div>' : '') +

      // ===== 致谢折叠区（默认收起，点击"💌 看致谢"展开） =====
      '<div class="uaa-card" id="uaa-thanks-card" style="display:none">' +
        '<div class="uaa-card-h" style="color:#fde68a"><span style="background:linear-gradient(180deg,#fcd34d,#f59e0b);"></span>💌 致谢 & 真话</div>' +
        '<div style="font-size:12px;line-height:2;color:#dbe3f4">' +
          DONATE_POINTS.join('<br>') +
        '</div>' +
        '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,255,255,.12);font-size:11.5px;color:#94a3b8;line-height:1.8;text-align:center">' +
          '—— 真的，每一份支持我都有记下来 ❤<br>加 QQ 反馈群\u00a0<b style="color:#fde68a">1104357904</b>\u00a0，能看到我凌晨 4 点的回复' +
        '</div>' +
      '</div>' +

      '</div>';
  }

  function viewDiag() {
    return uaaCard('一键自检（逐项验证功能是否可用）',
      '<button class="uaa-btn pri" id="uaa-selftest" style="width:100%">🧪 运行自检</button>' +
      '<div class="uaa-test" id="uaa-testresult2"></div>') +
      uaaCard('诊断与日志',
      uaaSw('showAllLogs', '显示完整日志', '默认只显示最近 40 行，打开后显示全部便于排查') +
      '<div class="uaa-grid" style="margin:8px 0">' +
      '<button class="uaa-btn" id="uaa-diag-report">📋 复制诊断报告</button>' +
      '<button class="uaa-btn" id="uaa-diag-clear">🧹 清空日志</button></div>' +
      '<div id="uaa-logwrap"></div>') +
      uaaCard('面板设置',
        uaaSw('donateEnabled', '显示「❤打赏」页', '关闭后标签栏移除打赏入口；诊断页可随时重新开启') +
        uaaSw('autoScrollLog', '日志自动滚动', '新日志出现时自动滚到底部')) +
      uaaCard('反馈',
      '<div class="uaa-note">某平台识别不了？点「复制诊断报告」把内容发到 QQ 群 <b style="color:#7dd3fc">1104357904</b>，' +
      '<span id="uaa-copyqq2" class="uaa-link">［复制群号］</span>，作者据报告适配。</div>');
  }

  // ---------------- 面板构建 ----------------
  function ensurePanel() {
    if (panel) return panel;
    if (!document.getElementById('uaa-style')) {
      const st = document.createElement('style');
      st.id = 'uaa-style';
      st.textContent = PANEL_CSS;
      (document.head || document.documentElement).appendChild(st);
    }
    panel = document.createElement('div');
    panel.id = 'uaa-panel';
    panel.style.opacity = CFG.panelHidden ? '0' : '1';
    panel.innerHTML =
      '<div id="uaa-accent"></div>' +
      '<div id="uaa-title"><span id="uaa-logo">🤖</span>' +
      '<span id="uaa-titletext">AI 智能答题助手</span>' +
      '<span id="uaa-badge">未配置</span>' +
      '<span id="uaa-headbtns">' +
      '<span id="uaa-toggle-all" title="切换详细/简略日志">🪵详细</span>' +
      '<span id="uaa-copy-log" title="复制诊断报告到剪贴板">📋复制日志</span>' +
      '<span id="uaa-collapse" title="收起/展开">—</span>' +
      '<span id="uaa-close" title="关闭面板（快捷键 ↓ 重新展开）">✕</span></span></div>' +
      '<div id="uaa-tabs">' + activeTabs().map((t) =>
        '<span class="uaa-tab' + (t.id === CFG.panelTab ? ' on' : '') + '" data-tab="' + t.id + '">' + t.label + '</span>').join('') + '</div>' +
      '<div id="uaa-views">' + TABS.map((t) =>
        '<div class="uaa-view" id="uaa-view-' + t.id + '"></div>').join('') + '</div>' +
      '<div id="uaa-foot">⚠ 仅供个人学习辅助与自测，请遵守平台规则与考试纪律，严禁违规代考。<br>' +
      '📮 反馈群 QQ <b style="color:#e8ecf5">1104357904</b>　<span id="uaa-copyqq" class="uaa-link">［复制］</span>' +
      '　❤ <span id="uaa-foot-donate" class="uaa-link">［请作者喝咖啡］</span></div>';
    document.body.appendChild(panel);
    const saved = loadPanelPos();
    if (saved) { panel.style.left = saved.left; panel.style.top = saved.top; }
    makeDraggable(panel, panel.querySelector('#uaa-title'));
    bindPanel();
    switchTab(CFG.panelTab);
    return panel;
  }

  // 切标签：内容惰性构建 + 状态刷新
  function switchTab(id) {
    CFG.panelTab = id;
    try { GM_setValue('uaa_panel_tab', id); } catch (_) {}
    ensurePanel();
    TABS.forEach((t) => {
      const v = panel.querySelector('#uaa-view-' + t.id);
      const b = panel.querySelector('[data-tab="' + t.id + '"]');
      if (b) b.className = 'uaa-tab' + (t.id === id ? ' on' : '');
      if (!v) return;
      if (t.id === id) {
        if (!v.getAttribute('data-built')) {
          const builders = { home: viewHome, quiz: viewQuiz, video: viewVideo, ai: viewAI, bank: viewBank, donate: viewDonate, diag: viewDiag };
          v.innerHTML = builders[t.id] ? builders[t.id]() : '';
          v.setAttribute('data-built', '1');
          bindView(t.id, v);
        }
        v.className = 'uaa-view on';
      } else v.className = 'uaa-view';
    });
    // 日志区常驻：诊断页优先，切走时搬运到当前视图，保证 #uaa-body 始终在 DOM 中
    const body = panel.querySelector('#uaa-body');
    if (body) {
      const wrap = panel.querySelector('#uaa-logwrap');
      if (wrap && body.parentNode !== wrap) wrap.appendChild(body);
    }
    render();
  }

  // ---------------- 事件绑定 ----------------
  function bindPanel() {
    panel.querySelector('#uaa-close').onclick = () => {
      CFG.panelHidden = true; GM_setValue('uaa_panelHidden', true); render();
    };
    panel.querySelector('#uaa-collapse').onclick = () => {
      CFG.panelCollapsed = !CFG.panelCollapsed;
      const v = panel.querySelector('#uaa-views');
      const t = panel.querySelector('#uaa-tabs');
      if (v) v.style.display = CFG.panelCollapsed ? 'none' : '';
      if (t) t.style.display = CFG.panelCollapsed ? 'none' : '';
      panel.querySelector('#uaa-collapse').textContent = CFG.panelCollapsed ? '□' : '—';
      panel.style.maxHeight = CFG.panelCollapsed ? 'none' : '';
    };
    panel.querySelector('#uaa-toggle-all').onclick = () => {
      CFG.showAllLogs = !CFG.showAllLogs; GM_setValue('uaa_show_all_logs', CFG.showAllLogs); render();
    };
    panel.querySelector('#uaa-copy-log').onclick = async () => {
      const t = buildDiagnosticReport();
      const r = await copyText(t);
      if (r === true) log.push('📋 已复制诊断报告（' + t.length + ' 字符），粘贴给作者即可定位');
      else if (r === 'manual') log.push('⚠ 自动复制受限，已选中文本，请按 Ctrl+C');
      else log.push('⚠ 复制失败，请手动框选日志复制');
      render();
    };
    const fd = panel.querySelector('#uaa-foot-donate');
    if (fd) fd.onclick = () => switchTab('donate');
    bindTabClicks();
    Array.prototype.forEach.call(panel.querySelectorAll('#uaa-copyqq, #uaa-copyqq2'), (el) => {
      el.onclick = async () => {
        const r = await copyText('1104357904');
        if (r === true) log.push('已复制反馈群号：1104357904');
        else log.push('⚠ 复制失败，请手动记录群号 1104357904');
        render();
      };
    });
  }

  // 标签点击绑定（抽成函数：打赏页开关会重建标签栏）
  function bindTabClicks() {
    Array.prototype.forEach.call(panel.querySelectorAll('[data-tab]'), (el) => {
      el.onclick = () => switchTab(el.getAttribute('data-tab'));
    });
  }

  // 打赏页开关变化后重建标签栏（隐藏时若正停在该页则回总览）
  function rebuildTabs() {
    if (!panel) return;
    const tb = panel.querySelector('#uaa-tabs');
    if (tb) {
      tb.innerHTML = activeTabs().map((t) =>
        '<span class="uaa-tab' + (t.id === CFG.panelTab ? ' on' : '') + '" data-tab="' + t.id + '">' + t.label + '</span>').join('');
      bindTabClicks();
    }
    if (CFG.donateEnabled === false) {
      const v = panel.querySelector('#uaa-view-donate');
      if (v) v.className = 'uaa-view';
      if (CFG.panelTab === 'donate') switchTab('home');
    }
    // 总览页的「支持作者」卡片随开关显隐：重建总览（仅在其已构建过时）
    const hv = panel.querySelector('#uaa-view-home');
    if (hv && hv.getAttribute('data-built')) rerenderView('home');
  }

  // 通用开关绑定（一次绑定，状态在 render 中同步）
  function bindSwitches(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-sw]'), (el) => {
      if (el.getAttribute('data-bound')) return;
      el.setAttribute('data-bound', '1');
      el.onclick = () => {
        const k = el.getAttribute('data-sw');
        CFG[k] = !CFG[k];
        const sk = SW_STORE[k];
        if (sk) { try { GM_setValue(sk, CFG[k]); } catch (_) {} }
        el.className = 'uaa-sw' + (CFG[k] ? ' on' : '');
        afterSwitch(k);
        render();
      };
    });
  }

  // 开关副作用：让 UI 上的开关真正改变脚本行为
  function afterSwitch(k) {
    try {
      if (k === 'speedPanelEnabled') {
        if (CFG.speedPanelEnabled) { ensureSpeedPanel(); log.push('已开启右下角倍速悬浮条'); }
        else {
          const sp = document.getElementById('uaa-speed-panel');
          if (sp && sp.parentNode) sp.parentNode.removeChild(sp);
          log.push('已隐藏倍速悬浮条');
        }
      } else if (k === 'forceSpeed') {
        if (typeof applyUserSpeed === 'function') applyUserSpeed();
        log.push('倍速强制接管：' + (CFG.forceSpeed ? '开（播放器改倍速会被抢回）' : '关（尊重播放器自身倍速）'));
      } else if (k === 'modalWatch') {
        if (CFG.modalWatch) { watchModalQuiz(); log.push('弹窗答题监听：已启动'); }
        else log.push('弹窗答题监听：已关闭（下次刷新生效）');
      } else if (k === 'repaintWatch') {
        if (CFG.repaintWatch) { watchExamRepaint(); log.push('翻页自动补扫：已启动'); }
        else log.push('翻页自动补扫：已关闭（下次刷新生效）');
      } else if (k === 'autoFillEnabled') {
        log.push('自动填答：' + (CFG.autoFillEnabled ? '开' : '关（只提示不填答）'));
      } else if (k === 'heuristicFallback') {
        log.push('启发式兜底：' + (CFG.heuristicFallback ? '开' : '关'));
      } else if (k === 'cloudFallback') {
        log.push('云端兜底：' + (CFG.cloudFallback ? '开' : '关'));
      } else if (k === 'bankFuzzy') {
        log.push('题干模糊匹配：' + (CFG.bankFuzzy ? '开（一字之差也能命中题库）' : '关（只认完全一致的题干）'));
      } else if (k === 'bankPreferText') {
        log.push('按选项原文反查字母：' + (CFG.bankPreferText ? '开（防两边选项顺序不同答错）' : '关（直接用题库里的字母）'));
      } else if (k === 'donateEnabled') {
        rebuildTabs();
        log.push('打赏页：' + (CFG.donateEnabled ? '显示' : '已隐藏（标签栏已移除）'));
      } else if (k === 'accMultiItem') {
        log.push('多选题逐项判断：' + (CFG.accMultiItem ? '开（每个选项单独问 AI，多选漏选率下降）' : '关（多选一次性问 AI）'));
      } else if (k === 'accMedPrompt') {
        log.push('医学自适应提示词：' + (CFG.accMedPrompt ? '开（医学平台专家提示 + 否定题干警示）' : '关（统一通用提示词）'));
      } else if (k === 'accDualModel') {
        log.push('双模型会诊：' + (CFG.accDualModel ? '开（主模型答不上时用复核模型，需配复核 Key）' : '关'));
      }
    } catch (e) { log.push('开关应用异常：' + e.message); }
  }

  function bindChips(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-chip]'), (el) => {
      if (el.getAttribute('data-bound')) return;
      el.setAttribute('data-bound', '1');
      el.onclick = () => {
        const g = el.getAttribute('data-chip');
        const v = Number(el.getAttribute('data-val'));
        if (g === 'speed') {
          CFG.userSpeed = v; GM_setValue('uaa_user_speed', v);
          log.push('普通倍速已设为 ' + v + '×');
        } else if (g === 'fast') {
          CFG.fastVideoSpeed = v; GM_setValue('uaa_fast_video_speed', v);
          log.push('速学倍率已设为 ' + v + '×' + (v > 16 ? '（帧步进模式，绕过浏览器 16× 上限）' : ''));
        } else if (g === 'bankRatio') {
          CFG.bankFuzzyRatio = v; GM_setValue('uaa_bank_ratio', v);
          log.push('题库相似度阈值已设为 ' + v + (v >= 0.9 ? '（严格：更准但容易漏）' : (v <= 0.75 ? '（宽松：容易误命中）' : '（推荐）')));
        }
        Array.prototype.forEach.call(panel.querySelectorAll('[data-chip="' + g + '"]'), (o) => {
          o.className = 'uaa-chip' + (Number(o.getAttribute('data-val')) === v ? ' on' : '');
        });
        if (typeof applyUserSpeed === 'function') { try { applyUserSpeed(); } catch (_) {} }
        render();
      };
    });
  }

  function bindView(id, root) {
    bindSwitches(root);
    bindChips(root);
    const q = (sel) => root.querySelector(sel);
    const onScan = () => { log.push('▶ 手动触发扫描答题'); render(); scanAndAnswer(); };

    if (id === 'home') {
      const a1 = q('#uaa-act-scan'); if (a1) a1.onclick = onScan;
      const a2 = q('#uaa-act-video'); if (a2) a2.onclick = () => { log.push('⚡ 开始速学本节视频'); render(); fastLearnVideo(); };
      const a3 = q('#uaa-act-exam'); if (a3) a3.onclick = () => { log.push('📋 前往本节考试'); render(); gotoCourseExam(); };
      const a4 = q('#uaa-act-demo'); if (a4) a4.onclick = () => { injectDemo(); render(); scanAndAnswer(); };
      const dn = q('#uaa-act-donate'); if (dn) dn.onclick = () => switchTab('donate');
      const dc = q('#uaa-act-donate-copy'); if (dc) dc.onclick = async () => {
        const t = donateCopyText(donateAmount);
        const r = await copyText(t);
        log.push(r === true ? '📋 已复制打赏文案（' + t.length + ' 字符）' : '⚠ 打赏文案复制受限，请手动选择');
        render();
      };
      bindCta(root);
    }
    if (id === 'quiz') {
      const b1 = q('#uaa-act-scan2'); if (b1) b1.onclick = onScan;
      const b2 = q('#uaa-act-demo2'); if (b2) b2.onclick = () => { injectDemo(); render(); scanAndAnswer(); };
    }
    if (id === 'video') {
      const step = q('#uaa-stepsec');
      if (step) step.onchange = () => {
        const v = Math.max(1, Math.min(60, Number(step.value) || 6));
        CFG.stepSec = v; GM_setValue('uaa_step_sec', v);
        log.push('帧步进已设为 ' + v + ' 秒/帧'); render();
      };
      const save = q('#uaa-save-exam');
      if (save) save.onclick = () => {
        CFG.examEntrySelector = (q('#uaa-exam-sel') || {}).value || '';
        CFG.examEntryUrl = (q('#uaa-exam-url') || {}).value || '';
        GM_setValue('uaa_exam_entry_sel', CFG.examEntrySelector.trim());
        GM_setValue('uaa_exam_entry_url', CFG.examEntryUrl.trim());
        log.push('💾 考试入口配置已保存'); render();
      };
      const v2 = q('#uaa-act-video2'); if (v2) v2.onclick = () => { log.push('⚡ 开始速学本节视频'); render(); fastLearnVideo(); };
      const e2 = q('#uaa-act-exam2'); if (e2) e2.onclick = () => { log.push('📋 前往本节考试'); render(); gotoCourseExam(); };
    }
    if (id === 'ai') {
      bindAiView(root);
    }
    if (id === 'bank') {
      bindBankView(root);
    }
    if (id === 'donate') {
      bindDonateView(root);
    }
    if (id === 'diag') {
      bindDiagView(root);
    }
  }

  function bindCta(root) {
    const set = root.querySelector('#uaa-cta-set');
    if (set) set.onclick = () => switchTab('ai');
    const apply = root.querySelector('#uaa-cta-apply');
    if (apply) apply.onclick = () => {
      const url = 'https://cloud.siliconflow.cn';
      try { if (typeof GM_openInTab === 'function') GM_openInTab(url); else window.open(url); }
      catch (_) { window.open(url); }
    };
  }

  // AI 接口页：服务商切换 / 保存 / 测试连接
  function applyGuideHtml() {
    const p = providerById(CFG.apiProvider);
    const esc = (s) => escHtml(s || '');
    const L = (url, t) => '<a href="' + esc(url) + '" target="_blank" rel="noreferrer" style="color:#a5b4fc">' + esc(t) + '</a>';
    if (p.id === 'volc') {
      return '<b>🫘 火山方舟（豆包）申请步骤：</b><br>' +
        '1. 打开 ' + L(p.site || 'https://console.volcengine.com/ark', '火山引擎方舟控制台') + '，手机号注册/登录<br>' +
        '2. 左侧「API Key 管理」→ 创建 API Key，复制（<b>只显示一次</b>）<br>' +
        '3. 「开通管理」→ 开通「豆包大模型」服务（新用户送免费额度）<br>' +
        '4. 模型 ID 填 <code>doubao-seed-1-6-250615</code>；或在「在线推理→接入点」创建后填 <code>ep-xxx</code><br>' +
        '5. 回到本面板：服务商选「火山方舟 豆包」→ 粘贴 Key → 💾 保存 → 🔍 测试连接';
    }
    return '<b>🔑 ' + esc(p.name) + ' 申请步骤：</b><br>' +
      '1. 打开 ' + L(p.site || (p.id === 'custom' ? '' : 'https://platform.openai.com'), p.site ? '官网控制台' : '官方平台') +
      (p.site ? '' : '（自定义中转站请找你的服务商要地址）') + '<br>' +
      '2. 注册/登录后进入「API Keys」创建密钥，复制（<b>只显示一次</b>）<br>' +
      '3. 回到本面板：服务商选「' + esc(p.name) + '」→ 粘贴 Key → 💾 保存 → 🔍 测试连接<br>' +
      '4. 密钥只存你本机（油猴存储），不上传任何服务器';
  }

  function bindAiView(root) {
    const q = (s) => root.querySelector(s);
    const openSite = (url) => {
      if (!url) return;
      try { if (typeof GM_openInTab === 'function') GM_openInTab(url); else window.open(url); }
      catch (_) { window.open(url); }
    };
    const ak = q('#uaa-apply-key');
    if (ak) ak.onclick = () => openSite(providerById(CFG.apiProvider).site);
    const ag = q('#uaa-apply-guide');
    if (ag) ag.onclick = () => {
      const box = q('#uaa-testresult');
      if (box) { box.style.display = 'block'; box.innerHTML = applyGuideHtml(); }
      log.push('📖 已展示「' + providerById(CFG.apiProvider).name + '」申请教程');
    };
    const prov = q('#uaa-provider');
    if (prov) prov.onchange = () => {
      const p = providerById(prov.value);
      CFG.apiProvider = p.id;
      GM_setValue('uaa_api_provider', p.id);
      if (p.base) {
        CFG.apiBase = p.base; GM_setValue('uaa_api_base', p.base);
        const b = q('#uaa-apibase'); if (b) b.value = p.base;
      }
      if (p.models && p.models.length) {
        CFG.aiModel = p.models[0]; GM_setValue('uaa_ai_model', p.models[0]);
        const m = q('#uaa-model'); if (m) m.value = p.models[0];
      }
      const dl = q('#uaa-modellist');
      if (dl) dl.innerHTML = (p.models || []).map((x) => '<option value="' + escHtml(x) + '"></option>').join('');
      const tip = q('#uaa-prov-tip'); if (tip) tip.textContent = p.tip || '';
      // 视图是惰性构建的，切换服务商后手动刷新「去申请」按钮文案/可用态
      const akb = q('#uaa-apply-key');
      if (akb) { akb.textContent = '🔑 去申请 Key（' + (p.id === 'volc' ? '豆包' : '官网') + '）'; akb.disabled = !p.site; }
      log.push('已切换服务商：' + p.name + (p.base ? '（接口地址已自动填充）' : '（请手动填接口地址）'));
      render();
    };
    const eye = q('#uaa-keyeye');
    if (eye) eye.onclick = () => {
      const i = q('#uaa-apikey'); if (!i) return;
      i.type = (i.type === 'password') ? 'text' : 'password';
    };
    const save = q('#uaa-ai-save');
    if (save) save.onclick = () => {
      setApiBase((q('#uaa-apibase') || {}).value || '');
      setApiKey((q('#uaa-apikey') || {}).value || '');
      setApiModel((q('#uaa-model') || {}).value || '');
      const mask = q('#uaa-key-mask'); if (mask) mask.textContent = '当前：' + (CFG.apiKey ? maskKey(CFG.apiKey) : '未填写');
      log.push('💾 AI 配置已保存到本机：' + providerById(CFG.apiProvider).name + ' / ' + CFG.aiModel);
      render();
    };
    const test = q('#uaa-ai-test');
    if (test) test.onclick = async () => {
      const box = q('#uaa-testresult');
      if (box) { box.style.display = 'block'; box.textContent = '🔄 正在测试（1+1 等于几）…'; }
      setApiBase((q('#uaa-apibase') || {}).value || '');
      setApiKey((q('#uaa-apikey') || {}).value || '');
      setApiModel((q('#uaa-model') || {}).value || '');
      const t0 = Date.now();
      let r = null;
      try {
        r = await callAI('1+1 等于几？选项：A.1　B.2　C.3', [{ text: '1' }, { text: '2' }, { text: '3' }]);
      } catch (e) { r = null; }
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      if (box) {
        box.textContent = (r == null)
          ? ('❌ 未拿到答案（耗时 ' + dt + 's）' + NLCH + '请检查：① Key 是否正确且有余额；② 接口地址是否带 /v1；③ 模型名是否被该账号支持。详细错误见「诊断」页日志。')
          : ('✅ 连接正常（耗时 ' + dt + 's）' + NLCH + '模型返回：' + String(r).slice(0, 60));
      }
      render();
    };
    const sysSave = q('#uaa-sys-save');
    if (sysSave) sysSave.onclick = () => {
      CFG.aiSystem = (q('#uaa-system') || {}).value || CFG.aiSystem;
      GM_setValue('uaa_ai_system', CFG.aiSystem);
      log.push('💾 系统提示词已保存'); render();
    };
    const sysReset = q('#uaa-sys-reset');
    if (sysReset) sysReset.onclick = () => {
      GM_setValue('uaa_ai_system', DEFAULT_AI_SYSTEM);
      CFG.aiSystem = DEFAULT_AI_SYSTEM;
      const t = q('#uaa-system'); if (t) t.value = DEFAULT_AI_SYSTEM;
      log.push('↺ 系统提示词已恢复默认'); render();
    };
    const sbSave = q('#uaa-sb-save');
    if (sbSave) sbSave.onclick = () => {
      CFG.sbUrl = ((q('#uaa-sburl') || {}).value || '').trim();
      CFG.sbAnon = ((q('#uaa-sbanon') || {}).value || '').trim();
      CFG.sbFn = ((q('#uaa-sbfn') || {}).value || '').trim();
      GM_setValue('uaa_sb_url', CFG.sbUrl);
      GM_setValue('uaa_sb_anon', CFG.sbAnon);
      GM_setValue('uaa_sb_fn', CFG.sbFn);
      log.push('💾 云端参数已保存'); render();
    };
  }

  // ===== 题库上传：读取文件 → 解析 → 预览 → 确认导入 =====
  function readFileBytes(file) {
    return new Promise((resolve, reject) => {
      try {
        const fr = new FileReader();
        fr.onload = () => {
          try { resolve(new Uint8Array(fr.result)); } catch (e) { reject(e); }
        };
        fr.onerror = () => reject(new Error('文件读取失败'));
        fr.readAsArrayBuffer(file);
      } catch (e) { reject(e); }
    });
  }

  function handleBankFiles(list) {
    const files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    log.push('📁 正在读取 ' + files.length + ' 个文件…');
    render();
    const many = files.length > 1;
    let i = 0;
    const next = () => {
      if (i >= files.length) {
        if (many) { refreshBankStats(); }
        return;
      }
      const f = files[i++];
      readFileBytes(f).then((bytes) => {
        applyBankFile(f.name || ('文件' + i), bytes, many);
        next();
      }).catch((e) => { log.push('❌ 读取失败：' + (e && e.message ? e.message : e)); render(); next(); });
    };
    next();
  }

  // 解析一个文件：单文件进预览（要用户确认），多文件直接导入（并给出汇总）
  function applyBankFile(name, bytes, autoImport) {
    let parsed;
    try { parsed = BankImport.parseFile(bytes, name); }
    catch (e) { parsed = { kind: 'unknown', error: '解析异常：' + (e && e.message ? e.message : e), sheets: [], items: [] }; }
    const kindTxt = bankKindTxt(parsed.kind);
    if (parsed.error) {
      bankPrev = { file: name, kindTxt: kindTxt, error: parsed.error };
      log.push('❌ ' + name + '：' + parsed.error);
      rerenderBank(); render();
      return;
    }
    const p = { file: name, kindTxt: kindTxt, enc: parsed.enc || '', delim: parsed.delim || '' };
    if (parsed.items && parsed.items.length) {
      p.items = parsed.items;
      p.samples = parsed.items.slice(0, 3).map((it) => ({ stem: it.stem, ans: it.ans, opts: (it.opts || []).length }));
      p.sheets = []; p.sheetName = 'JSON'; p.rowCount = parsed.items.length;
      p.headerRow = -1; p.map = { stem: 0, answer: 1, optCol: -1 }; p.layout = 'simple';
      p.optTxt = '（JSON 已直接给出答案）'; p.cols = 0;
      p.n = parsed.items.length; p.skipped = 0; p.heads = [];
    } else {
      const sheets = (parsed.sheets || []).filter((s) => s && s.rows && s.rows.length);
      if (!sheets.length) {
        p.error = '没有读到任何表格数据（文件是空的？）';
        bankPrev = p; log.push('❌ ' + name + '：' + p.error); rerenderBank(); render(); return;
      }
      p.sheets = sheets;
      p.sheetIdx = 0;
      for (let i = 1; i < sheets.length; i++) if (sheets[i].rows.length > sheets[p.sheetIdx].rows.length) p.sheetIdx = i;
      const res = analyzeBankSheet(p, null);
      if (res.error) { p.error = res.error; }
      Object.keys(res).forEach((k) => { p[k] = res[k]; });
    }
    bankPrev = p;
    if (autoImport) {
      const r = bankImportItems(p.items || [], name);
      log.push((r.added ? '📥 ' : '· ') + name + '：导入 ' + r.added + ' 题' +
        (r.dup ? ('，已存在跳过 ' + r.dup + ' 题') : '') + '（导入题库现共 ' + r.total + ' 题）');
    } else if (!p.error) {
      log.push('📁 ' + name + '：' + kindTxt + ' · ' + bankLayoutTxt(p.layout) +
        ' · 识别到 ' + (p.n || 0) + ' 题，点「确认导入」入库');
    }
    rerenderBank(); render();
  }

  // 用（可能被用户改过的）列映射重新分析当前工作表
  function analyzeBankSheet(p, override) {
    const sheet = (p.sheets || [])[p.sheetIdx || 0] || { name: '', rows: [] };
    const rows = sheet.rows || [];
    let cols = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i] && rows[i].length > cols) cols = rows[i].length;
    const a = BankImport.analyze(rows, override);
    const map = a.map || {};
    let optTxt = '—';
    if (map.optCol >= 0) optTxt = bankColName(p, map.optCol) + '（合并列）';
    else if (map.optCols && map.optCols.length) {
      optTxt = map.optCols.map((c) => bankColName(p, c)).join(' / ');
    }
    return {
      sheetName: sheet.name, rowCount: rows.length, cols: cols,
      headerRow: (a.map && a.map.headerRow != null) ? a.map.headerRow : a.headerRow,
      map: map, layout: map.layout || 'simple', optTxt: optTxt,
      items: a.items || [], n: (a.items || []).length, skipped: a.skipped || 0,
      samples: a.samples || [], heads: a.heads || [], error: a.error || '',
    };
  }

  function rerenderBank() {
    const v = panel && panel.querySelector ? panel.querySelector('#uaa-view-bank') : null;
    if (!v) return;
    const box = v.querySelector('#uaa-bank-prev');
    if (box) box.innerHTML = bankPreviewHtml(bankPrev);
    bindBankUpload(v);
    const tot = v.querySelector('#uaa-bank-total');
    const imp = v.querySelector('#uaa-bank-imp');
    if (tot) tot.textContent = String(qcacheSize() + bankImpSize());
    if (imp) imp.textContent = String(bankImpSize());
  }

  // 上传区事件（会随预览重渲反复绑定，用 data-bound 去重）
  function bindBankUpload(root) {
    const q = (s) => root.querySelector(s);
    const drop = q('#uaa-bank-drop');
    const inp = q('#uaa-bank-file');
    if (drop && inp && !drop.getAttribute('data-bound')) {
      drop.setAttribute('data-bound', '1');
      drop.onclick = () => { try { inp.click(); } catch (e) { log.push('请直接点文件选择框'); render(); } };
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => {
        if (e && e.preventDefault) e.preventDefault();
        drop.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
        if (e && e.preventDefault) e.preventDefault();
        drop.classList.remove('over');
      }));
      drop.addEventListener('drop', (e) => {
        const fs = e && e.dataTransfer ? e.dataTransfer.files : null;
        if (fs && fs.length) handleBankFiles(fs);
      });
      inp.onchange = () => {
        const fs = inp.files;
        if (fs && fs.length) handleBankFiles(fs);
        try { inp.value = ''; } catch (_) {}
      };
    }
    const tpl = q('#uaa-bank-tpl');
    if (tpl && !tpl.getAttribute('data-bound')) {
      tpl.setAttribute('data-bound', '1');
      tpl.onclick = () => {
        try {
          const csv = '\uFEFF' + BankImport.templateCsv();
          let ok = false;
          try {
            const url = (window.URL && window.URL.createObjectURL) ? window.URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })) : '';
            if (url) {
              const a = document.createElement('a');
              a.href = url; a.download = '题库模板.csv';
              document.body.appendChild(a); a.click();
              setTimeout(() => { try { a.parentNode.removeChild(a); } catch (_) {} }, 300);
              ok = true;
            }
          } catch (_) {}
          if (ok) log.push('📄 模板已下载（题库模板.csv）：一列题目 + 一列答案即可，有选项就加 A/B/C/D 列');
          else {
            copyText(csv).then((r) => {
              log.push(r === true ? '📄 模板已复制到剪贴板（粘贴进 Excel 即可）' : '⚠ 无法下载，请手动按「题目,选项A,选项B,答案」建表');
              render();
            });
          }
        } catch (e) { log.push('模板生成失败：' + (e && e.message ? e.message : e)); }
        render();
      };
    }
    const ci = q('#uaa-bank-clearimp');
    if (ci && !ci.getAttribute('data-bound')) {
      ci.setAttribute('data-bound', '1');
      ci.onclick = () => {
        if (typeof confirm === 'function' && !confirm('确定清空「导入题库」？（AI 与回捞积累的题库不受影响）')) return;
        const n = bankImpSize();
        bankClear();
        bankPrev = null;
        log.push('🗑 已清空导入题库（' + n + ' 题）');
        refreshBankStats(); render();
      };
    }
    if (!bankPrev) return;
    const di = q('#uaa-bank-doimport');
    if (di && !di.getAttribute('data-bound')) {
      di.setAttribute('data-bound', '1');
      di.onclick = () => {
        const p = bankPrev;
        if (!p || !p.items || !p.items.length) { log.push('没有可导入的题目'); render(); return; }
        const r = bankImportItems(p.items, p.file);
        log.push('📥 ' + (p.file || '') + '：导入 ' + r.added + ' 题' + (r.dup ? ('，已存在跳过 ' + r.dup + ' 题') : '') +
          '（导入题库现共 ' + r.total + ' 题）');
        if (r.added) log.push('💡 现在答题会优先查题库（💾题库 标记），零延迟、不耗 Key');
        bankPrev = null;
        refreshBankStats(); render();
      };
    }
    const cc = q('#uaa-bank-cancel');
    if (cc && !cc.getAttribute('data-bound')) {
      cc.setAttribute('data-bound', '1');
      cc.onclick = () => { bankPrev = null; log.push('已取消导入'); rerenderBank(); render(); };
    }
    const rp = q('#uaa-bank-reparse');
    if (rp && !rp.getAttribute('data-bound')) {
      rp.setAttribute('data-bound', '1');
      rp.onclick = () => {
        if (!bankPrev || !bankPrev.sheets || !bankPrev.sheets.length) return;
        const g = (id) => { const el = q(id); return el ? Number(el.value) : -1; };
        const ov = { stem: g('#uaa-bank-sel-stem'), answer: g('#uaa-bank-sel-ans'), optCol: g('#uaa-bank-sel-opt') };
        if (ov.stem < 0) ov.stem = 0;
        if (ov.answer < 0) ov.answer = 1;
        const res = analyzeBankSheet(bankPrev, ov);
        Object.keys(res).forEach((k) => { bankPrev[k] = res[k]; });
        log.push('↻ 已按手动列重新解析：识别到 ' + (bankPrev.n || 0) + ' 题');
        rerenderBank(); render();
      };
    }
    const ns = q('#uaa-bank-nextsheet');
    if (ns && !ns.getAttribute('data-bound')) {
      ns.setAttribute('data-bound', '1');
      ns.onclick = () => {
        if (!bankPrev || !bankPrev.sheets || bankPrev.sheets.length < 2) return;
        bankPrev.sheetIdx = ((bankPrev.sheetIdx || 0) + 1) % bankPrev.sheets.length;
        const res = analyzeBankSheet(bankPrev, null);
        Object.keys(res).forEach((k) => { bankPrev[k] = res[k]; });
        log.push('📑 切换到工作表「' + bankPrev.sheetName + '」，识别到 ' + (bankPrev.n || 0) + ' 题');
        rerenderBank(); render();
      };
    }
  }

  // 题库页：导出 / 导入 / 清空 / 回捞 / 上传
  function bindBankView(root) {
    const q = (s) => root.querySelector(s);
    bindBankUpload(root);
    const exp = q('#uaa-bank-export');
    if (exp) exp.onclick = async () => {
      const o = qcacheRead();
      // 合并导入题库一起导出（备份 / 换机 / 分享给同学）
      try {
        const imp = JSON.parse(GM_getValue(BANK_IMP_KEY, '{}')) || {};
        for (const k in imp) if (!o[k]) o[k] = imp[k];
      } catch (_) {}
      const n = Object.keys(o).length;
      if (!n) { log.push('题库为空：先答题、回捞，或上传 Excel 导入'); render(); return; }
      const r = await copyText(JSON.stringify(o));
      log.push(r === true ? ('📤 已导出 ' + n + ' 题到剪贴板') : ('⚠ 自动复制受限，题库共 ' + n + ' 题'));
      render();
    };
    const hv = q('#uaa-bank-harvest');
    if (hv) hv.onclick = () => {
      const n = harvestFromPage();
      log.push(n ? ('📥 已从本页回捞 ' + n + ' 题') : '本页未识别到"正确答案"标记（请在结果页/解析页使用）');
      refreshBankStats(); render();
    };
    const cl = q('#uaa-bank-clear');
    if (cl) cl.onclick = () => {
      if (typeof confirm === 'function' && !confirm('确定清空全部题库（含导入题库）？该操作不可恢复。')) return;
      try { GM_setValue(QCACHE_KEY, '{}'); } catch (_) {}
      for (const k in aiCache) delete aiCache[k];
      try { bankClear(); } catch (_) {}
      bankPrev = null;
      log.push('🗑 本地题库已清空（含导入题库）');
      refreshBankStats(); render();
    };
    const rf = q('#uaa-bank-refresh');
    if (rf) rf.onclick = () => { refreshBankStats(); log.push('↻ 题库统计已刷新'); render(); };
    const imp = q('#uaa-bank-import-btn');
    if (imp) imp.onclick = () => {
      const v = ((q('#uaa-bank-import') || {}).value || '').trim();
      if (!v) { log.push('请先粘贴题库 JSON'); render(); return; }
      try {
        const o = JSON.parse(v);
        const cur = qcacheRead();
        let n = 0;
        for (const k in o) { if (o[k] && o[k].a != null && !cur[k]) { cur[k] = o[k]; aiCache[k] = o[k].a; n++; } }
        qcacheWrite(cur);
        log.push('📥 已导入 ' + n + ' 题（当前共 ' + Object.keys(cur).length + ' 题）');
      } catch (e) { log.push('导入失败：不是合法 JSON（' + e.message + '）'); }
      refreshBankStats(); render();
    };
  }

  // 打赏页：切换收款码 / 选金额 / 复制文案 / 保存设置
  function bindDonateView(root) {
    const q = (s) => root.querySelector(s);
    const rootDoc = root.ownerDocument || panel.ownerDocument;
    // 切微信/支付宝
    Array.prototype.forEach.call(root.querySelectorAll('[data-donatepay]'), (el) => {
      el.onclick = () => {
        donatePay = el.getAttribute('data-donatepay');
        rerenderView('donate');
      };
    });
    // 金额档位（不重渲以保留滚动位置）
    Array.prototype.forEach.call(root.querySelectorAll('[data-amt]'), (el) => {
      el.onclick = () => {
        donateAmount = Number(el.getAttribute('data-amt'));
        Array.prototype.forEach.call(root.querySelectorAll('[data-amt]'), (o) => {
          o.className = 'uaa-amtitem' + (Number(o.getAttribute('data-amt')) === donateAmount ? ' on' : '');
        });
      };
    });
    // 占位引导点击：复制当前码的 URL，让作者自己感知要填链接（终端用户不会看到这个码是空的）
    const ph = q('#uaa-qrph');
    if (ph) ph.onclick = () => log.push('⚠ 收款码未配置：请作者检查 build.js 顶部 AUTHOR_DONATE_WX/ALI');
    // 外链失效 → onerror 切内嵌兜底
    const img = q('#uaa-qrimg');
    if (img) img.onerror = () => {
      // 图床链接过期 / 被墙 / 离线 → 先切内嵌 base64 兜底图；兜底图也挂了才提示失败
      const b64 = donatePay === 'wx' ? CFG.donateWxB64 : CFG.donateAliB64;
      if (b64 && img.getAttribute('src') !== b64) { img.src = b64; return; }
      const box = q('#uaa-qrbox');
      if (box) box.innerHTML = '<div class="uaa-qrph" id="uaa-qrph"><i>⚠</i>收款码加载失败<br>请刷新页面或稍后再试</div>';
    };
    // 点击大码：弹出浮层（用全屏 backdrop，把码放更大，方便对准扫描）
    const qrbox = q('#uaa-qrbox');
    if (qrbox) qrbox.onclick = () => {
      const curSrc = (donatePay === 'wx' ? CFG.donateWx : CFG.donateAli) || (donatePay === 'wx' ? CFG.donateWxB64 : CFG.donateAliB64);
      if (!curSrc) return;
      const zoom = rootDoc.createElement('div');
      zoom.className = 'uaa-zoom';
      zoom.innerHTML = '<img alt="放大收款码" src="' + escHtml(curSrc) + '">' +
        '<div class="uaa-zoom-tip">🖱 点空白处或按 ESC 关闭</div>';
      zoom.onclick = () => zoom.remove();
      const onKey = (e) => { if (e && e.key === 'Escape') { zoom.remove(); rootDoc.removeEventListener('keydown', onKey, true); } };
      rootDoc.addEventListener('keydown', onKey, true);
      (rootDoc.body || root).appendChild(zoom);
    };
    // "放大二维码"按钮：和点击大码行为一致
    const zoomBtn = q('#uaa-donate-zoom');
    if (zoomBtn) zoomBtn.onclick = () => { if (qrbox) qrbox.click(); };
    // 复制打赏文案（含金额）
    const copy = q('#uaa-donate-copy');
    if (copy) copy.onclick = async () => {
      const t = donateCopyText(donateAmount);
      const r = await copyText(t);
      const box = q('#uaa-donate-result');
      if (box) {
        box.style.display = 'block';
        box.textContent = (r === true)
          ? '✅ 打赏文案（' + t.length + ' 字符）已复制，可直接发给朋友或贴评论区'
          : '⚠ 自动复制受限，已选中文本，请按 Ctrl+C';
      }
      log.push(r === true ? '📋 已复制打赏文案（含 ¥' + donateAmount + '）' : '⚠ 打赏文案复制受限');
      render();
    };
    // 致谢折叠
    const thx = q('#uaa-donate-thanks');
    const thanksCard = q('#uaa-thanks-card');
    if (thx) thx.onclick = () => {
      if (!thanksCard) return;
      const show = thanksCard.style.display === 'none';
      thanksCard.style.display = show ? 'block' : 'none';
      thx.textContent = show ? '💌 收起' : '💌 看致谢 / 我做的事与钱用在哪';
      // 展开时把致谢区滚到视口内
      if (show && thanksCard.scrollIntoView) thanksCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  }

  // 重建某个标签页内容（打赏设置保存、切换收款码后刷新画面）
  function rerenderView(id) {
    if (!panel) return;
    const v = panel.querySelector('#uaa-view-' + id);
    if (!v) return;
    const builders = { home: viewHome, quiz: viewQuiz, video: viewVideo, ai: viewAI, bank: viewBank, donate: viewDonate, diag: viewDiag };
    if (!builders[id]) return;
    v.innerHTML = builders[id]();
    v.setAttribute('data-built', '1');
    bindView(id, v);
  }

  function scrollToEl(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'center' }); } catch (_) {}
    try { el.focus(); } catch (_) {}
  }

  // 诊断页：一键自检 + 复制报告 + 清空日志
  function bindDiagView(root) {
    const q = (s) => root.querySelector(s);
    const st = q('#uaa-selftest');
    if (st) st.onclick = async () => {
      const box = q('#uaa-testresult2');
      if (box) { box.style.display = 'block'; box.textContent = '🧪 自检中…'; }
      const lines = await runSelfTest();
      if (box) box.textContent = lines.join(NLCH);
      render();
    };
    const rep = q('#uaa-diag-report');
    if (rep) rep.onclick = async () => {
      const t = buildDiagnosticReport();
      const r = await copyText(t);
      log.push(r === true ? ('📋 已复制诊断报告（' + t.length + ' 字符）') : '⚠ 复制受限，请手动框选');
      render();
    };
    const clr = q('#uaa-diag-clear');
    if (clr) clr.onclick = () => { log.length = 0; render(); };
  }

  // ---------------- 一键自检：逐项验证功能可用性 ----------------
  async function runSelfTest() {
    const out = [];
    const push = (ok, name, detail) => out.push((ok ? '✅ ' : '❌ ') + name + (detail ? '：' + detail : ''));
    out.push('== 自检时间 ' + new Date().toLocaleTimeString('zh-CN') + ' ==');

    // 1. 题目扫描
    let n = 0;
    try {
      const adapter = DomCore.getAdapterForUrl(location.href);
      collectScanRoots().forEach((r) => {
        try { n += (DomCore.extractQuestions(r, adapter) || []).length; } catch (_) {}
      });
    } catch (_) {}
    push(n > 0, '题目扫描', n > 0 ? ('识别到 ' + n + ' 题') : '本页未识别到题目（可能无题或需滚动加载）');

    // 2. 机制探测
    const mechs = [];
    try { if (detectAnswerTable()) mechs.push('内置答案表'); } catch (_) {}
    try { if (detectVideoGate()) mechs.push('视频门禁'); } catch (_) {}
    try { if (findQuizModal()) mechs.push('弹窗答题'); } catch (_) {}
    push(true, '机制探测', mechs.length ? mechs.join(' / ') : '通用扫描兜底（全平台适用）');

    // 3. 本地题库
    const bn = qcacheSize();
    const impN = (typeof bankImpSize === 'function') ? bankImpSize() : 0;
    const total = bn + impN;
    push(total > 0, '本地题库', total > 0
      ? (total + ' 题，可离线命中（AI 积累 ' + bn + ' + 导入 ' + impN + '）')
      : '空（答题后自动积累、到结果页回捞，或上传 Excel 一次性导入）');

    // 4. 本地存储
    let storeOk = false;
    try { GM_setValue('uaa_selftest', '1'); storeOk = GM_getValue('uaa_selftest', '') === '1'; } catch (_) {}
    push(storeOk, '配置存储', storeOk ? 'GM_get/setValue 正常（配置能保存）' : '不可用，配置无法持久化');

    // 5. 网络请求能力
    push(typeof GM_xmlhttpRequest === 'function', '跨域请求', typeof GM_xmlhttpRequest === 'function' ? 'GM_xmlhttpRequest 可用' : '不可用，无法调用 AI');

    // 6. AI 接口连通性
    if (CFG.apiKey) {
      const t0 = Date.now();
      let r = null;
      try { r = await callAI('1+1 等于几？选项：A.1　B.2　C.3', [{ text: '1' }, { text: '2' }, { text: '3' }]); } catch (_) {}
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      push(r != null && String(r) !== '未知', 'AI 接口', r == null
        ? ('无返回（耗时 ' + dt + 's，检查 Key/额度/接口地址/模型名）')
        : ('正常，返回「' + String(r).slice(0, 24) + '」耗时 ' + dt + 's'));
    } else {
      push(false, 'AI 接口', '未配置 Key → 点「AI接口」页填写（密钥只存你本机）');
    }

    // 7. 视频控制
    const vids = document.querySelectorAll('video');
    push(true, '视频控制', vids.length
      ? ('检测到 ' + vids.length + ' 个视频，当前倍速 ' + (vids[0].playbackRate || 1) + '×')
      : '本页无视频（视频页会自动注入速学按钮）');

    // 8. 面板自身
    push(!!document.getElementById('uaa-panel'), '控制面板', '渲染正常，快捷键 ↑↓←→ / S / D 可用');
    out.push('== 自检结束 ==');
    return out;
  }

  // ---------------- 渲染：把 CFG / 统计同步到面板 ----------------
  function refreshHeaderBtns() {
    if (!panel) return;
    const t = panel.querySelector('#uaa-toggle-all');
    if (t) { t.textContent = CFG.showAllLogs ? '📜简略' : '🪵详细'; t.style.color = CFG.showAllLogs ? '#fbbf24' : ''; }
    const b = panel.querySelector('#uaa-badge');
    if (b) {
      const on = !!CFG.apiKey;
      b.textContent = on ? '● AI 已接入' : '○ 未配置 AI';
      b.className = on ? 'on' : '';
    }
  }

  // 同一开关可能出现在多个标签页（如打赏页+诊断页），统一同步显示状态
  function refreshSwitches() {
    if (!panel) return;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-sw]'), (el) => {
      const k = el.getAttribute('data-sw');
      el.className = 'uaa-sw' + (CFG[k] ? ' on' : '');
    });
  }

  function refreshStats() {
    if (!panel) return;
    const set = (id, v) => { const el = panel.querySelector(id); if (el) el.textContent = String(v); };
    set('#uaa-st-scan', STATS.scanned);
    set('#uaa-st-hit', STATS.ai + STATS.bank + STATS.guess);
    set('#uaa-st-miss', STATS.miss);
    set('#uaa-st-bank', STATS.bank);
    set('#uaa-st-ai', STATS.ai);
    set('#uaa-st-guess', STATS.guess);
    set('#uaa-home-bank', qcacheSize() + ' 题');
  }

  function refreshBankStats() {
    if (!panel) return;
    const v = panel.querySelector('#uaa-view-bank');
    if (v) { v.removeAttribute('data-built'); if (CFG.panelTab === 'bank') { v.innerHTML = viewBank(); bindView('bank', v); } }
    refreshStats();
  }

  // 日志容器：保证 #uaa-body 存在（诊断页内部，切页时自动搬运）
  function ensureLogBody() {
    ensurePanel();
    let body = panel.querySelector('#uaa-body');
    if (!body) {
      body = document.createElement('div');
      body.id = 'uaa-body';
      const wrap = panel.querySelector('#uaa-logwrap') || panel.querySelector('#uaa-view-diag') || panel;
      wrap.appendChild(body);
    }
    return body;
  }

  function render() {
    try {
      ensurePanel();
      if (CFG.panelHidden) { panel.style.opacity = '0'; return; }
      panel.style.opacity = '1';
      refreshHeaderBtns();
      refreshSwitches();
      refreshStats();
      const cta = panel.querySelector('#uaa-keycta');
      if (cta) cta.style.display = CFG.apiKey ? 'none' : 'block';
      const body = ensureLogBody();
      const lines = CFG.showAllLogs ? log : log.slice(-40);
      body.textContent = lines.join(NLCH) || '等待扫描题目…';
      // 总览页「最近动态」：不必切到诊断页也能看到当前状态
      const hl = panel.querySelector('#uaa-home-log');
      if (hl) hl.textContent = log.slice(-5).join(NLCH) || '暂无动态';
      if (CFG.autoScrollLog && body.scrollHeight) body.scrollTop = body.scrollHeight;
    } catch (_) {}
  }
