/* ============================================================================
 * 星阑归序 · navigator.js —— 星仔 · 场景内领航员
 * 四站航线（光害滑杆 → 今晚第一颗 → 暗夜分界 → 可证伪核对）带用户把真控件用一遍；
 * 航线飞完转「指哪讲哪」：点天上的星，我飞过去把它的真实数据讲给你。
 *
 * 安全与口径约定（与站点其余部分一致）：
 *   - 零内联脚本、零 innerHTML、零 eval；动态文本一律 textContent；样式是静态字符串表，不插值。
 *   - 不发任何网络请求，不读写 Cookie，不碰摄像头/存储。
 *   - 数字全部来自生产内核：GX.visStats / GROUND.visibleStats / GROUND.windowCount /
 *     GX.verifyState / M1 判定事件。本文件不自建第二套星表，也不自己写 ±2 容差判定。
 *   - 装饰层不得拖垮应用：整帧 try/catch，异常只写 __NAV_ERR，航线仍可手动点。
 * ==========================================================================*/
(function () {
  'use strict';
  if (window.NAVIGATOR) return;
  var TAU = Math.PI * 2;

  /* ---------- 工具 ---------- */
  var reduced = false;
  try { reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }; }
  function rgba(c, a) { return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; }
  function $(id) { return document.getElementById(id); }
  function fmt(n) { return typeof n === 'number' ? n.toLocaleString() : '—'; }
  function clickEl(node) { if (node) { markDrive(2600); try { node.click(); } catch (e) {} } }
  /* 等一个条件成立（场景切换/面板展开都是异步的）。
     max 是「最多轮询多少次」（120ms 一次），默认 45≈5.4 秒；
     幕间薄幕在软件渲染下能飘好几秒，接话这类不急的动作可以给到 90≈10.8 秒。 */
  function when(cond, then, tries, max) {
    tries = tries || 0; max = max || 45;
    var ok = false;
    try { ok = !!cond(); } catch (e) { ok = false; }
    if (ok) { then(); return; }
    if (tries >= max) return;
    setTimeout(function () { when(cond, then, tries + 1, max); }, 120);
  }

  /* ---------- 样式（静态字符串表，动态内容不进 CSS） ---------- */
  var css =
    /* 角色层与点击层压在 15（面板）/16（左右竖栏）/17~20（顶栏、底栏、提示条）之下：
       「不遮挡界面内容」由此变成层级上的硬保证，而不是每帧碰运气的避让。 */
    '#xzLayer{position:fixed;inset:0;z-index:14;pointer-events:none;display:none}' +
    '#xzHit{position:fixed;z-index:14;appearance:none;background:none;border:0;padding:0;' +
    'width:96px;height:96px;margin:-48px 0 0 -48px;border-radius:50%;cursor:pointer;display:none}' +
    '#xzHit:focus-visible{outline:1px solid rgba(216,178,92,.85);outline-offset:-6px}' +
    '#xzCap{position:fixed;z-index:23;max-width:330px;pointer-events:none;opacity:0;display:none;' +
    'font-family:"Songti SC","Noto Serif SC","Source Han Serif SC",serif;color:#e9e6da}' +
    '#xzCap .box{background:rgba(8,11,22,.93);border:1px solid rgba(216,178,92,.34);border-radius:12px;' +
    'padding:10px 14px;font-size:13px;line-height:1.75;box-shadow:0 10px 30px rgba(0,0,0,.5)}' +
    '#xzCap .who{font-size:10px;letter-spacing:.18em;color:#d8b25c;margin-bottom:4px}' +
    '#xzChip,#xzChip2{pointer-events:auto;display:none;margin-top:8px;appearance:none;cursor:pointer;' +
    'font-family:inherit;font-size:12px;letter-spacing:.08em;color:#d8b25c;background:rgba(216,178,92,.12);' +
    'border:1px solid rgba(216,178,92,.34);border-radius:8px;padding:6px 12px;transition:background .2s,transform .12s}' +
    '#xzChip2{margin-left:6px}' +
    '#xzChip:hover,#xzChip2:hover{background:rgba(216,178,92,.24)}' +
    '#xzChip:active,#xzChip2:active{transform:scale(.96)}' +
    /* 讲解标记：角色已经不能在面板上面「指」控件（那正是遮挡的来源），改由这一圈细虚线框
       套住真控件本身。它在 UI 之上但完全透明、pointer-events:none，既看得见也不吞点击。 */
    '#xzSpot{position:fixed;z-index:24;pointer-events:none;display:none;' +
    'border:1px dashed rgba(216,178,92,.82);border-radius:10px;' +
    'box-shadow:0 0 14px rgba(216,178,92,.30)}' +
    '@keyframes xzspot{0%,100%{opacity:.5}50%{opacity:1}}' +
    '#xzSpot.on{animation:xzspot 1.5s ease-in-out infinite}' +
    '#xzPlan{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:23;display:none;gap:6px;' +
    'flex-wrap:wrap;justify-content:center;max-width:94vw;font-family:"Songti SC","Noto Serif SC",serif}' +
    '#xzPlan.on{display:flex}' +
    '#xzPlan button{appearance:none;font-family:inherit;font-size:12px;letter-spacing:.06em;cursor:pointer;' +
    'color:#98a0b4;background:rgba(8,11,22,.68);border:1px solid rgba(233,230,218,.16);border-radius:16px;padding:5px 12px}' +
    '#xzPlan button:hover{color:#e9e6da}' +
    '#xzPlan button.cur{color:#d8b25c;border-color:rgba(216,178,92,.34);background:rgba(216,178,92,.1)}' +
    '#xzPlan button.done{color:#7fe08a;border-color:rgba(127,224,138,.35)}' +
    /* 隐秘导演台：默认不出现，长按星仔或 Shift+Alt+D 才召唤。
       它是后台工具而不是产品 UI，所以用「指星束」那支冷色 #a9c8ff 与产品金色区分；
       z=25 高于所有产品浮层，因此它会自动进避让清单——星仔不会躲在面板后面。 */
    '#xzDir{position:fixed;left:14px;top:76px;z-index:25;width:188px;display:none;box-sizing:border-box;' +
    'padding:10px 12px 11px;border:1px solid rgba(169,200,255,.30);border-radius:12px;background:rgba(8,11,22,.94);' +
    'box-shadow:0 12px 34px rgba(0,0,0,.55);color:#e9e6da;max-height:calc(100vh - 170px);overflow-y:auto;' +
    'scrollbar-width:thin;scrollbar-color:rgba(169,200,255,.35) transparent' +
    ';font-family:"Songti SC","Noto Serif SC","Source Han Serif SC",serif}' +
    '#xzDir.on{display:block}' +
    '#xzDir::-webkit-scrollbar{width:5px}#xzDir::-webkit-scrollbar-thumb{background:rgba(169,200,255,.35);border-radius:3px}' +
    '#xzDir h3{display:flex;align-items:center;justify-content:space-between;font-size:10px;font-weight:normal;' +
    'letter-spacing:.2em;color:#8f9ab4;margin-bottom:9px}' +
    '#xzDir h3 button{appearance:none;border:0;background:none;color:#8f9ab4;font-size:14px;line-height:1;' +
    'cursor:pointer;padding:0 2px;font-family:inherit}' +
    '#xzDir h3 button:hover{color:#e9e6da}' +
    '#xzDir .row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}' +
    '#xzDir .row label{font-size:11px;letter-spacing:.05em}' +
    '#xzDir input[type=range]{appearance:none;width:78px;height:16px;background:none;cursor:pointer}' +
    '#xzDir input[type=range]::-webkit-slider-runnable-track{height:2px;background:rgba(233,230,218,.18);border-radius:1px}' +
    '#xzDir input[type=range]::-webkit-slider-thumb{appearance:none;width:11px;height:11px;border-radius:50%;background:#a9c8ff;margin-top:-4.5px}' +
    '#xzDir input[type=range]::-moz-range-track{height:2px;background:rgba(233,230,218,.18)}' +
    '#xzDir input[type=range]::-moz-range-thumb{width:10px;height:10px;border:0;border-radius:50%;background:#a9c8ff}' +
    '#xzDir .sw{appearance:none;width:32px;height:17px;flex:0 0 auto;border-radius:9px;border:1px solid rgba(233,230,218,.18);' +
    'background:rgba(233,230,218,.08);cursor:pointer;position:relative;transition:background .2s,border-color .2s}' +
    '#xzDir .sw::after{content:"";position:absolute;top:2px;left:2px;width:11px;height:11px;border-radius:50%;' +
    'background:#8f9ab4;transition:left .2s,background .2s}' +
    '#xzDir .sw.on{background:rgba(169,200,255,.20);border-color:rgba(169,200,255,.5)}' +
    '#xzDir .sw.on::after{left:17px;background:#a9c8ff}' +
    '#xzDir .btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:2px}' +
    '#xzDir .btns button{appearance:none;font-family:inherit;font-size:11px;cursor:pointer;color:#d8b25c;' +
    'background:rgba(216,178,92,.09);border:1px solid rgba(216,178,92,.34);border-radius:7px;padding:4px 9px}' +
    '#xzDir .btns button:hover{background:rgba(216,178,92,.2)}' +
    '#xzDir .btns button.cur{color:#0a0d18;background:#d8b25c;border-color:#d8b25c}' +
    '#xzDir .ask{display:flex;gap:6px;margin-top:9px}' +
    '#xzDir .ask input{flex:1;min-width:0;appearance:none;font-family:inherit;font-size:11px;color:#e9e6da;' +
    'background:rgba(233,230,218,.05);border:1px solid rgba(233,230,218,.18);border-radius:7px;padding:5px 8px;outline:none}' +
    '#xzDir .ask input:focus{border-color:rgba(169,200,255,.5)}' +
    '#xzDir .ask button{flex:0 0 auto;appearance:none;font-family:inherit;font-size:11px;cursor:pointer;color:#a9c8ff;' +
    'background:rgba(169,200,255,.10);border:1px solid rgba(169,200,255,.4);border-radius:7px;padding:5px 9px}' +
    '#xzDirNote{font-size:10px;line-height:1.65;color:#8f9ab4;margin-top:9px}' +
    '@media (max-width:860px){#xzCap{max-width:250px}#xzPlan{bottom:76px}#xzPlan button{font-size:11px;padding:4px 9px}' +
    '#xzDir{left:10px;top:64px;width:164px}}';

  var layer = document.createElement('canvas'); layer.id = 'xzLayer';
  var ctx = layer.getContext('2d');
  if (!ctx) return;                       /* 没有 2D 上下文就整组件静默不装，绝不拖累主应用 */
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  var cap = document.createElement('div'); cap.id = 'xzCap';
  cap.setAttribute('role', 'status'); cap.setAttribute('aria-live', 'polite');
  var box = document.createElement('div'); box.className = 'box';
  var who = document.createElement('div'); who.className = 'who'; who.textContent = '星仔 · 领航员';
  var capText = document.createElement('span');
  var chip = document.createElement('button'); chip.id = 'xzChip'; chip.type = 'button';
  /* 第二个按钮位：提问式话题需要「两个答案」才谈得起来（一个按钮只能算通知）。 */
  var chip2 = document.createElement('button'); chip2.id = 'xzChip2'; chip2.type = 'button';
  box.appendChild(who); box.appendChild(capText); box.appendChild(chip); box.appendChild(chip2); cap.appendChild(box);

  var plan = document.createElement('div'); plan.id = 'xzPlan';
  plan.setAttribute('role', 'tablist'); plan.setAttribute('aria-label', '领航航线');

  var hit = document.createElement('button'); hit.id = 'xzHit'; hit.type = 'button';
  hit.setAttribute('aria-label', '和星仔互动');

  var spotMark = document.createElement('div'); spotMark.id = 'xzSpot';
  spotMark.setAttribute('aria-hidden', 'true');

  document.body.appendChild(layer); document.body.appendChild(cap);
  document.body.appendChild(plan); document.body.appendChild(hit);
  document.body.appendChild(spotMark);

  /* ---------- 视口 ---------- */
  var W = 0, H = 0, DPR = 1, focal = 300;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    layer.width = Math.round(W * DPR); layer.height = Math.round(H * DPR);
    /* canvas 是「替换元素」：CSS 尺寸缺省时不跟随定位盒，而是退回**固有尺寸**
       = width/height 属性 = W*DPR。于是 dpr=1.5 时这块覆盖层被显示成视口的 1.5 倍，
       而下面所有绘制都在 ctx.setTransform(DPR,…) 里按 CSS 像素写坐标 ——
       蓝圈、光晕、角色、拖尾整体落到应有位置的 1.5 倍处，唯独 DOM 星名标签不动，
       于是「点北河二、圈住别处」。dpr=1 时比例正好是 1，所有探针都跑在 dpr=1 上，
       所以这道缺陷此前任何门禁都看不见。必须显式钉住 CSS 盒。 */
    layer.style.width = W + 'px'; layer.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    focal = clamp(H * 0.45, 170, 430);                    /* 与已批准预览同一比例（220×1.35 / 658） */
    /* 视口一变（转屏、窗口拖小、缩放），旧目标点可能已经落在新的画面外：
       不重解就会让角色一直朝「下面」飞，而那个下面现在是页面外——这正是用户报的「飞到页面外面」。
       注意第一次调用发生在 nav/foot 尚未初始化之前，所以必须用真值守卫而不是想当然。
       这里只先做「绝不出框」这一件保命的事：此刻页面还没重排，chromeRects 量到的浮层
       矩形仍是旧版式的（实测 760 宽的窗里能拿到一条右缘 1478 的矩形），拿它选停靠位会选到
       自以为干净、其实压住顶栏的位置。所以真正的重解排到重排之后（reclampAt），不在这里做。 */
    if (nav && foot && foot.l) {
      clampTargets();
      chromeCache = null; chromeCacheT = -1e9;
      reclampAt = performance.now() + 400;
    }
  }
  window.addEventListener('resize', resize); resize();

  /* ---------- 领航员状态 ---------- */
  var S = { glow: 1, speed: 1, scale: 1.32, hue: '#e8b654' };
  var cam = { yaw: 0.5, pitch: 0.18, dist: 9, tyaw: 0.5, tpitch: 0.18 };
  var spirit = { pos: { x: 0, y: 0, z: 0 }, rotY: 0, rotZ: 0, squash: 1, hop: 0, blink: 0, state: 'idle', stateT: 0, emotion: 'happy' };
  var nav = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, size: 1 };
  var trail = [], sparks = [];
  var stopIdx = -1, stopDone = [false, false, false, false], stopComplete = false, advancing = false;
  /* free = 「不在带飞航线的站里」。旧实现只在航线飞完才置真，等于把点星讲解、点角色、闲时漫游
     全锁在「先看完四站」后面——错过 15 秒问候气泡的首访用户面对的是一个又静又硬、
     还点不动的摆件。现在从它出现那帧起就可互动，只有 enterStop 期间（它正握着方向盘）才收回去。 */
  var free = true, greeted = false, stripOn = false;
  var chipAct = null, chipAct2 = null, capTimer = 0, capFade = 0, capTarget = 0;
  var spotEl = null, beamIdx = -1, beamT = 0, selfDrive = false, tweenRaf = 0;
  var alive = false, yielding = false, avoidT = 0, reclampAt = 0;
  /* 讲解锚点：aim() 本来想让角色站在哪儿（带元素身份，元素一变即失效）。
     落点解算只回答「此刻哪儿站得住」，不回答「本来要站哪儿」，所以转场期被临时
     矩形逼开以后，它不会自己走回来——这一条就是补它缺的那个记忆。 */
  var perchAim = null;
  /* 「主动性」总闸：探针可以关掉它，从而确定性地单独验避让；关掉后角色仍停得下来、仍点得动。 */
  var frozen = false;
  /* 隐秘导演台的台账。这里每一项都只改「表现」：不改内核读数、不改真控件的值、不写存储、不发请求。
     rest = 休息中（自主的走/想/说全停，但用户照样点得动、拖得动）；
     drag = 用户正拎着星仔走（此时不让半路的避让改道抢方向盘，落点仍由 flyTo 解算）。 */
  var dir = { on: false, trail: true, spot: true, roam: true, talk: true, pin: false, boxes: false, rest: false, drag: false };

  function setEmotion(e) { spirit.emotion = e; }
  function setState(s, dur) { spirit.state = s; spirit.stateT = dur || 0; }
  function navBob() { return reduced ? 0 : Math.sin(performance.now() / 700) * 4; }
  function flyTo(x, y, size) {
    if (typeof size === 'number') nav.size = size;
    /* 任何一次起飞都先过避让：落点由真实剪影矩形解算，既不压任何 z>14 的层，也不被页面切掉。
       讲解位也不例外——「指着那个控件」改由浮在控件外框的标记（#xzSpot）承担，
       层级保证（角色层 z=14 < 面板 z=15）加上站位保证，才是「永不遮挡」的完整答案。 */
    var p = placeBody(clamp(x, 0, W), clamp(y, 0, H), uiAvoid());
    nav.tx = p.x; nav.ty = p.y;
  }
  function spawnSparks(n, color, spread) {
    if (reduced) return;
    for (var i = 0; i < n; i++) sparks.push({ x: nav.x, y: nav.y, vx: (Math.random() - 0.5) * spread * 90,
      vy: (Math.random() - 0.7) * spread * 90, life: 1, c: color });
  }

  /* ---------- 真实世界读数（全部走生产内核，不另造数） ---------- */
  function bNow() { return window.GX && GX.getBortle ? GX.getBortle() : 8; }
  function limitOf(b) {
    if (!window.GX || !GX.visStats) return null;
    var st = GX.visStats(); return (st && st.bands && st.bands[b - 1]) ? st.bands[b - 1].limit : null;
  }
  function visAt(b) {
    var lim = limitOf(b); if (lim === null) return null;
    var G = window.GROUND;
    if (G && G.visibleStats) { var v = G.visibleStats(lim); if (v && typeof v.visible === 'number') return v.visible; }
    var st = GX.visStats(); return st.bands[b - 1].visible;
  }
  function zh(i) {
    if (GX.__starZh) { try { return GX.__starZh(i); } catch (e) {} }
    var info = window.GX && GX.starInfo ? GX.starInfo(i) : null;
    return (info && info.name) ? info.name : '这颗星';
  }
  function azn(a) { return (window.GX && GX.__azName) ? GX.__azName(a) : ''; }
  function altw(a) { return (window.GX && GX.__altBand) ? GX.__altBand(a) : (a < 12 ? '贴近地平' : a < 35 ? '低空' : a < 65 ? '半空' : '近头顶'); }
  function panelRect() {
    var p = $('panel'); if (!p || !p.classList.contains('open')) return null;
    var r = p.getBoundingClientRect(); return r.width > 40 ? r : null;
  }
  /* ---------- 互不遮挡（双向）＋ 永不出框：纯几何，可单测 ----------
     旧版是「70px 圆 × 一张写死的浮层清单」，真实取证抓到两处漏口：
       ① 清单里没有 #topbar / #nav / #xzPlan / #warpCap —— 角色停进顶栏一带，
          实测 67% 剪影被 opaque 顶栏盖死（就是「看不到 AI 助手」那一张截图）；
       ② 钳位边距 52px 小于实测剪影半宽 77px —— 贴左缘时身体被页面直接切掉。
     现在：摆放按「画布上真实量出来的剪影矩形」，清单按「DOM 里所有 z>14 的可见层」
     （谁压在角色之上谁自动进清单，不再靠人记全），解算器永不返回 null
     ——上一版返回 null 时调用方照原样起飞，角色静默埋进面板，探针也看不见。 */
  var FOOT_Z = 14;                                  /* 角色层 #xzLayer 的层级：比它低的盖不住它 */
  var EDGE_M = 16;        /* 摆放留边：贴死页面边缘既难看，也经不起 1px 抖动就被算成出框 */
  var foot = { l: 82, r: 82, t: 58, b: 46 };        /* 剪影像限，相对 nav.x / nav.y；首帧后被实测接管 */
  var footRaw = null;
  function relaxFoot(dt) {
    if (!footRaw) return;
    var dec = 140 * dt;   /* 变大立刻跟上，变小约 1 秒收完：跟太紧会让避让位发抖，太慢会把角色赶太远 */
    foot.l = Math.max(footRaw.l, foot.l - dec);
    foot.r = Math.max(footRaw.r, foot.r - dec);
    foot.t = Math.max(footRaw.t, foot.t - dec);
    foot.b = Math.max(footRaw.b, foot.b - dec);
  }
  function footRect(x, y) {
    return { left: x - foot.l, top: y - foot.t, right: x + foot.r, bottom: y + foot.b };
  }
  /* 语泡避的是「这一帧真的画出来的」那一框，不是慢收的包络——包络只用来挑站位。 */
  function footNowRect(x, y) {
    var f = footRaw || foot;
    return { left: x - f.l, top: y - f.t, right: x + f.r, bottom: y + f.b };
  }
  /* 比例站位：中央天空带优先，角落留给栖息（全被压住时的兜底） */
  var SPOTS = [[0.42, 0.40], [0.50, 0.30], [0.34, 0.58], [0.50, 0.64],
               [0.62, 0.46], [0.26, 0.30], [0.14, 0.72]];
  /* 绕目标点的环形候选：讲解位要贴着正在讲的控件，所以先在小环（130/210/300px × 八向）
     里找最近的空位，环上没有才铺全屏网格。 */
  var RING = (function () {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707]];
    var ds = [130, 210, 300], out = [];
    for (var i = 0; i < ds.length; i++) for (var j = 0; j < dirs.length; j++) out.push([dirs[j][0] * ds[i], dirs[j][1] * ds[i]]);
    return out;
  })();
  function boxOf(node, pad) {
    if (!node || !node.getBoundingClientRect) return null;
    var cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return null;
    var r = node.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) return null;
    return { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad };
  }
  /* 凡是「层级在角色之上、此刻真看得见、又真的占一小块地方」的层，一律进避让清单。 */
  var chromeCache = null, chromeCacheT = -1e9, chromeBusy = 0, chromeBusyT = 0;
  function chromeRects() {
    var now = performance.now();
    /* 转场/动画进行中，200ms 缓存必脏：#panel 用 .65s transform 滑入，缓存只要在它走了
       三分之一时落一次，记下的矩形就比真实位置偏出上百像素——避让表「有这一块」却整块没盖上
       （线上实测漏管 panel@15:392x478）。所以动画在飞时每次现量，稳态仍吃缓存。
       end 有可能永远不来（节点在转场中被摘走），给计数器加个 4s 寿命，别卡成常开重扫。 */
    if (chromeBusy && now - chromeBusyT > 4000) chromeBusy = 0;
    if (chromeCache && !chromeBusy && now - chromeCacheT < 200) return chromeCache;
    var out = [], all = document.body.querySelectorAll('*'), i, el, cs, z, r;
    for (i = 0; i < all.length; i++) {
      el = all[i];
      if (el.closest && el.closest('#xzLayer,#xzCap,#xzPlan,#xzSpot,#xzHit')) continue;   /* 自己人不拦自己 */
      if (el.id === 'labels' || el.id === 'skyglow') continue;                            /* 星名标注/星辉是背景，不是遮挡 */
      cs = getComputedStyle(el);
      if (cs.position === 'static') continue;                    /* 静态流内没有独立遮罩能力 */
      z = parseInt(cs.zIndex, 10);
      if (!(z > FOOT_Z)) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) continue;
      r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) continue;
      if (r.width * r.height > W * H * 0.6) continue;             /* 满屏幕布不占位，否则无处可站 */
      if (r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) continue;   /* 滑出屏外的闭合面板 */
      out.push({ left: r.left - 10, top: r.top - 10, right: r.right + 10, bottom: r.bottom + 10 });
    }
    chromeCache = out; chromeCacheT = now;
    return out;
  }
  function chromeTouch(e) {
    var on = e.type === 'transitionstart' || e.type === 'animationstart';
    chromeBusy = Math.max(0, chromeBusy + (on ? 1 : -1));
    chromeBusyT = performance.now();
    if (on) chromeCache = null;          /* 起手的这一帧就把旧矩形丢掉 */
  }
  /* transition 与 animation 系列事件都会冒泡到 document，一组监听器看住全站转场。 */
  document.addEventListener('transitionstart', chromeTouch);
  document.addEventListener('transitionend', chromeTouch);
  document.addEventListener('transitioncancel', chromeTouch);
  document.addEventListener('animationstart', chromeTouch);
  document.addEventListener('animationend', chromeTouch);
  document.addEventListener('animationcancel', chromeTouch);
  function uiAvoid() {
    var out = chromeRects().slice();   /* 复制：调用方会往里追加，绝不能污染 200ms 缓存 */
    var pl = boxOf(plan, 8);           /* 航线条 z=23，同样压在角色之上 */
    if (pl) out.push(pl);
    return out;
  }
  function overlapsAny(rc, list) {
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      if (rc.right > q.left && rc.left < q.right && rc.bottom > q.top && rc.top < q.bottom) return true;
    }
    return false;
  }
  function inFrame(rc) {
    return rc.left >= EDGE_M && rc.top >= EDGE_M && rc.right <= W - EDGE_M && rc.bottom <= H - EDGE_M;
  }
  function scoreAt(l, t, w, h, avoid) {
    var vis = Math.max(0, Math.min(l + w, W - EDGE_M) - Math.max(l, EDGE_M)) *
              Math.max(0, Math.min(t + h, H - EDGE_M) - Math.max(t, EDGE_M));
    var ov = 0;
    for (var i = 0; i < avoid.length; i++) {
      var q = avoid[i], ow = Math.min(l + w, q.right) - Math.max(l, q.left),
          oh = Math.min(t + h, q.bottom) - Math.max(t, q.top);
      if (ow > 0 && oh > 0) ov += ow * oh * (q.w || 1);
    }
    return { out: w * h - vis, ov: ov };
  }
  /* 找一个「不被页面切掉、也不压住任何内容」的框位（左上角坐标）。
     先取双零解里离锚点最近的；真没有就退让：出框罚分远高于压内容，
     因为被切一半的角色和读不通的字幕都比「挨着面板」更刺眼。
     给了 slots（语泡才给）就先在语义槽位里取最近的双零解，槽位全不可用才落到
     环/网格/贴缝这些兜底位：兜底格点离锚点近 1px 就抢走槽位，抢到的还是逐帧
     变化的贴缝解——实测语泡正是这样在「跟剪影走的槽位」和 (1024,128) 这个 64px
     网格点之间每帧翻面。分层之后兜底解不参与抢位。 */
  function placeBox(w, h, al, at, avoid, slots) {
    var cands = slots ? slots.slice() : [], i;
    if (slots) {
      var slotClean = null, slotD = Infinity;
      for (i = 0; i < slots.length; i++) {
        var sl = clamp(slots[i][0], -w * 0.5, W - w + w * 0.5);
        var st = clamp(slots[i][1], -h * 0.5, H - h + h * 0.5);
        var ss = scoreAt(sl, st, w, h, avoid);
        var sd = Math.hypot(sl - al, st - at);
        if (ss.out === 0 && ss.ov === 0 && sd < slotD) { slotD = sd; slotClean = { l: sl, t: st }; }
      }
      if (slotClean) return slotClean;
    }
    cands.push([al, at]);
    for (i = 0; i < RING.length; i++) cands.push([al + RING[i][0], at + RING[i][1]]);
    var step = 64, gx, gy;
    for (gy = 0; gy <= Math.max(0, H - h); gy += step)
      for (gx = 0; gx <= Math.max(0, W - w); gx += step) cands.push([gx, gy]);
    /* 网格会漏掉「细缝」：顶栏下缘到下一块界面之间只剩一条窄带，能站的地方存在，
       但 64px 的格点一根都落不进去，于是明明有位子却报"没有干净位"。
       横竖边各自成线、两两相交才穷尽「贴缝摆放」：只补每个矩形的四个角，
       仍然够不到「上一条边和下一条边夹出来的带」（小窗开满面板时实测只剩 62px 净空带）。 */
    var xs = [al], ys = [at];
    for (i = 0; i < avoid.length; i++) {
      var q = avoid[i];
      xs.push(q.left - w, q.right);
      ys.push(q.top - h, q.bottom);
    }
    for (var a = 0; a < xs.length; a++) for (var b = 0; b < ys.length; b++) cands.push([xs[a], ys[b]]);
    var clean = null, cd = Infinity, alt = null, ac = Infinity;
    for (i = 0; i < cands.length; i++) {
      var l = clamp(cands[i][0], -w * 0.5, W - w + w * 0.5);
      var t = clamp(cands[i][1], -h * 0.5, H - h + h * 0.5);
      var sc = scoreAt(l, t, w, h, avoid), d = Math.hypot(l - al, t - at);
      if (sc.out === 0 && sc.ov === 0 && d < cd) { cd = d; clean = { l: l, t: t }; }
      var cost = sc.out * 12 + sc.ov + d * 0.02;
      if (cost < ac) { ac = cost; alt = { l: l, t: t, out: sc.out, ov: sc.ov }; }
    }
    return clean || alt;
  }
  function placeBody(x, y, avoid) {
    /* 落位必须先按「带 SQ_PAD 余量」的框找干净位：foot 是瞬时长大、慢速收小的包络框，
       贴着界面边缘零余量落下去，下一帧抬起手臂就把包络顶进去 1px——L4 实测落定帧
       ov 从 0 一路呼吸到 35，位置和目标都相同，纯粹是「落点没有给呼吸留地方」。
       带余量的干净位真的不存在时，才退回贴缝解：宁可贴边，也不能不落位。 */
    var r = placeAt(x, y, nav.size, avoid, SQ_PAD);
    if (!r.out && !r.ov) return { x: r.x, y: r.y };
    r = placeAt(x, y, nav.size, avoid, 0);
    return { x: r.x, y: r.y };
  }
  /* ---------- 挤不出空位时，「缩」是「挪」之外的第二种让步 ----------
     760×430 顶栏＋面板＋导演台全开时逐帧普查（_tools/xz_body_760_diag.py）：
     全屏零重叠位置只剩一条 y∈[72,134] 的窄带，62px 高，而满尺寸剪影约 69px——
     「没有干净位」是几何事实，不是解算器偷懒。这种时候继续按满尺寸站着，
     就等于坐在内容上面；把体积收小一档再落位，让步看得见、遮挡看不见。
     剪影随 nav.size 线性缩放（渲染口径 S.scale = 1.32 * nav.size），但实测 footRaw
     要等下一帧才更新，而缩位必须当场决定，所以按比例换算出「假设尺寸」的四象限。 */
  /* 地板取到 0.62：760×430 那条净空带只有 62px，要「带 6px 呼吸余量」站进去
     框高就得 ≤50，满尺寸 69 对应 0.72 只够贴缝站下（上一版就停在这里，
     ov 从 114 降到 91 却仍非零）。余量存在的最低档，才是能守住的地板；
     0.62 比让路时用的 0.8 还小，但那是「屏幕真的没地方站」的少见的临时状态，
     界面一松开 L5 那条会把它长回满档。 */
  var SQ_MIN = 0.62, SQ_STEP = 0.04, SQ_PAD = 6, sq = 1, sqHold = 0;
  function sqSet(next) {
    /* 档位吸附到阶梯上：0.04 的浮点累减会漂出 0.8799999 这种值，
       而 footAt 拿它当分母，漂一次就整体错位一档。 */
    sq = clamp(Math.round(next / SQ_STEP) * SQ_STEP, SQ_MIN, 1);
    nav.size = yielding ? Math.min(0.8, sq) : sq;
    sqHold = 0;
    /* 尺寸一变，包络还在往下收：0.15 秒后再查一次，别带着「按旧尺寸算出的落点」
       在新尺寸上停满 0.5 秒——那半秒正好是用户看到的「贴着界面边缘骑线」。 */
    avoidT = Math.min(avoidT, 0.15);
  }
  function footAt(s) {
    /* 用慢收的包络 foot 换算，不用实测 footRaw：摆放与探针量的都是这一框，
       包络恒 ≥ 实测，缩位判断因此只会保守、不会乐观——预览「缩完有干净位」
       而落定后仍被包络压住的那种红帧，就是这么省掉 0.4 秒时间差省不掉的。 */
    var k = s / Math.max(nav.size, 1e-3);
    return { l: foot.l * k, r: foot.r * k, t: foot.t * k, b: foot.b * k };
  }
  /* 假设尺寸下的解算：placeBox 的双零解不带 out/ov，退让解才带——据此判断「有没有干净位」。
     pad 把这一框四周各垫宽 SQ_PAD 再参与解算，回来还回真实框位：
     挑出来的位子因此带余量，不是「贴着边放正好不压」。上一版不留余量，落在
     62px 净空带里刚好塞下 58px 的框——呼吸（spirit.hop 让实测剪影一秒内涨回几像素）
     一顶就压进顶栏 0.8px，落定帧 ov 卡在 114。余量是给呼吸留的，不是给美观留的。 */
  function placeAt(x, y, s, avoid, pad) {
    var f = footAt(s), d = pad || 0;
    var r = placeBox(f.l + f.r + 2 * d, f.t + f.b + 2 * d, x - f.l - d, y - f.t - d, avoid);
    return { x: r.l + f.l + d, y: r.t + f.t + d, out: r.out || 0, ov: r.ov || 0 };
  }
  /* 原位放大验真：原地换成尺寸 s 后仍然既不压内容也不出框（同样要 SQ_PAD 余量），
     才允许把体积放回。缩与放用同一个余量口径，才不会出现「刚好塞下→一呼吸又挤出来」
     的临界来回：上一版只给放回侧留余量，缩位侧贴着边，O2 的语泡坐标就跟着抖成 5 个值。 */
  function fitsHere(s, x, y, avoid) {
    var q = placeAt(x, y, s, avoid, SQ_PAD);
    return q.out === 0 && q.ov === 0 && Math.abs(q.x - x) < 1 && Math.abs(q.y - y) < 1;
  }
  /* 落定点的自我修正：先挪（只认「挪过去就干净」），挪不出干净位就缩到
     「带余量的干净位存在」的最大档位。返回值带 size 字段才代表体积变了。
     阶梯从「当前真的画出来多大」（nav.size）往下走：footAt 的分母就是它，
     两边同一个基准，才不会在让路缩小的瞬间把预测尺寸算虚。 */
  function refit(x, y, avoid) {
    var base = penalty(footRect(x, y), avoid);
    if (base <= 1) return { x: x, y: y, clean: true };
    /* 先只认「挪过去就干净」：挪到另一个脏位看着在进步，实际是在脏位之间打转，
       永远轮不到缩位那一档——上一版落定帧 ov 停在 114 就是这么来的（每 0.5 秒
       换一个小一点的脏位，改道阈值 base-1 又宽，缩位分支一次都没走到）。 */
    var p = placeBody(x, y, avoid);
    if (penalty(footRect(p.x, p.y), avoid) === 0) return { x: p.x, y: p.y };
    for (var s = nav.size - SQ_STEP; s >= SQ_MIN - 1e-9; s -= SQ_STEP) {
      var q = placeAt(x, y, s, avoid, SQ_PAD);
      if (!q.out && !q.ov) return { x: q.x, y: q.y, size: s };
    }
    /* 缩到底、还要余量也没有：最后试一次「不留余量」的贴缝解——有缝就站进去，
       呼吸再顶上来时下一轮还会继续往小一档走，比原地坐在内容上仍然更守规矩。 */
    for (var t = nav.size - SQ_STEP; t >= SQ_MIN - 1e-9; t -= SQ_STEP) {
      var z = placeAt(x, y, t, avoid, 0);
      if (!z.out && !z.ov) return { x: z.x, y: z.y, size: t };
    }
    /* 到这里才是「这个画面真的没有干净位」：缩到地板 + 取该尺寸下代价最小的位
       （placeBox 把原位也当候选，所以这个解不会比现在更差），
       等界面一松开由放回逻辑长回去。上一版跳去满尺寸的 alt，反而把 373 涨到 541。 */
    var m = placeAt(x, y, SQ_MIN, avoid, 0);
    return { x: m.x, y: m.y, size: SQ_MIN };
  }
  /* 放回体积：一次问全阶梯，取原地还能站住的最大档。只改尺寸不改站位，
     所以放回过程不会产生「为放大而跳一小步」的抖动，落定帧数不受影响。 */
  function regrow(x, y, avoid) {
    for (var s = 1; s > sq + 1e-9; s -= SQ_STEP) if (fitsHere(s, x, y, avoid)) { sqSet(s); return; }
  }
  /* 把目标点重新解算进「当前画面 + 当前避让表」，钳位口径只有这一条。
     旧版 resize 完全不重钳、flyTo 各调各的 clamp，于是视口一变就可能朝页面外飞——
     用户报的「飞到下面、飞出页面」正是这条缝。身体只有在真的出框时才瞬移，否则照常飞过去。 */
  function clampTargets() {
    var r = refit(clamp(nav.tx, 0, W), clamp(nav.ty, 0, H), uiAvoid());
    if (r.size !== undefined) sqSet(r.size);
    nav.tx = r.x; nav.ty = r.y;
    if (!inFrame(footRect(nav.x, nav.y))) { nav.x = r.x; nav.y = r.y; }
  }
  /* 一框的「违例代价」：出框罚分远高于压内容（被切一半比挨着面板刺眼得多） */
  function penalty(rc, avoid) {
    var sc = scoreAt(rc.left, rc.top, rc.right - rc.left, rc.bottom - rc.top, avoid);
    return sc.out * 12 + sc.ov;
  }
  /* 某颗星此刻是否真的在画面里（front + 未被顶栏/底栏压住 + 不在面板底下） */
  function pickInfo(i) {
    var G = window.GROUND;
    if (!G || !G.screenOf || !window.GX || !GX.starInfo) return null;
    var p = G.screenOf(i);
    if (!p || !p.front) return null;
    var pr = panelRect();
    if (p.x < 28 || p.x > W - 28 || p.y < 62 || p.y > H - 96) return null;
    if (pr && p.x > pr.left - 24 && p.y > pr.top - 10 && p.y < pr.bottom + 10) return null;
    var w = G.whereIs ? G.whereIs(i) : null;
    var info = GX.starInfo(i);
    return { i: i, x: p.x, y: p.y, alt: w ? w.alt : p.alt, az: w ? w.az : p.az,
             mag: info.mag, visible: w ? !!w.visible : true, pc: info.distPc };
  }
  function pickStar() {
    var G = window.GROUND; if (!G || !G.brightest) return null;
    var list = G.brightest(16);
    for (var i = 0; i < list.length; i++) {
      var p = pickInfo(list[i].i);
      if (p) { p.mag = list[i].mag; return p; }
    }
    return null;
  }
  function verifyNow() { return window.GX && GX.verifyState ? GX.verifyState() : null; }
  function markIt(i) {
    var G = window.GROUND; if (!G || !G.mark || !G.whereIs) return;
    var w = G.whereIs(i), info = GX.starInfo(i);
    G.mark(i, zh(i) + ' · ' + info.mag.toFixed(2) + ' 等' +
      (w ? ' · ' + azn(w.az) + ' ' + Math.round(w.az) + '° / 高度 ' + Math.round(w.alt) + '°' : ''));
    setState('celebrate', 1.5); setEmotion('excited'); spawnSparks(18, hex2rgb('#e8b654'), 2.2);
  }

  /* ---------- 语泡 ---------- */
  /* hold=999 表示「常驻直到下一条」；chip2 存在时这条就是一句提问，两个按钮是两个答案。 */
  function say(msg, chipLabel, chipFn, hold, chip2Label, chip2Fn) {
    capText.textContent = msg;
    setOne(chip, chipLabel, chipFn, 1);
    setOne(chip2, chip2Label, chip2Fn, 2);
    cap.style.display = 'block'; capTarget = 1; capTimer = hold || 8;
  }
  function setOne(el, label, fn, which) {
    if (label && fn) { el.textContent = label; el.style.display = 'inline-block'; }
    else { el.style.display = 'none'; }
    if (which === 1) chipAct = (label && fn) ? fn : null; else chipAct2 = (label && fn) ? fn : null;
  }
  function rectOf(node) {
    if (!node) return null;
    var r = node.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  /* 飞到某个真控件旁边，把它圈出来讲 —— 领航员用的就是页面上那个真控件，不是副本 */
  function aim(node, msg, chipLabel, chipFn, hold) {
    var r = rectOf(node);
    /* 控件在面板里被滚出视野时，先把真的它滚进来看得见的地方，再飞过去（不假装指着屏幕外的东西） */
    if (node && (!r || r.cy < 64 || r.cy > H - 64)) {
      try { node.scrollIntoView({ block: 'center' }); } catch (e) { try { node.scrollIntoView(); } catch (e2) {} }
      r = rectOf(node);
    }
    spotEl = r ? node : null;
    beamIdx = -1;
    if (r) {
      perchAim = { el: node, x: r.cx + (r.cx > W * 0.5 ? -150 : 150), y: r.cy - 104 };
      flyTo(perchAim.x, perchAim.y);
    }
    setState('guide', 8); setEmotion('think');
    say(msg, chipLabel, chipFn, hold);
  }
  function lead(msg) { spotEl = null; beamIdx = -1; flyTo(W * 0.5, H * 0.3); setState('guide', 6); setEmotion('think'); say(msg, null, null, 10); }

  /* ---------- 场景/面板导航（点真按钮，走 app.js 的真实路径） ---------- */
  function isGround() { return window.GX && GX.mode ? GX.mode() === 'ground' : false; }
  function isLightOpen() {
    var p = $('panel'), s = $('sec-light');
    return !!(p && s && p.classList.contains('open') && s.classList.contains('on'));
  }
  function ensureGround(cb) {
    if (isGround()) { cb(); return; }
    clickEl($('modeBtn'));
    when(isGround, cb);
  }
  function ensureLight(cb) {
    if (isLightOpen()) { cb(); return; }
    var btn = document.querySelector('#nav button[data-sec="light"]');
    clickEl(btn);
    when(isLightOpen, cb);
  }
  function ensureScene(sec, cb) { ensureGround(function () { if (sec === 'light') ensureLight(cb); else cb(); }); }

  /* ---------- 光害滑杆：代用户拖（真实 input 事件，面板读数同步跟着变） ---------- */
  function tweenBortle(to, done) {
    var sl = $('bortle'); if (!sl) { if (done) done(); return; }
    var from = +sl.value, t0 = performance.now();
    selfDrive = true;
    if (tweenRaf) cancelAnimationFrame(tweenRaf);
    (function step() {
      var k = clamp((performance.now() - t0) / 1400, 0, 1);
      var e = reduced ? k : 1 - Math.pow(1 - k, 3);
      var v = Math.round(from + (to - from) * e);
      if (String(v) !== sl.value) {
        sl.value = String(v);
        try { sl.dispatchEvent(new Event('input', { bubbles: true })); } catch (err) {}
      }
      if (k < 1) tweenRaf = requestAnimationFrame(step);
      else { tweenRaf = 0; selfDrive = false; if (done) done(); }
    })();
  }
  function bortleReact() {
    var b = bNow();
    setState('happy', 1.3); setEmotion(b <= 3 ? 'excited' : 'happy');
    if (stopIdx === 3) { say('你动了光害等级（现在 Bortle ' + b + '），预测跟着变了——判定要以新数为准。', null, null, 8); return; }
    say('Bortle ' + b + '：头顶可见 ' + fmt(visAt(b)) + ' 颗，暗空本来有 ' + fmt(visAt(1)) + ' 颗。城市不是把星搬走了，是用灯光把暗星盖住了。', null, null, 8);
  }

  /* ---------- 航线四站 ---------- */
  var STOP_NAMES = ['光害滑杆', '今晚第一颗', '两片天', '可证伪核对'];
  var lastStop = 0;

  /* ============================================================================
   * 内心生活 —— 不用用户先动手，它也会走、会想、会开口、会搭话
   *   漫游 roam：每 3.5~7.5 秒自己挑一个空位飞过去（起飞照旧过真实剪影解算，绝不压界面、绝不出框）。
   *   起念 talk：话题文案里的每个数字都现场取自生产内核，22~34 秒才开一口，且不重复上一条。
   *   搭话 ask：有的话题带两个按钮 = 用户的两个答案，点了就有下文（这才叫谈，不然只是通知）。
   *   反应 react：用户换了城市 / 时刻 / 幕 / 面板 / 分屏，它必须在几秒内接得住话。
   * 三条硬约束：① 用户正在操作、正在带飞、幕间薄幕、片头没退 → 一律不插话；
   *             ② 语泡被占着时先排队，不抢话筒；③ 拿不到真实读数就作废这条话题，绝不编数。
   * ==========================================================================*/
  var ROAM = { t: 0, next: 2.2, hops: 0, dist: 0 };
  var TALK = { t: 0, next: 8, fired: 0, asked: 0, answered: 0, lastId: '', order: [] };
  var REACT = { pend: null, fired: 0, last: 0 };
  var driveUntil = 0;
  function markDrive(ms) { driveUntil = performance.now() + (ms || 2600); }
  function driving() { return performance.now() < driveUntil || selfDrive; }
  function mouthFree() { return !capTarget; }
  /* 不在带飞的站里、没在让路、幕静、片头已退 —— 这才轮得到我自己说话 */
  function talkAllowed() {
    return !!(alive && free && !advancing && !yielding && (stopIdx < 0 || stopIdx >= 4) && !sceneBusy());
  }
  function hourTxt() {
    var s = window.GROUND && GROUND.state ? GROUND.state() : null;
    if (!s || typeof s.hours !== 'number') return null;
    var hh = Math.floor(s.hours) % 24, mm = Math.round((s.hours - Math.floor(s.hours)) * 60);
    return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  }
  function cityTxt() {
    var s = window.GROUND && GROUND.state ? GROUND.state() : null;
    return s ? { city: s.city, lat: s.lat } : null;
  }
  /* 此刻画面里最亮、且真在画面里的那颗；拿不到就返回 null，话题自己作废 */
  function starFact() {
    var p = pickStar(); if (!p) return null;
    var info = window.GX && GX.starInfo ? GX.starInfo(p.i) : null;
    return { i: p.i, name: zh(p.i), con: info && info.con ? info.con : null, mag: p.mag,
             alt: p.alt, az: p.az, x: p.x, y: p.y, pc: p.pc, visible: p.visible };
  }
  function factCount() { var v = visAt(bNow()), d = visAt(1); return v === null || d === null ? null : { now: v, dark: d, b: bNow() }; }
  function splitFact() { return window.GROUND && GROUND.splitInfo ? GROUND.splitInfo() : null; }
  /* 一句话 + 最多两个按钮；开口这件事永远配一次移动，又静又站着的才是摆件 */
  function speak(txt, chips, hold, emo, st, move) {
    if (move !== false) { var q = roamTarget(); if (q) flyTo(q.x, q.y); }
    setState(st || 'idle', hold || 9); setEmotion(emo || 'happy');
    if (!chips || !chips.length) { say(txt, null, null, hold || 9); return; }
    if (chips.length > 1) say(txt, chips[0].label, chips[0].act, hold || 9, chips[1].label, chips[1].act);
    else say(txt, chips[0].label, chips[0].act, hold || 9);
  }
  function answered() { TALK.answered++; }
  function findTopic(id) { for (var i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i]; return null; }
  function fireTopic(t) {
    var txt = null, chips = null;
    try { txt = t && t.ok() ? t.text() : null; } catch (e) { return false; }
    if (!txt) return false;
    try { chips = t.chips ? t.chips() : null; } catch (e2) { chips = null; }
    TALK.fired++; TALK.lastId = t.id; if (t.ask) TALK.asked++;
    speak(txt, chips, t.ask ? 22 : 13, t.ask ? 'happy' : 'think', t.ask ? 'wave' : 'idle', true);
    return true;
  }
  function talkNow(id) { var t = findTopic(id); return !!t && fireTopic(t); }
  function nextTopic() {
    if (!TALK.order.length) {
      TALK.order = [];
      for (var i = 0; i < TOPICS.length; i++) TALK.order.push(i);
      for (var j = TALK.order.length - 1; j > 0; j--) {          /* 洗牌：别按固定顺序背台词 */
        var k = Math.floor(Math.random() * (j + 1)), tmp = TALK.order[j];
        TALK.order[j] = TALK.order[k]; TALK.order[k] = tmp;
      }
    }
    for (var n = 0; n < TOPICS.length; n++) {
      var idx = TALK.order.shift(); TALK.order.push(idx);
      var t = TOPICS[idx];
      if (!t || t.id === TALK.lastId) continue;
      var okv = false; try { okv = !!t.ok(); } catch (e) { okv = false; }
      if (okv) return t;
    }
    return null;
  }
  /* 用户对真控件做了事 → 接话（3.5 秒内不叠加，语泡占着就先排队，最长留 4 秒） */
  function reactWith(build) {
    if (!alive || sceneBusy()) return;
    if (stopIdx >= 0 && stopIdx < 4 && !stopComplete) return;    /* 带飞的话轮不到我插 */
    var d = null; try { d = build(); } catch (e) { return; }
    if (!d || !d.txt) return;
    if (performance.now() - REACT.last < 3500) { REACT.pend = d; return; }
    REACT.last = performance.now(); REACT.pend = null; REACT.fired++;
    speak(d.txt, d.chips, d.hold || 10, d.emo || 'happy', d.st || 'idle', d.move !== false);
  }
  function reactCity() {
    reactWith(function () {
      var c = cityTxt(); if (!c) return null;
      var fc = factCount(); if (!fc) return null;
      return { txt: '换到' + c.city + '：头顶现在是 ' + fmt(fc.now) + ' 颗（暗空同刻 ' + fmt(fc.dark) + ' 颗）。要我把今晚第一颗也换成这儿的星吗？',
               chips: [{ label: '就讲这颗', act: function () { answered(); talkNow('star', 1); } },
                       { label: '给我核对卡', act: function () { answered(); talkNow('falsify', 1); } }] };
    });
  }
  function reactHour() {
    reactWith(function () {
      var h = hourTxt(); if (h === null) return null;
      var f = starFact(); if (!f) return null;
      return { txt: '夜里 ' + h + '：' + f.name + ' 在' + altw(f.alt) + '、方位 ' + Math.round(f.az) + '°。这个钟点抬头，先找它。',
               chips: [{ label: '跟我去看看', act: function () { answered(); narrate({ kind: 'star', i: f.i }); } }] };
    });
  }
  function reactMode() {
    reactWith(function () {
      if (isGround()) {
        var fc = factCount();
        return { txt: '回到地面了。' + (fc ? '按 Bortle ' + fc.b + ' 算，头顶 ' + fmt(fc.now) + ' 颗。' : '') + '点天上的星我就讲它的真实数据。',
                 st: 'happy', emo: 'happy' };
      }
      return { txt: '到上面这个视角看的是整片天，不是「你抬头能看见几颗」——要数星，落回地面才有意义。',
               chips: [{ label: '站回地面', act: function () { answered(); markDrive(2600); clickEl($('modeBtn')); } }] };
    });
  }
  function reactSec(sec) {
    reactWith(function () {
      var n = SEC_REACT[sec];
      return n ? { txt: '你打开了「' + n[0] + '」——' + n[1], chips: n[2] ? [{ label: n[2], act: n[3] }] : null } : null;
    });
  }
  function reactSplit() {
    reactWith(function () {
      var si = splitFact(); if (!si) return null;
      return { txt: si.on ? '缝左边 Bortle ' + si.dark + ' 暗空 ' + fmt(si.darkVisible) + ' 颗，右边 Bortle ' + si.bortle +
        ' 城市 ' + fmt(si.nowVisible) + ' 颗。差的 ' + fmt(Math.max(0, si.darkVisible - si.nowVisible)) + ' 颗就是灯吃掉的。' :
        '分界合上了。再拉开一次，同一片天两个世界并排给你看。',
               chips: [{ label: '拖到中间', act: function () { answered(); pushSplit(0.5); } }] };
    });
  }
  function reactPanelClose() {
    reactWith(function () { return { txt: '面板收了，天又空出来一大片。我接着在这儿飘着，随时点我。', move: true }; });
  }
  /* 代用户拨真控件（走各控件自己的 input/change 事件路径，读数由内核重算） */
  function pushHour(delta) {
    var hr = $('hourRange'); if (!hr) return;
    markDrive(2600);
    var lo = parseFloat(hr.min || '18'), hi = parseFloat(hr.max || '24'), step = parseFloat(hr.step || '0.5');
    var to = clamp(Math.round((+hr.value + delta) / step) * step, lo, hi);
    hr.value = String(to);
    try { hr.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
    reactHour();
  }
  function pushSplit(x) {
    var si = splitFact(); if (!si) return;
    markDrive(2600);
    if (!si.on) clickEl($('btnSplit'));
    if (window.GROUND && GROUND.setSplit) { GROUND.setSplit(true, x); reactSplit(); }
  }
  function verifyGo() {
    answered();
    ensureScene('light', function () {
      var v = verifyNow();
      if (!v) { clickEl($('btnVerify')); }
      aimTo($('verifyCard') || $('m1Record'),
        '核对卡在这儿：把出门数到的颗数填进「实测颗数」，选好云量和月亮，点「记录并判定」。±' + M1.TOL +
        ' 颗算吻合——这条预测就能被你的眼睛证实或推翻。');
    });
  }
  /* 选一条真控件飞过去讲（aim 自己会先把它滚进视野，再让位到空处） */
  function aimTo(node, msg, label, fn) { if (!node) return; aim(node, msg, label, fn, 14); }

  var SEC_REACT = {
    light: ['光害', '这条杆是全站唯一的自变量：推一格，星数立刻重算。', '把灯拧暗两档', function () { answered(); var b = bNow(); tweenBortle(Math.max(1, b - 2), bortleReact); }],
    ask: ['星问', '这一节可以直接问我问题，用的是同一套星表——不用换个工具。', null, null],
    find: ['找星', '清单是按当前 Bortle 现算的，不是抄一份固定的。', null, null],
    data: ['数据', '图和读数都来自 HYG v4.0，点一下就能看到那颗的实测量。', null, null],
    act: ['行动', '这里给的是能被自己验证的行动，不是口号。', '给我核对卡', verifyGo],
    poem: ['意象归天', '诗单不产生数据，看完记得回到星数这边。', null, null],
    solar: ['太阳系', '这是上帝视角；数星还得落回地面。', null, null]
  };

  /* 漫游目的地：优先飞到「此刻真在画面里的一颗星」旁边，其次按比例站位；每条都过真实剪影解算 */
  function roamTarget() {
    var av = uiAvoid(), cands = [], i;
    var p = Math.random() < 0.55 ? pickStar() : null;
    if (p) cands.push({ x: p.x + (p.x > W * 0.5 ? -130 : 130), y: p.y - 74 });
    for (i = 0; i < SPOTS.length; i++) cands.push({ x: W * SPOTS[i][0], y: H * SPOTS[i][1] });
    for (i = 0; i < cands.length; i++) {
      var q = placeBody(cands[i].x, cands[i].y, av);
      if (overlapsAny(footRect(q.x, q.y), av) || !inFrame(footRect(q.x, q.y))) continue;  /* 退让后仍不干净：这条作废 */
      if (Math.hypot(q.x - nav.tx, q.y - nav.ty) < 120) continue;   /* 换向要有意义，别原地抖 */
      return q;
    }
    return null;
  }

  /* 话题牌：每张都要么成立（ok 取到真实读数）要么作废，文案里的数现场算 */
  var TOPICS = [
    { id: 'ask', ask: true, ok: function () { return isGround() && !!factCount(); },
      text: function () { return '问你个事：你更想先弄明白哪一头——今晚抬头真能找到几颗星，还是这套数字到底能不能被推翻？'; },
      chips: function () {
        return [{ label: '今晚看什么', act: function () { answered(); talkNow('star'); } },
                { label: '能不能推翻', act: function () { answered(); talkNow('falsify'); } }];
      } },
    { id: 'star', ok: function () { return isGround() && !!starFact(); },
      text: function () {
        var f = starFact();
        return '我在天上转了一圈：这会儿最亮的是' + f.name + (f.con ? '（' + f.con + '）' : '') + '，视星等 ' + f.mag.toFixed(2) +
          '，面向' + azn(f.az) + ' ' + Math.round(f.az) + '°、' + altw(f.alt) + '（高度 ' + Math.round(f.alt) + '°）。';
      },
      chips: function () { var f = starFact(); return f ? [{ label: '跟我去看看', act: function () { answered(); narrate({ kind: 'star', i: f.i }); } }] : null; } },
    { id: 'count', ok: function () { return !!factCount(); },
      text: function () {
        var fc = factCount();
        return '现在 Bortle ' + fc.b + '，头顶 ' + fmt(fc.now) + ' 颗；同一片天在暗空 Bortle 1 有 ' + fmt(fc.dark) +
          ' 颗。差的 ' + fmt(Math.max(0, fc.dark - fc.now)) + ' 颗不是搬走了，是被灯盖住了。';
      },
      chips: function () { var fc = factCount(); return fc && fc.b > 2 ? [{ label: '把灯拧回 2', act: function () { answered(); tweenBortle(2, bortleReact); } }] : null; } },
    { id: 'falsify', ok: function () { return isGround() && (!!verifyNow() || !!starFact()); },
      text: function () {
        var v = verifyNow();
        var fw = (window.GROUND && GROUND.fistWidth) ? GROUND.fistWidth() : 10;
        if (v) return '我敢留一句能被你亲眼推翻的话：以' + zh(v.anchor) + ' 为心、一臂握拳一拳宽（约 ' + fw + '°）里，按 Bortle ' + v.bortle +
          ' 该有 ' + v.count + ' 颗肉眼可见。你出门数一遍，对不上就回来推翻它。';
        var f = starFact();
        var wc = f && window.GROUND && GROUND.windowCount ? GROUND.windowCount(f.i) : null;
        return wc ? '留一句可核对的话：' + f.name + ' 周围一拳宽（' + fw + '°）里，此刻按 Bortle ' + wc.bortle + ' 该有 ' + wc.count +
          ' 颗。你数出来不是这个数，就告诉我。' : null;
      },
      chips: function () { return [{ label: '给我核对卡', act: verifyGo }]; } },
    { id: 'city', ok: function () { var c = cityTxt(); return !!(c && c.city) && !!factCount(); },
      text: function () {
        var c = cityTxt(), fc = factCount();
        return '现在这套数是按' + c.city + '（北纬 ' + Math.abs(c.lat).toFixed(1) + '°）算的，头顶 ' + fmt(fc.now) +
          ' 颗。城市一换星数立刻跟着变——你更想按哪个城市抬头？';
      },
      chips: function () { return [{ label: '换个城市', act: function () { answered(); aimTo($('citySel'), '就是这一排：选一个城市，我立刻把那一刻的星数报给你。'); } }]; } },
    { id: 'hour', ok: function () { return isGround() && hourTxt() !== null && !!starFact(); },
      text: function () {
        var f = starFact();
        return '此刻是夜里 ' + hourTxt() + '，' + f.name + ' 在' + altw(f.alt) + '。夜再深两小时它会往西边走，头顶换一批星。';
      },
      chips: function () { return [{ label: '推后两小时', act: function () { answered(); pushHour(2); } }]; } },
    { id: 'split', ok: function () { return isGround() && !!splitFact(); },
      text: function () {
        var si = splitFact();
        return si.on ? '缝左边是 Bortle ' + si.dark + ' 的暗空（' + fmt(si.darkVisible) + ' 颗），右边是 Bortle ' + si.bortle +
          ' 的城市（' + fmt(si.nowVisible) + ' 颗）。拖那个把手，缝就跟着手走。' :
          '同一片天我能一次给你两个世界：左边暗空、右边你现在的城市。拉开它看看差多少颗。';
      },
      chips: function () {
        var si = splitFact();
        return [{ label: si.on ? '合上分界' : '拉开分界', act: function () { answered(); markDrive(2200); clickEl($('btnSplit')); reactSplit(); } }];
      } },
    { id: 'tour', ok: function () { return isGround(); },
      text: function () {
        return stopIdx >= 4 ? '航线走过一回了。想再看一遍就点下面这个；不想一站站走，直接点天上的星我也讲。' :
          '页面上那几个真控件——光害滑杆、今晚第一颗、两片天、可证伪核对——我可以带你挨个动一遍，四站就懂这个模型在说什么。';
      },
      chips: function () {
        return stopIdx >= 4 ? [{ label: '跳到下一站', act: function () { answered(); startTour((lastStop + 1) % 4); } }] :
                             [{ label: '带我飞一遍', act: function () { answered(); startTour(0); } }];
      } }
  ];
  /* 统一的起飞口：问候气泡、航线条按钮、点角色重新给入口，三处都走这里 */
  function startTour(i) {
    stripOn = true; plan.classList.add('on'); enterStop(typeof i === 'number' ? i : 0);
  }
  function planBuild() {
    for (var i = 0; i < STOP_NAMES.length; i++) {
      (function (n) {
        var b = document.createElement('button'); b.type = 'button';
        b.setAttribute('role', 'tab'); b.textContent = (n + 1) + ' ' + STOP_NAMES[n];
        b.addEventListener('click', function () { startTour(n); });
        plan.appendChild(b);
      })(i);
    }
    var f = document.createElement('button'); f.type = 'button'; f.id = 'xzPlanFree'; f.textContent = '自由领航';
    f.addEventListener('click', function () { stripOn = true; plan.classList.add('on'); finishTour(); });
    plan.appendChild(f);
  }
  function planSync() {
    var bs = plan.children;
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.toggle('done', i < 4 && !!stopDone[i]);
      bs[i].classList.toggle('cur', i === stopIdx || (i === 4 && free && stopIdx >= 4));
    }
  }
  function enterStop(i) {
    if (!window.GX || !GX.mode) return;
    stopIdx = i; lastStop = i; stopComplete = false; advancing = false; free = false;
    if (stopIdx === 0) stopLight();
    else if (stopIdx === 1) stopFirst();
    else if (stopIdx === 2) stopSplit();
    else if (stopIdx === 3) stopVerify();
    planSync();
  }
  function advanceIf(i) { if (stopIdx === i && !stopComplete) completeStop(); }
  function completeStop() {
    if (stopComplete || stopIdx < 0 || stopIdx > 3) return;
    stopComplete = true; stopDone[stopIdx] = true; planSync();
    setState('celebrate', 1.6); setEmotion('excited'); spawnSparks(20, hex2rgb('#e8b654'), 2.4);
    advancing = true;
    var from = stopIdx;
    setTimeout(function () {
      advancing = false;
      if (stopIdx !== from) return;                 /* 期间用户已手动跳站，就不抢方向盘 */
      if (from < 3) enterStop(from + 1); else finishTour();
    }, from === 3 ? 5200 : 1600);
  }
  function finishTour() {
    stopIdx = 4; free = true; spotEl = null; beamIdx = -1; planSync();
    setState('happy', 2); setEmotion('happy');
    flyTo(W * 0.5, H * 0.34);
    say('航线飞完。现在指哪讲哪：点天上任意一颗星，我飞过去把它的真实数据讲给你；点我，我就跟你唠两句。', null, null, 13);
  }

  function stopLight() {
    lead('第一站：光害滑杆。把天空压成现在这个样子的，就是这条杆。');
    ensureScene('light', function () {
      var sl = $('bortle');
      if (!sl) { say('没找到光害滑杆，这一站先跳过。', null, null, 5); completeStop(); return; }
      var b = bNow();
      if (b <= 3) aim(sl, '现在是 Bortle ' + b + '，接近暗空档：头顶可见 ' + fmt(visAt(b)) + ' 颗。把它推回 8，看城市怎么一口口把星吃掉。', '推回城市档 8', function () { tweenBortle(8, function () { bortleReact(); advanceIf(0); }); }, 13);
      else aim(sl, 'Bortle ' + b + '：头顶只剩 ' + fmt(visAt(b)) + ' 颗，而暗空本来有 ' + fmt(visAt(1)) + ' 颗。拖它，星一颗颗回来。', '帮我拖到 2', function () { tweenBortle(2, function () { bortleReact(); advanceIf(0); }); }, 13);
    });
  }
  function stopFirst() {
    lead('第二站：今晚抬头真能找到的第一颗星。不是我挑好看的，是此刻此地真在天上、且真的看得见的。');
    ensureScene(null, function () {
      var t = pickStar();
      if (!t) { say('最亮那几颗这会儿都在画面外（或被面板压住）。拖一下天空转个方向，或把光害调暗一档，我再指。', null, null, 8); completeStop(); return; }
      beamIdx = t.i; beamT = performance.now();
      flyTo(t.x + (t.x > W * 0.5 ? -110 : 100), t.y - 62);
      setState('guide', 8); setEmotion('think');
      say('今晚先找 ' + zh(t.i) + '：视星等 ' + t.mag.toFixed(2) + '，面向' + azn(t.az) + ' ' + Math.round(t.az) +
        '°、抬头到' + altw(t.alt) + '（高度 ' + Math.round(t.alt) + '°）。我在画面里把它圈出来了，你抬头对方向就行。',
        '记住它', function () { markIt(t.i); advanceIf(1); }, 14);
    });
  }
  function stopSplit() {
    lead('第三站：同一片天，两个世界。');
    ensureScene(null, function () {
      var openIt = function () {
        var grip = document.querySelector('#splitBar .grip');
        if (!grip || !window.GROUND || !GROUND.splitInfo) { say('分界线没能拉开，这一站先跳过。', null, null, 5); completeStop(); return; }
        var si = GROUND.splitInfo(), r = rectOf(grip);
        spotEl = null; beamIdx = -1;
        if (r) flyTo(clamp(r.x - 150, 52, W - 52), clamp(H * 0.42, 68, H - 100));
        spotEl = grip; setState('guide', 8); setEmotion('think');
        say('缝的左边是 Bortle ' + si.dark + ' 的暗空（' + fmt(si.darkVisible) + ' 颗），右边是你此刻的 Bortle ' +
          si.bortle + '（' + fmt(si.nowVisible) + ' 颗）。拖一拖那个把手，缝就跟着你的手走——差的每一颗都是灯吃掉的。',
          '完成对比', function () { advanceIf(2); }, 14);
      };
      if (!window.GROUND || !GROUND.splitInfo) { say('地面星图没就绪，这一站先跳过。', null, null, 5); completeStop(); return; }
      if (!GROUND.splitInfo().on) {
        clickEl($('btnSplit'));
        when(function () { return GROUND.splitInfo().on; }, openIt);
      } else openIt();
    });
  }
  function stopVerify() {
    lead('最后一站：可证伪核对。我让模型说一句能被你亲眼推翻的话。');
    ensureScene('light', function () {
      var v = verifyNow();
      if (!v) { clickEl($('btnVerify')); v = verifyNow(); }
      if (!v) { say('这一局算不出可核对的锚星：把光害调暗一档或换个时刻再试。这本身也是一条核对结果。', null, null, 8); completeStop(); return; }
      var pr = pickInfo(v.anchor);
      beamIdx = pr ? v.anchor : -1; beamT = performance.now();
      /* 数法里的两个数（暗适应下限、判定带）只能从 M1 内核取，不许在解说里再抄一遍：
         这里曾写死「10 分钟」，而内核按 ≥20 分钟闸门——领航员教的口径比协议松一半，
         照着它数完再回填，会被自己的内核判成「条件不足」。口径只有一处定义才不会被复制走样。 */
      aim($('verifyCard') || $('m1Record'),
        '以 ' + zh(v.anchor) + ' 为心、一臂握拳一拳宽（约 ' + ((window.GROUND && GROUND.fistWidth) ? GROUND.fistWidth() : 10) + '°）的天区：模型预测此刻肉眼可见 ' + v.count + ' 颗（含它本身；按 Bortle ' +
        v.bortle + ' · 极限星等 ' + v.limit.toFixed(1) + ' 算）。数法：裸眼、先暗适应 ' + M1.DARK_MIN + ' 分钟、只数窗口内、±' + M1.TOL + ' 颗算吻合。',
        '去填实测', function () {
          var rec = $('m1Record');
          aim(rec, '把出门数到的颗数填进「实测颗数」，再选当晚云量和月亮，点「记录并判定」。判定用同一套 ±' + M1.TOL +
            ' 协议，只存在你本机；这条预测就能被你自己的眼睛证实或推翻。',
            null, null, 13);
          var a = $('m1Actual'); if (a) { try { a.focus(); } catch (e) {} }
        }, 16);
    });
  }

  /* ---------- M1 判定联动（app.js 的 setVerdict 调用；不在此重写容差） ---------- */
  function onVerdict(code, diff) {
    if (!alive) return;
    if (code === 'confirm') {
      setState('celebrate', 2.4); setEmotion('excited'); spawnSparks(26, hex2rgb('#7fe08a'), 2.8);
      say('吻合（差 ' + Math.abs(diff) + ' 颗）！这条预测扛住了你的实测。可证伪，且暂时没被推翻——这就是它值钱的地方。', null, null, 8);
      advanceIf(3);
    } else if (code === 'falsify') {
      setState('think', 2.6); setEmotion('think');
      say('被这次实测推翻了（差 ' + Math.abs(diff) + ' 颗）。不气馁：记下偏差、查是光害等级选错还是位置有遮挡、修正模型、再测一轮——这正是可证伪的意义。', null, null, 9);
      advanceIf(3);
    } else if (code === 'invalid_cond') {
      setState('think', 2.4); setEmotion('think');
      say('观测条件不达标（有云或有月），这次计数不可比、不算数。换个无月晴夜再数一遍，我再给一次判定。', null, null, 8);
      advanceIf(3);
    } else {
      say('实测颗数还没填进去，这次判定不作数。数完再回来，我等你。', null, null, 7);
    }
  }

  /* ---------- 让路规则：用户操作控件时，领航员挪开并缩小 ---------- */
  /* 让路的临时缩小和自适应缩位是同一条通道（nav.size）：谁小听谁的。
     松手后必须回到「自适应档位」而不是写死满尺寸——界面正挤着的时候抹掉让步，
     角色一变大就又压回内容上，等于把用户刚抱怨的那件事自己复现一遍。 */
  function yieldOn() { yielding = true; flyTo(W * 0.84, H * 0.22); if (sq > 0.8) nav.size = 0.8; }
  function yieldOff() { setTimeout(function () { yielding = false; nav.size = sq; }, 700); }
  function yieldBind(node) {
    if (!node) return;
    node.addEventListener('pointerdown', yieldOn);
    node.addEventListener('pointerup', yieldOff);
    node.addEventListener('pointercancel', yieldOff);
  }
  yieldBind($('bortle')); yieldBind($('hourRange')); yieldBind($('m1Actual'));
  yieldBind(document.querySelector('#splitBar .grip'));
  var sl0 = $('bortle');
  if (sl0) sl0.addEventListener('input', function () { if (selfDrive) return; bortleReact(); advanceIf(0); });
  var grip0 = document.querySelector('#splitBar .grip');
  if (grip0) grip0.addEventListener('pointermove', function () { advanceIf(2); });

  /* ---------- 接话：用户动了真控件，领航员必须接得住（这些监听只读，不拦事件、不改状态） ---------- */
  (function bindReact() {
    var hr = $('hourRange');
    if (hr) hr.addEventListener('input', function () { if (driving()) return; reactHour(); });
    var cs = $('citySel');
    if (cs) cs.addEventListener('change', function () { markDrive(1800); when(function () { return !!cityTxt(); }, reactCity, 0, 60); });
    var mb = $('modeBtn');
    /* 幕切换的接话要等转场结束再说，但「等不到」不能等于「永远不说」：
       旧预算 90 次 ≈10.8 秒，软件渲染实测幕间淡出能超过它，到期这条反应被静默丢掉——
       用户拨的是真控件，却一句话都没有。预算抬到 200 次 ≈24 秒，
       判据不变（转场一结束立刻接话），只把「慢环境」从丢话变成迟到。 */
    if (mb) mb.addEventListener('click', function () { if (driving()) return; when(function () { return !sceneBusy(); }, reactMode, 0, 200); });
    var sp = $('btnSplit');
    if (sp) sp.addEventListener('click', function () { if (driving()) return; reactSplit(); });
    var pc = $('panelClose');
    if (pc) pc.addEventListener('click', function () { if (driving()) return; reactPanelClose(); });
    var nb = document.querySelectorAll('#nav button');
    for (var i = 0; i < nb.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          if (driving()) return;
          var sec = b.getAttribute('data-sec');
          when(function () { var p = $('panel'); return p && p.classList.contains('open'); }, function () { reactSec(sec); }, 0, 60);
        });
      })(nb[i]);
    }
  })();

  /* ---------- 指哪讲哪 ---------- */
  var prevSelect = window.GX ? GX.onSelect : null;
  if (window.GX) {
    GX.onSelect = function (best) {
      if (prevSelect) prevSelect(best);
      narrate(best);
    };
  }
  function narrate(best) {
    if (!best || best.kind !== 'star' || !free || !isGround() || sceneBusy()) return;
    var p = pickInfo(best.i);
    if (!p) { setState('think', 2); setEmotion('think'); say(zh(best.i) + ' 这会儿在地平线下或画面外——把天空转个方向，或等它升起来。', null, null, 7); return; }
    beamIdx = best.i; beamT = performance.now(); spotEl = null;
    flyTo(p.x + (p.x > W * 0.5 ? -110 : 100), p.y - 62);
    setState('guide', 6); setEmotion('think');
    if (stopIdx === 1) advanceIf(1);
    var ly = (p.pc * 3.26156).toFixed(1);
    say(zh(best.i) + '：视星等 ' + p.mag.toFixed(2) + '，距离约 ' + ly + ' 光年（HYG v4.0 实测）。此刻方位' +
      azn(p.az) + ' ' + Math.round(p.az) + '° / 高度 ' + Math.round(p.alt) + '°，' + (p.visible ? '在 Bortle ' + bNow() + ' 下真能看见。' :
      '在 Bortle ' + bNow() + ' 下已被灯光压住——把光害调暗一档它就回来了。'), '记住它', function () { markIt(best.i); }, 11);
  }
  /* 点空白天区：不编故事，只报「这附近画面里还有几颗此刻可见的星」 */
  var cCv = $('c'), downPt = null;
  if (cCv) {
    cCv.addEventListener('pointerdown', function (e) { downPt = { x: e.clientX, y: e.clientY }; });
    cCv.addEventListener('pointerup', function (e) {
      if (!downPt) return;
      var moved = Math.abs(e.clientX - downPt.x) + Math.abs(e.clientY - downPt.y);
      downPt = null;
      if (moved > 8 || !free || !isGround() || sceneBusy()) return;
      var G = window.GROUND; if (!G || !G.pick || !G.screenOf) return;
      if (G.pick(e.clientX, e.clientY)) return;                    /* 命中星：交给 onSelect 讲，不重复 */
      var cnt = 0, list = G.brightest(40);
      for (var i = 0; i < list.length; i++) {
        var q = G.screenOf(list[i].i);
        if (q && q.front && Math.abs(q.x - e.clientX) < W * 0.12 && Math.abs(q.y - e.clientY) < H * 0.16) cnt++;
      }
      flyTo(e.clientX + (e.clientX > W * 0.5 ? -90 : 90), e.clientY - 56);
      setState('think', 2.2); setEmotion('think');
      say(cnt ? '这里没正好被你点中的星——这附近画面里还有 ' + cnt + ' 颗此刻可见的亮星，再点一下我就讲。' :
        '这附近没有亮于 ' + (limitOf(bNow()) === null ? '—' : limitOf(bNow()).toFixed(1)) + ' 等的星：城市天空的正常结果。把光害调低一档，暗星会浮出来。', null, null, 7);
    });
  }
  chip.addEventListener('click', function () { if (chipAct) chipAct(); });
  chip2.addEventListener('click', function () { if (chipAct2) chipAct2(); });
  /* 点我的每一次回应都要带「下一步」；而且连着点要像对话一样往前推：
     第一下报现状，第二下反问你，第三下就把你带到具体那颗星或核对卡前面。 */
  /* ---------- 直接操控：按住就能拎走 ----------
     位移 >10px 认定为「拖」：一路 flyTo 跟手，落点仍由同一套避让解算，所以拎不进浮层、也拎不出页面；
     按住不动 ≥650ms 认定为「召唤」：打开隐秘导演台。两者都吞掉紧随其后的 click，不会顺带触发对话。
     move/up 只在按住期间挂到 window：角色只有 96px 的点击层，手快一点就出去了，
     绑在自己身上会跟丢（指针捕获能补，但捕获失败时不能退化成「拖不动」）。 */
  var pressPt = null, pressT = 0, pressMoved = 0, suppressUntil = 0;
  function onDragMove(e) {
    if (!pressPt) return;
    pressMoved += Math.abs(e.clientX - pressPt.x) + Math.abs(e.clientY - pressPt.y);
    pressPt = { x: e.clientX, y: e.clientY };
    if (!dir.drag && pressMoved > 10) {
      dir.drag = true; markDrive(2600);
      spotEl = null; beamIdx = -1;                          /* 正指着控件也得放手：用户接管了方向盘 */
      capTarget = 0; cap.style.display = 'none';
    }
    if (dir.drag) flyTo(e.clientX, e.clientY);
  }
  function endPress() {
    if (!pressPt) return;
    var held = performance.now() - pressT, wasDrag = dir.drag;
    pressPt = null; dir.drag = false;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endPress);
    window.removeEventListener('pointercancel', abortPress);
    if (wasDrag) {
      suppressUntil = performance.now() + 400;
      setState('happy', 1.2); setEmotion('happy');
      say('就停这儿。想一路跟着你的手，按住我拖就行。', null, null, 6);
    } else if (held >= 650) {
      suppressUntil = performance.now() + 400;
      toggleDir(true);
    }
  }
  function abortPress() {
    pressPt = null; dir.drag = false;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endPress);
    window.removeEventListener('pointercancel', abortPress);
  }
  hit.addEventListener('pointerdown', function (e) {
    if (!alive || sceneBusy()) return;
    pressPt = { x: e.clientX, y: e.clientY }; pressT = performance.now(); pressMoved = 0;
    dir.drag = false;
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endPress);
    window.addEventListener('pointercancel', abortPress);
    if (e.pointerType !== 'mouse') e.preventDefault();      /* 触屏：按住角色不许顺手滚页 */
  });

  var petSeq = 0;
  hit.addEventListener('click', function () {
    if (performance.now() < suppressUntil) return;
    spawnSparks(12, hex2rgb('#ff5fa8'), 2);
    setEmotion('happy');
    /* 带飞途中：先把「这一站是什么 + 不想一站站走怎么办」给足 */
    if (stopIdx >= 0 && stopIdx < 4 && !stopComplete) {
      setState('pet', 1.2);
      say('这一站是「' + STOP_NAMES[stopIdx] + '」：照我说的动一下那个控件就行。不想一站站走，点下面这个我直接飞完。',
        '跳到下一站', function () { if (stopIdx < 3) enterStop(stopIdx + 1); else finishTour(); }, 9);
      return;
    }
    petSeq++;
    if (petSeq === 2) {
      setState('wave', 1.6);
      /* 第二下反问：话题成立就开问，不成立（例如没在地面幕）就退回讲星或带飞，绝不哑掉 */
      if (!fireTopic(findTopic('ask'))) talkNow(starFact() ? 'star' : 'tour');
      return;
    }
    if (petSeq >= 3) {
      petSeq = 0;
      var f = starFact();
      if (f && isGround()) { setState('happy', 1.6); TALK.fired++; narrate({ kind: 'star', i: f.i }); return; }
      setState('wave', 1.6); talkNow('tour'); return;
    }
    setState('pet', 1.2);
    speak('蹭了蹭你。现在 Bortle ' + bNow() + '，头顶 ' + fmt(visAt(bNow())) + ' 颗星。',
          [{ label: '带我飞一遍', act: function () { answered(); startTour(0); } },
           { label: '今晚看什么', act: function () { answered(); talkNow('star'); } }], 9, 'happy', 'pet');
  });

  /* ---------- 何时不出现：片头 / 幕间 / 星际穿越 / 找星进行中 / 致命错误 ---------- */
  function sceneBusy() {
    var v = $('veil'), f = $('fatal'), hh = $('huntHud');
    if (f && f.style.display === 'block') return true;
    if (window.__SIDERA_INTRO__) return true;
    if (window.WARP && WARP.active && WARP.active()) return true;
    if (window.GX && GX.huntState) { var hs = GX.huntState(); if (hs && hs.show) return true; }
    if (v && parseFloat(getComputedStyle(v).opacity) > 0.05) return true;
    if (hh && hh.classList.contains('show')) return true;
    return false;
  }
  function introGone() {
    var f = $('introFade');
    return !f || parseFloat(getComputedStyle(f).opacity) < 0.05;
  }

  /* ---------- 角色网格与渲染（与已批准形象同一套数学，逐行同源移植） ---------- */
  function buildMesh() {
    var L = 64, Rr = 12, T = 0.62, rin = 0.66, i, j;
    function radAt(a) { var w = 0.5 + 0.5 * Math.cos(5 * a); return rin + (1 - rin) * Math.pow(w, 1.0); }
    function scAt(t) { return Math.pow(Math.sin(Math.PI * t), 0.62); }
    var verts = [], idx = [];
    for (j = 0; j <= Rr; j++) {
      var t = j / Rr, sc = scAt(t), z = -T + 2 * T * t; idx[j] = [];
      for (i = 0; i < L; i++) {
        var a = i / L * TAU, rad = radAt(a) * sc;
        idx[j][i] = verts.length; verts.push({ x: rad * Math.sin(a), y: rad * Math.cos(a), z: z });
      }
    }
    var quads = [];
    for (j = 0; j < Rr; j++) for (i = 0; i < L; i++) { var i2 = (i + 1) % L; quads.push([idx[j][i], idx[j][i2], idx[j + 1][i2], idx[j + 1][i]]); }
    var norms = []; for (i = 0; i < verts.length; i++) norms.push({ x: 0, y: 0, z: 0 });
    for (i = 0; i < quads.length; i++) {
      var qd = quads[i], va = verts[qd[0]], vb = verts[qd[1]], vc = verts[qd[2]], vd = verts[qd[3]];
      var ux = vb.x - va.x, uy = vb.y - va.y, uz = vb.z - va.z;
      var vx = vd.x - va.x, vy = vd.y - va.y, vz = vd.z - va.z;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var mx = (va.x + vb.x + vc.x + vd.x) / 4, my = (va.y + vb.y + vc.y + vd.y) / 4, mz = (va.z + vb.z + vc.z + vd.z) / 4;
      if (nx * mx + ny * my + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      for (var k = 0; k < 4; k++) { var nn = norms[qd[k]]; nn.x += nx; nn.y += ny; nn.z += nz; }
    }
    for (i = 0; i < norms.length; i++) {
      var n = norms[i], L2 = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
      n.x /= L2; n.y /= L2; n.z /= L2;
    }
    return { v: verts, n: norms, q: quads };
  }
  var MESH = buildMesh();
  function nrm3(v) { var l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
  var LKEY = nrm3({ x: 0.42, y: 0.60, z: 0.68 }), LFILL = nrm3({ x: -0.55, y: -0.25, z: 0.55 }),
      LRIM = nrm3({ x: -0.45, y: 0.20, z: -0.87 }), LHALF = nrm3({ x: 0.42, y: 0.60, z: 1.68 });
  var cx = 0, cy = 0;
  function view(p) {
    var cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp2 = Math.sin(cam.pitch);
    var x = p.x * cyw + p.z * syw, z = -p.x * syw + p.z * cyw;
    var y = p.y * cp - z * sp2, z2 = p.y * sp2 + z * cp;
    return { x: x, y: y, z: z2 };
  }
  function project(p) {
    var v = view(p), zc = cam.dist - v.z;
    if (zc < 0.6) return null;
    var f = focal / zc;
    return { x: cx + v.x * f, y: cy - v.y * f, f: f, d: zc };
  }
  function rotSpirit(p) {
    var sy = Math.sin(spirit.rotY), cyw = Math.cos(spirit.rotY), sz = Math.sin(spirit.rotZ), cz = Math.cos(spirit.rotZ);
    var x = p.x * cyw + p.z * sy, z = -p.x * sy + p.z * cyw;
    return { x: x * cz - p.y * sz, y: x * sz + p.y * cz, z: z };
  }
  function spiritWorld(p) {
    var s = S.scale * spirit.squash, sy2 = S.scale * (2 - spirit.squash);
    var r = rotSpirit({ x: p.x * s, y: p.y * sy2, z: p.z * s });
    return { x: r.x + spirit.pos.x, y: r.y + spirit.pos.y + spirit.hop, z: r.z + spirit.pos.z };
  }
  var bcan = document.createElement('canvas'), bctx = bcan.getContext('2d');

  /* 蓝圈只在「这颗星此刻真的挂在天上、而且真的被画出来了」时才画。
     用户报的「圈指的位置不对」根因就在这儿：beamIdx 一旦设上就永久有效，可天是会转的
     （用户拖动、手势转向、时间推进）。星落到地平线下、或被灯光压到极限星等之外以后，
     它的投影点照样可能落在画面里——压在城市剪影上，圈就变成了指着楼房/空处。
     可见性直接用 GROUND.whereIs 的 visible：那与着色器同一口径（极限星等 + 大气消光 + 地平线），
     不再另起一套判断。宇宙幕是另一套相机，地面投影在那儿没有意义，整段让位。 */
  function beamVisible() {
    if (beamIdx < 0 || !window.GROUND || !GROUND.whereIs) return false;
    if (window.GX && GX.mode && GX.mode() !== 'ground') return false;
    var w = GROUND.whereIs(beamIdx);
    return !!(w && w.visible);
  }
  function drawIndicators(now) {
    if (dir.spot && beamIdx >= 0 && window.GROUND && GROUND.screenOf && beamVisible()) {
      var p = GROUND.screenOf(beamIdx);
      if (p && p.front && p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20) {
        var pulse = reduced ? 0.5 : ((now - beamT) / 900) % 1;
        ctx.strokeStyle = 'rgba(169,200,255,' + (0.85 * (1 - pulse)).toFixed(3) + ')'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8 + pulse * 24, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(169,200,255,.9)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.stroke();
        var lg = ctx.createLinearGradient(nav.x, nav.y, p.x, p.y);
        lg.addColorStop(0, 'rgba(169,200,255,.5)'); lg.addColorStop(1, 'rgba(169,200,255,0)');
        ctx.strokeStyle = lg; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(nav.x, nav.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    }
  }

  function renderNav(now) {
    S.scale = 1.32 * nav.size;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    cx = nav.x; cy = nav.y + navBob();
    var hue = hex2rgb(S.hue), i;
    var c = project(spirit.pos);
    if (!reduced) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < trail.length; i++) {
        var tr = trail[i];
        ctx.globalAlpha = tr.life * 0.30; ctx.fillStyle = rgba(hue, 1);
        ctx.beginPath(); ctx.arc(tr.x, tr.y, 2.4 * tr.life, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      var sk = sparks[i];
      ctx.globalAlpha = Math.max(0, sk.life) * 0.85; ctx.fillStyle = rgba(sk.c, 1);
      ctx.beginPath(); ctx.arc(sk.x, sk.y, 2.2 * sk.life, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    var dim = spirit.emotion === 'sleep' ? 0.25 : 1;
    if (c) {
      var auraR = clamp(70 * S.scale * S.glow * (c.f / focal) * 3, 10, 240) * nav.size;
      var ag = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, auraR);
      ag.addColorStop(0, rgba(hue, 0.5 * S.glow * dim)); ag.addColorStop(1, rgba(hue, 0));
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(c.x, c.y, auraR, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = rgba(hue, 0.35 * dim); ctx.lineWidth = 1;
    ctx.beginPath(); var started = false;
    for (i = 0; i <= 40; i++) {
      var a = i / 40 * TAU + now / 1400;
      var op = project({ x: spirit.pos.x + Math.cos(a) * 1.7 * S.scale, y: spirit.pos.y + spirit.hop + Math.sin(a) * 0.5 * S.scale, z: spirit.pos.z + Math.sin(a) * 1.7 * S.scale });
      if (op) { if (!started) { ctx.moveTo(op.x, op.y); started = true; } else ctx.lineTo(op.x, op.y); }
    }
    ctx.stroke();
    /* 身体：面片排序 + 三光照明，超采样小画布再缩回，边缘才不毛糙 */
    var faces = [], mv = MESH.v, mn = MESH.n, mq = MESH.q, wv = [];
    for (i = 0; i < mv.length; i++) wv[i] = project(spiritWorld(mv[i]));
    for (i = 0; i < mq.length; i++) {
      var qd = mq[i], p0 = wv[qd[0]], p1 = wv[qd[1]], p2 = wv[qd[2]], p3 = wv[qd[3]];
      if (!p0 || !p1 || !p2 || !p3) continue;
      var n0 = mn[qd[0]], n1 = mn[qd[1]], n2 = mn[qd[2]], n3 = mn[qd[3]];
      var navg = { x: (n0.x + n1.x + n2.x + n3.x) / 4, y: (n0.y + n1.y + n2.y + n3.y) / 4, z: (n0.z + n1.z + n2.z + n3.z) / 4 };
      faces.push({ p: [p0, p1, p2, p3], d: (p0.d + p1.d + p2.d + p3.d) / 4, n: view(rotSpirit(navg)) });
    }
    faces.sort(function (a2, b2) { return b2.d - a2.d; });
    var bodyBase = hex2rgb(S.hue), emoDim = spirit.emotion === 'sleep' ? 0.5 : 1;
    /* 真实剪影外接框：摆放几何要用的就是这一框（身体面片 + 挥手时的手），不是拍脑袋的保护圆 */
    var boxX0 = 1e9, boxY0 = 1e9, boxX1 = -1e9, boxY1 = -1e9;
    var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (i = 0; i < wv.length; i++) {
      var bp = wv[i]; if (!bp) continue;
      if (bp.x < minX) minX = bp.x; if (bp.x > maxX) maxX = bp.x;
      if (bp.y < minY) minY = bp.y; if (bp.y > maxY) maxY = bp.y;
    }
    if (isFinite(minX) && isFinite(maxX)) {
      minX -= 3; minY -= 3; maxX += 3; maxY += 3;
      boxX0 = minX; boxY0 = minY; boxX1 = maxX; boxY1 = maxY;
      var bw = Math.max(2, maxX - minX), bh = Math.max(2, maxY - minY), SS = 3;
      bcan.width = Math.max(2, Math.ceil(bw * SS * DPR)); bcan.height = Math.max(2, Math.ceil(bh * SS * DPR));
      bctx.setTransform(SS * DPR, 0, 0, SS * DPR, -minX * SS * DPR, -minY * SS * DPR);
      for (i = 0; i < faces.length; i++) {
        var fc = faces[i], fn = fc.n;
        var nl = Math.sqrt(fn.x * fn.x + fn.y * fn.y + fn.z * fn.z) || 1;
        var nx = fn.x / nl, ny = fn.y / nl, nz = fn.z / nl;
        if (nz < -0.10) continue;
        var kd = Math.max(0, nx * LKEY.x + ny * LKEY.y + nz * LKEY.z);
        var fd = Math.max(0, nx * LFILL.x + ny * LFILL.y + nz * LFILL.z);
        var rd = Math.pow(Math.max(0, nx * LRIM.x + ny * LRIM.y + nz * LRIM.z), 2);
        var spc = Math.pow(Math.max(0, nx * LHALF.x + ny * LHALF.y + nz * LHALF.z), 18) * 0.12;
        var fz = Math.pow(1 - Math.max(0, nz), 3) * 0.10;
        var lum = (0.66 + 0.34 * kd + 0.12 * fd) * emoDim;
        var rr = clamp(bodyBase.r * (lum + fz) + 70 * rd + 230 * spc, 0, 255);
        var gg = clamp(bodyBase.g * (lum + fz) + 110 * rd + 222 * spc, 0, 255);
        var bb = clamp(bodyBase.b * (lum + fz) + 150 * rd + 198 * spc, 0, 255);
        var col = 'rgb(' + Math.round(rr) + ',' + Math.round(gg) + ',' + Math.round(bb) + ')';
        bctx.fillStyle = col; bctx.strokeStyle = col; bctx.lineWidth = 1;
        bctx.beginPath(); bctx.moveTo(fc.p[0].x, fc.p[0].y); bctx.lineTo(fc.p[1].x, fc.p[1].y);
        bctx.lineTo(fc.p[2].x, fc.p[2].y); bctx.lineTo(fc.p[3].x, fc.p[3].y); bctx.closePath();
        bctx.fill(); bctx.stroke();
      }
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bcan, minX, minY, bw, bh);
    }
    if (!c) return;
    var bR = c.f * S.scale;
    ctx.globalCompositeOperation = 'lighter';
    var hg = ctx.createRadialGradient(c.x - bR * 0.30, c.y - bR * 0.34, 0, c.x - bR * 0.30, c.y - bR * 0.34, bR * 0.62);
    hg.addColorStop(0, 'rgba(255,246,220,' + (0.20 * emoDim) + ')'); hg.addColorStop(1, 'rgba(255,246,220,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(c.x - bR * 0.30, c.y - bR * 0.34, bR * 0.62, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    var stt = spirit.state;
    if (stt === 'wave' || stt === 'pet' || stt === 'happy' || stt === 'celebrate') {
      var raiseL = 0, raiseR = 0;
      if (stt === 'wave') raiseR = 0.55 + 0.35 * Math.sin(now / 120);
      else if (stt === 'pet') { raiseL = 0.42; raiseR = 0.42; }
      else { raiseL = 0.25 + 0.2 * Math.abs(Math.sin(now / 180)); raiseR = raiseL; }
      var hands = [{ s: -1, raise: raiseL }, { s: 1, raise: raiseR }];
      for (var hI = 0; hI < 2; hI++) {
        var hd = hands[hI], hp = project(spiritWorld({ x: hd.s * 0.60, y: -0.80 + hd.raise, z: 0.30 }));
        if (!hp) continue;
        var hr = Math.max(2, 0.15 * hp.f * S.scale);
        if (hp.x - hr < boxX0) boxX0 = hp.x - hr;
        if (hp.x + hr > boxX1) boxX1 = hp.x + hr;
        if (hp.y - hr < boxY0) boxY0 = hp.y - hr;
        if (hp.y + hr > boxY1) boxY1 = hp.y + hr;
        var hgr = ctx.createRadialGradient(hp.x - hr * 0.35, hp.y - hr * 0.4, hr * 0.2, hp.x, hp.y, hr);
        hgr.addColorStop(0, 'rgb(' + Math.round(clamp(bodyBase.r * 1.2, 0, 255)) + ',' + Math.round(clamp(bodyBase.g * 1.18, 0, 255)) + ',' + Math.round(clamp(bodyBase.b * 1.12, 0, 255)) + ')');
        hgr.addColorStop(1, 'rgb(' + Math.round(clamp(bodyBase.r * 0.8, 0, 255)) + ',' + Math.round(clamp(bodyBase.g * 0.78, 0, 255)) + ',' + Math.round(clamp(bodyBase.b * 0.75, 0, 255)) + ')');
        ctx.fillStyle = hgr; ctx.beginPath(); ctx.arc(hp.x, hp.y, hr, 0, TAU); ctx.fill();
      }
    }
    /* 剪影像限交给摆放几何（+5 兜住呼吸起伏 navBob 的 ±4） */
    if (boxX1 > boxX0 && boxY1 > boxY0) {
      footRaw = { l: Math.max(8, cx - boxX0), r: Math.max(8, boxX1 - cx),
                  t: Math.max(8, cy - boxY0 + 5), b: Math.max(8, boxY1 - cy + 5) };
    }
    /* 脸：只在朝前时画，情绪无负面档（睡觉闭线 / 思考小口 / 高兴张嘴） */
    var frontN = rotSpirit({ x: 0, y: 0, z: 1 }), fv = view(frontN);
    if (fv.z <= 0.15) return;
    var fs = clamp(c.f / focal * 12, 0.6, 4) * S.scale, ex = c.x, ey = c.y;
    var blink = spirit.blink > 0 ? 0.15 : 1, emo = spirit.emotion;
    ctx.strokeStyle = '#201409'; ctx.lineWidth = 1.6 * fs; ctx.lineCap = 'round';
    var eyeY = ey - 5 * fs, eyeDX = 7.5 * fs;
    ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#ff5fa8';
    ctx.beginPath(); ctx.arc(ex - eyeDX - 3 * fs, eyeY + 6 * fs, 3.4 * fs, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + eyeDX + 3 * fs, eyeY + 6 * fs, 3.4 * fs, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#201409';
    if (emo === 'sleep' || spirit.blink > 0) {
      ctx.beginPath(); ctx.moveTo(ex - eyeDX - 3 * fs, eyeY); ctx.lineTo(ex - eyeDX + 3 * fs, eyeY);
      ctx.moveTo(ex + eyeDX - 3 * fs, eyeY); ctx.lineTo(ex + eyeDX + 3 * fs, eyeY); ctx.stroke();
    } else {
      var er = (emo === 'excited' ? 3.6 : 3.2) * fs;
      ctx.save(); ctx.translate(ex - eyeDX, eyeY); ctx.scale(1, blink); ctx.beginPath(); ctx.arc(0, 0, er, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(ex + eyeDX, eyeY); ctx.scale(1, blink); ctx.beginPath(); ctx.arc(0, 0, er, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex - eyeDX + 1.1 * fs, eyeY - 1.1 * fs, 1.2 * fs, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + eyeDX + 1.1 * fs, eyeY - 1.1 * fs, 1.2 * fs, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(ex - eyeDX - 0.8 * fs, eyeY + 0.8 * fs, 0.5 * fs, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(ex + eyeDX - 0.8 * fs, eyeY + 0.8 * fs, 0.5 * fs, 0, TAU); ctx.fill();
      ctx.fillStyle = '#201409';
    }
    var my = ey + 6 * fs;
    if (emo === 'happy' || emo === 'excited') {
      ctx.beginPath(); ctx.arc(ex, my, 4.2 * fs, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.save(); ctx.fillStyle = '#ff8fb0'; ctx.beginPath(); ctx.arc(ex, my + 1.2 * fs, 2.2 * fs, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#201409';
    } else if (emo === 'think' || emo === 'sleep') {
      ctx.beginPath(); ctx.arc(ex + (emo === 'think' ? 1 : 0) * fs, my, 1.6 * fs, 0, TAU); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(ex, my - 1 * fs, 3 * fs, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }

  /* ---------- 每帧更新 ---------- */
  function autoHue(b) {
    var t = (b - 1) / 8, a = { r: 186, g: 214, b: 255 }, c = { r: 232, g: 182, b: 84 };
    var r = Math.round(lerp(a.r, c.r, t)), g = Math.round(lerp(a.g, c.g, t)), bl = Math.round(lerp(a.b, c.b, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }
  /* 体色是「光害读数」的可视化，所以它必须每帧跟着读数走。旧版只在出生那一帧算一次
     （S.hue = autoHue(bNow())），后果就是用户报的两条：调 Bortle 不变色、进宇宙也不变色。
     宇宙幕取同一条色带的 Bortle 1 端——没有光害的冷星光——不另造第二种颜色，
     这样「变了的体色」仍然读得出它对应的那个真实档位。 */
  var hueRGB = null;
  function hueWant() {
    var space = window.GX && GX.mode && GX.mode() === 'space';
    return hex2rgb(autoHue(space ? 1 : bNow()));
  }
  function hueStep(dt) {
    var tg = hueWant(), i, d;
    var want = [tg.r, tg.g, tg.b];      /* hex2rgb 返回的是 {r,g,b} 对象，不是数组：直接下标取会全是 NaN */
    if (!hueRGB) hueRGB = [want[0], want[1], want[2]];
    var kk = Math.min(1, dt * 3);
    for (i = 0; i < 3; i++) {
      d = want[i] - hueRGB[i];
      if (Math.abs(d) > 0.6) hueRGB[i] += d * kk; else hueRGB[i] = want[i];
    }
    var hex = '#' + ((1 << 24) + (Math.round(hueRGB[0]) << 16) + (Math.round(hueRGB[1]) << 8)
                     + Math.round(hueRGB[2])).toString(16).slice(1);
    if (hex !== S.hue) S.hue = hex;
  }
  /* 语泡的落位是一次「承诺」，不是每帧重新最优。
     只有两件事该让它换位置：① 这个位此刻真的不干净了（压界面/压角色或被页面切掉），
     ② 角色自己挪开了（离上次落位时的锚点超过 CAP_FOLLOW）。
     「新解比旧位更近」不是理由——上一轮把迟滞带定成 22px，治的就是亚像素级换位，
     但线上录像实测两个候选位差 40~49 CSS px，压根不在带内，所以字幕照样逐帧翻面。
     带内/带外这个判据本身就是错的：候选位之间的距离和「该不该换」没有关系。
     守旧的前提仍然是旧位这一帧既不压也不出框，「互不遮挡」一条没有放松一分。 */
  var capHold = null, CAP_FOLLOW = 24, capWhy = '';
  function update(dt, now) {
    var t = dt * S.speed;
    hueStep(dt);
    var k = reduced ? 1 : 1 - Math.pow(0.002, t);
    var px = nav.x, py = nav.y;
    nav.x = lerp(nav.x, nav.tx, k); nav.y = lerp(nav.y, nav.ty, k);
    /* 指数逼近永远差最后一口气：实测落点会一路漂 525.137→525.006 也不到终点。
       语泡的「最近干净位」正是拿这个坐标比大小，零点几像素就够它在两个几乎等距的
       槽位间翻面——用户看到的「字幕在抖」就是这一翻。差不到半个像素即算到位。 */
    if (Math.abs(nav.tx - nav.x) < 0.5) nav.x = nav.tx;
    if (Math.abs(nav.ty - nav.y) < 0.5) nav.y = nav.ty;
    nav.vx = (nav.x - px) / Math.max(dt, 1e-4); nav.vy = (nav.y - py) / Math.max(dt, 1e-4);
    var sp = Math.hypot(nav.vx, nav.vy);
    if (!reduced && dir.trail && sp > 40 && trail.length < 70) trail.push({ x: nav.x, y: nav.y + 14, life: 1 });
    for (var i = trail.length - 1; i >= 0; i--) { trail[i].life -= dt * 1.5; if (trail[i].life <= 0) trail.splice(i, 1); }
    for (i = sparks.length - 1; i >= 0; i--) {
      var sk = sparks[i]; sk.x += sk.vx * dt; sk.y += sk.vy * dt; sk.vy += 60 * dt; sk.life -= dt * 1.1;
      if (sk.life <= 0) sparks.splice(i, 1);
    }
    var bank = clamp(-nav.vx * 0.0012, -0.45, 0.45);
    spirit.rotZ = lerp(spirit.rotZ, bank, 1 - Math.pow(0.01, t));
    spirit.squash = lerp(spirit.squash, sp > 200 ? 1.08 : 1, 1 - Math.pow(0.01, t));
    spirit.stateT -= t;
    if (spirit.stateT <= 0 && spirit.state !== 'idle' && spirit.state !== 'sleep') { setState('idle', 0); setEmotion(bNow() <= 3 ? 'excited' : 'happy'); }
    var s = spirit.state;
    if (s === 'celebrate') { spirit.rotY += t * 5; spirit.hop = Math.abs(Math.sin(now / 140)) * 0.5; }
    else if (s === 'happy' || s === 'pet') { spirit.hop = Math.abs(Math.sin(now / 180)) * 0.3; spirit.rotY += t * 1.6; }
    else if (s === 'think') spirit.rotY = lerp(spirit.rotY, 0.22, k);
    else if (s === 'sleep') { spirit.hop = lerp(spirit.hop, -0.3, k); spirit.squash = lerp(spirit.squash, 0.85, k); }
    else if (s === 'guide') { spirit.rotY = lerp(spirit.rotY, Math.sin(now / 900) * 0.12, k); spirit.hop = reduced ? 0 : Math.sin(now / 700) * 0.06; }
    else {
      spirit.rotY = lerp(spirit.rotY, Math.sin(now / 1500) * 0.18, k);
      spirit.hop = reduced ? 0 : Math.sin(now / 700) * 0.06;
      if (Math.random() < dt * 0.4) spirit.blink = 1;
    }
    spirit.blink = Math.max(0, spirit.blink - dt * 3);
    cam.tyaw = 0.32 + (reduced ? 0 : Math.sin(now / 2600) * 0.22);
    cam.yaw = lerp(cam.yaw, cam.tyaw, 1 - Math.pow(0.001, dt));
    cam.pitch = lerp(cam.pitch, cam.tpitch, 1 - Math.pow(0.001, dt));

    /* 浮层是后打开的：面板/顶栏/航线条一开，就可能正好压在角色身上；角色也可能刚好
       贴到页面边上被切掉。每 0.5 秒按真实剪影复核一次，出框或被压就自己挪到最近的空位——
       用户永远不该为了看清内容去追一个摆件。
       「停稳」与「让位」是两件事：飞行途中穿过浮层是路线本身，不该被半路改道；
       但一旦落定还被压着（讲解位就是这样），就必须挪出去。 */
    relaxFoot(dt);
    avoidT -= dt;
    if (avoidT <= 0) {
      avoidT = 0.5;
      var parked = Math.hypot(nav.tx - nav.x, nav.ty - nav.y) < 40;
      if (parked && !yielding && !dir.drag) {
        var av = uiAvoid(), bx = nav.tx, by = nav.ty;
        /* 界面松开以后朝讲解锚点重解一次落点。退让解只保证「此刻站得住」，它不记得
           自己本来要去哪儿：转场那一瞬避让表里多出来的临时矩形（实测停在 640~739 这条
           带子上）逼开以后，旧版就永远站在面板对岸讲这一站的卡片——本地 v20261115d
           量到讲解位离目标 602px，而同一条几何在界面静置后重解是 303px。
           40px 死区：只有「确实近了 40px 以上」才改道，临界来回抖就死在这里被掐掉。 */
        if (perchAim && perchAim.el === spotEl) {
          var pa = placeBody(perchAim.x, perchAim.y, av);
          if (Math.hypot(bx - perchAim.x, by - perchAim.y) - Math.hypot(pa.x - perchAim.x, pa.y - perchAim.y) >= 40) {
            bx = pa.x; by = pa.y;
          }
        }
        var r = refit(bx, by, av);
        /* 只有「真的改得更好」才写回：满屏挤死且缩到底仍无解时原地不动，
           反复改道会变成原地抖，那不如停在原地等界面关掉。 */
        if (r.size !== undefined) sqSet(r.size);
        nav.tx = r.x; nav.ty = r.y;
        /* 已经干净但仍缩着：站稳 1 秒后按阶梯放回体积，用户不该为一次窗口挤压
           永久失去满尺寸的角色；放回同样要验「原地站得住」，否则临界宽度会缩—放—缩地抖。 */
        if (r.clean && sq < 1) { sqHold += 0.5; if (sqHold >= 1) regrow(nav.tx, nav.ty, av); }
        else sqHold = 0;
      }
    }

    /* 重排之后的第二次解算。resize 里那次只能保「不出框」，因为它量到的浮层矩形还是旧版式的；
       隔 400ms 把避让表重新量一遍，停靠位才按「此刻真实的界面」重解。
       计时不用帧数：软件渲染下只有个位数帧率，0.5 秒的那道自查可能一整段时间都没轮到过一次。 */
    if (reclampAt && now >= reclampAt) {
      reclampAt = 0;
      chromeCache = null; chromeCacheT = -1e9;
      clampTargets();
    }

    /* ---------- 自己的三件事：走 / 想 / 说（用户不动手时也必须发生） ---------- */
    /* 漫游：不在带飞、不在让路、没正指着控件 → 每 3.5~7.5 秒自己挑一个空位飞过去。
       旧版是「25 秒没人操作就缩到左下角睡觉」，在用户眼里就是一个站着不动的吉祥物，已删。 */
    if (!frozen && !dir.rest && !dir.drag && free && !advancing && !yielding && spotEl === null && spirit.state !== 'guide') {
      /* 「自己走」与「自己说」是两个独立闸：演示时可以只留说话、也可以让它闭嘴只走位。 */
      if (dir.roam) {
      ROAM.t += dt;
      if (ROAM.t >= ROAM.next) {
        ROAM.t = 0; ROAM.next = 3.5 + Math.random() * 4;
        var rq = roamTarget();
        if (rq) {
          ROAM.hops++; ROAM.dist += Math.hypot(rq.x - nav.tx, rq.y - nav.ty);
          flyTo(rq.x, rq.y);
          if (!reduced) { if (Math.random() < 0.4) setState('happy', 1.1); else if (Math.random() < 0.25) setState('wave', 1.1); }
        }
      }
      }
      /* 自发起念：语泡空着、离上一口够久才开；开了必配一次位移（见 speak 的 move） */
      if (dir.talk) {
      TALK.t += dt;
      if (TALK.t >= TALK.next && mouthFree() && talkAllowed()) {
        var tp = nextTopic();
        if (tp && fireTopic(tp)) { TALK.t = 0; TALK.next = 22 + Math.random() * 12; }
        else { TALK.t = 0; TALK.next = 6; }                    /* 这条不成立：很快再挑一张，别卡死节奏 */
      }
      }
      /* 排队的反应：话筒一空就补上（最多等 4 秒，过期作废，不追着用户说话） */
      if (REACT.pend && mouthFree() && talkAllowed()) {
        REACT.fired++; var pd = REACT.pend; REACT.pend = null; REACT.last = performance.now();
        var dd = pd.txt, dc = pd.chips;
        speak(dd, dc, pd.hold || 10, pd.emo || 'happy', pd.st || 'idle', pd.move !== false);
      }
    } else { ROAM.t = 0; TALK.t = Math.min(TALK.t, TALK.next - 1); }

    /* 语泡淡入淡出走真实时间，不依赖 CSS transition：软件渲染/低帧率也不会丢字幕 */
    if (dir.pin && capTarget) capTimer = 999;        /* 常驻：录屏/截图时字幕不许自己跑掉 */
    if (capTimer > 0 && capTimer < 900) { capTimer -= dt; if (capTimer <= 0) { capTarget = 0; } }
    capFade = clamp(capFade + (capTarget ? dt / 0.22 : -dt / 0.22), 0, 1);
    if (capFade <= 0.01 && !capTarget) { cap.style.display = 'none'; }
    else {
      cap.style.display = 'block';
      cap.style.opacity = capFade.toFixed(3);
      cap.style.transform = 'translateY(' + ((1 - capFade) * 8).toFixed(2) + 'px)';
      var cw = cap.offsetWidth || 280, ch = cap.offsetHeight || 96;
      /* 语泡也走同一套双向解算：它 z=23 压在角色（14）和所有界面（15~32）之上，
         所以「不盖住星仔本体」和「不盖住任何界面内容」是两条硬约束，
         而且它自己也不许被页面切掉——字读不通等于没说。人物优先：压本体的罚分远高于压界面。 */
      /* g 是语泡到剪影包络的净距。实测：停稳后星体仍在呼吸/自转，footRaw 会单向
         长大约 6~10px；旧值 14 扣掉避让盒自带的 8px 灰边，只剩 6px 余量，
         被这点生长吃光后「旧位」真的压到本体，于是被迫重锚——探针里那一次
         6.3px 的台阶就是这么来的。把净距抬到 26（余量 18px，实测生长够不到），
         停稳期间就不会再出现「为不遮本体而挪一下」；约束只加不减。 */
      var g = 26, fr = footNowRect(nav.x, nav.y);
      var avoid = uiAvoid();
      avoid.push({ left: fr.left - 8, top: fr.top - 8, right: fr.right + 8, bottom: fr.bottom + 8, w: 40 });
      var slots = [
        [nav.x + foot.r + g, nav.y - ch / 2],
        [nav.x - cw - foot.l - g, nav.y - ch / 2],
        [nav.x - cw / 2, nav.y - foot.t - g - ch],
        [nav.x - cw / 2, nav.y + foot.b + g],
        [nav.x + foot.r + g, nav.y - foot.t - ch + 8],
        [nav.x - cw - foot.l - g, nav.y - foot.t - ch + 8],
        [nav.x + foot.r + g, nav.y + foot.b - ch + 8],
        [nav.x - cw - foot.l - g, nav.y + foot.b - ch + 8],
        [nav.x - cw / 2, nav.y - foot.t - g - ch - 130],
        [nav.x - cw / 2, nav.y + foot.b + g + 96]
      ];
      var nl, nt, pick;
      /* 整数落位 + 承诺：新解离旧位再近也不是换位的理由，
         换位只发生在「旧位这一帧不干净了」或「角色挪开 ≥ CAP_FOLLOW」时。
         框尺寸变了必须重锚，否则新旧坐标不是同一个框，比什么都比不准。
         capWhy 记下这一帧到底有没有守住、没守是哪一条，探针据此判「抖不抖」，
         不用从坐标序列反推原因。 */
      var keep = !!capHold;
      if (keep && (capHold.w !== cw || capHold.h !== ch)) { keep = false; capWhy = 'size'; }
      else if (keep && Math.hypot(nav.x - capHold.ax, nav.y - capHold.ay) >= CAP_FOLLOW) { keep = false; capWhy = 'moved'; }
      if (keep) {
        var hs = scoreAt(capHold.l, capHold.t, cw, ch, avoid);
        if (hs.out !== 0 || hs.ov !== 0) { keep = false; capWhy = 'dirty'; }
      }
      if (keep) {
        nl = capHold.l; nt = capHold.t; capWhy = 'hold';
        /* 锚点只在「重新落位」时刷新。若守旧期间也跟着刷 nav，角色匀速飞走时
           每帧位移都小于 CAP_FOLLOW，承诺就永远不解除——泡会钉死在原地。 */
      } else {
        if (!capHold) capWhy = 'first';
        /* 脏位重锚从「旧位」出发找最近干净解，不从语义槽出发：
           旧位只是这一刻不能待了，跳到邻位即可；以槽为基准会把泡甩到另一侧，
           那点落差正是用户看到的抖动。首落/角色挪开仍以槽为基准。 */
        pick = placeBox(cw, ch, capWhy === 'dirty' ? capHold.l : slots[0][0],
                             capWhy === 'dirty' ? capHold.t : slots[0][1], avoid, slots);
        capHold = { l: Math.round(pick.l), t: Math.round(pick.t), w: cw, h: ch, ax: nav.x, ay: nav.y };
        nl = capHold.l; nt = capHold.t;
      }
      cap.style.left = nl + 'px';
      cap.style.top = nt + 'px';
    }
  }
  function syncHit() {
    /* 只跟「在场 + 用户正在按控件」有关：带飞途中也必须点得动（见 hit 的 click 分支） */
    var showHit = alive && !yielding;
    hit.style.display = showHit ? 'block' : 'none';
    if (!showHit) return;
    var d = clamp(96 * nav.size, 44, 132);
    hit.style.width = d.toFixed(1) + 'px'; hit.style.height = d.toFixed(1) + 'px';
    hit.style.margin = (-d / 2).toFixed(1) + 'px 0 0 ' + (-d / 2).toFixed(1) + 'px';
    hit.style.left = nav.x.toFixed(1) + 'px'; hit.style.top = (nav.y + navBob()).toFixed(1) + 'px';
    var pr = panelRect();
    var over = pr && nav.x > pr.left && nav.x < pr.right && nav.y > pr.top && nav.y < pr.bottom;
    hit.style.pointerEvents = (over && !dir.drag) ? 'none' : 'auto';   /* 掠过面板时不吞面板上的点击；正被拎着时不能松手 */
  }
  function syncSpot() {
    var r = spotEl ? rectOf(spotEl) : null;
    if (!alive || !dir.spot || !r) { spotMark.style.display = 'none'; spotMark.classList.remove('on'); return; }
    spotMark.style.left = (r.x - 7).toFixed(1) + 'px';
    spotMark.style.top = (r.y - 7).toFixed(1) + 'px';
    spotMark.style.width = (r.w + 14).toFixed(1) + 'px';
    spotMark.style.height = (r.h + 14).toFixed(1) + 'px';
    spotMark.style.display = 'block';
    if (reduced) spotMark.classList.remove('on'); else spotMark.classList.add('on');
  }
  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    drawIndicators(now);
    if (dir.boxes) drawBoxes();
    renderNav(now);
    syncHit();
    syncSpot();
  }
  /* 避让可视化：把摆放几何真正读的那张表原样画出来（uiAvoid 的每一个框 + 角色的实测脚廓）。
     只画不判——它不是另一套说法，所以画面上「贴着但没进去」就是真的没进去。 */
  function drawBoxes() {
    var list = uiAvoid(), i, q;
    ctx.save();
    ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(169,200,255,.42)';
    for (i = 0; i < list.length; i++) {
      q = list[i];
      ctx.strokeRect(q.left, q.top, q.right - q.left, q.bottom - q.top);
    }
    ctx.setLineDash([]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(216,178,92,.85)';
    var fr = footRect(nav.x, nav.y);
    ctx.strokeRect(fr.left, fr.top, fr.right - fr.left, fr.bottom - fr.top);
    ctx.restore();
  }

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = (now - last) / 1000; last = now;
    if (!isFinite(dt) || dt < 0) dt = 0; if (dt > 0.05) dt = 0.05;
    if (document.hidden) return;
    try {
      if (!window.GX || !GX.mode || !introGone() || sceneBusy()) {
        if (alive) { alive = false; layer.style.display = 'none'; cap.style.display = 'none'; hit.style.display = 'none'; spotMark.style.display = 'none'; }
        return;
      }
      if (!alive) {
        alive = true; layer.style.display = 'block';
        S.hue = autoHue(bNow()); hueRGB = null;   /* 出生帧按当前场景取色，之后每帧跟随（hueStep） */
        /* 出生点也走同一套避让：面板可能已经开着（从别的节进来时不重开片头） */
        var bp = placeBody(W * 0.62, H * 0.3, uiAvoid());
        nav.x = nav.tx = bp.x; nav.y = nav.ty = bp.y;
        if (!greeted) {
          greeted = true;
          setState('wave', 2); setEmotion('happy');
          say('我是星仔，今晚的领航员。我不待在框里——带你飞四站，把页面上那几个真控件都用一遍。', '带我飞一遍', function () { startTour(0); }, 15);
        }
      }
      update(dt, now);
      draw(now);
    } catch (e) { window.__NAV_ERR = String(e && e.message || e); }
  }
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(frame); });

  /* ---------- 隐秘导演台：长按星仔 / Shift+Alt+D 召唤，Esc 收起 ----------
     为什么进产品：预览版靠常驻面板演示，线上没有它，用户就只能「点一下听一句」——
     这次的反馈正是「没办法操控星仔」。做成召唤式是因为常驻的调试面板会把作品变成后台。
     安全边界（与站点其余部分一致）：零 innerHTML、零 eval、零网络、零存储。
     文本只进 textContent，截到 40 字、不进留痕；所有开关只改表现量，
     不碰内核读数，也不替用户改真控件的值。 */
  var dirEl = null, dirAsk = null, dirRoam = null, dirRest = null, dirGo = null;
  function dirRow(labelText) {
    var row = document.createElement('div'); row.className = 'row';
    var lab = document.createElement('label'); lab.textContent = labelText;
    row.appendChild(lab);
    return row;
  }
  function dirSwGet(labelText, get, set) {
    var row = dirRow(labelText), b = document.createElement('button');
    b.type = 'button'; b.setAttribute('aria-label', labelText);
    b.className = 'sw' + (get() ? ' on' : '');
    b.addEventListener('click', function () { set(!get()); b.classList.toggle('on', get()); markDrive(1200); });
    row.appendChild(b); dirEl.appendChild(row);
    return b;
  }
  function dirSw(labelText, key, after) {
    return dirSwGet(labelText, function () { return dir[key]; },
                    function (v) { dir[key] = v; if (after) after(v); });
  }
  function dirBtn(labelText, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = labelText;
    b.addEventListener('click', function () { markDrive(2600); fn(); });
    return b;
  }
  function setRest(on) {
    dir.rest = on;
    if (dirRoam) { dir.roam = !on; dirRoam.classList.toggle('on', dir.roam); }
    if (dirRest) dirRest.classList.toggle('cur', on);
    if (dirGo) dirGo.classList.toggle('cur', !on);
    if (on) {
      spotEl = null; beamIdx = -1;
      flyTo(W * 0.16, H * 0.80);
      setState('sleep', 999); setEmotion('sleep');
      say('歇一会儿。要我继续就按「继续领航」，或者直接按住我拖到想去的地方。', '继续领航', function () { setRest(false); }, 999);
    } else {
      setState('idle', 0); setEmotion('happy');
      if (stopIdx >= 0 && stopIdx < 4) enterStop(Math.max(0, stopIdx));
      else { flyTo(W * 0.5, H * 0.34); say('出发。指哪讲哪。', null, null, 5); }
    }
  }
  function fireAsk() {
    if (!dirAsk) return;
    var txt = String(dirAsk.value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40);
    dirAsk.value = '';
    if (!txt) return;
    if (dir.rest) setRest(false);
    setState('happy', 1.6); setEmotion('happy');
    speak(txt, null, 12, 'happy', 'idle', true);
  }
  function buildDir() {
    dirEl = document.createElement('div'); dirEl.id = 'xzDir';
    var h = document.createElement('h3');
    var ht = document.createElement('span'); ht.textContent = '导演台 · 演示用';
    var x = document.createElement('button'); x.type = 'button'; x.textContent = '×';
    x.setAttribute('aria-label', '收起导演台');
    x.addEventListener('click', function () { toggleDir(false); });
    h.appendChild(ht); h.appendChild(x); dirEl.appendChild(h);

    var srow = dirRow('飞行速度'), sl = document.createElement('input');
    sl.type = 'range'; sl.min = '0.4'; sl.max = '2'; sl.step = '0.1'; sl.value = String(S.speed);
    sl.setAttribute('aria-label', '飞行速度');
    sl.addEventListener('input', function () { S.speed = clamp(parseFloat(sl.value) || 1, 0.4, 2); });
    srow.appendChild(sl); dirEl.appendChild(srow);

    dirSw('星屑拖尾', 'trail');
    dirSw('聚光指星', 'spot');
    dirRoam = dirSw('自由漫游', 'roam');
    dirSw('自主开口', 'talk');
    dirSwGet('减弱动效', function () { return reduced; }, function (v) { reduced = v; });
    dirSw('字幕常驻', 'pin');
    dirSw('避让可视化', 'boxes');

    var btns = document.createElement('div'); btns.className = 'btns';
    btns.appendChild(dirBtn('重播领航', function () { if (dir.rest) setRest(false); startTour(0); }));
    dirRest = dirBtn('休息', function () { setRest(true); });
    dirGo = dirBtn('继续', function () { setRest(false); });
    btns.appendChild(dirRest); btns.appendChild(dirGo);
    /* 「讲一颗星」必须真指到一颗星：走 narrate——和用户在天上点那颗星完全同一条路，
       同一个蓝圈、同一份 HYG 真实数据。旧写法只开一个自主话题，还要用户再点一次 chip 才指星，
       按钮名不副实，验收里的「圈指的是不是正在讲的那颗星」也就无从测起。 */
    btns.appendChild(dirBtn('讲一颗星', function () {
      var f = starFact();
      if (f) narrate({ kind: 'star', i: f.i }); else talkNow('tour');
    }));
    dirEl.appendChild(btns);

    var ask = document.createElement('div'); ask.className = 'ask';
    dirAsk = document.createElement('input'); dirAsk.type = 'text'; dirAsk.maxLength = 40;
    dirAsk.placeholder = '让它说这句'; dirAsk.setAttribute('aria-label', '让星仔说这句话');
    dirAsk.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fireAsk(); } });
    var goBtn = document.createElement('button'); goBtn.type = 'button'; goBtn.textContent = '说';
    goBtn.addEventListener('click', fireAsk);
    ask.appendChild(dirAsk); ask.appendChild(goBtn); dirEl.appendChild(ask);

    var note = document.createElement('div'); note.id = 'xzDirNote';
    note.textContent = '只调表现，不改数据：可见星数、方位高度、核对判定都来自内核与 HYG v4.0 真实星表，' +
                       '这一层一个都不碰。按住星仔拖 = 直接带它走。';
    dirEl.appendChild(note);
    document.body.appendChild(dirEl);
  }
  function toggleDir(on) {
    var want = typeof on === 'boolean' ? on : !dir.on;
    if (want && (!alive || sceneBusy())) return;          /* 片头 / 幕间 / 穿越 / 找星中不召唤 */
    if (!dirEl) buildDir();
    dir.on = want;
    dirEl.classList.toggle('on', want);
    if (want) {
      setState('wave', 1.4); setEmotion('happy');
      say('导演台。这里只调表现——速度、拖尾、标记、自主性；数据一个都不动。', null, null, 9);
    } else if (dirAsk) dirAsk.blur();
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (dir.on) toggleDir(false); return; }
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.shiftKey && e.altKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); toggleDir(); }
  });

  planBuild();

  /* 只读状态口：给真实浏览器探针断言用；freeze 是探针专用开关（关掉「主动性」才能确定性验避让），
     它不改航线、不改任何读数，也不给页面外部用。 */
  window.NAVIGATOR = {
    onVerdict: onVerdict,
    render: function () { if (alive) draw(performance.now()); },
    freeze: function (on) { frozen = !!on; if (frozen) { ROAM.t = 0; TALK.t = 0; REACT.pend = null; } },
    /* 探针专用：把角色停到某个比例位（走正常 flyTo，所以照样不会落进浮层里）。
       「面板压住角色必须自己让开」这条断言要求起飞点已知，
       靠点一下角色去撞随机漫游位，测出来的是运气不是行为。 */
    park: function (fx, fy) { if (alive) flyTo(W * fx, H * fy); },
    state: function () {
      return {
        alive: alive, idx: stopIdx, done: stopDone.slice(), complete: stopComplete,
        greeted: greeted,   /* 是否已自报过家门：自主开场会轮换话题，探针不该靠「恰好抽到那一句」判定 */
        advancing: advancing, free: free, strip: stripOn, frozen: frozen,
        bortle: bNow(), visible: visAt(bNow()),
        cap: capText.textContent, chip: chip.style.display === 'none' ? null : chip.textContent,
        chip2: chip2.style.display === 'none' ? null : chip2.textContent,
        nav: { x: nav.x, y: nav.y, tx: nav.tx, ty: nav.ty, size: nav.size, sq: sq },
        /* 主动性的三个可量化证据：走了多远/换向几次、自发开了几口、接了几次用户的话 */
        roam: { hops: ROAM.hops, dist: Math.round(ROAM.dist) },
        talk: { fired: TALK.fired, asked: TALK.asked, answered: TALK.answered, lastId: TALK.lastId },
        react: REACT.fired,
        overlays: uiAvoid(),              /* 探针据此断言真实剪影矩形不与任何 z>14 浮层相交 */
        foot: { l: foot.l, r: foot.r, t: foot.t, b: foot.b },   /* 摆放用的就是这四个实测象限 */
        spot: spotMark.style.display === 'block' ? (spotEl && spotEl.id) || 'el' : null,
        /* 导演台台账 + 指星束与体色：验收「圈指的是不是正在讲的那颗星」「进宇宙有没有变色」
           和「字幕每帧稳不稳」都要读这三样，以前只能靠肉眼截图猜。 */
        dir: { on: dir.on, rest: dir.rest, drag: dir.drag, trail: dir.trail, spot: dir.spot,
               roam: dir.roam, talk: dir.talk, pin: dir.pin, boxes: dir.boxes,
               speed: S.speed, reduced: reduced },
        beam: beamIdx, hue: S.hue,
        /* 字幕的内在计时：软件渲染下 dt 被钳到 0.05，真实秒和内部秒不是一个尺度，
           所以「常驻 / 会自动收」不能靠掐墙钟判断，只能读这两个数本身。 */
        capT: { timer: Math.round(capTimer * 10) / 10, fade: Math.round(capFade * 1000) / 1000 },
        capBox: (function () {
          var r = cap.getBoundingClientRect();
          return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
        })(),
        /* 承诺判定的一帧快照：why 是这一帧守旧/换位的原因。
           探针直接读它就能区分「抖」和「稳」，不用从坐标序列反推。 */
        capHold: { why: capWhy, follow: CAP_FOLLOW,
                   l: capHold ? capHold.l : null, t: capHold ? capHold.t : null,
                   ax: capHold ? Math.round(capHold.ax) : null, ay: capHold ? Math.round(capHold.ay) : null },
        err: window.__NAV_ERR || null
      };
    }
  };
})();
