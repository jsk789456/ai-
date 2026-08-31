/*
 * heuristic.test.js — 验证「任意网站通用扫描」heuristicScan
 * 用裸结构（fieldset+legend+label，无任何专用 class）模拟陌生答题网站，
 * 并混入搜索框/订阅勾选等干扰控件，验证：能提取题型、自动填答、且不被误判。
 */
const assert = require('assert');
const { JSDOM } = require('jsdom');
const DomCore = require('../src/dom-core.js');

const html = `
<form class="exam">
  <fieldset>
    <legend>1. 我国消防工作的方针是？<span class="tag">单选</span></legend>
    <label><input type="radio" name="q_fire_1"> 预防为主，防消结合</label>
    <label><input type="radio" name="q_fire_1"> 以扑救为主</label>
    <label><input type="radio" name="q_fire_1"> 以惩罚为主</label>
  </fieldset>
  <fieldset>
    <legend>2. 以下哪些属于医疗急救的基本原则（多选）？</legend>
    <label><input type="checkbox" name="q_med_2"> 先救命后治伤</label>
    <label><input type="checkbox" name="q_med_2"> 快速评估环境安全</label>
    <label><input type="checkbox" name="q_med_2"> 立即让伤者进食补水</label>
    <label><input type="checkbox" name="q_med_2"> 及时呼叫急救</label>
  </fieldset>
  <fieldset>
    <legend>3. 公检法机关依法独立行使职权。（判断）</legend>
    <label><input type="radio" name="q_law_3"> 正确</label>
    <label><input type="radio" name="q_law_3"> 错误</label>
  </fieldset>
  <div class="blank-item">
    <p>4. 灭火的基本方法包括：______、______、______。（填空）</p>
    <input type="text" placeholder="请输入">
  </div>
  <!-- 干扰项：搜索框 + 订阅勾选（不应被当成题目） -->
  <div>
    <input type="text" name="site_search" placeholder="搜索本站">
    <label><input type="checkbox" name="subscribe_news"> 订阅每周资讯</label>
  </div>
</form>
`;

const dom = new JSDOM(html);
global.window = dom.window;
global.document = dom.window.document;
global.Event = dom.window.Event;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;

let pass = 0, fail = 0;
function check(n, fn) { try { fn(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + ' -> ' + e.message); fail++; } }

const doc = dom.window.document;
const qs = DomCore.heuristicScan(doc);

console.log('— 通用扫描 heuristicScan —');
check('提取 4 道题（含填空），干扰项被过滤', () => assert.strictEqual(qs.length, 4));
check('首题=单选，题干含「消防工作的方针」', () => {
  assert.strictEqual(qs[0].type, 'single');
  assert.ok(qs[0].stem.includes('消防工作的方针'));
  assert.strictEqual(qs[0].options.length, 3);
});
check('次题=多选，题干含「医疗急救」', () => {
  assert.strictEqual(qs[1].type, 'multiple');
  assert.ok(qs[1].stem.includes('医疗急救'));
  assert.strictEqual(qs[1].options.length, 4);
});
check('第三题=判断（正确/错误）', () => {
  assert.strictEqual(qs[2].type, 'judge');
  assert.ok(qs[2].stem.includes('公检法'));
  const texts = qs[2].options.map((o) => o.text);
  assert.ok(texts.includes('正确') && texts.includes('错误'));
});
check('第四题=填空', () => {
  assert.strictEqual(qs[3].type, 'blank');
  assert.strictEqual(qs[3].blankEls.length, 1);
});
check('选项文本被干净提取（去首尾空白，无标签/序号）', () => {
  assert.strictEqual(qs[0].options[0].text, '预防为主，防消结合');
  assert.strictEqual(qs[0].options[1].text, '以扑救为主');
});
check('搜索框未被当成填空', () => {
  const hasSearch = qs.some((q) => q.type === 'blank' && q.blankEls[0] && q.blankEls[0].name === 'site_search');
  assert.ok(!hasSearch);
});
check('订阅勾选未被当成题目（选项数<2 被过滤）', () => {
  const hasSub = qs.some((q) => q.options.some((o) => o.text && o.text.includes('订阅')));
  assert.ok(!hasSub);
});

console.log('— 通用扫描 + 自动填答 —');
check('单选 autoFill 勾选「以扑救为主」(B)', () => {
  const ok = DomCore.autoFill(doc, qs[0], 'B');
  assert.ok(ok);
  const checked = doc.querySelectorAll('input[name=q_fire_1]:checked');
  assert.strictEqual(checked.length, 1);
  assert.ok(checked[0].closest('label').textContent.includes('以扑救为主'));
});
check('多选 autoFill 勾选不相邻项「先救命后治伤、及时呼叫急救」(AD)', () => {
  const ok = DomCore.autoFill(doc, qs[1], 'AD');
  assert.ok(ok);
  const checked = doc.querySelectorAll('input[name=q_med_2]:checked');
  assert.strictEqual(checked.length, 2);
  const texts = Array.from(checked).map((i) => i.closest('label').textContent);
  assert.ok(texts.some((t) => t.includes('先救命后治伤')));
  assert.ok(texts.some((t) => t.includes('及时呼叫急救')));
});
check('判断 autoFill 选「错误」', () => {
  const ok = DomCore.autoFill(doc, qs[2], '错误');
  assert.ok(ok);
  const checked = doc.querySelectorAll('input[name=q_law_3]:checked');
  assert.strictEqual(checked.length, 1);
  assert.ok(checked[0].closest('label').textContent.includes('错误'));
});
check('填空 autoFill 写入输入框', () => {
  const ok = DomCore.autoFill(doc, qs[3], '隔离、窒息、冷却');
  assert.ok(ok);
  const input = doc.querySelector('input[type=text]:not([name=site_search])');
  assert.strictEqual(input.value, '隔离、窒息、冷却');
});

console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
