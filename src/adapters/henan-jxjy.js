// ======================== 河南专技继续教育 · 公需课学习驱动 ========================
// 功能移植自「秒刷！！！河南省专业技术人员继续教育公需课学习助手」(作者：叙言哥哥 v1.0.5)。
// 保留：多平台识别+自动跳转主站、课程/章节 API、并发学习上报、悬浮控制台、完成引导。
// 移除：授权码/公众号引流/设备指纹/每日限次（原作者商业化机制）、30 秒自动打赏弹窗。
// 打赏码替换为本项目作者收款码（build.js 顶部 AUTHOR_DONATE_WX/ALI，注入为 UAA_DONATE_WX/ALI）。
// 注意：本文件会被 build.js 拼进模板串，禁止使用反引号模板字符串与 ${ 插值。
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
  function hnEsc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hnTrunc(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function hnForm(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    });
    return parts.join('&');
  }
  function hnCourseKey(year, cid) { return Number(year) + ':' + Number(cid); }
  function hnParseKey(key) {
    var p = String(key || '').split(':');
    return { year: Number(p[0]) || 0, cid: Number(p[1]) || 0 };
  }
  function hnFindCourse(year, cid) {
    var i;
    for (i = 0; i < hnState.courses.length; i++) {
      var c = hnState.courses[i];
      if (Number(c.id) === Number(cid) && Number(c.year) === Number(year)) return c;
    }
    return null;
  }

  // ---------------- 自动跳转：非主站 → 河南省继续教育学会 ----------------
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
    var hnSiteName = HN_SITE_NAMES[HN_HOST] || '当前平台';
    var ov = document.createElement('div');
    ov.id = 'hn-redirect-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999999;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;';
    ov.innerHTML = '<div style="background:#fff;border-radius:28px;padding:40px 48px;max-width:520px;width:90%;box-shadow:0 30px 80px rgba(0,0,0,0.4);text-align:center;">'
      + '<div style="font-size:56px;margin-bottom:12px;">🚀</div>'
      + '<h2 style="font-size:24px;font-weight:900;color:#0f172a;margin:8px 0 6px;">即将跳转</h2>'
      + '<div style="font-size:16px;color:#475569;margin-bottom:20px;">您当前访问的是 <strong>' + hnSiteName + '</strong><br>本脚本将自动跳转到 <strong>河南省继续教育学会</strong></div>'
      + '<div id="hn-redirect-num" style="font-size:52px;font-weight:900;color:#ea580c;background:#fef3c7;display:inline-block;padding:0 28px;border-radius:60px;line-height:1.4;">3</div>'
      + '</div>';
    document.body.appendChild(ov);
    var hnCnt = 3;
    var hnNumEl = document.getElementById('hn-redirect-num');
    var hnTimer = setInterval(function () {
      hnCnt -= 1;
      if (hnCnt <= 0) {
        clearInterval(hnTimer);
        try { location.replace('https://www.' + HN_MAIN + '/'); } catch (_) {}
      } else if (hnNumEl) {
        hnNumEl.textContent = String(hnCnt);
      }
    }, 1000);
    return;
  }

  // ---------------- 状态 ----------------
  var hnState = {
    student: null,
    isLoggedIn: false,
    years: [],
    selectedYear: null,
    courses: [],
    selectedCourseKeys: new Set(),
    chapterPreview: [],
    loading: false,
    running: false,
    stopFlag: false,
    currentTask: '待命',
    totalProgress: 0,
    logLines: [],
    completionShown: false,
    donateShown: false
  };
  var HN_COMPLETE = 100;
  var HN_API = '/wx/mp';

  // ---------------- API ----------------
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

  function hnFetchStudent() {
    return hnGet('/StudentInfo').then(function (data) {
      if (Number(data.code) !== 0 || !data.student) {
        hnState.isLoggedIn = false;
        throw new Error((data && data.msg) || '未登录，请先登录平台');
      }
      hnState.student = data.student;
      hnState.isLoggedIn = true;
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
      credit: Number(row.credit) || 0,
      type: row.type,
      card_year: row.card_year,
      chapter_count: cc,
      completed_count: done,
      studylong: Number(row.studylong) || 0,
      status: row.status,
      status_study: row.status_study,
      begin: row.begin,
      year: Number(year) || Number(row.card_year) || 0,
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
      url: ch.url,
      courseid: Number(ch.courseid || courseId) || courseId,
      done: done,
      status: done ? 'completed' : (progress > 0 ? 'learning' : 'notstarted')
    };
  }
  function hnBlockProgress(chapters) {
    if (!chapters || !chapters.length) return 0;
    var avg = 0, doneCount = 0, i;
    for (i = 0; i < chapters.length; i++) avg += Number(chapters[i].progress) || 0;
    avg = avg / chapters.length;
    for (i = 0; i < chapters.length; i++) {
      if ((Number(chapters[i].progress) || 0) >= HN_COMPLETE) doneCount++;
    }
    var byDone = Math.round((doneCount / chapters.length) * 100);
    return Math.round(Math.max(avg, byDone));
  }
  function hnRecomputeYear(year) {
    var sum = 0, n = 0, i;
    for (i = 0; i < hnState.courses.length; i++) {
      var c = hnState.courses[i];
      if (Number(c.year) === Number(year)) { sum += Number(c.progress) || 0; n++; }
    }
    if (!n) return 0;
    var avg = Math.round(sum / n);
    var y = null;
    for (i = 0; i < hnState.years.length; i++) {
      if (Number(hnState.years[i].year) === Number(year)) { y = hnState.years[i]; break; }
    }
    if (y) y.progress = avg;
    return avg;
  }
  function hnUpdateTotal() {
    var n = hnState.courses.length;
    if (!n) { hnState.totalProgress = 0; return; }
    var sum = 0, i;
    for (i = 0; i < n; i++) sum += Number(hnState.courses[i].progress) || 0;
    hnState.totalProgress = Math.round(sum / n);
  }
  function hnLog(msg) {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    var ss = String(d.getSeconds()).padStart(2, '0');
    hnState.logLines.unshift('[' + hh + ':' + mm + ':' + ss + '] ' + msg);
    if (hnState.logLines.length > 200) hnState.logLines.length = 200;
    hnUpdateUI();
  }

  // ---------------- 学习流程 ----------------
  function hnLoadAll(quiet) {
    if (!quiet) hnState.loading = true;
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
        hnState.years = Array.from(yearSet).sort(function (a, b) { return b - a; })
          .map(function (y) { return { year: y, progress: 0 }; });
        if (hnState.selectedYear == null && hnState.years.length) hnState.selectedYear = hnState.years[0].year;
        if (hnState.selectedYear != null && !hnState.years.some(function (y) { return Number(y.year) === Number(hnState.selectedYear); })) {
          hnState.selectedYear = hnState.years.length ? hnState.years[0].year : null;
        }
        if (hnState.selectedYear != null) {
          return hnFetchCourses(hnState.selectedYear);
        }
        return { list: [] };
      })
      .then(function (r) {
        var all = [];
        r.list.forEach(function (row) { all.push(hnMapCourse(row, hnState.selectedYear)); });
        hnState.courses = all;
        hnState.years.forEach(function (y) { hnRecomputeYear(y.year); });
        var incomplete = hnState.courses.filter(function (c) { return (Number(c.progress) || 0) < HN_COMPLETE; });
        hnState.selectedCourseKeys = new Set(incomplete.map(function (c) { return hnCourseKey(c.year, c.id); }));
        hnUpdateTotal();
        hnUpdateUI();
      })
      .catch(function (e) {
        hnState.isLoggedIn = false;
        if (!quiet) hnLog('未登录或加载失败：' + (e && e.message ? e.message : e));
        hnState.courses = [];
        hnState.years = [];
        hnState.selectedCourseKeys = new Set();
        hnUpdateTotal();
        hnUpdateUI();
      })
      .then(function () { hnState.loading = false; });
  }

  function hnStudyChapter(chapter, course) {
    if (chapter.done || (Number(chapter.progress) || 0) >= HN_COMPLETE) return Promise.resolve(true);
    hnState.currentTask = hnTrunc(course.name, 8) + ' / ' + chapter.name;
    hnUpdateUI();
    var duration = Math.max(1, Number(chapter.duration) || 60);
    var position = Math.max(0, Number(chapter.position) || 0);
    if (duration - position <= 60) position = 0;
    var progress = Number(chapter.progress) || 0;

    function step() {
      if (hnState.stopFlag || progress >= HN_COMPLETE || position >= duration) {
        return Promise.resolve(progress);
      }
      var studylong = Math.min(300, duration - position);
      if (studylong <= 0) return Promise.resolve(progress);
      return hnSleep(600).then(function () {
        if (hnState.stopFlag) return progress;
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
          chapter.status = chapter.done ? 'completed' : 'learning';
          var c = hnFindCourse(course.year, course.id);
          if (c) {
            var blk = null;
            for (var i = 0; i < hnState.chapterPreview.length; i++) {
              if (hnState.chapterPreview[i].courseId === course.id) { blk = hnState.chapterPreview[i]; break; }
            }
            var computed = hnBlockProgress(blk ? blk.chapters : []);
            c.progress = computed;
          }
          hnUpdateTotal();
          hnLog(course.name + ' · ' + chapter.name + ' 已学' + progress + '%（总进度 ' + hnState.totalProgress + '%）');
          hnUpdateUI();
          return step();
        });
      });
    }
    return step().then(function () {
      if (hnState.stopFlag) return false;
      chapter.done = progress >= HN_COMPLETE || position >= duration;
      chapter.progress = Math.max(progress, chapter.done ? HN_COMPLETE : progress);
      if (chapter.done) {
        chapter.status = 'completed';
        hnLog(course.name + ' · ' + chapter.name + ' 完成');
      }
      hnUpdateTotal();
      hnUpdateUI();
      return true;
    });
  }

  function hnStudyCourse(course) {
    return hnFetchDetail(course.id).then(function (detail) {
      var allChapters = (detail.courseChapter || [])
        .map(function (ch) { return hnMapChapter(ch, course.id); })
        .sort(function (a, b) { return (a.serial || 0) - (b.serial || 0); });
      var blk = null, i;
      for (i = 0; i < hnState.chapterPreview.length; i++) {
        if (hnState.chapterPreview[i].courseId === course.id) { blk = hnState.chapterPreview[i]; break; }
      }
      if (!blk) {
        blk = { courseId: course.id, chapters: allChapters };
        hnState.chapterPreview.push(blk);
      } else {
        blk.chapters = allChapters;
      }
      var pending = allChapters.filter(function (ch) {
        return !ch.done && (Number(ch.progress) || 0) < HN_COMPLETE;
      });
      if (!pending.length) {
        hnLog(course.name + ' 已完成');
        course.progress = 100;
        hnUpdateTotal();
        hnUpdateUI();
        return;
      }
      hnLog(course.name + ' · ' + pending.length + ' 个章节并行学习中');
      return Promise.all(pending.map(function (chapter) {
        if (hnState.stopFlag) return Promise.resolve();
        return hnStudyChapter(chapter, course).catch(function (e) {
          hnLog('章节 ' + chapter.name + ' 出错：' + (e && e.message ? e.message : e));
        });
      })).then(function () {
        return hnFetchDetail(course.id).then(function (rd) {
          var refreshed = (rd.courseChapter || []).map(function (ch) { return hnMapChapter(ch, course.id); });
          var computed = hnBlockProgress(refreshed);
          course.progress = computed;
          for (var i = 0; i < hnState.chapterPreview.length; i++) {
            if (hnState.chapterPreview[i].courseId === course.id) {
              hnState.chapterPreview[i].chapters = refreshed;
              break;
            }
          }
          hnRecomputeYear(course.year);
          hnUpdateTotal();
          hnUpdateUI();
          if (computed >= 100) hnLog(course.name + ' 完成');
        }).catch(function () {});
      });
    });
  }

  function hnStartAll() {
    if (hnState.running) return;
    if (!hnState.isLoggedIn) {
      hnModal({ title: '未登录', text: '请先登录河南省继续教育学会平台', buttons: [{ text: '确定', primary: true }] });
      return;
    }
    var courses = Array.from(hnState.selectedCourseKeys).map(function (key) {
      var p = hnParseKey(key);
      return hnFindCourse(p.year, p.cid);
    }).filter(Boolean).filter(function (c) { return (Number(c.progress) || 0) < HN_COMPLETE; });
    if (!courses.length) {
      hnLog('没有需要学习的课程');
      hnShowComplete(true);
      return;
    }
    hnState.running = true;
    hnState.stopFlag = false;
    var startBtn = document.getElementById('hn-start-btn');
    if (startBtn) startBtn.textContent = '学习中';
    hnLog('开始并发学习 · ' + courses.length + ' 门课');
    Promise.allSettled(courses.map(function (course) {
      if (hnState.stopFlag) return Promise.resolve();
      return hnStudyCourse(course).catch(function (e) {
        hnLog(course.name + ' 出错：' + (e && e.message ? e.message : e));
      });
    })).then(function () {
      hnState.running = false;
      if (startBtn) startBtn.textContent = '开始学习';
      if (hnState.stopFlag) {
        hnLog('学习已停止');
      } else {
        hnLog('全部课程已学完');
        hnUpdateTotal();
        hnShowComplete(hnState.totalProgress >= HN_COMPLETE);
      }
      hnUpdateUI();
    });
  }

  // ---------------- UI ----------------
  function hnModal(options) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.id = 'hn-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:1000000;background:rgba(0,0,0,0.5);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;';
      var card = document.createElement('div');
      card.style.cssText = 'background:#fff;border-radius:24px;max-width:520px;width:100%;box-shadow:0 30px 60px rgba(0,0,0,0.3);overflow:hidden;font-family:-apple-system,"Microsoft YaHei",sans-serif;';
      var header = document.createElement('div');
      header.style.cssText = 'background:linear-gradient(135deg,#fef3c7,#fde68a);padding:16px 20px;border-bottom:1px solid #fcd34d;';
      header.innerHTML = '<div style="font-size:20px;font-weight:900;color:#92400e;">' + hnEsc(options.title || '提示') + '</div>';
      card.appendChild(header);
      var body = document.createElement('div');
      body.style.cssText = 'padding:20px 24px;font-size:15px;color:#334155;line-height:1.6;';
      if (options.html) body.innerHTML = options.html;
      else body.textContent = options.text || '';
      card.appendChild(body);
      var footer = document.createElement('div');
      footer.style.cssText = 'padding:0 24px 20px;display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;';
      var buttons = options.buttons || [{ text: '确定', primary: true }];
      buttons.forEach(function (btn) {
        var b = document.createElement('button');
        b.textContent = btn.text;
        b.style.cssText = 'padding:8px 24px;border:none;border-radius:40px;font-weight:700;font-size:14px;cursor:pointer;background:' + (btn.primary ? 'linear-gradient(135deg,#1d4ed8,#0ea5e9)' : '#e2e8f0') + ';color:' + (btn.primary ? '#fff' : '#334155') + ';';
        b.addEventListener('click', function () {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve(true);
        });
        footer.appendChild(b);
      });
      card.appendChild(footer);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    });
  }

  function hnDonateImages() {
    var imgs = '';
    var wx = (typeof UAA_DONATE_WX !== 'undefined') ? UAA_DONATE_WX : '';
    var ali = (typeof UAA_DONATE_ALI !== 'undefined') ? UAA_DONATE_ALI : '';
    if (wx) imgs += '<div style="margin-bottom:10px;"><div style="font-weight:700;color:#666;margin-bottom:6px;">微信赞赏</div><img src="' + wx + '" style="max-width:100%;border-radius:12px;"></div>';
    if (ali) imgs += '<div><div style="font-weight:700;color:#666;margin-bottom:6px;">支付宝赞赏</div><img src="' + ali + '" style="max-width:100%;border-radius:12px;"></div>';
    if (!imgs) imgs = '<div style="color:#999;">请扫码支持作者</div>';
    return imgs;
  }

  function hnShowDonate() {
    if (hnState.donateShown) return;
    hnState.donateShown = true;
    hnModal({
      title: '💖 感谢支持',
      html: hnDonateImages(),
      buttons: [{ text: '关闭', primary: true }]
    }).then(function () { hnState.donateShown = false; });
  }

  function hnShowComplete(allDone) {
    if (hnState.completionShown) return;
    hnState.completionShown = true;
    var msg = allDone
      ? '🎉 恭喜您完成全部课程学习，祝您工作顺利！'
      : '学习完成（总进度 ' + hnState.totalProgress + '%），请检查网络或继续学习剩余课程。';
    hnModal({
      title: '🎉 学习完成！',
      html: '<div style="font-size:17px;color:#333;line-height:1.8;">' + msg + '</div>'
        + '<div style="text-align:center;margin-top:20px;"><button id="hn-thanks-btn" style="background:#e74c3c;color:#fff;border:none;padding:12px 40px;border-radius:50px;font-size:18px;font-weight:bold;cursor:pointer;box-shadow:0 4px 15px rgba(231,76,60,0.5);">❤️ 感谢作者</button></div>',
      buttons: []
    }).then(function () {}).catch(function () {});
    var t = setInterval(function () {
      var btn = document.getElementById('hn-thanks-btn');
      if (btn) {
        clearInterval(t);
        btn.addEventListener('click', function () {
          var ov = document.getElementById('hn-modal-overlay');
          if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
          hnShowDonate();
        });
      }
    }, 100);
  }

  function hnShowGuide() {
    hnModal({
      title: '📚 使用指南',
      html: '<div style="text-align:left;max-width:600px;">'
        + '<div style="background:#f0faf0;padding:14px;border-radius:12px;border-left:6px solid #4CAF50;margin-bottom:12px;">'
        + '<div style="font-weight:600;color:#2e7d32;margin-bottom:8px;">🚀 使用流程</div>'
        + '<div style="font-size:14px;line-height:2;">1️⃣ 登录河南省继续教育学会账号<br>2️⃣ 脚本自动识别课程与章节<br>3️⃣ 点击左侧「开始学习」，自动并行学习所有未完成课程</div>'
        + '</div>'
        + '<div style="background:#e3f2fd;padding:14px;border-radius:12px;border-left:6px solid #2196F3;">'
        + '<div style="font-weight:600;color:#0d47a1;margin-bottom:8px;">📡 支持平台</div>'
        + '<div style="font-size:14px;line-height:1.9;">河南省继续教育学会 · 南阳理工学院 · 河南大学 · 郑州大学 · 河南工业职业技术学院 · 洛阳理工学院 · 洛阳职业技术学院 · 中原工学院 等<br>非主站会自动跳转到主站学习。</div>'
        + '</div>'
        + '<div style="background:#fce4ec;padding:14px;border-radius:12px;border-left:6px solid #e91e63;margin-top:12px;">'
        + '<div style="font-weight:600;color:#c62828;margin-bottom:8px;">💡 提示</div>'
        + '<div style="font-size:14px;line-height:1.9;">• 学习进度为平台侧上报，请保持页面打开<br>• 学完自动弹完成提示<br>• 作者不易，好用可以打赏支持 ❤️</div>'
        + '</div>'
        + '</div>',
      buttons: [{ text: '我知道了', primary: true }]
    });
  }

  function hnUpdateUI() {
    var startBtn = document.getElementById('hn-start-btn');
    if (startBtn) {
      if (hnState.isLoggedIn) {
        startBtn.style.opacity = '1';
        startBtn.style.pointerEvents = 'auto';
        startBtn.style.background = 'linear-gradient(145deg,#4CAF50,#2E7D32)';
        startBtn.textContent = hnState.running ? '学习中' : '开始学习';
      } else {
        startBtn.style.opacity = '0.5';
        startBtn.style.pointerEvents = 'none';
        startBtn.style.background = 'linear-gradient(145deg,#9E9E9E,#616161)';
        startBtn.textContent = '请登录';
      }
    }
    var panel = document.getElementById('hn-log-panel');
    if (panel) {
      var total = hnState.courses.length;
      var doneN = hnState.courses.filter(function (c) { return Number(c.progress) >= HN_COMPLETE; }).length;
      var statusMsg;
      if (total === 0) statusMsg = '📭 未选课，请先登录';
      else if (doneN === total) statusMsg = '🎉 全部课程已完成（' + total + ' 门）';
      else statusMsg = '📊 总进度 ' + hnState.totalProgress + '%（' + doneN + '/' + total + ' 门完成）';
      var logs = hnState.logLines.slice(0, 25);
      var html = '<div style="color:#aaa;padding:4px 0;border-bottom:1px solid #444;display:flex;justify-content:space-between;">'
        + '<span>📋 河南专技 · 学习日志</span>'
        + '<span style="color:' + (hnState.isLoggedIn ? '#4CAF50' : '#f44336') + ';">' + (hnState.isLoggedIn ? '✅ 已登录' : '❌ 未登录') + '</span>'
        + '</div>'
        + '<div style="color:#4FC3F7;padding:4px 0;border-bottom:1px solid #333;margin-bottom:4px;">' + statusMsg + '</div>';
      if (!logs.length) {
        html += '<div style="color:#666;padding:4px;">暂无日志</div>';
      } else {
        html += logs.map(function (line) {
          return '<div style="padding:2px 0;border-bottom:1px solid rgba(255,255,255,0.05);word-break:break-all;line-height:1.4;"><span style="color:#888;margin-right:6px;">' + line.slice(0, 9) + '</span>' + hnEsc(line.slice(10)) + '</div>';
        }).join('');
      }
      panel.innerHTML = html;
      panel.scrollTop = panel.scrollHeight;
    }
  }

  function hnCreateUI() {
    var style = document.createElement('style');
    style.textContent = '.hn-btn{position:fixed;left:10px;display:flex;align-items:center;justify-content:center;font-family:"Microsoft YaHei";text-align:center;line-height:1.2;padding:0;z-index:2147483647;border:none;cursor:pointer;transition:transform .2s,box-shadow .2s;user-select:none;box-shadow:0 2px 12px rgba(0,0,0,0.25);width:70px;height:70px;border-radius:50%;font-size:13px;font-weight:bold;color:#fff;background:linear-gradient(145deg,#FF6F00,#E65100);}'
      + '.hn-btn:hover{transform:scale(1.06);}'
      + '.hn-btn:active{transform:scale(0.95);}'
      + '#hn-guide-btn{top:110px;}'
      + '#hn-start-btn{top:200px;background:linear-gradient(145deg,#9E9E9E,#616161);border:2px solid #fff;opacity:0.5;pointer-events:none;}'
      + '#hn-donate-btn{top:290px;background:linear-gradient(145deg,#FF4081,#C2185B);}'
      + '#hn-log-panel{position:fixed;bottom:20px;right:20px;width:340px;max-height:250px;overflow-y:auto;background:rgba(0,0,0,0.75);color:#e0e0e0;border-radius:12px;padding:8px 12px;font-family:Consolas,"Microsoft YaHei",monospace;font-size:12px;z-index:2147483647;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,0.15);box-shadow:0 4px 20px rgba(0,0,0,0.5);pointer-events:none;}';
    document.head.appendChild(style);

    var guideBtn = document.createElement('div');
    guideBtn.id = 'hn-guide-btn';
    guideBtn.className = 'hn-btn';
    guideBtn.innerHTML = '使用<br>指南';
    guideBtn.addEventListener('click', hnShowGuide);
    document.body.appendChild(guideBtn);

    var startBtn = document.createElement('div');
    startBtn.id = 'hn-start-btn';
    startBtn.className = 'hn-btn';
    startBtn.textContent = '请登录';
    startBtn.addEventListener('click', function () {
      if (!hnState.isLoggedIn) {
        hnModal({ title: '未登录', text: '请先登录河南省继续教育学会平台', buttons: [{ text: '确定', primary: true }] });
        return;
      }
      hnStartAll();
    });
    document.body.appendChild(startBtn);

    var donateBtn = document.createElement('div');
    donateBtn.id = 'hn-donate-btn';
    donateBtn.className = 'hn-btn';
    donateBtn.innerHTML = '💖<br>打赏';
    donateBtn.addEventListener('click', hnShowDonate);
    document.body.appendChild(donateBtn);

    var panel = document.createElement('div');
    panel.id = 'hn-log-panel';
    panel.innerHTML = '<div style="color:#aaa;padding:4px;text-align:center;">河南专技 · 日志加载中…</div>';
    document.body.appendChild(panel);

    hnUpdateUI();
  }

  // ---------------- 初始化 ----------------
  function hnInit() {
    hnCreateUI();
    hnLoadAll(true);
    // 定期检测登录态
    setInterval(function () {
      hnFetchStudent().then(hnUpdateUI).catch(function () {
        hnState.isLoggedIn = false;
        hnUpdateUI();
      });
    }, 30000);
    // 定期检测完成状态（未弹过完成提示时）
    setInterval(function () {
      if (hnState.completionShown) return;
      if (!hnState.isLoggedIn) return;
      var total = hnState.courses.length;
      if (!total) return;
      var doneN = hnState.courses.filter(function (c) { return Number(c.progress) >= HN_COMPLETE; }).length;
      if (doneN === total) hnShowComplete(true);
    }, 5000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    hnInit();
  } else {
    document.addEventListener('DOMContentLoaded', hnInit);
  }
})();
