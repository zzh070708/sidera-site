(function () {
  'use strict';

  var PREF_KEY = 'sidera_experience_v1';
  var CONTEXT_KEY = 'sidera_context_v1';
  var CLEAR_KEY = 'sidera_clear_v1';
  var CHANNEL = 'sidera-experience-v1';
  var listeners = [], contextListeners = [], syncListeners = [];
  var privateMode = false, privateSnapshot = null, channel = null, timer = null, toastEl = null, stripEl = null;
  var syncState = { connected: false, failures: 0, independent: false, inFlight: false, retryAt: 0, lastError: '' };
  var lastContext = null, lastReset = false, pendingSync = null, syncWake = null;
  var lastToast = { message: '', at: 0 };
  var lastClearKind = '';
  var undoStack = [];

  function defaults() {
    return {
      version: 1, noticeShown: false,
      home: { city: '', hour: 22, bortle: 8, actTag: 'daily', poemId: '', poemOpen: false, recentPoems: [], poemState: {} },
      city: { city: 'beijing', hour: 21, epoch: 1500, track: 'real', view: 'street', mode: 'immersive', recent: [] }
    };
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function clean(defaultValue, value) {
    var out = clone(defaultValue);
    if (!value || typeof value !== 'object') return out;
    Object.keys(out).forEach(function (key) {
      if (out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) out[key] = clean(out[key], value[key]);
      else if (value[key] !== undefined) out[key] = value[key];
    });
    return out;
  }
  function readPrefs() {
    try {
      var raw = window.localStorage.getItem(PREF_KEY);
      return raw ? clean(defaults(), JSON.parse(raw)) : defaults();
    } catch (e) { return defaults(); }
  }
  var prefs = readPrefs();

  function emit() { listeners.slice().forEach(function (fn) { fn(clone(prefs)); }); }
  function writePrefs() {
    if (privateMode) return false;
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      return true;
    } catch (e) { notify('本机偏好写入失败；本次仍可在当前页面使用。'); return false; }
  }
  function save() {
    var ok = writePrefs();
    if (ok && !prefs.noticeShown) {
      prefs.noticeShown = true;
      writePrefs();
      notify('本机记忆已开启：只保存城市、时段和浏览状态，不默认保存精确定位。可在「本机数据」查看或清除。', 8000);
    }
    emit();
    return ok;
  }
  function patch(scope, values) {
    if (!prefs[scope]) return false;
    Object.keys(values || {}).forEach(function (key) { prefs[scope][key] = values[key]; });
    return save();
  }
  function setPrivate(on) {
    if (privateMode === !!on) return privateMode;
    if (on) {
      privateSnapshot = clone(prefs);
      privateMode = true;
      pendingSync = null;
      if (syncWake) { clearTimeout(syncWake); syncWake = null; }
      emit();
    } else {
      privateMode = false;
      prefs = privateSnapshot ? clone(privateSnapshot) : defaults();
      privateSnapshot = null;
      emit();
    }
    emitSync();
    return privateMode;
  }
  function isPrivate() { return privateMode; }
  function canWrite() { return !privateMode; }
  function get(scope) { return clone(prefs[scope]); }
  function all() { return clone(prefs); }
  function subscribe(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageRemove(key) {
    if (privateMode) return false;
    try { window.localStorage.removeItem(key); return true; } catch (e) { return false; }
  }
  function counts() {
    var a = storageGet('sidera_m1_records'), b = storageGet('sidera_citywalk_m1_records');
    var peripheral = '';
    try { peripheral = window.sessionStorage.getItem('sidera-peripheral-id'); } catch (e) {}
    function count(raw) { try { var v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } }
    return {
      preferences: !!storageGet(PREF_KEY), context: !!storageGet(CONTEXT_KEY),
      apiKey: !!storageGet('gx_ds_key'), homeRecords: count(a), cityRecords: count(b),
      recent: prefs.city.recent.length, poems: prefs.home.recentPoems.length,
      peripheralSession: !!peripheral
    };
  }
  function broadcastClear(kind) {
    try { window.localStorage.setItem(CLEAR_KEY, kind); } catch (e) {}
    if (channel) {
      try { channel.postMessage({ type: 'clear', kind: kind, at: Date.now() }); } catch (e) {}
    }
    try { window.localStorage.removeItem(CLEAR_KEY); } catch (e) {}
  }
  function consumeClear(kind) {
    if (kind === undefined) kind = storageGet(CLEAR_KEY);
    if (kind !== 'all' && kind !== 'prefs' && kind !== 'recent') return false;
    storageRemove(CLEAR_KEY);
    lastClearKind = kind;
    receive({ type: 'clear', kind: kind, at: Date.now() });
    return true;
  }
  function clearPreferences(kind) {
    if (privateMode) return false;
    broadcastClear(kind === 'all' ? 'all' : 'prefs');
    var prefOk = storageRemove(PREF_KEY), contextOk = storageRemove(CONTEXT_KEY);
    prefs = defaults();
    lastClearKind = kind === 'all' ? 'all' : 'prefs';
    try {
      var url = new URL(location.href);
      ['city', 'h', 'epoch', 'track', 'v', 't', 'from'].forEach(function (key) { url.searchParams.delete(key); });
      history.replaceState(null, '', url.href);
    } catch (e) {}
    emit();
    if (!prefOk || !contextOk) notify('部分本机数据未能删除；当前页面已恢复默认状态，请检查浏览器存储权限。');
    return prefOk && contextOk;
  }
  function clearAll() {
    if (privateMode || !clearPreferences('all')) return false;
    var ok = storageRemove('gx_ds_key');
    if (!ok) notify('偏好已清除，但已保存 API Key 未能删除。');
    return ok;
  }

  function validContext(input) {
    if (!input || !input.cityName || !isFinite(Number(input.hour))) return null;
    return {
      version: 1, source: input.source === 'home' ? 'home' : 'city',
      cityKey: String(input.cityKey || ''), cityName: String(input.cityName),
      hour: Math.round(Number(input.hour) * 4) / 4, at: Date.now()
    };
  }
  function persistContext(input) {
    if (privateMode) return false;
    var context = validContext(input);
    if (!context) return false;
    try {
      window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
      return true;
    } catch (e) { return false; }
  }
  function queueSync(kind, input) {
    pendingSync = { kind: kind, input: input };
    if (syncWake || syncState.inFlight) return;
    syncWake = setTimeout(function () {
      syncWake = null;
      if (privateMode) { pendingSync = null; return; }
      if (Date.now() < syncState.retryAt) { queueSync(pendingSync.kind, pendingSync.input); return; }
      var next = pendingSync; pendingSync = null;
      if (next.kind === 'reset') sendReset(); else sendContext(next.input);
    }, Math.max(0, syncState.retryAt - Date.now()) + 20);
  }
  function finishSync(sent, error) {
    syncState.inFlight = false;
    syncState.connected = sent;
    syncState.lastError = error;
    syncState.failures = sent ? 0 : syncState.failures + 1;
    syncState.independent = !sent && syncState.failures >= 3;
    if (!sent) syncState.retryAt = Date.now() + 2000;
    emitSync();
    if (pendingSync) queueSync(pendingSync.kind, pendingSync.input);
    else if (!sent && syncState.failures < 3) {
      queueSync(lastReset ? 'reset' : 'context', lastReset ? null : lastContext);
    }
    return sent;
  }
  function sendContext(input) {
    if (privateMode) return false;
    var context = validContext(input);
    if (!context) return false;
    if (syncState.inFlight || Date.now() < syncState.retryAt) { queueSync('context', context); return false; }
    lastContext = context;
    lastReset = false;
    syncState.inFlight = true;
    var sent = false, error = '';
    if (channel) {
      try { channel.postMessage({ type: 'context', context: context }); sent = true; } catch (e) { error = '跨页面通道不可用'; }
    }
    try { window.localStorage.setItem(CONTEXT_KEY, JSON.stringify(context)); sent = true; }
    catch (e) { error = error || '本机上下文写入失败'; }
    return finishSync(sent, error);
  }
  function sendReset() {
    if (privateMode) return false;
    if (syncState.inFlight || Date.now() < syncState.retryAt) { queueSync('reset', null); return false; }
    lastContext = null;
    lastReset = true;
    syncState.inFlight = true;
    var sent = false;
    if (channel) {
      try { channel.postMessage({ type: 'reset' }); sent = true; } catch (e) {}
    }
    try {
      window.localStorage.setItem(CONTEXT_KEY, JSON.stringify({ version: 1, source: 'home', reset: true, at: Date.now() }));
      sent = true;
    } catch (e) {}
    return finishSync(sent, '');
  }
  function retry() {
    if (privateMode || syncState.inFlight || Date.now() < syncState.retryAt) return false;
    if (pendingSync) {
      var queued = pendingSync; pendingSync = null;
      if (syncWake) { clearTimeout(syncWake); syncWake = null; }
      return queued.kind === 'reset' ? sendReset() : sendContext(queued.input);
    }
    if (lastReset) return sendReset();
    if (lastContext) return sendContext(lastContext);
    var raw = storageGet(CONTEXT_KEY);
    if (!raw) return false;
    try { var context = JSON.parse(raw); return context.reset ? sendReset() : sendContext(context); }
    catch (e) { return false; }
  }
  function onContext(fn) { if (typeof fn === 'function') contextListeners.push(fn); }
  function receive(message) {
    if (!message) return;
    if (message.type === 'clear') {
      prefs = defaults();
      emit();
    }
    if (message.type !== 'context' && message.type !== 'reset' && message.type !== 'clear') return;
    contextListeners.slice().forEach(function (fn) { fn(message); });
  }
  function emitSync() {
    syncListeners.slice().forEach(function (fn) { fn(clone(syncState)); });
    if (stripEl || syncState.failures > 0) renderSync(clone(syncState));
  }
  function onSync(fn) { if (typeof fn === 'function') syncListeners.push(fn); }
  function syncStateValue() { return clone(syncState); }
  function initChannel() {
    var Channel = window.BroadcastChannel || (typeof BroadcastChannel !== 'undefined' ? BroadcastChannel : null);
    if (Channel) {
      try { channel = new Channel(CHANNEL); channel.onmessage = function (e) { receive(e.data); }; } catch (e) { channel = null; }
    }
    window.addEventListener('storage', function (e) {
      if (e.key === CLEAR_KEY) {
        if (e.newValue) consumeClear(e.newValue);
        return;
      }
      if (e.key === PREF_KEY && !e.newValue) {
        receive({ type: 'clear', kind: lastClearKind || 'prefs', at: Date.now() });
        return;
      }
      if (e.key !== CONTEXT_KEY || !e.newValue) return;
      try {
        var context = JSON.parse(e.newValue);
        receive(context && context.reset ? { type: 'reset', at: context.at } : { type: 'context', context: context });
      } catch (err) {}
    });
    consumeClear();
    emitSync();
  }

  function notify(message, duration) {
    var now = Date.now();
    if (message === lastToast.message && now - lastToast.at < 30000) return;
    lastToast = { message: message, at: now };
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'sx-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    if (!toastEl.querySelector('[data-close]')) {
      var close = document.createElement('button');
      close.type = 'button'; close.dataset.close = '1'; close.textContent = '×'; close.setAttribute('aria-label', '关闭提示');
      close.addEventListener('click', function () { toastEl.hidden = true; });
      toastEl.appendChild(close);
    }
    toastEl.hidden = false;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { toastEl.hidden = true; }, duration || 6000);
  }
  function ensureStrip() {
    if (stripEl) return stripEl;
    stripEl = document.createElement('div');
    stripEl.className = 'sx-sync-strip';
    stripEl.hidden = true;
    stripEl.innerHTML = '<span></span><div><button type="button" data-retry>重试</button><button type="button" data-close aria-label="关闭提示">×</button></div>';
    stripEl.querySelector('[data-retry]').addEventListener('click', retry);
    stripEl.querySelector('[data-close]').addEventListener('click', function () { stripEl.hidden = true; });
    document.body.appendChild(stripEl);
    return stripEl;
  }
  function renderSync(state) {
    var strip = ensureStrip();
    if (state.connected) {
      strip.hidden = true;
      if (toastEl && toastEl.dataset.sync === '1') {
        toastEl.textContent = '两页状态已同步。';
        toastEl.dataset.sync = '';
        clearTimeout(timer);
        timer = setTimeout(function () { toastEl.hidden = true; }, 2000);
      }
      return;
    }
    strip.hidden = false;
    strip.querySelector('span').textContent = state.independent
      ? '跨页面同步已暂停，两页可继续独立使用。'
      : '两页暂时没有同步；可稍后重试，当前页不受影响。';
    var retryButton = strip.querySelector('[data-retry]');
    retryButton.disabled = state.inFlight || Date.now() < state.retryAt;
    if (!state.inFlight && Date.now() < state.retryAt) {
      setTimeout(function () { if (!strip.hidden) retryButton.disabled = Date.now() < syncState.retryAt; }, state.retryAt - Date.now() + 20);
    }
    if (state.lastError) {
      notify(state.lastError);
      if (toastEl) toastEl.dataset.sync = '1';
    }
  }

  function recentList() {
    var cutoff = Date.now() - 7 * 86400000;
    prefs.city.recent = (Array.isArray(prefs.city.recent) ? prefs.city.recent : []).filter(function (item) {
      return item && Number(item.at) >= cutoff;
    }).slice(0, 3);
    return clone(prefs.city.recent);
  }
  function recentKey(item) {
    return [item.city, item.hour, item.track, item.track === 'history' ? item.epoch : 'real', item.view].join('|');
  }
  function addRecent(item) {
    var next = { city: item.city, cityName: item.cityName, hour: item.hour, epoch: item.epoch,
      track: item.track, view: item.view, at: Date.now() };
    var list = recentList().filter(function (old) { return recentKey(old) !== recentKey(next); });
    list.unshift(next);
    prefs.city.recent = list.slice(0, 3);
    save();
    return clone(prefs.city.recent);
  }
  function clearRecent() {
    if (privateMode) return false;
    prefs.city.recent = [];
    var ok = save();
    if (ok) broadcastClear('recent');
    return ok;
  }
  function poemHistory() {
    var list = Array.isArray(prefs.home.recentPoems) ? prefs.home.recentPoems : [];
    return list.filter(function (item) { return item && item.id; }).slice(0, 10);
  }
  function recordPoem(id, context, open) {
    var list = poemHistory().filter(function (item) { return item.id !== id; });
    list.unshift({ id: id, city: context && context.city || '', track: context && context.track || 'real',
      hour: context && context.hour || null, epoch: context && context.epoch || null, at: Date.now() });
    prefs.home.recentPoems = list.slice(0, 10);
    if (!prefs.home.poemState || typeof prefs.home.poemState !== 'object') prefs.home.poemState = {};
    prefs.home.poemState[id] = !!open;
    prefs.home.poemId = id;
    prefs.home.poemOpen = !!open;
    save();
  }
  function setPoemOpen(id, open) {
    if (!prefs.home.poemState || typeof prefs.home.poemState !== 'object') prefs.home.poemState = {};
    prefs.home.poemState[id] = !!open;
    prefs.home.poemId = id;
    prefs.home.poemOpen = !!open;
    save();
  }

  function snapshot(item) {
    return { city: item.city, track: item.track, hour: item.hour, epoch: item.epoch, view: item.view, route: item.route == null ? 0 : item.route };
  }
  function canUndo(city) {
    return undoStack.some(function (entry) { return entry.state.city === city; });
  }
  function recordUndo(item) {
    var list = undoStack.filter(function (entry) { return entry.state.city === item.city; });
    list.push({ state: snapshot(item) });
    if (list.length > 10) list.shift();
    undoStack = undoStack.filter(function (entry) { return entry.state.city !== item.city; }).concat(list);
    return list.length;
  }
  function undo(city) {
    var index = -1;
    for (var i = undoStack.length - 1; i >= 0; i--) if (undoStack[i].state.city === city) { index = i; break; }
    if (index < 0) return null;
    var entry = undoStack.splice(index, 1)[0];
    return { state: entry.state, remaining: undoStack.filter(function (e) { return e.state.city === city; }).length };
  }
  function clearUndo(city) { undoStack = city ? undoStack.filter(function (entry) { return entry.state.city !== city; }) : []; }

  function AdaptiveThrottle() {
    this.level = 0; this.last = 0; this.frames = []; this.cost = 0; this.stableAt = 0; this.frozen = false; this.rates = [10, 5, 2];
  }
  AdaptiveThrottle.prototype.sample = function (frameMs, costMs) {
    var now = performance.now();
    this.frames.push(Math.max(0, Number(frameMs) || 0));
    if (this.frames.length > 30) this.frames.shift();
    this.cost = Math.max(0, Number(costMs) || 0);
    var slow3 = this.frames.slice(-3).every(function (v) { return v > 33; });
    var slow3Heavy = this.frames.slice(-3).every(function (v) { return v > 50; });
    if (this.cost > 80 || slow3Heavy) this.level = 2;
    else if (this.cost > 40 || slow3) this.level = Math.max(this.level, 1);
    var fast3 = this.frames.slice(-3).length === 3 && this.frames.slice(-3).every(function (v) { return v < 25; });
    if (this.cost > 160 || (this.frames.length >= 5 && this.frames.slice(-5).every(function (v) { return v > 100; }))) {
      this.frozen = true; this.stableAt = 0;
    } else {
      var recovered = fast3 && this.cost < 35;
      if (recovered) {
        if (!this.stableAt) this.stableAt = now;
        if (now - this.stableAt >= 2000) {
          this.frozen = false;
          if (this.level > 0) this.level--;
          this.stableAt = 0;
        }
      } else this.stableAt = 0;
    }
    return this.state();
  };
  AdaptiveThrottle.prototype.advance = function (now, fn) {
    if (this.frozen) return false;
    var interval = 1000 / this.rates[this.level];
    if (now - this.last < interval) return false;
    this.last = now;
    fn();
    return true;
  };
  AdaptiveThrottle.prototype.state = function () { return { level: this.level, rate: this.rates[this.level], frozen: this.frozen, cost: this.cost }; };

  function actionsFor(bortle, track, daylight, tag) {
    var band = bortle <= 3 ? 'dark' : bortle <= 6 ? 'mid' : 'bright';
    var lists = {
      dark: {
        observe: ['选择无月晴夜，先暗适应 20 分钟再数星。', '把一拳宽窗口和计数时刻记下来，下次仍在同一点比较。', '拍摄时避免白光直射，保留暗夜环境。'],
        daily: ['关掉不必要的朝天灯，给路灯加遮光罩。', '室内灯光在睡前调暗，减少向窗外溢光。', '向物业说明照明时段和朝向，先做一盏灯的对照。']
      },
      mid: {
        observe: ['先找当月最亮的星座，再用一拳宽窗口做小范围计数。', '避开广告牌与车灯直射，记录遮挡和云量。', '把城市边缘与郊区分别记录，比较同一时刻的天空。'],
        daily: ['将高色温白光换成 3000K 以下暖光。', '给朝上的射灯加罩，让光落到需要照亮的位置。', '推动社区关闭非必要彻夜招牌，保留安全照明。']
      },
      bright: {
        observe: ['先做真实预测，再在有月或薄云时如实标注，不把不可比记录当证据。', '优先寻找更高、更开阔且没有直射灯的位置。', '观星条件不足时先记录灯光来源，仍可完成日常减光行动。'],
        daily: ['从家门口一盏朝天灯开始，加罩、调角度、定时关闭。', '拉好窗帘，避免室内光整夜溢出。', '被直射光扰民时留视频证据，通过 12345 反映。']
      }
    };
    var chosen = tag === 'observe' && track === 'real' && !daylight ? lists[band].observe : lists[band].daily;
    return { band: band, history: track === 'history', items: chosen.slice() };
  }

  function confirmDialog(title, text, confirmLabel) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.className = 'sx-modal';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-labelledby', 'sxModalTitle');
      var box = document.createElement('div');
      var h = document.createElement('h2'); h.id = 'sxModalTitle'; h.textContent = title;
      var p = document.createElement('p'); p.textContent = text;
      var row = document.createElement('div'); row.className = 'sx-modal-actions';
      var cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '取消';
      var ok = document.createElement('button'); ok.type = 'button'; ok.textContent = confirmLabel || '确认';
      row.appendChild(cancel); row.appendChild(ok); box.appendChild(h); box.appendChild(p); box.appendChild(row); wrap.appendChild(box);
      document.body.appendChild(wrap);
      function done(value) { wrap.remove(); resolve(value); }
      cancel.addEventListener('click', function () { done(false); });
      ok.addEventListener('click', function () { done(true); });
      wrap.addEventListener('click', function (e) { if (e.target === wrap) done(false); });
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') done(false);
        if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === cancel ? ok : cancel).focus(); }
      });
      ok.focus();
    });
  }
  function dataDialog(options) { openDataDialog(options); }
  function openDataDialog(options) {
    var opts = options || {};
    var wrap = document.createElement('div');
    wrap.className = 'sx-modal sx-data-modal';
    wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-labelledby', 'sxDataTitle');
    wrap.innerHTML = '<div class="sx-data-box"><button class="sx-data-close" aria-label="关闭">×</button><h2 id="sxDataTitle">本机数据与隐私</h2>' +
      '<p>只保存城市、时段和浏览状态，不默认保存精确定位。隐私模式期间不写入本机，关闭后也不会自动回写当前会话。</p>' +
      '<label class="sx-private"><input type="checkbox"> 隐私模式（仅本次会话）</label>' +
      '<div class="sx-data-counts"></div><div class="sx-modal-actions sx-data-actions">' +
      '<button data-clear="prefs">清除偏好</button><button data-clear="recent">清除最近对照</button><button data-clear="all">清除全部普通本机数据</button></div></div>';
    document.body.appendChild(wrap);
    var checkbox = wrap.querySelector('.sx-private input');
    checkbox.checked = privateMode;
    function refresh() {
      var c = counts();
      wrap.querySelector('.sx-data-counts').textContent = '偏好 ' + (c.preferences ? '1 份' : '无') + ' · 共享上下文 ' + (c.context ? '1 份' : '无') +
        ' · 最近对照 ' + c.recent + ' 条 · 诗词记录 ' + c.poems + ' 首 · 手动观测记录 ' + (c.homeRecords + c.cityRecords) +
        ' 条 · API Key ' + (c.apiKey ? '已保存' : '未保存') + ' · 外设会话标识 ' + (c.peripheralSession ? '保留' : '无');
      wrap.querySelectorAll('[data-clear]').forEach(function (button) { button.disabled = privateMode; });
    }
    refresh();
    checkbox.addEventListener('change', function () { setPrivate(checkbox.checked); refresh(); });
    wrap.querySelectorAll('[data-clear]').forEach(function (button) {
      button.addEventListener('click', function () {
        var kind = button.dataset.clear;
        var jobs = {
          prefs: ['清除偏好', '清除城市、时段、展示偏好和诗词展开状态；手动观测记录不受影响。', clearPreferences],
          recent: ['清除最近对照', '只清除最近使用的对照记录，当前城市、时段和手动观测记录不受影响。', clearRecent],
          all: ['清除全部普通本机数据', '清除偏好、最近对照、诗词状态、共享上下文和已保存 API Key；手动观测记录、导出文件与外设会话标识不受影响。', clearAll]
        };
        var job = jobs[kind];
        confirmDialog(job[0], job[1], '确认清除').then(function (yes) {
          if (!yes) return;
          if (job[2]()) {
            if (opts.onReset) opts.onReset(kind === 'all' ? 'all' : kind === 'recent' ? 'recent' : 'prefs');
            notify('已清除所选本机数据。'); refresh();
          }
        });
      });
    });
    function close() { wrap.remove(); }
    wrap.querySelector('.sx-data-close').addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    wrap.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    wrap.querySelector('.sx-data-close').focus();
  }

  initChannel();
  window.SIDERA_EXPERIENCE = {
    defaults: defaults, get: get, all: all, patch: patch, save: save, subscribe: subscribe,
    setPrivate: setPrivate, isPrivate: isPrivate, canWrite: canWrite, counts: counts,
    clearPreferences: clearPreferences, clearRecent: clearRecent, clearAll: clearAll,
    recent: recentList, addRecent: addRecent,
    poemHistory: poemHistory, recordPoem: recordPoem, setPoemOpen: setPoemOpen,
    recordUndo: recordUndo, canUndo: canUndo, undo: undo, clearUndo: clearUndo,
    sendContext: sendContext, sendReset: sendReset, retry: retry, onContext: onContext,
    onSync: onSync, syncState: syncStateValue,
    notify: notify, confirmDialog: confirmDialog, dataDialog: dataDialog,
    AdaptiveThrottle: AdaptiveThrottle, actionsFor: actionsFor
  };
})();
