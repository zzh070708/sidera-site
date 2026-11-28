(function () {
  'use strict';

  var stage = document.getElementById('stage');
  var fallback = document.getElementById('fallback');
  var citySelect = document.getElementById('city');
  var routeInput = document.getElementById('route');
  var tourButton = document.getElementById('tour');
  var resetButton = document.getElementById('reset');
  var placeEl = document.getElementById('place');
  var cityNameEl = document.getElementById('cityName');
  var bortleEl = document.getElementById('bortle');
  var nelmEl = document.getElementById('nelm');
  var visibleEl = document.getElementById('visible');
  var routeTitle = document.getElementById('routeTitle');
  var lookHint = document.getElementById('lookHint');
  var liveEl = document.querySelector('.live');
  var activityEl = document.getElementById('activity');
  var viewSelect = document.getElementById('viewpoint');
  var lightsButton = document.getElementById('lightsOut');
  var epochEl = document.getElementById('epoch');
  var epochSubEl = document.getElementById('epochSub');
  var skyEl = document.getElementById('skyFrac');
  var rulerEl = document.getElementById('timeRuler');
  var blockedEl = document.getElementById('timeBlocked');
  var starCard = document.getElementById('starCard');
  var starMagEl = document.getElementById('starMag');
  var starDistEl = document.getElementById('starDist');
  var starWhenEl = document.getElementById('starWhen');
  var starNoteEl = document.getElementById('starNote');
  var starCloseEl = document.getElementById('starClose');
  var robotEl = document.getElementById('robotLine');
  var roverPanel = document.getElementById('roverPanel');
  var roverButton = document.getElementById('rover');
  var roverRouteInput = document.getElementById('roverRoute');
  var roverHeadingInput = document.getElementById('roverHeading');
  var roverBaffleButton = document.getElementById('roverBaffle');
  var roverWalkButton = document.getElementById('roverWalk');
  var roverJoinButton = document.getElementById('roverJoin');
  var roverLuxEl = document.getElementById('roverLux');
  var roverImpliedEl = document.getElementById('roverImplied');
  var roverEyeEl = document.getElementById('roverEye');
  var roverGlareEl = document.getElementById('roverGlareShare');
  var roverSkyEl = document.getElementById('roverSkyShare');
  var roverBarGlare = document.getElementById('roverBarGlare');
  var roverBarSky = document.getElementById('roverBarSky');
  var roverPosEl = document.getElementById('roverPos');
  var roverHeadingLabelEl = document.getElementById('roverHeadingLabel');
  var roverTrailEl = document.getElementById('roverTrail');
  var roverCloseEl = document.getElementById('roverClose');
  var routePanel = document.querySelector('.route-panel');

  var BORTLE_LIMIT = [7.6, 7.1, 6.6, 6.1, 5.6, 5.1, 4.6, 4.1, 3.5];
  /* 逐小时活动曲线：机制示意，不是实测。两城形状不同——
     北京峰值晚一小时且深夜有厚尾（商圈、写字楼、高速照明不散）；
     锦州峰值在 19 点，关店早，23 点后掉得快，但郊区本来就更暗。
     darkBortle 是「全城熄灯后市中心仍剩下的等级」：外地光穹 + 气溶胶散射，本城的开关关不掉它。
     北京被天津/廊坊/保定连成一片光穹，残余必须高于锦州这种单城，否则「灯是膜」就成了假话。 */
  var CITIES = {
    beijing: {
      name: '北京', lat: 39.9042, lon: 116.4074, seed: 20261101,
      centerBortle: 8.8, edgeBortle: 4.0, height: 1.0, maxHeight: 42, towerBoost: 1.0,
      facade: 'glass', skyRotation: 0.18, road: 19,
      hours: [[19, 0.97], [20, 1.0], [21, 0.93], [22, 0.8], [23, 0.66],
        [24, 0.53], [25, 0.44], [26, 0.38], [27, 0.34], [28, 0.32]],
      darkBortle: 6.3
    },
    jinzhou: {
      name: '锦州', lat: 41.0264, lon: 121.1234, seed: 20261114,
      centerBortle: 8.2, edgeBortle: 3.2, height: 0.68, maxHeight: 34, towerBoost: 0.18,
      facade: 'brick', skyRotation: -0.31, road: 17,
      hours: [[19, 0.95], [20, 0.9], [21, 0.76], [22, 0.56], [23, 0.37],
        [24, 0.26], [25, 0.2], [26, 0.17], [27, 0.15], [28, 0.14]],
      darkBortle: 5.2
    }
  };
  /* 观测点：eye 是视高（米），sky 是该位置能看见的天空占整片半球的比例，
     glare 是同一时刻这片位置受到的直接灯光侵入倍率（街谷被灯直射、高层看见整片灯海），
     span 是转头幅度的一半（弧度，0 = 不限），walk 是能否横向走上人行道。 */
  var VIEWS = {
    street: { name: '街道', eye: 1.72, sky: 0.4, glare: 1.0, span: 0, yaw: 0, walk: true },
    terrace: { name: '低层露台', eye: 9.6, sky: 0.66, glare: 0.84, span: 0, yaw: 0, walk: false },
    highrise: { name: '高层窗前', eye: 68, sky: 0.91, glare: 1.14, span: 0, yaw: 0, walk: false },
    indoor: { name: '室内窗边', eye: 3.15, sky: 0.11, glare: 0.52, span: 0.62, yaw: 0, walk: false, pitchMin: -0.24, pitchMax: 0.60 }
  };
  var Z_START = 950, Z_END = -1900, SPAN = Z_START - Z_END;
  var STAR_COUNT = 14000, STAR_RADIUS = 2200;
  var HOUR_MIN = 19, HOUR_MAX = 28;
  /* 时间轴两端：肉眼极限星等对应的光行时范围（150 年 ≈ Bortle 9，4000 年留给人眼极限之外） */
  var EPOCH_MIN = 150, EPOCH_MAX = 4000;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EX = window.SIDERA_EXPERIENCE || null;
  var initialPrefs = EX ? EX.get('city') : { city: 'beijing', hour: 21, epoch: 1500, track: 'real', view: 'street', mode: 'immersive' };
  var params = new URLSearchParams(location.search);
  var cityKey = CITIES[params.get('city')] ? params.get('city') : (CITIES[initialPrefs.city] ? initialPrefs.city : 'beijing');
  function paramNumber(key, fallback) {
    var raw = params.get(key);
    if (raw === null || raw === '') return fallback;
    var value = Number(raw);
    return isFinite(value) ? value : fallback;
  }
  var route = clamp(paramNumber('t', 0), 0, 1);
  var hour = clamp(paramNumber('h', initialPrefs.hour), HOUR_MIN, HOUR_MAX);
  var historyEpoch = clamp(paramNumber('epoch', initialPrefs.epoch), EPOCH_MIN, EPOCH_MAX);
  var urlTrack = params.get('track');
  var track = urlTrack === 'real' || urlTrack === 'history' ? urlTrack : (initialPrefs.track === 'history' ? 'history' : 'real');
  var viewKey = VIEWS[params.get('v')] ? params.get('v') : (VIEWS[initialPrefs.view] ? initialPrefs.view : 'street');
  var displayMode = ['immersive', 'lite', 'guide'].indexOf(initialPrefs.mode) >= 0 ? initialPrefs.mode : 'immersive';
  var city = CITIES[cityKey];
  var walkX = 0, yaw = 0.035, pitch = 0.045;
  var tour = false, tourDirection = 1, heldMove = 0;
  var keys = Object.create(null);
  var dragging = false, dragX = 0, dragY = 0, dragPointer = null, dragMoved = 0, dragTime = 0;
  var world = null, renderer = null, scene = null, camera = null;
  var sky = null, stars = null, starGeometry = null, starMags = [], starAges = [];
  var hemi = null, moon = null, cityLight = null, glowAmbient = null;
  var facadeMaterials = [], bulbMaterial = null, laneMaterial = null, wetStreakMaterial = null;
  var skylineGlowMaterial = null;
  var lampGlowMaterial = null, lampPoolMaterial = null;
  var signMaterial = null;
  var lampGlowGeometry = null;
  var motes = null, moteMaterial = null, rig = null;
  var frames = 0, lastTime = 0, webgl = false, contextLost = false;
  var visibleCount = 0, glow = 1, bortle = city.centerBortle, predictionBortle = city.centerBortle, nelm = BORTLE_LIMIT[8];
  var activity = 1, view = VIEWS[viewKey], skyFraction = view.sky, shownStars = 0;
  var ceilingAge = 0, lightsOut = false, robot = null, robotTimer = 0;
  var roverOn = false, roverRoute = 0.26, roverHeading = 0, roverBaffle = 'open';
  var roverWalk = false, roverWalkDir = 1, roverRead = null, roverSweep = null;
  var roverGroup = null, roverAim = null, roverTube = null, roverBeam = null, roverRing = null;
  var roverBeamMaterial = null, roverRingMaterial = null, roverFeedTimer = 0;
  /* 后期合成（辉光 + 胶片明暗压缩）与场景实际绘制批次数的暂存位 */
  var post = null, sceneDrawCalls = 0;
  var buildingCount = 0, treeCount = 0, lampCount = 0, grassCount = 0;
  var dummy = null;
  var flowThrottle = EX ? new EX.AdaptiveThrottle() : null;
  var dragStart = null, flowDragStart = null, flowSaveTimer = 0, actionTimer = 0, actionSignature = '';
  var fallbackMode = 'data', fallbackImageFailed = false, actionBortle = city.centerBortle, lastComputeCost = 0;
  var trackHour = document.getElementById('trackHour');
  var epochInput = document.getElementById('historyEpoch');
  var trackHourValue = document.getElementById('trackHourValue');
  var epochValue = document.getElementById('historyEpochValue');
  var realTrackPanel = document.getElementById('realTrackPanel');
  var historyTrackPanel = document.getElementById('historyTrackPanel');
  var historyEmpty = document.getElementById('historyEmpty');
  var trackNote = document.getElementById('trackNote');
  var trackReal = document.getElementById('trackReal');
  var trackHistory = document.getElementById('trackHistory');
  var displaySelect = document.getElementById('displayMode');
  var recentCard = document.getElementById('recentCard');
  var actionCard = document.getElementById('actionCard');
  var fallbackImage = document.getElementById('fallbackImage');
  var fallbackStarMags = (function () {
    var random = rng(20261127), mags = [];
    for (var i = 0; i < STAR_COUNT; i++) mags.push(magOf(random()));
    mags.sort(function (a, b) { return a - b; });
    return mags;
  })();

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function clamp01(v) { return clamp(v, 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, v) {
    var t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function routeAt(z) { return clamp01((Z_START - z) / SPAN); }
  function zAt(t) { return lerp(Z_START, Z_END, clamp01(t)); }
  function upperBound(arr, value) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid] <= value) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
  function nelmAt(b) {
    if (b <= 1) return BORTLE_LIMIT[0];
    if (b >= 9) return BORTLE_LIMIT[8];
    var i = Math.floor(b), f = b - i;
    return lerp(BORTLE_LIMIT[i - 1], BORTLE_LIMIT[i], f);
  }
  function magOf(u) {
    var mmax = 7.5, k = Math.pow(10, 0.5 * mmax) - 1;
    return 2 * Math.log10(1 + u * k);
  }

  function activityAt(points, h) {
    if (h <= points[0][0]) return points[0][1];
    var last = points[points.length - 1];
    if (h >= last[0]) return last[1];
    for (var i = 1; i < points.length; i++) {
      if (h <= points[i][0]) {
        var a = points[i - 1], b = points[i];
        return lerp(a[1], b[1], (h - a[0]) / (b[0] - a[0]));
      }
    }
    return last[1];
  }

  /* 时间天花板：把「极限星等」翻译成「这束光出发的年代」。
     假设这一批示意星与织女星同光度（绝对星等 M≈0），于是距离模数 m-M=5·log10(d)-5
     给出 d(pc)=10·10^(m/5)；1 秒差距 = 3.26156 光年，光走 1 光年用 1 年。 */
  function distanceOf(m) { return 10 * Math.pow(10, m / 5); }
  function ageOf(m) { return distanceOf(m) * 3.26156; }
  function eraName(ad) {
    if (ad >= 1912) return '现代';
    if (ad >= 1368) return '明清';
    if (ad >= 960) return '宋元';
    if (ad >= 907) return '五代十国';
    if (ad >= 618) return '大唐';
    if (ad >= 220) return '魏晋南北朝';
    if (ad >= -206) return '两汉';
    if (ad >= -1046) return '周 · 青铜时代';
    if (ad >= -2070) return '夏商';
    if (ad >= -3500) return '新石器晚期 · 良渚';
    return '文字之前';
  }
  function yearLabel(yearsAgo) {
    var ad = Math.round(2026 - yearsAgo);
    return ad > 0 ? '公元 ' + ad + ' 年' : '公元前 ' + (1 - ad) + ' 年';
  }
  function clockLabel(h) {
    var total = Math.round(h * 60), hh = Math.floor(total / 60) % 24, mm = total % 60;
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }

  function showFallback(message) {
    if (tour) stopTour();
    fallbackMode = fallbackImageFailed || !fallbackImage || !fallbackImage.complete || fallbackImage.naturalWidth === 0
      ? 'data' : 'static';
    if (track === 'history') {
      fallback.hidden = true; stage.hidden = true;
      document.body.classList.remove('fallback-static', 'fallback-data');
      return;
    }
    fallback.hidden = false;
    stage.hidden = true;
    document.body.classList.remove('fallback-static', 'fallback-data');
    document.body.classList.add(fallbackMode === 'data' ? 'fallback-data' : 'fallback-static');
    if (message) fallback.querySelector('strong').textContent = message;
    document.getElementById('fallbackText').textContent = fallbackMode === 'data' ? '纯数据模式：计算、行动与分享仍可使用。' : '静态预览，数据仍会更新。';
    liveEl.textContent = '实时 3D 未启动 · 已切换降级预览';
  }

  function flowState() {
    return { city: cityKey, hour: hour, epoch: historyEpoch, track: track, view: viewKey, route: route };
  }
  function flowSignature() { return [cityKey, hour, historyEpoch, track, viewKey, route, displayMode].join('|'); }
  var savedFlowSignature = '';
  function persistFlow() {
    var signature = flowSignature();
    if (signature === savedFlowSignature) return;
    var stored = true;
    if (EX) stored = EX.patch('city', { city: cityKey, hour: hour, epoch: historyEpoch, track: track, view: viewKey, mode: displayMode });
    if (!EX || EX.isPrivate() || stored) savedFlowSignature = signature;
    if (EX && EX.isPrivate()) return;
    try {
      var url = new URL(location.href);
      url.searchParams.set('city', cityKey); url.searchParams.set('h', String(hour));
      url.searchParams.set('epoch', String(historyEpoch)); url.searchParams.set('track', track);
      url.searchParams.set('v', viewKey); url.searchParams.set('t', String(route));
      history.replaceState(null, '', url.href);
    } catch (e) {}
  }
  function scheduleFlowSave() {
    if (flowSaveTimer) return;
    flowSaveTimer = setTimeout(function () { flowSaveTimer = 0; persistFlow(); }, 200);
  }
  function commitRecent() {
    if (!EX) return;
    EX.addRecent({ city: cityKey, cityName: city.name, hour: hour, epoch: historyEpoch, track: track, view: viewKey });
    renderRecent();
  }
  function beginUndo(state) { if (EX) EX.recordUndo(state || flowState()); refreshUndo(); }
  function captureFlowDrag() { if (!flowDragStart) flowDragStart = flowState(); }
  function commitFlowDrag() {
    var previous = flowDragStart;
    flowDragStart = null;
    if (!previous || JSON.stringify(previous) === JSON.stringify(flowState())) return;
    beginUndo(previous);
  }
  function refreshUndo() {
    var button = document.getElementById('undoCompare');
    if (button && EX) button.disabled = !EX.canUndo(cityKey);
  }
  function renderRecent() {
    var box = document.getElementById('recentList');
    if (!box || !EX) return;
    var list = EX.recent();
    while (box.firstChild) box.removeChild(box.firstChild);
    if (!list.length) {
      var empty = document.createElement('p'); empty.className = 'recent-empty'; empty.textContent = '暂无最近对照。'; box.appendChild(empty); return;
    }
    list.forEach(function (item) {
      var row = document.createElement('button'); row.type = 'button'; row.className = 'recent-item';
      var label = document.createElement('span');
      label.textContent = (CITIES[item.city] ? CITIES[item.city].name : item.cityName) + ' · ' +
        (item.track === 'history' ? yearLabel(item.epoch) + '（科普示意）' : clockLabel(item.hour)) + ' · ' + VIEWS[item.view].name;
      var small = document.createElement('small'); small.textContent = new Date(item.at).toLocaleDateString('zh-CN');
      row.appendChild(label); row.appendChild(small);
      row.addEventListener('click', function () {
        beginUndo();
        if (CITIES[item.city]) setCity(item.city, true);
        hour = clamp(Number(item.hour), HOUR_MIN, HOUR_MAX);
        historyEpoch = clamp(Number(item.epoch), EPOCH_MIN, EPOCH_MAX);
        track = item.track === 'history' ? 'history' : 'real';
        setViewpoint(item.view); EX.addRecent(item); recentCard.hidden = true;
        updateScene(true); persistFlow(); commitRecent(); scheduleAction();
        if (EX) EX.notify('已载入对照；撤销可恢复加载前参数。');
      });
      box.appendChild(row);
    });
  }
  function refreshTrackUI() {
    var history = track === 'history';
    if (trackReal) { trackReal.classList.toggle('on', !history); trackReal.setAttribute('aria-pressed', history ? 'false' : 'true'); }
    if (trackHistory) { trackHistory.classList.toggle('on', history); trackHistory.setAttribute('aria-pressed', history ? 'true' : 'false'); }
    if (realTrackPanel) realTrackPanel.hidden = history;
    if (historyTrackPanel) historyTrackPanel.hidden = !history;
    if (historyEmpty) historyEmpty.hidden = !history;
    document.body.setAttribute('data-track', history ? 'history' : 'real');
    if (routeInput) routeInput.disabled = history;
    if (trackNote) trackNote.textContent = history
      ? '年代轨道仅保留参数；当前城市没有历史年代模型，结果已清空。时间天花板仍表示光行时。'
      : '真实时段用于当前城市机制示意；预测核对使用城市中心坐标。';
  }
  function setTrack(next, record) {
    if (next !== 'real' && next !== 'history') return;
    if (next === track) return;
    if (record !== false) beginUndo();
    if (next === 'history' && tour) stopTour();
    track = next; refreshTrackUI(); updateScene(true); persistFlow(); commitRecent(); scheduleAction();
  }
  function setEpoch(value, record) {
    var next = clamp(Number(value) || EPOCH_MIN, EPOCH_MIN, EPOCH_MAX);
    if (next === historyEpoch) return;
    if (record !== false) beginUndo();
    historyEpoch = next;
    updateScene(true); scheduleFlowSave(); scheduleAction();
  }
  function applyDisplayMode(mode, persist) {
    displayMode = ['immersive', 'lite', 'guide'].indexOf(mode) >= 0 ? mode : 'immersive';
    document.body.setAttribute('data-mode', displayMode);
    if (displaySelect) displaySelect.value = displayMode;
    if (persist !== false) persistFlow();
  }
  function resetCompare(send, persist) {
    if (EX) EX.clearUndo(cityKey);
    if (tour) stopTour();
    hour = 21; historyEpoch = 1500; track = 'real'; route = 0;
    setViewpoint('street'); setLightsOut(false); refreshTrackUI(); updateScene(true);
    if (persist !== false) persistFlow();
    else {
      savedFlowSignature = '';
      if (flowSaveTimer) { clearTimeout(flowSaveTimer); flowSaveTimer = 0; }
    }
    refreshUndo(); scheduleAction();
    if (send && EX) EX.sendReset();
    if (EX) EX.notify('已重置真实时段与历史年代；撤销栈已清空。');
  }
  function tonight() {
    var now = new Date(), h = now.getHours() + now.getMinutes() / 60;
    var next = clamp(Math.round(h * 4) / 4, HOUR_MIN, HOUR_MAX);
    if (next !== hour || track !== 'real') beginUndo();
    hour = next; track = 'real';
    if (tour) stopTour();
    refreshTrackUI(); updateScene(true); persistFlow(); commitRecent(); scheduleAction();
    if (EX) EX.sendContext({ source: 'city', cityKey: cityKey, cityName: city.name, hour: hour });
  }
  function shareCompare() {
    try {
      var url = new URL(location.href);
      url.search = '';
      url.searchParams.set('city', cityKey); url.searchParams.set('h', String(hour));
      url.searchParams.set('epoch', String(historyEpoch)); url.searchParams.set('track', track);
      url.searchParams.set('v', viewKey); url.searchParams.set('t', String(route));
      var text = url.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { if (EX) EX.notify('分享链接已复制；渲染模式不会随链接发送。'); },
          function () { if (EX) EX.notify(text, 10000); });
      } else if (EX) EX.notify(text, 10000);
    } catch (e) { if (EX) EX.notify('分享链接生成失败：' + e.message); }
  }
  function renderAction(force) {
    if (!EX || !actionCard) return;
    var daylight = hour < 19 || hour >= 29;
    var signature = [cityKey, Math.round(actionBortle), track, daylight].join('|');
    if (!force && signature === actionSignature) return;
    actionSignature = signature;
    var actions = EX.actionsFor(actionBortle, track, daylight, 'daily');
    document.getElementById('actionBand').textContent = 'Bortle ' + Math.round(actionBortle) + ' · ' + (actions.history ? '科普示意' : '日常行动');
    document.getElementById('actionTitle').textContent = actions.history ? '一般日常行动' : '从一盏灯开始';
    document.getElementById('actionNote').textContent = actions.history
      ? '历史轨道没有真实年代模型；以下建议不描述那一年的夜空。' : '个人行动是参与，不是解决；社区与照明法规才有更大杠杆。';
    var list = document.getElementById('actionList');
    while (list.firstChild) list.removeChild(list.firstChild);
    actions.items.forEach(function (text) { var li = document.createElement('li'); li.textContent = text; list.appendChild(li); });
  }
  function scheduleAction() {
    if (actionTimer) clearTimeout(actionTimer);
    actionTimer = setTimeout(function () { renderAction(false); }, 500);
  }
  function bindFlow() {
    if (trackReal) trackReal.addEventListener('click', function () { setTrack('real'); });
    if (trackHistory) trackHistory.addEventListener('click', function () { setTrack('history'); });
    if (trackHour) {
      trackHour.addEventListener('input', function () {
        captureFlowDrag();
        var value = Number(trackHour.value);
        if (!flowThrottle) { setHour(value, false); scheduleAction(); return; }
        flowThrottle.advance(performance.now(), function () { setHour(value, false); scheduleAction(); });
      });
      trackHour.addEventListener('change', function () {
        setHour(trackHour.value, false); commitFlowDrag(); persistFlow(); commitRecent(); scheduleAction();
      });
    }
    if (epochInput) {
      epochInput.addEventListener('input', function () {
        captureFlowDrag();
        var value = Number(epochInput.value);
        if (!flowThrottle) { setEpoch(value, false); scheduleAction(); return; }
        flowThrottle.advance(performance.now(), function () { setEpoch(value, false); scheduleAction(); });
      });
      epochInput.addEventListener('change', function () {
        setEpoch(epochInput.value, false); commitFlowDrag(); persistFlow(); commitRecent(); scheduleAction();
      });
    }
    if (displaySelect) displaySelect.addEventListener('change', function () { applyDisplayMode(displaySelect.value); });
    document.getElementById('tonight').addEventListener('click', tonight);
    document.getElementById('resetCompare').addEventListener('click', function () { resetCompare(true); });
    document.getElementById('undoCompare').addEventListener('click', function () {
      if (!EX) return;
      var previous = EX.undo(cityKey); if (!previous) return;
      if (previous.state.city && CITIES[previous.state.city]) setCity(previous.state.city, true);
      hour = previous.state.hour; historyEpoch = previous.state.epoch; track = previous.state.track;
      route = clamp01(previous.state.route == null ? route : Number(previous.state.route));
      setViewpoint(previous.state.view); refreshTrackUI(); updateScene(true); persistFlow(); refreshUndo(); scheduleAction();
    });
    document.getElementById('recentToggle').addEventListener('click', function () { renderRecent(); recentCard.hidden = !recentCard.hidden; });
    document.getElementById('shareCompare').addEventListener('click', shareCompare);
    document.getElementById('actionToggle').addEventListener('click', function () { renderAction(true); actionCard.hidden = !actionCard.hidden; });
    document.getElementById('cityData').addEventListener('click', function () {
      if (!EX) return;
      EX.dataDialog({ onReset: function (kind) { if (kind === 'recent') renderRecent(); else resetCompare(false, false); } });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-close-card]'), function (button) {
      button.addEventListener('click', function () { button.closest('.flow-card').hidden = true; });
    });
    if (EX) {
      EX.onContext(function (message) {
        if (message.type === 'clear') {
          if (message.kind === 'recent') { renderRecent(); return; }
          resetCompare(false, false); renderRecent(); renderAction(true);
          return;
        }
        if (message.type === 'reset') { resetCompare(false); return; }
        var context = message.context;
        if (!context || context.source !== 'home' || !CITIES[context.cityKey]) return;
        if (EX.isPrivate() || context.at < Date.now() - 7 * 86400000) return;
        hour = clamp(Number(context.hour), HOUR_MIN, HOUR_MAX);
        if (context.cityKey !== cityKey) setCity(context.cityKey, true);
        refreshTrackUI(); updateScene(true); persistFlow(); scheduleAction();
      });
      EX.onSync(function (state) {
        var button = document.getElementById('undoCompare');
        if (button) button.title = state.independent ? '同步暂停；撤销仍可在本页使用。' : '撤销仅回退本次会话操作，不会修改已保存的本机偏好';
      });
    }
    if (fallbackImage) {
      fallbackImage.addEventListener('error', function () { fallbackImageFailed = true; showFallback('静态预览图片也未载入'); });
      fallbackImage.addEventListener('load', function () { if (!fallback.hidden) showFallback(); });
    }
    applyDisplayMode(displayMode, false); refreshTrackUI(); renderRecent(); refreshUndo();
  }

  function init() {
    bindFlow();
    if (typeof THREE === 'undefined') {
      showFallback('当前浏览器未能载入三维引擎');
      bindBaseControls(); updateScene(true);
      window.addEventListener('resize', syncRoutePanelHeight);
      return;
    }
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (e) {
      showFallback('当前浏览器未能启动实时 3D');
      bindBaseControls(); updateScene(true);
      window.addEventListener('resize', syncRoutePanelHeight);
      return;
    }
    webgl = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputEncoding = THREE.LinearEncoding;
    renderer.toneMapping = THREE.NoToneMapping;
    /* 明暗压缩与 sRGB 转换不在渲染器里做，搬到最终合成着色器自己做（见 buildPost）。
       原因有两个：一是辉光必须在"还没被压进 0~1"的亮度上做才对，
       二是"往离屏缓冲渲染时渲染器要不要自动转色彩空间"这件事各版本行为不同，
       自己接管之后，画面不再依赖这个差异。 */
    renderer.domElement.setAttribute('aria-label', '拖动转头，WASD 或方向键行走，滚轮沿道路前进，轻点画面指认一颗星');
    renderer.domElement.setAttribute('tabindex', '0');
    stage.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      contextLost = true;
      showFallback('三维画面暂时中断，请刷新页面重新进入');
      updateScene(true);
    });

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x111522, 0.00065);
    camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 6000);
    camera.rotation.order = 'YXZ';
    dummy = new THREE.Object3D();

    hemi = new THREE.HemisphereLight(0x8b9cc4, 0x30251f, 0.4);
    scene.add(hemi);
    moon = new THREE.DirectionalLight(0xa9bce4, 0.25);
    moon.position.set(-300, 600, -200);
    scene.add(moon);
    cityLight = new THREE.DirectionalLight(0xe6a064, 0.34);
    cityLight.position.set(0, 80, 500);
    scene.add(cityLight);
    /* 城市辉光反弹：夜里脚下的路面与低空气溶胶把灯光散射回立面。
       这束光是各方向的，所以只能建成环境光——平行光会让朝北的山墙和朝南的一样亮，很假。
       它必须严格跟着 lightLevel 走：熄灯时这层反弹也要归零，
       否则「熄灯」只关了窗，街面还留着一层并不存在的光，亮灯/熄灯对照就成了假的。 */
    glowAmbient = new THREE.AmbientLight(0xc9864c, 0);
    scene.add(glowAmbient);

    buildPost();
    buildSky();
    buildRig();
    buildRover();
    setCity(cityKey, true);
    bindBaseControls();
    bindSceneControls();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(syncRoutePanelHeight).observe(routePanel);
    syncRoutePanelHeight();
    updateScene(true);
    requestAnimationFrame(frame);
  }

  /* ============ 后期合成：光溢出（辉光）+ 胶片明暗压缩 ============
     实拍夜景「看着真」的第一成因：任何亮点都向四周晕开，最亮处过曝成白，
     暗部不是纯黑，边角还有镜头的色散与暗角。这三件事靠「把楼画细」补不出来，
     必须走一遍工序：线性亮度 → 抠亮部 → 两级降采样模糊 → 叠回 → 压明暗 → 转 sRGB。
     不引任何外部库，五个 pass 全部用全屏四边形手写。 */
  function buildPost() {
    var halfFloat = renderer.capabilities.isWebGL2 === true ||
      renderer.extensions.has('EXT_color_buffer_half_float');
    var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    var quadScene = new THREE.Scene();
    quadScene.add(quad);
    var vs = [
      'varying vec2 vUv;',
      'void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }'
    ].join('\n');

    post = {
      type: halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType,
      quad: quad, quadScene: quadScene,
      quadCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      sceneRT: null, b1: null, b2: null, c1: null, c2: null,
      copy: new THREE.ShaderMaterial({
        uniforms: { uTex: { value: null } }, vertexShader: vs,
        fragmentShader: [
          'uniform sampler2D uTex; varying vec2 vUv;',
          'void main(){ gl_FragColor=vec4(texture2D(uTex,vUv).rgb,1.0); }'
        ].join('\n')
      }),
      bright: new THREE.ShaderMaterial({
        uniforms: { uTex: { value: null }, uKnee: { value: 0.82 }, uSoft: { value: 0.55 } },
        vertexShader: vs,
        fragmentShader: [
          'uniform sampler2D uTex; uniform float uKnee; uniform float uSoft; varying vec2 vUv;',
          'void main(){',
          '  vec3 c=texture2D(uTex,vUv).rgb;',
          '  float l=max(max(c.r,c.g),c.b);',
          /* 软拐点：硬阈值会在亮的边缘切出一圈刀口，那正是「后期痕迹」。 */
          '  float k=smoothstep(uKnee,uKnee+uSoft,l);',
          '  gl_FragColor=vec4(c*k,1.0);',
          '}'
        ].join('\n')
      }),
      blur: new THREE.ShaderMaterial({
        uniforms: { uTex: { value: null }, uStep: { value: new THREE.Vector2(0, 0) } },
        vertexShader: vs,
        fragmentShader: [
          'uniform sampler2D uTex; uniform vec2 uStep; varying vec2 vUv;',
          'void main(){',
          /* 5 抽头高斯，偏移量按线性采样折算成 3 次取样——两次 pass 就够软。 */
          '  vec3 s=texture2D(uTex,vUv).rgb*0.2270270;',
          '  s+=(texture2D(uTex,vUv+uStep*1.3846154).rgb+texture2D(uTex,vUv-uStep*1.3846154).rgb)*0.3162162;',
          '  s+=(texture2D(uTex,vUv+uStep*3.2307692).rgb+texture2D(uTex,vUv-uStep*3.2307692).rgb)*0.0702702;',
          '  gl_FragColor=vec4(s,1.0);',
          '}'
        ].join('\n')
      }),
      final: new THREE.ShaderMaterial({
        uniforms: {
          uScene: { value: null }, uBloomNear: { value: null }, uBloomFar: { value: null },
          uExposure: { value: 1.0 }, uBloom: { value: 1.0 }, uGrain: { value: 0.0075 },
          uSaturate: { value: 1.04 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }
        },
        vertexShader: vs,
        fragmentShader: [
          'uniform sampler2D uScene; uniform sampler2D uBloomNear; uniform sampler2D uBloomFar;',
          'uniform float uExposure; uniform float uBloom; uniform float uGrain; uniform float uSaturate;',
          'uniform float uTime; uniform vec2 uRes; varying vec2 vUv;',
          'vec3 filmic(vec3 x){',
          '  x*=uExposure;',
          '  return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);',
          '}',
          'void main(){',
          '  vec2 d=vUv-0.5; float r2=dot(d,d);',
          /* 边角色散：镜头把画面边缘的亮边拆出一点红蓝，中心不动。 */
          '  vec2 ca=d*r2*0.0035;',
          '  vec3 base=vec3(texture2D(uScene,vUv+ca).r,texture2D(uScene,vUv).g,texture2D(uScene,vUv-ca).b);',
          '  vec3 glow=texture2D(uBloomNear,vUv).rgb*0.92+texture2D(uBloomFar,vUv).rgb*0.78;',
          '  vec3 c=filmic(base+glow*uBloom);',
          '  float l=dot(c,vec3(0.2126,0.7152,0.0722));',
          '  c=mix(vec3(l),c,uSaturate);',
          '  c*=1.0-0.24*smoothstep(0.04,0.52,r2);',
          /* 黑位抬起：长曝夜景里没有真正的纯黑平面。
             0.0032 时黑底被抬到 ~10/255，实测把「亮灯/熄灯」的街面亮度比从 1.7 压到 1.3——
             抬黑本质是压对比，夜景要的是通透，取刚好「不糊死」的量。 */
          '  c+=0.0016;',
          '  float g=fract(sin(dot(vUv*uRes+uTime,vec2(12.9898,78.233)))*43758.5453);',
          '  c+=(g-0.5)*uGrain;',
          '  c=clamp(c,0.0,1.0);',
          '  gl_FragColor=vec4(mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c)),1.0);',
          '}'
        ].join('\n')
      })
    };
    resizePost();
  }

  function resizePost() {
    if (!post) return;
    var pr = renderer.getPixelRatio();
    var w = Math.max(4, Math.floor(window.innerWidth * pr));
    var h = Math.max(4, Math.floor(window.innerHeight * pr));
    if (post.sceneRT) {
      post.sceneRT.dispose(); post.b1.dispose(); post.b2.dispose();
      post.c1.dispose(); post.c2.dispose();
    }
    function make(width, height, depth) {
      return new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat, type: post.type, depthBuffer: !!depth
      });
    }
    post.sceneRT = make(w, h, true);
    post.b1 = make(Math.max(2, w >> 1), Math.max(2, h >> 1), false);
    post.b2 = make(Math.max(2, w >> 1), Math.max(2, h >> 1), false);
    post.c1 = make(Math.max(2, w >> 2), Math.max(2, h >> 2), false);
    post.c2 = make(Math.max(2, w >> 2), Math.max(2, h >> 2), false);
    post.final.uniforms.uRes.value.set(w, h);
  }

  function pass(material, texture, target) {
    if (material.uniforms.uTex) material.uniforms.uTex.value = texture;
    post.quad.material = material;
    renderer.setRenderTarget(target || null);
    renderer.render(post.quadScene, post.quadCamera);
  }

  function renderFrame(now) {
    if (!post || !post.sceneRT) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      sceneDrawCalls = renderer.info.render.calls;
      return;
    }
    renderer.setRenderTarget(post.sceneRT);
    renderer.render(scene, camera);
    /* 批次数要在渲染场景之后、进后期之前取：渲染器每次 render 都重置计数，
       后期那几个全屏四边形会把数字压成 1，那样报出来的是假繁荣。 */
    sceneDrawCalls = renderer.info.render.calls;
    pass(post.bright, post.sceneRT.texture, post.b1);
    post.blur.uniforms.uStep.value.set(1 / post.b1.width, 0);
    pass(post.blur, post.b1.texture, post.b2);
    post.blur.uniforms.uStep.value.set(0, 1 / post.b1.height);
    pass(post.blur, post.b2.texture, post.b1);
    pass(post.copy, post.b1.texture, post.c1);
    post.blur.uniforms.uStep.value.set(1 / post.c1.width, 0);
    pass(post.blur, post.c1.texture, post.c2);
    post.blur.uniforms.uStep.value.set(0, 1 / post.c1.height);
    pass(post.blur, post.c2.texture, post.c1);
    post.final.uniforms.uScene.value = post.sceneRT.texture;
    post.final.uniforms.uBloomNear.value = post.b1.texture;
    post.final.uniforms.uBloomFar.value = post.c1.texture;
    post.final.uniforms.uTime.value = reduce ? 0 : (now || 0) * 0.001;
    pass(post.final, null, null);
  }

  function buildSky() {
    var skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uGlow: { value: 1 }, uDark: { value: 0 }, uTime: { value: 0 }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
      ].join('\n'),
      fragmentShader: [
        'uniform float uGlow; uniform float uDark; uniform float uTime;',
        'varying vec3 vDir;',
        'float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }',
        'float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y); }',
        'float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<4;i++){ v+=a*noise(p); p=p*2.03+vec2(17.1,9.2); a*=0.5; } return v; }',
        'void main(){',
        '  vec3 d=normalize(vDir); float h=clamp(d.y,0.0,1.0);',
        '  vec3 top=mix(vec3(0.010,0.020,0.052),vec3(0.068,0.060,0.070),uGlow);',
        '  vec3 hor=mix(vec3(0.034,0.055,0.092),vec3(0.250,0.142,0.078),uGlow);',
        '  vec3 col=mix(hor,top,pow(h,0.36));',
        '  vec3 hd=normalize(vec3(d.x,0.001,d.z));',
        '  float city=pow(max(dot(hd,normalize(vec3(0.0,0.0,1.0))),0.0),2.0);',
        '  col+=vec3(0.16,0.070,0.025)*uGlow*(0.45+0.55*city)*exp(-h*7.0);',
        '  vec3 gn=normalize(vec3(0.58,0.78,-0.22));',
        '  float band=pow(max(0.0,1.0-abs(dot(d,gn))*3.15),5.0);',
        '  vec2 sp=vec2(atan(d.z,d.x),asin(clamp(d.y,-1.0,1.0))*2.2);',
        '  float cloud=fbm(sp*vec2(8.0,15.0)+vec2(3.7,8.1));',
        '  float dust=fbm(sp*vec2(19.0,31.0)+vec2(11.2,1.4));',
        '  float rift=1.0-smoothstep(0.015,0.085,abs(dot(d,gn)+0.055+sin(sp.x*7.0)*0.018));',
        '  float structure=smoothstep(0.28,0.76,cloud)*(1.0-smoothstep(0.52,0.78,dust)*0.72);',
        '  col+=band*uDark*vec3(0.050,0.061,0.098)*structure*(1.0-rift*0.62);',
        '  float horizonAir=exp(-h*16.0)*uDark;',
        '  col+=vec3(0.012,0.022,0.038)*horizonAir;',
        /* 这里不再自己做「压亮 + 伽马」：整帧的明暗压缩与 sRGB 转换统一交给
           最终合成着色器（buildPost）。原因：辉光必须在还没被压进 0~1 的亮度上取，
           天空若先自己压一次，它周围就永远取不到光晕，也会和地面灯光不是一个体系。 */
        '  gl_FragColor=vec4(max(col,vec3(0.0)),1.0);',
        '}'
      ].join('\n')
    });
    sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 18), skyMaterial);
    sky.renderOrder = -20;
    scene.add(sky);
  }

  function buildStars() {
    var random = rng(city.seed + 91);
    var items = [], i, m, x, y, z, phi, u, a, b1, b2, d;
    var mmax = 7.5, k = Math.pow(10, 0.5 * mmax) - 1;
    for (i = 0; i < 8000; i++) {
      y = 0.025 + 0.975 * Math.pow(random(), 0.72);
      phi = random() * Math.PI * 2;
      x = Math.sqrt(1 - y * y) * Math.cos(phi);
      z = Math.sqrt(1 - y * y) * Math.sin(phi);
      items.push({ x: x, y: y, z: z, m: magOf(random()), c: starColor(random()) });
    }
    var normal = new THREE.Vector3(0.58, 0.78, -0.22).normalize();
    b1 = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0, 1, 0)).normalize();
    b2 = new THREE.Vector3().crossVectors(normal, b1).normalize();
    for (i = 0; i < 6000; i++) {
      a = random() * Math.PI * 2;
      u = (random() + random() + random() - 1.5) * 0.17;
      d = new THREE.Vector3().copy(b1).multiplyScalar(Math.cos(a))
        .addScaledVector(b2, Math.sin(a)).addScaledVector(normal, u).normalize();
      d.y = Math.abs(d.y);
      if (d.y < 0.018) d.y = 0.018;
      d.normalize();
      m = 5.0 + 2.5 * Math.pow(random(), 0.62);
      items.push({ x: d.x, y: d.y, z: d.z, m: m, c: starColor(random(), true) });
    }
    items.sort(function (p, q) { return p.m - q.m; });
    var positions = new Float32Array(STAR_COUNT * 3);
    var colors = new Float32Array(STAR_COUNT * 3);
    var mags = new Float32Array(STAR_COUNT);
    var ages = new Float32Array(STAR_COUNT);
    var cosR = Math.cos(city.skyRotation), sinR = Math.sin(city.skyRotation);
    starMags = []; starAges = [];
    for (i = 0; i < items.length; i++) {
      var s = items[i], px = s.x * cosR + s.z * sinR, pz = -s.x * sinR + s.z * cosR;
      positions[i * 3] = px * STAR_RADIUS;
      positions[i * 3 + 1] = s.y * STAR_RADIUS;
      positions[i * 3 + 2] = pz * STAR_RADIUS;
      colors[i * 3] = s.c[0]; colors[i * 3 + 1] = s.c[1]; colors[i * 3 + 2] = s.c[2];
      mags[i] = s.m; starMags.push(s.m);
      ages[i] = ageOf(s.m); starAges.push(ages[i]);
    }
    if (starGeometry) starGeometry.dispose();
    if (stars) { scene.remove(stars); stars.material.dispose(); }
    starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    starGeometry.setAttribute('aMag', new THREE.BufferAttribute(mags, 1));
    starGeometry.setAttribute('aAge', new THREE.BufferAttribute(ages, 1));
    var material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      /* uSink：星等到 NELM 前多宽的一条「逐渐没入天空」的过渡带。
         实测：0.42 收窄到 0.24 只让像素比从 1.89 变到 1.84——它不是那个瓶颈，
         真正的瓶颈是上面的点大小定律（已改成近似恒定 PSF）。这里保留窄带，
         只为了让极限边的星在画面里也是「刚要没入」而不是硬切。 */
      uniforms: {
        uPR: { value: renderer.getPixelRatio() }, uGlow: { value: 1 },
        uNelm: { value: 3.5 }, uSink: { value: 0.24 }
      },
      vertexShader: [
        'attribute vec3 aColor; attribute float aMag; attribute float aAge;',
        'uniform float uPR; uniform float uGlow; uniform float uNelm; uniform float uSink;',
        'varying vec3 vC; varying float vA; varying float vDepth;',
        'void main(){',
        '  vC=aColor;',
        /* 星点大小按「相机」定，不按「肉眼」定：同一台相机的点扩散函数是固定的，
           星等改变的是流量（亮度），不是圆盘直径。旧写法让直径也跟着星等收缩
           （亮星 4.2px、暗星 2.8px），于是画面里多出来的暗星几乎不增加像素——
           模型说「熄灯后星多 4.2 倍」，像素只多 1.8 倍，图又和数对不上。
           近似恒定 PSF（暗星 2.4 / 亮星 3.9）后，倍数主要由「有没有这颗星」决定。 */
        '  float size=clamp(1.95+(6.6-aMag)*0.29,2.0,3.9);',
        '  gl_PointSize=clamp(size*uPR,1.4,6.4*uPR);',
        '  float sink=1.0-smoothstep(uNelm-uSink,uNelm+0.12,aMag);',
        '  vDepth=clamp((aMag-(uNelm-uSink))/(uSink+0.12),0.0,1.0)*(1.0-sink);',
        /* 0.80 → 0.90：市中心（glow≈0.95）时把星压到只剩针尖，郊野（glow=0）不受影响。
           这条乘的是「天空辉光把星的对比度吃掉多少」——Bortle 8.6 的膜下，
           星不是变暗一点，是被压掉九成对比；旧值 0.80 时市中心的星还是一片亮斑。 */
        '  vA=clamp((8.0-aMag)*0.22+0.24,0.24,1.0)*(1.0-uGlow*0.90)*sink;',
        '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vC; varying float vA; varying float vDepth;',
        'void main(){',
        '  vec2 q=gl_PointCoord-0.5; float r=length(q); if(r>0.5) discard;',
        '  float core=smoothstep(0.5,0.0,r);',
        '  float a=pow(core,0.9)*vA;',
        '  vec3 tint=mix(vC,vec3(0.55,0.44,0.30),vDepth*0.55);',
        '  gl_FragColor=vec4(tint,a);',
        '}'
      ].join('\n')
    });
    stars = new THREE.Points(starGeometry, material);
    stars.renderOrder = -10;
    scene.add(stars);
  }

  function starColor(random, galactic) {
    if (galactic || random < 0.7) return [0.76, 0.83, 1.0];
    if (random < 0.86) return [1.0, 0.86, 0.63];
    return [0.67, 0.81, 1.0];
  }

  /* 上升光粒：把「灯光变成天空辉光」这件事画成肉眼可见的一段路。
     粒子从路灯与楼体处升起，越接近穹顶越散、越淡，最后叠成头顶那层亮膜。 */
  function buildMotes() {
    var random = rng(city.seed + 77);
    var n = 760, pos = new Float32Array(n * 3), seeds = new Float32Array(n), drifts = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var z = 900 - random() * 2350, t = routeAt(z);
      var band = lerp(city.road / 2 + 4, 132, Math.pow(random(), 0.62) * (0.35 + t * 0.9));
      var side = random() < 0.5 ? -1 : 1;
      pos[i * 3] = side * band * (0.35 + random() * 0.65);
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = z;
      seeds[i] = random();
      drifts[i] = 0.8 + random() * 3.6;
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aDrift', new THREE.BufferAttribute(drifts, 1));
    moteMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() },
        uScale: { value: window.innerHeight / (2 * Math.tan(34 * Math.PI / 180)) },
        uActivity: { value: 1 }, uHeight: { value: 26 }
      },
      vertexShader: [
        'attribute float aSeed; attribute float aDrift;',
        'uniform float uTime; uniform float uPR; uniform float uScale; uniform float uHeight;',
        'varying float vA; varying float vRise;',
        'void main(){',
        '  float life=fract(aSeed+uTime*(0.021+0.017*aSeed));',
        '  float h=0.5+life*uHeight;',
        '  vec3 p=vec3(position.x+sin(life*6.283+aSeed*11.0)*aDrift,h,position.z+cos(life*5.1+aSeed*7.0)*aDrift*0.6);',
        '  vec4 mv=modelViewMatrix*vec4(p,1.0);',
        '  gl_PointSize=clamp((34.0+52.0*aSeed)*uScale/max(1.0,-mv.z)*0.012,1.0,9.0*uPR);',
        '  vA=sin(life*3.1416)*0.55*(1.0-life*0.35);',
        '  vRise=life;',
        '  gl_Position=projectionMatrix*mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uActivity;',
        'varying float vA; varying float vRise;',
        'void main(){',
        '  vec2 q=gl_PointCoord-0.5; float r=length(q); if(r>0.5) discard;',
        '  float a=pow(max(0.0,1.0-r*2.0),2.1)*vA*uActivity;',
        '  vec3 c=mix(vec3(1.0,0.74,0.40),vec3(0.98,0.50,0.24),vRise);',
        '  gl_FragColor=vec4(c,a);',
        '}'
      ].join('\n')
    });
    motes = new THREE.Points(geometry, moteMaterial);
    motes.frustumCulled = false;
    motes.renderOrder = 3;
    world.add(motes);
  }

  /* 前景只跟随观测点平移，不继承相机旋转；否则一转头，窗框和栏杆会像贴在眼前一样跟着飘。 */
  function buildRig() {
    rig = new THREE.Group();
    rig.name = 'observation-rig';
    var bar = new THREE.BoxGeometry(1, 1, 1);
    function addBar(parent, material, x, y, z, sx, sy, sz) {
      var mesh = new THREE.Mesh(bar, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      parent.add(mesh);
      return mesh;
    }

    var wall = new THREE.Group();
    wall.name = 'indoor-window';
    var shape = new THREE.Shape();
    shape.moveTo(-4.8, -2.2); shape.lineTo(4.8, -2.2); shape.lineTo(4.8, 4.4); shape.lineTo(-4.8, 4.4); shape.lineTo(-4.8, -2.2);
    var hole = new THREE.Path();
    hole.moveTo(-3.55, -1.15); hole.lineTo(3.55, -1.15); hole.lineTo(3.55, 3.4); hole.lineTo(-3.55, 3.4); hole.lineTo(-3.55, -1.15);
    shape.holes.push(hole);
    var wallMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
      depth: 0.32, bevelEnabled: false, curveSegments: 1
    }), new THREE.MeshStandardMaterial({
      color: 0x2c2824, roughness: 0.98, metalness: 0, side: THREE.DoubleSide
    }));
    wallMesh.name = 'thick-window-wall';
    wallMesh.position.z = -4.3;
    wall.add(wallMesh);

    var room = new THREE.Group();
    room.name = 'indoor-room';
    var plaster = new THREE.MeshStandardMaterial({ color: 0x332e29, roughness: 0.97, metalness: 0 });
    var ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.94, metalness: 0 });
    var floorMaterial = new THREE.MeshStandardMaterial({ color: 0x171514, roughness: 0.78, metalness: 0.06 });
    addBar(room, plaster, -4.79, 0.92, 0.52, 0.14, 5.50, 9.68).name = 'room-left-wall';
    addBar(room, plaster, 4.79, 0.92, 0.52, 0.14, 5.50, 9.68).name = 'room-right-wall';
    addBar(room, ceilingMaterial, 0, 3.72, 0.52, 9.72, 0.14, 9.68).name = 'room-ceiling';
    addBar(room, floorMaterial, 0, -1.52, 0.52, 9.72, 0.14, 9.68).name = 'room-floor';
    addBar(room, plaster, 0, 0.92, 5.32, 9.72, 5.50, 0.14).name = 'room-back-wall';
    var trimMaterial = new THREE.MeshStandardMaterial({ color: 0x51473c, roughness: 0.7, metalness: 0.08 });
    addBar(room, trimMaterial, 0, -1.38, 5.22, 9.4, 0.12, 0.08);
    addBar(room, trimMaterial, -4.67, -1.38, 0.52, 0.08, 0.12, 9.4);
    addBar(room, trimMaterial, 4.67, -1.38, 0.52, 0.08, 0.12, 9.4);
    var roomLight = new THREE.PointLight(0xffc58f, 0.34, 13, 2);
    roomLight.name = 'indoor-warm-light';
    roomLight.position.set(2.6, 2.5, 2.4);
    room.add(roomLight);
    wall.add(room);

    var frameMaterial = new THREE.MeshStandardMaterial({ color: 0x302a25, roughness: 0.52, metalness: 0.32 });
    var revealMaterial = new THREE.MeshStandardMaterial({ color: 0x191817, roughness: 0.86, metalness: 0.04 });
    addBar(wall, revealMaterial, -3.68, 1.125, -4.14, 0.26, 4.7, 0.34);
    addBar(wall, revealMaterial, 3.68, 1.125, -4.14, 0.26, 4.7, 0.34);
    addBar(wall, revealMaterial, 0, 3.53, -4.14, 7.62, 0.26, 0.34);
    addBar(wall, revealMaterial, 0, -1.28, -4.14, 7.62, 0.26, 0.34);
    addBar(wall, frameMaterial, 0, 3.425, -4.01, 7.16, 0.095, 0.13);
    addBar(wall, frameMaterial, 0, -1.175, -4.01, 7.16, 0.095, 0.13);
    addBar(wall, frameMaterial, -3.575, 1.125, -4.01, 0.095, 4.6, 0.13);
    addBar(wall, frameMaterial, 3.575, 1.125, -4.01, 0.095, 4.6, 0.13);
    addBar(wall, new THREE.MeshStandardMaterial({ color: 0x4a4035, roughness: 0.76, metalness: 0.12 }),
      0, -1.23, -3.92, 7.55, 0.13, 0.72);
    var glass = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 4.45), new THREE.MeshBasicMaterial({
      color: 0x9fc4e8, transparent: true, opacity: 0.022, depthWrite: false, side: THREE.DoubleSide
    }));
    glass.name = 'window-glass';
    glass.position.set(0, 1.125, -4.12);
    wall.add(glass);
    wall.userData.tag = 'window';
    rig.add(wall);

    var ledge = new THREE.Group();
    ledge.name = 'observation-ledge';
    addBar(ledge, new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.9, metalness: 0.1 }),
      0, -1.82, -1.65, 5.8, 0.12, 3.0);
    var railMaterial = new THREE.MeshStandardMaterial({ color: 0x505965, roughness: 0.36, metalness: 0.72 });
    addBar(ledge, railMaterial, 0, -0.91, -3.55, 5.8, 0.045, 0.055);
    for (var i = -3; i <= 3; i++) {
      addBar(ledge, railMaterial, i * 0.84, -1.365, -3.55, 0.028, 0.91, 0.028);
    }
    var glassRail = new THREE.Group();
    var railGlassMaterial = new THREE.MeshBasicMaterial({
      color: 0x9fc4e8, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide
    });
    for (var j = -2; j <= 2; j++) {
      var pane = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.86), railGlassMaterial);
      pane.position.set(j * 0.84, -1.365, -3.56);
      glassRail.add(pane);
    }
    glassRail.userData.tag = 'glass-rail';
    glassRail.name = 'highrise-glass-rail';
    glassRail.visible = false;
    ledge.add(glassRail);
    ledge.userData.tag = 'ledge';
    ledge.visible = false;
    rig.add(ledge);

    rig.visible = false;
    scene.add(rig);
    scene.add(camera);
  }

  /* 虚拟机器人：一台能开上马路的照度车。几何本身就是解释——
     筒口张开的视场锥画在画面里，锥的亮度跟着「灯直射进来的那一份」走，
     所以「设备说天很亮」不必用文字辩护，看一眼锥口就知道它照到了什么。
     它挂在 scene 上而不是 world 里：换城市不该把车拆了，位置每帧重算。 */
  function buildRover() {
    roverGroup = new THREE.Group();
    var shell = new THREE.MeshStandardMaterial({ color: 0x2b313c, roughness: 0.62, metalness: 0.44 });
    var trim = new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.36, metalness: 0.8 });
    var rubber = new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.94, metalness: 0.05 });

    var chassis = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.24, 1.04), shell);
    chassis.position.y = 0.3;
    roverGroup.add(chassis);
    var deck = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.54), trim);
    deck.position.set(0, 0.48, -0.18);
    roverGroup.add(deck);
    var wheelGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14);
    wheelGeometry.rotateZ(Math.PI / 2);
    [[-0.38, -0.36], [0.38, -0.36], [-0.38, 0.36], [0.38, 0.36]].forEach(function (item) {
      var wheel = new THREE.Mesh(wheelGeometry, rubber);
      wheel.position.set(item[0], 0.17, item[1]);
      roverGroup.add(wheel);
    });
    var mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.058, 0.74, 8), trim);
    mast.position.set(0, 0.84, 0.2);
    roverGroup.add(mast);

    roverAim = new THREE.Group();
    roverAim.position.set(0, 1.18, 0.2);
    roverAim.rotation.order = 'YXZ';
    roverGroup.add(roverAim);
    var dome = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.155, 0.15, 18),
      new THREE.MeshStandardMaterial({
        color: 0xd8b25c, emissive: 0x74581f, emissiveIntensity: 0.8, roughness: 0.32, metalness: 0.7
      }));
    roverAim.add(dome);
    roverTube = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: 0.5, metalness: 0.66, side: THREE.DoubleSide }));
    roverTube.position.y = 0.3;
    roverTube.visible = false;
    roverAim.add(roverTube);

    var beamGeometry = new THREE.ConeGeometry(1, 1, 22, 1, true);
    beamGeometry.translate(0, -0.5, 0);
    beamGeometry.rotateX(Math.PI);
    roverBeamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc978, transparent: true, opacity: 0.075, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
    });
    roverBeam = new THREE.Mesh(beamGeometry, roverBeamMaterial);
    roverBeam.renderOrder = 3;
    roverAim.add(roverBeam);

    var ringGeometry = new THREE.PlaneGeometry(3.4, 3.4);
    ringGeometry.rotateX(-Math.PI / 2);
    roverRingMaterial = new THREE.MeshBasicMaterial({
      map: makeLightPoolTexture(), color: 0xd8b25c, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    roverRing = new THREE.Mesh(ringGeometry, roverRingMaterial);
    roverRing.position.y = 0.085;
    roverRing.renderOrder = 2;
    roverGroup.add(roverRing);

    roverGroup.visible = false;
    scene.add(roverGroup);
  }

  function disposeWorld() {
    if (!world) return;
    var geometries = Object.create(null), materials = Object.create(null), textures = Object.create(null);
    world.traverse(function (obj) {
      if (obj.geometry && !geometries[obj.geometry.uuid]) {
        geometries[obj.geometry.uuid] = obj.geometry;
      }
      if (obj.material) {
        var list = Array.isArray(obj.material) ? obj.material : [obj.material];
        list.forEach(function (mat) {
          if (materials[mat.uuid]) return;
          materials[mat.uuid] = mat;
          Object.keys(mat).forEach(function (key) {
            var value = mat[key];
            if (value && value.isTexture && !textures[value.uuid]) textures[value.uuid] = value;
          });
        });
      }
    });
    scene.remove(world);
    Object.keys(geometries).forEach(function (key) { geometries[key].dispose(); });
    Object.keys(materials).forEach(function (key) { materials[key].dispose(); });
    Object.keys(textures).forEach(function (key) { textures[key].dispose(); });
    world = null;
    facadeMaterials = [];
    bulbMaterial = null;
    laneMaterial = null;
    signMaterial = null;
    lampGlowMaterial = null;
    lampPoolMaterial = null;
    wetStreakMaterial = null;
    skylineGlowMaterial = null;
    motes = null;
    moteMaterial = null;
  }

  function buildWorld() {
    disposeWorld();
    world = new THREE.Group();
    scene.add(world);
    buildingCount = 0; treeCount = 0; lampCount = 0; grassCount = 0;
    buildGround();
    buildArchitecture();
    buildStreetFurniture();
    buildTrees();
    buildHorizon();
    buildMotes();
  }

  function buildGround() {
    var geometry = new THREE.PlaneGeometry(2700, 3300, 30, 64);
    geometry.rotateX(-Math.PI / 2);
    var pos = geometry.attributes.position;
    var colors = new Float32Array(pos.count * 3);
    var random = rng(city.seed + 4);
    var cityColor = new THREE.Color(0x20242b), fieldColor = new THREE.Color(0x273126);
    for (var i = 0; i < pos.count; i++) {
      var t = routeAt(pos.getZ(i) - 450);
      var c = cityColor.clone().lerp(fieldColor, smoothstep(0.28, 0.9, t));
      var noise = 0.82 + random() * 0.32;
      colors[i * 3] = c.r * noise; colors[i * 3 + 1] = c.g * noise; colors[i * 3 + 2] = c.b * noise;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    var ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      map: makeGroundTexture(), vertexColors: true, roughness: 0.96, metalness: 0.02
    }));
    ground.position.z = -450;
    world.add(ground);

    var asphalt = makeAsphaltTexture();
    /* 成因②「地面要反」的第一半：让路面有干湿差别。
       roughnessMap 的绿通道乘 material.roughness——水洼处 0.85×0.18≈0.15（近镜面），
       干燥处 0.85×0.98≈0.83（哑光）。全是同一个粗糙度时，灯下灯外一样灰，
       看着就是「铺了张沥青贴图」而不是「夜里刚下过雨的路」。 */
    var road = new THREE.Mesh(new THREE.PlaneGeometry(city.road, 3100), new THREE.MeshStandardMaterial({
      map: asphalt, roughnessMap: makeWetnessTexture(), color: 0x8b9099,
      roughness: 0.98, metalness: 0.08
    }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.025, -450);
    world.add(road);

    laneMaterial = new THREE.MeshBasicMaterial({ color: 0xb9b3a1, transparent: true, opacity: 0.48 });
    var edgeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.018, 3050), laneMaterial);
    edgeLeft.position.set(-city.road / 2 + 0.7, 0.045, -450);
    world.add(edgeLeft);
    var edgeRight = edgeLeft.clone();
    edgeRight.position.x = city.road / 2 - 0.7;
    world.add(edgeRight);

    var dashes = [];
    for (var z = 930; z > -1920; z -= 19) dashes.push({ x: 0, y: 0.052, z: z, sx: 0.13, sy: 0.02, sz: 7.5 });
    addInstances('lane', dashes, new THREE.BoxGeometry(1, 1, 1), laneMaterial, null);

    var crossPositions = [650, 340, 30, -280, -590, -900, -1210, -1520, -1830];
    crossPositions.forEach(function (z) {
      var t = routeAt(z);
      var cross = new THREE.Mesh(new THREE.PlaneGeometry(620, 13), new THREE.MeshStandardMaterial({
        color: t > 0.62 ? 0x393a31 : 0x3d4148, roughness: 0.94, metalness: 0.01
      }));
      cross.rotation.x = -Math.PI / 2;
      cross.position.set(0, 0.035, z);
      world.add(cross);
    });

    /* 人行道旧值 0x55565a + roughness 0.9：夜里被灯一照成两条白带，
       是画面里最不像实景的一块（真实湿水泥在夜里是深灰带一层水光）。
       压暗并降粗糙度，让它接住灯的光斑而不是自己发白。 */
    var sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x35383e, roughness: 0.62, metalness: 0.06 });
    var sidewalks = [];
    for (z = 890; z > -720; z -= 54) {
      if (Math.abs((z - 650) % 310) < 28) continue;
      sidewalks.push({ x: -city.road / 2 - 2.8, y: 0.11, z: z, sx: 5.2, sy: 0.18, sz: 48 });
      sidewalks.push({ x: city.road / 2 + 2.8, y: 0.11, z: z, sx: 5.2, sy: 0.18, sz: 48 });
    }
    addInstances('sidewalk', sidewalks, new THREE.BoxGeometry(1, 1, 1), sidewalkMaterial, null);

    var fieldTexture = makeFieldTexture();
    var fieldMaterials = [0x46513a, 0x4b503b, 0x394735, 0x514b37].map(function (color) {
      return new THREE.MeshStandardMaterial({ color: color, map: fieldTexture, roughness: 1 });
    });
    for (i = 0; i < 12; i++) {
      var side = i % 2 ? 1 : -1;
      var strip = new THREE.Mesh(new THREE.PlaneGeometry(95, 520), fieldMaterials[i % fieldMaterials.length]);
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(side * (45 + Math.floor(i / 2) * 102), 0.045, -1780 + (i % 3) * 18);
      world.add(strip);
    }

    var tufts = [];
    for (i = 0; i < 2600; i++) {
      var t = 0.4 + random() * 0.6;
      var z = lerp(-520, -2020, random());
      var x = (random() < 0.5 ? -1 : 1) * (city.road / 2 + 5 + Math.pow(random(), 1.7) * 330);
      var scale = lerp(0.35, 1.2, t) * (0.7 + random() * 0.7);
      tufts.push({
        x: x, y: 0.065, z: z, sx: 0.22 + random() * 0.34, sy: scale, sz: 0.22 + random() * 0.34,
        ry: random() * Math.PI * 2, c: new THREE.Color(0x526047).multiplyScalar(0.68 + random() * 0.42)
      });
    }
    grassCount = tufts.length;
    addInstances('field-grass', tufts, makeGrassGeometry(), new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, side: THREE.DoubleSide, vertexColors: true
    }), true);
  }

  function makeGrassGeometry() {
    var positions = [];
    for (var i = 0; i < 3; i++) {
      var angle = i * Math.PI / 3, c = Math.cos(angle), s = Math.sin(angle);
      positions.push(-0.5 * c, 0, -0.5 * s, 0.5 * c, 0, 0.5 * s, 0.18 * c, 1, 0.18 * s);
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }

  function makeGroundTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    var ctx = canvas.getContext('2d'), random = rng(city.seed + 4);
    ctx.fillStyle = '#e2dfd5'; ctx.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 14000; i++) {
      var v = Math.floor(95 + random() * 95);
      ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 8) + ',' + (0.08 + random() * 0.16) + ')';
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1 + random() * 3);
    }
    for (i = 0; i < 1800; i++) {
      var x = random() * 512, y = random() * 512;
      ctx.strokeStyle = 'rgba(38,48,35,' + (0.08 + random() * 0.12) + ')';
      ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + random() * 4 - 2, y - 2 - random() * 5); ctx.stroke();
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 24);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function makeFieldTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    var ctx = canvas.getContext('2d'), random = rng(city.seed + 27);
    ctx.fillStyle = '#d8d5ca'; ctx.fillRect(0, 0, 512, 512);
    for (var y = 0; y < 512; y += 32) {
      ctx.fillStyle = 'rgba(45,52,39,' + (0.16 + random() * 0.12) + ')';
      ctx.fillRect(0, y, 512, 3 + random() * 3);
      ctx.fillStyle = 'rgba(205,204,184,' + (0.08 + random() * 0.1) + ')';
      ctx.fillRect(0, y + 6, 512, 2);
    }
    for (var i = 0; i < 9000; i++) {
      var v = Math.floor(80 + random() * 110);
      ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 10) + ',0.12)';
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 2, 1 + random() * 2);
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 5);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function makeAsphaltTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    var ctx = canvas.getContext('2d');
    var random = rng(city.seed + 22);
    /* 路面贴图的对比度就是「地面反不反」的下限。
       旧值：底色 #5a5b60（90 灰）+ 7000 粒 alpha 0.08~0.26 → 整张贴图实际只有 ±3 的起伏，
       近处 4~6m 那一段实测 sd/mean=0.10、没有一个像素超过 90——
       画面上就是「铺了张灰纸」，这也是实景感最差的一大块。
       现在压暗底色、拉开颗粒反差，让干燥沥青本身有明暗，反光才有个「反」的对象。 */
    ctx.fillStyle = '#2c2e35'; ctx.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 7000; i++) {
      var v = Math.floor(16 + random() * 205);
      ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 6) + ',' + (0.16 + random() * 0.42) + ')';
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 2, 1 + random() * 2);
    }
    for (i = 0; i < 26; i++) {
      var pv = Math.floor(200 + random() * 55);
      ctx.fillStyle = 'rgba(' + pv + ',' + pv + ',' + (pv - 8) + ',' + (0.05 + random() * 0.10) + ')';
      ctx.beginPath();
      ctx.arc(random() * 256, random() * 256, 2 + random() * 9, 0, 6.2832);
      ctx.fill();
    }
    for (i = 0; i < 9; i++) {
      ctx.strokeStyle = 'rgba(20,22,28,' + (0.08 + random() * 0.08) + ')';
      ctx.lineWidth = 0.5 + random();
      ctx.beginPath();
      var x = random() * 256, y = random() * 256;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + random() * 30 - 15, y + 20, x + random() * 45 - 22, y + 50, x + random() * 60 - 30, y + 90);
      ctx.stroke();
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    /* repeat 从 (2,90) 改成近正方形：旧值一块贴图铺成 13m×34m 的长方形，
       近处 4m 的路面只落在 1/3 块贴图里，颗粒被拉平——地面必然是一片死灰。
       现在一块约 3.4m×3.4m，颗粒在画面里是 3~4 像素，才看得见「粗糙的路」。 */
    texture.repeat.set(7, 900);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function makeFacade(style, band, variant) {
    var canvas = document.createElement('canvas'), emissive = document.createElement('canvas');
    canvas.width = emissive.width = 512;
    canvas.height = emissive.height = 1024;
    var ctx = canvas.getContext('2d'), ec = emissive.getContext('2d');
    variant = variant || 0;
    var random = rng(city.seed + style.length * 71 + style.charCodeAt(0) + (band || 0) * 193 + variant * 997);
    var base = style === 'glass' ? '#4b5b68' : style === 'brick' ? '#78675c' : '#85837c';
    ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 1024);
    ec.fillStyle = '#000'; ec.fillRect(0, 0, 512, 1024);

    if (style === 'glass') {
      var glassTone = ctx.createLinearGradient(0, 0, 512, 1024);
      glassTone.addColorStop(0, 'rgba(118,151,173,.20)');
      glassTone.addColorStop(0.46, 'rgba(30,49,64,.02)');
      glassTone.addColorStop(1, 'rgba(6,15,24,.28)');
      ctx.fillStyle = glassTone; ctx.fillRect(0, 0, 512, 1024);
      for (var gx = 0; gx < 512; gx += 64) {
        ctx.fillStyle = 'rgba(8,15,21,.32)'; ctx.fillRect(gx, 0, 3, 1024);
        ctx.fillStyle = 'rgba(151,174,190,.08)'; ctx.fillRect(gx + 3, 0, 1, 1024);
      }
    } else if (style === 'brick') {
      ctx.strokeStyle = 'rgba(27,21,18,.34)'; ctx.lineWidth = 1.2;
      for (var by = 0; by < 1024; by += 12) {
        ctx.fillStyle = 'rgba(255,226,198,' + (0.015 + random() * 0.025) + ')';
        ctx.fillRect(0, by, 512, 12);
        ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(512, by); ctx.stroke();
        for (var bx = (by / 12) % 2 ? -14 : 0; bx < 512; bx += 28) {
          ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by + 12); ctx.stroke();
        }
      }
    } else {
      ctx.fillStyle = 'rgba(25,27,28,.16)'; ctx.fillRect(254, 0, 3, 1024);
      ctx.fillStyle = 'rgba(235,232,218,.09)'; ctx.fillRect(258, 0, 1, 1024);
      for (var cy = 170; cy < 1024; cy += 170) {
        ctx.fillStyle = 'rgba(30,31,31,.12)'; ctx.fillRect(0, cy, 512, 2);
      }
    }

    for (var i = 0; i < 13000; i++) {
      var v = random() > 0.48 ? 255 : 15;
      ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (random() * 0.032) + ')';
      ctx.fillRect(random() * 512, random() * 1024, 0.6 + random() * 2.2, 0.6 + random() * 3.4);
    }
    for (i = 0; i < 22; i++) {
      var sx = random() * 512, sw = 2 + random() * 12, stain = ctx.createLinearGradient(sx, 0, sx + sw, 0);
      stain.addColorStop(0, 'rgba(15,18,17,0)');
      stain.addColorStop(0.5, 'rgba(15,18,17,' + (0.018 + random() * 0.045) + ')');
      stain.addColorStop(1, 'rgba(15,18,17,0)');
      ctx.fillStyle = stain; ctx.fillRect(sx, random() * 180, sw, 300 + random() * 724);
    }
    var edgeShade = ctx.createLinearGradient(0, 0, 512, 0);
    edgeShade.addColorStop(0, 'rgba(4,8,11,.24)');
    edgeShade.addColorStop(0.08, 'rgba(4,8,11,0)');
    edgeShade.addColorStop(0.92, 'rgba(4,8,11,0)');
    edgeShade.addColorStop(1, 'rgba(4,8,11,.22)');
    ctx.fillStyle = edgeShade; ctx.fillRect(0, 0, 512, 1024);

    var cols = style === 'glass' ? 14 : style === 'brick' ? 10 : 12;
    var rows = style === 'house' ? 8 : [12, 18, 28, 48][band || 0];
    var marginX = style === 'glass' ? 12 : 25;
    var top = style === 'house' ? 70 : 28;
    var cellW = (512 - marginX * 2) / cols, cellH = (1024 - top - 28) / rows;
    var litWindows = [];
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var x = marginX + col * cellW + cellW * 0.13 + (random() - 0.5) * cellW * 0.08;
        var y = top + row * cellH + cellH * 0.16 + (random() - 0.5) * cellH * 0.07;
        var w = cellW * (style === 'glass' ? 0.76 : 0.61) * (0.92 + random() * 0.16);
        var h = cellH * (style === 'glass' ? 0.69 : 0.55) * (0.92 + random() * 0.14);
        var litChance = (style === 'house' ? 0.2 : style === 'brick' ? 0.29 : 0.22) + variant * 0.035;
        var lit = random() < litChance;
        ctx.fillStyle = 'rgba(4,7,10,.66)'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
        var gradient = ctx.createLinearGradient(x, y, x + w, y + h);
        if (lit) {
          gradient.addColorStop(0, random() < 0.5 ? '#b18452' : '#c0aa7d');
          gradient.addColorStop(0.55, random() < 0.5 ? '#94724e' : '#9e967e');
          gradient.addColorStop(1, '#443f36');
        } else {
          gradient.addColorStop(0, style === 'glass' ? '#1d3444' : '#17232e');
          gradient.addColorStop(0.55, style === 'glass' ? '#101f2c' : '#0d1721');
          gradient.addColorStop(1, '#060c13');
        }
        ctx.fillStyle = gradient; ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(169,194,214,.10)'; ctx.fillRect(x + 1, y + 1, w - 2, Math.max(1, h * 0.24));
        if (lit && random() < 0.58) {
          ctx.fillStyle = 'rgba(48,43,37,.38)';
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * (0.15 + random() * 0.18), y);
          ctx.lineTo(x + w * 0.28, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = style === 'glass' ? 'rgba(154,178,193,.32)' : 'rgba(7,10,13,.74)';
        ctx.lineWidth = style === 'glass' ? 1.4 : 2.2; ctx.strokeRect(x, y, w, h);
        if (style !== 'glass') {
          ctx.fillStyle = 'rgba(7,10,13,.64)'; ctx.fillRect(x + w * 0.48, y, 1.4, h);
          ctx.fillStyle = style === 'brick' ? 'rgba(137,119,99,.48)' : 'rgba(183,180,167,.30)';
          ctx.fillRect(x - 3, y + h + 1, w + 6, style === 'brick' ? 3 : 2);
          if (style === 'brick') {
            ctx.fillStyle = 'rgba(35,28,24,.45)'; ctx.fillRect(x - 4, y - 3, w + 8, 2);
          }
        } else {
          ctx.fillStyle = 'rgba(164,185,199,.18)'; ctx.fillRect(x + w * 0.5, y, 1, h);
        }
        if (lit) {
          litWindows.push({
            x: x, y: y, w: w, h: h,
            warm: random() < 0.74,
            bright: 0.40 + random() * 0.60,
            lampX: x + w * (0.18 + random() * 0.64),
            lampY: y + h * (0.12 + random() * 0.52),
            curtain: random() < 0.44 ? 0.28 + random() * 0.44 : 0
          });
        }
      }
    }
    /* 灯光溢出（成因①在立面上的那一半）：真实夜景照片里亮窗不是贴在黑墙上的硬边方块，
       它会在自己周围那一片墙上糊出一圈暖光，密窗处连成一片。
       光晕必须用「加色」叠：覆盖叠加会让后画的窗把先画的窗光吃掉，
       做不出「一整面楼在发光」，只会得到一圈孤立的光斑。 */
    ec.globalCompositeOperation = 'lighter';
    for (var li = 0; li < litWindows.length; li++) {
      var w1 = litWindows[li], cx = w1.x + w1.w / 2, cy = w1.y + w1.h / 2;
      var rad = Math.max(w1.w, w1.h) * (1.5 + w1.bright * 0.85);
      var ha = (w1.warm ? 0.105 : 0.062) * w1.bright;
      var halo = ec.createRadialGradient(cx, cy, Math.max(0.5, w1.w * 0.18), cx, cy, rad);
      halo.addColorStop(0, (w1.warm ? 'rgba(216,146,72,' : 'rgba(150,178,210,') + ha.toFixed(4) + ')');
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ec.fillStyle = halo; ec.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    /* 窗芯：每扇窗自己的色温、亮度、灯位、窗帘——
       上一版所有亮窗共用一个纯色矩形，放大看就是「点阵印刷」，一眼假。 */
    for (var lj = 0; lj < litWindows.length; lj++) {
      var w2 = litWindows[lj], k = w2.bright;
      var top = w2.warm ? [228, 176, 108] : [186, 206, 228];
      var bot = w2.warm ? [146, 92, 44] : [104, 126, 148];
      var core = ec.createLinearGradient(w2.x, w2.y, w2.x, w2.y + w2.h);
      core.addColorStop(0, 'rgb(' + Math.round(top[0] * k) + ',' + Math.round(top[1] * k) + ',' + Math.round(top[2] * k) + ')');
      core.addColorStop(1, 'rgb(' + Math.round(bot[0] * k) + ',' + Math.round(bot[1] * k) + ',' + Math.round(bot[2] * k) + ')');
      ec.globalCompositeOperation = 'source-over';
      ec.fillStyle = core; ec.fillRect(w2.x + 1, w2.y + 1, w2.w - 2, w2.h - 2);
      ec.globalCompositeOperation = 'lighter';
      var hot = ec.createRadialGradient(w2.lampX, w2.lampY, 0, w2.lampX, w2.lampY, Math.max(w2.w, w2.h) * 0.6);
      hot.addColorStop(0, 'rgba(255,240,214,' + (0.46 * k).toFixed(3) + ')');
      hot.addColorStop(1, 'rgba(255,240,214,0)');
      ec.fillStyle = hot; ec.fillRect(w2.x, w2.y, w2.w, w2.h);
      ec.globalCompositeOperation = 'source-over';
      if (w2.curtain) {
        ec.fillStyle = 'rgba(8,9,12,.74)';
        ec.fillRect(w2.x + 1, w2.y + 1, (w2.w - 2) * w2.curtain, w2.h - 2);
      }
      ec.fillStyle = 'rgba(0,0,0,.58)'; ec.fillRect(w2.x + w2.w * 0.48, w2.y, 1.4, w2.h);
    }
    if (style === 'house') {
      ctx.fillStyle = '#22252a'; ctx.fillRect(224, 744, 70, 280);
      ctx.fillStyle = '#6d604d'; ctx.fillRect(235, 770, 48, 254);
      ctx.fillStyle = '#b9a47a'; ctx.fillRect(270, 892, 5, 5);
      ctx.fillStyle = 'rgba(10,12,15,.4)'; ctx.fillRect(0, 728, 512, 10);
    }
    var dirt = ctx.createLinearGradient(0, 820, 0, 1024);
    dirt.addColorStop(0, 'rgba(24,25,22,0)');
    dirt.addColorStop(1, 'rgba(24,25,22,.22)');
    ctx.fillStyle = dirt; ctx.fillRect(0, 820, 512, 204);

    var map = new THREE.CanvasTexture(canvas), emap = new THREE.CanvasTexture(emissive);
    map.encoding = emap.encoding = THREE.sRGBEncoding;
    map.anisotropy = emap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var material = new THREE.MeshStandardMaterial({
      map: map, bumpMap: map, bumpScale: style === 'glass' ? 0.035 : 0.085,
      emissiveMap: emap, emissive: 0xffffff, emissiveIntensity: 1.25,
      roughness: style === 'glass' ? 0.32 : 0.86, metalness: style === 'glass' ? 0.48 : 0.025,
      color: 0xe2e4e5, vertexColors: true
    });
    facadeMaterials.push(material);
    return material;
  }

  function makePodiumFacade(variant) {
    var canvas = document.createElement('canvas'), emissive = document.createElement('canvas');
    canvas.width = emissive.width = 512;
    canvas.height = emissive.height = 256;
    var ctx = canvas.getContext('2d'), ec = emissive.getContext('2d');
    var random = rng(city.seed + 711 + variant * 313);
    ctx.fillStyle = '#777b7d'; ctx.fillRect(0, 0, 512, 256);
    ec.fillStyle = '#000'; ec.fillRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(24,28,31,.48)'; ctx.fillRect(0, 46, 512, 9);
    ctx.fillStyle = 'rgba(222,220,207,.25)'; ctx.fillRect(0, 56, 512, 3);
    var bays = 3 + variant;
    var bayW = 512 / bays;
    for (var i = 0; i < bays; i++) {
      var x = i * bayW + 10, w = bayW - 20;
      var lit = random() < 0.68;
      var glass = ctx.createLinearGradient(x, 76, x + w, 222);
      glass.addColorStop(0, lit ? '#8b775a' : '#24343d');
      glass.addColorStop(0.52, lit ? '#5d584b' : '#15242d');
      glass.addColorStop(1, lit ? '#353b3c' : '#0b161e');
      ctx.fillStyle = 'rgba(12,16,19,.72)'; ctx.fillRect(x - 4, 72, w + 8, 158);
      ctx.fillStyle = glass; ctx.fillRect(x, 76, w, 150);
      ctx.fillStyle = 'rgba(168,192,204,.18)'; ctx.fillRect(x + 3, 79, w - 6, 28);
      ctx.fillStyle = 'rgba(14,18,21,.72)'; ctx.fillRect(x + w * 0.48, 76, 4, 150);
      ctx.fillStyle = 'rgba(190,194,190,.32)'; ctx.fillRect(x + w * 0.5, 76, 1, 150);
      if (lit) {
        ec.fillStyle = '#b99462'; ec.fillRect(x + 2, 78, w - 4, 146);
        ec.fillStyle = 'rgba(0,0,0,.62)'; ec.fillRect(x + w * 0.48, 78, 4, 146);
        for (var s = 0; s < 3; s++) {
          ctx.fillStyle = 'rgba(30,31,28,' + (0.18 + random() * 0.22) + ')';
          ctx.fillRect(x + 8 + random() * (w - 24), 100 + random() * 82, 7 + random() * 18, 28 + random() * 34);
        }
      }
      ctx.fillStyle = i % 2 ? '#4d625f' : '#715548';
      ctx.fillRect(x - 6, 58, w + 12, 15);
      ctx.fillStyle = 'rgba(238,226,198,.18)'; ctx.fillRect(x - 6, 58, w + 12, 2);
    }
    for (var n = 0; n < 2600; n++) {
      var v = random() > 0.5 ? 255 : 20;
      ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (random() * 0.035) + ')';
      ctx.fillRect(random() * 512, random() * 256, 1 + random() * 2, 1 + random() * 2);
    }
    var dirt = ctx.createLinearGradient(0, 170, 0, 256);
    dirt.addColorStop(0, 'rgba(22,25,24,0)');
    dirt.addColorStop(1, 'rgba(22,25,24,.32)');
    ctx.fillStyle = dirt; ctx.fillRect(0, 170, 512, 86);
    var map = new THREE.CanvasTexture(canvas), emap = new THREE.CanvasTexture(emissive);
    map.encoding = emap.encoding = THREE.sRGBEncoding;
    map.anisotropy = emap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    var material = new THREE.MeshStandardMaterial({
      map: map, emissiveMap: emap, emissive: 0xffffff, emissiveIntensity: 1.2,
      roughness: 0.78, metalness: 0.08, color: 0xd7d9d8, vertexColors: true
    });
    facadeMaterials.push(material);
    return material;
  }

  function buildArchitecture() {
    var random = rng(city.seed);
    var data = { glass: [], concrete: [], brick: [], house: [], podium: [] };
    var roofs = [], roofUnits = [], chimneys = [], darkBoxes = [];
    var parapets = [], facadeFins = [], balconySlabs = [], balconyRails = [], canopies = [];
    var cross = [650, 340, 30, -280, -590, -900, -1210, -1520, -1830];

    function nearCross(z) {
      for (var i = 0; i < cross.length; i++) if (Math.abs(z - cross[i]) < 28) return true;
      return false;
    }
    function addBuilding(kind, x, z, w, d, h, color) {
      var podium = Math.min(h * 0.22, 7.5);
      var variant = Math.floor(random() * 3);
      var roadSide = x < 0 ? 1 : -1;
      data.podium.push({ x: x, y: podium / 2, z: z, sx: w * 1.08, sy: podium, sz: d * 1.06, c: color, variant: variant });
      if (h > 10) {
        var towerH = h - podium, roofW = w, roofD = d;
        if (towerH > 34 && random() < 0.58) {
          var lowerH = towerH * (0.56 + random() * 0.14);
          var upperH = towerH - lowerH;
          var shrink = 0.78 + random() * 0.12;
          var shiftX = (random() - 0.5) * w * 0.08;
          var shiftZ = (random() - 0.5) * d * 0.08;
          data[kind].push({ x: x, y: podium + lowerH / 2, z: z, sx: w, sy: lowerH, sz: d, c: color, variant: variant });
          data[kind].push({ x: x + shiftX, y: podium + lowerH + upperH / 2, z: z + shiftZ, sx: w * shrink, sy: upperH, sz: d * shrink, c: color, variant: variant });
          darkBoxes.push({ x: x, y: podium + lowerH + 0.12, z: z, sx: w * 1.025, sy: 0.24, sz: d * 1.025, c: null });
          roofW = w * shrink; roofD = d * shrink;
          var railH = 0.85 + random() * 0.45;
          parapets.push({ x: x + shiftX, y: h + railH / 2, z: z + shiftZ - roofD / 2, sx: roofW + 0.24, sy: railH, sz: 0.18, c: null });
          parapets.push({ x: x + shiftX, y: h + railH / 2, z: z + shiftZ + roofD / 2, sx: roofW + 0.24, sy: railH, sz: 0.18, c: null });
          parapets.push({ x: x + shiftX - roofW / 2, y: h + railH / 2, z: z + shiftZ, sx: 0.18, sy: railH, sz: roofD, c: null });
          parapets.push({ x: x + shiftX + roofW / 2, y: h + railH / 2, z: z + shiftZ, sx: 0.18, sy: railH, sz: roofD, c: null });
          var finCount = 3 + Math.floor(random() * 3);
          for (var f = 0; f < finCount; f++) {
            var fz = z - d * 0.38 + f / Math.max(1, finCount - 1) * d * 0.76;
            facadeFins.push({ x: x + roadSide * (w / 2 + 0.08), y: podium + lowerH * 0.5, z: fz, sx: 0.22, sy: lowerH * 0.94, sz: 0.38, c: null });
          }
        } else {
          data[kind].push({ x: x, y: podium + towerH / 2, z: z, sx: w, sy: towerH, sz: d, c: color, variant: variant });
        }
        if (h > 18 && random() < 0.32) {
          var balconyX = x + roadSide * (w / 2 + 0.48);
          var floors = 2 + Math.floor(random() * 3);
          for (var b = 0; b < floors; b++) {
            var by = podium + towerH * (0.26 + b * 0.17);
            balconySlabs.push({ x: balconyX, y: by, z: z, sx: 1.05, sy: 0.16, sz: d * (0.48 + random() * 0.24), c: null });
            balconyRails.push({ x: balconyX + roadSide * 0.48, y: by + 0.55, z: z, sx: 0.07, sy: 1.0, sz: d * 0.72, c: null });
          }
        }
        if (h > 13) {
          canopies.push({ x: x + roadSide * (w / 2 + 1.15), y: 3.65, z: z, sx: 2.35, sy: 0.18, sz: Math.min(6.5, d * 0.42), c: null });
        }
      }
      darkBoxes.push({ x: x, y: h + 0.16, z: z, sx: roofW * 1.02, sy: 0.32, sz: roofD * 1.02, c: null });
      buildingCount++;
      if (h > 25) {
        var units = h > 75 ? 3 : 1;
        for (var u = 0; u < units; u++) {
          roofUnits.push({
            x: x + (random() - 0.5) * roofW * 0.55, y: h + 1.0 + random() * 0.6,
            z: z + (random() - 0.5) * roofD * 0.5,
            sx: 2.5 + random() * 3.5, sy: 1.4 + random() * 1.6, sz: 2.2 + random() * 3.2, c: null
          });
        }
        if (h > 80 && random() < 0.42) {
          roofUnits.push({ x: x, y: h + 7, z: z, sx: 0.18, sy: 14, sz: 0.18, c: null });
        }
      }
    }

    for (var side = -1; side <= 1; side += 2) {
      for (var row = 0; row < 4; row++) {
        var baseX = 34 + row * 48;
        for (var z = 890; z > -820; z -= 48 + row * 3) {
          if (nearCross(z)) continue;
          var t = routeAt(z), density = 1 - smoothstep(0.18, 0.64, t);
          if (random() > 0.5 + density * 0.48) continue;
          var x = side * (baseX + random() * 14);
          var w = 18 + random() * 18, d = 20 + random() * 18;
          var h = (14 + Math.pow(random(), 0.72) * city.maxHeight) * lerp(0.42, 1, density) * city.height;
          if (row === 0 && t < 0.26) h += (20 + random() * 45 * city.height) * city.towerBoost;
          var kind = city.facade;
          if (random() < 0.32) kind = 'concrete';
          if (random() < 0.18) kind = 'brick';
          var shade = 0.72 + random() * 0.28;
          addBuilding(kind, x, z + (random() - 0.5) * 10, w, d, h, new THREE.Color(shade, shade * 0.98, shade * 0.94));
        }
      }
    }

    if (cityKey === 'beijing') {
      addBuilding('glass', -61, 770, 30, 34, 152 * city.height, new THREE.Color(0.78, 0.85, 0.9));
      addBuilding('glass', 72, 710, 26, 30, 126 * city.height, new THREE.Color(0.84, 0.86, 0.9));
      addBuilding('concrete', -104, 480, 38, 36, 96 * city.height, new THREE.Color(0.78, 0.8, 0.82));
      addBuilding('glass', 116, 390, 32, 28, 108 * city.height, new THREE.Color(0.8, 0.85, 0.9));
    } else {
      addBuilding('brick', -57, 760, 34, 30, 34, new THREE.Color(0.86, 0.78, 0.7));
      addBuilding('concrete', 63, 690, 42, 32, 28, new THREE.Color(0.8, 0.82, 0.84));
      addBuilding('brick', -92, 520, 32, 42, 24, new THREE.Color(0.84, 0.78, 0.72));
      addBuilding('concrete', 105, 420, 38, 34, 26, new THREE.Color(0.82, 0.83, 0.85));
    }

    for (side = -1; side <= 1; side += 2) {
      for (z = -720; z > -1870; z -= 72) {
        if (random() < 0.16) continue;
        var x = side * (31 + random() * 82);
        var w = 8 + random() * 5, d = 9 + random() * 5, h = 4.2 + random() * 2.6;
        var shade = 0.72 + random() * 0.28;
        data.house.push({ x: x, y: h / 2, z: z, sx: w, sy: h, sz: d, c: new THREE.Color(shade, shade * 0.96, shade * 0.88), variant: Math.floor(random() * 3) });
        roofs.push({ x: x, y: h, z: z, sx: w * 1.12, sy: 2.0 + random() * 1.5, sz: d * 1.14, c: new THREE.Color(0.26 + random() * 0.12, 0.25 + random() * 0.08, 0.23 + random() * 0.07) });
        darkBoxes.push({ x: x, y: h + 0.12, z: z, sx: w * 1.04, sy: 0.24, sz: d * 1.04, c: null });
        if (random() < 0.65) chimneys.push({ x: x + w * 0.27, y: h + 1.7, z: z - d * 0.2, sx: 0.65, sy: 2.1, sz: 0.65, c: null });
        buildingCount++;
      }
    }

    var boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    ['glass', 'concrete', 'brick', 'house'].forEach(function (kind) {
      if (!data[kind].length) return;
      var bands = [[], [], [], []];
      data[kind].forEach(function (item) {
        var height = item.sy;
        var band = kind === 'house' ? 0 : height < 11 ? 0 : height < 24 ? 1 : height < 44 ? 2 : 3;
        bands[band].push(item);
      });
      bands.forEach(function (items, band) {
        var variants = [[], [], []];
        items.forEach(function (item) { variants[item.variant || 0].push(item); });
        variants.forEach(function (group, variant) {
          if (group.length) addInstances('facade-' + kind + '-' + band + '-' + variant, group, boxGeometry, makeFacade(kind, band, variant), true);
        });
      });
    });
    var podiumGroups = [[], [], []];
    data.podium.forEach(function (item) { podiumGroups[item.variant || 0].push(item); });
    podiumGroups.forEach(function (items, variant) {
      if (items.length) addInstances('podium-' + variant, items, boxGeometry, makePodiumFacade(variant), true);
    });
    var reliefMaterial = new THREE.MeshStandardMaterial({ color: 0x666b70, roughness: 0.82, metalness: 0.08 });
    var darkMaterial = new THREE.MeshStandardMaterial({ color: 0x4b5057, roughness: 0.76, metalness: 0.12, vertexColors: true });
    addInstances('roof-parapets', parapets, boxGeometry, reliefMaterial, false);
    addInstances('building-fins', facadeFins, boxGeometry, reliefMaterial, false);
    addInstances('balcony-slabs', balconySlabs, boxGeometry, reliefMaterial, false);
    addInstances('balcony-rails', balconyRails, boxGeometry, reliefMaterial, false);
    addInstances('entrance-canopies', canopies, boxGeometry, darkMaterial, false);
    addInstances('roof-slabs', darkBoxes, boxGeometry, darkMaterial, true);
    addInstances('roof-units', roofUnits, boxGeometry, darkMaterial, true);
    addInstances('chimneys', chimneys, boxGeometry, darkMaterial, true);

    if (roofs.length) {
      var roofMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, vertexColors: true });
      addInstances('house-roofs', roofs, makeGableGeometry(), roofMaterial, true);
    }
  }

  function makeGableGeometry() {
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.5, 0, -0.5, 0.5, 0, -0.5, 0, 1, -0.5,
      -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5
    ], 3));
    geometry.setIndex([
      0, 1, 2, 5, 4, 3,
      0, 2, 5, 0, 5, 3,
      2, 1, 4, 2, 4, 5,
      3, 5, 4, 3, 4, 0,
      0, 4, 1, 0, 3, 1
    ]);
    geometry.computeVertexNormals();
    return geometry;
  }

  function buildStreetFurniture() {
    var random = rng(city.seed + 8);
    var poles = [], arms = [], heads = [], glows = [], pools = [];
    for (var side = -1; side <= 1; side += 2) {
      for (var z = 850; z > -720; z -= 52) {
        if (Math.abs((z - 650) % 310) < 25) continue;
        var x = side * (city.road / 2 + 1.1);
        poles.push({ x: x, y: 3.1, z: z, sx: 0.085, sy: 6.2, sz: 0.085, c: null });
        arms.push({ x: x - side * 0.95, y: 6.12, z: z, sx: 2.0, sy: 0.09, sz: 0.09, c: null });
        heads.push({ x: x - side * 1.85, y: 6.03, z: z, sx: 0.72, sy: 0.13, sz: 0.28, c: null });
        glows.push(x - side * 1.85, 5.94, z);
        pools.push({ x: x - side * 3.5, y: 0.072, z: z, sx: 13, sy: 1, sz: 19, c: null });
        lampCount++;
      }
    }
    var metal = new THREE.MeshStandardMaterial({ color: 0x343a42, roughness: 0.5, metalness: 0.72 });
    bulbMaterial = new THREE.MeshStandardMaterial({ color: 0xffd39a, emissive: 0xffb45f, emissiveIntensity: 2.4, roughness: 0.35 });
    addInstances('lamp-poles', poles, new THREE.CylinderGeometry(1, 1, 1, 8), metal, false);
    addInstances('lamp-arms', arms, new THREE.BoxGeometry(1, 1, 1), metal, false);
    addInstances('lamp-heads', heads, new THREE.BoxGeometry(1, 1, 1), bulbMaterial, false);
    lampGlowGeometry = new THREE.BufferGeometry();
    lampGlowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glows, 3));
    lampGlowMaterial = makeGlowMaterial(0xffbd78, 7.5, 0.5);
    var points = new THREE.Points(lampGlowGeometry, lampGlowMaterial);
    points.renderOrder = 4;
    world.add(points);

    lampPoolMaterial = new THREE.MeshBasicMaterial({
      map: makeLightPoolTexture(), color: 0xffc47c, transparent: true, opacity: 0.42,
      depthWrite: false, blending: THREE.AdditiveBlending
    });
    var poolGeometry = new THREE.PlaneGeometry(1, 1);
    poolGeometry.rotateX(-Math.PI / 2);
    var lightPools = addInstances('lamp-light-pools', pools, poolGeometry, lampPoolMaterial, false);
    lightPools.renderOrder = 2;

    /* 成因②「地面要反」的第二半：湿沥青把灯拉成一条条反光。
       这不是真镜面——真反射要反射探针或逐像素求交，软件渲染的实时链路付不起。
       这里是显式近似：沿街道方向（z）铺一条断开的暖色长条，横截面窄、纵向长，
       位置严格钉在每个光源脚下（路灯取灯头投影，店面沿路缘随机撒）。
       人行方向就是街道方向时，镜面反光在画面里正是这个走向；
       扭头看向路边时会偏，但比「完全没有反光」接近真实。 */
    var streaks = [], sRandom = rng(city.seed + 41);
    for (var gi = 0; gi < glows.length; gi += 3) {
      streaks.push({
        x: glows[gi], y: 0.078, z: glows[gi + 2] + (sRandom() - 0.5) * 5,
        sx: 2.7 + sRandom() * 1.6, sy: 1, sz: 26 + sRandom() * 17, ry: 0, c: null
      });
    }
    for (var sSide = -1; sSide <= 1; sSide += 2) {
      for (var sz = 838; sz > -700; sz -= 13) {
        if (sRandom() < 0.42) continue;
        streaks.push({
          x: sSide * (city.road / 2 - 2.6 - sRandom() * 4.4), y: 0.078, z: sz + sRandom() * 5,
          sx: 2.2 + sRandom() * 3.4, sy: 1, sz: 13 + sRandom() * 17, ry: 0, c: null
        });
      }
    }
    wetStreakMaterial = new THREE.MeshBasicMaterial({
      map: makeStreakTexture(), color: 0xffd2a4, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    });
    var streakGeometry = new THREE.PlaneGeometry(1, 1);
    streakGeometry.rotateX(-Math.PI / 2);
    var wetStreaks = addInstances('wet-streaks', streaks, streakGeometry, wetStreakMaterial, false);
    wetStreaks.renderOrder = 3;

    var signs = [];
    for (var i = 0; i < 16; i++) {
      var z = 800 - i * 74;
      if (random() < 0.35) continue;
      var side = random() < 0.5 ? -1 : 1;
      signs.push({
        x: side * (20 + random() * 8), y: 4 + random() * 5, z: z,
        sx: 3.8 + random() * 2.8, sy: 1.3 + random() * 1.6, sz: 0.16,
        c: new THREE.Color(random() < 0.5 ? 0x9c4e37 : 0x31566a)
      });
    }
    signMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0x6e3927, emissiveIntensity: 0.55, roughness: 0.6, vertexColors: true
    });
    addInstances('shop-signs', signs, new THREE.BoxGeometry(1, 1, 1), signMaterial, true);

    var fencePosts = [], fenceRails = [];
    for (var side = -1; side <= 1; side += 2) {
      for (var z = -1450; z > -2080; z -= 12) {
        fencePosts.push({ x: side * 38, y: 0.65, z: z, sx: 0.12, sy: 1.3, sz: 0.12, c: null });
      }
      fenceRails.push({ x: side * 38, y: 0.82, z: -1765, sx: 0.09, sy: 0.09, sz: 630, c: null });
      fenceRails.push({ x: side * 38, y: 0.38, z: -1765, sx: 0.09, sy: 0.09, sz: 630, c: null });
    }
    addInstances('fence-posts', fencePosts, new THREE.BoxGeometry(1, 1, 1), metal, false);
    addInstances('fence-rails', fenceRails, new THREE.BoxGeometry(1, 1, 1), metal, false);
  }

  function buildTrees() {
    var random = rng(city.seed + 19);
    var trunks = [], canopies = [[], [], []];
    function tree(x, z, scale, t) {
      var h = (4.6 + random() * 4.2) * scale;
      var pick = random();
      var type = pick < (t > 0.68 ? 0.38 : 0.7) ? 0 : pick < 0.82 ? 1 : 2;
      var angle = random() * Math.PI * 2;
      var width = h * (type === 1 ? 0.4 : type === 2 ? 0.48 : 0.62);
      var height = h * 1.22;
      var shade = 0.78 + random() * 0.2;
      var color = new THREE.Color(0xdde3d4).multiplyScalar(shade);
      trunks.push({ x: x, y: h * 0.39, z: z, sx: (0.13 + random() * 0.06) * scale, sy: h * 0.78, sz: (0.13 + random() * 0.06) * scale, c: null });
      canopies[type].push({ x: x, y: h * 0.57, z: z, sx: width, sy: height, sz: 1, ry: angle, c: color });
      canopies[type].push({ x: x, y: h * 0.57, z: z, sx: width * 0.94, sy: height * 0.98, sz: 1, ry: angle + Math.PI / 2, c: color.clone().multiplyScalar(0.94 + random() * 0.08) });
      treeCount++;
    }
    for (var side = -1; side <= 1; side += 2) {
      for (var z = 860; z > -1900; z -= 42) {
        var t = routeAt(z);
        if (t < 0.55 && random() < 0.22) continue;
        tree(side * (city.road / 2 + 6.5 + random() * 6), z + random() * 12, lerp(0.82, 1.35, t), t);
        if (t > 0.45 && random() < 0.92) tree(side * (36 + random() * 138), z + random() * 26, lerp(0.92, 1.48, t), t);
        if (t > 0.76 && random() < 0.32) tree(side * (18 + random() * 12), z + random() * 20, 0.72 + random() * 0.38, t);
      }
    }
    var trunkMat = new THREE.MeshStandardMaterial({ color: 0x574638, roughness: 1 });
    addInstances('tree-trunks', trunks, new THREE.CylinderGeometry(1, 1.2, 1, 7), trunkMat, false);
    var names = ['broadleaf', 'poplar', 'conifer'];
    var plane = new THREE.PlaneGeometry(1, 1);
    canopies.forEach(function (items, type) {
      if (!items.length) return;
      var material = new THREE.MeshStandardMaterial({
        map: makeTreeTexture(type), color: 0xffffff, roughness: 0.94,
        metalness: 0, alphaTest: 0.28, side: THREE.DoubleSide, vertexColors: true
      });
      addInstances('tree-canopies-' + names[type], items, plane, material, true);
    });
  }

  function makeTreeTexture(type) {
    var canvas = document.createElement('canvas');
    canvas.width = 384; canvas.height = 640;
    var ctx = canvas.getContext('2d');
    var random = rng(city.seed + 1401 + type * 977);
    function branch(x1, y1, x2, y2, width) {
      ctx.strokeStyle = 'rgba(70,53,37,.94)'; ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2 + random() * 10 - 5, (y1 + y2) / 2, x2, y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(151,124,83,.28)'; ctx.lineWidth = Math.max(1, width * 0.24);
      ctx.beginPath(); ctx.moveTo(x1 - 1, y1); ctx.quadraticCurveTo((x1 + x2) / 2 - 1, (y1 + y2) / 2, x2 - 1, y2); ctx.stroke();
    }
    function cluster(x, y, rx, ry, light) {
      var hue = 78 + random() * 28, sat = 18 + random() * 20;
      ctx.fillStyle = 'hsla(' + hue + ',' + sat + '%,' + (17 + random() * 13) + '%,.9)';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'hsla(' + (hue + 6) + ',' + (sat + 6) + '%,' + (light + random() * 8) + '%,.58)';
      ctx.beginPath(); ctx.ellipse(x - rx * 0.2, y - ry * 0.24, rx * 0.62, ry * 0.5, random(), 0, Math.PI * 2); ctx.fill();
      for (var k = 0; k < 5; k++) {
        ctx.fillStyle = 'hsla(' + hue + ',' + sat + '%,' + (light + 12) + '%,.32)';
        ctx.fillRect(x + (random() - 0.5) * rx * 1.3, y + (random() - 0.5) * ry * 1.2, 1.4 + random() * 2.2, 2.5 + random() * 3.5);
      }
    }
    branch(192, 626, 190, 128, type === 2 ? 15 : 20);
    branch(191, 610, 192 + 8, 620, 8);
    if (type < 2) {
      var crownY = type === 1 ? 286 : 330;
      var radiusX = type === 1 ? 84 : 154;
      var radiusY = type === 1 ? 236 : 218;
      for (var b = 0; b < 13; b++) {
        var a = b * 2.399 + random() * 0.5;
        var reach = radiusX * (0.38 + random() * 0.54);
        var ex = 192 + Math.cos(a) * reach;
        var ey = crownY + Math.sin(a) * radiusY * (0.34 + random() * 0.5);
        branch(192, 520 - b * 23, ex, ey, 5 + random() * 5);
      }
      var count = type === 1 ? 155 : 205;
      for (var i = 0; i < count; i++) {
        var angle = random() * Math.PI * 2;
        var rr = Math.sqrt(random());
        var x = 192 + Math.cos(angle) * radiusX * rr;
        var y = crownY + Math.sin(angle) * radiusY * rr;
        var size = (type === 1 ? 8 : 11) + random() * (type === 1 ? 13 : 17);
        cluster(x, y, size * (0.8 + random() * 0.6), size * (0.65 + random() * 0.55), 23 + random() * 13);
      }
    } else {
      for (var level = 0; level < 13; level++) {
        var y0 = 136 + level * 34;
        var spread = 34 + level * 8.2;
        branch(192, y0 + 70, 192 - spread, y0 + 42, 4.5);
        branch(192, y0 + 70, 192 + spread, y0 + 42, 4.5);
        for (var side = -1; side <= 1; side += 2) {
          for (var n = 0; n < 12; n++) {
            var f = n / 11;
            var tx = 192 + side * spread * f;
            var ty = y0 + 70 - f * 28 + (random() - 0.5) * 9;
            cluster(tx, ty, 8 + random() * 8, 5 + random() * 5, 20 + random() * 12);
          }
        }
      }
      cluster(192, 116, 13, 25, 26);
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }

  function buildHorizon() {
    var layers = [
      { z: -2450, color: 0x293743, height: 72, phase: 0.4 },
      { z: -3050, color: 0x303d4b, height: 128, phase: 2.1 },
      { z: -3750, color: 0x384655, height: 188, phase: 4.3 }
    ];
    layers.forEach(function (layer) {
      var geometry = new THREE.PlaneGeometry(4400, 1350, 96, 28);
      geometry.rotateX(-Math.PI / 2);
      var positions = geometry.attributes.position;
      for (var i = 0; i < positions.count; i++) {
        var x = positions.getX(i), z = positions.getZ(i);
        var broad = Math.sin(x * 0.0017 + layer.phase) * 0.42 + Math.sin(x * 0.0041 - layer.phase) * 0.2;
        var detail = Math.sin(x * 0.009 + z * 0.003 + layer.phase) * 0.08;
        var rise = smoothstep(-675, 675, z);
        var height = layer.height * (0.2 + rise * (0.58 + broad + detail));
        positions.setXYZ(i, x, height - 12, z + Math.sin(x * 0.0023 + layer.phase) * 95);
      }
      geometry.computeVertexNormals();
      var ridge = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: layer.color, roughness: 1, metalness: 0, side: THREE.DoubleSide
      }));
      ridge.position.z = layer.z;
      world.add(ridge);
    });

    /* 远处城市的灯带（成因③）：地平线上那道不该只有山。
       真实夜景里 20~40 km 外的城区会压出一条细碎的暖光带，上面糊一层往上散掉的雾。
       有了它，画面才有「近楼 / 中景街区 / 远城 / 山 / 天」的层次；
       只有山脊时，天空和地面之间是一条硬边，看着就是贴了张背景板。 */
    var band = new THREE.Mesh(new THREE.PlaneGeometry(3200, 140), new THREE.MeshBasicMaterial({
      map: makeSkylineTexture(), color: 0xffd0a0, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    band.position.set(0, 44, -2392);
    band.renderOrder = 1;
    skylineGlowMaterial = band.material;
    world.add(band);
  }

  function makeSkylineTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 128;
    var ctx = canvas.getContext('2d');
    var random = rng(city.seed + 77);
    var dome = ctx.createLinearGradient(0, 128, 0, 0);
    dome.addColorStop(0, 'rgba(228,152,74,.70)');
    dome.addColorStop(0.26, 'rgba(206,126,66,.24)');
    dome.addColorStop(0.6, 'rgba(150,100,68,.07)');
    dome.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dome; ctx.fillRect(0, 0, 1024, 128);
    for (var i = 0; i < 26; i++) {
      var bx = random() * 1024, bw = 7 + random() * 26, bh = 9 + random() * 30;
      var cluster = ctx.createLinearGradient(0, 128, 0, 128 - bh);
      cluster.addColorStop(0, 'rgba(255,198,126,.46)');
      cluster.addColorStop(1, 'rgba(255,178,110,0)');
      ctx.fillStyle = cluster; ctx.fillRect(bx, 128 - bh, bw, bh);
    }
    for (i = 0; i < 920; i++) {
      var x = random() * 1024, y = 128 - Math.pow(random(), 1.9) * 44;
      var a = 0.22 + random() * 0.62;
      ctx.fillStyle = random() < 0.8
        ? 'rgba(255,208,146,' + a.toFixed(3) + ')'
        : 'rgba(204,224,255,' + (a * 0.78).toFixed(3) + ')';
      ctx.fillRect(x, y, 1 + random() * 3.2, 0.8 + random() * 2.1);
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function makeLightPoolTexture() {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 63);
    gradient.addColorStop(0, 'rgba(255,245,220,.88)');
    gradient.addColorStop(0.24, 'rgba(255,221,169,.48)');
    gradient.addColorStop(0.62, 'rgba(255,190,112,.12)');
    gradient.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    var texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function makeStreakTexture() {
    /* 湿地反光条：沿街道方向（z）长、横向（x）窄的一条暖光，中间断成几截。
       断口不是装饰——湿路面的水膜是碎的，真实照片里的反光本来就是一段一段的；
       画一整条连续渐变会像「地上贴了条荧光胶」，一眼假。 */
    var canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 256;
    var ctx = canvas.getContext('2d');
    /* 强度实测校准：旧峰值 alpha .52 配 opacity .66，落到画面上近处路面
       一个亮点都没有（sd/mean=0.10）。真实湿路面的灯下反光是要「过曝」的，
       所以峰值提到 .95、并在 0.70~0.88 段留一段余亮，
       让反光条从灯脚一路拖向观察者——这才是湿路的形状。 */
    var along = ctx.createLinearGradient(0, 0, 0, 256);
    along.addColorStop(0, 'rgba(0,0,0,0)');
    along.addColorStop(0.22, 'rgba(255,212,158,.62)');
    along.addColorStop(0.46, 'rgba(255,232,190,.95)');
    along.addColorStop(0.70, 'rgba(255,206,146,.58)');
    along.addColorStop(0.88, 'rgba(255,196,136,.30)');
    along.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = along; ctx.fillRect(0, 0, 64, 256);
    var across = ctx.createLinearGradient(0, 0, 64, 0);
    across.addColorStop(0, 'rgba(0,0,0,1)');
    across.addColorStop(0.34, 'rgba(0,0,0,.35)');
    across.addColorStop(0.5, 'rgba(0,0,0,0)');
    across.addColorStop(0.66, 'rgba(0,0,0,.35)');
    across.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = across; ctx.fillRect(0, 0, 64, 256);
    var random = rng(city.seed + 61);
    for (var i = 0; i < 26; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.30 + random() * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, random() * 256, 64, 1 + random() * 5);
    }
    ctx.globalCompositeOperation = 'source-over';
    var texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function makeWetnessTexture() {
    /* 粗糙度图：贴图取绿通道乘 material.roughness。
       底色接近 1（干燥沥青），水洼画成深色（湿 → 镜面反射强）。
       没有这张图，整条路只有一个粗糙度，灯下和灯外一样哑光，就谈不上「刚下过雨」。 */
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, 256, 256);
    var random = rng(city.seed + 33);
    for (var i = 0; i < 34; i++) {
      var px = random() * 256, py = random() * 256, pr = 12 + random() * 46;
      var g = ctx.createRadialGradient(px, py, 1, px, py, pr);
      g.addColorStop(0, 'rgba(38,38,38,.92)');
      g.addColorStop(0.6, 'rgba(86,86,86,.55)');
      g.addColorStop(1, 'rgba(216,216,216,0)');
      ctx.fillStyle = g; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    for (i = 0; i < 900; i++) {
      var v = Math.floor(120 + random() * 110);
      ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',.16)';
      ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 3);
    }
    var texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 11);
    return texture;
  }

  function makeGlowMaterial(color, worldSize, opacity) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
        uSize: { value: worldSize }, uScale: { value: window.innerHeight / (2 * Math.tan(68 * Math.PI / 360)) },
        uFade: { value: 1 }
      },
      vertexShader: [
        'uniform float uSize; uniform float uScale;',
        'varying float vDist;',
        'void main(){',
        '  vec4 mv=modelViewMatrix*vec4(position,1.0);',
        '  vDist=-mv.z;',
        '  gl_PointSize=clamp(uSize*uScale/max(1.0,-mv.z),1.0,110.0);',
        '  gl_Position=projectionMatrix*mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; uniform float uOpacity; uniform float uFade;',
        /* 加色辉光的空气透视：远处那盏灯不该和脚下一样扎眼。
           加色混合本身不受 scene.fog 影响（fog 只调不透明物体），所以这里自己衰减。
           少了这一条，整条街从头到尾一样亮，纵深就塌成一张平面。 */
        'varying float vDist;',
        'void main(){',
        '  vec2 q=gl_PointCoord-0.5; float r=length(q); if(r>0.5) discard;',
        '  float haze=mix(1.0,0.16,smoothstep(120.0,780.0,vDist));',
        '  float a=pow(max(0.0,1.0-r*2.0),2.4)*uOpacity*uFade*haze;',
        '  gl_FragColor=vec4(uColor,a);',
        '}'
      ].join('\n')
    });
  }

  function addInstances(name, items, geometry, material, colored) {
    if (!items.length) return null;
    var mesh = new THREE.InstancedMesh(geometry, material, items.length);
    mesh.name = name;
    mesh.frustumCulled = false;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      dummy.position.set(item.x, item.y, item.z);
      dummy.rotation.set(0, item.ry || 0, item.rz || 0);
      dummy.scale.set(item.sx, item.sy, item.sz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colored && item.c) mesh.setColorAt(i, item.c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    world.add(mesh);
    return mesh;
  }

  function computeSceneData() {
    clampLook();
    var along = smoothstep(0, 0.96, route);
    activity = lightsOut ? 0 : activityAt(city.hours, hour);
    var modelBortle = clamp(lerp(city.centerBortle, city.edgeBortle, along)
      - (city.centerBortle - city.darkBortle) * (1 - activity) * (1 - along)
      + (view.glare - 1) * 1.15 * activity * (1 - along), 1, 9.5);
    predictionBortle = clamp(city.centerBortle - (city.centerBortle - city.darkBortle) * (1 - activity), 1, 9);
    skyFraction = view.sky;
    actionBortle = modelBortle;
    if (track === 'history') {
      bortle = 0; predictionBortle = 0; nelm = 0; visibleCount = 0;
      shownStars = 0; ceilingAge = 0; glow = 0; skyFraction = 0; activity = 0;
      return;
    }
    var mags = webgl && starMags.length ? starMags : fallbackStarMags;
    bortle = modelBortle;
    nelm = nelmAt(bortle);
    visibleCount = Math.round(upperBound(mags, nelm) * skyFraction);
    ceilingAge = ageOf(nelm);
    glow = clamp((1 - smoothstep(0.08, 0.9, route)) * (0.24 + 0.76 * activity) * (0.62 + 0.38 * view.glare), 0, 1);
    shownStars = upperBound(mags, nelm + 0.12);
  }

  function renderDataUI() {
    var history = track === 'history';
    var unavailable = !webgl || contextLost;
    stage.hidden = history || unavailable;
    fallback.hidden = history || !unavailable;
    if (!history && unavailable) showFallback();
    else document.body.classList.remove('fallback-static', 'fallback-data');
    liveEl.textContent = history ? '年代轨道 · 暂无真实模型' : (unavailable ? '实时 3D 未启动 · 已切换降级预览' : '实时科学可视化 · 模型非实拍');
    if (roverPanel) roverPanel.hidden = !roverOn || history || unavailable;
    if (roverGroup) roverGroup.visible = roverOn && !history && !unavailable;
    if (history || unavailable) roverRead = null;
    if (routeInput) {
      routeInput.value = Math.round(route * 1000);
      routeInput.setAttribute('aria-valuetext', Math.round(route * 100) + '% · ' + placeName());
    }
    cityNameEl.textContent = city.name;
    placeEl.textContent = history ? city.name + ' · 暂无年代模型' : placeName();
    bortleEl.textContent = history ? '—' : bortle.toFixed(1);
    nelmEl.textContent = history ? '—' : nelm.toFixed(1);
    visibleEl.textContent = history ? '—' : visibleCount.toLocaleString('zh-CN');
    if (trackHourValue) trackHourValue.textContent = clockLabel(hour);
    if (epochValue) epochValue.textContent = yearLabel(historyEpoch);
    activityEl.textContent = history ? '—' : Math.round(activity * 100) + '%';
    skyEl.textContent = history ? '—' : Math.round(skyFraction * 100) + '%';
    epochEl.textContent = history ? '无年代模型' : yearLabel(ceilingAge);
    epochSubEl.textContent = history ? '参数轨道已保留；本城没有对应年代结果。' : eraName(Math.round(2026 - ceilingAge)) + ' · 更古老的光被灯拦在膜下';
    var epochPos = history ? 0 : clamp01(Math.log(ceilingAge / EPOCH_MIN) / Math.log(EPOCH_MAX / EPOCH_MIN)) * 100;
    rulerEl.style.setProperty('--p', epochPos.toFixed(2) + '%');
    blockedEl.textContent = history ? '—' : (STAR_COUNT - visibleCount).toLocaleString('zh-CN');
    if (robot) robotEl.textContent = robot.text;
    routeTitle.textContent = lightsOut ? '全城熄灯' : route < 0.22 ? '走进城市' : route < 0.72 ? '灯光渐稀' : '向暗处走';
    if (starCard && (history || !webgl || contextLost)) starCard.hidden = true;
  }

  function updateScene3D() {
    if (!webgl || contextLost || track !== 'real' || !camera || !scene) return;
    var along = smoothstep(0, 0.96, route);
    var lightLevel = clamp(activity * (1 - 0.78 * along), 0, 1);
    var z = zAt(route);
    camera.position.set(walkX, view.eye, z);
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    if (rig) {
      rig.position.copy(camera.position);
      rig.rotation.set(0, 0, 0);
      rig.visible = viewKey !== 'street';
      rig.children[0].visible = viewKey === 'indoor';
      rig.children[1].visible = viewKey === 'terrace' || viewKey === 'highrise';
      var glassRail = rig.getObjectByName('highrise-glass-rail');
      if (glassRail) glassRail.visible = viewKey === 'highrise';
    }
    starGeometry.setDrawRange(0, shownStars);
    stars.material.uniforms.uGlow.value = glow;
    stars.material.uniforms.uNelm.value = nelm;
    sky.material.uniforms.uGlow.value = glow;
    sky.material.uniforms.uDark.value = 1 - glow;
    scene.fog.density = lerp(0.00108, 0.00040, along);
    scene.fog.color.setRGB(
      lerp(0.030, 0.074, lightLevel), lerp(0.040, 0.052, lightLevel), lerp(0.056, 0.048, lightLevel)
    );
    hemi.intensity = 0.16;
    moon.intensity = 0.10;
    cityLight.intensity = lerp(0.05, 1.3, lightLevel);
    glowAmbient.intensity = 0.32 * lightLevel;
    if (post) post.final.uniforms.uBloom.value = lerp(0.34, 1.12, lightLevel);
    facadeMaterials.forEach(function (mat) { mat.emissiveIntensity = lerp(0.02, 1.55, lightLevel); });
    if (bulbMaterial) bulbMaterial.emissiveIntensity = lerp(0.02, 2.7, lightLevel);
    if (signMaterial) signMaterial.emissiveIntensity = lerp(0.01, 0.55, lightLevel);
    if (laneMaterial) laneMaterial.opacity = lerp(0.2, 0.52, lightLevel);
    if (lampGlowMaterial) lampGlowMaterial.uniforms.uFade.value = lightLevel;
    if (lampPoolMaterial) lampPoolMaterial.opacity = 0.52 * lightLevel;
    if (wetStreakMaterial) wetStreakMaterial.opacity = 1.0 * lightLevel;
    if (skylineGlowMaterial) skylineGlowMaterial.opacity = lerp(0.14, 0.62, lightLevel);
    if (moteMaterial) {
      moteMaterial.uniforms.uActivity.value = lightLevel * (0.35 + 0.65 * (1 - view.sky));
      moteMaterial.uniforms.uHeight.value = lerp(14, 30, lightLevel);
    }
  }

  function updateScene(immediate, dt) {
    var started = performance.now();
    computeSceneData();
    lastComputeCost = performance.now() - started;
    renderDataUI();
    updateScene3D();
    if (webgl && !contextLost && track === 'real') refreshRover(dt || 0);
    if (window.CityScience) window.CityScience.sync({
      cityKey: cityKey, cityName: city.name, lat: city.lat, lon: city.lon,
      hour: hour, bortle: Math.max(1, Math.min(9, Math.round(predictionBortle))), lightsOut: lightsOut
    });
    if (immediate && webgl && !contextLost && track === 'real') renderFrame(performance.now());
  }

  function placeName() {
    var zone = route < 0.18 ? '市中心' : route < 0.46 ? '城区' : route < 0.74 ? '城市边缘' : '郊野';
    return view.name + ' · ' + zone;
  }

  function setRoute(value) {
    var next = clamp01(Number(value));
    if (!isFinite(next)) next = 0;
    if (next === route) return;
    route = next;
    updateScene(true); scheduleFlowSave(); scheduleAction();
  }

  function setCity(key, initial) {
    if (!CITIES[key]) return false;
    cityKey = key; city = CITIES[key];
    citySelect.value = key;
    if (starCard) starCard.hidden = true;
    roverSweep = null;
    roverFeedTimer = 1;
    if (webgl) {
      buildWorld();
      buildStars();
      yaw = 0.035; pitch = 0.045;
      if (!view.walk) walkX = 0;
      clampLook();
    }
    updateScene(true);
    if (!initial && EX) { EX.clearUndo(); refreshUndo(); }
    if (!initial) {
      lookHint.classList.remove('gone');
      setTimeout(function () { lookHint.classList.add('gone'); }, 3800);
    }
    return true;
  }

  function look(nextYaw, nextPitch) {
    yaw = Number(nextYaw); pitch = Number(nextPitch);
    if (!isFinite(yaw)) yaw = 0;
    if (!isFinite(pitch)) pitch = 0;
    clampLook();
    updateScene(true);
  }

  /* 视线必须落在观测点真实允许的那片天空里：室内只有窗框那么大一块，
     所以这里用硬钳制，而不是在界面上写一句「这里看不见别处」。 */
  function clampLook() {
    if (view.span > 0) {
      yaw = clamp(yaw, view.yaw - view.span, view.yaw + view.span);
      pitch = clamp(pitch, view.pitchMin === undefined ? -0.40 : view.pitchMin,
        view.pitchMax === undefined ? 0.60 : view.pitchMax);
    } else {
      pitch = clamp(pitch, -0.72, 0.92);
    }
  }

  function setViewpoint(key) {
    if (!VIEWS[key]) return false;
    viewKey = key; view = VIEWS[key];
    if (!view.walk) walkX = 0;
    if (viewKey === 'indoor') { yaw = view.yaw; pitch = 0.14; }
    if (viewSelect) viewSelect.value = key;
    if (starCard) starCard.hidden = true;
    clampLook();
    updateScene(true);
    return true;
  }

  function setHour(value) {
    var h = Number(value);
    if (isFinite(h)) hour = clamp(h, HOUR_MIN, HOUR_MAX);
    if (trackHour && Number(trackHour.value) !== hour) trackHour.value = String(hour);
    updateScene(true);
    return hour;
  }

  function setLightsOut(on) {
    lightsOut = !!on;
    if (lightsButton) {
      lightsButton.classList.toggle('on', lightsOut);
      lightsButton.setAttribute('aria-pressed', lightsOut ? 'true' : 'false');
      lightsButton.textContent = lightsOut ? '恢复城市灯光' : '一键全城熄灯';
    }
    updateScene(true); scheduleAction();
    return lightsOut;
  }

  /* 指星：把点击方向 ±1° 内、当前画得出来的最近一颗挑出来，报它的星等、距离，
     以及这束光出发时地球上处在什么年代。距离只来自本预览的等光度假设。 */
  var pickRay = null;
  function pickStar(clientX, clientY) {
    if (!webgl || contextLost || !starGeometry) return null;
    var arr = starGeometry.attributes.position.array;
    var count = Math.min(shownStars, starMags.length);
    camera.updateMatrixWorld();
    if (!pickRay) pickRay = new THREE.Vector3();
    var nx = (clientX === undefined || !isFinite(Number(clientX))) ? 0
      : (Number(clientX) / window.innerWidth) * 2 - 1;
    var ny = (clientY === undefined || !isFinite(Number(clientY))) ? 0
      : -(Number(clientY) / window.innerHeight) * 2 + 1;
    pickRay.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    var best = -1, bestDot = Math.cos(0.0175);
    for (var i = 0; i < count; i++) {
      var ox = arr[i * 3], oy = arr[i * 3 + 1], oz = arr[i * 3 + 2];
      var len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
      var dot = (ox * pickRay.x + oy * pickRay.y + oz * pickRay.z) / len;
      if (dot > bestDot) { bestDot = dot; best = i; }
    }
    if (best < 0) {
      if (starCard) {
        starCard.hidden = false;
        if (starMagEl) starMagEl.textContent = '这一点没有可指认的星';
        if (starDistEl) starDistEl.textContent = '—';
        if (starWhenEl) starWhenEl.textContent = '—';
        if (starNoteEl) starNoteEl.textContent = '准星里没落上星点。今晚这一片只剩 ' + visibleCount.toLocaleString('zh-CN') +
          ' 颗亮着的，其余 ' + (STAR_COUNT - visibleCount).toLocaleString('zh-CN') + ' 颗仍在同一片天上，只是被灯压到了极限星等以下——把画面对准一颗看得见的，再点。';
      }
      return null;
    }
    var m = starMags[best], pc = distanceOf(m), ly = ageOf(m);
    var ad = Math.round(2026 - ly);
    var sunk = m > nelm;
    if (starCard) starCard.hidden = false;
    if (starMagEl) starMagEl.textContent = '视星等 ' + m.toFixed(2) + ' · 今晚天花板 ' + nelm.toFixed(2);
    if (starDistEl) starDistEl.textContent = Math.round(ly).toLocaleString('zh-CN') + ' 光年（' + Math.round(pc).toLocaleString('zh-CN') + ' 秒差距）';
    if (starWhenEl) starWhenEl.textContent = yearLabel(ly) + ' · ' + eraName(ad);
    if (starNoteEl) starNoteEl.textContent = sunk
      ? '它比今晚的极限星等略暗，正往灯膜下面沉：这束光走了 ' + Math.round(ly).toLocaleString('zh-CN') +
        ' 年，却在最后一段被城市灯光拦住——再暗一点你就永远看不见它了。'
      : '这束光走了 ' + Math.round(ly).toLocaleString('zh-CN') + ' 年才落到你眼里。它出发的时候，地球上是' +
        eraName(ad) + '。你今晚抬头看见的，是那段历史本身。';
    return { index: best, mag: +m.toFixed(3), pc: +pc.toFixed(1), ly: Math.round(ly), era: eraName(ad), sunk: sunk };
  }

  /* 外设通道：机器人读数只显示、只对照，永不改写 Bortle／NELM／可见星数。
     这条纪律与生产站 core/companion.js 第②条同源。 */
  /* 车上的照度读数：与肉眼预测共用同一套物理（同一个 activityAt、同一条 route→等级），
     差别只在「它站在自己的位置、张着自己的筒口」。三项分开算是有原因的：
       glare —— 街灯直接照进筒里的，跟天一点关系没有，市中心能占读数的九成；
       sky   —— 天光落下来的，和眼睛同源，这一份才谈得上互相印证；
       base  —— 星光加月光，本城熄不熄灯它都在，所以熄灯后读数不会归零。
     glare 用 lampField 而不是面板那条 light：画面里的路灯只铺到 z=-720（route≈0.59），
     出了灯带再谈「灯直射」就是编的了；天光恰恰相反，它由整片光穹撑着，衰减更慢——
     「离灯远了读数先掉、天还亮着」这个错位，就是设备与肉眼分歧的全部来源。
     折算等级是反着 sky 那条曲线做的（先扣本底，再压回 Bortle 刻度）。
     系数是机制示意，未做实测标定；单调性与数量级是真的。 */
  var ROVER_SKY_UNIT = 0.0008, ROVER_BASE = 0.0509, ROVER_GLARE_MAX = 6.5, ROVER_LAMP_END = 0.60;
  var JOIN_AT = 11, JOIN_STEP = 10;
  function roverReading() {
    var along = smoothstep(0, 0.96, roverRoute);
    var act = lightsOut ? 0 : activityAt(city.hours, hour);
    var lampField = act * (1 - smoothstep(0, ROVER_LAMP_END, roverRoute));
    var level = clamp(lerp(city.centerBortle, city.edgeBortle, along)
      - (city.centerBortle - city.darkBortle) * (1 - act) * (1 - along), 1, 9.5);
    var sky = ROVER_SKY_UNIT * Math.pow(10, (level - 1) / 2.25);
    var point = 0.28 + 0.72 * Math.pow(0.5 + 0.5 * Math.cos(roverHeading * Math.PI / 180), 1.4);
    var aperture = roverBaffle === 'closed' ? 0.006 : 1;
    var glare = ROVER_GLARE_MAX * lampField * point * aperture;
    var lux = ROVER_BASE + sky + glare;
    var raw = 1 + 2.25 * Math.log(Math.max(lux - ROVER_BASE, 1e-7) / ROVER_SKY_UNIT) / Math.LN10;
    return {
      lux: lux, sky: sky, glare: glare, base: ROVER_BASE, level: level, lampField: lampField,
      implied: clamp(raw, 1, 9.5), over: raw > 9.5, activity: act,
      point: point, aperture: aperture, glareShare: glare / lux, skyShare: (sky + ROVER_BASE) / lux
    };
  }

  function fmtLux(v) {
    if (v >= 100) return Math.round(v) + ' lx';
    if (v >= 10) return v.toFixed(1) + ' lx';
    if (v >= 0.1) return v.toFixed(2) + ' lx';
    if (v >= 0.001) return v.toFixed(3) + ' lx';
    return (v * 1000).toFixed(1) + ' mlx';
  }

  function roverGap() { return Math.abs(zAt(route) - zAt(roverRoute)); }

  /* 转身面向车：视线方向由「人→车」现算，不写死角度——
     车停在路右侧、人走在路上，两点一连线才是该转的方向。 */
  function faceRover() {
    if (!roverGroup) return;
    var dx = roverGroup.position.x - walkX, dz = roverGroup.position.z - zAt(route);
    look(Math.atan2(-dx, -dz), Math.atan2(0.75 - view.eye, Math.sqrt(dx * dx + dz * dz)));
  }

  function roverZoneName() {
    var zone = roverRoute < 0.18 ? '市中心' : roverRoute < 0.46 ? '城区'
      : roverRoute < 0.74 ? '城市边缘' : '郊野';
    var aim = roverHeading < 60 || roverHeading > 300 ? '朝市心'
      : roverHeading > 120 && roverHeading < 240 ? '朝郊野' : '侧向';
    return zone + ' · ' + aim + ' · ' + (roverGap() <= JOIN_AT ? '就在身边' : Math.round(roverGap()) + ' 米外');
  }

  function roverAvailable() { return !!(webgl && !contextLost && track === 'real'); }
  function refreshRover(dt) {
    if (!roverGroup) return;
    roverGroup.visible = roverOn && roverAvailable();
    if (roverPanel) roverPanel.hidden = !roverGroup.visible;
    if (!roverAvailable()) { roverRead = null; return; }
    if (!roverOn) { roverRead = null; return; }
    if (roverWalk && dt > 0) {
      roverRoute += roverWalkDir * dt * 0.055;
      if (roverRoute >= 1) { roverRoute = 1; roverWalkDir = -1; }
      if (roverRoute <= 0) { roverRoute = 0; roverWalkDir = 1; }
      if (roverRouteInput) roverRouteInput.value = String(Math.round(roverRoute * 1000));
    }
    var r = roverReading();
    roverRead = r;
    if (!roverSweep) roverSweep = { from: roverRoute, to: roverRoute, min: r.lux, max: r.lux, n: 0 };
    else {
      roverSweep.from = Math.min(roverSweep.from, roverRoute);
      roverSweep.to = Math.max(roverSweep.to, roverRoute);
      roverSweep.min = Math.min(roverSweep.min, r.lux);
      roverSweep.max = Math.max(roverSweep.max, r.lux);
      roverSweep.n++;
    }
    roverGroup.position.set(city.road / 2 - 2.4, 0, zAt(roverRoute));
    roverAim.rotation.set(0.35, roverHeading * Math.PI / 180, 0);
    var open = roverBaffle !== 'closed';
    var half = (open ? 55 : 12) * Math.PI / 180, len = open ? 1.55 : 2.1;
    roverBeam.scale.set(len * Math.tan(half), len, len * Math.tan(half));
    roverTube.visible = !open;
    roverBeamMaterial.opacity = 0.04 + 0.13 * clamp01(r.glare / 6);
    roverRingMaterial.opacity = 0.14 + 0.3 * clamp01(Math.log(r.lux + 1) / Math.log(30));

    if (roverLuxEl) {
      roverLuxEl.textContent = fmtLux(r.lux);
      roverImpliedEl.textContent = r.implied.toFixed(1) + (r.over ? '↑' : '');
      roverEyeEl.textContent = bortle.toFixed(1);
      var glarePct = Math.round(r.glareShare * 100);
      roverGlareEl.textContent = glarePct + '%';
      roverSkyEl.textContent = (100 - glarePct) + '%';
      roverBarGlare.style.width = glarePct + '%';
      roverBarSky.style.width = (100 - glarePct) + '%';
      roverPosEl.textContent = roverZoneName();
      if (roverHeadingLabelEl) roverHeadingLabelEl.textContent = roverHeading + '°';
      var near = roverGap() <= JOIN_AT;
      if (roverJoinButton) {
        roverJoinButton.textContent = near ? '已在车边' : '走到车边';
        roverJoinButton.classList.toggle('on', near);
        roverJoinButton.setAttribute('aria-pressed', near ? 'true' : 'false');
      }
      var nearNote = near ? ' · 你和车此刻站在同一点，这两个数可以直比' : '';
      roverTrailEl.textContent = roverWalk
        ? '扫描中 · 已走过 ' + Math.round(roverSweep.from * 100) + '%→' + Math.round(roverSweep.to * 100) +
          '% · 读数 ' + fmtLux(roverSweep.min) + ' ~ ' + fmtLux(roverSweep.max)
        : (r.glareShare > 0.5
          ? '警告：这 ' + fmtLux(r.lux) + ' 里 ' + glarePct + '% 是灯直接照进筒里的，不是天上来的' + nearNote
          : '筒口收得很窄，读数已接近肉眼预测（差 ' + Math.abs(r.implied - bortle).toFixed(1) + ' 级）' + nearNote);
    }
    roverFeedTimer += dt;
    if (roverFeedTimer > 0.5) {
      roverFeedTimer = 0;
      feedRobot({ lux: r.lux, heading: roverHeading, baffle: roverBaffle }, 'rover');
    }
  }

  function setRover(patch) {
    var d = patch || {};
    if (d.on !== undefined) {
      if (d.on && !roverAvailable()) { if (EX) EX.notify('历史轨道或降级预览中不能启动三维机器人。'); return; }
      roverOn = !!d.on;
      roverSweep = null;
      roverFeedTimer = 1;
      if (roverPanel) roverPanel.hidden = !roverOn;
      if (roverButton) {
        roverButton.classList.toggle('on', roverOn);
        roverButton.setAttribute('aria-pressed', roverOn ? 'true' : 'false');
        roverButton.textContent = roverOn ? '收起机器人' : '虚拟机器人';
      }
      if (!roverOn) {
        roverWalk = false;
        if (roverWalkButton) {
          roverWalkButton.classList.remove('on');
          roverWalkButton.setAttribute('aria-pressed', 'false');
        }
        clearRobot('rover');
      }
    }
    if (d.route !== undefined) {
      var v = Number(d.route);
      if (isFinite(v)) { roverRoute = clamp01(v); roverSweep = null; }
      if (roverRouteInput) roverRouteInput.value = String(Math.round(roverRoute * 1000));
    }
    if (d.heading !== undefined) {
      var h = Number(d.heading);
      if (isFinite(h)) roverHeading = ((Math.round(h) % 360) + 360) % 360;
      if (roverHeadingInput) roverHeadingInput.value = String(roverHeading);
    }
    if (d.baffle !== undefined) {
      roverBaffle = d.baffle === 'closed' ? 'closed' : 'open';
      if (roverBaffleButton) {
        var closed = roverBaffle === 'closed';
        roverBaffleButton.classList.toggle('on', closed);
        roverBaffleButton.setAttribute('aria-pressed', closed ? 'true' : 'false');
        roverBaffleButton.textContent = closed ? '筒已罩住天顶' : '筒口敞开';
      }
    }
    if (d.walk !== undefined) {
      roverWalk = !!d.walk;
      roverSweep = null;
      if (roverWalkButton) {
        roverWalkButton.classList.toggle('on', roverWalk);
        roverWalkButton.setAttribute('aria-pressed', roverWalk ? 'true' : 'false');
        roverWalkButton.textContent = roverWalk ? '停下' : '让它自己走';
      }
    }
    if (webgl) refreshRover(0);
    return roverState();
  }

  function roverState() {
    if (!roverOn) return null;
    var r = roverRead || roverReading();
    return {
      route: +roverRoute.toFixed(5), z: +zAt(roverRoute).toFixed(2), heading: roverHeading,
      baffle: roverBaffle, walking: roverWalk, x: +(city.road / 2 - 2.4).toFixed(2),
      lux: +r.lux.toFixed(4), sky: +r.sky.toFixed(5), glare: +r.glare.toFixed(4),
      base: r.base, level: +r.level.toFixed(3), implied: +r.implied.toFixed(3), over: r.over,
      glareShare: +r.glareShare.toFixed(4), eye: +bortle.toFixed(3),
      delta: +(r.implied - bortle).toFixed(3), visible: visibleCount, nelm: +nelm.toFixed(3)
    };
  }

  function feedRobot(data, source) {
    var d = data || {};
    var lux = Number(d.lux), heading = Number(d.heading);
    if (!isFinite(lux) && !isFinite(heading)) return false;
    robot = {
      lux: isFinite(lux) ? lux : null,
      heading: isFinite(heading) ? heading : null,
      baffle: d.baffle === 'closed' ? 'closed' : 'open',
      source: source || 'external',
      at: Date.now(),
      text: (source === 'rover' ? '虚拟机器人在线 · ' : '外设在线 · ') +
        (isFinite(lux) ? lux.toFixed(lux < 10 ? 2 : 1) + ' lx' : '光感无读数') +
        (isFinite(heading) ? ' · 朝向 ' + (Math.round(heading) % 360) + '°' : '') +
        ' · 遮光筒' + (d.baffle === 'closed' ? '闭合' : '敞开')
    };
    robotTimer = 9;
    if (robotEl) { robotEl.textContent = robot.text; robotEl.classList.add('live'); }
    return true;
  }

  function clearRobot(source) {
    /* 虚拟机器人和真机走的是同一条注入通道，所以断开时只能各清各的：
       关掉小车不该把刚收到的真机读数一起抹掉，反之也一样。 */
    if (source && robot && robot.source !== source) return false;
    robot = null; robotTimer = 0;
    if (robotEl) { robotEl.textContent = '外设未连接 · 虚拟机器人可直接注入同一套读数'; robotEl.classList.remove('live'); }
    return true;
  }

  function stopTour() {
    tour = false;
    if (!tourButton) return;
    tourButton.classList.remove('on');
    tourButton.setAttribute('aria-pressed', 'false');
    tourButton.textContent = '自动巡游';
  }

  function userMove() {
    if (tour) stopTour();
    lookHint.classList.add('gone');
  }

  function move(dt, input) {
    if (!input && !tour && !heldMove && !keyDown('KeyW') && !keyDown('KeyS') && !keyDown('KeyA') && !keyDown('KeyD') &&
        !keyDown('ArrowUp') && !keyDown('ArrowDown') && !keyDown('ArrowLeft') && !keyDown('ArrowRight')) return;
    var previousRoute = route;
    if (tour) {
      route += tourDirection * dt * 0.037;
      if (route >= 1) { route = 1; tourDirection = -1; }
      if (route <= 0) { route = 0; tourDirection = 1; }
      yaw = 0.035 + Math.sin(route * Math.PI * 2) * 0.13;
      pitch = 0.045 + Math.sin(route * Math.PI) * 0.025;
      if (route !== previousRoute) { scheduleFlowSave(); scheduleAction(); }
      return;
    }
    var forward = (input === 'forward' || heldMove === 1 || keyDown('KeyW') || keyDown('ArrowUp') ? 1 : 0) -
      (input === 'back' || heldMove === -1 || keyDown('KeyS') || keyDown('ArrowDown') ? 1 : 0);
    var strafe = view.walk ? (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0) - (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0) : 0;
    if (!forward && !strafe) return;
    var speed = keyDown('ShiftLeft') || keyDown('ShiftRight') ? 18 : 9;
    var dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed * dt;
    var dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed * dt;
    if (view.walk) walkX = clamp(walkX + dx, -city.road / 2 + 1.5, city.road / 2 - 1.5);
    var z = clamp(zAt(route) + dz, Z_END, Z_START);
    route = routeAt(z);
    if (route !== previousRoute) { scheduleFlowSave(); scheduleAction(); }
  }

  function keyDown(code) { return !!keys[code]; }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!webgl || contextLost || document.hidden || track !== 'real') { lastTime = now; return; }
    var dt = now - lastTime; lastTime = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (flowThrottle) flowThrottle.sample(dt * 1000, lastComputeCost);
    dt = Math.min(dt, 0.06);
    move(dt);
    sky.material.uniforms.uTime.value = now * 0.001;
    if (moteMaterial) moteMaterial.uniforms.uTime.value = reduce ? 0 : now * 0.001;
    if (robot && robotTimer > 0) {
      robotTimer -= dt;
      if (robotTimer <= 0) clearRobot();
    }
    updateScene(false, dt);
    renderFrame(now);
    frames++;
  }

  function syncRoutePanelHeight() {
    if (routePanel) document.documentElement.style.setProperty('--route-panel-h', Math.ceil(routePanel.getBoundingClientRect().height) + 'px');
  }

  function resize() {
    if (!webgl) return;
    syncRoutePanelHeight();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizePost();
    if (stars) stars.material.uniforms.uPR.value = renderer.getPixelRatio();
    var scale = window.innerHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
    if (lampGlowMaterial) lampGlowMaterial.uniforms.uScale.value = scale;
    if (moteMaterial) {
      moteMaterial.uniforms.uScale.value = scale;
      moteMaterial.uniforms.uPR.value = renderer.getPixelRatio();
    }
    updateScene(true);
  }

  var baseControlsBound = false;
  function bindBaseControls() {
    if (baseControlsBound) return;
    baseControlsBound = true;
    citySelect.addEventListener('change', function () {
      if (tour) stopTour();
      setCity(citySelect.value, false); persistFlow(); commitRecent(); scheduleAction();
    });
    if (lightsButton) lightsButton.addEventListener('click', function () { setLightsOut(!lightsOut); });
  }

  function bindSceneControls() {
    var canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true; dragPointer = e.pointerId; dragX = e.clientX; dragY = e.clientY;
      dragMoved = 0; dragTime = performance.now();
      canvas.setPointerCapture(e.pointerId);
      userMove();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging || e.pointerId !== dragPointer) return;
      var dx = e.clientX - dragX, dy = e.clientY - dragY;
      dragMoved += Math.abs(dx) + Math.abs(dy);
      dragX = e.clientX; dragY = e.clientY;
      yaw -= dx * 0.0032;
      pitch -= dy * 0.0028;
      clampLook();
      updateScene(false);
    });
    function endDrag(e) {
      if (e.pointerId !== dragPointer) return;
      dragging = false; dragPointer = null;
      /* 按下即抬起、且没拖出距离，判为「指星」；拖过距离则是转头，不抢。 */
      if (dragMoved < 7 && performance.now() - dragTime < 500) pickStar(e.clientX, e.clientY);
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault(); userMove();
      setRoute(route - e.deltaY * 0.00019);
    }, { passive: false });

    window.addEventListener('keydown', function (e) {
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].indexOf(e.code) < 0) return;
      e.preventDefault(); keys[e.code] = true; userMove();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () { keys = Object.create(null); heldMove = 0; dragging = false; });

    routeInput.addEventListener('input', function () {
      captureFlowDrag(); userMove();
      var value = Number(routeInput.value) / 1000;
      if (!flowThrottle) { setRoute(value); return; }
      flowThrottle.advance(performance.now(), function () { setRoute(value); });
    });
    routeInput.addEventListener('change', function () {
      userMove(); setRoute(Number(routeInput.value) / 1000);
      commitFlowDrag(); persistFlow(); commitRecent();
    });
    tourButton.addEventListener('click', function () {
      if (tour) { stopTour(); return; }
      if (track !== 'real' || !webgl || contextLost) return;
      tour = true;
      tourButton.classList.add('on');
      tourButton.setAttribute('aria-pressed', 'true');
      tourButton.textContent = '停止巡游';
      lookHint.classList.add('gone');
    });
    resetButton.addEventListener('click', function () {
      stopTour(); yaw = 0.035; pitch = 0.045; walkX = 0; updateScene(true);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-move]'), function (button) {
      var direction = button.dataset.move === 'forward' ? 1 : -1;
      button.addEventListener('pointerdown', function (e) {
        e.preventDefault(); userMove(); heldMove = direction;
        button.setPointerCapture(e.pointerId);
      });
      function release() { if (heldMove === direction) heldMove = 0; }
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });
    if (viewSelect) {
      viewSelect.value = viewKey;
      viewSelect.addEventListener('change', function () {
        var next = viewSelect.value;
        if (!VIEWS[next] || next === viewKey) return;
        stopTour(); beginUndo(); setViewpoint(next); persistFlow(); commitRecent(); scheduleAction();
      });
    }
    if (starCloseEl) starCloseEl.addEventListener('click', function () { starCard.hidden = true; });
    /* 机器人的控件与 API 共用同一个 setRover，不存在第二条状态写入路径。 */
    if (roverButton) roverButton.addEventListener('click', function () { setRover({ on: !roverOn }); });
    if (roverCloseEl) roverCloseEl.addEventListener('click', function () { setRover({ on: false }); });
    if (roverRouteInput) roverRouteInput.addEventListener('input', function () { setRover({ route: Number(roverRouteInput.value) / 1000 }); });
    if (roverHeadingInput) roverHeadingInput.addEventListener('input', function () { setRover({ heading: Number(roverHeadingInput.value) }); });
    if (roverBaffleButton) roverBaffleButton.addEventListener('click', function () { setRover({ baffle: roverBaffle === 'closed' ? 'open' : 'closed' }); });
    if (roverWalkButton) roverWalkButton.addEventListener('click', function () { setRover({ walk: !roverWalk }); });
    /* 「走到车边」只挪观测者：车一动不动，改的是人站哪儿。
       仪器读数和肉眼读数只有在同一个点位上比才算对照，隔着八百米比是假的。
       到位后还要转身面向车——偏航角原本停在「沿路往前走」，不转身的话车会留在画面侧面甚至框外。 */
    if (roverJoinButton) roverJoinButton.addEventListener('click', function () {
      userMove();
      setRoute(routeAt(zAt(roverRoute) + JOIN_STEP));
      faceRover();
    });
    setRover({ route: roverRoute, heading: roverHeading, baffle: roverBaffle });
    clearRobot();
    setTimeout(function () { lookHint.classList.add('gone'); }, 6500);
  }

  window.__CITY_WALK__ = {
    setCity: setCity,
    setRoute: setRoute,
    setHour: setHour,
    setViewpoint: setViewpoint,
    setLightsOut: setLightsOut,
    feedRobot: feedRobot,
    clearRobot: clearRobot,
    setRover: setRover,
    roverState: roverState,
    roverReading: roverReading,
    pickStar: pickStar,
    look: look,
    step: function (seconds, input) {
      var dt = clamp(Number(seconds) || 0, 0, 5);
      move(dt, input || null);
      updateScene(true, dt);
      return this.state();
    },
    view: function () { return { scene: scene, camera: camera, renderer: renderer, rig: rig, rover: roverGroup }; },
    /* 探针要跑和真人眼睛一样的那条链。
       现在画面不再由 renderer.render(scene,camera) 直接得出，而是「原片 → 辉光 → 压亮 → sRGB」。
       若探针仍自己调 renderer.render，量到的就是没压亮、没上色的线性原片：整幅暗一大截，
       「亮星像素 > 0」「街谷暖色占比」这些判据会集体假红——红在测量姿势上，不是画面坏了。 */
    render: function (opts) {
      /* opts.grain === 0：像素取证时关掉颗粒。
         颗粒是零均值的 ±4/255 噪声，人眼看不出，但「这一层比黑底亮过 18 才算一颗星」
         这条判据会被它骗——黑底自己就能抖到 27，于是整片天都被数成星（实测 31%）。
         只在探针里关，画面上照常带颗粒：关的是测量噪声，不是产品效果。 */
      var saved = post ? post.final.uniforms.uGrain.value : 0;
      if (post && opts && opts.grain === 0) post.final.uniforms.uGrain.value = 0;
      if (webgl && !contextLost && track === 'real') renderFrame(performance.now());
      if (post) post.final.uniforms.uGrain.value = saved;
      return this.state();
    },
    state: function () {
      return {
        webgl: webgl, contextLost: contextLost, city: cityKey, cityName: city.name,
        lat: city.lat, lon: city.lon, route: +route.toFixed(5), x: +walkX.toFixed(3),
        yaw: +yaw.toFixed(4), pitch: +pitch.toFixed(4), z: +zAt(route).toFixed(2),
        bortle: +bortle.toFixed(3), predictionBortle: +predictionBortle.toFixed(3), nelm: +nelm.toFixed(3), glow: +glow.toFixed(3),
        visible: visibleCount, gone: track === 'history' ? 0 : STAR_COUNT - visibleCount, total: STAR_COUNT,
        hour: +hour.toFixed(3), clock: clockLabel(hour), activity: +activity.toFixed(4),
        track: track, epoch: historyEpoch, historyEmpty: track === 'history', mode: displayMode,
        viewpoint: viewKey, viewName: view.name, skyFraction: +skyFraction.toFixed(3),
        ceilingAge: Math.round(ceilingAge), lightsOut: lightsOut, drawnStars: shownStars,
        robot: robot ? { lux: robot.lux, heading: robot.heading, baffle: robot.baffle, source: robot.source } : null,
        rover: roverState(),
        buildings: buildingCount, trees: treeCount, lamps: lampCount, grass: grassCount,
        tour: tour, frames: frames, drawCalls: sceneDrawCalls,
        triangles: renderer ? renderer.info.render.triangles : 0,
        fallback: !fallback.hidden, fallbackMode: webgl && !contextLost ? 'live' : fallbackMode,
        canUndo: !!(EX && EX.canUndo(cityKey)), privateMode: !!(EX && EX.isPrivate()),
        sync: EX ? EX.syncState() : null, throttle: flowThrottle ? flowThrottle.state() : null,
        actionBortle: +actionBortle.toFixed(3), computeCost: +lastComputeCost.toFixed(3)
      };
    }
  };

  init();
})();
