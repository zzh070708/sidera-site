/* ============================================================================
 * 星阑归序 · app.js
 * 应用层：开场 / 光害对照 / 意象归天 / 星问(防幻觉检索) / 数据可视化 / 太阳系
 * 安全约定：
 *   - 所有动态文本一律 textContent / createTextNode，全文件零 innerHTML、零 eval
 *   - 用户输入只作为检索数据，永不拼进 HTML / URL / 代码
 *   - 唯一外发请求：api.deepseek.com（域名硬编码白名单，可选功能）
 * ==========================================================================*/
(function () {
  'use strict';
  window.__SIDERA_VER__ = '20261125c';
  var $ = function (id) { return document.getElementById(id); };
  if (!window.GX) {
    var f = $('fatal'); f.style.display = 'block';
    f.textContent = window.__GX_INIT_ERR__ || '3D 引擎未能加载。请确认浏览器支持 WebGL，或硬刷新（Ctrl+Shift+R）重试。';
    return;
  }
  GX.fatal = function (msg) { var f = $('fatal'); f.style.display = 'block'; f.style.borderColor = ''; f.textContent = msg; };
  /* 可自动恢复的临时提示（如 GPU 上下文丢失）：金色边框、非致命，恢复后由 clearSoftMsg 收起 */
  GX.softMsg = function (msg) { var f = $('fatal'); f.style.display = 'block'; f.style.borderColor = 'rgba(216,178,92,.5)'; f.textContent = msg; };
  GX.clearSoftMsg = function () { var f = $('fatal'); f.style.display = 'none'; f.style.borderColor = ''; };

  var BORTLE_NAMES = ['极佳暗空', '典型暗空', '乡村天空', '乡村/郊区过渡', '郊区天空', '明亮郊区', '郊区/城市过渡', '城市天空', '市中心'];
  var STAR_ZH = {
    67: '牵牛（河鼓二）', 166: '织女一', 47770: '心宿二（大火）', 42572: '参宿四',
    93287: '天津四', 8: '天狼', 22861: '老人星', 35897: '北辰（勾陈一）',
    5452: '天枢', 2932: '天璇', 3176: '天玑', 2980: '天权', 3142: '玉衡', 3322: '开阳', 4282: '摇光'
  };
  /* 星表里的英文专名 → 中文传统星名（按名匹配，不依赖行号，缺口不会错位） */
  var ZH_BY_EN = {
    Sirius: '天狼', Canopus: '老人星', Arcturus: '大角', Vega: '织女一', Capella: '五车二',
    Rigel: '参宿七', Procyon: '南河三', Betelgeuse: '参宿四', Achernar: '水委一',
    Altair: '牵牛（河鼓二）', Aldebaran: '毕宿五', Antares: '心宿二（大火）', Spica: '角宿一',
    Pollux: '北河三', Fomalhaut: '北落师门', Deneb: '天津四', Regulus: '轩辕十四',
    Polaris: '北辰（勾陈一）', Castor: '北河二', Bellatrix: '参宿五', Alnilam: '参宿二',
    Alnitak: '参宿一', Mintaka: '参宿三', Dubhe: '天枢', Merak: '天璇', Phecda: '天玑',
    Megrez: '天权', Alioth: '玉衡', Mizar: '开阳', Alkaid: '摇光'
  };
  /* IAU 88 星座缩写 → 中文标准名词。找星时把目标锚到人认得的星群，
     而不是只给一个孤零零的亮点让人瞎找。缩写缺失时返回空串，标签自动省略。 */
  var CON_ZH = {
    And:'仙女座', Ant:'唧筒座', Aps:'天燕座', Aql:'天鹰座', Aqr:'宝瓶座', Ara:'天坛座',
    Ari:'白羊座', Aur:'御夫座', Boo:'牧夫座', CMa:'大犬座', CMi:'小犬座', CVn:'猎犬座',
    Cam:'鹿豹座', Cap:'摩羯座', Car:'船底座', Cas:'仙后座', Cen:'半人马座', Cep:'仙王座',
    Cet:'鲸鱼座', Cha:'蝘蜓座', Cnc:'巨蟹座', Col:'天鸽座', Com:'后发座', CrA:'南冕座',
    CrB:'北冕座', Crt:'巨爵座', Cru:'南十字座', Crv:'乌鸦座', Cyg:'天鹅座', Del:'海豚座',
    Dra:'天龙座', Equ:'小马座', Eri:'波江座', For:'天炉座', Gem:'双子座', Gru:'天鹤座',
    Her:'武仙座', Hor:'时钟座', Hya:'长蛇座', Hyi:'水蛇座', Ind:'印第安座', LMi:'小狮座',
    Lac:'蝎虎座', Leo:'狮子座', Lep:'天兔座', Lib:'天秤座', Lup:'豺狼座', Lyn:'天猫座',
    Lyr:'天琴座', Men:'山案座', Mic:'显微镜座', Mon:'麒麟座', Mus:'苍蝇座', Nor:'矩尺座',
    Oct:'南极座', Oph:'蛇夫座', Ori:'猎户座', Pav:'孔雀座', Peg:'飞马座', Per:'英仙座',
    Phe:'凤凰座', Pic:'绘架座', PsA:'南鱼座', Psc:'双鱼座', Pup:'船尾座', Pyx:'罗盘座',
    Ret:'网罟座', Scl:'玉夫座', Sco:'天蝎座', Sct:'盾牌座', Ser:'巨蛇座', Sex:'六分仪座',
    Sge:'天箭座', Sgr:'人马座', Tau:'金牛座', Tel:'望远镜座', TrA:'南三角座', Tri:'三角座',
    Tuc:'杜鹃座', UMa:'大熊座', UMi:'小熊座', Vel:'船帆座', Vir:'室女座', Vol:'飞鱼座', Vul:'狐狸座'
  };
  function conOf(i) { var c = GX.starInfo(i).con; return (c && CON_ZH[c]) ? CON_ZH[c] : ''; }
  /* 高度角 → 直观区间：让人知道该抬多高，而不只是抽象的度数 */
  function altBand(a) { return a < 12 ? '贴近地平' : a < 35 ? '低空' : a < 65 ? '半空' : '近头顶'; }
  /* 视星等 → 亮度口语（数字越小越亮）：给「这颗算亮还是暗」一个直觉 */
  function magWord(m) { return m < 0 ? '极亮' : m < 1.5 ? '很亮' : m < 3 ? '中等亮度' : '偏暗'; }
  var CULTURE_LOST = [
    { mag: 3.32, name: '北斗 · 天权（3.3 等）' },
    { mag: 2.41, name: '北斗 · 天玑（2.4 等）' },
    { mag: 1.97, name: '北极星（2.0 等）' },
    { mag: 1.25, name: '天津四 · 银河渡口（1.3 等）' },
    { mag: 0.76, name: '牵牛（0.8 等）' },
    { mag: 0.03, name: '织女（0.0 等）' }
  ];

  /* ---------- 面板 / 导航 ---------- */
  var SEC_TITLES = { light: '此刻头顶', poem: '意象归天', ask: '星问', data: '数据', solar: '太阳系', act: '今晚 · 意识到，然后行动', gear: '手机外设 · 同一内核的第二只手' };
  var curSec = 'light', panelOpen = false;
  /* 面板开合时主体移入安全区：补间而不是瞬移，收放才有连贯感 */
  var pan = { x: 0, y: 0, sx: 0, sy: 0, tx: 0, ty: 0, t0: 0, dur: 460, raf: 0 };
  function panStep() {
    var u = Math.min(1, (performance.now() - pan.t0) / pan.dur);
    var e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    pan.x = pan.sx + (pan.tx - pan.sx) * e;
    pan.y = pan.sy + (pan.ty - pan.sy) * e;
    GX.viewPan(pan.x, pan.y);
    if (u < 1) pan.raf = requestAnimationFrame(panStep);
    else { pan.raf = 0; pan.x = pan.tx; pan.y = pan.ty; }
  }
  function applyPan(instant) {
    var tx = 0, ty = 0;
    if (panelOpen && GX.mode() !== 'ground') {
      if (window.innerWidth <= 860) ty = window.innerHeight * 0.16;
      else tx = 210;
    }
    if (instant || (Math.abs(pan.x - tx) < 1 && Math.abs(pan.y - ty) < 1)) {
      pan.x = pan.tx = tx; pan.y = pan.ty = ty;
      if (pan.raf) { cancelAnimationFrame(pan.raf); pan.raf = 0; }
      GX.viewPan(pan.x, pan.y);
      return;
    }
    pan.sx = pan.x; pan.sy = pan.y; pan.tx = tx; pan.ty = ty;
    pan.t0 = performance.now();
    if (!pan.raf) pan.raf = requestAnimationFrame(panStep);
  }
  /* 场景切换幕：压暗一层再换机位，不做「啪」一下的硬切 */
  var veilBusy = false;
  function sceneSwap(fn) {
    var v = $('veil');
    if (!v || veilBusy) { fn(); return; }
    veilBusy = true;
    v.style.transition = 'opacity .34s ease';
    v.style.opacity = '1';
    setTimeout(function () {
      try { fn(); } catch (e) { /* 切换失败也不能把幕留在画面上 */ }
      setTimeout(function () {
        v.style.transition = 'opacity .95s ease';
        v.style.opacity = '0';
        setTimeout(function () { veilBusy = false; }, 1000);
      }, 140);
    }, 350);
  }
  window.addEventListener('resize', applyPan);
  function fmtHour(h) {
    var hh = Math.floor(h) % 24, mm = Math.round((h - Math.floor(h)) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function toSpace() {
    if (HUNT.show) huntStop();
    /* 手势不随场景切换而关闭：张掌滑动转向、捏合变焦在两幕是同一套手感，接着用 */
    if (splitOn) setSplit(false);
    /* 「落地第一句」只讲头顶的光害，进了上帝视角就没意义，还会压住导航栏底部几枚按钮 */
    hideFirstHint();
    if (GX.mode() !== 'space') {
      GX.setMode('space');
      $('modeBtn').textContent = '站回地面';
      GX.setBortle(GX.getBortle());
      updateLightUI();
      syncWarpFab();
    }
  }
  function toGround() {
    if (GX.mode() === 'ground') return;
    GX.setMode('ground');
    $('modeBtn').textContent = '回到宇宙';
    GX.setBortle(GX.getBortle());
    updateLightUI();
    syncWarpFab();
  }
  function openSec(sec) {
    if (HUNT.show) huntStop();
    /* 离开「意象归天」时把诗单复位：否则下次进来还停在上一首诗，列表永远是隐藏的 */
    if (sec !== 'poem' && curPoem) poemBack();
    curSec = sec;
    hideFirstHint();
    var secs = document.querySelectorAll('.sec');
    for (var i = 0; i < secs.length; i++) secs[i].classList.toggle('on', secs[i].id === 'sec-' + sec);
    var btns = document.querySelectorAll('#nav button');
    for (var j = 0; j < btns.length; j++) btns[j].classList.toggle('on', btns[j].getAttribute('data-sec') === sec);
    $('panelTitle').textContent = SEC_TITLES[sec];
    $('panel').classList.add('open'); panelOpen = true;
    applyPan();
    if (sec === 'data') drawViz();
    if (sec === 'light') { updateLightUI(); renderStarList(); renderVerify(); }
    if (sec === 'act') updateActUI();
    if (sec !== 'poem') GX.clearHighlight();
    syncWarpFab();
  }
  function closePanel() {
    $('panel').classList.remove('open'); panelOpen = false;
    applyPan(); GX.clearHighlight(); syncWarpFab();
  }
  $('panelClose').addEventListener('click', closePanel);
  var navBtns = document.querySelectorAll('#nav button');
  for (var ni = 0; ni < navBtns.length; ni++) {
    navBtns[ni].addEventListener('click', function () {
      var sec = this.getAttribute('data-sec');
      if (sec === 'solar') { toSpace(); GX.solarView(2400); }
      if (sec === curSec && panelOpen) { closePanel(); return; }
      openSec(sec);
    });
  }
  $('modeBtn').addEventListener('click', function () {
    var toGround = GX.mode() !== 'ground';
    var btn = this;
    huntStop();
    closePanel();
    if (splitOn) setSplit(false);
    if (!toGround) hideFirstHint();   /* 上帝视角不显示「落地第一句」，否则会压住导航栏底部 */
    sceneSwap(function () {
      GX.setMode(toGround ? 'ground' : 'space');
      btn.textContent = toGround ? '回到宇宙' : '站回地面';
      GX.setBortle(GX.getBortle());
      updateLightUI();
      syncWarpFab();
      if (!toGround) GX.solarView(2600);
    });
  });

  /* ---------- 地点 / 时刻（离线城市表 + 任意经纬度，零权限） ---------- */
  var G = window.GROUND || null;
  (function () {
    var sel = $('citySel');
    if (!G) { sel.style.display = 'none'; $('hourRange').style.display = 'none'; return; }
    G.cities.forEach(function (c) {
      var o = document.createElement('option');
      o.textContent = c.name; o.value = c.name;
      sel.appendChild(o);
    });
    var gh = G.state().hours;
    $('hourRange').value = String(gh);
    $('hourVal').textContent = '今夜 ' + fmtHour(gh);

    /* 预设城市之外的人（老家院子、学校楼顶）自己填经纬度。
       坐标校验与半球识别在 core/m1.js 的纯函数 parsePlace 里，有单测；这里只管换站与显示。 */
    var places = {};                                  // label → {lat, lon}
    var box = $('placeBox'), inp = $('placeIn'), msg = $('placeMsg'), tag = $('placeTag');
    function siteChanged() {
      updateLightUI();
      updateActUI();
      queueStarList();                                // 其中含 200ms debounce 的 renderVerify()
      var st = G.state();
      if (tag) tag.textContent = places[st.city] ? '当前：自定义点 ' + st.city : '';
    }
    function cityByName(name) {
      for (var i = 0; i < G.cities.length; i++) if (G.cities[i].name === name) return G.cities[i];
      return null;
    }
    sel.addEventListener('change', function () {
      var name = sel.value;
      huntStop();
      if (places[name]) G.setPlace(name, places[name].lat, places[name].lon);
      else { var c = cityByName(name); if (c) G.setSite(c); }
      siteChanged();
    });
    $('hourRange').addEventListener('input', function () {
      var h = +this.value;
      huntStop();
      G.setSite(null, h);
      $('hourVal').textContent = '今夜 ' + fmtHour(h);
      siteChanged();
    });

    if (!box || !inp || !$('btnPlace') || !$('btnPlaceGo')) return;
    function say(text, good) {
      msg.textContent = text;
      msg.className = 'p-note ' + (good ? 'good' : 'bad');
    }
    $('btnPlace').addEventListener('click', function () {
      var open = box.style.display !== 'none';
      box.style.display = open ? 'none' : 'flex';
      if (!open) inp.focus();
    });
    function applyPlace() {
      var p = window.M1 ? window.M1.parsePlace(inp.value) : null;
      if (!p || !p.ok) { say(p ? p.msg : '内核未加载，暂时不能改坐标', false); return; }
      if (!G.setPlace(p.label, p.lat, p.lon)) { say('内核拒收这组坐标，请核对后重填', false); return; }
      // 先问「认不认得」再登记：登记之后 cityExists 恒真，选项就永远加不进去了
      var known = cityExists(p.label);
      places[p.label] = { lat: p.lat, lon: p.lon };
      if (!known) {
        var o = document.createElement('option');
        o.textContent = p.label; o.value = p.label;
        sel.appendChild(o);
      }
      sel.value = p.label;
      huntStop();
      say('已换到 ' + p.label + '：方位、仰角与窗内预测颗数全部按这一点重算。', true);
      siteChanged();
    }
    function cityExists(name) { return !!cityByName(name) || !!places[name]; }
    $('btnPlaceGo').addEventListener('click', applyPlace);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyPlace(); } });
  })();

  /* ---------- 光害对照 ---------- */
  var bortleTween = null;
  function updateLightUI() {
    var b = GX.getBortle();
    var st = GX.visStats();
    var band = st.bands[b - 1];
    /* 面板上的数字必须和眼前这片天对得上：按当前城市/时刻算地平线以上、且未被光害吞掉的真实恒星 */
    var gs = (G && G.visibleStats) ? G.visibleStats(band.limit) : null;
    var vis = gs ? gs.visible : band.visible;
    var above = gs ? gs.above : st.total;
    /* 「被吞没」的分母只能是「肉眼本来能看见的」，不是星表里全部 10 万颗：
       把 9 等星算进「被光害吞掉」是把话说大，评委一问就露怯。 */
    var darkVis = (G && G.visibleStats) ? G.visibleStats(7.6).visible : band.visible;
    var lostN = Math.max(0, darkVis - vis);
    $('bortle').value = String(b);
    $('bortleVal').textContent = 'Bortle ' + b + ' · ' + BORTLE_NAMES[b - 1];
    $('stVisible').textContent = vis.toLocaleString();
    $('stLost').textContent = lostN.toLocaleString();
    $('visLine').textContent = '极限星等 ' + band.limit.toFixed(1) + ' 等 · 地平线以上 ' + above.toLocaleString() +
      ' 颗真实恒星中，肉眼本来能看见 ' + darkVis.toLocaleString() + ' 颗，此刻只剩 ' + vis.toLocaleString() + ' 颗';
    $('skyglow').style.opacity = GX.mode() === 'ground' ? '0' : String(Math.max(0, (b - 3) / 6) * 0.95);
    var lost = [];
    for (var i = 0; i < CULTURE_LOST.length; i++) {
      if (CULTURE_LOST[i].mag > band.limit) lost.push(CULTURE_LOST[i].name);
    }
    var el = $('lostCulture');
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!lost.length) {
      /* 锚星本身都是全天最亮的那些，市中心也还看得见——真正被吞掉的是暗星与银河。
         绝不能因为「锚星没丢」就说「天空没事」，那是把话说漂亮而不是说实话。 */
      el.textContent = '诗句里的锚星都是全天最亮的星，灯再亮也吞不掉它们；但此刻头顶另有 ' +
        lostN.toLocaleString() + ' 颗原本肉眼可见的星已经消失' +
        (band.limit <= 5.6 ? '，银河也被城市灯光洗白——诗句里的「河汉」再也看不见了。' : '，银河尚在。');
    } else {
      el.textContent = '此刻已被吞没：' + lost.join('；') + '。它们不是熄灭了，是被城市的灯光盖住了。';
    }
    var fh = $('firstHint');
    if (fh && fh.classList.contains('show')) setHintText(b, vis);
    if (splitOn) splitLabels();
    gestRead();
  }
  GX.onBortle = function () { updateLightUI(); updateActUI(); updateTopbar(); queueStarList(); if (HUNT.show && HUNT.on) huntReBortle(); };
  $('bortle').addEventListener('input', function () { bortleTween = null; GX.setBortle(+this.value); });

  /* ---------- 手势读数 ----------
     手势的内核不是「镜头在动」，而是「你亲手把光污染拧动了」。
     所以 HUD 里必须同时出现三样东西：此刻的 Bortle、因此还剩几颗星、
     以及从你开始比手势到现在，这片天被你拨回来（或推走）了多少颗。
     全部来自真实星表 + 大气消光，和面板、分屏用的是同一套数。 */
  var gestBase = null;
  function setLines(el, lines) {
    while (el.childNodes.length < lines.length) el.appendChild(document.createElement('span'));
    while (el.childNodes.length > lines.length) el.removeChild(el.lastChild);
    for (var i = 0; i < lines.length; i++) el.childNodes[i].textContent = lines[i];
  }
  function gestRead() {
    var el = $('gestRead');
    if (!el) return;
    if (!(window.GESTURE && GESTURE.active())) { if (el.textContent) setLines(el, []); return; }
    var b = GX.getBortle();
    var head, body, note = '';
    if (GX.mode() === 'ground') {
      var st = GX.visStats();
      if (!gestBase) gestBase = { b: b };
      var baseB = gestBase.b;
      var visAt = function (bb) {
        if (!G || !G.visibleStats) return st.bands[bb - 1].visible;
        return G.visibleStats(st.bands[bb - 1].limit).visible;
      };
      var vis = visAt(b), baseVis = visAt(baseB);
      head = 'Bortle ' + b + ' · ' + BORTLE_NAMES[b - 1];
      body = '头顶可见 ' + vis.toLocaleString() + ' 颗 · 比暗空少 ' +
        Math.max(0, visAt(1) - vis).toLocaleString() + ' 颗';
      if (baseB !== b) {
        var d = vis - baseVis;
        note = '你已把城市从 Bortle ' + baseB + ' 拨到 ' + b + ' · 头顶' +
          (d >= 0 ? '多看见 ' : '少看见 ') + Math.abs(d).toLocaleString() + ' 颗';
      }
    } else {
      /* 宇宙幕是上帝视角：银河结构常显，手势做的是环视/连续变焦，不再拨光污染。
         读数描述当前尺度与真实手势语义，不宣称「暗星随手势隐没」（那是已移除的旧拨盘）。 */
      var d = Math.pow(10, GX.state().logD);
      head = (d < 0.01 ? '太阳系尺度' : d < 100 ? '星际尺度' : '银河系尺度') + ' · 上帝视角';
      body = '张掌滑动环视 · 捏合张指推近 / 收指拉远';
    }
    setLines(el, note ? [head, body, note] : [head, body]);
  }
  function tweenBortle(to, dur) {
    var from = GX.getBortle(), t0 = performance.now();
    bortleTween = { from: from, to: to, t0: t0, dur: dur };
  }
  $('btnCounter').addEventListener('click', function () { huntStop(); tweenBortle(4, 2600); });
  $('btnCity').addEventListener('click', function () { huntStop(); tweenBortle(8, 2600); });

  /* ---------- 暗夜分界线 ----------
     同一台相机、同一帧里画两遍，只换天空亮度。这是「数据可视化」而不是「示意图」：
     左右两半的星数和眼前像素是同一套真实星表算出来的。 */
  var splitOn = false, splitBar = $('splitBar'), splitTag = $('splitTag');
  function splitLabels() {
    if (!G) return;
    var info = G.splitInfo();
    splitBar.style.left = (info.x * 100).toFixed(2) + '%';
    splitTag.querySelector('.l').textContent = '暗夜 · Bortle ' + info.dark + ' · ' + info.darkVisible.toLocaleString() + ' 颗';
    splitTag.querySelector('.r').textContent = '此刻 · Bortle ' + info.bortle + ' · ' + info.nowVisible.toLocaleString() + ' 颗';
    var gone = Math.max(0, Math.round(100 * (1 - info.nowVisible / Math.max(1, info.darkVisible))));
    $('splitStat').textContent = '左手边 ' + info.darkVisible.toLocaleString() + ' 颗，右手边 ' +
      info.nowVisible.toLocaleString() + ' 颗 —— 同一天空，' + gone + '% 的星被灯光盖掉了。';
  }
  function setSplit(on) {
    if (!G) return;
    if (on) huntStop();
    splitOn = !!on;
    if (splitOn) { toGround(); hideFirstHint(); }
    G.setSplit(splitOn, 0.5);
    splitBar.classList.toggle('on', splitOn);
    splitTag.classList.toggle('on', splitOn);
    $('btnSplit').textContent = splitOn ? '收起分界线' : '拉开分界线';
    $('splitStat').style.display = splitOn ? 'block' : 'none';
    if (splitOn) { closePanel(); splitLabels(); }
  }

  /* 落地后的第一句人话：空荡荡的夜空需要解释，否则观众会以为页面坏了 */
  var hintTimer = null;
  /* 落地提示卡不能停在落地那一刻：手势把城市拨亮/拨暗之后，
     卡上若还写着旧读数，同一块屏幕上就同时出现两套真相。 */
  function setHintText(b, vis) {
    $('fhTitle').textContent = 'Bortle ' + b + ' · ' + BORTLE_NAMES[b - 1];
    $('fhText').textContent = '此刻头顶只剩 ' + vis.toLocaleString() + ' 颗肉眼可见的星。' +
      '不一定是今晚运气差——是城市的灯把其余的都盖住了。';
  }
  function showFirstHint() {
    /* 只在地面幕讲「头顶的光害」；片头收尾的延时回调可能在观众已进宇宙幕后才到点，
       若不拦下，这张卡会盖住左缘导航底部几枚按钮。 */
    if (!G || splitOn || panelOpen || GX.mode() !== 'ground') return;
    var b = GX.getBortle();
    var lim = GX.visStats().bands[b - 1].limit;
    setHintText(b, G.visibleStats(lim).visible);
    $('firstHint').classList.add('show');
    hintTimer = setTimeout(hideFirstHint, 26000);
  }
  function hideFirstHint() {
    $('firstHint').classList.remove('show');
    if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  }
  $('fhBtn').addEventListener('click', function () { hideFirstHint(); setSplit(true); });
  $('btnSplit').addEventListener('click', function () { setSplit(!splitOn); });
  (function () {
    var grip = splitBar.querySelector('.grip'), dragging = false;
    grip.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    grip.addEventListener('pointermove', function (e) {
      if (!dragging || !G) return;
      G.setSplit(true, e.clientX / window.innerWidth);
      splitBar.style.left = (G.splitInfo().x * 100).toFixed(2) + '%';
      e.preventDefault();
    });
    var stop = function (e) {
      dragging = false;
      try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    grip.addEventListener('pointerup', stop);
    grip.addEventListener('pointercancel', stop);
  })();

  /* ---------- 今晚：意识到 → 行动 ----------
     主线是「你今晚的天空」：先用真实星数把个人损失摆出来，再讲三层伤害（标证据强度），
     最后把行动按真实量级分成 个人→集体→政策 三档——个人是参与，不是解决。 */
  function updateActUI() {
    var lead = $('actNow');
    if (!G) {
      if (lead) lead.textContent = '选择一座城市、一个时刻，本站会按真实星表算出：你头顶本来该有多少颗星，此刻又被灯光盖掉了多少。';
      $('actIf').textContent = '';
      return;
    }
    var gs = G.state();
    var band = GX.visStats().bands[GX.getBortle() - 1];
    var now = G.visibleStats(band.limit).visible;
    var dark = G.visibleStats(7.6).visible;                 // Bortle 1 极限星等 7.6：肉眼本可见
    var lost = Math.max(0, dark - now);
    var mwGone = band.limit <= 5.6;                          // 与地面渲染银河显隐同一门限
    if (lead) {
      lead.textContent = '';
      lead.appendChild(document.createTextNode(gs.city + '今夜 ' + fmtHour(gs.hours) + '：头顶本来该有 '));
      var b1 = document.createElement('b'); b1.textContent = dark.toLocaleString(); lead.appendChild(b1);
      lead.appendChild(document.createTextNode(' 颗肉眼可见的星，此刻只剩 '));
      var b2 = document.createElement('b'); b2.textContent = now.toLocaleString(); lead.appendChild(b2);
      lead.appendChild(document.createTextNode(' 颗——'));
      var b3 = document.createElement('b'); b3.textContent = lost.toLocaleString(); lead.appendChild(b3);
      lead.appendChild(document.createTextNode(' 颗被城市的灯光盖掉了' + (mwGone ? '，连银河也被洗白。' : '。')));
    }
    var rural = G.visibleStats(6.1).visible;               // Bortle 4 的极限星等 6.1
    $('actIf').textContent = '如果' + gs.city + '今夜是 Bortle 4（乡村天空），同一时刻头顶可见 ' +
      rural.toLocaleString() + ' 颗星，而此刻只有 ' + now.toLocaleString() + ' 颗——多出来的 ' +
      (rural - now).toLocaleString() + ' 颗，就是灯光替你关掉的那部分宇宙。' +
      '（这是按真实星表与当前时刻做的推演，不是对现实的承诺：一盏灯改不了整座城的天空。）';
  }
  /* 行动按真实量级分档：个人能做的是「参与」，集体与政策才是真正减光污染的杠杆。
     不夸大个人作用，也不把观众晾在无力感里——给出从近到远、可逐级放大的路径。 */
  var ACTS = [
    { tier: '个人 · 参与', t: '管好你家门口那盏灯', d: '给朝天照的灯加遮光罩，换成向下照、色温不高于 3000K 的暖光；睡前拉好窗帘，别让室内光往外溢。单盏灯改变不了一座城，但它就在你家门口，邻居看得见、学得会。' },
    { tier: '个人 · 证据', t: '把你的夜空变成一条数据', d: '参与 Globe at Night 等公民科学项目：肉眼比对已知星座，提交观测。呼吁需要证据，而证据来自一个个普通人的抬头——你的一条记录，就是政策制定者看得见的民意。' },
    { tier: '集体 · 放大', t: '让一个社区先暗下来', d: '推动小区物业、商铺关掉朝天的射灯和彻夜亮着的招牌，把「暗夜友好」变成业主公约。一个社区的改变，比一户人家大得多，也最能带动周边。' },
    { tier: '政策 · 根本', t: '支持照明法规与暗夜保护', d: '真正能减光污染的是法律与照明规划。这根杠杆刚刚变硬：2026 年 8 月 15 日施行的《生态环境法典》专设「光污染防治」一章，首次在国家法律层面系统规制光污染；2022 年新修改的《上海市环境保护条例》则最早把光污染写入地方性法规并设罚则。关注你所在城市的执法与照明规划修订，支持暗夜保护地——个人行动汇入法律，天空才真的回得来。' }
  ];
  (function () {
    var box = $('actList');
    ACTS.forEach(function (a) {
      var div = document.createElement('div'); div.className = 'act-item';
      var t = document.createElement('div'); t.className = 't'; t.textContent = a.t;
      var tier = document.createElement('span'); tier.className = 'tier'; tier.textContent = a.tier;
      t.appendChild(tier);
      var d = document.createElement('div'); d.className = 'd'; d.textContent = a.d;
      div.appendChild(t); div.appendChild(d);
      box.appendChild(div);
    });
  })();

  /* 双联明信片：直接用分屏那一帧，左右两半同源同刻，不是拼图。
     buildCard 只管排版出画（探针可单独调用取证），makeCard 只管下载。 */
  function buildCard() {
    var W = 1200, H = 750;
    if (GX.mode() !== 'ground' || !G.splitInfo().on) { setSplit(true); }
    var r = GX.renderer, el = r.domElement;
    var ow = el.clientWidth || window.innerWidth, oh = el.clientHeight || window.innerHeight;
    var dpr = r.getPixelRatio();
    /* 按明信片的比例重新渲一遍，而不是从竖屏画面上裁一刀：
       裁图会把天际线和银河里的银河带一起裁掉，剩下的只是一片星点，说服力全没了。 */
    el.style.width = W + 'px'; el.style.height = H + 'px';
    r.setPixelRatio(1); r.setSize(W, H, false);
    GROUND.resize(W, H);
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    try {
      GROUND.update(performance.now(), 16);
      GROUND.render(r);
      g.drawImage(el, 0, 0, W, H);
    } finally {
      el.style.width = ''; el.style.height = '';
      r.setPixelRatio(dpr); r.setSize(ow, oh, false);
      GROUND.resize(ow, oh);
    }
    var info = G.splitInfo();
    var seam = info.x * W;
    var grd = g.createLinearGradient(0, H - 210, 0, H);
    grd.addColorStop(0, 'rgba(3,5,16,0)'); grd.addColorStop(1, 'rgba(3,5,16,.92)');
    g.fillStyle = grd; g.fillRect(0, H - 210, W, 210);
    g.strokeStyle = 'rgba(216,178,92,.7)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(seam, 0); g.lineTo(seam, H); g.stroke();
    g.textAlign = 'left';
    g.fillStyle = '#a9c8ff'; g.font = '15px "Songti SC","SimSun",serif';
    g.fillText('暗夜 · BORTLE ' + info.dark, 40, 48);
    g.font = '28px "Songti SC","SimSun",serif';
    g.fillText(info.darkVisible.toLocaleString() + ' 颗', 40, 86);
    g.textAlign = 'right';
    g.fillStyle = '#d8b25c';
    g.font = '15px "Songti SC","SimSun",serif';
    g.fillText('此刻 · BORTLE ' + info.bortle, W - 40, 48);
    g.font = '28px "Songti SC","SimSun",serif';
    g.fillText(info.nowVisible.toLocaleString() + ' 颗', W - 40, 86);
    g.textAlign = 'left';
    g.fillStyle = '#e8e4d8'; g.font = '24px "Songti SC","SimSun",serif';
    g.fillText('同一座城市，同一分钟。', 40, H - 84);
    g.fillStyle = '#8a8f9e'; g.font = '15px "Songti SC","SimSun",serif';
    var gs = G.state();
    g.fillText(gs.city + ' · 今夜 ' + fmtHour(gs.hours) + ' · 差的不是相机，是灯。', 40, H - 54);
    /* 可证伪一句印在卡上：收到图的人能自己出门核对——明信片从说服变成挑战 */
    var vl = cardVerifyLine();
    if (vl) {
      g.fillStyle = 'rgba(216,178,92,.9)'; g.font = '14px "Songti SC","SimSun",serif';
      g.fillText(vl, 40, H - 28);
    }
    g.fillStyle = 'rgba(216,178,92,.85)'; g.font = '13px "Songti SC","SimSun",serif';
    g.textAlign = 'right';
    g.fillText('星阑归序 · HYG v4.0 真实星表实时渲染', W - 40, H - 30);
    return cv;
  }
  function makeCard() {
    try {
      var cv = buildCard();
      var a = document.createElement('a');
      a.download = '星阑归序_暗夜分界线_' + G.state().city + '.png';
      a.href = cv.toDataURL('image/png');
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) { GX.fatal('明信片生成失败：' + (e && e.message ? e.message : e)); }
  }
  $('btnCard2').addEventListener('click', function () {
    if (!G) return;
    closePanel();
    setSplit(true);
    var t0 = performance.now();
    (function warm() {
      if (performance.now() - t0 < 300) { setTimeout(warm, 60); return; }
      makeCard();
    })();
  });

  /* ---------- 意象归天 ---------- */
  var poems = (window.GX_CORPUS || {}).poems || [];
  var curPoem = null;
  var listEl = $('poemList');
  poems.forEach(function (p) {
    var div = document.createElement('div');
    div.className = 'poem-item';
    var t = document.createElement('div'); t.className = 't'; t.textContent = p.title;
    var s = document.createElement('div'); s.className = 's'; s.textContent = p.source;
    div.appendChild(t); div.appendChild(s);
    div.addEventListener('click', function () { activatePoem(p); });
    listEl.appendChild(div);
  });
  function activatePoem(p) {
    curPoem = p;
    toSpace();   // 诗锚在赤道坐标里，飞不过去就只能在地面视角里干等
    var items = listEl.querySelectorAll('.poem-item');
    for (var i = 0; i < items.length; i++) items[i].style.display = 'none';
    $('poemView').style.display = 'block';
    $('poemTitle').textContent = p.title;
    $('poemSource').textContent = p.source;
    var lines = $('poemLines');
    while (lines.firstChild) lines.removeChild(lines.firstChild);
    p.lines.forEach(function (ln, i) {
      if (i) lines.appendChild(document.createElement('br'));
      lines.appendChild(document.createTextNode(ln));
    });
    $('poemNote').textContent = p.note;
    /* 飞向诗句锚定的真实天区：注视点取锚星质心 */
    var cx = 0, cy = 0, cz = 0;
    p.stars.forEach(function (si) { var q = GX.starPos(si); cx += q[0]; cy += q[1]; cz += q[2]; });
    cx /= p.stars.length; cy /= p.stars.length; cz /= p.stars.length;
    var r = Math.sqrt(cx * cx + cy * cy + cz * cz);
    /* 取景：相机必须垂直于锚星主连线——沿连线看会把一颗甩到镜头背后（实测标签全灭）。
       主轴取首尾两颗锚星；取景距离按较窄的那个视场角换算，竖屏/横屏都能同框。 */
    var A = GX.starPos(p.stars[0]), B = GX.starPos(p.stars[p.stars.length - 1]);
    var ax = B[0] - A[0], ay = B[1] - A[1], az2 = B[2] - A[2];
    var nx = -az2, ny = 0, nz = ax;                         // cross(axis, +Y)
    if (nx * nx + nz * nz < 1e-6) { nx = 0; ny = az2; nz = -ay; }   // 主轴近竖直 → cross(axis, +X)
    var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    var sep = Math.sqrt(ax * ax + ay * ay + az2 * az2);
    var cam = GX.camera, vfov = cam.fov * Math.PI / 180;
    var hfov = 2 * Math.atan(Math.tan(vfov / 2) * (cam.aspect || 1));
    var halfView = Math.min(vfov, hfov) * 0.32;
    var dist = sep > 1e-6 ? (sep / 2) / Math.tan(halfView) : r * 0.62;
    GX.flyTo({
      target: [cx, cy, cz],
      logD: Math.max(-1.5, Math.min(2.3, Math.log10(Math.max(dist, 1)))),
      az: Math.atan2(nz, nx),
      el: Math.max(-1.2, Math.min(1.2, Math.asin(Math.max(-1, Math.min(1, ny))) + 0.06)),
      dur: 3000
    });
    GX.highlight({ stars: p.stars, pairs: p.pairs, names: p.names });
  }
  function poemBack() {
    curPoem = null;
    $('poemView').style.display = 'none';
    var items = listEl.querySelectorAll('.poem-item');
    for (var i = 0; i < items.length; i++) { items[i].style.display = 'block'; items[i].classList.remove('on'); }
    GX.clearHighlight();
  }
  $('btnPoemBack').addEventListener('click', poemBack);

  /* 星图明信片：截取当前真实星场 + 诗句排版，本地生成下载（无上传） */
  $('btnPostcard').addEventListener('click', function () {
    if (!curPoem) return;
    try {
      var W = 1080, H = 675;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      var g = cv.getContext('2d');
      var src = GX.canvas, sw = src.width, sh = src.height;
      var sc = Math.max(W / sw, H / sh);
      g.drawImage(src, (W - sw * sc) / 2, (H - sh * sc) / 2, sw * sc, sh * sc);
      var grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, 'rgba(3,5,16,0.10)'); grd.addColorStop(0.55, 'rgba(3,5,16,0.30)'); grd.addColorStop(1, 'rgba(3,5,16,0.88)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(216,178,92,0.55)'; g.lineWidth = 1.5;
      g.strokeRect(26, 26, W - 52, H - 52);
      g.fillStyle = '#d8b25c'; g.font = '30px "Songti SC","SimSun",serif';
      g.textAlign = 'left';
      g.fillText(curPoem.title, 56, H - 232);
      g.fillStyle = '#8a8f9e'; g.font = '15px "Songti SC","SimSun",serif';
      g.fillText(curPoem.source, 56, H - 202);
      g.fillStyle = '#e8e4d8'; g.font = '21px "Songti SC","SimSun",serif';
      var y = H - 162;
      curPoem.lines.slice(0, 4).forEach(function (ln) { g.fillText(ln, 56, y); y += 34; });
      g.fillStyle = 'rgba(216,178,92,0.8)'; g.font = '13px "Songti SC","SimSun",serif';
      g.textAlign = 'right';
      g.fillText('星阑归序 · 星场为 HYG v4.0 真实星表实时渲染', W - 56, H - 46);
      var a = document.createElement('a');
      a.download = '星阑归序_星图明信片_' + curPoem.title + '.png';
      a.href = cv.toDataURL('image/png');
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch (e) { GX.fatal('明信片生成失败：' + (e && e.message ? e.message : e)); }
  });

  /* ---------- 星问：防幻觉检索 ---------- */
  var docs = [];
  poems.forEach(function (p) {
    docs.push({ id: p.id, text: p.title + ' ' + p.source + ' ' + p.lines.join(' ') + ' ' + p.note + ' ' + p.tags.join(' '), doc: p, kind: 'poem' });
  });
  ((window.GX_CORPUS || {}).knowledge || []).forEach(function (k) {
    docs.push({ id: k.id, text: k.title + ' ' + k.text + ' ' + k.tags.join(' '), doc: k, kind: 'knowledge' });
  });
  var rag = window.AV_RETRIEVE ? AV_RETRIEVE.create(docs) : null;
  var CONF_LABEL = { A: 'A 级 · 语料直接命中', B: 'B 级 · 检索强相关', C: 'C 级 · 弱相关，谨慎参考', D: 'D 级 · 未检索到，不作回答' };
  function normQ(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s·、,，.。？?！!_-]/g, ''); }
  function fastPath(q) {
    var nq = normQ(q); if (!nq) return [];
    var hits = [];
    docs.forEach(function (d) {
      var p = d.doc;
      var keys = [p.title].concat(p.tags || []);
      for (var i = 0; i < keys.length; i++) {
        if (normQ(keys[i]) && nq.indexOf(normQ(keys[i])) >= 0) { hits.push({ id: d.id, doc: d }); break; }
      }
    });
    return hits.slice(0, 3);
  }
  function answer(q) {
    var out = $('askOut'), src = $('askSrc'), badge = $('confBadge');
    while (out.firstChild) out.removeChild(out.firstChild);
    while (src.firstChild) src.removeChild(src.firstChild);
    if (!rag || !rag.N) {
      badge.style.display = 'inline-block'; badge.className = 'conf-D'; badge.textContent = CONF_LABEL.D;
      out.textContent = '检索引擎未就绪，暂时无法回答。'; return;
    }
    var res = AV_RETRIEVE.search(rag, q, { topK: 3, fastPath: fastPath });
    var lvl, body = '', sources = [];
    if (!res.items.length) {
      lvl = 'D';
      body = '本地语料中没有检索到与「' + q + '」相关的内容。\n\n按本站的诚实约定：查不到，就不编造。你可以换一种问法，或开启「延伸讲解」让大模型在明确标注下作答。';
    } else {
      var top = res.items[0];
      var strong = res.mode === 'fast' || (top.score != null && top.score > 2.0);
      lvl = res.mode === 'fast' ? 'A' : (strong ? 'B' : 'C');
      res.items.slice(0, 2).forEach(function (it) {
        var d = it.doc;
        if (d.kind === 'poem') {
          var p = d.doc;
          body += '【' + p.title + '】' + p.source + '\n' + p.lines.join('\n') + '\n\n' + p.note + '\n\n';
          sources.push(p.title + '（' + p.source + '）');
        } else {
          var k = d.doc;
          body += '【' + k.title + '】\n' + k.text + '\n\n';
          sources.push(k.title);
        }
      });
      if (lvl === 'C') body += '（提示：以上为弱相关结果，可能不完全对应你的问题。）\n';
    }
    badge.style.display = 'inline-block';
    badge.className = 'conf-' + lvl;
    badge.textContent = CONF_LABEL[lvl];
    out.textContent = body;
    if (sources.length) src.textContent = '语料来源：' + sources.join('；') + '。检索模式：' + res.mode + '。';
    /* 可选延伸讲解：仅在用户主动填 Key 时触发，域名硬编码 */
    var key = getKey();
    if (key && lvl !== 'D') extend(q, body, key);
    else if (key && lvl === 'D') extend(q, '（本地语料未检索到相关内容）', key);
  }
  /* Key 生命周期：输入框是唯一事实来源。清空输入＝本机立即删除 Key（旧实现清空后
     仍回读 localStorage 里的旧 Key，用户以为已离线，实际还在外发——已修）。 */
  var keyOptOut = false;
  function getKey() {
    try {
      if (keyOptOut) return '';
      var inp = $('keyInput').value.trim();
      if (inp) { localStorage.setItem('gx_ds_key', inp); return inp; }
      return localStorage.getItem('gx_ds_key') || '';
    } catch (e) { return ''; }
  }
  $('keyInput').addEventListener('input', function () {
    if (!this.value.trim()) {
      keyOptOut = true;
      try { localStorage.removeItem('gx_ds_key'); } catch (e) {}
    } else { keyOptOut = false; }
  });
  var keyForget = $('keyForget');
  if (keyForget) keyForget.addEventListener('click', function () {
    $('keyInput').value = ''; keyOptOut = true;
    try { localStorage.removeItem('gx_ds_key'); } catch (e) {}
    keyForget.textContent = '已清除';
    setTimeout(function () { keyForget.textContent = '清除 Key'; }, 1800);
  });
  function extend(q, context, key) {
    if (!/^sk-[A-Za-z0-9]{8,}$/.test(key)) return;
    var out = $('askOut');
    var mark = document.createElement('div');
    mark.className = 'p-note'; mark.style.marginTop = '14px';
    mark.textContent = '正在请求延伸讲解（DeepSeek）…';
    out.appendChild(mark);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 25000);
    fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        model: 'deepseek-chat', stream: false, max_tokens: 600, temperature: 0.3,
        messages: [
          { role: 'system', content: '你是星空文化讲解员。只依据提供的材料回答；材料之外的问题请明确说"材料未覆盖"，不要编造数据与引文。回答不超过200字。' },
          { role: 'user', content: '材料：\n' + context + '\n\n问题：' + q }
        ]
      })
    }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        clearTimeout(timer);
        var txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '（无返回内容）';
        mark.textContent = '—— 延伸讲解（AI 生成，DeepSeek，请自行甄别）——\n' + txt;
        mark.style.whiteSpace = 'pre-wrap';
      })
      .catch(function (e) {
        clearTimeout(timer);
        mark.textContent = '延伸讲解不可用（' + (e && e.message ? e.message : '网络错误') + '）。本地检索结果不受影响。';
      });
  }
  $('askBtn').addEventListener('click', function () { var q = $('askInput').value.trim(); if (q) answer(q); });
  $('askInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var q = this.value.trim(); if (q) answer(q); } });
  try { var saved = localStorage.getItem('gx_ds_key'); if (saved) $('keyInput').value = saved; } catch (e) {}

  /* ---------- 数据可视化：Bortle × 可见星数（真实星表实时统计） ---------- */
  function drawViz() {
    var cv = $('vizCanvas'), g = cv.getContext('2d');
    var W = cv.width, H = cv.height;
    var st = GX.visStats();
    g.clearRect(0, 0, W, H);
    var padL = 74, padR = 26, padT = 40, padB = 56;
    /* 纵轴按最高柱取整（不能按星表总数：最高的 Bortle 1 只有 28k，用 109k 作上限会让整张图空掉八成） */
    var peakV = 0;
    st.bands.forEach(function (b) { if (b.visible > peakV) peakV = b.visible; });
    var step = Math.pow(10, Math.floor(Math.log10(Math.max(peakV, 1))));
    var maxV = Math.ceil(peakV / step) * step;
    g.strokeStyle = 'rgba(232,228,216,0.14)'; g.lineWidth = 1;
    g.fillStyle = '#8a8f9e'; g.font = '12px "Songti SC","SimSun",serif';
    g.textAlign = 'right';
    for (var t = 0; t <= 4; t++) {
      var v = maxV * t / 4, y = H - padB - (H - padT - padB) * t / 4;
      g.beginPath(); g.moveTo(padL, y); g.lineTo(W - padR, y); g.stroke();
      g.fillText(Math.round(v).toLocaleString(), padL - 10, y + 4);
    }
    var bw = (W - padL - padR) / 9;
    g.textAlign = 'center';
    st.bands.forEach(function (b, i) {
      var x = padL + bw * i + bw * 0.18, w = bw * 0.64;
      var h = (H - padT - padB) * b.visible / maxV;
      var y = H - padB - h;
      var grd = g.createLinearGradient(0, y, 0, H - padB);
      grd.addColorStop(0, i + 1 === st.current ? '#d8b25c' : 'rgba(120,140,190,0.85)');
      grd.addColorStop(1, 'rgba(60,72,100,0.35)');
      g.fillStyle = grd;
      g.fillRect(x, y, w, h);
      g.fillStyle = i + 1 === st.current ? '#d8b25c' : '#8a8f9e';
      g.fillText(String(b.bortle), x + w / 2, H - padB + 20);
      g.fillText(b.visible.toLocaleString(), x + w / 2, Math.max(y - 8, padT - 6));
    });
    g.fillStyle = '#e8e4d8'; g.textAlign = 'left';
    g.fillText('可见恒星数（全天空，颗）', padL, 24);
    g.fillStyle = '#8a8f9e'; g.textAlign = 'center';
    g.fillText('Bortle 等级：1 暗空 → 9 市中心', W / 2, H - 12);
  }

  /* ---------- 太阳系 ---------- */
  var solarEl = $('solarList');
  var BODIES = [{ zh: '太阳', pi: -1 }].concat(PLANETS.map(function (p, i) { return { zh: p.zh, pi: i }; }));
  BODIES.forEach(function (b) {
    var btn = document.createElement('button');
    btn.className = 'btn'; btn.style.margin = '0 8px 8px 0';
    btn.textContent = b.zh;
    btn.addEventListener('click', function () {
      if (b.pi < 0) { window.curTarget = null; GX.flyTo({ target: [0, 0, 0], logD: -6.85, dur: 2800 }); }
      else GX.focusPlanet(b.pi, 2800);
    });
    solarEl.appendChild(btn);
  });
  var speedEl = $('speedRow');
  var SPEEDS = [[1, '真实流速'], [3600, '1小时/秒'], [86400, '1天/秒'],
                [2592000, '1月/秒'], [31557600, '1年/秒']];
  /* 高亮档取自引擎读数，不写第二份常量：面板说的和天上跑的必须是同一件事 */
  var curSpeed = simSpeed();
  SPEEDS.forEach(function (sp) {
    var btn = document.createElement('button');
    btn.className = 'btn' + (sp[0] === curSpeed ? '' : ' ghost'); btn.style.margin = '0 8px 8px 0';
    btn.textContent = sp[1];
    btn.addEventListener('click', function () {
      setSimSpeed(sp[0]); setSimPaused(false);
      var all = speedEl.querySelectorAll('button');
      for (var k = 0; k < all.length; k++) all[k].className = 'btn ghost';
      btn.className = 'btn';
    });
    speedEl.appendChild(btn);
  });
  var pauseBtn = document.createElement('button');
  pauseBtn.className = 'btn ghost'; pauseBtn.textContent = '暂停';
  pauseBtn.addEventListener('click', function () { setSimPaused(true); });
  speedEl.appendChild(pauseBtn);

  /* ---------- 位置导航（左缘常驻） ----------
     模型在星际尺度下必然很小，靠「点中那颗像素」来找位置本就不现实。
     这排按钮把「去哪」和「点中」解耦：点（或用手指住）一个名字，镜头连续飞抵，
     用户永远能找到位置。文案全静态、点击走 GX，不注入任何动态 HTML。 */
  function locKeyOfState() {
    var s = GX.state();
    if (GX.mode() === 'ground') return 'ground';
    var tg = s.target;
    if (tg && tg.kind === 'planet') return 'p' + tg.pi;
    if (s.logD < -6.3) return 'sun';
    if (s.logD < -3.0) return 'solar';
    if (s.logD > 3.0) return 'galaxy';
    return null;
  }
  function syncLoc() {
    var rail = $('locRail');
    if (!rail) return;
    var show = GX.mode() === 'space' && !window.__SIDERA_INTRO__ && !HUNT.show && !veilBusy;
    rail.classList.toggle('show', show);
    var key = locKeyOfState();
    var bs = rail.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', !!key && bs[i].getAttribute('data-loc') === key);
  }
  (function bindLocRail() {
    var rail = $('locRail');
    if (!rail) return;
    rail.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-loc]') : null;
      if (!b) return;
      var loc = b.getAttribute('data-loc');
      if (loc === 'ground') { toGround(); syncLoc(); return; }
      toSpace();
      if (loc === 'galaxy') GX.galaxyView(2400);
      else if (loc === 'solar') GX.solarView(2400);
      else if (loc === 'sun') { window.curTarget = null; GX.flyTo({ target: [0, 0, 0], logD: -6.85, dur: 2600 }); }
      else if (loc.charAt(0) === 'p') { var pi = +loc.slice(1); if (PLANETS[pi]) GX.focusPlanet(pi, 2400); }
      syncLoc();
    });
  })();

  /* ---------- 点选反馈 ---------- */
  var chipTimer = null, warpStar = -1;
  function showChip(name, meta) {
    $('chipName').textContent = name;
    $('chipMeta').textContent = meta;
    $('warpBtn').classList.remove('show');
    warpStar = -1;
    $('chip').classList.add('show');
    if (chipTimer) clearTimeout(chipTimer);
    chipTimer = setTimeout(function () { $('chip').classList.remove('show'); }, 6500);
  }

  /* ---------- 星际穿越：从脚下这颗星飞过去 ---------- */
  function starNameOf(i) {
    var gi = GX.starInfo(i);
    return STAR_ZH[i] || ZH_BY_EN[gi.name] || gi.name || ('HYG #' + i);
  }
  /* 星际穿越的内核：它跨越的是可核查的真实距离。
     隧道进度 = 0 → X 光年；抵达后给出「光的出发年份」和「此刻在你所在的天空能否看见」，
     所以它不是过场动画，而是一把把城市天空与世界真实尺度对上的尺子。 */
  function warpTo(i) {
    if (i < 0 || !window.WARP) return false;
    huntStop();
    var gi = GX.starInfo(i);
    var nm = starNameOf(i);
    var ly = gi.distPc > 0 ? gi.distPc * 3.26156 : 0;
    var departYear = ly > 0 ? Math.round(new Date().getFullYear() - ly) : 0;
    $('chip').classList.remove('show');
    function captionAt(ratio) {
      if (!ly) return nm + ' · 距离未知';
      var d = ratio >= 0.995 ? ly.toFixed(1) : String(Math.round(ly * ratio));
      return '正在跨越 ' + d + ' / ' + ly.toFixed(1) + ' 光年 · 这束光出发于 ' + departYear + ' 年';
    }
    /* 距离越远，穿越越久：近星 2 秒左右，跨银河系尺度接近 3 秒 */
    var dur = Math.round(1900 + 1100 * Math.min(1, Math.log10(Math.max(ly, 1) + 1) / 3.6));
    var ok = WARP.play({
      caption: captionAt(0),
      dur: dur,
      onProgress: function (u) {
        var el = $('warpCap');
        if (el) el.textContent = captionAt(Math.min(1, u));
      },
      onDone: function () {
        GX.focusStar(i, 2400);
        var nmMap = {}; nmMap[i] = nm;
        GX.highlight({ stars: [i], pairs: [], names: nmMap });
        var meta = '视星等 ' + gi.mag + ' · ' + (ly ? ly.toFixed(1) + ' 光年' : '距离未知');
        if (departYear > 0) meta += ' · 你看到的是 ' + departYear + ' 年发出的光';
        var w = (G && G.whereIs) ? G.whereIs(i) : null;
        if (w) {
          meta += ' · 此刻在你所在的城市' + (w.visible ? '可见' : '看不见') +
            '（Bortle ' + GX.getBortle() + '，极限星等 ' + w.limit.toFixed(1) + '）';
        }
        showChip(nm, meta);
      }
    });
    if (!ok) { toSpace(); GX.focusStar(i, 2400); return false; }
    /* 隧道先铺满画面，再切场景：否则观众会看见地面场景凭空消失 */
    setTimeout(function () { if (GX.mode() !== 'space') toSpace(); }, 140);
    return true;
  }
  $('warpBtn').addEventListener('click', function () { warpTo(warpStar); });

  /* 常驻入口：地面幕右缘两枚胶囊（星际穿越 / 手势）。首屏是几乎空无一物的城市夜空，
     「星际穿越」若只藏在点星后的浮条里，等于没有。 */
  function syncWarpFab() {
    var fab = $('warpFab');
    if (fab) fab.classList.toggle('show', GX.mode() === 'ground' && !panelOpen);
    var gf = $('gestFab');
    if (gf) {
      /* 手势现在每一幕都可用：地面幕拨头顶的星，宇宙幕拨银河。不再跟着地面幕一起收 */
      gf.classList.toggle('show', !panelOpen && !!window.GESTURE);
      var on = !!(window.GESTURE && GESTURE.active());
      gf.classList.toggle('on', on);
      var lab = $('gestLab');
      if (lab) lab.textContent = on ? '关闭手势' : '手势';
    }
    syncLoc();
  }
  if (window.GESTURE) {
    GESTURE.onStop = function () {
      gestBase = GESTURE.active() ? { b: GX.getBortle() } : null;
      syncWarpFab();
      gestRead();
    };
    $('gestFab').addEventListener('click', function () {
      if (GESTURE.active()) { GESTURE.stop(); return; }
      GESTURE.start().catch(function () { /* 失败原因已经在手势 HUD / 提示里说明 */ });
    });
    $('gestClose').addEventListener('click', function () { GESTURE.stop(); });
  }
  $('warpFab').addEventListener('click', function () {
    if (!G || !G.brightest) return;
    var list = G.brightest(1);
    if (!list.length) { toSpace(); return; }
    warpTo(list[0].i);
  });

  /* 「飞向今晚的星」：此刻此地真正看得见的星，按亮度排序，一键飞过去 */
  var starListKey = '', starListTimer = 0;
  function azName(a) {
    return ['北', '东北', '东', '东南', '南', '西南', '西', '西北'][Math.round(a / 45) % 8];
  }
  function renderStarList() {
    var el = $('starList');
    if (!el || !G || !G.brightest) return;
    var raw = G.brightest(10), list = [];
    /* 星表把双星两子星各记一行，坐标几乎重合：列表里保留更亮的那颗，别让同一个亮点出现两次 */
    raw.forEach(function (o) {
      for (var k = 0; k < list.length; k++) {
        var dAlt = Math.abs(list[k].alt - o.alt), dAz = Math.abs(list[k].az - o.az);
        if (dAz > 180) dAz = 360 - dAz;
        if (dAlt < 0.4 && dAz < 0.4) return;
      }
      list.push(o);
    });
    list = list.slice(0, 6);
    var gs = G.state();
    var key = gs.city + '|' + gs.hours + '|' + GX.getBortle() + '|' +
      list.map(function (o) { return o.i; }).join(',');
    if (key === starListKey) return;
    starListKey = key;
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!list.length) {
      var e0 = document.createElement('div');
      e0.className = 'p-note';
      e0.textContent = '此刻此地没有肉眼可见的恒星——把 Bortle 调低，或换个时刻再看。';
      el.appendChild(e0);
      return;
    }
    list.forEach(function (o) {
      var row = document.createElement('div'); row.className = 'star-row';
      var left = document.createElement('div');
      var nmEl = document.createElement('div'); nmEl.className = 'nm';
      nmEl.textContent = starNameOf(o.i);
      var mtEl = document.createElement('div'); mtEl.className = 'mt';
      var con = conOf(o.i);
      mtEl.textContent = (con ? con + ' · ' : '') + magWord(o.mag) + ' ' + o.mag.toFixed(2) + ' 等 · ' +
        altBand(o.alt) + ' ' + Math.round(o.alt) + '° · 偏' + azName(o.az);
      left.appendChild(nmEl); left.appendChild(mtEl);
      var btn = document.createElement('button');
      btn.textContent = '飞过去';
      btn.setAttribute('aria-label', '星际穿越：飞向' + starNameOf(o.i));
      btn.addEventListener('click', function () { closePanel(); warpTo(o.i); });
      row.appendChild(left); row.appendChild(btn);
      el.appendChild(row);
    });
  }
  function queueStarList() {
    if (starListTimer) clearTimeout(starListTimer);
    starListTimer = setTimeout(function () { starListTimer = 0; renderStarList(); renderVerify(); }, 200);
  }

  /* ---------- 出门核对：把可证伪性交回用户 ----------
     确定性预测：以某颗星为中心、伸臂一拳宽（直径 10°，即角半径 5°）的天区窗口，此刻肉眼可见几颗。
     计数口径由 GROUND.windowCount 统一给出（地平线硬门控 + 大气消光 + Bortle 极限星等），
     屏幕只做额外的视觉渐隐，不参与预测计数。
     窗口数字一律取自内核（GROUND.windowCount 的默认角半径 + fistWidth 的拳宽），
     文案不再自己写死角度——2026-11-13 口径审查查出文案与实算各说各话：
     文案写「一拳宽≈10°」，内核却按 10° 角半径取窗（直径 20°、面积 4 倍），对外预测被放大 4.5 倍。 */
  var verifyInfo = null, verifyDirty = false;
  var verifyCursor = { sig: '', round: 0 };
  function verifySignature(st) {
    return [st.city, st.lat, st.lon, st.predictedAt, st.bortle].join('|');
  }
  function nowCityIso() {
    var d = new Date(Date.now() + 8 * 3600000);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
      'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds()) + '+08:00';
  }
  function verifyPool() {
    var cands = G.brightest(30), pool = [];
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].alt >= 25 && cands[i].alt <= 75) pool.push(cands[i]);
    }
    if (!pool.length && cands.length) pool.push(cands[0]);
    return pool;
  }
  function lockPrediction(advance) {
    var st = G.state(), sig = verifySignature(st);
    if (sig !== verifyCursor.sig) { verifyCursor.sig = sig; verifyCursor.round = 0; }
    else if (advance && verifyInfo && !verifyDirty) verifyCursor.round++;
    var pool = verifyPool(), rounds = pool.length;
    var round = rounds ? verifyCursor.round % rounds : 0;
    var anchor = rounds ? pool[round] : null;
    var w = anchor ? G.windowCount(anchor.i) : null;
    if (!w) {
      verifyInfo = null; verifyDirty = false;
      $('m1CardHours').value = '';
      return;
    }
    var id = 'pred-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    verifyInfo = window.M1.freezePrediction({
      schema: 3, predictionId: id, protocolVersion: 'M1-3',
      modelVersion: st.modelVersion, createdAt: nowCityIso(), catalog: st.catalog,
      predictedAt: st.predictedAt, timeZone: st.timeZone, nightKey: st.nightKey,
      city: st.city, place: st.city, lat: st.lat, lon: st.lon,
      bortle: w.bortle, limit: w.limit, count: w.count,
      anchor: w.anchor, name: starNameOf(w.anchor), az: w.az, alt: w.alt,
      window: 'fist', windowRadius: w.radius, windowDiameter: G.fistWidth(),
      horizon: st.horizon, extinction: st.extinction,
      round: round + 1, rounds: rounds
    });
    verifyDirty = false;
    $('m1CardHours').value = String(st.hours);
    $('btnVerify').textContent = '按当前条件换一局并锁定';
  }
  function renderVerify(advance) {
    var el = $('verifyCard');
    if (!el || !G || !G.windowCount || !window.M1) return;
    if (advance) lockPrediction(true);
    if (verifyInfo) {
      var sig = verifySignature(G.state());
      if (sig !== verifyCursor.sig) {
        verifyCursor.sig = sig; verifyCursor.round = 0; verifyDirty = true;
      }
    }
    el.textContent = '';
    if (!verifyInfo) {
      var tag0 = document.createElement('span'); tag0.className = 'vround'; tag0.textContent = '尚未生成预测';
      el.appendChild(tag0);
      el.appendChild(document.createTextNode(' 点击「按当前条件换一局并锁定」后才会生成预测；当前没有可用的高空恒星窗口时，请先调整时刻或光害。'));
      return;
    }
    var w = verifyInfo;
    if (verifyDirty) {
      var dirty = document.createElement('div'); dirty.className = 'p-note bad';
      dirty.textContent = '当前地点、时刻或光害已改变；下面仍是原来锁定的预测，不会被偷偷改写。要让新预测生效，请点「按当前条件换一局并锁定」。';
      el.appendChild(dirty);
    }
    var tag = document.createElement('span'); tag.className = 'vround';
    tag.textContent = '已锁定 · 第 ' + w.round + ' / ' + w.rounds + ' 局';
    el.appendChild(tag);
    el.appendChild(document.createTextNode(' '));
    el.appendChild(document.createTextNode('预测时刻 ' + w.predictedAt + '（当地 ' + w.nightKey +
      ' 观测夜）。面向' + azName(w.az) + ' ' + Math.round(w.az) +
      '°，抬头到' + altBand(w.alt) + '（' + Math.round(w.alt) + '°），找到' + w.name +
      '——伸出一臂，握拳，一拳宽≈' + w.windowDiameter + '°（以它为中心、半径 ' + w.windowRadius + '°）。模型估算这个窗口内肉眼可见 '));
    var b = document.createElement('b'); b.textContent = w.count + ' 颗';
    el.appendChild(b);
    el.appendChild(document.createTextNode('（含锚星；Bortle ' + w.bortle + ' · 极限星等 ' +
      w.limit.toFixed(1) + '）。裸眼、暗适应≥' + window.M1.DARK_MIN + ' 分钟、只数窗口内、±' +
      window.M1.TOL + ' 颗算吻合；计数时刻须在预测前后 ' + window.M1.HOUR_TOL +
      ' 分钟内，且地点、方向、锚星和窗口一致。这里的数字是模型估算，不是对城市灯光净损失的因果测量。'));
  }

  /* 卡上的可证伪一句：与核对卡同一 verifyInfo，收图的人照着就能出门打脸 */
  function cardVerifyLine() {
    if (!verifyInfo) return '想核对？请先在「出门核对」中点击「按当前条件换一局并锁定」，明信片不会代你预注册预测。';
    return '想核对？' + verifyInfo.predictedAt + '，面向' + azName(verifyInfo.az) + ' ' + Math.round(verifyInfo.az) +
      '°、仰角 ' + Math.round(verifyInfo.alt) + '°，' + verifyInfo.name + '周围一拳宽（' +
      verifyInfo.windowDiameter + '°）窗口，裸眼模型估算 ' + verifyInfo.count +
      ' 颗（±' + window.M1.TOL + ' 颗算吻合）';
  }

  /* ---------- 今夜找星 ----------
     城市夜空只剩一百多颗星，找星本来就更难，也更诚实：
     你找到的每一颗，都是此刻、此地真正还看得见的。 */
  var HUNT = { show: false, on: false, idx: [], at: 0, found: 0, tick: 0, adv: 0, darkTimer: 0, backB: 8,
               note: '', noteUntil: 0 };
  function skyDist(a, b) {
    var p1 = a.alt * Math.PI / 180, p2 = b.alt * Math.PI / 180;
    var dl = (a.az - b.az) * Math.PI / 180;
    var c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
    return Math.acos(Math.max(-1, Math.min(1, c))) / Math.PI * 180;
  }
  function huntPick() {
    var all = G.brightest(60).slice(0), chosen = [];
    if (!all.length) return chosen;
    chosen.push(all.shift());
    /* 目标要分得开，逼着人真的抬头转一圈，而不是盯着一个点连点五下 */
    while (chosen.length < 5 && all.length) {
      var bi = 0, bd = -1;
      for (var i = 0; i < all.length; i++) {
        var m = 180;
        for (var j = 0; j < chosen.length; j++) m = Math.min(m, skyDist(all[i], chosen[j]));
        if (m > bd) { bd = m; bi = i; }
      }
      if (bd < 8) break;
      chosen.push(all.splice(bi, 1)[0]);
    }
    return chosen;
  }
  function dirWord(dx, dy) {
    var s = '';
    if (dx > 60) s += '右'; else if (dx < -60) s += '左';
    if (dy > 60) s += '下'; else if (dy < -60) s += '上';
    return s || '前方';
  }
  /* 罗盘：白针 = 当前面向（yaw），金点 = 目标方位（az），同为「北 0° 顺时针」口径。
     转到针与点重合即正对目标——把抽象的「偏东北」变成看得见的转向。 */
  function paintCompass(yaw, az) {
    var face = $('hcFace'), tgt = $('hcTarget');
    if (face) face.setAttribute('transform', 'rotate(' + yaw.toFixed(1) + ' 50 50)');
    if (tgt) {
      var a = az * Math.PI / 180;
      tgt.setAttribute('cx', (50 + 44 * Math.sin(a)).toFixed(1));
      tgt.setAttribute('cy', (50 - 44 * Math.cos(a)).toFixed(1));
    }
  }
  /* 目标在视野外时，把金色箭头钳到屏幕边缘并指向它，杜绝对着空处瞎找。
     方向取屏幕中心→目标的单位向量，与内缩矩形求交得到落点。 */
  function placeArrow(dx, dy, cx, cy, W, H) {
    var arrow = $('huntArrow'); if (!arrow) return;
    var len = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / len, uy = dy / len;
    var m = 36, hw = W / 2 - m, hh = H / 2 - m;
    var tt = Math.min(hw / Math.max(Math.abs(ux), 1e-6), hh / Math.max(Math.abs(uy), 1e-6));
    arrow.style.display = 'block';
    arrow.style.left = (cx + ux * tt).toFixed(0) + 'px';
    arrow.style.top = (cy + uy * tt).toFixed(0) + 'px';
    arrow.style.transform = 'rotate(' + (Math.atan2(uy, ux) * 180 / Math.PI).toFixed(1) + 'deg)';
  }
  function hideArrow() { var a = $('huntArrow'); if (a) a.style.display = 'none'; }
  function huntPaint() {
    if (performance.now() < (HUNT.hold || 0)) return;
    var t = HUNT.idx[HUNT.at];
    if (!t) return;
    var gs = G.state(), con = conOf(t.i);
    var hk = $('huntKernel');
    if (hk) {
      var kb = GX.getBortle(), kband = GX.visStats().bands[kb - 1];
      var kv = G.visibleStats(kband.limit).visible;
      var kt = '清单由光害决定：Bortle ' + kb + ' · 极限星等 ' + kband.limit.toFixed(1) +
        ' · 今夜头顶可见 ' + kv.toLocaleString() + ' 颗 · 你的 ' + HUNT.idx.length + ' 个目标全在这堆里';
      if (hk.textContent !== kt) hk.textContent = kt;
    }
    $('huntProg').textContent = HUNT.found + ' / ' + HUNT.idx.length;
    $('huntTarget').textContent = '找到 ' + starNameOf(t.i) + (con ? '（' + con + '）' : '') +
      ' · ' + magWord(t.mag) + ' ' + t.mag.toFixed(2) + ' 等';
    paintCompass(gs.yaw, t.az);
    var rel = ((t.az - gs.yaw + 540) % 360) - 180;
    var turn = Math.abs(rel) < 3 ? '正对目标方向'
      : (rel > 0 ? '向右转 ' + Math.round(rel) + '°' : '向左转 ' + Math.round(-rel) + '°');
    $('huntBearing').textContent = '偏' + azName(t.az) + ' ' + Math.round(t.az) + '° · ' + turn +
      ' · 仰角 ' + altBand(t.alt) + ' ' + Math.round(t.alt) + '°';
    if (performance.now() < (HUNT.noteUntil || 0)) { $('huntHint').textContent = HUNT.note; hideArrow(); return; }
    var s = G.screenOf ? G.screenOf(t.i) : null;
    if (!s) { $('huntHint').textContent = '它已经落到地平线下了。退出重开一局。'; hideArrow(); return; }
    var W = window.innerWidth, H = window.innerHeight, cx = W / 2, cy = H / 2;
    var onScreen = s.front && s.x >= 0 && s.x <= W && s.y >= 0 && s.y <= H;
    if (onScreen) {
      hideArrow();
      var dx = s.x - cx, dy = s.y - cy;
      if (Math.abs(dx) < 90 && Math.abs(dy) < 90) {
        $('huntHint').textContent = '就在眼前：在' + (con ? con + '里' : '这片天区') +
          '找那颗' + magWord(t.mag) + '的点，点它。';
      } else {
        $('huntHint').textContent = '往' + dirWord(dx, dy) + '转一点，它在' + altBand(t.alt) +
          '（' + Math.round(t.alt) + '°）。';
      }
    } else {
      var ax, ay;
      if (s.front) { ax = s.x - cx; ay = s.y - cy; }
      else { ax = rel > 0 ? 1 : -1; ay = t.alt > gs.pitch ? -0.5 : 0.5; }
      placeArrow(ax, ay, cx, cy, W, H);
      $('huntHint').textContent = s.front
        ? '目标还在视野外：跟着金色箭头转，它在' + altBand(t.alt) + '。'
        : '它在你的背后：' + turn + '，再抬头到' + altBand(t.alt) + '（' + Math.round(t.alt) + '°）。';
    }
  }
  function huntStart() {
    if (!G || !G.brightest || !G.screenOf) return;
    if (HUNT.darkTimer) { clearTimeout(HUNT.darkTimer); HUNT.darkTimer = 0; tweenBortle(HUNT.backB, 1000); }
    var list = huntPick();
    if (!list.length) return;
    closePanel(); hideFirstHint(); setSplit(false); toGround();
    HUNT.idx = list; HUNT.at = 0; HUNT.found = 0; HUNT.show = true; HUNT.on = true;
    HUNT.note = ''; HUNT.noteUntil = 0;
    $('huntDark').style.display = 'none';
    $('huntAgain').style.display = 'none';
    $('huntExit').textContent = '退出';
    $('huntHud').classList.add('on');
    huntPaint();
    if (HUNT.tick) clearInterval(HUNT.tick);
    HUNT.tick = setInterval(function () { if (HUNT.show && HUNT.on) huntPaint(); }, 260);
    syncWarpFab();
  }
  /* 灯变了，清单就必须变：Bortle 一改，立刻按新的可见星重挑目标——
     这正是「内核驱动找星」的时刻：拖动滑杆的人亲眼看到目标名单随之坍缩/扩张。 */
  function huntReBortle() {
    var list = huntPick();
    if (HUNT.adv) { clearTimeout(HUNT.adv); HUNT.adv = 0; }
    HUNT.idx = list; HUNT.at = 0; HUNT.found = 0; HUNT.hold = 0;
    if (!list.length) {
      $('huntProg').textContent = '0 / 0';
      $('huntTarget').textContent = '灯开到最亮，城市夜空里已经没有够格当目标的星。';
      $('huntHint').textContent = '把光害等级调暗几档，或按「再来一局」在这片天里重新开始。';
      var hk0 = $('huntKernel');
      if (hk0) {
        var b0 = GX.getBortle(), band0 = GX.visStats().bands[b0 - 1];
        hk0.textContent = '清单由光害决定：Bortle ' + b0 + ' · 极限星等 ' + band0.limit.toFixed(1) +
          ' · 今夜头顶可见 ' + G.visibleStats(band0.limit).visible.toLocaleString() + ' 颗 · 目标 0 个';
      }
      hideArrow();
      return;
    }
    HUNT.note = 'Bortle 变了：清单已按新的天空重算——现在这些才是你今晚真能找到的。';
    HUNT.noteUntil = performance.now() + 6000;
    huntPaint();
  }
  function huntStop() {
    if (!HUNT.show) return;
    HUNT.show = false; HUNT.on = false;
    if (HUNT.tick) { clearInterval(HUNT.tick); HUNT.tick = 0; }
    if (HUNT.adv) { clearTimeout(HUNT.adv); HUNT.adv = 0; }
    if (HUNT.darkTimer) { clearTimeout(HUNT.darkTimer); HUNT.darkTimer = 0; tweenBortle(HUNT.backB, 1200); }
    $('huntHud').classList.remove('on');
    hideArrow();
    syncWarpFab();
  }
  function huntWin(i) {
    var t = HUNT.idx[HUNT.at];
    HUNT.hold = performance.now() + 1300;
    hideArrow();
    var con = conOf(i);
    G.mark(i, starNameOf(i) + (con ? ' · ' + con : ''));
    HUNT.found = Math.max(HUNT.found, HUNT.at + 1);
    $('huntProg').textContent = HUNT.found + ' / ' + HUNT.idx.length;
    $('huntTarget').textContent = '找到它了：' + starNameOf(i) + (con ? '（' + con + '）' : '');
    $('huntHint').textContent = t.mag.toFixed(2) + ' 等（' + magWord(t.mag) + '）——在这样的城市夜空里，它已经算「亮星」了。';
    if (HUNT.adv) clearTimeout(HUNT.adv);
    HUNT.adv = setTimeout(function () {
      HUNT.adv = 0;
      HUNT.at++;
      if (HUNT.at >= HUNT.idx.length) huntDone();
      else huntPaint();
    }, 1400);
  }
  function huntMiss(i) {
    HUNT.hold = performance.now() + 2200;
    $('huntHint').textContent = '这是 ' + starNameOf(i) + '（' + GX.starInfo(i).mag.toFixed(2) + ' 等），不是目标——再找找。';
  }
  function huntDone() {
    HUNT.on = false;
    if (HUNT.tick) { clearInterval(HUNT.tick); HUNT.tick = 0; }
    hideArrow();
    var dark = G.visibleStats(7.6).visible;
    $('huntProg').textContent = '完成';
    $('huntTarget').textContent = '今夜，你亲手找回了 ' + HUNT.idx.length + ' 颗星。';
    $('huntHint').textContent = '同一片天，本来有 ' + dark.toLocaleString() + ' 颗肉眼可见——其余的，被城市的灯盖住了。';
    $('huntDark').style.display = '';
    $('huntAgain').style.display = '';
    $('huntExit').textContent = '结束';
  }
  function huntDarkView() {
    if (HUNT.darkTimer) return;
    HUNT.backB = GX.getBortle();
    tweenBortle(2, 1800);
    $('huntHint').textContent = '这就是刚才那片天本来的样子：银河、暗星，都在。';
    HUNT.darkTimer = setTimeout(function () {
      HUNT.darkTimer = 0;
      tweenBortle(HUNT.backB, 2400);
      $('huntHint').textContent = '灯一亮，它们又回去了。你刚才找到的那几颗，会一直是亮的。';
    }, 9000);
  }
  $('btnHunt').addEventListener('click', function () { huntStart(); });
  $('btnVerify').addEventListener('click', function () {
    renderVerify(true);
    var el = $('verifyCard');
    /* 用户点完要有三件事同时发生：卡真换、整卡进视野（原先首行被面板上缘裁掉 30px，
       #panel 是 overflow:hidden，看不出动静就等于没反应）、边框闪一下。
       闪烁用「先摘类 → 强制重排 → 再挂类」，连点也能一帧一帧重新起播。 */
    if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    el.classList.remove('cardflash');
    void el.offsetWidth;
    el.classList.add('cardflash');
  });

  /* ---------- 观测回传：把可证伪闭环的另一半接上 ----------
     用户出门数完回来填「实际颗数 + 协议条件」→ M1 纯函数判定 → 存本机 localStorage → 可导出 JSON 归档留痕。
     全程 textContent、零网络、零内联脚本；记录只在本机，导出由用户主动触发。
     判定带（±2 颗）与「可比性闸门」都在 core/m1.js，这里只做取值与留痕，不做任何判定。 */
  (function () {
    if (!window.M1) return;
    var KEY = 'sidera_m1_records', CAP = 200, SCHEMA = 3;
    var elA = $('m1Actual'), elT = $('m1CountAt'), elCH = $('m1CardHours'), elD = $('m1Dark'),
        elMe = $('m1Method'), elW = $('m1Window'), elB = $('m1Block'),
        elC = $('m1Cloud'), elM = $('m1Moon'), elP = $('m1Place'),
        elLat = $('m1Lat'), elLon = $('m1Lon'), elCS = $('m1CoordSrc'), elN = $('m1Nelm'),
        elAz = $('m1Az'), elAlt = $('m1Alt'), elAnchor = $('m1Anchor'), elRadius = $('m1WindowRadius'),
        elV = $('m1Verdict'), elH = $('m1History'), elNow = $('m1Now'),
        elRec = $('m1Record'), elExp = $('m1Export');
    if (!elA || !elT || !elCH || !elD || !elMe || !elW || !elB || !elC || !elM ||
        !elP || !elLat || !elLon || !elCS || !elN || !elAz || !elAlt || !elAnchor || !elRadius ||
        !elV || !elH || !elNow || !elRec || !elExp) return;

    /* 页面上写给用户看的两个协议数字，也从内核取：静态文案里那两份是占位，
       真值以内核为准——否则改了内核忘了改文案，就会出现「站点教 10 分钟、闸门按 20 分钟判」这种自相矛盾。 */
    var elTol = $('m1TolNote');
    if (elTol) elTol.textContent = '±' + M1.TOL;
    elD.placeholder = '≥' + M1.DARK_MIN + '，别看手机';

    /* 「把站上这个观测点抄进三格」：只解决一件事——记录里的地点与卡面预测的地点必须同一个点，
       否则「卡按北京算、人站锦州数」这种不可比会从源头混进来。它不代替现场定位：
       坐标来源照旧要观测者自己声明（抄这一格＝site，内核仍记为「待补」）。 */
    (function () {
      var btn = $('m1FillPlace'), out = $('m1FillMsg');
      if (!btn || !out) return;
      btn.addEventListener('click', function () {
        if (!verifyInfo) { out.textContent = '请先在上方锁定一张预测卡'; out.className = 'p-note bad'; return; }
        var p = verifyInfo;
        elP.value = p.place;
        elLat.value = String(p.lat); elLon.value = String(p.lon);
        elAz.value = String(p.az); elAlt.value = String(p.alt);
        elAnchor.value = String(p.anchor); elRadius.value = String(p.windowRadius);
        elCS.value = '';
        out.textContent = '已带入锁定预测的地点、方向、锚星和窗口；坐标来源仍须在现场选 GPS 或地图。若现场读数不同，请直接改正，内核会核对是否仍在容差内。';
        out.className = 'p-note good';
      });
    })();

    function txt(el, max) {
      var s = String(el.value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
      return s.length > max ? s.slice(0, max) : s;
    }
    function load() {
      try {
        var raw = localStorage.getItem(KEY);
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    }
    function save(arr) {
      if (unreadableStorage()) return false;
      try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; }
      catch (e) { return false; }
    }
    function fmtTs(ts) {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return String(ts);
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function nowIso() {
      var d = new Date(Date.now() + 8 * 3600000);
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + 'T' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
    }
    function unreadableStorage() {
      try {
        var raw = localStorage.getItem(KEY);
        if (!raw) return false;
        return !Array.isArray(JSON.parse(raw));
      } catch (e) { return true; }
    }
    function renderHistory() {
      var arr = load(), parts = window.M1.partitionRecords(arr);
      while (elH.firstChild) elH.removeChild(elH.firstChild);
      var head = document.createElement('div');
      head.textContent = unreadableStorage()
        ? '本机记录无法解析：已隔离并停止覆盖，请先备份原始数据。'
        : '本机 ' + arr.length + ' 条：有效证据 ' + parts.evidence.length + ' · 参考 ' + parts.reference.length +
          ' · 已隔离 ' + parts.quarantined.length + '（显示最近 5 条）';
      elH.appendChild(head);
      if (!arr.length) return;
      var labels = { confirm: '吻合', falsify: '推翻', invalid_cond: '参考·条件不足', invalid: '无效' };
      var last = arr.slice(-5).reverse();
      for (var i = 0; i < last.length; i++) {
        var r = last[i], row = document.createElement('div'), bad = window.M1.recordProblems(r);
        row.className = 'row';
        if (bad.length) {
          row.textContent = '已隔离 · ' + bad[0] + (r && r.recordedAt ? ' · ' + fmtTs(r.recordedAt) : '');
        } else if (r.schema !== 3) {
          row.textContent = '历史记录 · ' + (r.countAt || fmtTs(r.ts)) + ' · ' + (r.city || '—') +
            ' · 旧 schema，不可作为有效证据';
        } else {
          row.textContent = (r.observation.countAt || '') + ' · ' + r.prediction.city + ' · 预测 ' +
            r.prediction.count + ' / 实测 ' + r.actual + ' · ' + (labels[r.verdict.code] || r.verdict.code) +
            '（差 ' + r.verdict.diff + '）';
        }
        elH.appendChild(row);
      }
    }
    function setVerdict(v, predicted, actual, audit) {
      elV.className = v.code;
      var line = v.code === 'invalid' ? '' :
        '预测 ' + predicted + ' 颗 · 实测 ' + actual + ' 颗 · 差 ' +
        (v.diff > 0 ? '+' : '') + v.diff + '。';
      elV.textContent = line + v.text +
        (audit.length ? '｜复核字段待补：' + audit.join('；') + '。（不改变可比性判定）' : '');
      if (window.NAVIGATOR) window.NAVIGATOR.onVerdict(v.code, v.diff);
    }
    function doRecord() {
      var raw = elA.value.trim();
      var actual = raw === '' ? NaN : Number(raw);
      if (!verifyInfo) {
        setVerdict({ code: 'invalid_cond', diff: null, gaps: ['尚未锁定预测'],
          text: '请先在上方生成并锁定预测，再填写观测。记录时不会临时生成预测。' }, '—', raw || '—', []);
        return;
      }
      var cond = {
        cloud: elC.value, moon: elM.value,
        darkMin: elD.value.trim(), method: elMe.value, window: elW.value, block: elB.value,
        countAt: txt(elT, 20), timeZone: window.M1.TIME_ZONE,
        place: txt(elP, 120), lat: elLat.value.trim(), lon: elLon.value.trim(),
        coordSrc: elCS.value, nelm: elN.value.trim(),
        az: elAz.value.trim(), alt: elAlt.value.trim(), anchor: elAnchor.value.trim(),
        windowRadius: elRadius.value.trim()
      };
      var v = window.M1.verdictPrediction(verifyInfo, actual, cond);
      setVerdict(v, verifyInfo.count, raw === '' ? '—' : actual, v.code === 'invalid' ? [] : window.M1.auditGaps(cond));
      if (v.code === 'invalid') return;
      var rec = {
        schema: SCHEMA, recordId: 'rec-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10),
        recordedAt: new Date().toISOString(), prediction: window.M1.copyPrediction(verifyInfo),
        observation: cond, actual: actual, verdict: v
      };
      var arr = load();
      arr.push(rec);
      if (arr.length > CAP) arr = arr.slice(arr.length - CAP);
      var ok = save(arr);
      renderHistory();
      if (!ok) elV.textContent += '（注意：本机存储不可用或原数据已损坏，这条未写入；原始数据未被覆盖。）';
    }
    function doExport() {
      var arr = load(), parts = window.M1.partitionRecords(arr), unreadable = unreadableStorage();
      var payload = {
        exportedAt: new Date().toISOString(), schemaVersion: SCHEMA,
        scope: '模型估算＋可证伪核对；不是城市灯光净损失的因果测量',
        protocol: 'M1-3：无月晴夜、裸眼逐颗点数、一拳宽直径10°（角半径5°）、暗适应≥' +
                  window.M1.DARK_MIN + '分钟、预测前后≤' + window.M1.HOUR_TOL + '分钟、同一观测夜与观测点',
        model: { catalog: window.M1.CATALOG, version: window.M1.MODEL_VERSION,
                 horizon: window.M1.HORIZON, extinction: window.M1.EXTINCTION,
                 timeZone: window.M1.TIME_ZONE, nightBoundary: '18:00' },
        gatesRequired: { cloud: 'clear', moon: 'none', darkMin: '≥' + window.M1.DARK_MIN,
                         method: ['point'], window: 'fist', block: 'none', coordSrc: ['gps', 'map'],
                         siteToleranceM: window.M1.SITE_TOL_M, directionToleranceDeg: window.M1.DIR_TOL,
                         windowRadius: 5 },
        tolerance: window.M1.TOL,
        integrity: 'digest 仅用于发现意外改动，不是防恶意篡改的签名；localStorage 不是可信时间源',
        totalCount: arr.length, evidenceCount: parts.evidence.length,
        referenceCount: parts.reference.length, quarantinedCount: parts.quarantined.length,
        records: parts.evidence
      };
      if (unreadable) {
        payload.storageUnreadable = true;
        try { payload.rawStorage = localStorage.getItem(KEY); } catch (e) { /* 导出其余字段 */ }
      }
      try {
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'sidera_m1_evidence.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        elV.className = 'confirm';
        elV.textContent = '已导出 ' + parts.evidence.length + ' 条有效证据；另有 ' + parts.reference.length +
          ' 条参考记录、' + parts.quarantined.length + ' 条隔离记录未作为证据导出。';
      } catch (e) {
        elV.className = 'invalid';
        elV.textContent = '导出失败：' + (e && e.message ? e.message : '浏览器不支持文件下载');
      }
    }
    elNow.addEventListener('click', function () { elT.value = nowIso(); });
    elRec.addEventListener('click', doRecord);
    elExp.addEventListener('click', doExport);
    renderHistory();
    GX.m1State = function () {
      var arr = load();
      return { records: arr, parts: window.M1.partitionRecords(arr),
               storageUnreadable: unreadableStorage(), tolerance: window.M1.TOL,
               darkMin: window.M1.DARK_MIN, hourTol: window.M1.HOUR_TOL, cardHours: elCH.value };
    };
  })();

  $('huntExit').addEventListener('click', function () { huntStop(); });
  $('huntAgain').addEventListener('click', function () { huntStart(); });
  $('huntDark').addEventListener('click', function () { huntDarkView(); });
  GX.huntState = function () {
    return { show: HUNT.show, on: HUNT.on, at: HUNT.at, found: HUNT.found,
             targets: HUNT.idx.map(function (o) { return o.i; }) };
  };
  GX.verifyState = function () {
    return { prediction: verifyInfo ? window.M1.copyPrediction(verifyInfo) : null, dirty: verifyDirty };
  };
  /* 只读口径导出：给领航员复用同一套中文命名/方位/仰角分档，避免第二套说法 */
  GX.__starZh = starNameOf;
  GX.__azName = azName;
  GX.__altBand = altBand;
  GX.__cardVerifyLine = cardVerifyLine;
  GX.__cardDataURL = function () { try { return buildCard().toDataURL('image/png'); } catch (e) { return 'ERR:' + (e && e.message); } };
  GX.onSelect = function (best) {
    /* 地面幕：不飞走。人站在地上点星，只在头顶把它圈出来 —— 这正是这个视角的意义 */
    if (GX.mode() === 'ground') {
      if (best.kind !== 'star' || !G) return;
      if (HUNT.show && HUNT.on) {
        if (HUNT.idx[HUNT.at] && best.i === HUNT.idx[HUNT.at].i) huntWin(best.i);
        else huntMiss(best.i);
        return;
      }
      var gi = GX.starInfo(best.i);
      var gname = starNameOf(best.i);
      var gcon = conOf(best.i);
      G.mark(best.i, gname + (gcon ? ' · ' + gcon : '') + ' · ' + gi.mag.toFixed(2) + ' 等');
      showChip(gname, (gcon ? gcon + ' · ' : '') + '此刻头顶可见 · 视星等 ' + gi.mag + ' · 距离 ' + gi.distPc + ' 秒差距（' +
        (gi.distPc * 3.26156).toFixed(1) + ' 光年）· HYG v4.0 实测');
      warpStar = best.i;
      $('warpBtn').classList.add('show');
      return;
    }
    if (best.kind === 'planet') {
      var p = PLANETS[best.pi];
      GX.focusPlanet(best.pi, 2600);
      showChip(p.zh, '真实 3D 球体 · J2000 轨道实时解算 · 直径 ' + p.d.toLocaleString() + ' km');
    } else if (best.kind === 'sol') {
      window.curTarget = null;
      GX.flyTo({ target: [0, 0, 0], logD: -6.85, dur: 2800 });
      showChip('太阳', '恒星 · 光谱 G2V · 距我们 1 天文单位');
    } else if (best.kind === 'star') {
      var info = GX.starInfo(best.i);
      GX.focusStar(best.i, 2600);
      var nmMap = {}; nmMap[best.i] = info.name || ('HIP ' + (info.hip || ''));
      GX.highlight({ stars: [best.i], pairs: [], names: nmMap });
      var nm = info.name || 'HIP ' + (info.hip || '—');
      showChip(nm, '视星等 ' + info.mag + ' · 距离 ' + info.distPc + ' 秒差距（' + (info.distPc * 3.26156).toFixed(1) + ' 光年）· HYG v4.0 实测');
    }
  };

  /* ---------- 顶栏状态 ---------- */
  function updateTopbar() {
    var s = GX.state();
    if (GX.mode() === 'ground' && G) {
      var gs = G.state();
      var band = GX.visStats().bands[s.bortle - 1];
      var gv = G.visibleStats(band.limit);
      $('statStars').textContent = gs.city + ' 今夜 ' + fmtHour(gs.hours) + ' · 头顶可见 ' +
        gv.visible.toLocaleString() + ' 颗星';
      $('statView').textContent = 'Bortle ' + s.bortle + ' · 极限星等 ' + band.limit.toFixed(1);
      return;
    }
    $('statStars').textContent = '真实恒星 ' + s.real.toLocaleString() + ' 颗 · HYG v4.0';
    var d = Math.pow(10, s.logD);
    var view = d < 0.01 ? '太阳系尺度' : d < 100 ? '星际尺度' : '银河系尺度';
    $('statView').textContent = view + ' · Bortle ' + s.bortle;
  }
  setInterval(function () {
    if (window.GESTURE && GESTURE.active()) gestRead();
    updateTopbar();
    syncLoc();
  }, 800);

  /* ---------- 开场：时间基准、幂等收尾、看门狗 ---------- */
  var INTRO = { done: false, t0: performance.now(), raf: 0, watch: 0 };
  window.__SIDERA_INTRO__ = true;   // 片头期间：engine  tick 据此强制隐藏太阳系锚点
  /* 缓动：仅用于 Bortle 叙事的连续推进 */
  function ease3(x) { x = Math.max(0, Math.min(1, x)); return 1 - Math.pow(1 - x, 3); }
  /* intertitle 硬切：短促淡入/淡出（图册曝光感），不做位移/clip/字距动画。 */
  function cutAt(id, t, a, b) {
    var el = $(id);
    if (!el) return;
    var vin = Math.max(0, Math.min(1, (t - a) / 140));
    var vout = Math.max(0, Math.min(1, (b - t) / 140));
    el.style.opacity = Math.min(vin, vout).toFixed(3);
  }
  /* 读数取真实星数：与面板/分屏同一套（地平线以上 + 大气消光），不另造数。 */
  function introVis(b) {
    var st = GX.visStats();
    var band = st.bands[b - 1];
    var gs = (G && G.visibleStats) ? G.visibleStats(band.limit) : null;
    return { vis: gs ? gs.visible : band.visible, limit: band.limit };
  }
  function endIntro() {
    if (INTRO.done) return; INTRO.done = true;
    window.__SIDERA_INTRO__ = false;
    if (INTRO.raf) cancelAnimationFrame(INTRO.raf);
    clearTimeout(INTRO.watch);
    var fadeEl = $('introFade');
    var introEl = $('intro');
    /* 三层收束：文字先退 → 薄幕接上 → 幕下切地面 → 幕慢开。
       全程没有「一刀全黑」，也不会让观众看见镜头凭空一抖。 */
    if (introEl) { introEl.style.transition = 'opacity .42s ease'; introEl.style.opacity = '0'; }
    setTimeout(function () {
      if (fadeEl) { fadeEl.style.transition = 'opacity .5s ease'; fadeEl.style.opacity = '1'; }
      setTimeout(function () {
        if (introEl) introEl.style.display = 'none';
        GX.setMode('ground');
        $('modeBtn').textContent = '回到宇宙';
        GX.setBortle(8);
        $('bortle').value = '8';
        updateLightUI();
        syncWarpFab();
        $('topbar').style.opacity = '1';
        $('nav').style.opacity = '1';
        setTimeout(showFirstHint, 1700);
        setTimeout(function () {
          if (!fadeEl) return;
          fadeEl.style.transition = 'opacity 1.6s ease';
          fadeEl.style.opacity = '0';
          setTimeout(function () { if (fadeEl.parentNode) fadeEl.parentNode.removeChild(fadeEl); }, 1700);
        }, 240);
      }, 520);
    }, 430);
  }
  function introTick(now) {
    if (INTRO.done) return;
    INTRO.raf = requestAnimationFrame(introTick);
    var t = (INTRO.frozen != null) ? INTRO.frozen : now - INTRO.t0;
    if (!isFinite(t) || t < 0) t = 0;
    var fadeEl = $('introFade');
    if (fadeEl) fadeEl.style.opacity = String(Math.max(0, 1 - t / 1600));
    /* 叙事 Bortle：暗空(1) → 城市漫上(9) → 停留 → 找回暗空(1)。星与读数随之真实变化。 */
    var bCont;
    if (t < 3500) bCont = 1;
    else if (t < 8000) bCont = 1 + 8 * ease3((t - 3500) / 4500);
    else if (t < 10500) bCont = 9;
    else if (t < 14000) bCont = 9 - 8 * ease3((t - 10500) / 3500);
    else bCont = 1;
    var b = Math.max(1, Math.min(9, Math.round(bCont)));
    if (b !== INTRO.lastB) {
      INTRO.lastB = b;
      GX.setBortle(b);
      var rv = introVis(b);
      var rc = $('roCount'); if (rc) rc.textContent = rv.vis.toLocaleString();
      var rm = $('roMeta'); if (rm) rm.textContent = 'BORTLE ' + b + ' · 极限星等 ' + rv.limit.toFixed(1);
    }
    var glow = $('introGlow');
    if (glow) glow.style.opacity = (((bCont - 1) / 8) * 0.9).toFixed(3);
    /* intertitle 硬切三句；命名锁版在找回暗空时切入 */
    cutAt('il1', t, 600, 3400);
    cutAt('il2', t, 3600, 7900);
    cutAt('il3', t, 8100, 10400);
    var ro = $('introReadout');
    if (ro) ro.style.opacity = Math.max(0, Math.min(1, (t - 500) / 200)).toFixed(3);
    var title = $('introTitle');
    if (title) {
      title.style.opacity = Math.max(0, Math.min(1, (t - 12400) / 220)).toFixed(3);
      var sub = title.querySelector('.sub');
      if (sub) sub.style.opacity = Math.max(0, Math.min(1, (t - 12700) / 220)).toFixed(3);
    }
    if (t >= 16600) endIntro();
  }
  $('introSkip').addEventListener('click', function () { endIntro(); });
  /* 初始镜头：星际尺度 + 一条 16 秒慢推贯穿全片；reduced-motion 下静止机位。 */
  GX.setView({ logD: 1.02, az: 0.62, el: 0.28 });
  GX.setBortle(1);
  if (!window.matchMedia || !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    GX.flyTo({ target: [0, 0, 0], logD: 1.42, az: 0.84, el: 0.34, dur: 16600 });
  }
  function watchEnd() { if (INTRO.frozen == null) endIntro(); else INTRO.watch = setTimeout(watchEnd, 1000); }
  INTRO.watch = setTimeout(watchEnd, 19500);   // 手表兜底：任何异常都不许把观众锁在黑场（取证冻结时暂停）
  INTRO.raf = requestAnimationFrame(introTick);
  if (/[?&]selftest=1(&|$)/.test(location.search)) {
    window.__SIDERA_INTRO_TEST__ = {
      freeze: function (t) { INTRO.frozen = t; },
      unfreeze: function () { INTRO.frozen = null; }
    };
  }

  /* 光害补间（找回/回到闹市按钮） */
  (function tweenLoop() {
    requestAnimationFrame(tweenLoop);
    if (!bortleTween) return;
    var u = Math.min(1, (performance.now() - bortleTween.t0) / bortleTween.dur);
    var e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    GX.setBortle(Math.round(bortleTween.from + (bortleTween.to - bortleTween.from) * e));
    if (u >= 1) { bortleTween = null; queueStarList(); }
  })();

  updateLightUI();
})();