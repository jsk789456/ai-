// 华医网 study2.jsp 视频速学 专项测试
// 模拟用户提供的真实课件播放页：CC 播放器 + icme_getLearningInfos + 完成判定链
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');

const SCRIPT_PATH = path.join(__dirname, '..', 'dist', 'universal-auto-answer.plain.user.js');
const code = fs.readFileSync(SCRIPT_PATH, 'utf8');

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}

function runStudy2Dom() {
  const html = `<!doctype html><html><head><title>软骨肿瘤的病理诊断</title></head><body>
  <div class="study_video" id="playerContainer"></div>
  <div class="s_r_bts"><a href="#" class="cur" onclick="gotoExam();">本节考试</a></div>
  <script>
    var see='ebcb868d83e39c84772851bdc844a1df';
    var questionIsOk=false;
    window.cc_js_Player = {
      pos: 12,
      getPosition: function(){ return this.pos; },
      jumpToTime: function(t){ this.pos = t; },
      play: function(){ window.__played = true; },
      pause: function(){},
    };
    window.icme_getLearningInfos = function(){
      return { playingTime: parseInt(window.cc_js_Player.getPosition()), totalTime: '3868', playStatus: '1' };
    };
    window.__endedCalls = 0;
    window.on_CCH5player_ended = function(video, vid){
      if (vid == null) return;
      window.__endedCalls++;
      questionIsOk = true;
      localStorage.setItem(see, 1);
      window.__playEndReported = true; // 模拟 saveStudy5 上报
    };
    window.__gotoExamCalls = 0;
    window.gotoExam = function(){
      window.__gotoExamCalls++;
      if (questionIsOk || localStorage.getItem(see) == 1) { window.location.href = 'https://www.cmechina.net/cme/exam.jsp?course_id=202601015559&paper_id=02'; }
    };
    // 反调试仿真：播放器就绪后覆写 querySelector（我们的脚本应已提前冻结保护）
    window.__origQS = document.querySelector.bind(document);
    document.querySelector = function(){ return undefined; };
  </script>
  </body></html>`;

  const dom = new JSDOM(html, {
    url: 'https://www.cmechina.net/cme/study2.jsp?course_id=202601015559&courseware_id=02',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      const store = {};
      window.GM_getValue = (k, d) => (k in store ? store[k] : d);
      window.GM_setValue = (k, v) => { store[k] = v; };
      window.GM_registerMenuCommand = () => {};
      window.GM_xmlhttpRequest = () => {};
      window.GM_setClipboard = () => {};
      window.GM_openInTab = () => {};
    },
  });
  const w = dom.window;
  const scriptEl = w.document.createElement('script');
  scriptEl.textContent = code;
  w.document.body.appendChild(scriptEl);
  return { dom, w };
}

(async () => {
  console.log('== study2.jsp 视频速学 ==');
  const { w } = runStudy2Dom();
  await new Promise((r) => setTimeout(r, 800));

  // 1. 视频页注入速学按钮
  const btn = w.document.getElementById('uaa-fastvideo-btn');
  check('课件视频页注入「⚡ 速学本节视频」按钮', !!btn);

  // 2. querySelector 冻结保护生效（页面覆写后仍可用）
  check('querySelector 反调试覆写被冻结保护（仍可查询）', w.document.querySelector('#uaa-fastvideo-btn') === btn);

  // 3. 点击速学 → 跳到结尾(3868-2) → 触发完成链
  btn.click();
  await new Promise((r) => setTimeout(r, 1000));
  check('速学：播放器已跳至视频结尾（jumpToTime 3866）', w.cc_js_Player.getPosition() === 3866);
  await new Promise((r) => setTimeout(r, 4500));
  check('速学：完成回调 on_CCH5player_ended 已触发（含 saveStudy5 上报链）', w.__endedCalls >= 1);
  check('速学：完成标记 localStorage[see]=1 已写入', String(w.localStorage.getItem('ebcb868d83e39c84772851bdc844a1df')) === '1');
  check('速学：questionIsOk 已置真（考试放行条件）', w.questionIsOk === true);

  // 4. 完成后 3 秒自动进入本节考试
  await new Promise((r) => setTimeout(r, 3500));
  check('速学：自动调用 gotoExam 进入本节考试', w.__gotoExamCalls >= 1);

  const panelText = (w.document.querySelector('#uaa-body') || {}).textContent || '';
  check('面板日志含「本节视频已学完」', panelText.includes('本节视频已学完'));

  console.log('\\n结果：' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
