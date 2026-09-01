// ======================== 河南专技继续教育 · 公需课学习驱动 ========================
// 自动识别河南省继续教育学会及其下属站点，登录后自动拉取课程/章节并发模拟学习时长上报。
// 进度回调上报至 UAA 面板（接口由 ui-panel 暴露）；无自有按钮、无自有弹窗、无自有样式。
// 非主站自动 3 秒倒计时跳转主站，主站切到面板「视频」标签即可一键开始。
// 注意：本文件被 build.js 拼入模板串，禁止反引号模板字符串与 ${} 插值。
(function () {
  'use strict';

  var HN_MAIN = 'jxjyedu.org.cn';
  var HN_HOST = String(location.hostname || '').replace(/^www\./i, '').toLowerCase();
  var HN_ACTIVE = HN_HOST === HN_MAIN
    || HN_HOST.indexOf('.' + HN_MAIN) >= 0
    || /hnzjgl\.gov\.cn$/.test(HN_HOST)
    || HN_HOST === 'jxjy.henu.edu.cn'
    || HN_HOST === 'www.jxjy.henu.edu.cn'
    || HN_HOST === 'hnpihn.newzhihui.cn'
    || HN_HOST === 'www.hnpihn.newzhihui.cn'
    || HN_HOST === 'zdkj.v.zzu.edu.cn'
    || HN_HOST === 'hnzj.ghlearning.com'
    || HN_HOST === 'hnzj.user.ghlearning.com'
    || HN_HOST === 'zyjs.lypt.edu.cn'
    || HN_HOST === 'www.zyjs.lypt.edu.cn'
    || HN_HOST === 'ly.fnhzj.com'
    || HN_HOST === 'www.ly.fnhzj.com'
    || HN_HOST === 'huayuzj.com'
    || HN_HOST === 'www.huayuzj.com';
  if (!HN_ACTIVE) return;
  if (HN_HOST === 'manage.hnzjgl.gov.cn') return;

  // ---------------- 工具函数 ----------------
  function hnSleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hnForm(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    return parts.join('&');
  }
  function hnParseResp(text) {
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { throw new Error('响应非 JSON'); }
    if (Number(data.code) === -1) throw new Error('登录已过期，请重新登录');
    return data;
  }
  function hnGet(path, params) {
    var qs = '';
    if (params) { var keys = Object.keys(params); if (keys.length) qs = '?' + hnForm(params); }
    var url = String(path).indexOf('http') === 0 ? path + qs : HN_API + path + qs;
    return fetch(url, { method: 'GET', credentials: 'include', headers: { Accept: 'application/json, text/plain, */*' } })
      .then(function (r) { return r.text(); })
      .then(hnParseResp);
  }
  function hnPost(path, params) {
    var url = String(path).indexOf('http') === 0 ? path : HN_API + path;
    return fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: hnForm(params)
    })
      .then(function (r) { return r.text(); })
      .then(hnParseResp);
  }

  // ---------------- UAA 面板回调（无面板时降级 noop；状态写全局缓冲） ----------------
  function hnBus() {
    var U = window.UAA || (typeof unsafeWindow !== 'undefined' ? unsafeWindow.UAA : null) || {};
    return {
      log: typeof U.log === 'function' ? U.log : function (msg) {
        try { (window.__UAA_LOG_BUF__ = window.__UAA_LOG_BUF__ || []).push(String(msg)); } catch (_) {}
        try { console.log('[UAA/Henan] ' + msg); } catch (_) {}
      },
      status: typeof U.status === 'function' ? U.status : function (s) {
        try { window.__UAA_STATUS__ = s; } catch (_) {}
      },
      complete: typeof U.complete === 'function' ? U.complete : function (c) {
        try { window.__UAA_LAST_DONE__ = c; } catch (_) {}
      },
      modal: typeof U.modal === 'function' ? U.modal : function (opt) { return Promise.resolve(true); }
    };
  }

  // ---------------- 状态 ----------------
  var HN_COMPLETE = 100;
  var HN_API = '/wx/mp';
  var HN_STATE = {
    student: null,
    isLoggedIn: false,
    years: [],
    selectedYear: null,
    courses: [],
    selectedCourseKeys: [],
    loading: false,
    running: false,
    stopFlag: false,
    totalProgress: 0
  };
  function hnState() { return HN_STATE; }
  function hnKey(year, cid) { return Number(year) + ':' + Number(cid); }
  function hnParseKey(key) {
    var p = String(key || '').split(':');
    return { year: Number(p[0]) || 0, cid: Number(p[1]) || 0 };
  }
  function hnFindCourse(year, cid) {
    var i;
    for (i = 0; i < HN_STATE.courses.length; i++) {
      var c = HN_STATE.courses[i];
      if (Number(c.id) === Number(cid) && Number(c.year) === Number(year)) return c;
    }
    return null;
  }
  function hnBlockProgress(chapters) {
    if (!chapters || !chapters.length) return 0;
    var avg = 0, doneCount = 0, i;
    for (i = 0; i < chapters.length; i++) avg += Number(chapters[i].progress) || 0;
    avg = avg / chapters.length;
    for (i = 0; i < chapters.length; i++) {
      if ((Number(chapters[i].progress) || 0) >= HN_COMPLETE) doneCount++;
    }
    return Math.round(Math.max(avg, Math.round((doneCount / chapters.length) * 100)));
  }
  function hnUpdateTotal() {
    var n = HN_STATE.courses.length;
    if (!n) { HN_STATE.totalProgress = 0; return 0; }
    var sum = 0, i;
    for (i = 0; i < n; i++) sum += Number(HN_STATE.courses[i].progress) || 0;
    HN_STATE.totalProgress = Math.round(sum / n);
    return HN_STATE.totalProgress;
  }

  // ---------------- API ----------------
  function hnFetchStudent() {
    return hnGet('/StudentInfo').then(function (data) {
      if (Number(data.code) !== 0 || !data.student) {
        HN_STATE.isLoggedIn = false;
        throw new Error((data && data.msg) || '未登录，请先登录平台');
      }
      HN_STATE.student = data.student;
      HN_STATE.isLoggedIn = true;
      return data.student;
    });
  }
  function hnFetchCourses(year) {
    var params = {};
    if (year != null && year !== '') params.year = String(year);
    return hnGet('/MyCoursePC', params).then(function (data) {
      if (Number(data.code) !== 0) throw new Error((data && data.msg) || '加载课程失败');
      var years = Array.isArray(data.years) ? data.years.map(function (y) {
        return Number(typeof y === 'object' ? (y.year || y) : y);
      }).filter(Boolean) : [];
      var list = Array.isArray(data.userCourseList) ? data.userCourseList : [];
      return { years: years, list: list };
    });
  }
  function hnFetchDetail(courseId) {
    return hnGet('/Course', { id: courseId, code: '' }).then(function (data) {
      if (Number(data.code) !== 0) throw new Error((data && data.msg) || '加载章节失败');
      return data;
    });
  }
  function hnReport(params) {
    return hnPost('/CourseStudy', params).then(function (data) {
      if (Number(data.code) > 0) throw new Error((data && data.msg) || '上报失败');
      return data;
    });
  }
  function hnMapCourse(row, year) {
    var cc = Number(row.chapter_count) || 0;
    var done = Number(row.completed_count) || 0;
    var progress = cc > 0
      ? Math.round((done / cc) * 100)
      : Math.min(100, Math.max(0, Number(row.progress) || 0));
    return {
      id: Number(row.id) || 0,
      name: String(row.name || '未命名课程'),
      year: Number(year) || Number(row.card_year) || 0,
      chapter_count: cc,
      completed_count: done,
      progress: progress,
      raw: row
    };
  }
  function hnMapChapter(ch, courseId) {
    var duration = Number(ch.duration) || 0;
    var position = Number(ch.position) || 0;
    var progress = Number(ch.progress) || 0;
    var done = progress >= HN_COMPLETE || (duration > 0 && position >= duration);
    return {
      id: Number(ch.id) || 0,
      serial: Number(ch.serial) || 0,
      name: String(ch.name || '章节'),
      duration: duration,
      position: position,
      progress: progress,
      courseid: Number(ch.courseid || courseId) || courseId,
      done: done
    };
  }

  // ---------------- 加载 ----------------
  function hnLoadCourses(quiet) {
    if (!quiet) HN_STATE.loading = true;
    var bus = hnBus();
    bus.status({ stage: 'loading', label: '河南专技', total: 0, completed: 0, percent: 0 });
    return hnFetchStudent()
      .then(function () { return hnFetchCourses(''); })
      .then(function (first) {
        var yearSet = new Set(first.years);
        if (!yearSet.size && first.list.length) {
          first.list.forEach(function (c) {
            var y = Number(c.card_year) || new Date().getFullYear();
            yearSet.add(y);
          });
        }
        HN_STATE.years = Array.from(yearSet).sort(function (a, b) { return b - a; });
        if (HN_STATE.selectedYear == null && HN_STATE.years.length) HN_STATE.selectedYear = HN_STATE.years[0];
        if (HN_STATE.selectedYear != null && HN_STATE.years.indexOf(HN_STATE.selectedYear) < 0) {
          HN_STATE.selectedYear = HN_STATE.years.length ? HN_STATE.years[0] : null;
        }
        if (HN_STATE.selectedYear == null) return { list: [] };
        return hnFetchCourses(HN_STATE.selectedYear);
      })
      .then(function (r) {
        var all = [];
        r.list.forEach(function (row) { all.push(hnMapCourse(row, HN_STATE.selectedYear)); });
        HN_STATE.courses = all;
        HN_STATE.selectedCourseKeys = [];
        all.forEach(function (c) {
          if ((Number(c.progress) || 0) < HN_COMPLETE) HN_STATE.selectedCourseKeys.push(hnKey(c.year, c.id));
        });
        var total = hnUpdateTotal();
        var doneN = 0;
        HN_STATE.courses.forEach(function (c) { if ((Number(c.progress) || 0) >= HN_COMPLETE) doneN++; });
        bus.log('📚 已加载 ' + HN_STATE.courses.length + ' 门课程（' + doneN + ' 已完成，总进度 ' + total + '%）');
        bus.status({
          stage: 'ready',
          label: '河南专技 · 公需课',
          total: HN_STATE.courses.length,
          completed: doneN,
          percent: total,
          ready: true
        });
      })
      .catch(function (e) {
        HN_STATE.isLoggedIn = false;
        HN_STATE.courses = [];
        HN_STATE.selectedCourseKeys = [];
        hnUpdateTotal();
        if (!quiet) bus.log('⚠ ' + (e && e.message ? e.message : e));
        bus.status({ stage: 'needlogin', label: '河南专技', ready: false });
      })
      .then(function () { HN_STATE.loading = false; });
  }

  // ---------------- 学习流程 ----------------
  function hnStudyChapter(chapter, course) {
    if (chapter.done || (Number(chapter.progress) || 0) >= HN_COMPLETE) return Promise.resolve(true);
    var duration = Math.max(1, Number(chapter.duration) || 60);
    var position = Math.max(0, Number(chapter.position) || 0);
    if (duration - position <= 60) position = 0;
    var progress = Number(chapter.progress) || 0;
    var bus = hnBus();

    function step() {
      if (HN_STATE.stopFlag || progress >= HN_COMPLETE || position >= duration) {
        return Promise.resolve(progress);
      }
      var studylong = Math.min(300, duration - position);
      if (studylong <= 0) return Promise.resolve(progress);
      return hnSleep(600).then(function () {
        if (HN_STATE.stopFlag) return progress;
        position += studylong;
        if (position > duration) position = duration;
        return hnReport({
          courseid: course.id,
          chapter: chapter.serial,
          duration: duration,
          studylong: studylong,
          position: position
        }).then(function (res) {
          progress = Number(res.progress) || Math.floor((position / duration) * 100);
          chapter.position = position;
          chapter.progress = progress;
          chapter.done = progress >= HN_COMPLETE || position >= duration;
          var c = hnFindCourse(course.year, course.id);
          if (c) {
            var mapped = HN_STATE.courses.filter(function (x) { return x.id === course.id; });
            c.progress = hnBlockProgress([chapter]);
          }
          hnUpdateTotal();
          bus.log('📖 ' + course.name + ' · ' + chapter.name + ' 已学 ' + progress + '%');
          return step();
        });
      });
    }
    return step().then(function () {
      chapter.done = progress >= HN_COMPLETE || position >= duration;
      chapter.progress = Math.max(progress, chapter.done ? HN_COMPLETE : progress);
      return true;
    });
  }

  function hnStudyCourse(course) {
    var bus = hnBus();
    return hnFetchDetail(course.id).then(function (detail) {
      var chapters = (detail.courseChapter || [])
        .map(function (ch) { return hnMapChapter(ch, course.id); })
        .sort(function (a, b) { return (a.serial || 0) - (b.serial || 0); });
      var pending = chapters.filter(function (ch) {
        return !ch.done && (Number(ch.progress) || 0) < HN_COMPLETE;
      });
      if (!pending.length) {
        course.progress = 100;
        hnUpdateTotal();
        bus.log('✅ ' + course.name + ' 已完成');
        return;
      }
      bus.log('▶ 开始学习：' + course.name + '（' + pending.length + ' 个章节）');
      return Promise.all(pending.map(function (ch) {
        if (HN_STATE.stopFlag) return Promise.resolve();
        return hnStudyChapter(ch, course).catch(function (e) {
          bus.log('⚠ 章节 ' + ch.name + ' 出错：' + (e && e.message ? e.message : e));
        });
      })).then(function () {
        return hnFetchDetail(course.id).then(function (rd) {
          var refreshed = (rd.courseChapter || []).map(function (ch) { return hnMapChapter(ch, course.id); });
          course.progress = hnBlockProgress(refreshed);
          hnUpdateTotal();
          if (course.progress >= HN_COMPLETE) bus.log('🎉 ' + course.name + ' 完成');
        }).catch(function () {});
      });
    });
  }

  function hnStartAll() {
    var bus = hnBus();
    if (HN_STATE.running) return;
    if (!HN_STATE.isLoggedIn) {
      bus.modal({ title: '未登录', text: '请先登录河南省继续教育学会平台', buttons: [{ text: '好', primary: true }] });
      return;
    }
    var keys = HN_STATE.selectedCourseKeys.slice();
    var courses = [];
    keys.forEach(function (k) {
      var p = hnParseKey(k);
      var c = hnFindCourse(p.year, p.cid);
      if (c && (Number(c.progress) || 0) < HN_COMPLETE) courses.push(c);
    });
    if (!courses.length) {
      bus.status({ stage: 'done', label: '河南专技', total: HN_STATE.courses.length, completed: HN_STATE.courses.length, percent: 100 });
      bus.log('✨ 没有可学习的课程（全部已完成）');
      bus.complete({
        label: '河南专技',
        summary: HN_STATE.courses.length + ' 门课程已全部完成',
        gotoDonate: true
      });
      return;
    }
    HN_STATE.running = true;
    HN_STATE.stopFlag = false;
    bus.status({
      stage: 'running',
      label: '河南专技 · 公需课',
      total: HN_STATE.courses.length,
      completed: HN_STATE.courses.filter(function (c) { return c.progress >= HN_COMPLETE; }).length,
      percent: HN_STATE.totalProgress
    });
    bus.log('▶ 开始并发学习 ' + courses.length + ' 门课程');
    Promise.allSettled(courses.map(function (course) {
      if (HN_STATE.stopFlag) return Promise.resolve();
      return hnStudyCourse(course).catch(function (e) {
        bus.log('⚠ ' + course.name + ' 出错：' + (e && e.message ? e.message : e));
      });
    })).then(function () {
      HN_STATE.running = false;
      var total = hnUpdateTotal();
      var doneN = 0;
      HN_STATE.courses.forEach(function (c) { if (c.progress >= HN_COMPLETE) doneN++; });
      bus.status({
        stage: HN_STATE.stopFlag ? 'paused' : 'done',
        label: '河南专技 · 公需课',
        total: HN_STATE.courses.length,
        completed: doneN,
        percent: total
      });
      bus.log(HN_STATE.stopFlag ? '⏸ 已停止' : '🎉 全部课程已学完（总进度 ' + total + '%）');
      bus.complete({
        label: '河南专技',
        summary: doneN + '/' + HN_STATE.courses.length + ' 门完成（' + total + '%）',
        gotoDonate: !HN_STATE.stopFlag
      });
    });
  }

  function hnStop() {
    HN_STATE.stopFlag = true;
    hnBus().log('⏸ 收到停止信号');
  }

  // ---------------- 子站自动跳转（复用 UAA 通用 modal） ----------------
  if (HN_HOST !== HN_MAIN) {
    var HN_SITE_NAMES = {
      'nypx.jxjyedu.org.cn': '南阳理工学院',
      'hnzjgl.gov.cn': '河南专技管理平台',
      'jxjy.henu.edu.cn': '河南大学',
      'www.jxjy.henu.edu.cn': '河南大学',
      'hnpihn.newzhihui.cn': '河南工业职业技术学院',
      'www.hnpihn.newzhihui.cn': '河南工业职业技术学院',
      'zdkj.v.zzu.edu.cn': '郑州大学',
      'hnzj.ghlearning.com': '河南高辉教育科技有限公司',
      'hnzj.user.ghlearning.com': '河南高辉教育科技有限公司',
      'zyjs.lypt.edu.cn': '洛阳职业技术学院',
      'www.zyjs.lypt.edu.cn': '洛阳职业技术学院',
      'ly.fnhzj.com': '洛阳理工学院',
      'www.ly.fnhzj.com': '洛阳理工学院',
      'huayuzj.com': '中原工学院',
      'www.huayuzj.com': '中原工学院'
    };
    var siteName = HN_SITE_NAMES[HN_HOST] || '当前平台';
    var bus0 = hnBus();
    bus0.modal({
      title: '即将跳转 · 河南继续教育',
      html: '<div style="text-align:center;padding:8px 4px;">'
        + '<div style="font-size:44px;margin-bottom:10px;">🎓</div>'
        + '<div style="font-size:16px;color:#475569;margin-bottom:14px;">您当前访问的是 <strong>' + siteName + '</strong><br>脚本将自动跳转到 <strong>河南省继续教育学会</strong></div>'
        + '<div id="hn-redirect-num" style="font-size:40px;font-weight:900;color:#ea580c;background:#fef3c7;display:inline-block;padding:6px 24px;border-radius:60px;">3</div>'
        + '</div>',
      buttons: [],
      persistent: true
    });
    var cnt = 3;
    var numEl = document.getElementById('hn-redirect-num');
    var t = setInterval(function () {
      cnt -= 1;
      if (cnt <= 0) { clearInterval(t); try { location.replace('https://www.' + HN_MAIN + '/'); } catch (_) {} }
      else if (numEl) numEl.textContent = String(cnt);
    }, 1000);
    return;
  }

  // ---------------- 初始化 ----------------
  function hnInit() {
    var bus = hnBus();
    bus.status({ stage: 'init', label: '河南专技', ready: false });
    hnLoadCourses(true);
    setInterval(function () {
      hnFetchStudent().then(function () {
        if (!HN_STATE.isLoggedIn) {
          HN_STATE.isLoggedIn = true;
          hnLoadCourses(true);
        }
      }).catch(function () {
        HN_STATE.isLoggedIn = false;
      });
    }, 30000);
    // 暴露给面板触发
    window.UAA_HENAN = {
      start: hnStartAll,
      stop: hnStop,
      reload: hnLoadCourses,
      getState: function () {
        return {
          isLoggedIn: HN_STATE.isLoggedIn,
          running: HN_STATE.running,
          total: HN_STATE.courses.length,
          completed: HN_STATE.courses.filter(function (c) { return c.progress >= HN_COMPLETE; }).length,
          percent: HN_STATE.totalProgress,
          keys: HN_STATE.selectedCourseKeys.slice()
        };
      }
    };
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    hnInit();
  } else {
    document.addEventListener('DOMContentLoaded', hnInit);
  }
})();
