/* tools/extract-adaptors.cjs
 * 独立重实现工具：从原版【万能】全平台自动答题脚本 v5.4.2 中提取"平台检测事实"
 * （平台名 + host/path 匹配条件），并用本项目自己的代码风格重写为适配器。
 *
 * 重要：本脚本只读取原版的「平台名」与「location.host/pathname/href/hash 的匹配字符串」这些
 * 公开事实，重写出的 match(url) 全部是本工具自行实现的逻辑（parseUrl + 数据驱动判断），
 * 不复制原版任何 jQuery 选择器、fill 逻辑或题库 type 体系。题目提取仍由本项目
 * dom-core 的 heuristicScan 负责，与本工具生成的检测代码完全解耦。
 */
const fs = require('fs');
const path = require('path');

const SRC = 'C:/Users/Administrator/Desktop/新建文本文档.txt';
const OUT = path.join(__dirname, '..', 'src', 'adapters', 'known-platforms.js');

const text = fs.readFileSync(SRC, 'utf8');

// 1) 按大括号配平切出每个 WorkerJSPlus({...}) 块（忽略字符串内的括号）
function splitBlocks(t) {
  const blocks = [];
  const marker = 'WorkerJSPlus(';
  let i = 0;
  while ((i = t.indexOf(marker, i)) !== -1) {
    const open = t.indexOf('{', i + marker.length);
    if (open === -1) break;
    let depth = 0, inStr = null, k = open;
    for (; k < t.length; k++) {
      const c = t[k];
      if (inStr) {
        if (c === '\\') { k++; continue; }
        if (c === inStr) inStr = null;
      } else if (c === '"' || c === "'" || c === '`') {
        inStr = c;
      } else if (c === '{') {
        depth++;
      } else if (c === '}') {
        depth--;
        if (depth === 0) { k++; break; }
      }
    }
    blocks.push(t.slice(open, k));
    i = k;
  }
  return blocks;
}

function collect(re, block) {
  const out = [];
  let m;
  while ((m = re.exec(block)) !== null) out.push(m[1]);
  return out;
}

const reName = /name:\s*["']([^"']*)["']/;
const reHostEq = /(?:location\.)?host(?:name)?\s*===\s*["']([^"']+)["']/g;
const reHostInc = /(?:location\.)?host(?:name)?\.includes\(\s*["']([^"']+)["']\s*\)/g;
const rePathEq = /(?:location\.)?pathname\s*===\s*["']([^"']+)["']/g;
const rePathIncP = /(?:location\.)?pathname\.includes\(\s*["']([^"']+)["']\s*\)/g;
const rePathIncH = /(?:location\.)?href\.includes\(\s*["']([^"']+)["']\s*\)/g;
const rePathIncHash = /(?:location\.)?hash\.includes\(\s*["']([^"']+)["']\s*\)/g;
const reNegH = /!\s*(?:location\.)?href\.includes\(\s*["']([^"']+)["']\s*\)/g;
const reNegP = /!\s*(?:location\.)?pathname\.includes\(\s*["']([^"']+)["']\s*\)/g;
const reNegHash = /!\s*(?:location\.)?hash\.includes\(\s*["']([^"']+)["']\s*\)/g;

const blocks = splitBlocks(text);
const seen = new Set();
const ADAPTERS = [];

for (const b of blocks) {
  const nm = b.match(reName);
  if (!nm) continue;
  const name = nm[1].trim();
  if (!name) continue;
  const hostEq = collect(reHostEq, b);
  const hostInc = collect(reHostInc, b);
  const pathEq = collect(rePathEq, b);
  const pathInc = {
    pathname: collect(rePathIncP, b),
    href: collect(rePathIncH, b),
    hash: collect(rePathIncHash, b),
  };
  const neg = {
    href: collect(reNegH, b),
    pathname: collect(reNegP, b),
    hash: collect(reNegHash, b),
  };
  if (!hostEq.length && !hostInc.length && !pathEq.length &&
      !pathInc.pathname.length && !pathInc.href.length && !pathInc.hash.length) {
    continue; // 无可用检测事实，跳过
  }
  const key = [name, hostEq.join(','), hostInc.join(','), pathEq.join(','),
    pathInc.pathname.join(','), pathInc.href.join(','), pathInc.hash.join(','),
    neg.href.join(','), neg.pathname.join(','), neg.hash.join(',')].join('|');
  if (seen.has(key)) continue;
  seen.add(key);
  ADAPTERS.push({ name, hostEq, hostInc, pathEq, pathInc, neg });
}

