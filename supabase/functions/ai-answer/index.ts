// Supabase Edge Function: ai-answer
// 作用：在服务端用硅基流动 Key 调用 AI，前端脚本只调本函数，永远不直连第三方。
//
// 部署：
//   方式A（网页）：Supabase 后台 → Edge Functions → 新建/编辑 ai-answer → 粘贴本文件 → Deploy
//   方式B（CLI）：  supabase functions deploy ai-answer
//
// 后台必须设置 Secrets（Settings → Edge Functions → Secrets）：
//   SILICONFLOW_KEY = 你的硅基流动 Key（sk-...），只在服务端，不会泄露到前端
//   （可选）FUNC_TOKEN = 防白嫖校验串；设置了则前端必须带 x-func-token 头
//
// 前端调用：
//   POST https://<project-ref>.supabase.co/functions/v1/ai-answer
//   Headers: { "Content-Type":"application/json", "apikey":"<anon>", "Authorization":"Bearer <anon>" }
//   Body:    { "stem":"题干", "options":["选项1","选项2"], "model":"Qwen/Qwen3-8B",
//              "system":"...", "prompt":"...", "sfKey":"sk-...（可选，填了优先用你的 Key）" }
//   返回：   { "answer":"A" }  /  { "answer":"...", "model":"..." }  /  { "error":"...", "detail":"..." }

const SILICONFLOW_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const DEFAULT_SYSTEM =
  '你是答题助手。用户会给你一道题（可能含选项）。请只输出该题的最终答案，' +
  '不要任何解释、不要序号。规则：单选题输出选项字母(如A)或选项内容；' +
  '多选题输出多个字母(如AB)或内容，用、分隔；判断题输出“正确”或“错误”；' +
  '填空题直接输出填空内容。若无法判断可输出“未知”。';

// 主模型不可用时的备用模型（尽量挑免费/常驻模型，降低“未知”概率）
const FALLBACK_MODELS = [
  'Qwen/Qwen3-8B',
  'Qwen/Qwen2.5-72B-Instruct',
  'deepseek-ai/DeepSeek-V3',
  'Pro/Qwen2.5-72B-Instruct',
  'Qwen/Qwen3-32B',
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-func-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 组装尝试顺序：用户指定模型优先，其余备用模型补齐
function modelList(reqModel: string): string[] {
  const m = String(reqModel || '').trim();
  const set: string[] = [];
  if (m) set.push(m);
  for (const x of FALLBACK_MODELS) if (x !== m) set.push(x);
  return set;
}

// 用指定 key+model 调一次硅基流动，返回 { answer } 或 { error, detail }
async function tryModel(key: string, model: string, system: string, prompt: string) {
  const isThink = model.indexOf('Qwen3') >= 0 || model.indexOf('QwQ') >= 0;
  const body: any = {
    model,
    temperature: 0,
    max_tokens: 256,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  };
  // 思考模型默认会输出 <think>…</think>，关掉 thinking 让 content 直接是答案，便于前端解析
  if (isThink) body.enable_thinking = false;

  let sfResp: Response;
  try {
    sfResp = await fetch(SILICONFLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { error: 'sf_network', detail: String((e && (e as any).message) || e) };
  }

  const text = await sfResp.text();
  if (!sfResp.ok) {
    let msg = text.slice(0, 400);
    try {
      const ej = JSON.parse(text);
      if (ej && ej.message) msg = ej.message;
      else if (ej && ej.error && ej.error.message) msg = ej.error.message;
    } catch (_) {}
    return { error: 'sf_api_error', status: sfResp.status, detail: msg };
  }

  let j: any;
  try {
    j = JSON.parse(text);
  } catch (_) {
    return { error: 'sf_bad_json', detail: text.slice(0, 400) };
  }
  const content =
    j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (!content) return { error: 'sf_no_choice', detail: text.slice(0, 400) };
  return { answer: String(content).trim() };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    // 前端可传自己的 sfKey（优先）；否则用服务端 Secret。这样用户无需折腾 Supabase Secret 也能用。
    const userKey = String(body.sfKey || '').trim();
    const secretKey = Deno.env.get('SILICONFLOW_KEY');
    const key = userKey || secretKey;
    if (!key) {
      return new Response(JSON.stringify({ error: 'server_missing_key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // FUNC_TOKEN 校验：仅在后台设置了该 Secret 时才启用
    const funcToken = Deno.env.get('FUNC_TOKEN');
    if (funcToken) {
      const incoming = req.headers.get('x-func-token');
      if (incoming !== funcToken) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const stem = String(body.stem || '');
    const options = Array.isArray(body.options) ? body.options.map(String) : [];
    const model = String(body.model || 'Qwen/Qwen3-8B');
    const system = String(body.system || DEFAULT_SYSTEM);
    const optText = options.length
      ? options.map((o: string, i: number) => String.fromCharCode(65 + i) + '. ' + o).join('\n')
      : '';
    const prompt = String(body.prompt || '题干：' + stem + (optText ? '\n选项：\n' + optText : ''));

    if (prompt.length > 4000) {
      return new Response(JSON.stringify({ error: 'prompt_too_long' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 依次尝试模型，任一成功即返回；鉴权/额度类错误与模型无关，直接终止重试
    let last: any = null;
    for (const m of modelList(model)) {
      const r = await tryModel(key, m, system, prompt);
      if (r.answer != null) {
        return new Response(JSON.stringify({ answer: r.answer, model: m }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      last = r;
      if (
        r.error === 'sf_api_error' &&
        (r.status === 401 || r.status === 402 || r.status === 403 || r.status === 429)
      ) {
        break;
      }
    }
    // 全部失败：把真实错误透传给前端（不再静默吞成“未知”）
    return new Response(JSON.stringify(last || { error: 'unknown' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String((e && (e as any).message) || e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
