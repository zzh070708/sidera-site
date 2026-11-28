(function () {
  'use strict';

  var KEY = 'sidera_citywalk_m1_records';
  var LOCK_AHEAD_MIN = 1;
  var HISTORY_NOTICE = '历史轨道无真实年代模型，不生成实地预测；请切回真实时段';
  var PRIVATE_STORAGE_NOTICE = '隐私模式：本次记录仅保留在当前页面，可导出；未写入本机';
  var panel = document.getElementById('sciencePanel');
  var toggle = document.getElementById('scienceToggle');
  var close = document.getElementById('scienceClose');
  var statusEl = document.getElementById('scienceStatus');
  var freezeButton = document.getElementById('freezePrediction');
  var nextButton = document.getElementById('nextAnchor');
  var submitButton = document.getElementById('submitObservation');
  var exportButton = document.getElementById('exportRecords');
  var storageWarning = document.getElementById('storageWarning');
  var starData = window.STAR_DATA || null;
  var stars = null, groundReady = false, signature = '', anchorCursor = 0, anchorCount = 0;
  var candidate = null, locked = null, dirty = false, latestVerdict = null;
  var records = [], pendingRecords = [], storageRaw = null, storageError = '', privatePending = false, open = false, initialized = false;
  var cachedParts = { evidence: [], reference: [], quarantined: [] };

  function byId(id) { return document.getElementById(id); }
  function currentTrack() {
    var s = window.__CITY_WALK__ && window.__CITY_WALK__.state();
    return s && s.track === 'history' ? 'history' : 'real';
  }
  function isPrivate() {
    return !!(window.SIDERA_EXPERIENCE && typeof window.SIDERA_EXPERIENCE.isPrivate === 'function' && window.SIDERA_EXPERIENCE.isPrivate());
  }
  function value(id) { var el = byId(id); return el ? el.value : ''; }
  function setText(id, text) { var el = byId(id); if (el) el.textContent = text; }
  function number(id) { var raw = value(id).trim(); return raw === '' ? NaN : Number(raw); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localIso(date) {
    return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate()) + 'T' +
      pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds());
  }
  function recordId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return 'cw-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function b64bytes(b64) {
    var s = atob(b64), n = s.length, a = new Uint8Array(n);
    for (var i = 0; i < n; i++) a[i] = s.charCodeAt(i);
    return a;
  }
  function b64f32(b64) { return new Float32Array(b64bytes(b64).buffer); }
  function decodeStars() {
    if (!starData || !starData.n || !starData.pos || !starData.mag || !starData.bv) {
      throw new Error('真实星表数据缺失');
    }
    return {
      n: starData.n,
      pos: b64f32(starData.pos),
      mag: b64bytes(starData.mag),
      bv: b64bytes(starData.bv),
      names: starData.names || {}
    };
  }
  function magOf(i) { return stars.mag[i] / 255 * 16.5 - 1.5; }
  function bvOf(i) { return stars.bv[i] / 255 * 2.5 - 0.5; }
  function bvColor(bv, out, o) {
    var r, g, b;
    if (bv < 0) { r = 0.72; g = 0.80; b = 1.00; }
    else if (bv < 0.4) { var k = bv / 0.4; r = 0.72 + 0.28 * k; g = 0.80 + 0.17 * k; b = 1.00 - 0.09 * k; }
    else if (bv < 1.0) { var k2 = (bv - 0.4) / 0.6; r = 1.00; g = 0.97 - 0.15 * k2; b = 0.91 - 0.28 * k2; }
    else { var k3 = Math.min(1, (bv - 1.0) / 0.8); r = 1.00; g = 0.82 - 0.12 * k3; b = 0.63 - 0.18 * k3; }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }
  function initGround() {
    if (groundReady) return;
    if (!window.THREE || !window.GROUND || !window.M1) throw new Error('星空计算内核未载入');
    stars = decodeStars();
    /* GROUND 仅用于坐标、恒星时与计数；不把它的独立场景接入城市后期合成。 */
    window.GROUND.build({
      renderer: { getPixelRatio: function () { return 1; } },
      realN: stars.n, pos: stars.pos, magOf: magOf, bvOf: bvOf, bvColor: bvColor
    });
    groundReady = true;
  }
  function loadRecords() {
    var raw;
    try { raw = window.localStorage.getItem(KEY); }
    catch (e) { storageError = '本机记录存储不可用；为避免覆盖原值，已暂停写入。'; refreshParts(); return; }
    if (!raw) { records = []; refreshParts(); return; }
    try {
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('记录容器不是数组');
      records = parsed;
    } catch (e) {
      records = [];
      storageRaw = raw;
      storageError = '检测到损坏的旧记录；原值未被覆盖，已暂停写入。可导出保留原值；新判定只进入待保存区，刷新会丢失。';
    }
    refreshParts();
  }
  function availableRecords() { return records.concat(pendingRecords); }
  function refreshParts() {
    cachedParts = window.M1 ? window.M1.partitionRecords(availableRecords()) : { evidence: [], reference: [], quarantined: [] };
  }
  function partition() { return cachedParts; }
  function candidateFrom(input) {
    initGround();
    var gs = window.GROUND.state();
    var city = { name: input.cityName, lat: input.lat, lon: input.lon };
    window.GROUND.setSite(city, input.hour);
    window.GROUND.setBortle(input.bortle);
    var choices = window.GROUND.brightest(60).filter(function (s) { return s.alt >= 25 && s.alt <= 75; });
    anchorCount = choices.length;
    if (!choices.length) throw new Error('这个时刻没有符合高度条件的亮星，请换一个时间。');
    var star = choices[anchorCursor % choices.length];
    var count = window.GROUND.windowCount(star.i, 5);
    if (!count) throw new Error('锚星窗口计数失败');
    var g = window.GROUND.state();
    var nm = stars.names[star.i];
    var name = nm && nm.n ? nm.n : 'HYG #' + star.i;
    var createdAt = localIso(new Date(Date.now() + 8 * 3600000)) + '+08:00';
    var result = {
      schema: window.M1.SCHEMA,
      predictionId: recordId(),
      protocolVersion: 'M1-3',
      modelVersion: g.modelVersion,
      catalog: g.catalog,
      createdAt: createdAt,
      predictedAt: g.predictedAt,
      timeZone: g.timeZone,
      nightKey: g.nightKey,
      city: city.name,
      place: city.name + '市中心（城市中心坐标）',
      lat: city.lat,
      lon: city.lon,
      bortle: count.bortle,
      limit: count.limit,
      count: count.count,
      anchor: star.i,
      name: name,
      az: +count.az.toFixed(4),
      alt: +count.alt.toFixed(4),
      window: 'fist',
      windowRadius: 5,
      windowDiameter: 10,
      horizon: g.horizon,
      extinction: g.extinction,
      digest: '',
      inputs: {
        city: input.cityKey, hour: input.hour, bortle: count.bortle,
        lightsOut: !!input.lightsOut, predictedAt: g.predictedAt
      }
    };
    return window.M1.freezePrediction(result);
  }
  function sameInputs(a, b) {
    return !!a && !!b && a.city === b.city && a.hour === b.hour && a.bortle === b.bortle &&
      a.lightsOut === b.lightsOut && a.predictedAt === b.predictedAt;
  }
  /* 「预测先于观测」是预注册的前提，不是内核里的漂亮话：
     M1 要求计数时刻既不早于预测创建时间，又落在预测前后 5 分钟内。
     若预测时刻已经过去，这两条只能靠「补一个早就观测完的计数」同时满足——那已经不是预测。
     所以过去时刻一律不给锁定，而不是让它锁定后必然判成不可比。 */
  function lockWindow(p) {
    if (!p) return { ok: false, aheadMin: NaN, reason: '没有候选预测，不能锁定。' };
    var wall = window.M1.parseWall(p.predictedAt, true);
    if (!wall) return { ok: false, aheadMin: NaN, reason: '预测时刻解析失败，不能锁定。' };
    var nowWall = Math.floor(Date.now() / 1000) * 1000 + 8 * 3600000;
    var aheadMin = (wall.ms - nowWall) / 60000;
    if (aheadMin < LOCK_AHEAD_MIN) {
      return { ok: false, aheadMin: aheadMin,
        reason: '这个预测时刻已经过去（距现在 ' + Math.round(aheadMin) + ' 分钟）：锁定后任何现场计数都会早于预测创建时间，必然只能算「不可比」。' +
                '本页只覆盖 19:00 至次日 04:00 这一夜，请把「观测时刻」滑到当前钟点之后；若整段都已过去，请到了傍晚再回来锁定。' };
    }
    return { ok: true, aheadMin: aheadMin };
  }
  function render() {
    var history = currentTrack() === 'history';
    var p = history ? locked : (locked || candidate);
    var parts = partition();
    setText('recordSummary', '有效证据 ' + parts.evidence.length + ' · 参考 ' + parts.reference.length + ' · 隔离 ' + parts.quarantined.length +
      (pendingRecords.length ? ' · 待保存 ' + pendingRecords.length : ''));
    storageWarning.hidden = !storageError && !privatePending;
    storageWarning.textContent = privatePending ? PRIVATE_STORAGE_NOTICE : storageError;
    exportButton.disabled = !availableRecords().length && storageRaw === null;
    if (history) {
      setText('scienceStatus', HISTORY_NOTICE);
      freezeButton.disabled = true;
      nextButton.disabled = true;
      submitButton.disabled = true;
    }
    if (!history && !groundReady && !statusEl.dataset.error) {
      setText('scienceStatus', '正在载入真实星表…');
      return;
    }
    if (!p) {
      setText('predictionState', locked ? '旧预测已过期' : '尚未锁定');
      setText('predictionCount', '—');
      setText('predictionName', '—');
      setText('predictionWhere', '—');
      setText('predictionWhen', '—');
      freezeButton.disabled = true;
      nextButton.disabled = true;
      submitButton.disabled = true;
      return;
    }
    setText('predictionState', locked ? (dirty ? '已锁定 · 条件已变化' : '已锁定 · 可核对')
      : (candidate ? (lockWindow(candidate).ok ? '候选预测 · 尚未冻结' : '候选预测 · 时刻已过，暂不可锁定') : '尚未锁定'));
    setText('predictionCount', p.count);
    setText('predictionName', p.name);
    setText('predictionWhere', p.city + '市中心 · ' + p.lat.toFixed(4) + '°N ' + p.lon.toFixed(4) + '°E');
    setText('predictionWhen', p.predictedAt + ' · Bortle ' + p.bortle + '（市中心灯光模型连续值取整，非现场实测）');
    setText('predictionNote', locked
      ? (dirty ? '当前城市、时间或灯光已变化。这张卡仍保留原预测，不会偷偷改数；请重新锁定后再做新预测。' : '预测已冻结。路线滑块只改变三维场景，不改变这里的城市中心坐标。')
      : '这是可锁定的候选，不是观测结果。三维路线只改变场景，真实预测使用当前城市中心坐标。');
    setText('scienceStatus', dirty ? '当前条件与锁定预测不同；提交仍只读取旧快照。' : '真实星表已就绪 · 直径 10° · 地平线以上 · 大气消光 0.26');
    var candLock = lockWindow(candidate);
    if (candidate && !candLock.ok) setText('scienceStatus', candLock.reason);
    freezeButton.disabled = !candLock.ok;
    freezeButton.title = candidate && !candLock.ok ? candLock.reason : '';
    nextButton.disabled = false;
    submitButton.disabled = !locked;
    if (history) {
      setText('scienceStatus', HISTORY_NOTICE);
      freezeButton.disabled = true;
      freezeButton.title = '';
      nextButton.disabled = true;
      submitButton.disabled = true;
    }
    if (locked) {
      setText('observationGuide', '预测基准：' + p.place + '；' + p.lat.toFixed(6) + '°N ' + p.lon.toFixed(6) + '°E；' +
        p.predictedAt + '；方位 ' + p.az.toFixed(4) + '°、仰角 ' + p.alt.toFixed(4) + '°。现场字段必须由观测者填写并确认，不自动冒充实测。');
    } else {
      setText('observationGuide', '请先锁定预测，再按现场实际情况填写；系统不会用预测值代替观测值。');
    }
  }
  function resetObservation() {
    ['obsActual', 'obsDark', 'obsTime', 'obsPlace', 'obsLat', 'obsLon', 'obsAz', 'obsAlt', 'obsNelm'].forEach(function (id) {
      byId(id).value = '';
    });
    ['obsSource', 'obsCloud', 'obsMoon', 'obsBlock'].forEach(function (id) { byId(id).value = ''; });
    byId('obsMethod').checked = false;
    byId('obsWindow').checked = false;
  }
  function sync(input) {
    if (currentTrack() === 'history') {
      candidate = null;
      signature = '';
      statusEl.dataset.error = '';
      render();
      return state();
    }
    if (!initialized || !window.M1 || !window.GROUND || !starData) return state();
    var next = [input.cityKey, input.lat, input.lon, input.hour, input.bortle, input.lightsOut ? 1 : 0].join('|');
    if (signature === next) return state();
    signature = next;
    try {
      candidate = candidateFrom(input);
      dirty = !!locked && !sameInputs(locked.inputs, candidate.inputs);
      statusEl.dataset.error = '';
    } catch (e) {
      statusEl.dataset.error = '1';
      setText('scienceStatus', '真实预测不可用：' + e.message);
      candidate = null;
      freezeButton.disabled = true;
      nextButton.disabled = true;
      return state();
    }
    render();
    return state();
  }
  function freeze() {
    if (currentTrack() === 'history' || !candidate) return false;
    var candLock = lockWindow(candidate);
    if (!candLock.ok) {
      setText('scienceStatus', candLock.reason);
      freezeButton.disabled = true;
      return false;
    }
    try {
      locked = candidate;
      dirty = false;
      latestVerdict = null;
      byId('verdictCard').hidden = true;
      byId('observationDetails').open = false;
      resetObservation();
      render();
      return true;
    } catch (e) {
      setText('scienceStatus', '锁定失败：' + e.message);
      return false;
    }
  }
  function nextAnchor() {
    if (currentTrack() === 'history') return false;
    anchorCursor++;
    var input = currentInput();
    if (!input) return false;
    signature = '';
    sync(input);
    return !!candidate;
  }
  function currentInput() {
    var s = window.__CITY_WALK__ && window.__CITY_WALK__.state();
    if (!s || s.track === 'history') return null;
    return { cityKey: s.city, cityName: s.cityName, lat: s.lat, lon: s.lon,
      hour: s.hour, bortle: Math.max(1, Math.min(9, Math.round(s.predictionBortle))), lightsOut: s.lightsOut };
  }
  function observation() {
    if (!locked) return null;
    return {
      cloud: value('obsCloud'), moon: value('obsMoon'),
      darkMin: number('obsDark'), method: byId('obsMethod').checked ? 'point' : '',
      window: byId('obsWindow').checked ? 'fist' : '',
      block: value('obsBlock'), coordSrc: value('obsSource'),
      timeZone: '+08:00', countAt: value('obsTime'), place: value('obsPlace').trim(),
      lat: number('obsLat'), lon: number('obsLon'), az: number('obsAz'), alt: number('obsAlt'),
      anchor: locked.anchor, windowRadius: 5, nelm: value('obsNelm')
    };
  }
  function submit() {
    if (currentTrack() === 'history' || !locked || !window.M1) return null;
    var actual = number('obsActual');
    var obs = observation();
    if (!window.M1.isCount(actual)) {
      setText('scienceStatus', '请填入非负整数的实际颗数。');
      return null;
    }
    var verdict = window.M1.verdictPrediction(locked, actual, obs);
    var record = {
      schema: window.M1.SCHEMA,
      recordId: recordId(),
      recordedAt: new Date().toISOString(),
      prediction: clone(locked),
      observation: obs,
      actual: actual,
      verdict: verdict
    };
    latestVerdict = clone(verdict);
    setText('verdictTag', verdict.code === 'confirm' ? '本次吻合' : verdict.code === 'falsify' ? '本次不吻合' : '不可比 · 仅参考');
    setText('verdictTitle', verdict.code === 'confirm' ? '观测与预测一致' : verdict.code === 'falsify' ? '观测未通过这条预测' : '条件不足，不能下结论');
    setText('verdictText', verdict.text);
    byId('verdictCard').hidden = false;
    var privateMode = isPrivate();
    var stored = false;
    if (!privateMode && !storageError) {
      try {
        var next = records.concat([record]);
        window.localStorage.setItem(KEY, JSON.stringify(next));
        records = next;
        stored = true;
      } catch (e) {
        storageError = '记录写入失败；本次判定已进入待保存区，可立即导出，但刷新会丢失。原存储值未被覆盖。';
      }
    }
    if (!stored) {
      pendingRecords = pendingRecords.concat([record]);
      if (privateMode) privatePending = true;
    }
    refreshParts();
    render();
    return { record: record, verdict: verdict, stored: stored };
  }
  function setOpen(on) {
    open = !!on;
    panel.hidden = !open;
    document.body.classList.toggle('science-open', open);
    if (toggle) {
      toggle.classList.toggle('on', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-pressed', open ? 'true' : 'false');
      toggle.textContent = open ? '收起预测核对' : '预测核对';
    }
    if (open) render();
    return open;
  }
  function exportRecords() {
    if (!availableRecords().length && storageRaw === null) return false;
    var payload = { product: '星阑归序 · 向暗处走', protocol: 'M1-3', exportedAt: new Date().toISOString(),
      note: 'digest 仅用于发现意外改动，不是防恶意篡改签名。records 含已保存与待保存记录；pendingRecords 单列未写入项；rawStorage 保留检测到的损坏原值。',
      storageError: storageError, savedRecords: records, pendingRecords: pendingRecords,
      rawStorage: storageRaw, records: availableRecords() };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url;
    a.download = 'sidera-citywalk-m1-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return true;
  }
  function state() {
    var parts = partition();
    return {
      ready: groundReady, open: open, signature: signature, candidate: candidate && clone(candidate),
      locked: locked && clone(locked), lockedFrozen: !!locked && Object.isFrozen(locked), dirty: dirty, latestVerdict: latestVerdict && clone(latestVerdict),
      storageError: storageError, observation: observation(), storageRawPreserved: storageRaw !== null,
      track: currentTrack(), canLock: currentTrack() !== 'history' && lockWindow(candidate).ok, lockAheadMinutes: lockWindow(candidate).aheadMin,
      records: { evidence: parts.evidence.length, reference: parts.reference.length, quarantined: parts.quarantined.length },
      storedRecords: records.length, pendingRecords: pendingRecords.length, exportableRecords: availableRecords().length,
      anchors: anchorCount
    };
  }
  function init() {
    if (initialized) return;
    initialized = true;
    loadRecords();
    if (toggle) toggle.addEventListener('click', function () { setOpen(!open); });
    if (close) close.addEventListener('click', function () { setOpen(false); });
    freezeButton.addEventListener('click', freeze);
    nextButton.addEventListener('click', nextAnchor);
    submitButton.addEventListener('click', submit);
    exportButton.addEventListener('click', exportRecords);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) setOpen(false); });
    render();
  }
  window.CityScience = { init: init, sync: sync, freeze: freeze, nextAnchor: nextAnchor,
    submit: submit, observation: observation, exportRecords: exportRecords, setOpen: setOpen, state: state };
  init();
})();