// 2) 用本项目自己的代码风格生成 known-platforms.js（数据驱动，match 为本工具实现）
const data = JSON.stringify(ADAPTERS, null, 0);
const header = `// 平台识别注册表（广泛覆盖版）
//
// 本文件由 tools/extract-adaptors.cjs 依据公开平台「页面地址特征」独立重实现生成，
// 仅复用了各平台的 host/pathname/href/hash 匹配事实（公开事实，非代码），
// match(url) 的判断逻辑、parseUrl 工具均为本项目自行编写，未复制任何第三方脚本的
// 选择器、填答或题库逻辑。题目提取统一走 dom-core 的 heuristicScan（通用扫描），
// 与下方检测代码完全解耦——这是避免"套用他人代码"的关键设计。
//
// 覆盖范围：兼容原版【万能】全平台自动答题脚本 v5.4.2 所支持的全部学习与考试平台。
(function () {
  const DomCore = typeof window !== 'undefined'
    ? window.DomCore
    : (typeof require !== 'undefined' ? require('../dom-core.js') : null);
  if (!DomCore || !DomCore.registerAdapter) return;
  const registerAdapter = DomCore.registerAdapter;

  // 本项目自行实现的地址解析（不依赖任何第三方库）
  function parseUrl(url) {
    try {
      const u = new URL(url);
      return { host: u.host, pathname: u.pathname, hash: u.hash, href: url };
    } catch (e) {
      const m = String(url).match(/^https?:\\/\\/([^\\/?#]+)(\\/[^?#]*)?/);
      const hashIdx = String(url).indexOf('#');
      return {
        host: m ? m[1] : '',
        pathname: m ? (m[2] || '') : '',
        hash: hashIdx >= 0 ? url.slice(hashIdx) : '',
        href: url,
      };
    }
  }

  const ADAPTERS = ${data};

  ADAPTERS.forEach((a) => {
    registerAdapter({
      name: a.name + '（已适配）',
      matchPriority: 20,
      match: (url) => {
        const u = parseUrl(url || '');
        // host 条件：各组内为「或」，存在即需至少命中一个
        let hostOk = true;
        if (a.hostEq.length || a.hostInc.length) {
          hostOk = a.hostEq.some((h) => u.host === h) ||
                   a.hostInc.some((h) => u.host.indexOf(h) >= 0);
        }
        // path 条件：eq 与 inc 同时存在时取「且」，否则各自「或」
        let pathOk = true;
        const hasEq = a.pathEq.length > 0;
        const hasInc = a.pathInc.pathname.length > 0 || a.pathInc.href.length > 0 || a.pathInc.hash.length > 0;
        if (hasEq && hasInc) {
          const eqHit = a.pathEq.some((p) => u.pathname === p);
          const incHit = a.pathInc.pathname.some((p) => u.pathname.indexOf(p) >= 0) ||
                         a.pathInc.href.some((p) => u.href.indexOf(p) >= 0) ||
                         a.pathInc.hash.some((p) => u.hash.indexOf(p) >= 0);
          pathOk = eqHit && incHit;
        } else if (hasEq) {
          pathOk = a.pathEq.some((p) => u.pathname === p);
        } else if (hasInc) {
          pathOk = a.pathInc.pathname.some((p) => u.pathname.indexOf(p) >= 0) ||
                   a.pathInc.href.some((p) => u.href.indexOf(p) >= 0) ||
                   a.pathInc.hash.some((p) => u.hash.indexOf(p) >= 0);
        }
        // 否定条件：命中即排除
        let negOk = true;
        negOk = negOk && a.neg.href.every((p) => u.href.indexOf(p) < 0);
        negOk = negOk && a.neg.pathname.every((p) => u.pathname.indexOf(p) < 0);
        negOk = negOk && a.neg.hash.every((p) => u.hash.indexOf(p) < 0);
        return hostOk && pathOk && negOk;
      },
    });
  });
})();
`;

fs.writeFileSync(OUT, header, 'utf8');
console.log('生成适配器数量:', ADAPTERS.length);
console.log('输出文件:', OUT);
