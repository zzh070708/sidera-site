/* ============================================================================
 * 星阑归序 · core/engine.js
 * 渲染内核：floating-origin 无级缩放 + HYG v4.0 真实星场 + 开普勒行星
 * 引擎算法继承自 AstroVerse（MIT），本作为文化命题重制版。
 * 安全约定：本文件不读取任何用户输入；不发起网络请求；不执行动态代码。
 * ==========================================================================*/
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { return; }

  var RENDER_REF = 100, CULL_FACTOR = 200, SKY_R = RENDER_REF * 1000;
  var D_MIN = -7.5, D_MAX = 4.7;
  var DISK_R = 16000, R0 = 8000;
  var AU2PC = 4.84814e-6;
  window.OBLIQ = 23.4393 * Math.PI / 180;

  /* ---------- 星表 ---------- */
  var SD = window.STAR_DATA || null;
  function b64bytes(b64) { var s = atob(b64), n = s.length, a = new Uint8Array(n); for (var i = 0; i < n; i++) a[i] = s.charCodeAt(i); return a; }
  function b64f32(b64) { return new Float32Array(b64bytes(b64).buffer); }
  var STARS = null, REAL_N = 0;
  try {
    if (SD) STARS = { n: SD.n, pos: b64f32(SD.pos), mag: b64bytes(SD.mag), bv: b64bytes(SD.bv), names: SD.names || {} };
  } catch (e) { STARS = null; }
  REAL_N = STARS ? STARS.n : 0;

  function magOf(i) { return STARS.mag[i] / 255 * 16.5 - 1.5; }
  function bvOf(i) { return STARS.bv[i] / 255 * 2.5 - 0.5; }
  function bvColor(bv, out, o) {
    var r, g, b;
    if (bv < 0) { r = 0.72; g = 0.80; b = 1.00; }
    else if (bv < 0.4) { var k = bv / 0.4; r = 0.72 + 0.28 * k; g = 0.80 + 0.17 * k; b = 1.00 - 0.09 * k; }
    else if (bv < 1.0) { var k2 = (bv - 0.4) / 0.6; r = 1.00; g = 0.97 - 0.15 * k2; b = 0.91 - 0.28 * k2; }
    else { var k3 = Math.min(1, (bv - 1.0) / 0.8); r = 1.00; g = 0.82 - 0.12 * k3; b = 0.63 - 0.18 * k3; }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }

  /* 银河系结构远景（程序化示意，诚实标注）：HYG 实测上限约 990 pc，
     1 kpc 以外按已知银河系形态参数生成结构层，与真实恒星严格区分。 */
  function addStructure(S) {
    var M = 90000, n0 = S.n, n1 = n0 + M;
    var pos = new Float32Array(n1 * 3), mag = new Uint8Array(n1), bv = new Uint8Array(n1);
    pos.set(S.pos); mag.set(S.mag); bv.set(S.bv);
    function gg() { return (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 0.7; }
    var tmp = [], got = 0, guard = 0;
    while (got < M && guard < M * 20) {
      guard++;
      var t = Math.random(), r, X, Y, Z, u, th, s;
      if (t < 0.44) {
        th = Math.random() * 6.9; r = 3200 * Math.exp(0.28 * th);
        var a = (Math.PI / 2) * (got % 4);
        X = Math.cos(th + a) * r + gg() * (520 + r * 0.02); Y = Math.sin(th + a) * r + gg() * (520 + r * 0.02); Z = gg() * 165;
      } else if (t < 0.80) {
        r = Math.sqrt(Math.random()) * DISK_R; th = Math.random() * Math.PI * 2;
        X = Math.cos(th) * r; Y = Math.sin(th) * r; Z = gg() * 300;
      } else if (t < 0.92) {
        r = Math.pow(Math.random(), 2.6) * 3000; u = Math.random() * 2 - 1; th = Math.random() * Math.PI * 2; s = Math.sqrt(1 - u * u);
        X = Math.cos(th) * s * r; Y = Math.sin(th) * s * r; Z = u * r * 0.6;
      } else {
        r = Math.pow(Math.random(), 1.4) * 50000 + 1000; u = Math.random() * 2 - 1; th = Math.random() * Math.PI * 2; s = Math.sqrt(1 - u * u);
        X = Math.cos(th) * s * r; Y = Math.sin(th) * s * r; Z = u * r;
      }
      var hx = X - R0, hy = Z, hz = Y, d = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (d < 1000) continue;
      tmp.push([d, hx, hy, hz]); got++;
    }
    tmp.sort(function (a, b) { return a[0] - b[0]; });
    for (var j = 0; j < tmp.length; j++) {
      var k = n0 + j;
      pos[k * 3] = tmp[j][1]; pos[k * 3 + 1] = tmp[j][2]; pos[k * 3 + 2] = tmp[j][3];
      mag[k] = Math.min(255, Math.max(0, ((6.5 + Math.pow(Math.random(), 2) * 4.5) + 1.5) / 16.5 * 255)) | 0;
      bv[k] = (Math.random() * 255) | 0;
    }
    S.n = n0 + tmp.length; S.pos = pos; S.mag = mag; S.bv = bv;
  }
  if (STARS) addStructure(STARS);
  window.STARS = STARS;
  window.REAL_N = REAL_N;

  /* ---------- 渲染器 / 场景 ---------- */
  var canvas = document.getElementById('c');
  /* 渲染器：逐级降配重试，真实 GPU 偶发显存不足时仍能起来（而非整段引擎抛错 → 「3D 引擎未能加载」）。
     生产环境关掉 preserveDrawingBuffer（帧缓冲常驻显存，是真实机器「上下文丢失/创建失败」的头号诱因）；
     只有取证/截图模式（?selftest=1 或 ?shot=1）才开，供 canvas 回读像素。 */
  var SHOT = /[?&](selftest|shot)=1/.test(location.search);
  function makeRenderer(opts) { try { return new THREE.WebGLRenderer(opts); } catch (e) { return null; } }
  var renderer =
    makeRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: SHOT, failIfMajorPerformanceCaveat: false }) ||
    makeRenderer({ canvas: canvas, antialias: false, powerPreference: 'default', preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false }) ||
    makeRenderer({ canvas: canvas, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false });
  if (!renderer) {
    window.__GX_INIT_ERR__ = 'WebGL 初始化失败：显存不足或显卡驱动异常。请关闭其它占用 GPU 的程序（其它标签页、游戏、视频剪辑）后刷新页面。';
    return;
  }
  // 高分屏帧缓冲按 ratio² 增长，2x 叠抗锯齿最易撑爆显存；上限压到 1.5，清晰度几乎无损而省一大截显存。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x030510, 1);
  window.renderer = renderer;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(55, 1, 1, RENDER_REF * 2000);
  window.scene = scene; window.camera = camera;
  var nearLayer = new THREE.Group(); scene.add(nearLayer);
  window.nearLayer = nearLayer;
  var MODE = 'space';   // 'ground' 地面仰望（默认幕）/ 'space' 太空视角

  /* 上下文丢失 ≠ 必须刷新：preventDefault 是浏览器允许「稍后自动重建」的前提。
     丢失期间暂停渲染（避免每帧抛错刷屏），等 webglcontextrestored 由 Three 自动重传资源后恢复；
     只有 6 秒内没等到恢复事件，才升级为「请刷新」。 */
  var ctxLost = false, ctxTimer = 0;
  window.__GX_CTX_LOST__ = function () { return ctxLost; };
  canvas.addEventListener('webglcontextlost', function (ev) {
    ev.preventDefault();
    ctxLost = true;
    if (window.GX && GX.softMsg) GX.softMsg('GPU 上下文丢失，正在自动恢复…');
    clearTimeout(ctxTimer);
    ctxTimer = setTimeout(function () {
      if (ctxLost && window.GX && GX.fatal) GX.fatal('GPU 上下文未能自动恢复，请关闭其它占用 GPU 的程序后刷新页面。');
    }, 6000);
  }, false);
  canvas.addEventListener('webglcontextrestored', function () {
    ctxLost = false;
    clearTimeout(ctxTimer);
    /* 渲染器重建上下文后会丢清屏色，默认透明黑会把深蓝星空底变暗。
       清屏色属于渲染状态，必须在恢复事件里重新应用。 */
    renderer.setClearColor(0x030510, 1);
    if (window.GX && GX.clearSoftMsg) GX.clearSoftMsg();
  }, false);

  /* ---------- 星点着色器：星等物理映射 + 衍射星芒 + 光污染门控 ---------- */
  var VS = [
    'attribute float aMag; attribute vec3 aColor;',
    'uniform float uScale; uniform float uPR; uniform float uLimit; uniform float uReal; uniform float uDim; uniform float uMax; uniform float uSpike;',
    'varying vec3 vC; varying float vA; varying float vB;',
    'void main(){ vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0);',
    ' gl_Position=projectionMatrix*mv;',
    ' float lum=pow(2.512,(7.0-aMag)*0.25);',
    // 光污染：超过极限星等的恒星平滑消隐（0.6 星等过渡带，避免生硬 popping）
    ' float vis=1.0-smoothstep(uLimit-0.6,uLimit,aMag);',
    ' if(uReal>0.5 && aMag>uLimit+0.6) vis=0.0;',
    ' gl_PointSize=clamp(lum*uScale,0.7,uMax)*uPR;',
    ' vA=clamp(lum*0.42,0.18,1.0)*vis*uDim;',
    ' vB=clamp((lum-0.95)*0.75,0.0,1.0)*vis*uDim*uSpike; }'
  ].join('\n');
  var FS = [
    'varying vec3 vC; varying float vA; varying float vB;',
    'void main(){',
    ' vec2 q=gl_PointCoord-vec2(0.5);',
    ' float r=length(q); if(r>0.5) discard;',
    ' float core=smoothstep(0.5,0.0,r);',
    ' float a=core*core*vA;',
    ' if(vB>0.004){',
    '   float s1=max(0.0,1.0-abs(q.x)*1.85)*max(0.0,1.0-abs(q.y)*13.0);',
    '   float s2=max(0.0,1.0-abs(q.y)*1.85)*max(0.0,1.0-abs(q.x)*13.0);',
    '   float s3=max(0.0,1.0-abs(q.x-q.y)*1.6)*max(0.0,1.0-abs(q.x+q.y)*15.0);',
    '   float s4=max(0.0,1.0-abs(q.x+q.y)*1.6)*max(0.0,1.0-abs(q.x-q.y)*15.0);',
    '   a+=(s1+s2)*vB*0.85+(s3+s4)*vB*0.30;',
    ' }',
    ' gl_FragColor=vec4(vC,a); }'
  ].join('\n');
  var MATS = [];
  function mat(sc, real, dim, maxSize, spike) {
    var m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: sc }, uPR: { value: renderer.getPixelRatio() }, uLimit: { value: 99 }, uReal: { value: real ? 1 : 0 }, uDim: { value: dim == null ? 1 : dim }, uMax: { value: maxSize || 22 }, uSpike: { value: spike == null ? 1 : spike } },
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    MATS.push(m); return m;
  }

  /* ---------- 近场真实星 + 结构层（分离材质：结构层更暗更小，避免旋臂过曝） ---------- */
  var n = STARS ? STARS.n : 0;
  var nearGeo = null, nearMat = null, nearPts = null, structGeo = null, structMat = null, PICK = null;
  if (STARS) {
    var colBuf = new Float32Array(n * 3), magBuf = new Float32Array(n);
    for (var i = 0; i < n; i++) { bvColor(bvOf(i), colBuf, i * 3); magBuf[i] = magOf(i); }
    nearGeo = new THREE.BufferGeometry();
    nearGeo.setAttribute('position', new THREE.BufferAttribute(STARS.pos.subarray(0, REAL_N * 3), 3));
    nearGeo.setAttribute('aColor', new THREE.BufferAttribute(colBuf.subarray(0, REAL_N * 3), 3));
    nearGeo.setAttribute('aMag', new THREE.BufferAttribute(magBuf.subarray(0, REAL_N), 1));
    nearGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    nearMat = mat(2.6, true);
    nearPts = new THREE.Points(nearGeo, nearMat);
    nearLayer.add(nearPts);
    if (n > REAL_N) {
      structGeo = new THREE.BufferGeometry();
      structGeo.setAttribute('position', new THREE.BufferAttribute(STARS.pos.subarray(REAL_N * 3), 3));
      structGeo.setAttribute('aColor', new THREE.BufferAttribute(colBuf.subarray(REAL_N * 3), 3));
      structGeo.setAttribute('aMag', new THREE.BufferAttribute(magBuf.subarray(REAL_N), 1));
      structGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
      structMat = mat(1.6, false, 0.85);
      nearLayer.add(new THREE.Points(structGeo, structMat));
    }
    // 可拾取亮星子集（只有真实恒星可点选、可溯源）
    var idx = [];
    for (var i2 = 0; i2 < REAL_N; i2++) { if (magBuf[i2] < 5.0) idx.push(i2); }
    if (idx.length > 6000) idx = idx.slice(0, 6000);
    Object.keys(STARS.names).forEach(function (k) { var v = +k; if (idx.indexOf(v) < 0) idx.push(v); });
    var m = idx.length, p = new Float32Array(m * 3), c = new Float32Array(m * 3), g = new Float32Array(m);
    for (var j = 0; j < m; j++) {
      var s3 = idx[j];
      p[j * 3] = STARS.pos[s3 * 3]; p[j * 3 + 1] = STARS.pos[s3 * 3 + 1]; p[j * 3 + 2] = STARS.pos[s3 * 3 + 2];
      c[j * 3] = colBuf[s3 * 3]; c[j * 3 + 1] = colBuf[s3 * 3 + 1]; c[j * 3 + 2] = colBuf[s3 * 3 + 2];
      g[j] = magBuf[s3];
    }
    var gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    gg.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
    gg.setAttribute('aMag', new THREE.BufferAttribute(g, 1));
    gg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    PICK = { pts: new THREE.Points(gg, mat(4.5, true)), idx: idx };
    nearLayer.add(PICK.pts);
  }

  /* 天球背景：方向性远星（程序化示意，不可点选） */
  var skyMat = null;
  (function () {
    var N = 46000, p = new Float32Array(N * 3), c = new Float32Array(N * 3), g = new Float32Array(N), tmp = [0, 0, 0];
    for (var i = 0; i < N; i++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      p[i * 3] = Math.cos(th) * s * SKY_R; p[i * 3 + 1] = u * SKY_R; p[i * 3 + 2] = Math.sin(th) * s * SKY_R;
      bvColor(Math.random() * 1.6 - 0.3, tmp, 0);
      c[i * 3] = tmp[0]; c[i * 3 + 1] = tmp[1]; c[i * 3 + 2] = tmp[2];
      g[i] = 3.2 + Math.pow(Math.random(), 2) * 6.4;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
    geo.setAttribute('aMag', new THREE.BufferAttribute(g, 1));
    skyMat = mat(2.0, false);
    scene.add(new THREE.Points(geo, skyMat));
  })();

  /* ---------- 星云：少、小、低亮度、高饱和（深空的黑必须保住） ---------- */
  var NEBULA = null;
  (function () {
    try {
      var PALS = [[58, 96, 255], [236, 84, 196], [46, 214, 238], [255, 116, 64], [168, 92, 255], [96, 168, 255]];
      function soft(col, peak, mid) {
        var cv = document.createElement('canvas'); cv.width = cv.height = 256;
        var x = cv.getContext('2d');
        var grd = x.createRadialGradient(128, 128, 0, 128, 128, 128);
        grd.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + peak + ')');
        grd.addColorStop(0.26, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + mid + ')');
        grd.addColorStop(0.62, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (mid * 0.24).toFixed(3) + ')');
        grd.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',0)');
        x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
        return new THREE.CanvasTexture(cv);
      }
      function spr(tex, op, size, px, py, pz, sy) {
        var mm = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
        var sp = new THREE.Sprite(mm);
        sp.position.set(px, py, pz); sp.scale.set(size, sy == null ? size : sy, 1);
        return sp;
      }
      var R = RENDER_REF, grp = new THREE.Group(), i, th, rad, tex;
      for (i = 0; i < 5; i++) {
        tex = soft(PALS[i % PALS.length], 0.46, 0.18);
        th = (i / 5) * 6.2832 + 0.7;
        grp.add(spr(tex, 0.44, R * (1.5 + Math.random() * 1.1), Math.cos(th) * R * 2.4, (Math.random() - 0.5) * R * 1.6, Math.sin(th) * R * 2.4));
      }
      for (i = 0; i < 6; i++) {
        tex = soft(PALS[(i + 2) % PALS.length], 0.38, 0.15);
        th = i / 6 * 6.2832; rad = R * (0.45 + Math.random() * 0.95);
        grp.add(spr(tex, 0.34, R * (0.75 + Math.random() * 0.75), Math.cos(th) * rad, (Math.random() - 0.5) * R * 0.09, Math.sin(th) * rad, R * 0.26));
      }
      for (i = 0; i < 5; i++) {
        tex = soft(PALS[i % PALS.length], 0.50, 0.19);
        grp.add(spr(tex, 0.13, R * (0.7 + Math.random() * 0.9), (Math.random() * 2 - 1) * R * 0.6, (Math.random() * 2 - 1) * R * 0.45, (Math.random() * 2 - 1) * R * 0.6));
      }
      scene.add(grp); NEBULA = grp;
    } catch (e) { NEBULA = null; }
  })();

  /* ---------- 银心暖色辉光：银河尺度的视觉焦点（真 3D 位置，随镜头透视） ---------- */
  var GC_SPR = null;
  (function () {
    try {
      var cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var x = cv.getContext('2d');
      var grd = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,214,150,0.85)');
      grd.addColorStop(0.22, 'rgba(255,190,120,0.38)');
      grd.addColorStop(0.55, 'rgba(230,150,90,0.10)');
      grd.addColorStop(1, 'rgba(230,150,90,0)');
      x.fillStyle = grd; x.fillRect(0, 0, 256, 256);
      var mm = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      GC_SPR = new THREE.Sprite(mm);
      GC_SPR.position.set(-R0, 0, 0);
      GC_SPR.visible = false;
      nearLayer.add(GC_SPR);
    } catch (e) { GC_SPR = null; }
  })();

  /* ---------- 太阳系锚点：银河尺度下「你在这里」标记（真 3D 位置=太阳，随镜头透视） ----------
     太阳的 3D 球体在银河尺度被 pfade 淡出（pfade=0），银河幕里太阳系因此不可见；
     此锚点专补这一段，挂在太阳真实位置，近景（logD<0.2）自动淡出。
     观感移植自《星穹智探》宇宙模型那一套：太阳是 G 型暖白恒星，标记走「暖金辉光 + 细定位环 +
     精致双语标签」的优雅路线，去掉原来那圈青色准星（HUD 感太强、与深空氛围相冲）。
     注意：只搬「标记美学」，不搬它的示意旋臂贴图——星阑归序的银河是真星点，叠假螺旋会违背真数据硬约束。 */
  var SOL_ANCHOR = null;
  (function () {
    try {
      var grp = new THREE.Group();
      // 暖金辉光：暖白核心 → 金 → 暖橙渐隐（对齐银心 GC_SPR 的暖色语言，但更聚焦、更小）
      var cv = document.createElement('canvas'); cv.width = cv.height = 128;
      var x = cv.getContext('2d');
      var g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,246,224,0.98)');
      g.addColorStop(0.16, 'rgba(255,214,150,0.60)');
      g.addColorStop(0.42, 'rgba(240,170,95,0.20)');
      g.addColorStop(1, 'rgba(220,140,80,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      glow.scale.set(2.8, 2.8, 1); grp.add(glow);
      // 细定位环：一圈暖金主环 + 一圈更淡的外环，做出层次；无十字准星，优雅不刺眼
      var rc = document.createElement('canvas'); rc.width = rc.height = 128;
      var rx = rc.getContext('2d');
      rx.strokeStyle = 'rgba(255,214,150,0.80)'; rx.lineWidth = 2;
      rx.beginPath(); rx.arc(64, 64, 42, 0, Math.PI * 2); rx.stroke();
      rx.strokeStyle = 'rgba(255,224,170,0.28)'; rx.lineWidth = 1;
      rx.beginPath(); rx.arc(64, 64, 51, 0, Math.PI * 2); rx.stroke();
      var ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(rc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      ring.scale.set(3.6, 3.6, 1); grp.add(ring);
      // 精致双语标签：暖白主标 + 细体英文副标（呼应星穹智探 HOME·EARTH 排版），柔和暖色投影
      var tc = document.createElement('canvas'); tc.width = 512; tc.height = 112;
      var tx = tc.getContext('2d');
      tx.textAlign = 'center';
      tx.shadowColor = 'rgba(255,190,120,0.55)'; tx.shadowBlur = 10;
      tx.font = '600 38px "Microsoft YaHei", sans-serif'; tx.textBaseline = 'middle';
      tx.fillStyle = 'rgba(255,240,214,0.98)'; tx.fillText('太阳系 · 你在这里', 256, 40);
      tx.shadowBlur = 0;
      tx.font = '300 16px "Segoe UI", "Microsoft YaHei", sans-serif';
      tx.fillStyle = 'rgba(255,224,180,0.62)'; tx.fillText('HOME · SOLAR SYSTEM', 256, 78);
      var label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tc), transparent: true, depthWrite: false, depthTest: false }));
      label.scale.set(5.6, 1.225, 1); label.position.set(0, 3.0, 0); grp.add(label);
      grp.position.set(0, 0, 0); grp.visible = false;
      nearLayer.add(grp); SOL_ANCHOR = grp;
      SOL_ANCHOR._mats = [glow.material, ring.material, label.material];
    } catch (e) { SOL_ANCHOR = null; }
  })();

  /* ---------- 行星：J2000 轨道要素 + 每帧开普勒解算 ---------- */
  window.PLANETS = [
    { zh: '水星', en: 'Mercury', a: 0.38710, P: 87.97, L0: 252.25, e: 0.2056, w: 77.46, c: [0.72, 0.70, 0.68], d: 4879, m: 0.5, spr: 0.72, rotH: 1407.6 },
    { zh: '金星', en: 'Venus', a: 0.72333, P: 224.70, L0: 181.98, e: 0.0068, w: 131.53, c: [1.00, 0.90, 0.62], d: 12104, m: 0.2, spr: 1.02, rotH: -5832.5 },
    { zh: '地球', en: 'Earth', a: 1.00000, P: 365.256, L0: 100.46, e: 0.0167, w: 102.94, c: [0.40, 0.62, 1.00], d: 12742, m: 0.4, spr: 1.00, rotH: 23.93 },
    { zh: '火星', en: 'Mars', a: 1.52371, P: 686.98, L0: 355.43, e: 0.0934, w: 336.04, c: [1.00, 0.52, 0.36], d: 6779, m: 0.6, spr: 0.85, rotH: 24.62 },
    { zh: '木星', en: 'Jupiter', a: 5.20289, P: 4332.59, L0: 34.40, e: 0.0484, w: 14.73, c: [0.95, 0.82, 0.62], d: 139820, m: -0.4, spr: 2.30, rotH: 9.93 },
    { zh: '土星', en: 'Saturn', a: 9.53668, P: 10759.2, L0: 49.95, e: 0.0539, w: 92.60, c: [0.96, 0.88, 0.62], d: 116460, m: 0.5, spr: 1.95, ring: true, rotH: 10.7 },
    { zh: '天王星', en: 'Uranus', a: 19.1892, P: 30688.5, L0: 313.24, e: 0.0473, w: 170.95, c: [0.66, 0.85, 0.92], d: 50724, m: 1.6, spr: 1.45, rotH: -17.2 },
    { zh: '海王星', en: 'Neptune', a: 30.0699, P: 60182, L0: 304.88, e: 0.0086, w: 44.97, c: [0.42, 0.55, 0.95], d: 49244, m: 2.2, spr: 1.42, rotH: 16.1 },
    { zh: '月球', en: 'Moon', isMoon: true, ref: 2, a: 0.002570, P: 27.321661, L0: 218.316, e: 0.0549, w: 83.35, wdot: 0.111403, c: [0.73, 0.73, 0.76], d: 3474.8, m: -12.6, spr: 0.55, rotH: 655.7 }
  ];
  var PLANETS = window.PLANETS;
  var J2000MS = Date.UTC(2000, 0, 1, 12);
  /* 默认 1 小时/秒：1 天/秒 时水星 88 天只要 88 秒就转完，轨道成了「转圈动画」，看不出位置关系。
     面板高亮哪一枚由下面的 simSpeed() 读数决定，这里改初值不需要另改一处。 */
  var SIM_MS = Date.now(), SIM_SPEED = 3600, SIM_PAUSED = false;
  window.simDays = function () { return (SIM_MS - J2000MS) / 86400000; };
  window.setSimSpeed = function (v) { SIM_SPEED = v; };
  /* 当前档位的唯一事实源：面板要用它决定高亮哪一枚，避免「显示 1小时/秒、实际跑 1天/秒」 */
  window.simSpeed = function () { return SIM_SPEED; };
  window.setSimPaused = function (v) { SIM_PAUSED = !!v; };
  window.setSimNow = function () { SIM_MS = Date.now(); };
  window.simClock = function () { return new Date(SIM_MS).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'; };

  function keplerXY(p, days) {
    var L = p.L0 + 360 * days / p.P;
    var w = p.w + (p.wdot || 0) * days;
    var M = ((L - w) * Math.PI / 180) % (6.283185307179586), e = p.e, E = M, it;
    for (it = 0; it < 6; it++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    var nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
    var r = p.a * (1 - e * Math.cos(E));
    var lam = nu + w * Math.PI / 180;
    return [r * Math.cos(lam), r * Math.sin(lam)];
  }
  function bodyCenter(p) {
    if (p.isMoon && PLANETS[p.ref] && PLANETS[p.ref].pos) { var q = PLANETS[p.ref].pos; return [q[0], q[1], q[2]]; }
    return [0, 0, 0];
  }
  var PLANET_BUF = null, MOON_RING_ATTR = null;
  window.updateBodies = function (days) {
    PLANETS.forEach(function (p, i) {
      var c = bodyCenter(p), xy = keplerXY(p, days);
      var X = c[0] + xy[0] * AU2PC, Y = c[1] + xy[1] * Math.cos(OBLIQ) * AU2PC, Z = c[2] + xy[1] * Math.sin(OBLIQ) * AU2PC;
      p.pos = [X, Y, Z];
      if (PLANET_BUF) { var a = PLANET_BUF.array; a[i * 3] = X; a[i * 3 + 1] = Y; a[i * 3 + 2] = Z; }
    });
    if (MOON_RING_ATTR) {
      var pm = PLANETS[8], cm = bodyCenter(pm), am = MOON_RING_ATTR.array, SEG = 160;
      for (var k = 0; k <= SEG; k++) {
        var nu = k / SEG * Math.PI * 2, r = pm.a * (1 - pm.e * pm.e) / (1 + pm.e * Math.cos(nu));
        var ang = nu + pm.w * Math.PI / 180, ex = r * Math.cos(ang), ey = r * Math.sin(ang);
        am[k * 3] = cm[0] + ex * AU2PC; am[k * 3 + 1] = cm[1] + ey * Math.cos(OBLIQ) * AU2PC; am[k * 3 + 2] = cm[2] + ey * Math.sin(OBLIQ) * AU2PC;
      }
      MOON_RING_ATTR.needsUpdate = true;
    }
    if (PLANET_BUF) PLANET_BUF.needsUpdate = true;
  };
  var updateBodies = window.updateBodies;

  /* planets3d.js 契约占位：本作不使用平面贴片，全部为真 3D 球体 */
  window.PLANET_SPR = []; window.SOL_SPR = null; window.SEL_RING = null;
  window.ballTex = function () { var cv = document.createElement('canvas'); cv.width = cv.height = 2; return cv; };
  var RINGS = [];
  var planetPts = null;
  (function buildBodies() {
    var pos = new Float32Array(PLANETS.length * 3), col = new Float32Array(PLANETS.length * 3), mg = new Float32Array(PLANETS.length);
    PLANETS.forEach(function (p, i) { col[i * 3] = p.c[0]; col[i * 3 + 1] = p.c[1]; col[i * 3 + 2] = p.c[2]; mg[i] = p.m; });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aMag', new THREE.BufferAttribute(mg, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    planetPts = new THREE.Points(geo, mat(14, false, null, 9, 0));
    nearLayer.add(planetPts);
    PLANET_BUF = geo.attributes.position;
    PLANETS.forEach(function (p, idx) {
      var SEG = 160, rp = new Float32Array((SEG + 1) * 3);
      for (var k = 0; k <= SEG; k++) {
        var nu = k / SEG * Math.PI * 2, r = p.a * (1 - p.e * p.e) / (1 + p.e * Math.cos(nu));
        var ang = nu + p.w * Math.PI / 180, ex = r * Math.cos(ang), ey = r * Math.sin(ang);
        rp[k * 3] = ex * AU2PC; rp[k * 3 + 1] = ey * Math.cos(OBLIQ) * AU2PC; rp[k * 3 + 2] = ey * Math.sin(OBLIQ) * AU2PC;
      }
      var rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
      if (p.isMoon) MOON_RING_ATTR = rg.attributes.position;
      var ln = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: 0x39445e, transparent: true, opacity: 0.42 }));
      nearLayer.add(ln);
      RINGS.push({ line: ln, rAU: p.a });
    });
    updateBodies(window.simDays());
  })();

  /* ---------- 相机状态与连续运镜（时间基准，帧率无关） ---------- */
  window.logD = -3.32; window.az = 0.6; window.el = 0.35;
  var target = new THREE.Vector3(0, 0, 0), tgtDist = 0;
  window.curTarget = null;
  var FLIGHT = null;
  function easeInOutCubic(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function angLerp(a, b, u) { var d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * u; }

  /* flyTo({logD,az,el,target:[x,y,z],dur}) —— 唯一的运镜入口，禁止瞬移 */
  function flyTo(o) {
    o = o || {};
    /* 任何未声明 follow 的运镜，都必须先解除行星跟随；
       否则每帧跟随逻辑会把注视点覆盖回行星，飞向星空的镜头全部落空 */
    if (typeof o.follow !== 'number') curTarget = null;
    var d1 = (typeof o.logD === 'number') ? Math.max(D_MIN, Math.min(D_MAX, o.logD)) : logD;
    var a1 = (typeof o.az === 'number') ? o.az : az;
    var e1 = (typeof o.el === 'number') ? Math.max(-1.53, Math.min(1.53, o.el)) : el;
    var p1 = o.target ? new THREE.Vector3(o.target[0], o.target[1], o.target[2]) : target.clone();
    /* 终点≈当前机位（已经站在地球上又点了一次「地球」）就别起飞：
       这趟空飞画面一格都不动，却要占住 2.4 秒的运镜锁，用户读作「点了没反应/卡死」。
       落位本身仍然生效（跟随关系照常建立），所以只是把没有位移的那段动画省掉。 */
    var da = (a1 - az) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(d1 - logD) < 5e-3 && Math.abs(da) < 1e-3 && Math.abs(e1 - el) < 1e-3 &&
        p1.distanceTo(target) <= Math.max(1e-6, p1.length()) * 1e-3) {
      FLIGHT = null;
      if (typeof o.follow === 'number') curTarget = { kind: 'planet', pi: o.follow };
      return;
    }
    FLIGHT = {
      t0: performance.now(), dur: Math.max(600, o.dur || 2400),
      d0: logD, d1: d1,
      a0: az, a1: a1,
      e0: el, e1: e1,
      p0: target.clone(),
      p1: p1,
      follow: (typeof o.follow === 'number') ? o.follow : null
    };
  }
  function cancelFlight() { FLIGHT = null; }

  /* ---------- 交互：拖动 / 滚轮 / 点选 ---------- */
  var drag = { on: false, x: 0, y: 0, sx: 0, sy: 0, armed: false };
  canvas.addEventListener('pointerdown', function (e) {
    drag.on = true; drag.armed = true;
    drag.x = e.clientX; drag.y = e.clientY; drag.sx = e.clientX; drag.sy = e.clientY;
    if (MODE !== 'ground') cancelFlight();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointerup', function (e) {
    drag.on = false;
    if (Math.abs(e.clientX - drag.sx) > 4 || Math.abs(e.clientY - drag.sy) > 4) drag.armed = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag.on) return;
    if (MODE === 'ground') {
      if (window.GROUND) GROUND.look(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY; return;
    }
    az -= (e.clientX - drag.x) * 0.0042;
    el = Math.max(-1.53, Math.min(1.53, el + (e.clientY - drag.y) * 0.0042));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (MODE === 'ground') { if (window.GROUND) GROUND.zoom(e.deltaY); return; }
    cancelFlight();
    logD = Math.max(D_MIN, Math.min(D_MAX, logD + e.deltaY * 0.0022));
  }, { passive: false });

  var _pv = new THREE.Vector3();
  function screenPos(x, y, z, out) {
    _pv.set(x, y, z).applyMatrix4(nearLayer.matrixWorld).project(camera);
    if (!isFinite(_pv.x) || _pv.z < -1 || _pv.z > 1) return false;
    out.x = (_pv.x + 1) * 0.5 * window.innerWidth;
    out.y = (1 - _pv.y) * 0.5 * window.innerHeight;
    return out.x > -60 && out.x < window.innerWidth + 60 && out.y > -60 && out.y < window.innerHeight + 60;
  }
  window.screenPos = screenPos;

  /* 拾取：鼠标点击与手势「指住」共用同一套逻辑。
     近了先找行星/太阳，再找真实恒星；返回 null 表示没指到任何东西。 */
  function pickAt(mx, my) {
    var sp = { x: 0, y: 0 }, best = null, bestD = 1e9, pi, P, dx, dy, d;
    if (logD < -1.8) {
      for (pi = 0; pi < PLANETS.length; pi++) {
        P = PLANETS[pi].pos; if (!P || !screenPos(P[0], P[1], P[2], sp)) continue;
        dx = sp.x - mx; dy = sp.y - my; d = Math.sqrt(dx * dx + dy * dy);
        if (d < 44 && d < bestD) { bestD = d; best = { kind: 'planet', pi: pi }; }
      }
      if (screenPos(0, 0, 0, sp)) {
        dx = sp.x - mx; dy = sp.y - my; d = Math.sqrt(dx * dx + dy * dy);
        if (d < 48 && d < bestD) { bestD = d; best = { kind: 'sol' }; }
      }
    }
    if (!best && PICK) {
      var lim = PICK.idx.length, bd = 14 * 14, bi = -1;
      for (var i = 0; i < lim; i++) {
        var s3 = PICK.idx[i];
        if (!screenPos(STARS.pos[s3 * 3], STARS.pos[s3 * 3 + 1], STARS.pos[s3 * 3 + 2], sp)) continue;
        var ddx = sp.x - mx, ddy = sp.y - my, dd = ddx * ddx + ddy * ddy;
        if (dd < bd) { bd = dd; bi = s3; }
      }
      if (bi >= 0) best = { kind: 'star', i: bi };
    }
    return best;
  }
  window.pickAt = pickAt;

  canvas.addEventListener('click', function (e) {
    if (!drag.armed) return;          // 只接受“真的按下去过”的点击，合成点击不得触发拾取
    drag.armed = false;
    if (MODE === 'ground') {
      var g = window.GROUND ? GROUND.pick(e.clientX, e.clientY) : null;
      if (g && window.GX && GX.onSelect) GX.onSelect(g);
      return;
    }
    if (Math.abs(e.clientX - drag.sx) > 4 || Math.abs(e.clientY - drag.sy) > 4) return;
    var best = pickAt(e.clientX, e.clientY);
    if (best && window.GX && GX.onSelect) GX.onSelect(best);
  });

  /* ---------- 光污染：极限星等门控 ---------- */
  /* Bortle 1(荒野暗空)→9(市中心) 对应肉眼极限星等（通行近似值） */
  var BORTLE_LIMIT = [7.6, 7.1, 6.6, 6.1, 5.6, 5.1, 4.6, 4.1, 3.5];
  var BORTLE = 1;
  var galVis = 1;   /* 银河/深空天体的整体可见度 0..1，由 Bortle 决定 */
  function setBortle(b) {
    BORTLE = Math.max(1, Math.min(9, Math.round(b)));
    var lim = BORTLE_LIMIT[BORTLE - 1];
    for (var i = 0; i < MATS.length; i++) {
      if (MATS[i].uniforms.uReal.value > 0.5) MATS[i].uniforms.uLimit.value = lim;
    }
    if (skyMat) skyMat.uniforms.uLimit.value = lim;    // 天球背景示意星同样受光害门控
    /* 银河（结构层）清晰度：宇宙幕是「上帝视角」，看的是银河本体而非透过城市大气的肉眼天空，
       故结构层常显（学 AstroVerse 的全亮银河），缩放才有意义；光害的物理隐没留在地面幕。
       galVis 仍作为肉眼银河可见度指标供地面叙事/数据可视化使用。 */
    galVis = Math.max(0, Math.min(1, (lim - 4.0) / 3.0));
    if (structMat) structMat.uniforms.uDim.value = 0.85;
    if (NEBULA) NEBULA.visible = true;
    if (window.GROUND) GROUND.setBortle(BORTLE, lim);
    if (window.GX && GX.onBortle) GX.onBortle(BORTLE, lim);
  }
  window.setBortle = setBortle;

  /* 可见星统计（数据可视化模块的数据源，全部来自真实星表） */
  var VIS_BANDS = null;
  function visStats() {
    if (!VIS_BANDS) {
      var out = [];
      for (var b = 0; b < 9; b++) {
        var lim = BORTLE_LIMIT[b], cnt = 0;
        for (var i = 0; i < REAL_N; i++) { if (magOf(i) <= lim) cnt++; }
        out.push({ bortle: b + 1, limit: lim, visible: cnt });
      }
      VIS_BANDS = out;
    }
    return { total: REAL_N, bands: VIS_BANDS, current: BORTLE };
  }

  /* ---------- 星官高亮：金线连真实恒星 ---------- */
  var HL = { lines: [], dots: null, labels: [] };
  function clearHighlight() {
    HL.lines.forEach(function (l) { nearLayer.remove(l); l.geometry.dispose(); l.material.dispose(); });
    HL.lines = [];
    if (HL.dots) { nearLayer.remove(HL.dots); HL.dots.geometry.dispose(); HL.dots.material.dispose(); HL.dots = null; }
    /* HL.labels 里存的是 { el, i }，不是 DOM 本身：早先把对象当元素用，
       el.parentNode 恒为 undefined → 星名节点从未被删除，每进一次「意象归天」就永久叠一层。 */
    HL.labels.forEach(function (lb) {
      var el = lb && lb.el;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    HL.labels = [];
    /* 兜底清掉历史遗留的孤儿（地面标记 .glabel 不在此列） */
    var layer = document.getElementById('labels');
    if (layer) {
      var stray = layer.querySelectorAll('.star-label:not(.glabel)');
      for (var si = 0; si < stray.length; si++) stray[si].parentNode.removeChild(stray[si]);
    }
  }
  /* stars: [index,...]  pairs: [[i,j],...]  names: {index:label} */
  function highlight(cfg) {
    clearHighlight();
    if (!STARS) return;
    var lm = new THREE.LineBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.85 });
    (cfg.pairs || []).forEach(function (pr) {
      var a = pr[0], b = pr[1];
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        STARS.pos[a * 3], STARS.pos[a * 3 + 1], STARS.pos[a * 3 + 2],
        STARS.pos[b * 3], STARS.pos[b * 3 + 1], STARS.pos[b * 3 + 2]
      ]), 3));
      var ln = new THREE.Line(geo, lm);
      nearLayer.add(ln); HL.lines.push(ln);
    });
    var ids = cfg.stars || [];
    if (ids.length) {
      var p = new Float32Array(ids.length * 3), c = new Float32Array(ids.length * 3), g = new Float32Array(ids.length);
      ids.forEach(function (v, j) {
        p[j * 3] = STARS.pos[v * 3]; p[j * 3 + 1] = STARS.pos[v * 3 + 1]; p[j * 3 + 2] = STARS.pos[v * 3 + 2];
        c[j * 3] = 1; c[j * 3 + 1] = 0.85; c[j * 3 + 2] = 0.5; g[j] = -1.2;
      });
      var geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      geo.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
      geo.setAttribute('aMag', new THREE.BufferAttribute(g, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
      HL.dots = new THREE.Points(geo, mat(6, false));
      nearLayer.add(HL.dots);
    }
    var layer = document.getElementById('labels');
    if (layer && cfg.names) {
      Object.keys(cfg.names).forEach(function (k) {
        var el = document.createElement('div');
        el.className = 'star-label';
        el.textContent = cfg.names[k];      // 语料为本地冻结数据，仍坚持 textContent
        layer.appendChild(el);
        HL.labels.push({ el: el, i: +k });
      });
    }
  }
  window.highlightStars = highlight;
  window.clearHighlight = clearHighlight;

  /* ---------- 主循环 ---------- */
  var last = performance.now(), frames = 0, tAcc = 0, fps = 0;
  var SUN_DIST = (function () {
    var arr = [];
    if (STARS) for (var i = 0; i < STARS.n; i++) {
      var x = STARS.pos[i * 3], y = STARS.pos[i * 3 + 1], z = STARS.pos[i * 3 + 2];
      arr.push(Math.sqrt(x * x + y * y + z * z));
    }
    arr.sort(function (a, b) { return a - b; });
    return arr;
  })();
  function countBelow(cutoff) {
    var lo = 0, hi = SUN_DIST.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (SUN_DIST[mid] <= cutoff) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (window.GROUND) GROUND.resize(w, h);
  }
  window.addEventListener('resize', resize); resize();

  function tick(now) {
    requestAnimationFrame(tick);
    var dt = now - last; if (!isFinite(dt) || dt < 0) dt = 0; if (dt > 100) dt = 100; last = now;

    /* 连续运镜 —— 放在幕别与上下文检查之前，每一帧都推进。
       原来这段在地面幕分支的 return 之后：只要有一趟运镜是在「已经切到地面幕」之后发出来的，
       它就永远走不完，state().flying 恒真，手势层的运镜锁跟着把之后所有点按永久封死
       ——用户看到的正是「点了、提示了、画面再也不动」。片头收尾就是这个时序：
       endIntro() 立刻清 __SIDERA_INTRO__（导航栏因此现身、可以按了），
       约 950ms 之后才 GX.setMode('ground')（app.js:1614 / 1628）。
       这里全是纯数学（改 logD/az/el/target），不碰 GL 对象，先算后渲染没有副作用。 */
    if (FLIGHT) {
      var u = Math.min(1, (now - FLIGHT.t0) / FLIGHT.dur), e = easeInOutCubic(u);
      logD = FLIGHT.d0 + (FLIGHT.d1 - FLIGHT.d0) * e;
      az = angLerp(FLIGHT.a0, FLIGHT.a1, e);
      el = FLIGHT.e0 + (FLIGHT.e1 - FLIGHT.e0) * e;
      target.lerpVectors(FLIGHT.p0, FLIGHT.p1, e);
      if (u >= 1) { var f = FLIGHT.follow; FLIGHT = null; if (f != null) curTarget = { kind: 'planet', pi: f }; }
    }
    /* 跟随行星：注视点同步其真实轨道位置 */
    if (curTarget && curTarget.kind === 'planet') {
      var tp = PLANETS[curTarget.pi].pos;
      if (tp) { target.set(tp[0], tp[1], tp[2]); }
    }
    tgtDist = target.length();
    /* planets3d.js 的聚焦取景需要这个距离；它读的是全局名，必须显式导出 */
    window.tgtDist = tgtDist;

    if (ctxLost) return;   // 上下文丢失期间不渲染，等自动恢复；避免每帧抛错

    /* 地面仰望：独立场景与相机，共用同一个渲染器 */
    if (MODE === 'ground') {
      if (window.GROUND) {
        try { GROUND.update(now, dt); GROUND.render(renderer); } catch (err) {
          if (!window.__GX_RENDER_ERR__) { window.__GX_RENDER_ERR__ = true; if (window.GX && GX.fatal) GX.fatal('地面渲染异常：' + (err && err.message ? err.message : err)); }
        }
        if (window.WARP && WARP.active()) { try { WARP.update(now); WARP.render(renderer); } catch (e2) { WARP.finish(); } }
      }
      frames++; tAcc += dt;
      if (tAcc >= 500) { fps = Math.round(frames * 1000 / tAcc); frames = 0; tAcc = 0; }
      return;
    }

    var d = Math.pow(10, logD), s = RENDER_REF / d;
    nearLayer.scale.setScalar(s);
    nearLayer.position.copy(target).multiplyScalar(-s);
    if (nearGeo) {
      var cutoff = Math.min(Math.max(d * CULL_FACTOR, tgtDist * 1.5), 2e5);
      var cnt = countBelow(cutoff);
      nearGeo.setDrawRange(0, Math.min(cnt, REAL_N));
      if (structGeo) structGeo.setDrawRange(0, Math.max(0, cnt - REAL_N));
    }

    if (!SIM_PAUSED) SIM_MS += dt * SIM_SPEED;
    updateBodies(window.simDays());

    /* 银河尺度下抬高真实星点尺寸下限，保证星空可见；结构层单独克制 */
    var boost = Math.max(1, Math.min(4.0, 1.35 + 0.38 * logD));
    /* 银河尺度下真实近星簇会叠加成白团：2.4→3.2 淡出至零并隐藏（该尺度由结构层示意银河） */
    var farDim = logD > 2.4 ? Math.max(0, 1 - (logD - 2.4) / 0.8) : 1;
    if (nearMat) {
      nearMat.uniforms.uScale.value = 2.6 * boost;
      nearMat.uniforms.uDim.value = farDim;
    }
    if (nearPts) nearPts.visible = farDim > 0.01;
    /* 亮星拾取子集自带大尺寸材质：银河尺度下会叠成白团，拉远即隐藏（该尺度本就不解析单星） */
    if (PICK) PICK.pts.visible = logD < 2.8;
    /* 行星标记点：太阳系外九点重合于太阳位置，拉远即淡出隐藏 */
    if (planetPts) {
      planetPts.visible = logD < 2.2;
      planetPts.material.uniforms.uDim.value = logD > 1.2 ? Math.max(0, 1 - (logD - 1.2)) : 1;
    }
    if (skyMat) skyMat.uniforms.uDim.value = logD > 3.0 ? Math.max(0.45, 1 - (logD - 3.0) / 3) : 1;
    if (structMat) structMat.uniforms.uScale.value = 1.6 * Math.min(boost, 2.2);
    var k = 0.0625 * d;
    if (GC_SPR) {
      var gfade = Math.max(0, Math.min(1, (logD - 2.2) / 0.8));
      GC_SPR.visible = gfade > 0.01;
      GC_SPR.material.opacity = 0.55 * gfade;
      GC_SPR.scale.setScalar(k * 2.4);
    }
    if (SOL_ANCHOR) {
      /* 片头期间强制隐藏：开幕跑的是 logD 1.02→1.42（>0.2），单靠尺度阈值会把「你在这里」
         压在 星阑归序 标题上。__SIDERA_INTRO__ 由 app.js 控制，片头结束即置 false。 */
      var afade = Math.max(0, Math.min(1, (logD - 0.2) / 1.0)) * (window.__SIDERA_INTRO__ ? 0 : 1);
      SOL_ANCHOR.visible = afade > 0.01;
      if (SOL_ANCHOR.visible) {
        SOL_ANCHOR.scale.setScalar(k);
        for (var ai = 0; ai < SOL_ANCHOR._mats.length; ai++) SOL_ANCHOR._mats[ai].opacity = afade;
      }
    }
    for (var ri = 0; ri < RINGS.length; ri++) {
      var rr = RINGS[ri].rAU * AU2PC;
      RINGS[ri].line.visible = (rr > d * 0.005 && rr < d * 9);
    }

    /* 相机：静止时完全稳定，航行中只做极轻微呼吸（克制，不蹦迪） */
    var cp = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).multiplyScalar(RENDER_REF);
    camera.position.copy(cp);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.fov = 55; camera.near = 1; camera.far = RENDER_REF * 2000;
    camera.updateProjectionMatrix();

    if (NEBULA) { NEBULA.rotation.y += Math.min(dt, 50) * 0.00006; }

    /* 高亮标签投影 */
    if (HL.labels.length) {
      var sp = { x: 0, y: 0 };
      HL.labels.forEach(function (lb) {
        /* 地面幕由 GROUND 自己的相机成像，空间幕的星名投影到这里会变成「钉死的字」 */
        if (MODE === 'ground') { lb.el.style.display = 'none'; return; }
        var i3 = lb.i * 3;
        if (screenPos(STARS.pos[i3], STARS.pos[i3 + 1], STARS.pos[i3 + 2], sp)) {
          lb.el.style.display = 'block';
          /* 贴边钳制：锚星靠近视口边缘时标签不得溢出屏幕 */
          var lw = lb.el.offsetWidth || 80, lh = lb.el.offsetHeight || 16;
          var lx = Math.min(Math.max(6, sp.x + 10), Math.max(6, window.innerWidth - lw - 6));
          /* 顶部 76px 是顶栏的地盘：标签压上去会和「真实恒星 / Bortle」糊成一团 */
          var ly = Math.min(Math.max(76, sp.y - 8), Math.max(76, window.innerHeight - lh - 6));
          lb.el.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(ly) + 'px)';
        } else lb.el.style.display = 'none';
      });
    }

    try { renderer.render(scene, camera); } catch (err) {
      if (!window.__GX_RENDER_ERR__) { window.__GX_RENDER_ERR__ = true; if (window.GX && GX.fatal) GX.fatal('渲染异常：' + (err && err.message ? err.message : err)); }
    }
    if (window.WARP && WARP.active()) { try { WARP.update(now); WARP.render(renderer); } catch (e2) { WARP.finish(); } }
    frames++; tAcc += dt;
    if (tAcc >= 500) { fps = Math.round(frames * 1000 / tAcc); frames = 0; tAcc = 0; }
  }
  requestAnimationFrame(tick);

  /* ---------- 视口平移：面板打开时把主体移入安全区（只改投影矩阵，拾取/标签自动跟随） ---------- */
  function viewPan(dx, dy) {
    var w = window.innerWidth, h = window.innerHeight;
    if ((dx && Math.abs(dx) > 0.5) || (dy && Math.abs(dy) > 0.5)) camera.setViewOffset(w, h, dx || 0, dy || 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  /* ---------- 地面仰望场景（core/ground.js）：人的视角 ---------- */
  if (window.GROUND && STARS) {
    try {
      GROUND.build({
        renderer: renderer, pos: STARS.pos, realN: REAL_N,
        magOf: magOf, bvOf: bvOf, bvColor: bvColor,
        pick: PICK ? { pos: PICK.pts.geometry.attributes.position.array, mag: PICK.pts.geometry.attributes.aMag.array, idx: PICK.idx } : null
      });
    } catch (e) { window.__GROUND_ERR__ = String((e && e.message) || e); }
  }

  /* ---------- 对外 API ---------- */
  window.GX = {
    flyTo: flyTo, cancelFlight: cancelFlight, viewPan: viewPan,
    setMode: function (m) {
      m = (m === 'ground') ? 'ground' : 'space';
      if (m === MODE) return;
      MODE = m; drag.on = false; drag.armed = false;
      if (m === 'space') { viewPan(0, 0); resize(); }
    },
    mode: function () { return MODE; },
    /* 立即落位（不飞行）：开场需要一个已经就位的星际尺度机位 */
    setView: function (o) {
      o = o || {};
      if (typeof o.logD === 'number') logD = Math.max(D_MIN, Math.min(D_MAX, o.logD));
      if (typeof o.az === 'number') az = o.az;
      if (typeof o.el === 'number') el = Math.max(-1.53, Math.min(1.53, o.el));
      if (o.target) target.set(o.target[0], o.target[1], o.target[2]);
      FLIGHT = null;
    },
    groundState: function () { return window.GROUND ? GROUND.state() : null; },
    /* 宇宙幕的「光圈」：绝对视距落位（手势直接给目标值，不累加增量） */
    setLogD: function (v) {
      if (typeof v !== 'number' || !isFinite(v)) return;
      cancelFlight();
      logD = Math.max(D_MIN, Math.min(D_MAX, v));
    },
    /* 绝对方位角（弧度）落位 */
    setAz: function (v) {
      if (typeof v !== 'number' || !isFinite(v)) return;
      cancelFlight();
      window.az = v;
    },
    /* 增量环视：手势「张掌滑动」与鼠标拖拽共用同一手感（az/el 增量，俯仰钳制） */
    rotateBy: function (daz, del) {
      if (typeof daz !== 'number' || !isFinite(daz)) daz = 0;
      if (typeof del !== 'number' || !isFinite(del)) del = 0;
      cancelFlight();
      az += daz;
      el = Math.max(-1.53, Math.min(1.53, el + del));
    },
    pickAt: pickAt,
    setBortle: setBortle, getBortle: function () { return BORTLE; },
    visStats: visStats,
    highlight: highlight, clearHighlight: clearHighlight,
    starPos: function (i) { return [STARS.pos[i * 3], STARS.pos[i * 3 + 1], STARS.pos[i * 3 + 2]]; },
    starInfo: function (i) {
      var nm = STARS.names[i] || null;
      return { i: i, name: nm ? nm.n : null, hip: nm ? nm.hip : null, con: nm ? nm.con : null,
               mag: +magOf(i).toFixed(2), distPc: +Math.sqrt(Math.pow(STARS.pos[i*3],2)+Math.pow(STARS.pos[i*3+1],2)+Math.pow(STARS.pos[i*3+2],2)).toFixed(2) };
    },
    focusStar: function (i, dur) {
      curTarget = null;
      var p = [STARS.pos[i * 3], STARS.pos[i * 3 + 1], STARS.pos[i * 3 + 2]];
      var r = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
      flyTo({ target: p, logD: Math.max(-3.0, Math.min(2.0, Math.log10(Math.max(r * 0.55, 0.4)))), dur: dur || 2600 });
    },
    focusPlanet: function (pi, dur) {
      var p = PLANETS[pi];
      /* 取景距离 = 日心距：planets3d 的跟随球尺寸按 tgtDist 比例膨胀（0.16–0.42），
         取景距离与之一致时，球体在屏幕上恒定约占三成视角，远近都稳定。 */
      var hp = p.pos ? Math.sqrt(p.pos[0] * p.pos[0] + p.pos[1] * p.pos[1] + p.pos[2] * p.pos[2]) : 1e-6;
      flyTo({ target: p.pos, logD: Math.log10(Math.max(hp, 3e-8)), dur: dur || 2600, follow: pi });
    },
    /* 注视点 = 太阳（原点），不是银心：银河幕以太阳系为中心，放大始终围绕太阳系收敛，
       不会漂到别的恒星区；太阳位置另有 SOL_ANCHOR「你在这里」标记保证银河尺度下可见。 */
    galaxyView: function (dur) { curTarget = null; flyTo({ target: [0, 0, 0], logD: 4.5, az: 0.6, el: 0.95, dur: dur || 3000 }); },
    solarView: function (dur) { curTarget = null; flyTo({ target: [0, 0, 0], logD: -4.0, az: az, el: 0.55, dur: dur || 2600 }); },
    state: function () {
      return { logD: logD, az: az, el: el, fps: fps, stars: STARS ? STARS.n : 0, real: REAL_N,
               bortle: BORTLE, mw: galVis, flying: !!FLIGHT, drawn: nearGeo ? nearGeo.drawRange.count : 0,
               anchor: SOL_ANCHOR ? SOL_ANCHOR.visible : false,
               target: curTarget, gl: renderer.getContext().constructor.name };
    },
    canvas: canvas, renderer: renderer, scene: scene, camera: camera,
    onSelect: null, onBortle: null, fatal: null
  };
  setBortle(1);
})();