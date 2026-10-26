/* 三寶讀書會登入門檻（比照 V4 Google 登入＋管理員審核，集合與 V4 隔離）
   Firebase 專案：my-chinese-sentence-bank-v3（與 V4 同專案，不同集合）
   申請：sanbao_accessRequests/{uid}；核准：sanbao_approvedUsers/{uid}
   管理員：f216002@gmail.com（免審核）
   注意：GitHub Pages 是靜態託管，門檻擋的是一般瀏覽；
   懂技術的人直接抓 index.html 仍看得到內文，真正的「不公開」要靠：
   不公開散佈網址＋不公開 repo＋搜尋引擎 noindex。 */
(function () {
  'use strict';
  var ADMIN = 'f216002@gmail.com';
  /* 重新整理鍵不依賴 Firebase，必須在最前面先接好：
     萬一 Firebase 初始化失敗導致後面提前 return，按鍵也不能跟著死掉。 */
  var utilRefreshEarly = document.getElementById('sanbaoUtilRefresh');
  if (utilRefreshEarly) utilRefreshEarly.onclick = function () { location.reload(); };
  var msg = document.getElementById('sanbaoGateMsg');
  var userBox = document.getElementById('sanbaoGateUser');
  var signInBtn = document.getElementById('sanbaoSignIn');
  var applyBtn = document.getElementById('sanbaoApply');
  var applyForm = document.getElementById('sanbaoApplyForm');
  var applyName = document.getElementById('sanbaoApplyName');
  var applyUnit = document.getElementById('sanbaoApplyUnit');
  var applyDistrict = document.getElementById('sanbaoApplyDistrict');
  var applySubmit = document.getElementById('sanbaoApplySubmit');
  var applyCancel = document.getElementById('sanbaoApplyCancel');
  var signOutBtn = document.getElementById('sanbaoSignOut');
  function setMsg(t) { if (msg) msg.textContent = t; }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function openGate() {
    document.body.classList.add('sanbao-approved');
    var g = document.getElementById('sanbaoGate');
    if (g) g.style.display = 'none';
    /* 雲端卡片修改（管理員在卡片上按 ✎ 編輯儲存的內容）：規則發布後才讀得到，
       讀不到就靜默跳過，本機修改不受影響。 */
    if (db && window.SANBAO_applyEdits) {
      db.collection('sanbao_cardEdits').get().then(function (snap) {
        var edits = {};
        snap.forEach(function (doc) { edits[doc.id] = doc.data(); });
        window.SANBAO_applyEdits(edits);
      }).catch(function () {});
    }
    /* 使用統計：放行即開始記錄 session（writer 函式定義在後方「使用統計」區段，hoisted）。 */
    analyticsStartSession(currentUser);
  }

  /* ---------- 使用統計：session 記錄（2026-10-26 Cheng 要求，比照 V4） ----------
     集合 sanbao_analytics_sessions；登入放行時建檔、心跳每 5 分鐘更新時長、
     登出／關頁結算；上次未結算的 session 下次登入自動結算（orphanClosed）。
     與 V4 不同的一點：孤兒結算只標 orphanClosed、不把登出時間寫成下次登入時間，
     時長保留最後一次心跳的值，避免時長灌水；明細顯示「異常結束（下次登入時結算）」。
     規則未發布前寫入會靜默失敗，不影響登入與閱讀。 */
  var analytics = { sessionId: null, uid: '', loginAtMs: 0, heartbeatTimer: null };
  function analyticsPageName() {
    try {
      return String(location.pathname || '').indexOf('listening') !== -1 ? '聽力練習' : '首頁';
    } catch (_) { return '首頁'; }
  }
  function analyticsCloseOrphans(uid) {
    if (!db) return;
    try {
      db.collection('sanbao_analytics_sessions').where('uid', '==', uid).get().then(function (snap) {
        snap.forEach(function (doc) {
          if (doc.id === analytics.sessionId) return;
          var d = doc.data() || {};
          if (d.logoutAt || d.orphanClosed) return;
          doc.ref.update({ orphanClosed: true }).catch(function () {});
        });
      }).catch(function () {});
    } catch (_) {}
  }
  function analyticsSaveProgress() {
    if (!db || !analytics.sessionId) return;
    var sec = Math.max(0, Math.round((Date.now() - analytics.loginAtMs) / 1000));
    try {
      db.collection('sanbao_analytics_sessions').doc(analytics.sessionId).update({ durationSec: sec }).catch(function () {});
    } catch (_) {}
  }
  function analyticsStartSession(user) {
    if (!db || !user || analytics.sessionId) return;
    var uid = user.uid;
    analyticsCloseOrphans(uid);
    analytics.sessionId = uid + '_' + Date.now();
    analytics.uid = uid;
    analytics.loginAtMs = Date.now();
    try {
      db.collection('sanbao_analytics_sessions').doc(analytics.sessionId).set({
        uid: uid, email: user.email || '', displayName: user.displayName || '',
        page: analyticsPageName(),
        loginAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        logoutAt: null, durationSec: 0, orphanClosed: false
      }).catch(function () {});
    } catch (_) {}
    if (analytics.heartbeatTimer) clearInterval(analytics.heartbeatTimer);
    analytics.heartbeatTimer = setInterval(analyticsSaveProgress, 5 * 60 * 1000);
  }
  function analyticsEndSession() {
    if (!db || !analytics.sessionId) return;
    var id = analytics.sessionId;
    var sec = Math.max(0, Math.round((Date.now() - analytics.loginAtMs) / 1000));
    analytics.sessionId = null;
    if (analytics.heartbeatTimer) { clearInterval(analytics.heartbeatTimer); analytics.heartbeatTimer = null; }
    try {
      db.collection('sanbao_analytics_sessions').doc(id).update({
        logoutAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        durationSec: sec
      }).catch(function () {});
    } catch (_) {}
  }
  window.addEventListener('pagehide', function () { analyticsEndSession(); });
  var auth, db;
  try {
    if (!window.firebase) throw new Error('Firebase SDK 載入失敗');
    if (!window.firebase.apps.length) {
      window.firebase.initializeApp({
        apiKey: 'AIzaSyChpInXumwIWaOrR4cU8KhNm1NK5-RdgQw',
        authDomain: 'my-chinese-sentence-bank-v3.firebaseapp.com',
        projectId: 'my-chinese-sentence-bank-v3',
        storageBucket: 'my-chinese-sentence-bank-v3.firebasestorage.app',
        messagingSenderId: '178850974896',
        appId: '1:178850974896:web:f1d40b2ed4e7218b553f75'
      });
    }
    auth = window.firebase.auth();
    db = window.firebase.firestore();
    window.SANBAO_DB = db;
  } catch (e) {
    setMsg('登入功能暫時無法使用，請重新整理頁面。');
    return;
  }
  var provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  function isAdmin(user) {
    return user && String(user.email || '').toLowerCase() === ADMIN;
  }
  /* 核准串接（2026-10-26 Cheng 指示）：
     V4 語橋學院已核准的老師（v4_approvedTeachers/{uid}，active=true）
     在三寶站直接放行，不用再審核一次；三寶站同時接受新人申請，
     新人走 sanbao_accessRequests → 管理員核准 → sanbao_approvedUsers。
     V4 規則本來就允許本人讀自己的 v4_approvedTeachers 文件，
     所以這段串接不需要改 V4 規則；三寶規則未發布前，
     V4 已核准者仍可直接放行，新人申請則要等規則發布後才送得出。 */
  function checkApproval(user) {
    if (isAdmin(user)) { openGate(); return; }
    db.collection('sanbao_approvedUsers').doc(user.uid).get().then(function (doc) {
      if (doc.exists && doc.data().active === true) { openGate(); return true; }
      return false;
    }).catch(function () { return false; }).then(function (sanbaoOk) {
      if (sanbaoOk) return;
      return db.collection('v4_approvedTeachers').doc(user.uid).get().then(function (doc) {
        if (doc.exists && doc.data().active === true) { openGate(); return; }
        setMsg('已登入（' + (user.email || '') + '），但尚未核准。請按「申請加入讀書會」，等管理員核准後重新整理即可閱讀。');
        show(applyBtn, true);
      });
    }).catch(function (err) {
      setMsg('無法確認核准狀態（' + (err.code || err.message) + '）。若你是管理員，請先到 Firebase Console 發布三寶規則（見 sanbao-firestore-rules-snippet.txt）。');
      show(applyBtn, true);
    });
  }
  /* ---------- 後台審核面板（2026-10-26 Cheng 要求；設計比照 V4 後台） ----------
     入口：右上角工具列「後台審核」鍵，僅管理員可見；面板開啟時再驗一次管理員身分。
     分頁：待審核申請（核准／拒絕＋備註／刪除）＋已核准學員（暫停／恢復／刪除）。
     規則已允許管理員 list／update／delete 這兩個集合，不需改規則。 */
  var adminPanel = document.getElementById('sanbaoAdminPanel');
  var adminBlocked = document.getElementById('sanbaoAdminBlocked');
  var adminApp = document.getElementById('sanbaoAdminApp');
  var adminReqBody = document.getElementById('sanbaoReqBody');
  var adminTeacherBody = document.getElementById('sanbaoTeacherBody');
  var adminReqEmpty = document.getElementById('sanbaoReqEmpty');
  var adminTeacherEmpty = document.getElementById('sanbaoTeacherEmpty');
  var adminReqCount = document.getElementById('sanbaoReqCount');
  var adminTeacherCount = document.getElementById('sanbaoTeacherCount');
  var adminToast = document.getElementById('sanbaoAdminToast');
  var adminTab = 'requests';
  var currentUser = null;
  function escAdmin(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtAdminDate(ts) {
    if (!ts) return '—';
    try {
      var d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
      return d.toLocaleString('zh-TW', { hour12: false });
    } catch (_) { return '—'; }
  }
  function adminToastShow(msg, isErr) {
    if (!adminToast) return;
    adminToast.textContent = msg;
    adminToast.style.background = isErr ? '#8a1f1f' : '#26221b';
    adminToast.style.display = 'block';
    clearTimeout(adminToastShow._t);
    adminToastShow._t = setTimeout(function () { adminToast.style.display = 'none'; }, 4000);
  }
  function adminBadge(status) {
    var map = { pending: ['待審核', 'pending'], approved: ['已核准', 'approved'], rejected: ['已拒絕', 'rejected'] };
    var e = map[status] || [status || '—', ''];
    return '<span class="status-badge ' + e[1] + '">' + escAdmin(e[0]) + '</span>';
  }
  function teacherBadge(d) {
    if (d.active) return '<span class="status-badge approved">使用中</span>';
    if (d.status === 'rejected') return '<span class="status-badge rejected">已拒絕</span>';
    return '<span class="status-badge suspended">已暫停</span>';
  }
  function renderAdminRequests(snap) {
    var rows = [];
    snap.forEach(function (doc) {
      var d = doc.data() || {}; var id = doc.id;
      rows.push('<tr><td><div class="cell-main">' + escAdmin(d.name || d.displayName || '未具名') + '</div><div class="cell-sub">' + escAdmin(d.email || '') + '</div><div class="cell-sub">單位：' + escAdmin(d.unit || '—') + ' · 區別：' + escAdmin(d.district || '—') + '</div></td>' +
        '<td class="mono">' + escAdmin(id) + '</td><td>' + fmtAdminDate(d.createdAt) + '</td><td>' + adminBadge(d.status) + '</td><td class="actions">' +
        (d.status === 'pending'
          ? '<button type="button" data-admin-approve="' + escAdmin(id) + '">核准</button>' +
            '<button type="button" class="danger" data-admin-reject="' + escAdmin(id) + '">拒絕</button>'
          : '') +
        '<button type="button" class="ghost" data-admin-del-req="' + escAdmin(id) + '">刪除</button></td></tr>');
    });
    adminReqBody.innerHTML = rows.join('');
    adminReqEmpty.style.display = rows.length ? 'none' : '';
    adminReqCount.textContent = rows.length + ' 筆';
  }
  function renderAdminTeachers(snap) {
    var rows = [];
    snap.forEach(function (doc) {
      var d = doc.data() || {}; var id = doc.id;
      rows.push('<tr><td><div class="cell-main">' + escAdmin(d.name || d.displayName || '未具名') + '</div><div class="cell-sub">' + escAdmin(d.email || '') + '</div><div class="cell-sub">單位：' + escAdmin(d.unit || '—') + ' · 區別：' + escAdmin(d.district || '—') + '</div></td>' +
        '<td class="mono">' + escAdmin(id) + '</td><td>' + fmtAdminDate(d.approvedAt) + '</td><td>' + teacherBadge(d) + '</td><td class="actions">' +
        (d.active
          ? '<button type="button" class="warn" data-admin-suspend="' + escAdmin(id) + '">暫停</button>'
          : '<button type="button" data-admin-restore="' + escAdmin(id) + '">恢復</button>') +
        '<button type="button" class="danger" data-admin-del-teacher="' + escAdmin(id) + '">刪除</button></td></tr>');
    });
    adminTeacherBody.innerHTML = rows.join('');
    adminTeacherEmpty.style.display = rows.length ? 'none' : '';
    adminTeacherCount.textContent = rows.length + ' 位';
  }
  function loadAdminLists() {
    db.collection('sanbao_accessRequests').orderBy('createdAt', 'desc').get().then(renderAdminRequests).catch(function (err) {
      adminReqBody.innerHTML = ''; adminReqEmpty.style.display = '';
      adminReqEmpty.textContent = '讀取申請失敗：' + (err.code || err.message);
    });
    db.collection('sanbao_approvedUsers').orderBy('approvedAt', 'desc').get().then(renderAdminTeachers).catch(function (err) {
      adminTeacherBody.innerHTML = ''; adminTeacherEmpty.style.display = '';
      adminTeacherEmpty.textContent = '讀取核准名單失敗：' + (err.code || err.message);
    });
  }

  /* ---------- 使用統計：後台讀取（比照 V4「使用統計」分頁） ----------
     延遲載入：第一次切到此分頁才查詢；今日／累積切換只在前端篩選，不再重查。
     學員姓名對照已核准名單（求道名），查不到才顯示登入時的 Google 名字。
     各節停留不做（2026-10-26 Cheng 選 (a)：只要登入次數＋時長）。 */
  var statsLoaded = false;
  var statsSessions = [];
  var statsMode = 'today';
  var statsApprovedNames = {};
  var statsModeToday = document.getElementById('statsModeToday');
  var statsModeAll = document.getElementById('statsModeAll');
  var statsDurationHead = document.getElementById('statsDurationHead');
  var statsOverviewBody = document.getElementById('statsOverviewBody');
  var statsOverviewEmpty = document.getElementById('statsOverviewEmpty');
  var statsDetail = document.getElementById('statsDetail');
  var statsDetailTitle = document.getElementById('statsDetailTitle');
  var statsDetailBody = document.getElementById('statsDetailBody');
  var statsDetailBack = document.getElementById('statsDetailBack');
  function statsLoginMillis(s) {
    if (!s || !s.loginAt) return 0;
    if (s.loginAt.toMillis) return s.loginAt.toMillis();
    var t = new Date(s.loginAt).getTime();
    return isNaN(t) ? 0 : t;
  }
  function statsIsToday(ms) {
    if (!ms) return false;
    var d = new Date(ms), now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  }
  function statsScopedSessions() {
    if (statsMode !== 'today') return statsSessions;
    return statsSessions.filter(function (s) { return statsIsToday(statsLoginMillis(s)); });
  }
  function statsFmtDuration(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h > 0) return h + '小時' + m + '分';
    if (m > 0) return m + '分' + (sec % 60) + '秒';
    return sec + '秒';
  }
  function statsDisplayName(s) {
    if (s && s.uid && statsApprovedNames[s.uid]) return statsApprovedNames[s.uid];
    return (s && s.displayName) || (s && s.email) || (s && s.uid) || '未具名';
  }
  function renderStatsOverview() {
    var byUid = {};
    statsScopedSessions().forEach(function (s) {
      var u = byUid[s.uid] || (byUid[s.uid] = { uid: s.uid, name: '', email: '', count: 0, totalSec: 0, lastLogin: 0 });
      u.count += 1;
      u.totalSec += (s.durationSec || 0);
      if (!u.name) u.name = statsDisplayName(s);
      if (!u.email && s.email) u.email = s.email;
      var lt = statsLoginMillis(s);
      if (lt > u.lastLogin) u.lastLogin = lt;
    });
    var list = Object.keys(byUid).map(function (k) { return byUid[k]; });
    list.sort(function (a, b) { return b.lastLogin - a.lastLogin; });
    if (statsOverviewBody) {
      statsOverviewBody.innerHTML = list.map(function (u) {
        return '<tr><td><span class="cell-main">' + escAdmin(u.name || '(未具名)') +
          '</span><div class="cell-sub">' + escAdmin(u.email) + '</div></td>' +
          '<td>' + u.count + '</td><td>' + statsFmtDuration(u.totalSec) + '</td>' +
          '<td>' + (u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-TW', { hour12: false }) : '—') + '</td>' +
          '<td class="actions"><button type="button" data-stats-detail="' + escAdmin(u.uid) + '">明細</button></td></tr>';
      }).join('');
    }
    if (statsDurationHead) statsDurationHead.textContent = statsMode === 'today' ? '今日時長' : '累計時長';
    if (statsOverviewEmpty) {
      statsOverviewEmpty.textContent = statsMode === 'today' ? '今日尚無使用記錄。' : '尚無使用記錄（學員登入後才會產生）。';
      statsOverviewEmpty.style.display = list.length ? 'none' : '';
    }
    if (statsDetail) statsDetail.hidden = true;
  }
  function renderStatsDetail(uid) {
    var rows = statsScopedSessions().filter(function (s) { return s.uid === uid; });
    var first = rows[0] || {};
    if (statsDetailTitle) statsDetailTitle.textContent = '登入明細（' + (statsMode === 'today' ? '今日' : '累積') + '）：' + statsDisplayName(first);
    if (statsDetailBody) {
      statsDetailBody.innerHTML = rows.map(function (s) {
        var logoutText = s.logoutAt ? fmtAdminDate(s.logoutAt) : (s.orphanClosed ? '異常結束（下次登入時結算）' : '使用中');
        return '<tr><td>' + escAdmin(fmtAdminDate(s.loginAt)) + '</td>' +
          '<td>' + escAdmin(logoutText) + '</td>' +
          '<td>' + statsFmtDuration(s.durationSec) + '</td>' +
          '<td>' + escAdmin(s.page || '首頁') + '</td></tr>';
      }).join('');
    }
    if (statsDetail) statsDetail.hidden = false;
  }
  function setStatsMode(mode) {
    statsMode = mode === 'all' ? 'all' : 'today';
    if (statsModeToday) statsModeToday.classList.toggle('active', statsMode === 'today');
    if (statsModeAll) statsModeAll.classList.toggle('active', statsMode === 'all');
    renderStatsOverview();
  }
  function loadUsageStats() {
    if (statsLoaded) return;
    statsLoaded = true;
    var jobs = [];
    jobs.push(db.collection('sanbao_analytics_sessions').orderBy('loginAt', 'desc').limit(500).get().then(function (snap) {
      statsSessions = [];
      snap.forEach(function (doc) { var d = doc.data() || {}; d._id = doc.id; statsSessions.push(d); });
    }));
    jobs.push(db.collection('sanbao_approvedUsers').get().then(function (snap) {
      snap.forEach(function (doc) { var d = doc.data() || {}; if (d.name) statsApprovedNames[doc.id] = d.name; });
    }).catch(function () {}));
    Promise.all(jobs).then(function () { renderStatsOverview(); }).catch(function (err) {
      adminToastShow('讀取使用統計失敗（可能是 Firestore 規則尚未更新）。', true);
    });
  }
  if (statsModeToday) statsModeToday.onclick = function () { setStatsMode('today'); };
  if (statsModeAll) statsModeAll.onclick = function () { setStatsMode('all'); };
  if (statsDetailBack) statsDetailBack.onclick = function () { if (statsDetail) statsDetail.hidden = true; };
  bindAdminAction(statsOverviewBody, 'data-stats-detail', function (uid) { renderStatsDetail(uid); return Promise.resolve(); });
  function showAdminTab(name) {
    adminTab = name;
    document.querySelectorAll('[data-admin-tab]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-admin-tab') === name);
    });
    document.getElementById('tabAdminRequests').hidden = name !== 'requests';
    document.getElementById('tabAdminTeachers').hidden = name !== 'teachers';
    var tabStats = document.getElementById('tabAdminStats');
    if (tabStats) tabStats.hidden = name !== 'stats';
  }
  function openAdminPanel() {
    if (!adminPanel) return;
    if (!isAdmin(currentUser)) {
      adminPanel.style.display = 'block';
      if (adminBlocked) adminBlocked.style.display = '';
      if (adminApp) adminApp.style.display = 'none';
      return;
    }
    if (adminBlocked) adminBlocked.style.display = 'none';
    if (adminApp) adminApp.style.display = '';
    adminPanel.style.display = 'block';
    document.body.style.overflow = 'hidden';
    showAdminTab(adminTab);
    loadAdminLists();
    if (adminTab === 'stats') loadUsageStats();
  }
  function closeAdminPanel() {
    if (adminPanel) adminPanel.style.display = 'none';
    document.body.style.overflow = '';
  }
  function adminApprove(id) {
    var reqRef = db.collection('sanbao_accessRequests').doc(id);
    return reqRef.get().then(function (snap) {
      if (!snap.exists) throw new Error('找不到這筆申請。');
      var d = snap.data() || {};
      if (d.status !== 'pending') throw new Error('這筆申請已經處理過了。');
      return db.collection('sanbao_approvedUsers').doc(id).get().then(function (t) {
        if (t.exists && (t.data() || {}).active === true) throw new Error('此人已經在核准名單中。');
        var now = window.firebase.firestore.FieldValue.serverTimestamp();
        return db.collection('sanbao_approvedUsers').doc(id).set({
          uid: d.uid || id, email: d.email || '', name: d.name || d.displayName || '',
          unit: d.unit || '', district: d.district || '',
          active: true, status: 'approved', approvedAt: now, updatedAt: now
        }).then(function () {
          return reqRef.update({ status: 'approved', updatedAt: now });
        });
      });
    }).then(function () { adminToastShow('已核准。'); loadAdminLists(); });
  }
  function adminReject(id) {
    var note = window.prompt('拒絕原因（可留空，會記在申請單上）：');
    if (note === null) return Promise.resolve();
    var update = { status: 'rejected', updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() };
    if (note.trim()) update.adminNote = note.trim();
    return db.collection('sanbao_accessRequests').doc(id).update(update).then(function () {
      return db.collection('sanbao_approvedUsers').doc(id).get();
    }).then(function (t) {
      if (t.exists) return db.collection('sanbao_approvedUsers').doc(id).update({ active: false, status: 'rejected', updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() });
    }).then(function () { adminToastShow('已拒絕申請。'); loadAdminLists(); });
  }
  function adminDeleteReq(id) {
    if (!window.confirm('確定刪除這筆申請？此動作無法復原。')) return Promise.resolve();
    return db.collection('sanbao_accessRequests').doc(id).delete().then(function () { adminToastShow('已刪除申請。'); loadAdminLists(); });
  }
  function adminSetTeacher(id, active) {
    return db.collection('sanbao_approvedUsers').doc(id).update({
      active: active, status: active ? 'approved' : 'suspended',
      updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () { adminToastShow(active ? '已恢復使用權。' : '已暫停使用權。'); loadAdminLists(); });
  }
  function adminDeleteTeacher(id) {
    if (!window.confirm('確定從核准名單刪除此人？對方將立即失去閱讀權限。此動作無法復原。')) return Promise.resolve();
    return db.collection('sanbao_approvedUsers').doc(id).delete().then(function () { adminToastShow('已刪除。'); loadAdminLists(); });
  }
  function adminApproveAll() {
    return db.collection('sanbao_accessRequests').where('status', '==', 'pending').get().then(function (snap) {
      var jobs = [];
      snap.forEach(function (doc) {
        var d = doc.data() || {};
        var now = window.firebase.firestore.FieldValue.serverTimestamp();
        jobs.push(db.collection('sanbao_approvedUsers').doc(doc.id).set({
          uid: d.uid || doc.id, email: d.email || '', name: d.name || d.displayName || '',
          unit: d.unit || '', district: d.district || '',
          active: true, status: 'approved', approvedAt: now, updatedAt: now
        }));
        jobs.push(db.collection('sanbao_accessRequests').doc(doc.id).update({ status: 'approved', updatedAt: now }));
      });
      return Promise.all(jobs);
    }).then(function () { adminToastShow('批次核准完成。'); loadAdminLists(); });
  }
  function bindAdminAction(el, attr, handler) {
    if (!el) return;
    el.addEventListener('click', function (ev) {
      var t = ev.target.closest('[' + attr + ']');
      if (!t) return;
      handler(t.getAttribute(attr)).catch(function (err) {
        adminToastShow('操作失敗：' + ((err && err.message) || '未知錯誤'), true);
      });
    });
  }
  bindAdminAction(adminReqBody, 'data-admin-approve', adminApprove);
  bindAdminAction(adminReqBody, 'data-admin-reject', adminReject);
  bindAdminAction(adminReqBody, 'data-admin-del-req', adminDeleteReq);
  bindAdminAction(adminTeacherBody, 'data-admin-suspend', function (id) { return adminSetTeacher(id, false); });
  bindAdminAction(adminTeacherBody, 'data-admin-restore', function (id) { return adminSetTeacher(id, true); });
  bindAdminAction(adminTeacherBody, 'data-admin-del-teacher', adminDeleteTeacher);
  document.querySelectorAll('[data-admin-tab]').forEach(function (b) {
    b.addEventListener('click', function () {
      var tabName = b.getAttribute('data-admin-tab');
      showAdminTab(tabName);
      if (tabName === 'stats') loadUsageStats();
    });
  });
  var adminApproveAllBtn = document.getElementById('sanbaoApproveAll');
  if (adminApproveAllBtn) adminApproveAllBtn.addEventListener('click', function () {
    adminApproveAll().catch(function (err) { adminToastShow('批次核准失敗：' + ((err && err.message) || '未知錯誤'), true); });
  });
  var adminCloseBtn = document.getElementById('sanbaoAdminClose');
  if (adminCloseBtn) adminCloseBtn.addEventListener('click', closeAdminPanel);
  signInBtn.onclick = function () {
    setMsg('正在開啟 Google 登入…');
    auth.signInWithPopup(provider).catch(function (err) {
      if (err.code === 'auth/popup-blocked') setMsg('彈出視窗被阻擋，請允許本網站的彈出視窗後再試一次。');
      else if (err.code === 'auth/popup-closed-by-user') setMsg('已關閉 Google 登入視窗。');
      else if (err.code === 'auth/unauthorized-domain') setMsg('此網域尚未在 Firebase 授權，請聯繫管理員（Firebase Console → Authentication → Authorized domains 加入 f216002.github.io）。');
      else setMsg('Google 登入失敗：' + (err.message || err.code));
    });
  };
  /* 申請表單（2026-10-26 Cheng 要求）：姓名／單位／區別三格皆必填，寫入申請單供後台審核。
     舊版頁面沒有表單時，維持原本直接送出的行為（姓名取 Google 名字）。 */
  function submitApplication() {
    var user = auth.currentUser;
    if (!user) return;
    var hasForm = !!(applyForm && applyName && applyUnit && applyDistrict);
    var name = hasForm ? applyName.value.trim() : (user.displayName || '');
    var unit = hasForm ? applyUnit.value.trim() : '';
    var district = hasForm ? applyDistrict.value.trim() : '';
    if (hasForm && (!name || !unit || !district)) {
      setMsg('請填寫姓名、單位、區別，三格都是必填。');
      if (!name && applyName) applyName.focus();
      else if (!unit && applyUnit) applyUnit.focus();
      else if (applyDistrict) applyDistrict.focus();
      return;
    }
    db.collection('sanbao_accessRequests').doc(user.uid).set({
      uid: user.uid, email: user.email || '', name: name, unit: unit, district: district,
      status: 'pending', createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      setMsg('申請已送出，請等管理員核准後重新整理頁面。');
      show(applyBtn, false); show(applyForm, false);
    }).catch(function (err) {
      if (err.code === 'permission-denied') {
        setMsg('送出失敗：你已經有一筆審核中的申請，請等管理員審核，或請管理員協助。');
      } else {
        setMsg('申請送出失敗：' + (err.code || err.message) + '（請先發布三寶規則）');
      }
    });
  }
  applyBtn.onclick = function () {
    var user = auth.currentUser;
    if (!user) return;
    if (applyForm && applyName) {
      show(applyBtn, false); show(applyForm, true);
      applyName.focus();
    } else {
      submitApplication();
    }
  };
  if (applyCancel) applyCancel.onclick = function () {
    show(applyForm, false); show(applyBtn, true);
  };
  if (applySubmit) applySubmit.onclick = submitApplication;
  function signOutNow() { analyticsEndSession(); auth.signOut(); }
  signOutBtn.onclick = signOutNow;
  /* 右上角常駐鍵：登入／登出／重新整理（2026-10-26 Cheng 要求）。
     登出後必須把門檻恢復原狀：藏起內文、重新顯示登入門檻、收回管理員身分，
     否則登出完還看得到內文，登出等於沒登出。 */
  var utilSignIn = document.getElementById('sanbaoUtilSignIn');
  var utilSignOut = document.getElementById('sanbaoUtilSignOut');
  var utilUser = document.getElementById('sanbaoUtilUser');
  var utilAdmin = document.getElementById('sanbaoUtilAdmin');
  if (utilSignIn) utilSignIn.onclick = function () { if (signInBtn) signInBtn.click(); };
  if (utilSignOut) utilSignOut.onclick = signOutNow;
  if (utilAdmin) utilAdmin.onclick = function () { openAdminPanel(); };
  function showUtil(signedIn) {
    show(utilSignIn, !signedIn); show(utilSignOut, signedIn);
  }
  /* 已登入帳號符號（2026-10-26 Cheng 要求）：門檻藏起來後，帳號資訊也要在右上角看得到。
     有 Google 大頭貼就顯示照片，沒有就顯示名字第一個字。 */
  function setUtilUser(user) {
    if (!utilUser) return;
    if (!user) { utilUser.style.display = 'none'; utilUser.innerHTML = ''; return; }
    var name = user.displayName || user.email || '';
    utilUser.title = user.email || '';
    if (user.photoURL) {
      utilUser.innerHTML = '';
      var img = document.createElement('img');
      img.src = user.photoURL; img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      utilUser.appendChild(img);
    } else {
      utilUser.textContent = (name.charAt(0) || '?');
    }
    utilUser.style.display = 'flex';
  }
  auth.onAuthStateChanged(function (user) {
    currentUser = user || null;
    if (!user) {
      document.body.classList.remove('sanbao-approved', 'sanbao-admin');
      window.SANBAO_IS_ADMIN = false;
      var g = document.getElementById('sanbaoGate');
      if (g) g.style.display = '';
      setMsg('本教材不公開，僅供核准學員閱讀。請先用 Google 帳號登入。');
      show(signInBtn, true); show(applyBtn, false); show(signOutBtn, false); show(applyForm, false);
      analyticsEndSession();
      show(utilAdmin, false); closeAdminPanel(); userBox.style.display = 'none';
      showUtil(false); setUtilUser(null);
      document.querySelectorAll('.expl-paste').forEach(function (el) { el.contentEditable = 'false'; });
      return;
    }
    showUtil(true); setUtilUser(user);
    /* 詳細解釋貼上區：只有管理員可貼，登入身分一變就同步切換。 */
    document.querySelectorAll('.expl-paste').forEach(function (el) { el.contentEditable = 'false'; });
    show(signInBtn, false); show(signOutBtn, true);
    userBox.style.display = '';
    userBox.textContent = '已登入：' + (user.displayName || '') + '（' + (user.email || '') + '）';
    if (isAdmin(user)) {
      document.body.classList.add('sanbao-admin');
      window.SANBAO_IS_ADMIN = true;
      document.querySelectorAll('.expl-paste').forEach(function (el) { el.contentEditable = 'true'; });
      show(utilAdmin, true);
      openGate();
    } else {
      show(utilAdmin, false);
      checkApproval(user);
    }
  });
})();
