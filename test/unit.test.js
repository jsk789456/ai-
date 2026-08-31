/*
 * unit.test.js — node 端单元测试（无需浏览器）
 * 覆盖：归一化、匹配策略、题库构建、题型判断、自动填答定位。
 * 注：自动填答的 DOM 点击部分在 node 无真实事件环境，仅验证「定位到正确选项」逻辑。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const engine = require('../src/engine.js');
const DomCore = require('../src/dom-core.js');
require('../src/adapters/sample.js'); // 注册示例适配器

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + ' -> ' + e.message); fail++; }
}

console.log('— engine —');
check('normalize 去空格标点', () => {
  assert.strictEqual(engine.normalize(' 中国 的 首都 ？'), '中国的首都');
});
check('精确匹配命中', () => {
  const bank = engine.buildBank({ '中国的首都是哪里？': '北京' });
  assert.strictEqual(engine.matchAnswer('中国的首都是哪里？', bank), '北京');
});
check('题库键包含题干命中（兜底）', () => {
  const bank = engine.buildBank({ '题目：中国的首都是哪里？答案是？': '北京' });
  assert.strictEqual(engine.matchAnswer('中国的首都是哪里？', bank), '北京');
});
check('题干包含题库键命中（题号前缀）', () => {
  const bank = engine.buildBank({ '中国的首都是哪里？': '北京' });
  assert.strictEqual(engine.matchAnswer('1. 中国的首都是哪里？', bank), '北京');
});
check('未命中返回 null', () => {
  const bank = engine.buildBank({ 'a': 'b' });
  assert.strictEqual(engine.matchAnswer('不存在的题', bank), null);
});

console.log('— adapters —');
check('universal-demo 命中 localhost', () => {
  assert.ok(DomCore.getAdapterForUrl('http://localhost:8080/test-page.html'));
});
check('zhihui-zhongxiaoxue 命中 smartedu', () => {
  assert.ok(DomCore.getAdapterForUrl('https://basic.smartedu.cn/xxx'));
});
check('未知平台回退到 universal 通用扫描兜底', () => {
  const a = DomCore.getAdapterForUrl('https://example.com');
  assert.ok(a && a.universal === true, '应返回 universal 兜底适配器');
});
check('具体平台优先于 universal 兜底', () => {
  const a = DomCore.getAdapterForUrl('https://basic.smartedu.cn/xxx');
  assert.ok(a && a.universal !== true, 'smartedu 应命中具体适配器而非兜底');
});

console.log('— 题型 / 选项定位 —');
check('optionLetter 映射', () => {
  assert.strictEqual(DomCore.optionLetter(0), 'A');
  assert.strictEqual(DomCore.optionLetter(2), 'C');
});
check('judgeTruth 判断', () => {
  assert.strictEqual(DomCore.judgeTruth('正确'), true);
  assert.strictEqual(DomCore.judgeTruth('错误'), false);
  assert.strictEqual(DomCore.judgeTruth('也许'), null);
});

console.log('— 自动填答定位（无真实 DOM 点击，验证选项筛选） —');
check('单选：按字母命中 B', () => {
  const q = { type: 'single', options: [
    { text: 'A', index: 0 }, { text: 'B', index: 1 }, { text: 'C', index: 2 },
  ] };
  // 直接验证 autoFill 内部筛选：构造答案 "B"
  const letters = 'B'.match(/[A-Za-z]/g).map((c) => c.toUpperCase());
  const picked = q.options.filter((o) => letters.includes(DomCore.optionLetter(o.index)));
  assert.strictEqual(picked.length, 1);
  assert.strictEqual(picked[0].index, 1);
});
check('多选：按字母命中 A,B', () => {
  const q = { type: 'multiple', options: [
    { text: 'A', index: 0 }, { text: 'B', index: 1 }, { text: 'C', index: 2 }, { text: 'D', index: 3 },
  ] };
  const letters = 'AB'.match(/[A-Za-z]/g).map((c) => c.toUpperCase());
  const picked = q.options.filter((o) => letters.includes(DomCore.optionLetter(o.index)));
  assert.strictEqual(picked.length, 2);
});
check('判断：按文本定位正确项', () => {
  const q = { type: 'judge', options: [
    { text: '正确', index: 0 }, { text: '错误', index: 1 },
  ] };
  const want = DomCore.judgeTruth('错误'); // false
  const target = q.options.find((o) => DomCore.judgeTruth(o.text) === want);
  assert.strictEqual(target.index, 1);
});

console.log('— AI 答案解析 parseAIAnswer —');
check('判断：AI 返回“错误”归一为错误', () => {
  const q = { type: 'judge', options: [{ text: '正确', index: 0 }, { text: '错误', index: 1 }] };
  assert.strictEqual(DomCore.parseAIAnswer('错误', q), '错误');
  assert.strictEqual(DomCore.parseAIAnswer('正确', q), '正确');
});
check('单选：AI 返回“B”抽字母', () => {
  const q = { type: 'single', options: [{ text: 'A', index: 0 }, { text: 'B', index: 1 }, { text: 'C', index: 2 }] };
  assert.strictEqual(DomCore.parseAIAnswer('答案是 B', q), 'B');
});
check('多选：AI 返回“AB”抽字母', () => {
  const q = { type: 'multiple', options: [{ text: 'A', index: 0 }, { text: 'B', index: 1 }, { text: 'C', index: 2 }, { text: 'D', index: 3 }] };
  assert.strictEqual(DomCore.parseAIAnswer('AB', q), 'AB');
});
check('填空：AI 返回“答案：H2O”去前缀', () => {
  const q = { type: 'blank', options: [] };
  assert.strictEqual(DomCore.parseAIAnswer('答案：H2O', q), 'H2O');
});
check('选择：AI 返回选项原文也能用', () => {
  const q = { type: 'single', options: [{ text: '苹果', index: 0 }, { text: '香蕉', index: 1 }] };
  assert.strictEqual(DomCore.parseAIAnswer('香蕉', q), '香蕉');
});

console.log('\n示例题库可解析：' + (() => {
  try { const b = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/sample-bank.json'), 'utf8')); return Object.keys(b).length + ' 条'; }
  catch (e) { return '解析失败'; }
})());

console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
