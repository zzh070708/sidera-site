/* ============================================================================
 * 星阑归序 · core/gesture.js
 * 摄像头手势（MediaPipe HandLandmarker，本地 WASM 推理）
 * 安全约定：
 *   - 摄像头画面只在本页内存里处理，不上传、不录制、不落盘
 *   - 模型与 WASM 全部走本项目的 vendor/，运行时不连任何第三方域名
 *   - 退出即 stop 全部 track；页面隐藏时自动停
 *   - 任何一步失败都返回 false，鼠标/触摸永远可用
 * ==========================================================================*/
(function () {
  'use strict';

  var state = {
    on: false, loading: false, lm: null, stream: null, raf: 0, lastT: 0,
    loadEpoch: 0, loadWatch: 0, loadStage: '', loadAt: 0,
    lastVideoTime: -1, pinch: false, palm: null,
    pinchS: 0, pinchMode: 'ground', zoomT: 0,
    slideX: null, slideY: null,
    curMX: null, curMY: null,
    dwellT: 0, dwellX: 0, dwellY: 0, coolUntil: 0, errs: 0, lastAct: 0,
    dwellUI: null, hoverUI: null, scrollY: null, splitDrag: false, rangeEl: null, flightNoted: false,
    rearmUI: null, rearmX: 0, rearmY: 0, rearmNoted: false,
    loopTicks: 0, detects: 0, lastDetectAt: 0, maxDetectMs: 0, lastErr: null
  };
  var video = null, dot = null, ring = null, ringCircle = null, hud = null, statusEl = null;
  var api = { onStop: null, onStatus: null };

  function supported() {
    var web = location.protocol === 'http:' || location.protocol === 'https:';
    return !!(web && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.GROUND);
  }
  function note(msg) {
    state.status = msg;
    if (statusEl) statusEl.textContent = msg;
    if (api.onStatus) api.onStatus(msg);
  }
  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  function palmScale(l) { return Math.max(0.04, dist(l[0], l[9])); }
  function openPalm(l) {
    /* 四指指尖都比各自 PIP 更远离手腕 —— 才认作张掌 */
    var w = l[0], n = 0;
    [[8, 6], [12, 10], [16, 14], [20, 18]].forEach(function (p) {
      if (dist(l[p[0]], w) > dist(l[p[1]], w) * 1.12) n++;
    });
    return n >= 3;
  }
  function pointing(l) {
    var w = l[0];
    var idx = dist(l[8], w) > dist(l[6], w) * 1.12;
    var mid = dist(l[12], w) > dist(l[10], w) * 1.08;
    var ring = dist(l[16], w) > dist(l[14], w) * 1.08;
    return idx && !mid && !ring;
  }
  /* 食指+中指伸直并拢、无名指+小指收起 = 滚页手势。
     张掌要求 >=3 指伸、单指指住要求中指收起，都与本姿势互斥，不会抢现有手势。 */
  function twoFinger(l) {
    var w = l[0];
    var idx = dist(l[8], w) > dist(l[6], w) * 1.12;
    var mid = dist(l[12], w) > dist(l[10], w) * 1.10;
    var ring = dist(l[16], w) > dist(l[14], w) * 1.08;
    var pinky = dist(l[20], w) > dist(l[18], w) * 1.08;
    var together = dist(l[8], l[12]) / palmScale(l) < 0.55;
    return idx && mid && !ring && !pinky && together;
  }
  function mode() { return (window.GX && window.GX.mode) ? window.GX.mode() : 'ground'; }

  function center(l) {
    var x = 0, y = 0, k = [0, 5, 9, 13, 17];
    k.forEach(function (i) { x += l[i].x; y += l[i].y; });
    return { x: x / 5, y: y / 5 };
  }

  /* 指针增益：指尖若 1:1 铺满全屏，够到屏幕四边就得把手移到摄像头视野边缘，
     手一旦出框跟踪就断。改为把手部中央一段区域放大映射到全屏：
     手留在画面中央约一半范围内即可扫到四边，边缘不再脱框。 */
  var POINT_GAIN = 1.9;
  function pointMap(mx, my) {
    var nx = 0.5 + (mx - 0.5) * POINT_GAIN;
    var ny = 0.5 + (my - 0.5) * POINT_GAIN;
    nx = Math.max(0, Math.min(1, nx));
    ny = Math.max(0, Math.min(1, ny));
    return { x: nx * window.innerWidth, y: ny * window.innerHeight };
  }

  /* 张掌滑动 = 转视角（恢复原来的滑动操控）。读的是掌心中心的**位移**，
     和鼠标拖拽同一套手感：手往哪边滑，天就往哪边转；手停住，天就停住。
     位移先做指数平滑再换算成像素增量，喂给和拖拽完全相同的 look()/rotateBy()，
     所以手势与鼠标/触摸的方向、增益一致，不会两套手感。 */
  var SLIDE_SMOOTH = 0.4;      // 掌心位移的平滑系数
  var SLIDE_DEAD = 0.0012;     // 小于这个归一化位移视为手抖，不转
  function slide(l) {
    var c = center(l);
    var xm = 1 - c.x, ym = c.y;                 // 镜像后与预览同向
    if (state.slideX == null) { state.slideX = xm; state.slideY = ym; return false; }
    var px = state.slideX, py = state.slideY;
    state.slideX += (xm - px) * SLIDE_SMOOTH;
    state.slideY += (ym - py) * SLIDE_SMOOTH;
    var dx = state.slideX - px, dy = state.slideY - py;
    if (Math.abs(dx) < SLIDE_DEAD && Math.abs(dy) < SLIDE_DEAD) return false;
    var W = window.innerWidth, H = window.innerHeight;
    if (mode() === 'ground') {
      if (window.GROUND && window.GROUND.look) window.GROUND.look(dx * W, dy * H);
    } else if (window.GX && window.GX.rotateBy && !camHeld()) {
      window.GX.rotateBy(-dx * W * 0.0042, dy * H * 0.0042);
    }
    state.lastAct = performance.now();
    return true;
  }

  /* 双指并拢上下滑 = 滚页。读掌心垂直位移（与滑动转向同一套平滑/死区手感），
     上滑 = 内容向下滚（scrollTop 增），和触摸滑屏同向。只作用于当前真正可滚的容器。 */
  var SCROLL_SMOOTH = 0.4;
  var SCROLL_DEAD = 0.0012;
  var SCROLL_GAIN = 2.4;
  function scrollTarget() {
    var panel = document.getElementById('panel');
    var pb = document.getElementById('panelBody');
    if (panel && pb && panel.classList.contains('open') && pb.scrollHeight > pb.clientHeight + 4) return pb;
    return null;
  }
  function scrollFrame(l) {
    var c = center(l);
    var ym = c.y;
    if (state.scrollY == null) { state.scrollY = ym; return false; }
    var py = state.scrollY;
    state.scrollY += (ym - py) * SCROLL_SMOOTH;
    var dy = state.scrollY - py;
    if (Math.abs(dy) < SCROLL_DEAD) return false;
    var target = scrollTarget();
    if (!target) return false;
    target.scrollTop += -dy * window.innerHeight * SCROLL_GAIN;
    state.lastAct = performance.now();
    return true;
  }

  /* 指住光害分界线把手 = 抓取拖动。水平位移喂给与鼠标 pointermove 完全相同的
     GROUND.setSplit + 分界线左缘更新，手势与鼠标拖的是同一条落点、同一套钳制。 */
  function splitGripRect() {
    var bar = document.getElementById('splitBar');
    if (!bar || !bar.classList.contains('on')) return null;
    var g = bar.querySelector('.grip');
    return g ? g.getBoundingClientRect() : null;
  }
  function overGrip(sx, sy) {
    var r = splitGripRect();
    if (!r) return false;
    var pad = 16;
    return sx >= r.left - pad && sx <= r.right + pad && sy >= r.top - pad && sy <= r.bottom + pad;
  }
  function splitDragTo(sx) {
    var G = window.GROUND;
    var bar = document.getElementById('splitBar');
    if (!G || !G.setSplit || !G.splitInfo || !bar) return;
    G.setSplit(true, sx / window.innerWidth);
    bar.style.left = (G.splitInfo().x * 100).toFixed(2) + '%';
    state.lastAct = performance.now();
  }
  /* 指住滑杆（input[type=range]）= 抓取拖动。水平位置换算成取值并派发 input 事件，
     与鼠标拖滑杆走同一条监听路径（app 侧读 this.value），手势/鼠标同一套取值与步进。 */
  function rangeAt(sx, sy) {
    if (!document.elementFromPoint) return null;
    /* 滑杆本体常只有 2px 高，指尖 1:1 打点几乎不可能命中：
       在垂直方向 ±12px 各探一次，命中任一即认作滑杆——和触摸端的宽松命中一致。 */
    var ys = [sy, sy - 12, sy + 12];
    for (var yi = 0; yi < ys.length; yi++) {
      var el = document.elementFromPoint(sx, ys[yi]);
      while (el && el !== document.body) {
        if (el.tagName === 'INPUT' && el.type === 'range') return el;
        el = el.parentElement;
      }
    }
    return null;
  }
  function rangeDragTo(el, sx) {
    var r = el.getBoundingClientRect();
    if (!r.width) return;
    var min = parseFloat(el.min || '0'), max = parseFloat(el.max || '100');
    var step = parseFloat(el.step || '1') || 1;
    var f = Math.max(0, Math.min(1, (sx - r.left) / r.width));
    var v = Math.round((min + f * (max - min)) / step) * step;
    v = Math.max(min, Math.min(max, v));
    if (parseFloat(el.value) !== v) {
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    state.lastAct = performance.now();
  }

  /* 捏合 = 连续变焦（速率式，不是绝对落位）。
     用户要的手感：两指**张开**就一直放大、两指**捏紧**就一直缩小，松到中间就停。
     所以读的是「光圈相对中位的偏移」当作速度，对时间积分：
       偏移 > 死区 → 视场/视距持续收窄（放大）
       偏移 < -死区 → 持续放宽（缩小）
       落在死区内 → 停住
     进入变焦靠「捏一下」（光圈 < 0.38），退出靠「整只手掌张开」。
     积分用真实 dt（钳到 0.1s），低帧率下速度也不变，不会一卡一卡。 */
  var ZOOM_NEUTRAL = 0.55;    // 光圈中位：两指自然半开
  var ZOOM_DEAD = 0.10;       // 中位附近的死区，手抖不会误变焦
  var ZOOM_FOV_RATE = 90;     // 地面：每单位偏移每秒改变多少度视场
  var ZOOM_LOG_RATE = 3.0;    // 宇宙：每单位偏移每秒改变多少数量级视距
  function zoomFrame(r, t) {
    state.pinchS += (r - state.pinchS) * 0.3;
    var dt = state.zoomT ? Math.min(0.1, (t - state.zoomT) / 1000) : 0;
    state.zoomT = t;
    var off = state.pinchS - ZOOM_NEUTRAL;
    if (Math.abs(off) < ZOOM_DEAD) return false;
    var v = off - (off > 0 ? ZOOM_DEAD : -ZOOM_DEAD);
    if (state.pinchMode === 'ground') {
      var G = window.GROUND;
      if (!G || !G.setFov || !G.state) return false;
      G.setFov(G.state().fov - v * ZOOM_FOV_RATE * dt);
    } else if (window.GX && window.GX.setLogD && window.GX.state && !camHeld()) {
      window.GX.setLogD(window.GX.state().logD - v * ZOOM_LOG_RATE * dt);
    }
    state.lastAct = t;
    return true;
  }

  function pickAtPoint(sx, sy) {
    var m = mode(), hit = null;
    if (m === 'ground') hit = (window.GROUND && window.GROUND.pick) ? window.GROUND.pick(sx, sy) : null;
    else hit = (window.GX && window.GX.pickAt) ? window.GX.pickAt(sx, sy) : null;
    if (hit && window.GX && window.GX.onSelect) {
      try { window.GX.onSelect(hit); } catch (e) { /* 拾取失败不动整体 */ }
    }
    return hit;
  }

  /* 运镜中 = 这次跳转还在走。引擎里 flyTo 是唯一运镜入口，飞行中 state().flying 恒真、
     落位（或被鼠标/滚轮取消）自动假——以它为准，不另设计时器，所以不会出现「锁到一半解不开」。 */
  function flying() {
    try {
      var s = window.GX && window.GX.state && window.GX.state();
      return !!(s && s.flying);
    } catch (e) { return false; }
  }

  /* 跳转还没走完时，吞掉一切会改写机位的手势指令。
     为什么必须吞：GX.setLogD / GX.rotateBy 在引擎里第一行就是 cancelFlight()，
     放任捏合变焦或张掌转向，等于把用户刚按下的「100% 跳转」半途掐死（旧缺陷：点地球飞一半就拐弯）。
     只拦相机指令，不拦位移积分本身——state.slideX / pinchS 照常推进，
     所以落位那一瞬间不会有一坨积压的视角猛地甩过去。 */
  function camHeld() {
    if (!flying()) return false;
    if (!state.flightNoted) { state.flightNoted = true; note('运镜中：这次跳转会走完，落位后再接手势点'); }
    return true;
  }

  function act(l) {
    if (!window.GX) return;
    var t = performance.now();
    var fly = flying();
    if (!fly && state.flightNoted) { state.flightNoted = false; note('运镜落位，手势可以接着点了'); }

    var pinchR = dist(l[4], l[8]) / palmScale(l);
    if (state.pinch) {
      /* 整只手掌张开 = 退出变焦，回到滑动转向 */
      if (openPalm(l)) { state.pinch = false; state.palm = null; state.slideX = null; }
    } else if (pinchR < 0.38) {
      state.pinch = true;
      state.pinchS = pinchR;
      state.pinchMode = mode();
      state.zoomT = 0;
      state.dwellT = 0; state.palm = null; state.slideX = null;
      state.splitDrag = false; state.rangeEl = null; state.scrollY = null;
    }
    if (state.pinch) {
      state.rearmUI = null; state.rearmNoted = false;
      zoomFrame(pinchR, t);
      if (dot) dot.style.display = 'none';
      return;
    }

    if (openPalm(l)) {
      state.rearmUI = null; state.rearmNoted = false;
      if (state.palm !== true) { state.palm = true; state.slideX = null; }
      state.splitDrag = false; state.rangeEl = null; state.scrollY = null;
      slide(l);
      if (dot) dot.style.display = 'none';
      state.dwellT = 0;
      return;
    }
    state.palm = null;
    state.slideX = null;

    if (twoFinger(l)) {
      state.rearmUI = null; state.rearmNoted = false;
      state.splitDrag = false; state.rangeEl = null;
      scrollFrame(l);
      if (dot) dot.style.display = 'none';
      state.dwellT = 0;
      return;
    }
    state.scrollY = null;

    if (pointing(l)) {
      /* 食指指尖（镜像后与画面同向）→ 经增益映射到屏幕坐标；
         轻度平滑抑制高增益放大的手抖，否则驻留点击会被抖断。 */
      var mx = 1 - l[8].x, my = l[8].y;
      if (state.curMX == null) { state.curMX = mx; state.curMY = my; }
      state.curMX += (mx - state.curMX) * 0.55;
      state.curMY += (my - state.curMY) * 0.55;
      var pm = pointMap(state.curMX, state.curMY);
      var sx = pm.x, sy = pm.y;
      if (dot) {
        dot.style.display = 'block';
        dot.style.transform = 'translate(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px)';
      }
      /* 拖动优先于点按：指住滑杆/分界线把手即抓取，移动手就是拖，松开（张掌/换手势）才放下。
         否则手势永远只能 dwell-click，够不到任何拖拽件。 */
      var rEl = state.rangeEl || rangeAt(sx, sy);
      if (rEl) {
        state.rangeEl = rEl; state.splitDrag = false;
        state.dwellT = 0; state.dwellUI = null;
        ringSet(false);
        rangeDragTo(rEl, sx);
        return;
      }
      if (state.splitDrag || overGrip(sx, sy)) {
        state.splitDrag = true; state.rangeEl = null;
        state.dwellT = 0; state.dwellUI = null;
        ringSet(false);
        splitDragTo(sx);
        return;
      }
      /* 运镜期间一律不再按下：跳转必须走完（用户要求「手势点一个模块 = 100% 跳转」）。
         为什么必须整段封：运镜途中整幅画面在动，手不动但指尖底下每一帧都是不同内容，
         驻留判定会把「正好飘过来的下一个东西」当成用户的新目标，第二次 onSelect 直接改写航线，
         用户看到的就是「点地球只飞了一半就拐弯」。滑动/捏合/滚页/拖滑杆不受影响，只封「点」。 */
      if (fly) {
        state.dwellT = 0; state.dwellUI = null; state.hoverUI = null;
        state.dwellX = sx; state.dwellY = sy;          // 落位后从此刻重新起算，不带运镜期间的进度
        ringSet(false);
        camHeld();
        return;
      }
      if (state.flightNoted) { state.flightNoted = false; note('运镜落位，手势可以接着点了'); }
      /* 先问界面：指尖下方有没有可点控件？有就点控件（手势代鼠标），没有才落回 3D 拾取。
         落点变化（换了一个按钮 / 从按钮移到星体）立刻重新起算，避免「上个目标的进度算到下个头上」。 */
      var uiEl = uiHit(sx, sy);
      state.hoverUI = uiEl;
      if (uiEl !== state.dwellUI) { state.dwellUI = uiEl; state.dwellT = 0; }
      /* 「按一次状态就变一次」的控件（HTML 里标了 data-rearm）触发一次后，必须把手抬起来才算下一次。
         为什么不能沿用上面那条 1000ms 冷却：冷却一到期站点还会再认一次「指住按下」，
         对「飞向地球」这种终点相同的按钮无害，但对「换一局 / 记录并判定 / 导出 / 问」就是手不动停不下来
         ——卡面一直换到用户看不了、留痕里多出重复记录、一次点按发掉好几个外部请求。
         为什么按「手指动没动」判定，而不是按「指尖还压不压在这枚按钮上」：这类按钮一点就改写自己周围的
         内容（换一局重写整张核对卡、记录追加一行），按钮自己会从静止的指尖底下跑掉——实测跑掉 87 像素。
         用几何认人就得赌一个容差：赌小了等于没锁，赌大了把正常操作扣死。
         所以口径和上面驻留判定用同一个「动了」：挪开 46 像素即重新上膛，或手退出指点姿势。 */
      if (state.rearmUI) {
        var rearmD = Math.sqrt(Math.pow(sx - state.rearmX, 2) + Math.pow(sy - state.rearmY, 2));
        if (rearmD <= 46) {
          state.dwellT = 0; state.dwellUI = null; state.hoverUI = state.rearmUI;
          ringSet(false);
          if (!state.rearmNoted) { state.rearmNoted = true; note('这个按钮按一次就要抬手，再指才算下一次'); }
          return;
        }
        state.rearmUI = null; state.rearmNoted = false;
      }
      var need = uiEl ? 640 : 850;              /* 点控件稍快（0.64s），点星体保持原手感 */
      if (t < state.coolUntil) { ringSet(false); return; }
      var dd = Math.sqrt(Math.pow(sx - state.dwellX, 2) + Math.pow(sy - state.dwellY, 2));
      if (dd > 46) { state.dwellX = sx; state.dwellY = sy; state.dwellT = t; ringSet(true, 0, !!uiEl); return; }
      if (!state.dwellT) { state.dwellT = t; ringSet(true, 0, !!uiEl); return; }
      ringSet(true, (t - state.dwellT) / need, !!uiEl);
      if (t - state.dwellT > need) {
        state.coolUntil = t + (uiEl ? 1000 : 1300); state.dwellT = 0;
        ringSet(false);
        if (uiEl) {
          var label = (uiEl.getAttribute('aria-label') || uiEl.textContent || '').trim();
          uiEl.click();
          note('已按下：' + (label ? label.slice(0, 16) : '界面按钮'));
          if (uiEl.hasAttribute && uiEl.hasAttribute('data-rearm')) { state.rearmUI = uiEl; state.rearmX = sx; state.rearmY = sy; }
        } else if (window.GX && window.GX.onSelect) {
          pickAtPoint(sx, sy);
        }
        if (dot) dot.style.display = 'none';
      }
      return;
    }
    state.dwellT = 0; state.dwellUI = null;
    state.rearmUI = null; state.rearmNoted = false;   /* 手退出指点姿势＝抬手，重新上膛 */
    state.curMX = null; state.curMY = null;
    state.splitDrag = false; state.rangeEl = null; state.scrollY = null;
    ringSet(false);
    if (dot) dot.style.display = 'none';
  }

  function loop() {
    if (!state.on) return;
    /* 视频帧回调在部分浏览器/窗口状态下会静默停摆；识别循环改由页面 rAF 驱动，
       仍用 currentTime 去重，既不重复推理同一帧，也不依赖那条回调。 */
    state.raf = requestAnimationFrame(loop);
    state.loopTicks++;
    if (!video || video.readyState < 2 || !state.lm) return;
    var now = performance.now();
    if (now - state.lastT < 33) return;
    if (video.currentTime === state.lastVideoTime) return;
    state.lastVideoTime = video.currentTime;
    state.lastT = now;
    var detectAt = performance.now();
    try {
      var res = state.lm.detectForVideo(video, Math.round(now));
      var detectMs = performance.now() - detectAt;
      state.detects++;
      state.lastDetectAt = Math.round(now);
      if (detectMs > state.maxDetectMs) state.maxDetectMs = Math.round(detectMs);
      var hs = res && res.landmarks;
      if (hs && hs.length) {
        var l = hs[0];
        var m = mode();
        var kind = state.pinch
          ? (m === 'ground' ? '捏合 · 张指放大 / 收指缩小' : '捏合 · 张指推近 / 收指拉远')
          : openPalm(l)
            ? (m === 'ground' ? '张掌 · 滑动转天' : '张掌 · 滑动环视')
            : state.rangeEl
              ? '指住滑杆 · 左右拖动'
              : state.splitDrag
                ? '指住分界线 · 左右拖动'
                : twoFinger(l)
                  ? '双指并拢 · 上下滑滚页'
                  : pointing(l)
                    ? (state.hoverUI ? '指住界面按钮 · 保持即按下'
                                     : (m === 'ground' ? '指住 0.9 秒 · 标记头顶的星' : '指住 0.9 秒 · 锁定天体'))
                    : '手在画面里了';
        if (kind !== state.lastKind) { state.lastKind = kind; note(kind); }
        state.errs = 0;
        state.lastErr = null;
        act(l);
      } else {
        state.rearmUI = null; state.rearmNoted = false;
        state.palm = null; state.slideX = null; state.slideY = null; state.dwellT = 0;
        state.curMX = null; state.curMY = null;
        state.splitDrag = false; state.rangeEl = null; state.scrollY = null;
        /* 手离开画面即松开捏合、清掉滑动锚点：回来后的第一下张掌不会把视角甩走 */
        if (state.pinch) { state.pinch = false; state.zoomT = 0; }
        if (state.lastKind !== 'no-hand') { state.lastKind = 'no-hand'; note('把手放进画面：掌心朝镜头，约 40–60 cm'); }
        if (dot) dot.style.display = 'none';
      }
    } catch (e) {
      state.lastErr = String((e && e.message) || e);
      state.errs++;
      if (state.errs > 5) { note('手势识别中断，已自动关闭。'); stop(true, true); }
    }
  }

  function build() {
    hud = document.getElementById('gestHud');
    video = document.getElementById('gestVideo');
    dot = document.getElementById('gestDot');
    ring = document.getElementById('gestRing');
    ringCircle = ring ? ring.querySelector('circle') : null;
    statusEl = document.getElementById('gestStatus');
    if (!hud || !video) return false;
    hud.classList.add('on');
    document.body.classList.add('gest-on');
    return true;
  }

  /* ---------- 手势代鼠标：命中界面上的可交互控件 ----------
     指尖落到屏幕坐标后，先用 elementFromPoint 找最上层元素，再向上追溯到
     「可交互祖先」：按钮/链接/带 data-loc 的导航项，或任何显式标了可点的元素。
     命中即把它当作「要点的东西」，指满 dwellNeed 毫秒就 el.click()——和鼠标点它
     走完全同一条监听路径，所以侧栏、底部导航、面板里的按钮，手势都能原样点开。 */
  var CLICKABLE_SEL = 'button,a,[data-loc],[role="button"],[role="tab"],.poem-item,.star-row';
  function clickableAncestor(el) {
    while (el && el !== document.body) {
      if (el.tagName === 'CANVAS' || el.id === 'c') return null;   /* 画布交给 3D 拾取，不当按钮 */
      if (el.matches && el.matches(CLICKABLE_SEL)) return el;
      el = el.parentElement;
    }
    return null;
  }
  function uiHit(sx, sy) {
    if (!document.elementFromPoint) return null;
    var el = document.elementFromPoint(sx, sy);
    if (!el || el === dot) return null;
    var a = clickableAncestor(el);
    /* 「飞向今晚的星」这类行：点空白处也应命中行内那颗「飞过去」按钮 */
    if (a && a.classList && a.classList.contains('star-row')) {
      var b = a.querySelector('button');
      if (b) a = b;
    }
    return a;
  }
  /* 光环进度：prog 0→1 把描边从空填满；命中控件用暖金、命中星体用冷蓝，一眼区分点的是按钮还是星 */
  var RING_C = 2 * Math.PI * 16;
  function ringSet(on, prog, hot) {
    if (!ring || !ringCircle) return;
    if (!on) { ring.classList.remove('on'); return; }
    ring.classList.add('on');
    ringCircle.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, prog))));
    ringCircle.style.stroke = hot ? '#a9c8ff' : 'var(--gold)';
  }

  function stop(notify, keepHud) {
    if (state.loading) state.loadEpoch++;
    if (state.loadWatch) { clearInterval(state.loadWatch); state.loadWatch = 0; }
    state.loading = false;
    if (state.raf) {
      try { cancelAnimationFrame(state.raf); } catch (e) { /* noop */ }
      state.raf = 0;
    }
    state.on = false;
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) { /* noop */ } });
      state.stream = null;
    }
    if (video) { try { video.srcObject = null; } catch (e) { /* noop */ } }
    if (state.lm) { try { state.lm.close(); } catch (e) { /* noop */ } state.lm = null; }
    if (hud && !keepHud) { hud.classList.remove('on'); document.body.classList.remove('gest-on'); }
    if (dot) dot.style.display = 'none';
    ringSet(false);
    state.pinch = false; state.palm = null; state.dwellT = 0; state.lastKind = null;
    state.dwellUI = null;
    state.slideX = null; state.slideY = null; state.pinchS = 0; state.zoomT = 0;
    state.curMX = null; state.curMY = null;
    state.splitDrag = false; state.rangeEl = null; state.scrollY = null;
    state.rearmUI = null; state.rearmNoted = false; state.rearmX = 0; state.rearmY = 0;
    if (notify !== false && api.onStop) api.onStop();
  }

  function start() {
    if (state.on) return Promise.resolve(true);
    if (state.loading) {
      note('还在' + (state.loadStage || '加载') + '，请稍候；也可点右上角「关」后重新点「手势」。');
      return Promise.resolve(false);
    }
    if (!supported()) {
      build();
      var why = location.protocol === 'file:'
        ? '当前是双击打开的 file:// 页面，浏览器禁止它加载手势模型。请关闭本页，双击项目根目录的「启动 星阑归序.bat」，在它自动打开的 http://127.0.0.1:8765 页面上再点「手势」（端口被占用时会顺延到 8766 及之后）。'
        : '这台设备或浏览器不支持摄像头手势，鼠标与触摸照常可用。';
      note(why);
      return Promise.reject(new Error(why));
    }
    if (!build()) return Promise.reject(new Error('手势界面未能初始化。'));
    var epoch = ++state.loadEpoch;
    state.loading = true;
    state.loadAt = Date.now();
    state.loadStage = '正在下载手势识别器（约 17 MB，首次加载）';
    note(state.loadStage + '…');
    state.loadWatch = setInterval(function () {
      if (epoch !== state.loadEpoch || !state.loading) { clearInterval(state.loadWatch); state.loadWatch = 0; return; }
      var waited = Math.round((Date.now() - state.loadAt) / 1000);
      if (waited >= 60) {
        clearInterval(state.loadWatch); state.loadWatch = 0;
        state.loadEpoch++;
        state.loading = false;
        note('手势模型加载超过 60 秒仍未完成。请重新点「手势」重试；鼠标/触摸照常可用。');
        stop(false, true);
        setTimeout(function () { if (hud && !state.on && !state.loading) { hud.classList.remove('on'); if (dot) dot.style.display = 'none'; } }, 12000);
        return;
      }
      if (waited % 5 === 0) note(state.loadStage + '（已等待 ' + waited + ' 秒）…');
    }, 1000);
    var base = new URL('vendor/mediapipe/', location.href).href;
    return import(base + 'vision_bundle.mjs').then(function (mod) {
      if (epoch !== state.loadEpoch) throw new Error('加载已取消');
      state.loadStage = '正在准备识别运行环境';
      note(state.loadStage + '…');
      return mod.FilesetResolver.forVisionTasks(base + 'wasm').then(function (fileset) {
        if (epoch !== state.loadEpoch) throw new Error('加载已取消');
        state.loadStage = '正在读取手势模型';
        note(state.loadStage + '…');
        var opts = {
          baseOptions: { modelAssetPath: base + 'hand_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO', numHands: 1,
          minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6
        };
        state.loadStage = '正在启动显卡识别引擎';
        note(state.loadStage + '…');
        var gpu = new Promise(function (resolve, reject) {
          var done = false;
          var timer = setTimeout(function () {
            if (done) return;
            done = true;
            reject(new Error('GPU_TIMEOUT'));
          }, 15000);
          mod.HandLandmarker.createFromOptions(fileset, opts).then(function (lm) {
            if (done) { try { lm.close(); } catch (e) { /* 已超时的实例只负责关闭 */ } return; }
            done = true; clearTimeout(timer); resolve(lm);
          }, function (err) {
            if (done) return;
            done = true; clearTimeout(timer); reject(err);
          });
        });
        return gpu.catch(function () {
          if (epoch !== state.loadEpoch) throw new Error('加载已取消');
          opts.baseOptions.delegate = 'CPU';
          state.loadStage = '显卡未及时响应，正在改用处理器';
          note(state.loadStage + '…');
          return mod.HandLandmarker.createFromOptions(fileset, opts);
        });
      });
    }).then(function (lm) {
      if (epoch !== state.loadEpoch) { try { lm.close(); } catch (e) {} throw new Error('加载已取消'); }
      state.lm = lm;
      state.loadStage = '模型就绪，正在请求摄像头';
      note(state.loadStage + '…');
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
    }).then(function (stream) {
      if (epoch !== state.loadEpoch) { stream.getTracks().forEach(function (t) { t.stop(); }); throw new Error('加载已取消'); }
      clearInterval(state.loadWatch); state.loadWatch = 0;
      state.stream = stream;
      video.srcObject = stream;
      var p = video.play();
      if (p && p.catch) p.catch(function () { /* 自动播放被拒：静帧也能推理 */ });
      state.on = true;
      state.loading = false;
      state.lastKind = null;
      state.lastVideoTime = -1; state.lastT = 0; state.errs = 0; state.lastErr = null;
      state.loopTicks = 0; state.detects = 0; state.lastDetectAt = 0; state.maxDetectMs = 0;
      note('掌心朝镜头 · 张掌转视角 · 捏合变焦 · 指住选中 · 指住滑杆/分界线左右拖 · 双指并拢上下滚页');
      if (api.onStop) api.onStop();
      loop();
      return true;
    }).catch(function (err) {
      if (epoch !== state.loadEpoch) return false;
      var m = (err && (err.name === 'NotAllowedError' ? '摄像头权限被拒绝。手势只是可选功能，鼠标/触摸照常可用。'
        : err.name === 'NotFoundError' ? '没有找到摄像头。'
        : (err.message || '未知错误')));
      note(m);
      stop(false, true);
      setTimeout(function () { if (hud && !state.on && !state.loading) { hud.classList.remove('on'); if (dot) dot.style.display = 'none'; } }, 7000);
      if (api.onStop) api.onStop();
      throw err;
    });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && (state.on || state.loading)) stop(true);
  });
  window.addEventListener('pagehide', function () { if (state.on || state.loading) stop(false); });

  window.GESTURE = {
    supported: supported,
    start: start,
    stop: function () { stop(true); },
    active: function () { return state.on; },
    loading: function () { return state.loading; },
    set onStop(fn) { api.onStop = fn; },
    set onStatus(fn) { api.onStatus = fn; }
  };

  /* ---- 取证接口（只有地址带 ?selftest=1 时才挂出） ------------------------
     用应用自己的 HandLandmarker 与生产环境的 act() 跑真推理，用来证明
     「模型认出真手 → 同一套逻辑推动画面」这条链路真的通，而不是看起来通。
     默认不挂：对外站点不多暴露任何额外入口。 */
  if (/[?&]selftest=1(&|$)/.test(location.search)) {
    /* 指针增益映射的纯函数取证入口：验证「手留在画面中央即可扫到屏幕四边」。 */
    GESTURE.__pointMap = pointMap;
    GESTURE.__twoFinger = function (l) { return twoFinger(l); };
    /* 一帧姿势会被判成哪种手势：门禁要能证明「我合成的这套关键点，站点自己确实认作
       张掌 / 捏合 / 指向」，否则「运镜期间没发出相机指令」有可能是姿势压根没被认出来的假绿。 */
    GESTURE.__kinds = function (l) {
      return { openPalm: !!openPalm(l), pointing: !!pointing(l), twoFinger: !!twoFinger(l),
               pinchR: +(dist(l[4], l[8]) / palmScale(l)).toFixed(3) };
    };
    GESTURE.__scroll = function () { var t = scrollTarget(); return t ? { id: t.id, scrollTop: t.scrollTop, max: t.scrollHeight - t.clientHeight } : null; };
    GESTURE.__drag = function () { return { split: state.splitDrag, range: state.rangeEl ? (state.rangeEl.id || state.rangeEl.type) : null }; };
    /* 手势代鼠标的取证入口：与 act() 命中 uiEl 后完全同一条路径（uiHit → .click()），
       用来证明「指尖坐标 → 命中的是哪个控件 → 真按下去发生了什么」这条链在浏览器里跑通。 */
    GESTURE.__uiHit = function (sx, sy) {
      var el = uiHit(sx, sy);
      if (!el) return null;
      return { tag: el.tagName, id: el.id || null, cls: el.className || null,
               loc: el.getAttribute ? el.getAttribute('data-loc') : null,
               label: ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '').trim().slice(0, 24) };
    };
    GESTURE.__clickVia = function (sx, sy) {
      var el = uiHit(sx, sy);
      if (!el) return { hit: false };
      try { el.click(); return { hit: true, label: ((el.getAttribute && el.getAttribute('aria-label')) || el.textContent || '').trim().slice(0, 24) }; }
      catch (e) { return { hit: true, err: String((e && e.message) || e) }; }
    };
    GESTURE.__ring = function () { return ring ? { present: true, on: ring.classList.contains('on') } : { present: false }; };
    /* 运镜锁的取证入口：门禁要能分别读到「引擎此刻在不在飞」「手势是否因此扣住不点」，
       而不是只看最后一帧的截图猜。dwellT=0 且 flying=true 才叫真的扣住了。 */
    GESTURE.__lock = function () {
      return { flying: flying(), held: !!state.flightNoted, dwellT: state.dwellT,
               coolUntil: state.coolUntil, now: Math.round(performance.now()),
               /* 「抬手再指」的取证口：门禁要能分别读到「膛里压着哪枚按钮」和「指尖此刻落在哪」，
                  否则「这一轮只按下一次」有可能是按钮自己挪出指尖造成的假绿，而不是这条规则的功劳。 */
               rearm: state.rearmUI ? (state.rearmUI.id || state.rearmUI.tagName) : null,
               rearmNoted: !!state.rearmNoted };
    };
    GESTURE.__state = function () {
      return { on: state.on, loading: state.loading, model: !!state.lm, kind: state.lastKind || null,
               mode: mode(), bortle: (window.GX && window.GX.getBortle) ? window.GX.getBortle() : null,
               loopTicks: state.loopTicks, detects: state.detects,
               lastDetectAt: state.lastDetectAt, maxDetectMs: state.maxDetectMs,
               errs: state.errs, lastErr: state.lastErr,
               rearm: state.rearmUI ? (state.rearmUI.id || state.rearmUI.tagName) : null };
    };

    /* 对一张图（URL / HTMLImageElement / HTMLVideoElement）跑真模型推理 */
    GESTURE.__detect = function (src) {
      return new Promise(function (resolve) {
        if (!state.lm) { resolve({ err: 'model-not-loaded' }); return; }
        var run = function (img) {
          try {
            var res = state.lm.detectForVideo(img, Math.round(performance.now()));
            var l = res && res.landmarks && res.landmarks[0];
            if (!l) { resolve({ n: 0, lm: [] }); return; }
            resolve({
              n: l.length,
              lm: l.map(function (p) { return { x: p.x, y: p.y, z: p.z || 0 }; }),
              handed: res.handedness || res.handednesses || null
            });
          } catch (e) { resolve({ err: String((e && e.message) || e) }); }
        };
        if (typeof src === 'string') {
          var im = new Image();
          im.onload = function () { run(im); };
          im.onerror = function () { resolve({ err: 'image-load-failed' }); };
          im.src = src;
        } else if (src) run(src);
        else resolve({ err: 'no-source' });
      });
    };

    /* 把 21 个关键点喂进生产代码里的 act()，返回动作前后的状态 */
    GESTURE.__feed = function (lms, reset) {
      if (reset) { state.palm = null; state.slideX = null; state.slideY = null; state.dwellT = 0;
                   state.curMX = null; state.curMY = null;
                   state.pinch = false; state.pinchS = 0; state.zoomT = 0;
                   state.splitDrag = false; state.rangeEl = null; state.scrollY = null; }
      var snap = function () {
        return {
          ground: (window.GROUND && window.GROUND.state) ? window.GROUND.state() : null,
          space: (window.GX && window.GX.state) ? window.GX.state() : null,
          bortle: (window.GX && window.GX.getBortle) ? window.GX.getBortle() : null
        };
      };
      var before = snap();
      act(lms);
      var after = snap();
      return { before: before, after: after, palm: !!state.palm, pinch: state.pinch };
    };
  }
})();
