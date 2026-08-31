// 全量测试入口：依次跑 13 个套件，汇总结果。
// 用法：npm test（自动回退到 .testdeps 本地依赖）
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 若仓库根没有 node_modules（未 npm install），回退到历史本地依赖目录
const rootNM = path.join(__dirname, '..', 'node_modules');
if (!fs.existsSync(path.join(rootNM, 'jsdom'))) {
  const fallback = path.join(__dirname, '..', '.testdeps', 'node_modules');
  if (fs.existsSync(path.join(fallback, 'jsdom'))) {
    process.env.NODE_PATH = (process.env.NODE_PATH || '')
      + (process.env.NODE_PATH ? path.delimiter : '') + fallback;
  }
}

const SUITES = [
  'unit', 'dom', 'heuristic', 'mechanism', 'cme-fast', 'cme-video',
  'chaoxing', 'click-answer', 'integration', 'ncme', 'accuracy', 'ui-panel', 'bank-import',
];

let failed = 0;
for (const s of SUITES) {
  process.stdout.write(`\n===== ${s} =====\n`);
  const r = spawnSync(process.execPath, [s + '.test.js'], {
    cwd: __dirname, env: process.env, encoding: 'utf8', timeout: 180000,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) { failed++; console.log(`[${s}] 退出码 ${r.status}`); }
}

console.log(failed ? `\n❌ ${failed} 个套件失败` : '\n✅ 全部 13 个套件通过');
process.exit(failed ? 1 : 0);
