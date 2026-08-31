/*
 * dom.test.js — 用 jsdom 做真实 DOM 端到端验证
 * 验证：extractQuestions 提取、autoFill 真实勾选 radio/checkbox、填入 input。
 */
const assert = require('assert');
const { JSDOM } = require('jsdom');
const DomCore = require('../src/dom-core.js');
const engine = require('../src/engine.js');

const html = `
<div class="question" data-type="single">
  <div class="q-stem">中国的首都是哪里？</div>
  <div class="q-option"><input type="radio" name="q1"><span class="q-opt-text">上海</span></div>
  <div class="q-option"><input type="radio" name="q1"><span class="q-opt-text">北京</span></div>
</div>
<div class="question" data-type="multiple">
  <div class="q-stem">以下哪些是水果？</div>
  <div class="q-option"><input type="checkbox" name="q2"><span class="q-opt-text">苹果</span></div>
  <div class="q-option"><input type="checkbox" name="q2"><span class="q-opt-text">香蕉</span></div>
  <div class="q-option"><input type="checkbox" name="q2"><span class="q-opt-text">土豆</span></div>
</div>
<div class="question" data-type="judge">
  <div class="q-stem">地球是平的。</div>
  <div class="q-option"><input type="radio" name="q3"><span class="q-opt-text">正确</span></div>
  <div class="q-option"><input type="radio" name="q3"><span class="q-opt-text">错误</span></div>
</div>
<div class="question" data-type="blank">
  <div class="q-stem">水的化学式是？</div>
  <div class="q-blank"><input type="text"></div>
</div>
`;

const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.Event = dom.window.Event;
global.HTMLInputElement = dom.window.HTMLInputElement;

let pass = 0, fail = 0;
function check(n, fn) { try { fn(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + ' -> ' + e.message); fail++; } }

const doc = dom.window.document;
// 本页使用 .question 专用结构，对应「具体平台选择器精调」路径
const testAdapter = {
  name: 'test-selector',
  selectors: {
    qBlock: '.question', stem: '.q-stem', option: '.q-option',
    optText: '.q-opt-text', blankInput: '.q-blank input',
  },
};
const qs = DomCore.extractQuestions(doc, testAdapter);

check('提取 4 道题', () => assert.strictEqual(qs.length, 4));
check('首题为单选且题干正确', () => {
  assert.strictEqual(qs[0].type, 'single');
  assert.ok(qs[0].stem.includes('中国的首都'));
  assert.strictEqual(qs[0].options.length, 2);
});

check('单选 autoFill 勾选「北京」', () => {
  const ok = DomCore.autoFill(doc, qs[0], 'B'); // 第二项为北京
  assert.ok(ok);
  const checked = doc.querySelectorAll('input[name=q1]:checked');
  assert.strictEqual(checked.length, 1);
  assert.ok(checked[0].closest('.q-option').textContent.includes('北京'));
});

check('多选 autoFill 勾选「苹果、香蕉」', () => {
  const ok = DomCore.autoFill(doc, qs[1], 'AB');
  assert.ok(ok);
  const checked = doc.querySelectorAll('input[name=q2]:checked');
  assert.strictEqual(checked.length, 2);
  const texts = Array.from(checked).map((i) => i.closest('.q-option').textContent);
  assert.ok(texts.some((t) => t.includes('苹果')));
  assert.ok(texts.some((t) => t.includes('香蕉')));
});

check('判断 autoFill 选「错误」', () => {
  const ok = DomCore.autoFill(doc, qs[2], '错误');
  assert.ok(ok);
  const checked = doc.querySelectorAll('input[name=q3]:checked');
  assert.strictEqual(checked.length, 1);
  assert.ok(checked[0].closest('.q-option').textContent.includes('错误'));
});

check('填空 autoFill 写入输入框', () => {
  const ok = DomCore.autoFill(doc, qs[3], 'H2O');
  assert.ok(ok);
  const input = doc.querySelector('.q-blank input');
  assert.strictEqual(input.value, 'H2O');
});

check('A3 组题：共用病例材料自动拼接到小问', () => {
  const groupHtml = `
<div class="question">
  <div class="q-stem">患者，男，56岁。因胸痛3小时入院。查体：血压90/60mmHg，心率110次/分，双肺底可闻及湿啰音。既往有高血压病史10年，糖尿病史5年。</div>
</div>
<div class="question" data-type="single">
  <div class="q-stem">（1）该患者最可能的诊断是</div>
  <div class="q-option"><input type="radio" name="q4"><span class="q-opt-text">急性心肌梗死</span></div>
  <div class="q-option"><input type="radio" name="q4"><span class="q-opt-text">肺栓塞</span></div>
</div>
<div class="question" data-type="single">
  <div class="q-stem">（2）首选的治疗措施是</div>
  <div class="q-option"><input type="radio" name="q5"><span class="q-opt-text">溶栓治疗</span></div>
  <div class="q-option"><input type="radio" name="q5"><span class="q-opt-text">抗感染治疗</span></div>
</div>`;
  const g2 = new JSDOM(groupHtml);
  const adapter = { selectors: { qBlock: '.question', stem: '.q-stem', option: '.q-option' } };
  const list = DomCore.extractQuestions(g2.window.document, adapter);
  // 材料块不进答题队列（应为 2 道小问）
  assert.strictEqual(list.length, 2, '材料块应被吸收，只剩 2 道小问');
  const subs = list.filter((q) => q.type === 'single');
  assert.strictEqual(subs.length, 2);
  for (const sub of subs) {
    assert.ok(sub.stem.includes('患者，男，56岁'), '小问题干应拼接共用病例材料: ' + sub.stem.slice(0, 30));
  }
  // 原小问保留（题号前缀会被 cleanStem 剥离，检查关键词）
  assert.ok(subs[0].stem.includes('最可能的诊断'), '第 1 小问保留: ' + subs[0].stem.slice(-30));
  assert.ok(subs[1].stem.includes('首选的治疗措施'), '第 2 小问保留: ' + subs[1].stem.slice(-30));
});

check('匹配+填答 联动（用题库）', () => {
  const bank = engine.buildBank({ '水的化学式是？': 'H2O' });
  const ans = engine.matchAnswer(qs[3].stem, bank);
  assert.strictEqual(ans, 'H2O');
});

console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
