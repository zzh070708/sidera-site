/* ============================================================================
 * 星阑归序 · core/warp.js
 * 「星际穿越」跃迁：真 3D 线段拉丝隧道 + 视场脉冲 + 缓慢滚转。
 * 只负责画面，不负责导航——到达后由 app.js 决定飞到哪颗星。
 * 装饰层铁律：任何异常都必须收尾，绝不允许把主画面锁在黑场里。
 * ==========================================================================*/
(function () {
  'use strict';
  var N = 1100, SPAN = 560, RAD = 19;
  var scene = null, cam = null, lines = null, mat = null, posArr = null, colArr = null;
  var data = null, active = false, t0 = 0, onDone = null, dur = 2600;
  var capEl = null, onProgress = null, lastProg = 0;

  function build() {
    scene = new THREE.Scene();
    cam = new THREE.PerspectiveCamera(62, 1, 0.1, 4000);
    cam.position.set(0, 0, 0);

    posArr = new Float32Array(N * 6);
    colArr = new Float32Array(N * 6);
    data = new Float32Array(N * 4);          // x, y, z, 颜色序号
    for (var i = 0; i < N; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = 1.4 + RAD * Math.pow(Math.random(), 0.55);
      data[i * 4] = Math.cos(a) * r;
      data[i * 4 + 1] = Math.sin(a) * r;
      data[i * 4 + 2] = -Math.random() * SPAN;
      data[i * 4 + 3] = Math.random();
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -SPAN * 0.5), SPAN);
    mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
    });
    lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    scene.add(lines);
  }

  function resize() {
    if (!cam) return;
    cam.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    cam.updateProjectionMatrix();
  }

  /* 颜色：大部分冷白，少量金色——和原星表里的恒星颜色呼应。
     必须由每根拉丝的固定随机数决定，不能每帧重摇，否则整片隧道会闪。 */
  function tint(k) {
    if (k > 0.955) return [1.0, 0.82, 0.46];
    if (k > 0.90) return [0.72, 0.82, 1.0];
    var v = 0.55 + 0.45 * k;
    return [v, v * 0.98, v * 0.94];
  }

  function update(now) {
    if (!active) return;
    var u = (now - t0) / dur;
    if (!isFinite(u)) u = 0;
    if (u < 0) u = 0;
    if (u >= 1) { finish(); return; }
    /* 速度包络：0–0.16 加速，0.72–1.0 减速。两端都必须是 0，否则隧道会「啪」地停住。 */
    var sp;
    if (u < 0.16) sp = u / 0.16;
    else if (u < 0.72) sp = 1;
    else sp = Math.max(0, 1 - (u - 0.72) / 0.28);
    sp = sp * sp * (3 - 2 * sp);
    /* 进度回传：外部用它把「隧道」变成真实的距离刻度（0 → X 光年），
       而不是一段与内容无关的装饰动画。节流 90ms，避免每帧写 DOM。 */
    if (onProgress && now - lastProg > 90) {
      lastProg = now;
      try { onProgress(u, sp); } catch (e3) { /* 回调坏了不影响穿越本身 */ }
    }
    var speed = 300 * sp;
    var len = 2 + 150 * sp;
    var dz = speed * 0.016;

    for (var i = 0; i < N; i++) {
      var z = data[i * 4 + 2] + dz;
      if (z > 40) { z -= SPAN; }
      data[i * 4 + 2] = z;
      var x = data[i * 4], y = data[i * 4 + 1];
      posArr[i * 6] = x; posArr[i * 6 + 1] = y; posArr[i * 6 + 2] = z;
      posArr[i * 6 + 3] = x; posArr[i * 6 + 4] = y; posArr[i * 6 + 5] = z - len;
      var c = tint(data[i * 4 + 3]);
      /* 头亮尾暗：加法混合下这条渐变就是「拉丝」的关键 */
      colArr[i * 6] = c[0]; colArr[i * 6 + 1] = c[1]; colArr[i * 6 + 2] = c[2];
      colArr[i * 6 + 3] = c[0] * 0.06; colArr[i * 6 + 4] = c[1] * 0.06; colArr[i * 6 + 5] = c[2] * 0.06;
    }
    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.attributes.color.needsUpdate = true;
    /* 视场随速度张开：四周被「吸」向中心，这是穿越感的主要来源 */
    cam.fov = 62 + 26 * sp;
    cam.rotation.z = 0.10 * sp * Math.sin(u * 3.1);
    cam.updateProjectionMatrix();
    mat.opacity = Math.min(1, 1.4 * Math.min(sp * 2.4, 1)) * (u > 0.86 ? Math.max(0, (1 - u) / 0.14) : 1);
  }

  function render(r) {
    if (!active) return;
    var ac = r.autoClear;
    r.autoClear = false;
    try { r.render(scene, cam); } finally { r.autoClear = ac; }
  }

  function finish() {
    if (!active) return;
    active = false;
    if (capEl) capEl.classList.remove('on');
    var f = onDone; onDone = null;
    onProgress = null;
    if (f) { try { f(); } catch (e) { /* 回调坏了也不许影响主画面 */ } }
  }

  function play(cfg) {
    try {
      if (!scene) build();
      resize();
      active = true;
      t0 = performance.now();
      dur = (cfg && cfg.dur) || 2600;
      onDone = (cfg && cfg.onDone) || null;
      onProgress = (cfg && cfg.onProgress) || null;
      lastProg = 0;
      capEl = document.getElementById('warpCap');
      if (capEl && cfg && cfg.caption) {
        capEl.textContent = cfg.caption;
        capEl.classList.add('on');
      }
      /* 手表兜底：后台标签页 rAF 会被暂停，不能让隧道永远罩着 */
      setTimeout(function () { if (active) finish(); }, dur + 900);
      return true;
    } catch (e) {
      active = false;
      return false;
    }
  }

  window.addEventListener('resize', resize);
  window.WARP = {
    play: play, update: update, render: render, finish: finish,
    active: function () { return active; }
  };
})();
