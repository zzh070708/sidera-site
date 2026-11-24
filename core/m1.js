/* M1 可证伪预测核对：预测快照、观测可比性与本机记录隔离的纯函数内核。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.M1 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TOL = 2, DARK_MIN = 20, HOUR_TOL = 5, SITE_TOL_M = 100, DIR_TOL = 2;
  var SCHEMA = 3, TIME_ZONE = '+08:00', MODEL_VERSION = 'ground-horizon-extinction-v1';
  var CATALOG = 'HYG v4.0', HORIZON = 0.01, EXTINCTION = 0.26;
  var BORTLE_LIMIT = [7.6, 7.1, 6.6, 6.1, 5.6, 5.1, 4.6, 4.1, 3.5];
  var CN_LAT = [3, 54], CN_LON = [73, 136], EARTH_R = 6371000;

  function isObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }
  function isCount(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= 0;
  }
  function isInteger(v) { return isCount(v); }
  function text(v, max) {
    return typeof v === 'string' && v.trim() !== '' && v.length <= max &&
      !/[\u0000-\u001f\u007f]/.test(v);
  }
  function oneOf(v, values) {
    if (typeof v !== 'string') return false;
    for (var i = 0; i < values.length; i++) if (v === values[i]) return true;
    return false;
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (typeof v === 'string' && /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v.trim())) {
      var n = Number(v);
      return isFinite(n) ? n : NaN;
    }
    return NaN;
  }
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function civilMs(y, mo, d, hh, mm, ss) {
    var date = new Date(0);
    date.setUTCFullYear(y, mo - 1, d);
    date.setUTCHours(hh, mm, ss, 0);
    return date.getTime();
  }
  function dateParts(ms) {
    var d = new Date(ms);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
             hh: d.getUTCHours(), mm: d.getUTCMinutes(), ss: d.getUTCSeconds() };
  }
  function nightKey(ms) {
    var p = dateParts(ms), day = ms;
    if (p.hh < 18) day -= 86400000;
    var n = dateParts(day);
    return n.y + '-' + pad(n.mo) + '-' + pad(n.d);
  }
  function parseWall(value, withOffset) {
    if (typeof value !== 'string') return null;
    var pattern = withOffset
      ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?\+08:00$/
      : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;
    var m = pattern.exec(value);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3], hh = +m[4], mm = +m[5], ss = +(m[6] || 0);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
    var ms = civilMs(y, mo, d, hh, mm, ss), p = dateParts(ms);
    if (p.y !== y || p.mo !== mo || p.d !== d || p.hh !== hh || p.mm !== mm || p.ss !== ss) return null;
    return { ms: ms, nightKey: nightKey(ms), minutes: hh * 60 + mm };
  }
  function minutesOfDay(iso) {
    var p = parseWall(iso, false);
    return p ? p.minutes : NaN;
  }
  function hourGapMin(cardHours, iso) {
    var n = num(cardHours), p = parseWall(iso, false);
    if (!p || isNaN(n)) return NaN;
    var card = ((Math.round(n * 60) % 1440) + 1440) % 1440;
    var d = Math.abs(p.minutes - card);
    return Math.min(d, 1440 - d);
  }
  function angularGap(a, b) {
    var d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
  }
  function distanceM(a, b) {
    var rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
  }
  function inChina(lat, lon) {
    return finite(lat) && finite(lon) && lat >= CN_LAT[0] && lat <= CN_LAT[1] &&
      lon >= CN_LON[0] && lon <= CN_LON[1];
  }
  function canonical(value, omitDigest) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(function (v) { return canonical(v, false); }).join(',') + ']';
    var keys = Object.keys(value).filter(function (key) { return !omitDigest || key !== 'digest'; }).sort();
    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + canonical(value[key], false);
    }).join(',') + '}';
  }
  function digest(value) {
    var s = canonical(value, true), h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return 'fnv1a32:' + ('00000000' + h.toString(16)).slice(-8);
  }
  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }

  function predictionBaseProblems(s) {
    var g = [];
    if (!isObject(s)) return ['预测快照不是对象'];
    if (s.schema !== SCHEMA) g.push('预测快照 schema 不是 ' + SCHEMA);
    if (!text(s.predictionId, 120)) g.push('预测 ID 缺失或非法');
    if (s.protocolVersion !== 'M1-3') g.push('协议版本不是 M1-3');
    if (s.modelVersion !== MODEL_VERSION) g.push('模型版本不匹配');
    if (s.catalog !== CATALOG) g.push('星表不是 ' + CATALOG);
    var created = parseWall(s.createdAt, true), predicted = parseWall(s.predictedAt, true);
    if (!created) g.push('预测创建时间不是合法的 UTC+8 完整时间');
    if (!predicted) g.push('预测时刻不是合法的 UTC+8 完整时间');
    if (s.timeZone !== TIME_ZONE) g.push('预测时区不是 UTC+8');
    if (predicted && s.nightKey !== predicted.nightKey) g.push('观测夜与预测日期不符');
    if (!text(s.city, 120)) g.push('预测城市缺失');
    if (!text(s.place, 120)) g.push('预测观测点缺失');
    if (!inChina(s.lat, s.lon)) g.push('预测经纬度缺失或超出中国陆域');
    if (!isInteger(s.bortle) || s.bortle < 1 || s.bortle > 9 ||
        s.limit !== BORTLE_LIMIT[s.bortle - 1]) g.push('Bortle 与极限星等不匹配');
    if (!isCount(s.count)) g.push('预测颗数不是非负整数');
    if (!isInteger(s.anchor)) g.push('锚星编号缺失或非法');
    if (!text(s.name, 120)) g.push('锚星名称缺失');
    if (!finite(s.az) || s.az < 0 || s.az >= 360) g.push('预测方位角非法');
    if (!finite(s.alt) || s.alt <= 0 || s.alt > 90) g.push('预测仰角非法');
    if (s.window !== 'fist' || s.windowRadius !== 5 || s.windowDiameter !== 10) {
      g.push('预测窗口不是直径10°（半径5°）的一拳宽');
    }
    if (s.horizon !== HORIZON || s.extinction !== EXTINCTION) g.push('预测计数口径不是 ' + HORIZON + ' + ' + EXTINCTION);
    return g;
  }
  function predictionProblems(s) {
    var g = predictionBaseProblems(s);
    if (isObject(s) && (typeof s.digest !== 'string' || !/^fnv1a32:[0-9a-f]{8}$/.test(s.digest))) {
      g.push('预测校验摘要缺失或格式非法');
    } else if (isObject(s) && s.digest !== digest(s)) {
      g.push('预测校验摘要不匹配，快照可能已被改动');
    }
    return g;
  }
  function freezePrediction(input) {
    var g = predictionBaseProblems(input);
    if (g.length) throw new TypeError('预测快照不合法：' + g.join('；'));
    var out = clone(input);
    out.place = out.place.trim();
    out.city = out.city.trim();
    out.digest = digest(out);
    return deepFreeze(out);
  }
  function copyPrediction(prediction) { return clone(prediction); }

  function observationProblems(s, c) {
    var g = [];
    if (!isObject(c)) return ['观测条件不是对象'];
    if (c.cloud !== 'clear') g.push('云量不是「晴」');
    if (c.moon !== 'none') g.push('月亮还在天上（协议要求「无月」）');
    var dark = num(c.darkMin);
    if (isNaN(dark)) g.push('没填暗适应时长');
    else if (dark < DARK_MIN) g.push('暗适应只有 ' + dark + ' 分钟（协议要求≥' + DARK_MIN + '）');
    if (!oneOf(c.method, ['point'])) g.push('计数方法不是「裸眼逐颗点数」');
    if (!oneOf(c.window, ['fist'])) g.push('没确认「只数一拳宽窗口内」');
    if (!oneOf(c.block, ['none'])) g.push('视线有遮挡或灯光直射');
    if (!oneOf(c.coordSrc, ['gps', 'map'])) g.push('坐标来源不是现场 GPS 或地图定位点');
    if (c.timeZone !== TIME_ZONE) g.push('观测时区不是 UTC+8');
    var at = parseWall(c.countAt, false);
    if (!at) g.push('实际计数时刻不是合法的当地完整日期时间');
    if (!text(c.place, 120)) g.push('具体观测点未填');
    else if (isObject(s) && c.place.trim() !== s.place.trim()) g.push('观测点文本与锁定预测不一致');
    var lat = num(c.lat), lon = num(c.lon);
    if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      g.push('观测经纬度未填或不合法');
    } else if (isObject(s) && inChina(s.lat, s.lon)) {
      var dist = distanceM(s, { lat: lat, lon: lon });
      if (dist > SITE_TOL_M) g.push('观测点距预测点 ' + Math.round(dist) + ' 米（容差≤' + SITE_TOL_M + ' 米）');
    }
    if (!finite(num(c.az)) || num(c.az) < 0 || num(c.az) >= 360) g.push('实际方位角未填或非法');
    if (!finite(num(c.alt)) || num(c.alt) < 0 || num(c.alt) > 90) g.push('实际仰角未填或非法');
    if (!isInteger(num(c.anchor))) g.push('实际锚星编号未填或非法');
    else if (isObject(s) && num(c.anchor) !== s.anchor) g.push('实际锚星与锁定预测不一致');
    if (num(c.windowRadius) !== 5) g.push('实际窗口半径不是5°');
    var nelm = num(c.nelm);
    if (c.nelm !== '' && c.nelm != null && (isNaN(nelm) || nelm < -2 || nelm > 8)) {
      g.push('NELM 自评超出 -2 至 8 等');
    }
    if (isObject(s)) {
      var predicted = parseWall(s.predictedAt, true), created = parseWall(s.createdAt, true);
      if (at && predicted) {
        var gap = Math.abs(at.ms - predicted.ms) / 60000;
        if (gap > HOUR_TOL) g.push('计数时刻与预测时刻相差 ' + gap.toFixed(2) + ' 分钟（容差≤' + HOUR_TOL + '）');
        if (at.nightKey !== predicted.nightKey) g.push('预测与计数不属于同一观测夜（当地18:00为界）');
        if (created && at.ms < created.ms) g.push('计数时刻早于预测创建时间，不能作为预注册核对');
      }
      if (finite(num(c.az)) && finite(num(c.alt)) && finite(s.az) && finite(s.alt)) {
        if (angularGap(num(c.az), s.az) > DIR_TOL) g.push('实际方位角与预测相差超过 ' + DIR_TOL + '°');
        if (Math.abs(num(c.alt) - s.alt) > DIR_TOL) g.push('实际仰角与预测相差超过 ' + DIR_TOL + '°');
      }
    }
    return g;
  }
  function conditionGaps(cond, prediction) { return observationProblems(prediction, cond); }
  function conditionsValid(cond, prediction) { return observationProblems(prediction, cond).length === 0; }
  function auditGaps(cond) {
    var c = cond || {}, g = [], n = num(c.nelm);
    if (isNaN(n) || n < -2 || n > 8) g.push('NELM（肉眼极限星等）未独立自评');
    return g;
  }
  function invalidCounts() {
    return { code: 'invalid', diff: null, gaps: [],
      text: '请先锁定预测，并填入实际数到的颗数（非负整数）。' };
  }
  function invalidConditions(gaps) {
    return { code: 'invalid_cond', diff: null, gaps: gaps.slice(),
      text: '这次计数不可比，只能作参考——既不构成佐证，也不构成推翻。' +
            '未通过条件：' + gaps.join('；') + '。' };
  }
  function verdictPrediction(prediction, actual, cond) {
    if (!isCount(actual)) return invalidCounts();
    var pg = predictionProblems(prediction);
    if (pg.length) return invalidConditions(pg);
    var gaps = observationProblems(prediction, cond);
    var diff = actual - prediction.count;
    if (gaps.length) {
      var v = invalidConditions(gaps);
      v.diff = diff;
      return v;
    }
    var ad = Math.abs(diff);
    if (ad <= TOL) {
      return { code: 'confirm', diff: diff, gaps: [],
        text: '吻合：相差 ' + ad + ' 颗（≤' + TOL + '），本次裸眼观测与该夜该天区的模型预测一致。' };
    }
    return { code: 'falsify', diff: diff, gaps: [],
      text: '推翻（该夜该天区）：相差 ' + ad + ' 颗（>' + TOL + '）。本次观测不符合这条模型预测；单次结果不标定全球。' };
  }
  function verdict(predicted, actual, cond) {
    if (!isCount(actual)) return invalidCounts();
    var prediction = isObject(predicted) ? predicted : (cond && cond.prediction);
    if (!isObject(prediction)) {
      return invalidConditions(['缺少已锁定的预测快照，不能用当前页面参数代替']);
    }
    return verdictPrediction(prediction, actual, cond);
  }

  function recordProblems(r) {
    if (!isObject(r)) return ['记录不是对象'];
    var g = [];
    if (r.schema !== SCHEMA) g.push('记录 schema 不是 ' + SCHEMA);
    if (!text(r.recordId, 120)) g.push('记录 ID 缺失或非法');
    if (typeof r.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(r.recordedAt) ||
        !isFinite(Date.parse(r.recordedAt))) g.push('记录时间不是合法 UTC 时间戳');
    var v = verdictPrediction(r.prediction, r.actual, r.observation);
    if (!isCount(r.actual)) g.push('实测颗数不是非负整数');
    if (!isObject(r.verdict) || !oneOf(r.verdict.code, ['confirm', 'falsify', 'invalid_cond'])) {
      g.push('记录结论缺失或非法');
    } else {
      if (r.verdict.code !== v.code || r.verdict.diff !== v.diff) g.push('记录结论与预测、观测重算不一致');
      if (!Array.isArray(r.verdict.gaps)) g.push('记录条件缺口不是数组');
    }
    var at = parseWall(r.observation && r.observation.countAt, false);
    if (at && isFinite(Date.parse(r.recordedAt)) && Date.parse(r.recordedAt) < at.ms - 8 * 3600000) {
      g.push('记录时间早于观测时间');
    }
    return g;
  }
  function isEvidenceRecord(r) {
    var g = recordProblems(r);
    return !g.length && r.verdict.code !== 'invalid_cond';
  }
  function partitionRecords(records) {
    var out = { evidence: [], reference: [], quarantined: [] };
    if (!Array.isArray(records)) return out;
    records.forEach(function (r) {
      var g = recordProblems(r);
      if (g.length) out.quarantined.push(r);
      else if (r.verdict.code === 'invalid_cond') out.reference.push(r);
      else out.evidence.push(r);
    });
    return out;
  }

  var TOK = '(?:北纬|南纬|东经|西经|[NSEW北南东西])';
  var ITEM = new RegExp('(' + TOK + ')?\\s*(-?\\d+(?:\\.\\d+)?)\\s*(' + TOK + ')?', 'gi');
  function hemiSign(tok, isLat) {
    var t = String(tok == null ? '' : tok).toUpperCase();
    if (isLat) return (t.indexOf('S') >= 0 || t.indexOf('南') >= 0) ? -1
               : (t.indexOf('N') >= 0 || t.indexOf('北') >= 0) ? 1 : 0;
    return (t.indexOf('W') >= 0 || t.indexOf('西') >= 0) ? -1
         : (t.indexOf('E') >= 0 || t.indexOf('东') >= 0) ? 1 : 0;
  }
  function parsePlace(value) {
    var s = String(value == null ? '' : value).replace(/[°º度]/g, '')
      .replace(/[，、；;|]/g, ',').trim();
    if (!s) return { ok: false, msg: '请填「纬度, 经度」，例：41.10, 121.10' };
    var howMany = s.match(/\d+(?:\.\d+)?/g) || [];
    if (howMany.length !== 2) return { ok: false, msg: '认出 ' + howMany.length + ' 个数字，需要恰好两个：纬度 与 经度' };
    var items = [], m;
    ITEM.lastIndex = 0;
    while ((m = ITEM.exec(s)) !== null) {
      items.push({ v: parseFloat(m[2]), lat: hemiSign(m[1], true) || hemiSign(m[3], true),
                   lon: hemiSign(m[1], false) || hemiSign(m[3], false) });
      if (items.length === 2) break;
    }
    if (items.length !== 2) return { ok: false, msg: '没认出两个数，例：41.10, 121.10' };
    var a = items[0], b = items[1], latIt = a, lonIt = b;
    if (!a.lat && a.lon) { latIt = b; lonIt = a; }
    else if (!a.lat && !a.lon && b.lat) { latIt = b; lonIt = a; }
    var lat = latIt.lat ? latIt.lat * Math.abs(latIt.v) : latIt.v;
    var lon = lonIt.lon ? lonIt.lon * Math.abs(lonIt.v) : lonIt.v;
    if (!inChina(lat, lon)) {
      return { ok: false, msg: '内核按北京时间（UTC+8）推算星空，暂只支持中国陆域 ' +
        CN_LAT[0] + '–' + CN_LAT[1] + '°N / ' + CN_LON[0] + '–' + CN_LON[1] + '°E' };
    }
    return { ok: true, lat: lat, lon: lon,
      label: Math.abs(lat).toFixed(2) + '°' + (lat < 0 ? 'S' : 'N') + ' ' +
             Math.abs(lon).toFixed(2) + '°' + (lon < 0 ? 'W' : 'E') };
  }

  return {
    TOL: TOL, DARK_MIN: DARK_MIN, HOUR_TOL: HOUR_TOL, SITE_TOL_M: SITE_TOL_M, DIR_TOL: DIR_TOL,
    SCHEMA: SCHEMA, TIME_ZONE: TIME_ZONE, MODEL_VERSION: MODEL_VERSION, CATALOG: CATALOG,
    HORIZON: HORIZON, EXTINCTION: EXTINCTION, BORTLE_LIMIT: BORTLE_LIMIT.slice(),
    isCount: isCount, minutesOfDay: minutesOfDay, hourGapMin: hourGapMin,
    conditionGaps: conditionGaps, auditGaps: auditGaps, conditionsValid: conditionsValid,
    freezePrediction: freezePrediction, copyPrediction: copyPrediction,
    predictionProblems: predictionProblems, observationProblems: observationProblems,
    verdict: verdict, verdictPrediction: verdictPrediction,
    recordProblems: recordProblems, isEvidenceRecord: isEvidenceRecord, partitionRecords: partitionRecords,
    distanceM: distanceM, nightKey: nightKey, parseWall: parseWall, parsePlace: parsePlace
  };
});
