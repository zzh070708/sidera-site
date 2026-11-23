/* M1 可证伪预测核对：纯函数判定内核（无 DOM、无网络、无存储）。
   协议口径与核对卡一致：无月晴夜、裸眼、一拳宽（直径 10°＝角半径 5°）窗口、±2 颗算吻合。
   判定带 TOL 属赛前预注册，不随任何一次观测结果改动。

   v2（2026-11-13）加宽「可比性」闸门，判定带一字未动。动因是第一次实地读数：
   口头约数、月亮还在天上、暗适应与方法全空，内核却照样给了「吻合/推翻」的结论——
   缺字段的计数根本不可比，给它一个判定等于把可证伪性从后门放掉。
   现在任一条不成立一律 invalid_cond：既不构成佐证，也不构成推翻，只作参考。

   闸门只管「这一颗数能不能和预测比」；地点/经纬度/NELM 属复核字段（auditGaps），
   缺了要标出来，但不改变判定——别让「忘抄经纬度」把一次合格的计数作废。
   UMD：node 下 module.exports 供单测；浏览器下 window.M1。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.M1 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TOL = 2;            /* 判定带：|实测−预测| ≤ 2 算吻合（预注册，勿改） */
  var DARK_MIN = 20;      /* 暗适应下限（分钟）：没适应完，暗星还没爬上来 */
  var HOUR_TOL = 30;      /* 实际计数时刻与卡面钟点的最大差（分钟）：预测属于那一刻的天空 */
  var METHOD_OK = { point: 1, photo: 1 };   /* 逐颗点数 / 照片回看；扫一眼报约数不可比 */
  var WINDOW_OK = { fist: 1 };              /* 必须确认只数了一拳宽窗口 */
  var BLOCK_OK = { none: 1 };               /* 视线不被建筑挡、无人造光直射 */

  function isCount(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0;
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string' && v.trim() !== '') {
      var n = Number(v);
      return isFinite(n) ? n : NaN;
    }
    return NaN;
  }
  /* datetime-local 给的是本地墙上钟点串 'YYYY-MM-DDTHH:MM'，不带时区——
     核对用的本来就是观测者当地时刻，所以只取时分，不做时区换算（换算是另一个错误源）。 */
  function minutesOfDay(iso) {
    if (typeof iso !== 'string') return NaN;
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
    if (!m) return NaN;
    var hh = +m[4], mm = +m[5];
    if (hh > 23 || mm > 59) return NaN;
    return hh * 60 + mm;
  }
  function hourGapMin(cardHours, iso) {
    var t = minutesOfDay(iso), n = num(cardHours);
    if (isNaN(t) || isNaN(n)) return NaN;
    var c = ((Math.round(n * 60) % 1440) + 1440) % 1440;
    var d = Math.abs(t - c);
    return Math.min(d, 1440 - d);        /* 后半夜跨 0 点：取短弧，别把 23:50 与 0:10 判成 23 小时 */
  }
  function conditionGaps(cond) {
    var c = cond || {}, g = [];
    if (c.cloud !== 'clear') g.push('云量不是「晴」');
    if (c.moon !== 'none') g.push('月亮还在天上（协议要求「无月」）');
    var dk = num(c.darkMin);
    if (isNaN(dk)) g.push('没填暗适应时长');
    else if (dk < DARK_MIN) g.push('暗适应只有 ' + dk + ' 分钟（协议要求≥' + DARK_MIN + '）');
    if (!METHOD_OK[c.method]) g.push('计数方法不是「逐颗点数」或「照片回看」');
    if (!WINDOW_OK[c.window]) g.push('没确认「只数一拳宽窗口内」');
    if (!BLOCK_OK[c.block]) g.push('视线有遮挡或灯光直射');
    var gap = hourGapMin(c.cardHours, c.countAt);
    if (isNaN(gap)) g.push('没填实际计数时刻');
    else if (gap > HOUR_TOL) g.push('计数时刻与卡面钟点相差 ' + gap + ' 分钟');
    return g;
  }
  function auditGaps(cond) {
    var c = cond || {}, g = [];
    if (typeof c.place !== 'string' || !c.place.trim()) g.push('具体地点未填');
    var la = num(c.lat), lo = num(c.lon);
    if (isNaN(la) || isNaN(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) g.push('经纬度未填或不合法');
    if (c.coordSrc === 'site') g.push('坐标是站点预设场地，不是观测点');
    else if (c.coordSrc !== 'gps' && c.coordSrc !== 'map') g.push('坐标来源未注明');
    var ne = num(c.nelm);
    if (isNaN(ne) || ne < -2 || ne > 8) g.push('NELM（肉眼极限星等）未独立自评');
    return g;
  }
  function conditionsValid(cond) {
    return conditionGaps(cond).length === 0;
  }

  function verdict(predicted, actual, cond) {
    if (!isCount(predicted) || !isCount(actual)) {
      return { code: 'invalid', diff: null, gaps: [],
        text: '请先在上方核对卡取得预测，并填入你实际数到的颗数（非负整数）。' };
    }
    var diff = actual - predicted;
    var ad = Math.abs(diff);
    var gaps = conditionGaps(cond);
    if (gaps.length) {
      return { code: 'invalid_cond', diff: diff, gaps: gaps.slice(),
        text: '相差 ' + ad + ' 颗，但观测条件不达标：' + gaps.join('；') + '。' +
              '这次计数不可比，只能作参考——既不构成佐证，也不构成推翻。' +
              '换个无月晴夜、按协议把条件补齐再数一遍。' };
    }
    if (ad <= TOL) {
      return { code: 'confirm', diff: diff, gaps: [],
        text: '吻合：相差 ' + ad + ' 颗（≤' + TOL + '），在无月晴夜、暗适应≥' + DARK_MIN +
              '分钟、一拳宽窗口逐颗点数的条件下，佐证了该夜该天区的预测。' };
    }
    return { code: 'falsify', diff: diff, gaps: [],
      text: '推翻（该夜该天区）：相差 ' + ad + ' 颗（>' + TOL + '）。无月晴夜下实测仍不符，这条预测被这次观测证伪——已记录在案。' +
            '请先复核是否有楼房遮挡、个体视力差等混淆，再决定是否重测；单次观测不标定全局。' };
  }

  /* ---------- 任意观测点经纬度解析（纯函数）：让「站上出的卡」对准观测者真正站的地方 ----------
     内核按北京时间 UTC+8 推算恒星时，所以只接受中国陆域范围。越界不是「算不了」，
     而是「钟点错、方位全错」，宁可拒收也不出一张错卡。 */
  var CN_LAT = [3, 54], CN_LON = [73, 136];
  function hemiSign(tok, isLat) {
    var t = String(tok == null ? '' : tok).toUpperCase();
    if (isLat) return (t.indexOf('S') >= 0 || t.indexOf('南') >= 0) ? -1
               : (t.indexOf('N') >= 0 || t.indexOf('北') >= 0) ? 1 : 0;
    return (t.indexOf('W') >= 0 || t.indexOf('西') >= 0) ? -1
         : (t.indexOf('E') >= 0 || t.indexOf('东') >= 0) ? 1 : 0;
  }
  var TOK = '(?:北纬|南纬|东经|西经|[NSEW北南东西])';
  var ITEM = new RegExp('(' + TOK + ')?\\s*(-?\\d+(?:\\.\\d+)?)\\s*(' + TOK + ')?', 'gi');
  function parsePlace(text) {
    var s = String(text == null ? '' : text).replace(/[°º度]/g, '')
          .replace(/[，、；;|]/g, ',').trim();
    if (!s) return { ok: false, msg: '请填「纬度, 经度」，例：41.10, 121.10' };
    /* 数字个数钉死为 2：多一个（「41.10.5」这种打错的、或带了海拔/秒数的）一律拒收，
       不静默取前缀——取错一位就是几十公里的偏差，卡就废了。 */
    var howMany = s.match(/\d+(?:\.\d+)?/g) || [];
    if (howMany.length !== 2) {
      return { ok: false, msg: '认出 ' + howMany.length + ' 个数字，需要恰好两个：纬度 与 经度' };
    }
    var items = [], m;
    ITEM.lastIndex = 0;
    while ((m = ITEM.exec(s)) !== null) {
      items.push({ v: parseFloat(m[2]), lat: hemiSign(m[1], true) || hemiSign(m[3], true),
                   lon: hemiSign(m[1], false) || hemiSign(m[3], false) });
      if (items.length === 2) break;
    }
    if (items.length !== 2) return { ok: false, msg: '没认出两个数，例：41.10, 121.10' };
    /* 段自带的半球标记决定它是纬度还是经度；都没标记时按「纬前经后」（地图 App 的通用顺序） */    var a = items[0], b = items[1], latIt = a, lonIt = b;
    if (!a.lat && a.lon) { latIt = b; lonIt = a; }
    else if (!a.lat && !a.lon && b.lat) { latIt = b; lonIt = a; }
    var lat = latIt.lat ? latIt.lat * Math.abs(latIt.v) : latIt.v;
    var lon = lonIt.lon ? lonIt.lon * Math.abs(lonIt.v) : lonIt.v;
    if (!isFinite(lat) || !isFinite(lon)) return { ok: false, msg: '经纬度不是有限数' };
    if (Math.abs(lat) > 90) return { ok: false, msg: '纬度超出 ±90°（现在 ' + lat + '）' };
    if (Math.abs(lon) > 180) return { ok: false, msg: '经度超出 ±180°（现在 ' + lon + '）' };
    if (lat < CN_LAT[0] || lat > CN_LAT[1] || lon < CN_LON[0] || lon > CN_LON[1]) {
      return { ok: false, msg: '内核按北京时间（UTC+8）推算星空，暂只支持中国范围 '
             + CN_LAT[0] + '–' + CN_LAT[1] + '°N / ' + CN_LON[0] + '–' + CN_LON[1] + '°E' };
    }
    return { ok: true, lat: lat, lon: lon,
             label: Math.abs(lat).toFixed(2) + '°' + (lat < 0 ? 'S' : 'N') + ' '
                  + Math.abs(lon).toFixed(2) + '°' + (lon < 0 ? 'W' : 'E') };
  }

  return {
    TOL: TOL, DARK_MIN: DARK_MIN, HOUR_TOL: HOUR_TOL,
    isCount: isCount, minutesOfDay: minutesOfDay, hourGapMin: hourGapMin,
    conditionGaps: conditionGaps, auditGaps: auditGaps,
    conditionsValid: conditionsValid, verdict: verdict, parsePlace: parsePlace
  };
});
