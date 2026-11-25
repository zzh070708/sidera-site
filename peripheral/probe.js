/* ============================================================================
 * 星阑归序 · 手机外设客户端（生产）
 *
 * 手机在这条链路里只有两个身份：一只手柄（把朝向交出去）、一个传感器（把照片交出去）。
 * 它不做预测、不数星、不算 Bortle——那些只在电脑端的同一份内核里发生。
 * 方向也不在这里换算：只发原始 alpha/beta/gamma，由 core/pose.js 那一份换算，
 * 手机端和电脑端绝不允许长出第二套映射。
 *
 * 罗盘诚实性：alpha 的「北」在手机上是未校准的（安卓常见只有相对北，iOS 首次要授权）。
 * 所以本页不声称给出真北，偏置由电脑端的「校一次北」显式处理并显示出来。
 * ==========================================================================*/
(function () {
  'use strict';

  var q = new URLSearchParams(location.search);
  var ROOM = (q.get('r') || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 10);
  var ID = sessionStorage.getItem('sidera-peripheral-id') ||
           ('p-' + Math.random().toString(36).slice(2, 10));
  sessionStorage.setItem('sidera-peripheral-id', ID);

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    code: $('code'), hint: $('hint'), read: $('read'), sub: $('sub'), bubble: $('bubble'),
    btnPose: $('btnPose'), btnShot: $('btnShot'), chkStop: $('chkStop'),
    stat: $('stat'), cam: $('cam'), thumb: $('thumb'), foot: $('foot'), needle: $('needle')
  };
  el.code.textContent = ROOM || '——';

  var live = false, paused = false, sensor = 'none', manual = null, orientBound = false, dragBound = false;
  var last = { alpha: null, beta: null, gamma: null };
  var sent = 0, bad = 0, ticks = 0, reconnect = 0, since = 0, joined = false, mode = 'unknown';

  /* ---------- 来源诚实性：外设服务不在就说不在 ---------- */
  function probeRelay() {
    return fetch('/health', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (h) { mode = (h && h.ok && h.companion === 'sidera-peripheral-1') ? 'live' : 'offline'; })
      .catch(function () { mode = 'offline'; })
      .then(function () {
        el.foot.textContent = mode === 'live'
          ? '本页来源：' + (location.protocol === 'https:' || /^https?:\/\/(127\.0\.0\.1|localhost)(:|$)/.test(location.origin)
              ? '安全上下文，陀螺仪与摄像头可用' : '非安全上下文，浏览器不会交出陀螺仪——请用 https 地址重开') +
            '。房间码要和电脑端一致。照片只在同一房间内流转，外设服务不写盘、不执行上传内容。'
          : '这里没有本机外设服务（线上静态站就是这种情况）。在电脑的项目目录里跑一次 ' +
            'py -3 _deploy/companion.py --https --lan，再用手机打开它打印的 https 地址。' +
            ' 本页来源：' + location.origin;
      });
  }

  function post(body) {
    sent++;
    return fetch('/up/' + ROOM, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { if (!r.ok) bad++; return r.json(); })
      .catch(function () { bad++; return {}; });
  }

  function poseMsg() {
    if (manual) {
      /* 拖动模式也必须经 pose.js 反算，绝不在手机里自己编一套映射 */
      if (!window.__POSE__) return null;
      var m = __POSE__.fromAzAlt(manual.az, manual.alt);
      return { alpha: m.alpha, beta: m.beta, gamma: m.gamma };
    }
    if (last.alpha === null) return null;
    return { alpha: last.alpha, beta: last.beta, gamma: last.gamma };
  }

  function tick() {
    if (!live || paused) return;
    ticks++;
    var p = poseMsg();
    if (!p) return;
    el.read.textContent = '方位 ' + p.alpha.toFixed(1) + '° / 俯仰 ' + p.beta.toFixed(1) +
      '° / 侧转 ' + p.gamma.toFixed(1) + '°（原始读数，换算在电脑端）';
    el.needle.style.transform = 'rotate(' + (-p.alpha) + 'deg)';
    post({ type: 'pose', id: ID, data: p });
  }

  /* ---------- ① 举起手机 ---------- */
  el.btnPose.addEventListener('click', function () {
    var DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      DOE.requestPermission().then(function (st) { start(st === 'granted', st); })
        .catch(function (e) { start(false, '拒绝：' + e.message); });
    } else {
      start(!!DOE, DOE ? '浏览器直接开放' : '没有该接口，改用拖动屏幕');
    }
  });
  function start(ok, why) {
    sensor = ok ? '已授权' : '不可用（' + why + '）';
    live = true;
    el.hint.textContent = ok ? '手机正在把朝向交给电脑' : '陀螺仪不可用，已改为拖动屏幕';
    el.btnPose.textContent = ok ? '① 正在交方向（点一下停）' : '① 拖动屏幕代替陀螺仪';
    el.stat.textContent = '陀螺仪 ' + sensor;
    if (ok && !orientBound) { orientBound = true; addEventListener('deviceorientation', onOrient, true); }
    if (!dragBound) { dragBound = true; enableDrag(); }
    setInterval(tick, 125);
    probeRelay().then(function () {
      post({ type: 'hello', id: ID, data: { os: navigator.platform || '?', secure: !!window.isSecureContext,
                                            sensor: sensor, ua: navigator.userAgent.slice(0, 40) } });
    });
  }
  el.btnPose.addEventListener('dblclick', function () { live = false; });
  function onOrient(e) {
    if (e.alpha === null && e.beta === null) return;
    sensor = '真实读数';
    last.alpha = +e.alpha || 0; last.beta = +e.beta || 0; last.gamma = +e.gamma || 0;
  }
  function enableDrag() {
    var t = null;
    addEventListener('pointerdown', function (e) {
      t = { x: e.clientX, y: e.clientY, az: manual ? manual.az : 180, alt: manual ? manual.alt : 45 };
    });
    addEventListener('pointermove', function (e) {
      if (!t) return;
      manual = { az: (t.az - (e.clientX - t.x) * 0.35 + 720) % 360,
                 alt: Math.max(-5, Math.min(89, t.alt + (t.y - e.clientY) * 0.35)) };
      el.read.textContent = '手动拖动 · 方位 ' + manual.az.toFixed(1) + '° 高度 ' + manual.alt.toFixed(1) + '°';
    });
    addEventListener('pointerup', function () { t = null; });
  }

  el.chkStop.addEventListener('change', function () { paused = this.checked; el.stat.textContent = paused ? '已暂停发送' : '继续发送'; });

  /* 摇一摇：只报事件，不碰预测输入（要换光害得在电脑端显式打开那个开关） */
  var shakeAt = 0;
  addEventListener('devicemotion', function (e) {
    var a = e.accelerationIncludingGravity;
    if (!a) return;
    var m = Math.abs(a.x || 0) + Math.abs(a.y || 0) + Math.abs(a.z || 0);
    var now = Date.now();
    if (m > 26 && now - shakeAt > 900) {
      shakeAt = now; post({ type: 'event', id: ID, data: { name: 'shake' } });
      if (navigator.vibrate) navigator.vibrate(30);
    }
  });

  /* ---------- ② 拍一张 ---------- */
  el.btnShot.addEventListener('click', function () {
    if (mode !== 'live') { el.bubble.textContent = '没连上本机外设服务，照片没处发'; return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      el.bubble.textContent = '这个环境不给摄像头（需要 https 或 localhost）'; return;
    }
    el.bubble.textContent = '正在取景…';
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
    }).catch(function () { return navigator.mediaDevices.getUserMedia({ video: true, audio: false }); })
      .then(function (stream) {
        el.cam.srcObject = stream;
        return new Promise(function (res) {
          var tries = 0, iv = setInterval(function () { if (el.cam.videoWidth > 8 || ++tries > 60) { clearInterval(iv); res(el.cam); } }, 50);
        }).then(function (v) { return [v, stream]; });
      })
      .then(function (pair) {
        var v = pair[0], stream = pair[1];
        if (!v.videoWidth) { el.bubble.textContent = '摄像头没给出画面'; stream.getTracks().forEach(function (t) { t.stop(); }); return; }
        var W = 640, H = Math.round(W * v.videoHeight / v.videoWidth) || 360;
        var c = document.createElement('canvas'); c.width = W; c.height = H;
        c.getContext('2d').drawImage(v, 0, 0, W, H);
        var jpeg = c.toDataURL('image/jpeg', 0.74);
        var body = { type: 'photo', id: ID, data: { jpeg: jpeg, w: W, h: H, ts: Date.now(), fov: 60 } };
        var p = poseMsg();
        if (p) { body.data.alpha = p.alpha; body.data.beta = p.beta; body.data.gamma = p.gamma; }
        post(body).then(function (r) {
          el.bubble.textContent = r.ok ? '已送出，等电脑那边处理' : '发送失败：' + (r.error || '?');
          el.thumb.textContent = '';
          var img = document.createElement('img'); img.alt = '刚拍的这一张'; img.src = jpeg; el.thumb.appendChild(img);
        });
        stream.getTracks().forEach(function (t) { t.stop(); });
      })
      .catch(function (e) { el.bubble.textContent = '摄像头被拒或不可用：' + e.name; });
  });

  /* ---------- 电脑回话 ---------- */
  function listen() {
    if (!ROOM) { el.bubble.textContent = '缺 ?r=房间码'; return; }
    if (mode !== 'live') { setTimeout(listen, 2000); return; }
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, 32000);
    var url = '/poll/down/' + ROOM + (joined ? '?since=' + since : '?join=1');
    fetch(url, { signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (res) {
        clearTimeout(to);
        (res.msgs || []).forEach(function (m) {
          if (m.type === 'verdict') say(m.data);
          else if (m.type === 'command' && m.data && m.data.name === 'shoot') el.btnShot.click();
        });
        if (typeof res.head === 'number') since = Math.max(since, res.head);
        joined = true; reconnect = 0;
        setTimeout(listen, 300);
      })
      .catch(function () {
        clearTimeout(to);
        reconnect = Math.min(8000, (reconnect || 500) * 2);
        el.stat.textContent = '外设服务没响应，重连中…';
        setTimeout(listen, reconnect);
      });
  }
  function say(d) {
    if (!d) return;
    if (d.kind === 'card') {
      el.bubble.textContent = '电脑刚把今晚的预测卡发过来：面向 ' + Math.round(d.az) + '° / 仰角 ' +
        Math.round(d.alt) + '°，一拳宽窗口里裸眼估算 ' + d.count + ' 颗（±' + (d.tol == null ? 2 : d.tol) +
        ' 颗算吻合）。出门数一遍，能推翻它。';
    } else {
      el.bubble.textContent = '判读：' + (d.ok ? '吻合' : '偏差') +
        ' 预测 ' + (d.pred == null ? '—' : d.pred) + ' / 实测 ' + (d.det == null ? '—' : d.det);
    }
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
  }

  /* 给真机与验证脚本共用的只读出口 */
  window.__PROBE__ = {
    stats: function () {
      return { live: live, paused: paused, ticks: ticks, sent: sent, bad: bad, sensor: sensor,
               mode: mode, since: since, reconnect: reconnect, id: ID, room: ROOM };
    },
    /* 无头验收用：注入一次读数，走的仍是与真手机相同的 post 路径 */
    __inject: function (alpha, beta, gamma) { last.alpha = alpha; last.beta = beta; last.gamma = gamma; live = true; tick(); return last; }
  };

  probeRelay().then(listen);
})();
