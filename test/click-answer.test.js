// 点击式答题机制单元测试：验证 detectClickQuestions 提取 + autoFill 点击选中
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const DomCore = require(path.join(__dirname, '..', 'src', 'dom-core.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' | ' + extra : '')); }
}

console.log('\n===== 点击式答题机制（通用，div/li/span 选项）=====');

// ---- 通用结构（无原生 input，选项以 A/B/C/D 字母标记、点击 li 选中）----
(function genericClick() {
  console.log('\n[1] 通用点击式题目提取 + 点击选中');
  const dom = new JSDOM('<!doctype html><html><body>' +
    '<div class="paper">' +
    '<div class="q"><div class="stem">地球是哪个行星？下列说法正确的是？</div>' +
    '<ul class="opts"><li class="o"><span class="mk">A</span><span class="tx">水星</span></li>' +
    '<li class="o"><span class="mk">B</span><span class="tx">地球</span></li>' +
    '<li class="o"><span class="mk">C</span><span class="tx">火星</span></li></ul></div>' +
    '</div></body></html>');
  const w = dom.window;
  const qs = DomCore.detectClickQuestions(w.document);
  check('提取到 1 题', qs.length === 1, 'got=' + qs.length);
  if (qs.length === 1) {
    const q0 = qs[0];
    check('题干含"地球"', /地球/.test(q0.stem), 'stem=' + q0.stem);
    check('选项数=3', q0.options.length === 3, 'got=' + q0.options.length);
    check('选项为点击式(li)', q0.options[0].el.tagName === 'LI', 'tag=' + (q0.options[0].el && q0.options[0].el.tagName));
    // 监听 B 选项的点击
    let clicked = null;
    q0.options[1].el.addEventListener('click', function () { clicked = 'B'; });
    const ok = DomCore.autoFill(w.document, q0, 'B');
    check('autoFill 返回 true', ok === true);
    check('点击落在 B 选项(li)上', clicked === 'B', 'clicked=' + clicked);
  }
})();

// ---- 判断题（对/错）----
(function judgeClick() {
  console.log('\n[2] 判断题 对/错 识别 + 点击选中');
  const dom = new JSDOM('<!doctype html><html><body>' +
    '<div class="q"><div class="stem">太阳从东边升起，是否正确？</div>' +
    '<div class="opts"><div class="o"><span class="mk">对</span><span class="tx">正确</span></div>' +
    '<div class="o"><span class="mk">错</span><span class="tx">错误</span></div></div></div>' +
    '</body></html>');
  const w = dom.window;
  const qs = DomCore.detectClickQuestions(w.document);
  check('提取到 1 题', qs.length === 1, 'got=' + qs.length);
  if (qs.length === 1) {
    const q0 = qs[0];
    check('题型识别为 judge', q0.type === 'judge', 'type=' + q0.type);
    let clicked = null;
    q0.options[0].el.addEventListener('click', function () { clicked = '对'; });
    const ok = DomCore.autoFill(w.document, q0, '正确');
    check('autoFill 选中"对"', ok === true && clicked === '对', 'clicked=' + clicked);
  }
})();

// ---- 多选题（选中多项）----
(function multiClick() {
  console.log('\n[3] 多选题 点击选中多项');
  const dom = new JSDOM('<!doctype html><html><body>' +
    '<div class="q"><div class="stem">以下哪些是行星？请选择。</div>' +
    '<ul class="opts"><li class="o"><span class="mk">A</span><span class="tx">地球</span></li>' +
    '<li class="o"><span class="mk">B</span><span class="tx">火星</span></li>' +
    '<li class="o"><span class="mk">C</span><span class="tx">太阳</span></li>' +
    '<li class="o"><span class="mk">D</span><span class="tx">月球</span></li></ul></div>' +
    '</body></html>');
  const w = dom.window;
  const qs = DomCore.detectClickQuestions(w.document);
  check('提取到 1 题', qs.length === 1, 'got=' + qs.length);
  if (qs.length === 1) {
    const q0 = qs[0];
    const clicked = [];
    q0.options.forEach(function (o) { o.el.addEventListener('click', function () { clicked.push(o.text.slice(0, 2)); }); });
    const ok = DomCore.autoFill(w.document, q0, 'AB');
    check('autoFill 选中 A、B 两项', ok === true && clicked.length === 2, 'clicked=' + JSON.stringify(clicked));
  }
})();

// ---- 不应误命中纯导航/筛选列表 ----
(function noFalsePositive() {
  console.log('\n[4] 非题目列表不误命中');
  const dom = new JSDOM('<!doctype html><html><body>' +
    '<ul class="menu"><li><a href="#">首页</a></li><li><a href="#">课程</a></li><li><a href="#">项目</a></li></ul>' +
    '<ol class="pager"><li>1</li><li>2</li><li>3</li></ol>' +
    '</body></html>');
  const w = dom.window;
  const qs = DomCore.detectClickQuestions(w.document);
  check('导航/分页列表 0 题', qs.length === 0, 'got=' + qs.length);
})();

console.log('\n结果：' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
