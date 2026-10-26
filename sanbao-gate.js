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
  var msg = document.getElementById('sanbaoGateMsg');
  var userBox = document.getElementById('sanbaoGateUser');
  var signInBtn = document.getElementById('sanbaoSignIn');
  var applyBtn = document.getElementById('sanbaoApply');
  var signOutBtn = document.getElementById('sanbaoSignOut');
  var adminBox = document.getElementById('sanbaoAdmin');
  var reqList = document.getElementById('sanbaoReqList');
  function setMsg(t) { if (msg) msg.textContent = t; }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function openGate() {
    document.body.classList.add('sanbao-approved');
    var g = document.getElementById('sanbaoGate');
    if (g) g.style.display = 'none';
  }
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
  function loadRequests() {
    db.collection('sanbao_accessRequests').where('status', '==', 'pending').get().then(function (snap) {
      if (snap.empty) { reqList.innerHTML = '<p>目前沒有待審核申請。</p>'; return; }
      reqList.innerHTML = '';
      snap.forEach(function (doc) {
        var d = doc.data();
        var row = document.createElement('div');
        row.style.margin = '8px 0';
        row.textContent = (d.name || '') + '（' + (d.email || '') + '）';
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = '核准';
        b.style.cssText = 'cursor:pointer;margin-left:10px;border-radius:8px;border:1px solid #d8cdb4;background:#fff;padding:4px 14px;font:inherit';
        b.onclick = function () { approveOne(doc.id, d); };
        row.appendChild(b);
        reqList.appendChild(row);
      });
    }).catch(function (err) {
      reqList.innerHTML = '<p>讀取申請失敗：' + (err.code || err.message) + '（請先發布三寶規則）</p>';
    });
  }
  function approveOne(uid, d) {
    db.collection('sanbao_approvedUsers').doc(uid).set({
      uid: uid, email: d.email || '', name: d.name || '',
      active: true, approvedAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      return db.collection('sanbao_accessRequests').doc(uid).update({ status: 'approved' });
    }).then(loadRequests).catch(function (err) {
      alert('核准失敗：' + (err.code || err.message));
    });
  }
  document.getElementById('sanbaoApproveAll').onclick = function () {
    db.collection('sanbao_accessRequests').where('status', '==', 'pending').get().then(function (snap) {
      var jobs = [];
      snap.forEach(function (doc) {
        var d = doc.data();
        jobs.push(db.collection('sanbao_approvedUsers').doc(doc.id).set({
          uid: doc.id, email: d.email || '', name: d.name || '',
          active: true, approvedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        }));
        jobs.push(db.collection('sanbao_accessRequests').doc(doc.id).update({ status: 'approved' }));
      });
      return Promise.all(jobs);
    }).then(loadRequests).catch(function (err) {
      alert('批次核准失敗：' + (err.code || err.message));
    });
  };
  signInBtn.onclick = function () {
    setMsg('正在開啟 Google 登入…');
    auth.signInWithPopup(provider).catch(function (err) {
      if (err.code === 'auth/popup-blocked') setMsg('彈出視窗被阻擋，請允許本網站的彈出視窗後再試一次。');
      else if (err.code === 'auth/popup-closed-by-user') setMsg('已關閉 Google 登入視窗。');
      else if (err.code === 'auth/unauthorized-domain') setMsg('此網域尚未在 Firebase 授權，請聯繫管理員（Firebase Console → Authentication → Authorized domains 加入 f216002.github.io）。');
      else setMsg('Google 登入失敗：' + (err.message || err.code));
    });
  };
  applyBtn.onclick = function () {
    var user = auth.currentUser;
    if (!user) return;
    db.collection('sanbao_accessRequests').doc(user.uid).set({
      uid: user.uid, email: user.email || '', name: user.displayName || '',
      status: 'pending', createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () {
      setMsg('申請已送出，請等管理員核准後重新整理頁面。');
      show(applyBtn, false);
    }).catch(function (err) {
      setMsg('申請送出失敗：' + (err.code || err.message) + '（請先發布三寶規則）');
    });
  };
  signOutBtn.onclick = function () { auth.signOut(); };
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      setMsg('本教材不公開，僅供核准學員閱讀。請先用 Google 帳號登入。');
      show(signInBtn, true); show(applyBtn, false); show(signOutBtn, false);
      show(adminBox, false); userBox.style.display = 'none';
      return;
    }
    show(signInBtn, false); show(signOutBtn, true);
    userBox.style.display = '';
    userBox.textContent = '已登入：' + (user.displayName || '') + '（' + (user.email || '') + '）';
    if (isAdmin(user)) {
      show(adminBox, true);
      loadRequests();
      openGate();
    } else {
      show(adminBox, false);
      checkApproval(user);
    }
  });
})();
