/* ============================================================================
 * 星阑归序 · core/ground.js
 * 地面仰望：以人的视角看真实夜空
 *   - HYG J2000 赤道坐标 → 实时恒星时 → 地平坐标（顶点着色器内完成旋转）
 *   - 大气消光：近地平线的星先被吞掉（airmass 近似，非美术调色）
 *   - 银河带：按真实银极/银心取向生成（示意层，全站统一标注）
 *   - 城市光穹与三维天际线：程序化几何，无贴图
 * 安全约定：不读取用户输入；不发起网络请求；不执行动态代码。
 * ==========================================================================*/
(function () {
  'use strict';
  if (typeof THREE === 'undefined') return;

  var R_SKY = 40000, DEG = Math.PI / 180;
  var BORTLE_LIMIT = [7.6, 7.1, 6.6, 6.1, 5.6, 5.1, 4.6, 4.1, 3.5];
  var CITIES = [
    { name: '北京', lat: 39.9042, lon: 116.4074 },
    { name: '上海', lat: 31.2304, lon: 121.4737 },
    { name: '广州', lat: 23.1291, lon: 113.2644 },
    { name: '成都', lat: 30.5728, lon: 104.0668 },
    { name: '哈尔滨', lat: 45.8038, lon: 126.5349 },
    { name: '乌鲁木齐', lat: 43.8256, lon: 87.6168 },
    { name: '拉萨', lat: 29.6520, lon: 91.1721 },
    { name: '三亚', lat: 18.2528, lon: 109.5119 },
    /* 观测者现场手机 GPS 现读值，非城市中心近似——预设卡须与 20261114 17:16 登记的预注册卡同一点 */
    { name: '锦州', lat: 40.8883, lon: 121.0606 }
  ];

  /* ---------- 着色器 ---------- */
  var VS = [
    'attribute float aMag; attribute vec3 aColor;',
    'uniform mat3 uRot; uniform float uR; uniform float uScale; uniform float uPR;',
    'uniform float uLimit; uniform float uExt; uniform float uDim; uniform float uMax;',
    'uniform float uSpike; uniform float uTime; uniform float uTwinkle; uniform float uContrast;',
    'varying vec3 vC; varying float vA; varying float vB;',
    'void main(){',
    '  vC = aColor;',
    '  vec3 eq = normalize(position);',
    '  vec3 dir = uRot * eq;',
    '  float alt = dir.y;',
    '  vec4 mv = modelViewMatrix * vec4(dir * uR, 1.0);',
    '  gl_Position = projectionMatrix * mv;',
    '  float lum = pow(2.512, (7.0 - aMag) * 0.25);',
    // 大气质量近似：alt=90° 时为 1，接近地平线急剧增大
    '  float am = 1.0 / max(alt, 0.018);',
    '  float mEff = aMag + uExt * (am - 1.0);',
    '  float vis = 1.0 - smoothstep(uLimit - 0.6, uLimit, mEff);',
    '  if (alt < 0.004) vis = 0.0;',
    '  float ext = clamp(exp(-(am - 1.0) * 0.055), 0.10, 1.0);',
    '  float tw = 1.0;',
    '  if (uTwinkle > 0.5) {',
    '    float f = exp(-alt * 3.5);',
    '    tw = 1.0 - f * 0.22 * (0.5 + 0.5 * sin(uTime * 2.7 + aMag * 31.0 + position.x * 0.7));',
    '  }',
    '  gl_PointSize = clamp(lum * uScale, 0.7, uMax) * uPR;',
    // uContrast：天光把整片天抬亮后，肉眼对星的反差被压掉——不然市中心的星会跟暗空站点一样锐
    '  vA = clamp(lum * 0.42, 0.18, 1.0) * vis * uDim * ext * tw * uContrast;',
    '  vB = clamp((lum - 0.95) * 0.75, 0.0, 1.0) * vis * uDim * uSpike * ext * tw * uContrast;',
    '}'
  ].join('\n');
  var FS = [
    'varying vec3 vC; varying float vA; varying float vB;',
    'void main(){',
    '  vec2 q = gl_PointCoord - vec2(0.5);',
    '  float r = length(q); if (r > 0.5) discard;',
    '  float core = smoothstep(0.5, 0.0, r);',
    '  float a = core * core * vA;',
    '  if (vB > 0.004) {',
    '    float s1 = max(0.0, 1.0 - abs(q.x) * 1.85) * max(0.0, 1.0 - abs(q.y) * 13.0);',
    '    float s2 = max(0.0, 1.0 - abs(q.y) * 1.85) * max(0.0, 1.0 - abs(q.x) * 13.0);',
    '    float s3 = max(0.0, 1.0 - abs(q.x - q.y) * 1.6) * max(0.0, 1.0 - abs(q.x + q.y) * 15.0);',
    '    float s4 = max(0.0, 1.0 - abs(q.x + q.y) * 1.6) * max(0.0, 1.0 - abs(q.x - q.y) * 15.0);',
    '    a += (s1 + s2) * vB * 0.85 + (s3 + s4) * vB * 0.30;',
    '  }',
    '  gl_FragColor = vec4(vC, a);',
    '}'
  ].join('\n');
  var DOME_VS = [
    'varying vec3 vDir;',
    'void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
  ].join('\n');
  var DOME_FS = [
    'uniform float uGlow; uniform vec3 uCity;',
    'varying vec3 vDir;',
    'void main(){',
    '  vec3 d = normalize(vDir);',
    '  float alt = clamp(d.y, 0.0, 1.0);',
    '  float hor = length(vec3(d.x, 0.0, d.z));',
    '  vec3 hd = hor > 0.0001 ? normalize(vec3(d.x, 0.0, d.z)) : vec3(0.0, 0.0, 1.0);',
    '  float city = pow(max(dot(hd, uCity), 0.0), 1.8);',
    '  float band = exp(-alt * 9.0);',
    '  float broad = exp(-alt * 2.6) * 0.22;',
    // 城市夜空不是「黑底 + 地平线一条光」：整片天都被天光抬起来（Bortle 8 天顶仍然发灰），
    // 否则市中心的星会显得像在暗空站点上，失去「看不见」的直觉
    '  vec3 base = mix(vec3(0.0028, 0.0045, 0.0115), vec3(0.072, 0.061, 0.052), pow(uGlow, 1.1));',
    '  vec3 warm = vec3(1.0, 0.58, 0.30) * uGlow * (band * (0.14 + 0.62 * city) + broad * (0.10 + 0.30 * city)) * 0.62;',
    '  gl_FragColor = vec4(base + warm, 1.0);',
    '}'
  ].join('\n');

  /* ---------- 状态 ---------- */
  var built = false, renderer = null, scene = null, camera = null, pr = 1;
  var rot = new THREE.Matrix3();
  var city = CITIES[0], hours = 22, bortle = 8, lstDeg = 0;
  var yaw = 250 * DEG, pitch = 0.30, fov = 72;
  var yawT = yaw, pitchT = pitch, fovT = fov, aimed = false;
  var tw = 0;
  var starMat = null, mwMat = null, mwHazeMat = null, domeMat = null, markRing = null, markLabel = null;
  var mwObj = null, hazeObj = null;
  var marked = -1;
  var splitOn = false, splitX = 0.5, splitDark = 1;   /* 暗夜分界线：左半「暗夜」/ 右半「此刻」 */
  var pick = null;
  var magOf = null, bvOf = null, bvColor = null;
  var starGeoPos = null, starN = 0, visCache = null;
  var _v = new THREE.Vector3(), _m = new THREE.Matrix3();

  function starMaterial(cfg) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uRot: { value: rot }, uR: { value: R_SKY },
        uScale: { value: cfg.scale }, uPR: { value: pr },
        uLimit: { value: cfg.limit == null ? 4.6 : cfg.limit },
        uExt: { value: cfg.ext == null ? 0.26 : cfg.ext },
        uDim: { value: cfg.dim == null ? 1 : cfg.dim },
        uMax: { value: cfg.max || 22 },
        uSpike: { value: cfg.spike == null ? 1 : cfg.spike },
        uTime: { value: 0 }, uTwinkle: { value: cfg.twinkle == null ? 1 : cfg.twinkle },
        uContrast: { value: 1 }
      },
      vertexShader: VS, fragmentShader: FS, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
  }

  function eqFromRaDec(raDeg, decDeg) {
    var ra = raDeg * DEG, de = decDeg * DEG;
    return new THREE.Vector3(Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de));
  }

  /* 银河带：真实银道坐标（银心 RA 266.405° / Dec −28.936°，北银极 RA 192.859° / Dec 27.128°）
     采样后旋到赤道坐标，因此带子会正确地穿过天鹅—人马一线，而不是穿过北极星。 */
  function buildMilkyWay() {
    var N = 68000;
    var ngp = eqFromRaDec(192.85948, 27.12825);
    var gc = eqFromRaDec(266.4051, -28.9362);
    var xg = gc.clone().addScaledVector(ngp, -gc.dot(ngp)).normalize();
    var yg = new THREE.Vector3().crossVectors(ngp, xg).normalize();
    var zg = ngp.clone();

    var pos = new Float32Array(N * 3), col = new Float32Array(N * 3), mag = new Float32Array(N);
    var hazeN = Math.floor(N / 8);
    var hpos = new Float32Array(hazeN * 3), hcol = new Float32Array(hazeN * 3), hmag = new Float32Array(hazeN);
    var hi = 0;
    for (var i = 0; i < N; i++) {
      var l = Math.random() * Math.PI * 2;
      var bulge = Math.random() < 0.34 + 0.46 * Math.exp(-Math.pow(ang(l, 0) / 1.0, 2));
      var s1 = (Math.random() + Math.random() + Math.random() - 1.5);
      var b = s1 * (bulge ? 0.058 : 0.135);
      var cb = Math.cos(b), sb = Math.sin(b);
      var gx = cb * Math.cos(l), gy = cb * Math.sin(l), gz = sb;
      var ex = xg.x * gx + yg.x * gy + zg.x * gz;
      var ey = xg.y * gx + yg.y * gy + zg.y * gz;
      var ez = xg.z * gx + yg.z * gy + zg.z * gz;
      var il = 1 / Math.sqrt(ex * ex + ey * ey + ez * ez);
      ex *= il; ey *= il; ez *= il;
      var warm = Math.exp(-Math.pow(ang(l, 0) / 0.55, 2));
      var r = 0.70 + 0.22 * warm, g = 0.77 + 0.10 * warm, bb = 0.92 - 0.18 * warm;
      var m = 5.0 + Math.pow(Math.random(), 1.5) * 3.2;
      pos[i * 3] = ex; pos[i * 3 + 1] = ey; pos[i * 3 + 2] = ez;
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = bb;
      mag[i] = m;
      if (i % 8 === 0 && hi < hazeN) {
        hpos[hi * 3] = ex; hpos[hi * 3 + 1] = ey; hpos[hi * 3 + 2] = ez;
        hcol[hi * 3] = r; hcol[hi * 3 + 1] = g; hcol[hi * 3 + 2] = bb;
        hmag[hi] = m; hi++;
      }
    }
    function geo(p, c, m2, n) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p.subarray(0, n * 3), 3));
      g.setAttribute('aColor', new THREE.BufferAttribute(c.subarray(0, n * 3), 3));
      g.setAttribute('aMag', new THREE.BufferAttribute(m2.subarray(0, n), 1));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
      return g;
    }
    mwMat = starMaterial({ scale: 1.9, max: 5, limit: 99, ext: 0.26, dim: 0.9, spike: 0, twinkle: 0 });
    var mw = new THREE.Points(geo(pos, col, mag, N), mwMat);
    mw.renderOrder = -1;
    scene.add(mw);
    mwObj = mw;
    mwHazeMat = starMaterial({ scale: 7.5, max: 26, limit: 99, ext: 0.26, dim: 0.10, spike: 0, twinkle: 0 });
    var mh = new THREE.Points(geo(hpos, hcol, hmag, hi), mwHazeMat);
    mh.renderOrder = -1;
    scene.add(mh);
    hazeObj = mh;
  }
  function ang(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* 三维天际线：合并为一个网格，纯剪影 */
  function buildSkyline() {
    var seed = 20261107;
    function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
    var geos = [], i, n = 96;
    for (i = 0; i < n; i++) {
      var az = i / n * Math.PI * 2 + rnd() * 0.05;
      var near = Math.exp(-Math.pow(ang(az, Math.PI) / 0.9, 2));   // 城市方向（正南）更密更高
      var rad = 22000 + rnd() * 12000 - near * 4000;
      var w = 500 + rnd() * 1100, h = 260 + Math.pow(rnd(), 2) * 1500 + near * 700;
      var d = 400 + rnd() * 900;
      var g = new THREE.BoxGeometry(w, h, d);
      var mt = new THREE.Matrix4().makeTranslation(Math.sin(az) * rad, -30 + h / 2, Math.cos(az) * rad);
      g.applyMatrix4(mt);
      geos.push(g.toNonIndexed());
    }
    var total = 0;
    geos.forEach(function (g) { total += g.attributes.position.count; });
    var pos = new Float32Array(total * 3), off = 0;
    geos.forEach(function (g) {
      pos.set(g.attributes.position.array, off);
      off += g.attributes.position.array.length;
      g.dispose();
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x04050b }));
    scene.add(mesh);
  }

  function build(cfg) {
    if (built) return;
    built = true;
    renderer = cfg.renderer;
    pr = renderer.getPixelRatio();
    magOf = cfg.magOf; bvOf = cfg.bvOf; bvColor = cfg.bvColor;
    pick = cfg.pick || null;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(fov, 1, 1, 200000);

    domeMat = new THREE.ShaderMaterial({
      uniforms: { uGlow: { value: 0.8 }, uCity: { value: new THREE.Vector3(0, 0, -1).normalize() } },
      vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false
    });
    var dome = new THREE.Mesh(new THREE.SphereGeometry(R_SKY, 48, 32), domeMat);
    dome.renderOrder = -2;
    scene.add(dome);

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000),
      new THREE.MeshBasicMaterial({ color: 0x030408 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -30;
    scene.add(ground);
    buildSkyline();
    buildMilkyWay();

    var n = cfg.realN;
    starN = n;
    var p = new Float32Array(n * 3), c = new Float32Array(n * 3), m = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      p[i * 3] = cfg.pos[i * 3]; p[i * 3 + 1] = cfg.pos[i * 3 + 1]; p[i * 3 + 2] = cfg.pos[i * 3 + 2];
      bvColor(bvOf(i), c, i * 3);
      m[i] = magOf(i);
    }
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    sg.setAttribute('aColor', new THREE.BufferAttribute(c, 3));
    sg.setAttribute('aMag', new THREE.BufferAttribute(m, 1));
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    starGeoPos = p;
    starMat = starMaterial({ scale: 2.5, max: 24, limit: 4.6, ext: 0.26, dim: 1, spike: 1, twinkle: 1 });
    var stars = new THREE.Points(sg, starMat);
    stars.renderOrder = 0;
    scene.add(stars);

    markRing = new THREE.Mesh(new THREE.RingGeometry(150, 168, 48),
      new THREE.MeshBasicMaterial({ color: 0xd8b25c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthTest: false }));
    markRing.visible = false;
    markRing.renderOrder = 3;
    scene.add(markRing);

    var layer = document.getElementById('labels');
    if (layer) {
      markLabel = document.createElement('div');
      markLabel.className = 'star-label glabel';
      layer.appendChild(markLabel);
    }
    setBortle(bortle, BORTLE_LIMIT[bortle - 1]);
    setSite(city, hours);
    applyLook();
    resize(window.innerWidth, window.innerHeight);
  }

  /* ---------- 时间 / 地点 ---------- */
  function setSite(c, h) {    if (c) city = c;
    if (typeof h === 'number') hours = h;
    /* 「今夜」= 离此刻最近的那个 18:00 起算的夜。
       旧写法按当前钟点决定是否退一天：上午 9 点打开、滑块停在 22:00 时，
       会把「今夜 22:00」算成昨天 22:00（恒星时差约 1°，整片天的方位都偏了）。 */
    var nowMs = Date.now();
    var city8 = new Date(nowMs + 8 * 3600000);                   // 中国城市统一 UTC+8
    var y = city8.getUTCFullYear(), mo = city8.getUTCMonth(), d = city8.getUTCDate();
    var nowCity = Date.UTC(y, mo, d, city8.getUTCHours(), city8.getUTCMinutes(), city8.getUTCSeconds());
    var anchor = Date.UTC(y, mo, d, 18, 0, 0);
    if (anchor - nowCity > 12 * 3600000) anchor -= 86400000;
    else if (nowCity - anchor > 12 * 3600000) anchor += 86400000;
    var utcMs = anchor + (hours - 18) * 3600000 - 8 * 3600000;   // 城市当地 18:00 锚点 → 真实 UTC
    var dDays = (utcMs - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
    var gmst = (18.697374558 + 24.06570982441908 * dDays) % 24;
    var lst = ((gmst + city.lon / 15) % 24 + 24) % 24;
    lstDeg = lst * 15;
    var th = lstDeg * DEG, ph = city.lat * DEG;
    var st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(ph), cp = Math.cos(ph);
    /* 赤道 → 地平（行：东、天顶、北）
       东 = (−sinθ, cosθ, 0)，天顶 = (cosφcosθ, cosφsinθ, sinφ)，北 = (−sinφcosθ, −sinφsinθ, cosφ)
       早先把 sinθ/cosθ 的位置写反了：北极星（几乎在转轴上）看不出问题，
       其余天体的方位全偏，织女星本该在西北 21°，会被算到地平线下。 */
    rot.set(-st, ct, 0,
            cp * ct, cp * st, sp,
            -sp * ct, -sp * st, cp);
    if (markRing && marked >= 0) placeMark();
    if (!aimed) { aimed = true; aimBand(); }
  }

  /* 观测者站在预设城市之外（老家院子、学校楼顶）时，把经纬度直接交给内核重算。
     换纬度必须重新选默认朝向——银带的最高点随 φ 变，沿用旧城市的 yaw 会把银河甩出画面。 */
  function setPlace(name, lat, lon) {
    lat = +lat; lon = +lon;
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return false;
    city = { name: String(name || (lat.toFixed(2) + '°N ' + lon.toFixed(2) + '°E')), lat: lat, lon: lon };
    aimed = false;
    setSite(city, hours);
    return true;
  }

  /* 默认朝向：银河带在本地地平坐标里的最高点。
     写死方位角（例如 250°）只在某一个时刻好看，换个钟点整条银河就跑到画面外了。 */
  var NGP = eqFromRaDec(192.85948, 27.12825);
  var _n = new THREE.Vector3();
  function aimBand() {
    _n.copy(NGP).applyMatrix3(rot);
    var px = -_n.x * _n.y, py = 1 - _n.y * _n.y, pz = -_n.z * _n.y;   // 天顶在银道面内的投影
    var len = Math.sqrt(px * px + py * py + pz * pz);
    if (len < 1e-6) return;
    /* 别正对银道面最高点：那样银河会成一条贴顶的横带。
       偏开约 30°，银河就从画面一角斜穿下来，底下还留得住城市天际线。 */
    yaw = yawT = Math.atan2(px, pz) + 0.55;
    pitch = pitchT = 0.42;
  }

  /* 只改「天空此刻的亮度」这组 uniform，不动状态。
     分屏对照要在同一帧里用两套亮度各画一遍，所以必须能独立切换。 */
  function paintSky(b, lim) {
    var g = Math.max(0, Math.min(1, (b - 1) / 8));
    var glow = Math.pow(g, 1.1);
    if (domeMat) domeMat.uniforms.uGlow.value = glow;
    if (starMat) {
      starMat.uniforms.uLimit.value = lim;
      starMat.uniforms.uContrast.value = 1 - 0.65 * glow;
    }
    /* 银河只能「整层关掉」，不能只把每点调暗：
       6.8 万个点 + 8500 个大尺寸雾点做加法混合，dim 降到 0.03 依然会叠出一条可见光带
       （实测 Bortle 8 下整条银河还挂在天上）。Bortle 5 之后银河本就不可见。 */
    var galVis = Math.max(0, Math.min(1, (lim - 5.2) / 2.2));
    if (mwMat) mwMat.uniforms.uDim.value = 0.92 * galVis;
    if (mwHazeMat) mwHazeMat.uniforms.uDim.value = 0.11 * galVis;
    var mwOn = galVis > 0.02;
    if (mwObj) mwObj.visible = mwOn;
    if (hazeObj) hazeObj.visible = mwOn;
  }

  function setBortle(b, limit) {
    bortle = Math.max(1, Math.min(9, Math.round(b)));
    paintSky(bortle, typeof limit === 'number' ? limit : BORTLE_LIMIT[bortle - 1]);
  }

  /* ---------- 此刻、此地、地平线以上：真实可见星统计 ---------- */
  var _vs = new THREE.Vector3();
  function visibleStats(limit) {
    if (!built) return null;
    var key = limit.toFixed(2) + '|' + lstDeg.toFixed(3);
    if (visCache && visCache.key === key) return visCache.val;
    var cnt = 0, above = 0;
    for (var i = 0; i < starN; i++) {
      _vs.set(starGeoPos[i * 3], starGeoPos[i * 3 + 1], starGeoPos[i * 3 + 2]).normalize().applyMatrix3(rot);
      if (_vs.y <= 0.01) continue;
      above++;
      var m = magOf(i) + 0.26 * (1 / Math.max(_vs.y, 0.02) - 1);
      if (m <= limit) cnt++;
    }
    var val = { visible: cnt, above: above, total: starN };
    visCache = { key: key, val: val };
    return val;
  }

  /* 某颗真实恒星此刻的方位与可见性（面板诊断、浮签都用它，口径与着色器一致） */
  function whereIs(i) {
    if (!(i >= 0) || i >= starN || !starGeoPos) return null;
    _v.set(starGeoPos[i * 3], starGeoPos[i * 3 + 1], starGeoPos[i * 3 + 2]).normalize().applyMatrix3(rot);
    var alt = Math.asin(Math.max(-1, Math.min(1, _v.y))) / DEG;
    var az = Math.atan2(_v.x, _v.z) / DEG;
    if (az < 0) az += 360;
    var lim = BORTLE_LIMIT[bortle - 1];
    var am = 1 / Math.max(_v.y, 0.02);
    var mEff = magOf(i) + 0.26 * (am - 1);
    return { alt: alt, az: az, mag: magOf(i), mEff: mEff, up: _v.y > 0.01,
             visible: _v.y > 0.01 && mEff <= lim, limit: lim };
  }

  /* ---------- 视角 ---------- */
  function applyLook() {
    if (!camera) return;
    var cp = Math.cos(pitch);
    var dx = Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = Math.cos(yaw) * cp;
    camera.position.set(0, 3, 0);
    camera.up.set(0, 1, 0);
    camera.lookAt(dx * 1000, 3 + dy * 1000, dz * 1000);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  function look(dx, dy) {
    yawT -= dx * 0.0034;
    pitchT = Math.max(-0.42, Math.min(1.47, pitchT + dy * 0.0034));
  }
  function zoom(dy) {
    fovT = Math.max(40, Math.min(88, fovT + dy * 0.02));
  }
  /* 绝对视场：给手势的「光圈」直接落位用。
     逐帧增量累加会被关键点抖动拖着随机游走；绝对落位只跟当前光圈有关，抖不出去。 */
  function setFov(v) {
    if (typeof v !== 'number' || !isFinite(v)) return;
    fovT = Math.max(40, Math.min(88, v));
  }
  /* 绝对水平朝向（度），给手势的「转手」直接用。
     掌心角度是绝对量，所以这里也必须是绝对落位；逐帧累加会让手一停住画面还在漂。 */
  function setYaw(v) {
    if (typeof v !== 'number' || !isFinite(v)) return;
    yawT = v * DEG;
  }

  function placeMark() {
    if (marked < 0 || !markRing) { if (markRing) markRing.visible = false; if (markLabel) markLabel.style.display = 'none'; return; }
    _v.set(starGeoPos[marked * 3], starGeoPos[marked * 3 + 1], starGeoPos[marked * 3 + 2]).normalize().applyMatrix3(rot);
    if (_v.y < 0.01) { markRing.visible = false; if (markLabel) markLabel.style.display = 'none'; return; }
    var p = _v.clone().multiplyScalar(R_SKY * 0.998);
    markRing.position.copy(p);
    markRing.lookAt(0, 0, 0);
    markRing.visible = true;
    if (markLabel) {
      var sp = _v.clone().multiplyScalar(R_SKY).project(camera);
      if (sp.z > 1 || sp.z < -1) { markLabel.style.display = 'none'; return; }
      var x = (sp.x + 1) * 0.5 * window.innerWidth, y = (1 - sp.y) * 0.5 * window.innerHeight;
      /* 星在视野外时不要把它钳到屏幕边缘——那会让人对着空处找标签 */
      if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) { markLabel.style.display = 'none'; return; }
      var lw = markLabel.offsetWidth || 80, lh = markLabel.offsetHeight || 16;
      var lx = Math.min(Math.max(6, x + 14), Math.max(6, window.innerWidth - lw - 6));
      var ly = Math.min(Math.max(76, y - 10), Math.max(76, window.innerHeight - lh - 6));
      markLabel.style.display = 'block';
      markLabel.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(ly) + 'px)';
    }
  }

  function mark(i, text) {
    marked = i;
    if (markLabel) { markLabel.textContent = text || ''; markLabel.style.display = 'none'; }
    placeMark();
  }

  /* 某颗星此刻的屏幕位置与地平坐标：找星玩法据此给「往哪转」的提示 */
  function screenOf(i) {
    if (!built || !camera || i < 0 || i >= starN) return null;
    _v.set(starGeoPos[i * 3], starGeoPos[i * 3 + 1], starGeoPos[i * 3 + 2]).normalize().applyMatrix3(rot);
    var alt = Math.asin(_v.y) / DEG;
    var az = ((Math.atan2(_v.x, _v.z) / DEG) + 360) % 360;
    var q = _v.clone().multiplyScalar(R_SKY).project(camera);
    return {
      x: (q.x + 1) * 0.5 * window.innerWidth,
      y: (1 - q.y) * 0.5 * window.innerHeight,
      z: q.z, front: q.z < 1, alt: alt, az: az
    };
  }

  /* ---------- 拾取：只允许点“此刻真的能看见”的星 ---------- */
  /* 同一天区常有几乎重合的两条条目：HYG 把一颗亮星拆成主/次
     （1024 北河二 与 1064、661 五车二 与 639，角距 0.003°≈ 屏幕上 0.1px）。
     纯按「像素最近」取胜等于抛硬币——点北河二却报出无名、暗一档的 1064，
     圈也跟着圈到那条上，用户读到的就是「我点的是北河二，它圈了别的位置」。
     判据：屏幕距离相差不到 1.5px（肉眼就是同一个点）时，取此刻实际更亮的那条。*/
  var TIE_PX = 1.5;
  function pickStar(mx, my) {
    if (!pick || !camera) return null;
    var lim = BORTLE_LIMIT[bortle - 1], best = null, bd = 26, bm = 99;
    _m.copy(rot);
    for (var j = 0; j < pick.idx.length; j++) {
      var px = pick.pos[j * 3], py = pick.pos[j * 3 + 1], pz = pick.pos[j * 3 + 2];
      _v.set(px, py, pz).normalize().applyMatrix3(_m);
      if (_v.y < 0.03) continue;
      var am = 1 / Math.max(_v.y, 0.02);
      var mEff = pick.mag[j] + 0.26 * (am - 1);
      if (mEff > lim) continue;
      var q = _v.clone().multiplyScalar(R_SKY).project(camera);
      if (q.z < -1 || q.z > 1) continue;
      var sx = (q.x + 1) * 0.5 * window.innerWidth, sy = (1 - q.y) * 0.5 * window.innerHeight;
      var d = Math.hypot(sx - mx, sy - my);
      if (d > bd) {                       /* 更远：只有仍在同一个肉眼点内、且更亮，才换 */
        if (best !== null && d - bd <= TIE_PX && mEff < bm) { bd = d; best = pick.idx[j]; bm = mEff; }
        continue;
      }
      if (bd - d <= TIE_PX) {             /* 与当前优胜几乎同位：比亮度 */
        if (mEff <= bm) { bd = d; best = pick.idx[j]; bm = mEff; }
        continue;
      }
      bd = d; best = pick.idx[j]; bm = mEff;   /* 明显更近：照常取胜 */
    }
    return best == null ? null : { kind: 'star', i: best };
  }

  /* ---------- 每帧 ---------- */
  function update(now, dt) {
    if (!built) return;
    tw += Math.min(dt || 16, 100);
    var t = tw * 0.001;
    yaw += (yawT - yaw) * 0.18;
    pitch += (pitchT - pitch) * 0.18;
    fov += (fovT - fov) * 0.15;
    if (starMat) starMat.uniforms.uTime.value = t;
    if (mwMat) { mwMat.uniforms.uTime.value = t; }
    applyLook();
    placeMark();
    if (markRing && markRing.visible) {
      var s = 1 + 0.06 * Math.sin(t * 2.2);
      markRing.scale.set(s, s, s);
    }
  }
  function render(r) {
    if (!built) return;
    if (!splitOn) { r.render(scene, camera); return; }
    /* 同一台相机、同一片天，只换亮度 —— 两半在接缝处必须严丝合缝，所以不能用两个相机或两张画布。 */
    var w = r.domElement.clientWidth || window.innerWidth;
    var h = r.domElement.clientHeight || window.innerHeight;
    var sx = Math.max(1, Math.min(w - 1, Math.round(w * splitX)));
    r.setScissorTest(true);
    r.setScissor(0, 0, sx, h);
    paintSky(splitDark, BORTLE_LIMIT[splitDark - 1]);
    r.render(scene, camera);
    r.setScissor(sx, 0, w - sx, h);
    paintSky(nowBortle(), BORTLE_LIMIT[nowBortle() - 1]);
    r.render(scene, camera);
    r.setScissor(sx, 0, 0, 0);
    r.setScissorTest(false);
  }
  /* 左边固定暗夜。若此刻本身就在暗夜，右边改画市中心 —— 否则两半一模一样，等于什么也没说。 */
  function nowBortle() { return bortle === splitDark ? 9 : bortle; }
  function setSplit(on, x) {
    splitOn = !!on;
    if (typeof x === 'number') splitX = Math.max(0.05, Math.min(0.95, x));
    if (!splitOn) paintSky(bortle, BORTLE_LIMIT[bortle - 1]);
    return splitOn;
  }
  /* 此刻抬头真正看得见的最亮几颗（含大气消光），用于「飞向今晚的星」列表 */
  var _bl = [];  function brightest(n) {
    if (!built) return [];
    var lim = BORTLE_LIMIT[bortle - 1];
    _bl.length = 0;
    for (var i = 0; i < starN; i++) {
      _v.set(starGeoPos[i * 3], starGeoPos[i * 3 + 1], starGeoPos[i * 3 + 2]).normalize().applyMatrix3(rot);
      if (_v.y <= 0.10) continue;                                   // 贴地平线的会被楼和消光吃掉，不列
      var am = 1 / Math.max(_v.y, 0.02);
      var mEff = magOf(i) + 0.26 * (am - 1);
      if (mEff > lim) continue;
      _bl.push({ i: i, mag: magOf(i), mEff: mEff,
                 alt: Math.asin(_v.y) / DEG,
                 az: ((Math.atan2(_v.x, _v.z) / DEG) + 360) % 360 });
    }
    _bl.sort(function (a, b) { return a.mEff - b.mEff; });
    return _bl.slice(0, n || 6);
  }
  /* 出门核对：以第 i 颗星为中心、角半径 WINDOW_R 度的天区窗口里，此刻肉眼可见几颗。
     口径与 visibleStats 完全一致（地平线以上 + 大气消光 + 当前 Bortle 极限星等），
     用户用手幅（一拳 ≈10° **宽**，即直径 10°）在真实星空圈窗可数——这条预测可被本人证伪。
     2026-11-13 口径修正：内核复算发现同一 Bortle 档下 r=10 给 126 颗、r=5 只给 28 颗，
     而对外文案写的是「一拳宽≈10°」——把拳宽当成了角半径，窗口面积放大 4 倍，
     模型承诺随之虚高 4.5 倍。故角半径收到 5°（= 直径 10° = 真·一拳宽），
     并把两个数写成常量供全站共用，避免文案与实算再次各说各话。 */
  var FIST_W = 10;                                     /* 一拳宽＝天区窗口直径（度） */
  var WINDOW_R = FIST_W / 2;                           /* 内核用的是角半径（度） */
  var _wcA = new THREE.Vector3(), _wcB = new THREE.Vector3();
  function windowCount(i, rDeg) {
    if (!built || !(i >= 0) || i >= starN) return null;
    if (typeof rDeg !== 'number') rDeg = WINDOW_R;
    _wcA.set(starGeoPos[i * 3], starGeoPos[i * 3 + 1], starGeoPos[i * 3 + 2]).normalize().applyMatrix3(rot);
    if (_wcA.y <= 0.01) return null;
    var lim = BORTLE_LIMIT[bortle - 1];
    var cosR = Math.cos(rDeg * DEG);
    var cnt = 0;
    for (var k = 0; k < starN; k++) {
      _wcB.set(starGeoPos[k * 3], starGeoPos[k * 3 + 1], starGeoPos[k * 3 + 2]).normalize().applyMatrix3(rot);
      if (_wcB.y <= 0.01) continue;
      if (_wcA.dot(_wcB) < cosR) continue;
      var m = magOf(k) + 0.26 * (1 / Math.max(_wcB.y, 0.02) - 1);
      if (m <= lim) cnt++;
    }
    return {
      count: cnt, radius: rDeg, limit: lim, bortle: bortle, anchor: i,
      alt: Math.asin(Math.max(-1, Math.min(1, _wcA.y))) / DEG,
      az: ((Math.atan2(_wcA.x, _wcA.z) / DEG) + 360) % 360
    };
  }
  function splitInfo() {
    return { on: splitOn, x: splitX, dark: splitDark, bortle: nowBortle(),
             darkVisible: visibleStats(BORTLE_LIMIT[splitDark - 1]).visible,
             nowVisible: visibleStats(BORTLE_LIMIT[nowBortle() - 1]).visible };
  }
  function resize(w, h) {
    if (!camera) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function state() {
    return { city: city.name, lat: city.lat, lon: city.lon, hours: hours, lst: lstDeg, bortle: bortle,
             yaw: yaw / DEG, pitch: pitch / DEG, fov: fov };
  }

  window.GROUND = {
    build: build, update: update, render: render, resize: resize,
    setBortle: setBortle, setSite: setSite, setPlace: setPlace, look: look, zoom: zoom, setFov: setFov, setYaw: setYaw,
    pick: pickStar, mark: mark, state: state, cities: CITIES, visibleStats: visibleStats,
    whereIs: whereIs, setSplit: setSplit, splitInfo: splitInfo, brightest: brightest,
    windowCount: windowCount, fistWidth: function () { return FIST_W; },
    screenOf: screenOf
  };
})();
