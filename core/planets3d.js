/* ============================================================================
 * core/planets3d.js —— 主场景真实 3D 行星球体（替换平面圆盘贴片）
 * ----------------------------------------------------------------------------
 * 数据源（诚实标注）：
 *   [DATA SOURCE] Planet textures: Solar System Scope (solarsystemscope.com/textures)
 *                 based on NASA elevation & imagery data — CC BY 4.0 (credited)
 *   本文件只做「把公开纹理贴到 Three.js 球体上」的工程集成，不宣称算法/素材原创。
 *   [MOONS] 卫星轨道周期为真实值（NASA 事实数据）；卫星颜色为程序化近似色，
 *           卫星轨道距离与大小做了显示压缩（真实比例下特写视野无法同框），非真实比例。
 *
 * 架构要点：
 *   1. 球体挂在 nearLayer（与既有行星 Sprite 同一坐标系），每帧位置取 PLANETS[i].pos
 *      （由主循环 updateBodies 的开普勒解算提供），不重复实现轨道。
 *   2. 自持 rAF 循环：本脚本在主 inline 脚本之后加载，其 rAF 回调晚于 tick() 执行，
 *      可安全覆写 PLANET_SPR/SOL_SPR/SEL_RING 的可见性（球体显示时隐藏旧贴片与选中环）。
 *   3. 纹理加载双通道：
 *      - http(s)：直接 THREE.TextureLoader 加载同目录 jpg（高效，无 canvas 中转）。
 *      - file:// ：Chromium 禁止把本地文件上传 WebGL（SecurityError，历史踩坑已验证），
 *        故注入 assets/textures/gen/tex_*.js（base64 data-URL 数据包，同源不污染）。
 *   4. 纹理未就绪时用既有 ballTex(p) 程序化贴图兜底 —— 球体立即可见，纹理到位后热替换。
 *   5. 地球：昼/夜贴图按太阳方向混合（自定义 shader）+ 云层球 + 大气临边辉光 + 15° 经纬
 *      网格 + 太阳直射点标记与 HUD 读数（真实自转/季节推进）；
 *      土星：真实环纹理（RingGeometry 径向 UV 重映射）；
 *      自转：按 PLANETS.rotH（小时）× 模拟天数推进，金星/天王星保留逆自转；
 *      轴倾角：按真实值（天王星 97.8° 侧躺可见）。
 *   6. 卫星系统：火星/木星/土星/天王星/海王星主卫星（真实周期、显示压缩），聚焦行星时
 *      连轨道圈一并显示；地球卫星由 PLANETS 的月球本体承担（显示比例钳制，防吞入）。
 * ==========================================================================*/
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { console.warn('[planets3d] THREE 未加载'); return; }
  if (typeof nearLayer === 'undefined' || typeof PLANETS === 'undefined') {
    console.warn('[planets3d] 场景未就绪'); return;
  }
  if (window.__AV_PLANETS3D__) return;
  window.__AV_PLANETS3D__ = true;

  // 太阳真实半径：696,340 km = 4.654e-3 AU → 2.2544e-8 pc（近景按真实比例显示用）
  var SUN_R_PC = 4.654e-3 / 206264.8;

  var DEG = Math.PI / 180;
  var TEX_HTTP = 'assets/textures/4k/';
  var TEX_GEN = 'assets/textures/gen/';
  var IS_FILE = (location.protocol === 'file:');
  // 少数贴图只有 PNG：JPG 不带 alpha 通道，土星环需要 alpha 才能呈现环缝与半透明层次
  var TEX_EXT = { '2k_saturn_ring_alpha': '.png' };

  /* ---------- 每颗天体的纹理配置与物理参数 ---------- */
  // tilt: 轴倾角(°)；ringIn/ringOut: 土星环相对行星半径倍数
  var CFG = {
    Sun:     { map: '4k_sun',              tilt: 7.25,  basic: true },
    Mercury: { map: '4k_mercury',          tilt: 0.03 },
    Venus:   { map: '4k_venus_atmosphere', tilt: 2.64 },
    Earth:   { map: '4k_earth_daymap', night: '4k_earth_nightmap',
               clouds: '4k_earth_clouds', atmo: [0.30, 0.50, 1.00], tilt: 23.44,
               graticule: false, subsolar: false },
    Mars:    { map: '4k_mars',             tilt: 25.19 },
    Jupiter: { map: '4k_jupiter',          tilt: 3.13 },
    Saturn:  { map: '4k_saturn',           tilt: 26.73, ring: '2k_saturn_ring_alpha', ringIn: 1.24, ringOut: 2.27 },
    Uranus:  { map: '2k_uranus',           tilt: 97.77 },
    Neptune: { map: '2k_neptune',          tilt: 28.32 },
    Moon:    { map: '4k_moon',             tilt: 6.68 }
  };

  /* ---------- 主卫星表（P=公转周期·小时，真实值；ro=显示轨道半径×行星显示半径，
     r=显示半径×行星显示半径 —— 显示压缩，非真实比例，见文件头标注） ---------- */
  var MOONS = {
    Mars:    [ { n: '火卫一 Phobos',   P: 7.66,    r: 0.055, c: 0x9a8f85, ro: 1.9 },
               { n: '火卫二 Deimos',   P: 30.31,   r: 0.045, c: 0xa89a8c, ro: 2.6 } ],
    Jupiter: [ { n: '木卫一 Io',       P: 42.46,   r: 0.100, c: 0xd8c06a, ro: 1.8 },
               { n: '木卫二 Europa',   P: 85.22,   r: 0.090, c: 0xd8d4c8, ro: 2.3 },
               { n: '木卫三 Ganymede', P: 171.71,  r: 0.120, c: 0x9a8d7a, ro: 3.0 },
               { n: '木卫四 Callisto', P: 400.54,  r: 0.110, c: 0x6f665c, ro: 3.9 } ],
    Saturn:  [ { n: '土卫二 Enceladus',P: 32.89,   r: 0.060, c: 0xe8e8ea, ro: 2.9 },
               { n: '土卫四 Rhea',     P: 108.85,  r: 0.070, c: 0xbab5ae, ro: 3.7 },
               { n: '土卫六 Titan',    P: 382.69,  r: 0.120, c: 0xd0a45a, ro: 4.6 } ],
    Uranus:  [ { n: '天卫三 Titania',  P: 208.94,  r: 0.090, c: 0xa8a09a, ro: 2.6 } ],
    Neptune: [ { n: '海卫一 Triton',   P: -141.05, r: 0.100, c: 0xd8ccc8, ro: 2.6 } ]
  };

  /* ---------- 纹理加载器（双通道 + 兜底） ---------- */
  var TEX = {};               // key -> THREE.Texture（就绪后登记）
  var PENDING = {};           // key -> [cb,...]
  var texArmed = false;       // 纹理网络/解码是否已放行（boot 关键路径保护）
  var texQueue = [];          // arm 前登记的 [key, cb]
  var BOOT_T = performance.now();
  function armTextures() {
    if (texArmed) return;
    texArmed = true;
    var q = texQueue; texQueue = [];
    for (var i = 0; i < q.length; i++) requestTex(q[i][0], q[i][1]);
  }
  var maxAniso = 1;
  try { maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy()); } catch (e) {}

  function texReady(key, tex) {
    TEX[key] = tex;
    var q = PENDING[key]; delete PENDING[key];
    for (var i = 0; i < (q || []).length; i++) { try { q[i](tex); } catch (e) {} }
  }
  function whenTex(key, cb) {
    if (TEX[key]) { cb(TEX[key]); return; }
    (PENDING[key] = PENDING[key] || []).push(cb);
  }

  function canvasTexFromImg(img, maxW) {
    var w = img.width, h = img.height;
    if (maxW && w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    var t = new THREE.CanvasTexture(cv);
    t.anisotropy = maxAniso;
    return t;
  }

  function requestTex(key, cb) {
    if (TEX[key]) { cb(TEX[key]); return; }
    /* 启动关键路径只留给地面幕：13 张行星贴图共 15MB，落地是 ground 时不该在 boot 就抢带宽。
       未 arm 前只登记回调；进 space 幕立即 arm，boot 5s 后（片头已退）闲时预取 arm。 */
    if (!texArmed) { texQueue.push([key, cb]); return; }
    whenTex(key, cb);
    if (PENDING[key] && PENDING[key].length > 1) return;   // 已有请求在途
    if (IS_FILE) {
      // file:// 通道：注入 base64 数据包脚本，然后 Image(dataURL) → canvas → CanvasTexture
      loadScript(TEX_GEN + 'tex_' + key + '.js', function () {
        var url = (window.AV_TEX || {})[key];
        if (!url) { console.warn('[planets3d] 数据包缺失:', key); return; }
        var img = new Image();
        img.onload = function () { texReady(key, canvasTexFromImg(img, lowMemCap())); };
        img.onerror = function () { console.warn('[planets3d] dataURL 解码失败:', key); };
        img.src = url;
      });
    } else {
      // http(s) 通道：按扩展名映射加载；低内存设备走 <img>+canvas 降采样
      loadHttpTex(key, false);
    }
  }

  /* http(s) 通道纹理加载
     - 扩展名取自 TEX_EXT，其余默认 .jpg；首个后缀失败时回退另一个。
       避免"后缀不符 → 请求 404 → 回调不触发 → 依赖该回调的网格根本没被创建"
       （土星环就是在回调里建 RingGeometry，此前因此整环消失）
     - deviceMemory<4 的设备改用 <img> → canvas 缩放 → CanvasTexture，
       与 file:// 通道共用 canvasTexFromImg，线上低端设备同样受降采样保护 */
  function loadHttpTex(key, isRetry) {
    var base = TEX_EXT[key] || '.jpg';
    var ext = isRetry ? (base === '.png' ? '.jpg' : '.png') : base;
    var url = TEX_HTTP + key + ext;
    var cap = lowMemCap();
    function fail() {
      if (!isRetry) { loadHttpTex(key, true); return; }
      console.warn('[planets3d] 纹理加载失败:', key, ext);
    }
    if (cap) {
      var img = new Image();
      img.onload = function () { texReady(key, canvasTexFromImg(img, cap)); };
      img.onerror = fail;
      img.src = url;
      return;
    }
    var loader = new THREE.TextureLoader();
    loader.load(url,
      function (t) { t.anisotropy = maxAniso; texReady(key, t); },
      undefined, fail);
  }

  function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = s.onerror = function () { if (cb) { var c = cb; cb = null; c(); } };
    document.head.appendChild(s);
  }
  // 低内存设备把贴图降到 2048，避免 4k 全解压后显存过高（13 张 4k ≈ 460MB）
  //  ① deviceMemory<4：Chromium 系可直接读到（安卓 Chrome/Edge）
  //  ② 移动端 UA：Safari / Firefox 不提供 deviceMemory，iOS 必须靠 UA 兜底；
  //     iPadOS 13+ 的 UA 伪装成 Macintosh，用 maxTouchPoints>1 识别
  function lowMemCap() {
    try {
      if (navigator.deviceMemory && navigator.deviceMemory < 4) return 2048;
      var ua = navigator.userAgent || '';
      var mobile = /Android|iPhone|iPod|iPad|Mobile|HarmonyOS/i.test(ua) ||
                   (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      return mobile ? 2048 : 0;
    } catch (e) { return 0; }
  }

  /* ---------- 光照：太阳点光 + 微环境光（只影响 Lambert/Phong 球体） ---------- */
  var sunLight = new THREE.PointLight(0xfff3dd, 1.45, 0, 0);   // distance=0 → 不衰减
  sunLight.position.set(0, 0, 0);
  nearLayer.add(sunLight);
  nearLayer.add(new THREE.AmbientLight(0x8899bb, 0.40));
  /* 相机补光：聚焦行星时照亮朝向镜头的一面，避免特写只看到漆黑夜半球（「不真实/不明显」根因）。
     挂在 scene（世界空间），每帧移到相机位置；非聚焦时弱补光保证全景行星不致全黑。 */
  var camLight = new THREE.PointLight(0xffffff, 0.22, 0, 0);
  window.scene.add(camLight);

  /* ---------- 地球昼夜混合 shader（贴图热替换 uDay/uNight） ---------- */
  var EARTH_VS = [
    'varying vec2 vUv; varying vec3 vNw; varying vec3 vPw;',
    'void main(){',
    '  vUv=uv;',
    '  vNw=normalize(mat3(modelMatrix)*normal);',
    '  vec4 wp=modelMatrix*vec4(position,1.0); vPw=wp.xyz;',
    '  gl_Position=projectionMatrix*viewMatrix*wp;',
    '}'].join('\n');
  var EARTH_FS = [
    'uniform sampler2D uDay; uniform sampler2D uNight; uniform vec3 uSunDir;',
    'varying vec2 vUv; varying vec3 vNw; varying vec3 vPw;',
    'void main(){',
    '  vec3 N=normalize(vNw); vec3 S=normalize(uSunDir);',
    '  float ndl=dot(N,S);',
    '  float daymix=smoothstep(-0.15,0.25,ndl);',
    '  vec3 day=texture2D(uDay,vUv).rgb*(0.16+1.05*max(ndl,0.0));',
    '  vec3 night=texture2D(uNight,vUv).rgb*1.75;',
    '  vec3 col=mix(night,day,daymix);',
    '  vec3 V=normalize(cameraPosition-vPw);',
    '  float rim=pow(1.0-max(dot(N,V),0.0),3.0);',
    '  col+=vec3(0.25,0.45,0.90)*rim*0.55*(0.25+0.75*daymix);',
    '  gl_FragColor=vec4(col,1.0);',
    '}'].join('\n');

  /* ---------- 经纬网格（15°，挂 mesh 随自转；phi 参数化与 SphereGeometry 贴图对齐） ---------- */
  function buildGraticule() {
    var pts = [], R = 1.006, a, a1, a2, lat, lon, phi, r, y, t1, t2, lo, b;
    for (lat = -75; lat <= 75; lat += 15) {          // 纬线
      phi = (90 - lat) * DEG; r = R * Math.sin(phi); y = R * Math.cos(phi);
      for (a = 0; a < 360; a += 3) {
        a1 = a * DEG; a2 = (a + 3) * DEG;
        pts.push(new THREE.Vector3(r * Math.cos(a1), y, r * Math.sin(a1)),
                 new THREE.Vector3(r * Math.cos(a2), y, r * Math.sin(a2)));
      }
    }
    for (lon = 0; lon < 360; lon += 15) {            // 经线
      lo = lon * DEG;
      for (b = -87; b < 87; b += 3) {
        t1 = (90 - b) * DEG; t2 = (90 - b - 3) * DEG;
        pts.push(new THREE.Vector3(-R * Math.cos(lo) * Math.sin(t1), R * Math.cos(t1), R * Math.sin(lo) * Math.sin(t1)),
                 new THREE.Vector3(-R * Math.cos(lo) * Math.sin(t2), R * Math.cos(t2), R * Math.sin(lo) * Math.sin(t2)));
      }
    }
    var g = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      color: 0x7fd4ff, transparent: true, opacity: 0.26, depthWrite: false }));
  }

  /* ---------- 太阳直射点标记（小亮斑 sprite，挂 mesh 随地表转） ---------- */
  function buildSubsolarMarker() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 64;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,240,190,1)');
    g.addColorStop(0.4, 'rgba(255,215,120,0.85)');
    g.addColorStop(1, 'rgba(255,200,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(cv);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: t, transparent: true, depthWrite: false, depthTest: false, opacity: 0.95 }));
    sp.scale.setScalar(0.30);
    return sp;
  }

  /* ---------- HUD：太阳直射点读数（仅地球特写时显示） ---------- */
  var HUD = null, HUD_TXT = null;
  function buildHud() {
    HUD = document.createElement('div');
    HUD.id = 'av-p3d-hud';
    HUD.style.cssText = 'position:fixed;left:12px;bottom:56px;z-index:60;display:none;' +
      'font:12px/1.7 "Microsoft YaHei",sans-serif;color:#cfe8ff;' +
      'background:rgba(6,14,28,0.72);border:1px solid rgba(120,180,255,0.25);' +
      'border-radius:6px;padding:6px 10px;pointer-events:none;white-space:nowrap;';
    HUD.innerHTML = '<b style="color:#ffd77a">☀ 太阳直射点</b> <span id="av-p3d-hud-txt"></span>' +
      '<div style="opacity:0.6;font-size:11px">经纬网格 15° · 暗侧为夜半球</div>';
    document.body.appendChild(HUD);
    HUD_TXT = HUD.querySelector('#av-p3d-hud-txt');
  }

  /* ---------- 逐天体建球 ---------- */
  var SPH = {};    // en -> {grp, mesh, cfg, planet, curR, moons}
  var EARTH_IDX = -1, MOON_IDX = -1;
  function buildOne(p, en, cfg) {
    var grp = new THREE.Group();
    var tiltG = new THREE.Group();
    // 自转轴 = 黄道法线(0,-sin OBLIQ,cos OBLIQ) 按真实 obliquity(ε) 偏转（绕世界 X）。
    // 场景已在 updateBodies 用 OBLIQ 把黄道面绕 X 轴旋转，黄道法线即上式；等价欧拉角
    // rotation.x = π/2 - ε + OBLIQ。地球 ε=OBLIQ → 轴=(0,0,1)，直射点纬度被约束在 ±23.4° 内
    // （旧写法 rotation.z=-ε 与场景 OBLIQ 双重倾斜，实测直射点 63.6°S 超出物理范围）。
    var _ob = (typeof OBLIQ === 'number') ? OBLIQ : 23.4393 * DEG;
    tiltG.rotation.x = Math.PI / 2 - (cfg.tilt || 0) * DEG + _ob;
    grp.add(tiltG);

    // 兜底材质：既有 ballTex 程序化贴图（球体立即出现，纹理就绪后热替换）
    var fallbackTex = null;
    try { fallbackTex = new THREE.CanvasTexture(ballTex(p)); } catch (e) {}
    var mat;
    if (cfg.basic) {
      mat = new THREE.MeshBasicMaterial({ map: fallbackTex });
    } else {
      mat = new THREE.MeshPhongMaterial({ map: fallbackTex, shininess: 6 });
    }
    var mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
    tiltG.add(mesh);

    var entry = { grp: grp, tiltG: tiltG, mesh: mesh, cfg: cfg, planet: p, curR: 0, moons: [] };

    if (cfg.basic) {
      requestTex(cfg.map, function (t) { mat.map = t; mat.needsUpdate = true; });
    } else if (en === 'Earth') {
      // 地球：昼/夜 shader；纹理未到先用兜底 Phong，两图齐了再切换 shader
      var shMat = new THREE.ShaderMaterial({
        uniforms: {
          uDay: { value: fallbackTex },
          uNight: { value: fallbackTex },
          uSunDir: { value: new THREE.Vector3(1, 0, 0) }
        },
        vertexShader: EARTH_VS, fragmentShader: EARTH_FS
      });
      entry.earthShader = shMat;
      var got = 0;
      requestTex(cfg.map, function (t) { shMat.uniforms.uDay.value = t; if (++got === 2) swapToShader(); });
      requestTex(cfg.night, function (t) { shMat.uniforms.uNight.value = t; if (++got === 2) swapToShader(); });
      function swapToShader() { mesh.material = shMat; }
      // 云层球
      requestTex(cfg.clouds, function (t) {
        var cm = new THREE.MeshLambertMaterial({ map: t, alphaMap: t, transparent: true, opacity: 0.88, depthWrite: false });
        var cl = new THREE.Mesh(new THREE.SphereGeometry(1.014, 48, 32), cm);
        entry.clouds = cl; tiltG.add(cl);
      });
      // 经纬网格 + 太阳直射点标记（挂 mesh：随自转与轴倾角）
      if (cfg.graticule) { entry.graticule = buildGraticule(); mesh.add(entry.graticule); }
      if (cfg.subsolar) { entry.subsolar = buildSubsolarMarker(); mesh.add(entry.subsolar); }
    } else {
      requestTex(cfg.map, function (t) { mat.map = t; mat.needsUpdate = true; });
    }

    // 土星环
    if (cfg.ring) {
      requestTex(cfg.ring, function (t) {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
        var geo = new THREE.RingGeometry(cfg.ringIn, cfg.ringOut, 128, 1);
        var pa = geo.attributes.position, ua = geo.attributes.uv, v3 = new THREE.Vector3();
        for (var i = 0; i < pa.count; i++) {
          v3.fromBufferAttribute(pa, i);
          ua.setXY(i, (v3.length() - cfg.ringIn) / (cfg.ringOut - cfg.ringIn), 0.5);
        }
        ua.needsUpdate = true;
        var rm = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false
        }));
        rm.rotation.x = -Math.PI / 2;
        tiltG.add(rm);
      });
    }

    // 卫星系统（真实周期，显示压缩；轨道在行星赤道面 → 挂 tiltG）
    if (MOONS[en]) {
      MOONS[en].forEach(function (mc) {
        var mm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
          new THREE.MeshLambertMaterial({ color: mc.c }));
        mm.visible = false;
        tiltG.add(mm);
        // 轨道圈
        var op = [];
        for (var a = 0; a < 360; a += 4) {
          op.push(new THREE.Vector3(Math.cos(a * DEG) * mc.ro, 0, Math.sin(a * DEG) * mc.ro));
        }
        var og = new THREE.BufferGeometry().setFromPoints(op);
        var orbit = new THREE.LineLoop(og, new THREE.LineBasicMaterial({
          color: 0x8fb8d8, transparent: true, opacity: 0.30, depthWrite: false }));
        orbit.visible = false;
        tiltG.add(orbit);
        entry.moons.push({ cfg: mc, mesh: mm, orbit: orbit });
      });
    }

    nearLayer.add(grp);
    SPH[en] = entry;
  }

  PLANETS.forEach(function (p, idx) {
    if (p.en === 'Earth') EARTH_IDX = idx;
    if (p.en === 'Moon') MOON_IDX = idx;
    var cfg = CFG[p.en];
    if (cfg) buildOne(p, p.en, cfg);
  });
  // 太阳球体（替换平面辉光贴片的本体部分）
  var SUN3 = null;
  if (CFG.Sun) {
    buildOne({ en: 'Sun', c: [1, 0.9, 0.6], rotH: 609.12 }, 'Sun', CFG.Sun);
    SUN3 = SPH['Sun'];
    SUN3.isSun = true;
  }

  /* 太阳日冕辉光：暖金加色光晕，挂在太阳真实位置（原点）。
     太阳系全景下真实比例的太阳只是轨道中心一个小点，用户反馈「太阳模型太小」——
     用一层柔和的日冕 bloom 让太阳成为画面里最亮的中心恒星，位置仍是真实原点，
     不违背真数据约束（只放大观感，不改坐标）。尺寸随太阳本体逐帧联动，见 frame()。 */
  var SUN_GLOW = null;
  (function () {
    try {
      var cv = document.createElement('canvas'); cv.width = cv.height = 256;
      var x = cv.getContext('2d');
      var g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, 'rgba(255,248,228,0.96)');
      g.addColorStop(0.10, 'rgba(255,226,158,0.70)');
      g.addColorStop(0.26, 'rgba(255,186,96,0.30)');
      g.addColorStop(0.52, 'rgba(242,150,66,0.10)');
      g.addColorStop(1, 'rgba(230,120,44,0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 256);
      var m = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0.95 });
      SUN_GLOW = new THREE.Sprite(m);
      SUN_GLOW.position.set(0, 0, 0);
      SUN_GLOW.visible = false;
      nearLayer.add(SUN_GLOW);
    } catch (e) { SUN_GLOW = null; }
  })();

  if (CFG.Earth && CFG.Earth.subsolar) buildHud();

  /* ---------- 太阳直射点地理坐标（本体系推导，注释含贴图经度对齐） ---------- */
  var _q = null, _v = null;
  function subsolarLatLon(entry) {
    if (!_q) { _q = new THREE.Quaternion(); _v = new THREE.Vector3(); }
    var ep = entry.planet.pos;
    if (!ep) return null;
    // 世界太阳方向 = 地球指向太阳 = -pos；转入 mesh 本地旋转系
    var L = Math.sqrt(ep[0] * ep[0] + ep[1] * ep[1] + ep[2] * ep[2]) || 1;
    _v.set(-ep[0] / L, -ep[1] / L, -ep[2] / L);
    entry.mesh.getWorldQuaternion(_q).invert();
    _v.applyQuaternion(_q);
    // SphereGeometry 顶点参数化：x=-cosφ·sinθ, z=sinφ·sinθ；贴图 u=0 为 180° 经线
    var lat = Math.asin(Math.max(-1, Math.min(1, _v.y))) / DEG;
    var lon = (Math.atan2(_v.z, -_v.x) / DEG) - 180;
    while (lon < -180) lon += 360;
    while (lon > 180) lon -= 360;
    return { lat: lat, lon: lon, v: _v };
  }
  function fmtLat(v) { return Math.abs(v).toFixed(1) + '°' + (v >= 0 ? 'N' : 'S'); }
  function fmtLon(v) { return Math.abs(v).toFixed(1) + '°' + (v >= 0 ? 'E' : 'W'); }

  /* ---------- 每帧同步（注册晚于 tick()，见文件头说明） ---------- */
  function frame() {
    requestAnimationFrame(frame);
    if (typeof logD !== 'number' || typeof PLANET_SPR === 'undefined') return;
    if (!texArmed) {
      /* 判「在太空幕」必须先看片头标志：engine 的 MODE 默认就是 'space'，落地地面幕要等 app.js
         片头退场才 setMode('ground')。只看 mode() 会在 boot 期就把这条判成真，15MB 贴图照样挤进
         启动关键路径。标志 undefined（app.js 还没跑）时保守不放行，只用 60s 看门狗兜底，
         免得 app.js 异常时行星永远拿不到纹理。 */
      var intro = window.__SIDERA_INTRO__, now = performance.now();
      var introGone = intro === false || (intro === undefined && now - BOOT_T > 60000);
      if (introGone) {
        var inSpace = window.GX && GX.mode && GX.mode() === 'space';
        if (inSpace || now - BOOT_T > 5000) armTextures();
      }
    }
    var d = Math.pow(10, logD), k = 0.0625 * d;
    // nearLayer 的世界缩放（=RENDER_REF/d），随 logD 瞬跳；curR 以 pc 逐帧平滑会滞后。
    var sNow = (window.nearLayer && window.nearLayer.scale.x) || 1;
    var fade = Math.max(0, Math.min(1, (-1.9 - logD) / 0.35));
    var compact = Math.max(0, Math.min(1, (logD + 1.6) / 1.2));
    var pfade = fade * (1 - compact);
    // 聚焦某颗行星时，其余行星与太阳照常留在场景中（保持真实太阳系布局），
    // 只把相机与高亮聚焦到目标；平面的行星贴片已全部弃用，不存在双重渲染问题。
    var anyFocus = (typeof curTarget !== 'undefined' && curTarget && curTarget.kind === 'planet');
    if (window.camera) { camLight.position.copy(window.camera.position); camLight.intensity = anyFocus ? 0.9 : 0.22; }
    var simD = (typeof simDays === 'function') ? simDays() : 0;
    var hudData = null;

    // 太阳球体尺寸 = max(远景标记尺度, 真实半径)：
    //   · k*0.55 是「屏幕恒定 2°」的标记尺度，保证银河系尺度下太阳仍是一个可见亮点；
    //   · SUN_R_PC 是太阳真实半径，近景自动接管 —— 相机飞近时太阳会真正变大。
    //   旧写法按 tgtDist 放大：太阳自身恒为原点(tgtDist=0) ⇒ 整段退化成未选中尺寸
    //   （点太阳不放大）；而点过行星后 tgtDist 残留该行星日心距 ⇒ 太阳被吹到占满屏幕。
    if (SUN3) {
      /* 标记尺度必须同时受「视野距离」约束：太阳系全景下 k*0.55 会大于轨道间距，
         使全部天体并成一团。全景下太阳本体钳到 d*0.010（约占水星轨道一圈），
         再叠一层日冕辉光让它成为画面里最亮的中心恒星；贴近时真实半径 SUN_R_PC 自然接管。 */
      var sunGoal = Math.max(Math.min(k * 0.55, d * 0.017), SUN_R_PC);
      SUN3.curR += (sunGoal - SUN3.curR) * 0.12;
      // 世界半径钳制：curR(pc) 平滑滞后 × nearLayer.scale 瞬跳，会在模式切换/变焦瞬间
      // 把旧的大 curR 吹成包裹相机的巨球（满屏）。每帧在世界空间封顶，滞后不再致巨球。
      if (SUN3.curR * sNow > 3.0) SUN3.curR = 3.0 / sNow;
      // 选中环是平面贴片时代的标记：太阳已有真实 3D 球体，环会变成球面上的一圈蓝圈
      // （点太阳飞近特写后尤其明显）。太阳被选中时一律不画环，与行星聚焦同口径。
      if (typeof SEL_RING !== 'undefined' && SEL_RING &&
          typeof curTarget !== 'undefined' && curTarget && curTarget.kind === 'sol') SEL_RING.visible = false;
      SUN3.grp.visible = pfade > 0.01;                 // 太阳改用真实 3D 球体（聚焦行星时也保留）
      if (SUN3.grp.visible) {
        SUN3.grp.scale.setScalar(Math.max(SUN3.curR, 1e-12));
      }
      if (SOL_SPR) SOL_SPR.visible = false;            // 弃用平面辉光贴片，避免与 3D 球体双重渲染
      // 日冕辉光：随本体联动，约为本体 3.2 倍，世界空间封顶 2.4（贴近时不铺满屏）；与太阳同隐显。
      if (SUN_GLOW) {
        SUN_GLOW.visible = pfade > 0.01;
        if (SUN_GLOW.visible) SUN_GLOW.scale.setScalar(Math.min(SUN3.curR * 3.0, 3.4 / sNow));
      }
    }

    for (var en in SPH) {
      var e = SPH[en];
      if (e.isSun) continue;
      var p = e.planet, i = PLANETS.indexOf(p);
      if (!p.pos) { e.grp.visible = false; continue; }
      e.grp.position.set(p.pos[0], p.pos[1], p.pos[2]);

      var follow = (typeof curTarget !== 'undefined' && curTarget &&
                    curTarget.kind === 'planet' && curTarget.pi === i);
      /* 全景下行星尺寸：以「相对大小」为主的标记尺度（k*0.42 项 ≈ 屏幕恒定角径），
         再用 d*0.010 做视野距离钳制。旧值 d*0.0045 把行星压成七八像素的小点，
         用户反馈「所有 3D 模型都太小、鼠标都难点中，何况手势」——这里整体放大到
         约 30–80 像素（气态巨行星明显大于地内行星），保证看得见、点得中。
         位置仍是真实轨道坐标，只放大观感，不违背真数据约束。 */
      var rBase = Math.min(k * (p.spr || 1) * 0.42, d * 0.015 * (p.spr || 1));
      var rGoal = rBase;
      // 聚焦特写放大：无环行星约占五成屏高；土星环外缘达 2.27R，用较小系数保证整环完整入屏。
      if (follow) { var fFac = p.ring ? 0.19 : 0.28, fCap = p.ring ? 0.44 : 0.58; rGoal = Math.min(Math.max(rBase, tgtDist * fFac), tgtDist * fCap); }
      // 月球显示钳制：先定尺寸目标再统一平滑，避免两个平滑目标互相拉扯
      // （曾致月/地半径比卡在 1.75）。真实月地距在特写比例下会落入放大的地球球体内
      // → 推到地球外侧 2.6R、显示半径钳到真实比例 0.27R。
      var moonClamp = false, mSf = 1, mEp = null;
      if (en === 'Moon' && !follow) {
        var eaC = SPH['Earth'];
        if (eaC && eaC.grp.visible) {
          var epC = eaC.planet.pos;
          var rxC = p.pos[0] - epC[0], ryC = p.pos[1] - epC[1], rzC = p.pos[2] - epC[2];
          var distC = Math.sqrt(rxC * rxC + ryC * ryC + rzC * rzC) || 1e-12;
          var minDC = eaC.curR * 2.6;
          if (distC < minDC * 1.02) {
            moonClamp = true; mSf = minDC / distC; mEp = epC;
            rGoal = eaC.curR * 0.27;
          }
        }
      }
      e.curR += (rGoal - e.curR) * 0.12;
      // 世界半径封顶（同太阳）：全景 ≤3.0 世界单位（放大后气态巨行星约占三成屏高）；
      // 聚焦时允许到取景距离的特写系数倍（土星含环取小值）。
      var capW = follow ? Math.max(tgtDist * sNow * (p.ring ? 0.44 : 0.58), 1) : 4.0;
      if (e.curR * sNow > capW) e.curR = capW / sNow;

      // 聚焦某行星时，其余行星与太阳照常留在场景中，保持真实太阳系布局；
      // 平面贴片已全部弃用（只由真实 3D 球体表现），无需再用「隐藏其它行星」消除双重渲染。
      var focusHidden = false;
      var show = pfade > 0.01 && !focusHidden;
      e.grp.visible = show;
      // 行星贴片已弃用（用户方向：留真实 3D 球体，去掉贴片），一律隐藏，仅由真实 3D 球体表现。
      if (i >= 0 && PLANET_SPR[i]) PLANET_SPR[i].visible = false;
      if (!show) continue;

      // 聚焦球体取代选中环（旧环是贴片的选择指示，套在大球上即「双地球」伪影之一）
      if (follow && typeof SEL_RING !== 'undefined' && SEL_RING) SEL_RING.visible = false;

      e.grp.scale.setScalar(Math.max(e.curR, 1e-12));
      // 自转（真实周期；rotH<0 逆行）
      if (p.rotH) e.mesh.rotation.y = ((simD * 24 / p.rotH) % 1) * Math.PI * 2;
      // 地球：太阳方向 uniform + 直射点标记/HUD
      if (e.earthShader) {
        var L = Math.sqrt(p.pos[0] * p.pos[0] + p.pos[1] * p.pos[1] + p.pos[2] * p.pos[2]) || 1;
        var sd = e.earthShader.uniforms.uSunDir.value;
        sd.set(-p.pos[0] / L, -p.pos[1] / L, -p.pos[2] / L);
        // 特写时把太阳方向向相机混合，让昼半球朝向镜头（否则地球只呈现漆黑夜半球，看不出贴图）。
        if (follow && window.camera && window.nearLayer) {
          var pw = window.nearLayer.position;
          var toCam = new THREE.Vector3(
            window.camera.position.x - (pw.x + p.pos[0] * sNow),
            window.camera.position.y - (pw.y + p.pos[1] * sNow),
            window.camera.position.z - (pw.z + p.pos[2] * sNow)).normalize();
          sd.lerp(toCam, 0.6).normalize();
        }
      }
      if (e.graticule) e.graticule.visible = follow;     // 经纬网格仅特写时叠加
      if (e.subsolar) {
        e.subsolar.visible = follow;
        if (follow) {
          var ss = subsolarLatLon(e);
          if (ss) {
            e.subsolar.position.set(ss.v.x * 1.015, ss.v.y * 1.015, ss.v.z * 1.015);
            hudData = { lat: ss.lat, lon: ss.lon };
          }
        }
      }
      // 云层随球慢转（略快于地表，模拟风带）
      if (e.clouds) e.clouds.rotation.y = e.mesh.rotation.y * 1.08;

      // 卫星系统：仅特写该行星时显示（真实周期推进；轨道/大小为显示压缩比例）
      if (e.moons.length) {
        var mShow = follow;
        for (var mi2 = 0; mi2 < e.moons.length; mi2++) {
          var mo = e.moons[mi2];
          mo.mesh.visible = mShow; mo.orbit.visible = mShow;
          if (mShow) {
            var ang = ((simD * 24 / mo.cfg.P) % 1) * Math.PI * 2;
            mo.mesh.position.set(Math.cos(ang) * mo.cfg.ro, 0, -Math.sin(ang) * mo.cfg.ro);
            mo.mesh.scale.setScalar(Math.max(mo.cfg.r, 0.01));
          }
        }
      }

      // 月球：地球可见且月距过近时，位置推到地球外侧 2.6R（尺寸已在上方统一平滑钳定）
      if (moonClamp && mEp) {
        e.grp.position.set(mEp[0] + (p.pos[0] - mEp[0]) * mSf,
                           mEp[1] + (p.pos[1] - mEp[1]) * mSf,
                           mEp[2] + (p.pos[2] - mEp[2]) * mSf);
      }
    }

    // HUD 更新（仅地球特写；状态变化才触碰 DOM）
    if (HUD) {
      var wantHud = !!hudData;
      var disp = wantHud ? 'block' : 'none';
      if (HUD.style.display !== disp) HUD.style.display = disp;
      if (wantHud) {
        var txt = fmtLat(hudData.lat) + ' ' + fmtLon(hudData.lon);
        if (HUD_TXT.textContent !== txt) HUD_TXT.textContent = txt;
      }
    }
  }
  requestAnimationFrame(frame);

  /* ---------- 自检钩子（验收脚本专用，不影响运行） ---------- */
  window.__AV_P3D__ = { SPH: SPH, TEX: TEX, VER: '20261108r',
    texArmed: function () { return texArmed; },
    texQueued: function () { return texQueue.length; },
    stats: function () {
      var n = 0, textured = 0, moons = 0;
      for (var en in SPH) {
        n++;
        var m = SPH[en].mesh.material;
        if ((m.map && m.map.image) || (m.uniforms && m.uniforms.uDay &&
            m.uniforms.uDay.value && m.uniforms.uDay.value.image &&
            m.uniforms.uDay.value.image.width > 256)) textured++;
        moons += SPH[en].moons.length;
      }
      return { spheres: n, textured: textured, moons: moons,
               texKeys: Object.keys(TEX).length,
               bundles: Object.keys(window.AV_TEX || {}).length };
    } };
})();
