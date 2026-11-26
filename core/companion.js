/* ============================================================================
 * 星阑归序 · 手机外设连接层（生产）
 *
 * 这一层存在的唯一理由：手机不是「另一个页面」，而是本机这片天空的一个传感器与
 * 一只手柄。所以它必须满足三条，缺一就宁可不做：
 *   ① 共用内核——手机只发原始 alpha/beta/gamma，方向一律由 core/pose.js 换算，
 *      画面一律由 GROUND.setYaw/setPitch 落位；这里不许出现第二套换算或第二套星数。
 *   ② 不污染可证伪预测——手机照片与光感只当体验层显示，永不写进 Bortle、
 *      预测卡或判定；要改预测输入必须走界面上那几个显式开关。
 *   ③ 诚实的连接状态——连不上就明说连不上。线上静态站（GitHub Pages）没有本机
 *      外设服务，这里必须显示「未连接」并给出启动方法，绝不伪造读数。
 *
 * 传输：只连同源（CSP connect-src 'self' 不变）。本机外设服务 (_deploy/companion.py)
 * 起在 127.0.0.1:8799 或内网 IP:8799，生产页由它同源服务，于是手机与电脑吃的是
 * 同一份 URL、同一份内核、同一个房间码。
 * ==========================================================================*/
(function () {
  'use strict';

  var ROOM_RE = /^[A-Za-z0-9]{4,10}$/;
  var POLL_MS = 25000;          // 服务端长轮询窗口，客户端再多给 6 秒余量
  var BACKOFF_MAX = 8000;

  var st = {
    mode: 'unknown',            // unknown | live | offline
    room: '',
    phoneUrl: '',
    lan: false,                 // 服务端是否对局域网开放（决定这张码手机扫不扫得开）
    qrShown: null,              // 已经画进 img 的那条地址，避免每秒重取图
    qrErr: false,
    phones: 0,
    hello: null,
    pose: null,                 // {az, alt, alpha, beta, gamma, at}
    poseCount: 0,
    photo: null,                // {at, w, h, hasImage}
    photoCount: 0,
    events: [],
    aim: true,                  // 手机朝向驱动画面：连上后默认生效（这是外设的本行）
    shakeBortle: false,         // 摇一摇换光害会动预测输入，默认关
    errs: 0,
    lastErr: null,
    since: 0,
    joined: false,
    running: false,
    cardSentAt: null
  };

  var els = {};
  function $(id) { return document.getElementById(id); }
  function bind() {
    ['compStat', 'compRoom', 'compPhoneUrl', 'compPose', 'compPhoto', 'compPhotoNote',
     'compAim', 'compShake', 'compShoot', 'compCard', 'compStop', 'compGuide',
     'compDevice', 'compEvents', 'compQrBox', 'compQr', 'compQrNote'].forEach(function (k) { els[k] = $(k); });
  }

  function txt(id, s) { if (els[id]) els[id].textContent = s; }

  /* ---------- ① 本机外设服务在不在 ---------- */
  function probe() {
    return fetch('/health', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (h) {
        if (h && h.ok && h.companion === 'sidera-peripheral-1') {
          st.mode = 'live';
          st.room = (new URLSearchParams(location.search).get('r') || h.room || '').replace(/[^A-Za-z0-9]/g, '');
          /* 手机端地址只认服务端算出来的那一条。自己拿 location.origin 拼过一次会出事：
             本页从 127.0.0.1 打开（电脑端就该走回环，免掉证书警告），
             拼出来的地址手机根本连不上，而屏幕上看着像真的。 */
          st.phoneUrl = h.shortUrl || (location.origin + '/peripheral/probe.html?r=' + st.room);
          st.lan = !!h.lan;
          st.phones = h.phones || 0;
        } else {
          st.mode = 'offline';
        }
      })
      .catch(function () { st.mode = 'offline'; });
  }

  /* ---------- ② 上行：姿态 / 照片 / 事件 ---------- */
  function applyPose(m) {
    var d = m.data || {};
    if (!window.__POSE__) { st.lastErr = 'core/pose.js 未加载，拒绝自行换算'; return; }
    if (typeof d.alpha !== 'number' || typeof d.beta !== 'number') return;
    var v = __POSE__.toView(d.alpha, d.beta, d.gamma || 0, d.azOff || 0);
    st.pose = { az: v.az, alt: v.alt, alpha: d.alpha, beta: d.beta, gamma: d.gamma || 0,
                e: v.e, n: v.n, u: v.u, at: m.t || Date.now() / 1000 };
    st.poseCount++;
    if (st.aim && window.GROUND && GX.mode() === 'ground') {
      GROUND.setYaw(v.az);
      GROUND.setPitch(v.alt);
    }
  }

  function applyPhoto(m) {
    var d = m.data || {};
    st.photo = { at: m.t || Date.now() / 1000, w: d.w || 0, h: d.h || 0, jpeg: d.jpeg || null };
    st.photoCount++;
    if (els.compPhoto && st.photo.jpeg) {
      /* 只用 dataURL 赋 src，不拼 HTML：CSP img-src 已允许 data:，
         而且这张图只停在内存与这一页里，中继不写盘。 */
      els.compPhoto.src = st.photo.jpeg;
      els.compPhoto.style.display = 'block';
    }
  }

  function applyMsg(m) {
    if (!m || !m.type) return;
    if (m.type === 'pose') applyPose(m);
    else if (m.type === 'photo') applyPhoto(m);
    else if (m.type === 'hello') st.hello = m.data || {};
    else if (m.type === 'event') {
      var name = (m.data && m.data.name) || '?';
      st.events.push({ name: name, at: m.t || Date.now() / 1000 });
      if (st.events.length > 12) st.events.shift();
      if (name === 'shake' && st.shakeBortle) {
        var b = GX.getBortle(), next = b > 1 ? b - 1 : 9;
        /* 走真实滑杆的那一条 input 路径，不在这里另开一条写 Bortle 的旁路：
           旁路会让滑杆、面板读数和内核三方各说一套。 */
        var el = $('bortle');
        if (el) { el.value = String(next); el.dispatchEvent(new Event('input', { bubbles: true })); }
        else GX.setBortle(next);
      }
    }
  }

  function listen() {
    if (!st.running || !ROOM_RE.test(st.room)) return;
    var ctl = new AbortController();
    var to = setTimeout(function () { ctl.abort(); }, POLL_MS + 6000);
    var url = '/poll/up/' + st.room + (st.joined ? '?since=' + st.since : '?join=1');
    fetch(url, { signal: ctl.signal })
      .then(function (r) {
        clearTimeout(to);
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (res) {
        (res.msgs || []).forEach(applyMsg);
        /* 游标认中继在同一把锁里给的 head：分批读会漏掉中间挤进来的那条 */
        if (typeof res.head === 'number') st.since = Math.max(st.since, res.head);
        st.joined = true;
        st.backoff = 500;
        render();
        listen();
      })
      .catch(function (e) {
        clearTimeout(to);
        st.errs++;
        st.lastErr = String(e && e.message || e);
        st.backoff = Math.min(BACKOFF_MAX, (st.backoff || 500) * 2);
        setTimeout(listen, st.backoff);
      });
  }

  /* ---------- ③ 下行：指令与预测卡 ---------- */
  function sendDown(type, data) {
    if (!ROOM_RE.test(st.room)) return Promise.resolve({ ok: false, error: 'bad_room' });
    return fetch('/send/down/' + st.room, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, data: data || {} })
    }).then(function (r) { return r.json(); }).catch(function (e) {
      st.errs++; st.lastErr = String(e && e.message || e); return { ok: false };
    });
  }

  function sendCard() {
    /* 卡片内容直接取自被锁定的预测快照（GX.verifyState），
       这里不重算星数、不改条件——手机只是把同一张卡念一遍。 */
    var p = GX.verifyState && GX.verifyState().prediction;
    if (!p) return Promise.resolve({ ok: false, error: 'no_card' });
    st.cardSentAt = Date.now() / 1000;
    return sendDown('verdict', {
      kind: 'card', predictionId: p.predictionId, count: p.count, tol: p.tol,
      az: p.az, alt: p.alt, name: p.name, bortle: p.bortle, limit: p.limit,
      predictedAt: p.predictedAt, nightKey: p.nightKey, place: p.place || p.city
    });
  }

  /* ---------- ④ 面板渲染（只写 textContent） ---------- */
  function ago(t) {
    if (!t) return '—';
    var s = Math.max(0, Math.round(Date.now() / 1000 - t));
    return s < 60 ? s + ' 秒前' : Math.round(s / 60) + ' 分钟前';
  }

  /* ---------- ④b 二维码就画在这一页里 ----------
     用户只要三步：双击启动 → 打开这一页 → 手机相机对着屏幕扫。中间不许再多一环
     （不必去别的页面找码、不必抄地址、不必输房间码）。
     三条「宁可不画」：没连上、服务只监听本机（画出来手机必打不开的死码）、地址还没算出来。
     码本身由中继现画（/qr.svg?target=phone，只认服务端自己算出的入口，不接受外部文本），
     页面既不拼地址也不带内容，免得出现「屏幕上是一张、扫进去是另一张」。 */
  function paintQr() {
    // 三个节点少任何一个都只是这一格不出，绝不能把整块面板的渲染搞挂。
    if (!els.compQrBox || !els.compQr || !els.compQrNote) return;
    if (st.mode !== 'live') {
      els.compQrBox.style.display = 'none';
      els.compQr.style.display = 'none';
      els.compQr.removeAttribute('src');
      st.qrShown = null;
      return;
    }
    els.compQrBox.style.display = 'block';
    if (!st.lan || !st.phoneUrl) {
      els.compQr.style.display = 'none';
      els.compQr.removeAttribute('src');
      st.qrShown = null;
      els.compQrNote.textContent = st.lan
        ? '服务在跑，但还没算出对手机开放的地址（多半是刚启动的那一瞬），稍等一下这里自己会变成码。'
        : '现在画不出码：这个服务只监听本机（没加 --lan），这种码手机扫了必然打不开，所以不画。' +
          '请双击项目根目录的「启动手机外设.bat」（它带 --https --lan），回到这一页这里就是码。';
      return;
    }
    els.compQrNote.textContent = '手机连和电脑「同一个 Wi-Fi」，直接用相机对着下面这个码扫——' +
      '扫完就进，不用抄地址、不用输房间码。第一次会弹一句「连接不是私人连接」，点一次「继续访问」，以后不再问。';
    if (st.qrShown !== st.phoneUrl) {
      st.qrShown = st.phoneUrl;
      st.qrErr = false;
      els.compQr.src = '/qr.svg?target=phone';
    }
    els.compQr.style.display = 'block';
  }

  function render() {
    if (!els.compStat) return;
    if (st.mode === 'live') {
      var agoTxt = st.pose ? '读数来自 ' + ago(st.pose.at) : '还没收到读数';
      els.compStat.textContent = st.pose
        ? '已连上本机外设服务 · 房间 ' + st.room + ' · ' + agoTxt
        : '已连上本机外设服务 · 房间 ' + st.room + ' · 等手机举起来';
      els.compStat.className = 'p-sub ok';
      txt('compRoom', st.room);
      txt('compPhoneUrl', st.phoneUrl);
      txt('compPose', st.pose
        ? '方位 ' + st.pose.az.toFixed(1) + '° / 高度 ' + st.pose.alt.toFixed(1) +
          '°（原始 alpha ' + st.pose.alpha.toFixed(0) + '° beta ' + st.pose.beta.toFixed(0) +
          '° gamma ' + st.pose.gamma.toFixed(0) + '°）· 共 ' + st.poseCount + ' 条'
        : '尚无读数');
      txt('compDevice', st.hello
        ? '手机：' + (st.hello.os || '?') + ' · 安全上下文 ' + (st.hello.secure ? '是' : '否') +
          ' · 陀螺仪 ' + (st.hello.sensor || '?')
        : '手机还没打过招呼');
      txt('compPhotoNote', st.photo
        ? '最近一张：' + ago(st.photo.at) + ' · ' + st.photo.w + '×' + st.photo.h +
          ' · 共 ' + st.photoCount + ' 张。只作体验层显示，不进入 Bortle、预测卡或判定。'
        : '还没收到照片。照片不参与任何预测或判定。');
      txt('compEvents', st.events.length
        ? st.events.map(function (e) { return e.name + ' ' + ago(e.at); }).join(' · ')
        : '—');
      els.compGuide.style.display = 'none';
    } else if (st.mode === 'offline') {
      els.compStat.textContent = '未连接：这个地址上没有本机外设服务';
      els.compStat.className = 'p-sub bad';
      txt('compRoom', '—');
      txt('compPhoneUrl', '—');
      txt('compPose', '无读数（不伪造）');
      txt('compDevice', '—');
      txt('compPhotoNote', '无照片');
      txt('compEvents', '—');
      if (els.compPhoto) { els.compPhoto.style.display = 'none'; els.compPhoto.removeAttribute('src'); }
      els.compGuide.style.display = 'block';
    } else {
      els.compStat.textContent = '正在探测本机外设服务…';
      els.compStat.className = 'p-sub';
    }
    if (els.compAim) els.compAim.checked = st.aim;
    if (els.compShake) els.compShake.checked = st.shakeBortle;
    paintQr();
  }

  /* ---------- ⑤ 对外 API ---------- */
  var COMPANION = {
    start: function () {
      bind();
      return probe().then(function () {
        if (st.mode === 'live') { st.running = true; listen(); }
        render();
        return st.mode;
      });
    },
    stop: function () {
      st.running = false;
      st.mode = 'offline';
      st.pose = null; st.photo = null; st.hello = null; st.since = 0; st.joined = false;
      st.lan = false; st.qrShown = null;
      render();
    },
    setAim: function (on) { st.aim = !!on; render(); return st.aim; },
    setShakeBortle: function (on) { st.shakeBortle = !!on; render(); return st.shakeBortle; },
    askShoot: function () { return sendDown('command', { name: 'shoot' }); },
    sendCard: sendCard,
    state: function () {
      return {
        mode: st.mode, room: st.room, phoneUrl: st.phoneUrl, phones: st.phones,
        lan: st.lan, qrShown: st.qrShown, qrErr: st.qrErr,
        pose: st.pose, poseCount: st.poseCount, photoCount: st.photoCount,
        photoAt: st.photo ? st.photo.at : null, aim: st.aim, shakeBortle: st.shakeBortle,
        hello: st.hello, events: st.events.slice(), errs: st.errs, lastErr: st.lastErr,
        since: st.since, joined: st.joined, running: st.running, cardSentAt: st.cardSentAt
      };
    },
    /* 给验证脚本注入一条姿态，走与真手机完全相同的代码路径 */
    __feed: function (msg) { applyMsg(msg); render(); return st.pose; },
    __probe: probe
  };

  bind();

  if (els.compAim) els.compAim.addEventListener('change', function () { COMPANION.setAim(this.checked); });
  if (els.compShake) els.compShake.addEventListener('change', function () { COMPANION.setShakeBortle(this.checked); });
  if ($('compShootBtn')) $('compShootBtn').addEventListener('click', function () { COMPANION.askShoot(); });
  if ($('compCardBtn')) $('compCardBtn').addEventListener('click', function () { COMPANION.sendCard(); });
  if ($('compStopBtn')) $('compStopBtn').addEventListener('click', function () { COMPANION.stop(); });
  /* 码画不出来（二维码组件缺失、端点回 503）时这一格改口说实话，
     不许留一个破图框让用户怀疑是自己操作错了。 */
  if (els.compQr) els.compQr.addEventListener('error', function () {
    st.qrErr = true;
    els.compQr.style.display = 'none';
    if (els.compQrNote) els.compQrNote.textContent =
      '服务在跑，但这张码没能画出来（这台电脑上的二维码组件不可用，服务本体不受影响）。' +
      '要现在连手机就手打这一条：' + (st.phoneUrl || '—');
  });

  window.COMPANION = COMPANION;

  /* 自动起链：探测 → 长轮询。面板每秒只刷时间差，不重算任何东西。 */
  COMPANION.start();
  setInterval(function () { if (els.compStat) render(); }, 1000);
})();
