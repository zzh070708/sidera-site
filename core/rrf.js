/* ── core/rrf.js ──────────────────────────────────────────────────────────
   多路召回融合：RRF（Reciprocal Rank Fusion）+ 可选加权。

   为什么用 RRF 而不是"把两路分数相加"——**因为两路分数不可比**：
     · BM25 的 score 是无上界的似然比累加（本项目实测可达 ~20）；
     · 余弦相似度恒在 [0,1]。
   直接相加会让 BM25 单方面主导，"混合"名存实亡。RRF 只使用**排名**，
   天然免疫分数量纲差异：
   ┌───────────────────────────────────────────────────────────────────────┐
   │  RRF(d) = Σ_r  w_r / (k + rank_r(d))                                  │
   └───────────────────────────────────────────────────────────────────────┘
   k 为平滑常数（Cormack, Clarke & Buettcher, 2009, "Reciprocal Rank Fusion
   Outperforms Condorcet and Individual Rank Learning Methods", SIGIR）。
   原文取 k=60 用于大规模 TREC 集合；本项目的候选规模只有几百条，
   若沿用 k=60，1/(60+1) 与 1/(60+3) 几乎无差别 → 区分度被抹平。
   **因此本项目取 k=10**（经验值，见 tools/verify_rrf.js 的 E6 对照实验：
   k=60 时两路同现与单路独占的分数差仅为 k=10 时的约 1/6）。

   设计约束：零依赖、file:// 可跑、结果确定性；暴露 window.AV_RRF。
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var DEFAULT_K = 10;

  /* 单路结果的规范化：接受 [{id,score,doc}] 或 [id,...]，统一成 {id,doc,score}
     同时按传入顺序建立 rank（调用方需自负"已按相关性降序"） */
  function normalizeList(list) {
    var out = [];
    (list || []).forEach(function (item, i) {
      if (item == null) return;
      if (typeof item === 'object') {
        if (item.id == null) return;
        out.push({ id: String(item.id), doc: item.doc || null, score: item.score, rank: i + 1 });
      } else {
        out.push({ id: String(item), doc: null, score: null, rank: i + 1 });
      }
    });
    return out;
  }

  /* fused: [{ id, doc, rrf, sources:{ <name>: rank }, scores:{ <name>: score } }]
     channels: [{ name, list, weight }]，weight 缺省为 1 */
  function fuse(channels, opts) {
    var o = opts || {};
    var k = (typeof o.k === 'number' && o.k >= 0) ? o.k : DEFAULT_K;

    var acc = Object.create(null);
    (channels || []).forEach(function (ch) {
      if (!ch || !ch.list) return;
      var name = ch.name || ('ch' + (channels.indexOf(ch)));
      var w = (typeof ch.weight === 'number') ? ch.weight : 1;
      var norm = normalizeList(ch.list);
      /* 同一路内的重复 id 只取排名更靠前的那次（防御性） */
      var seen = Object.create(null);
      norm.forEach(function (it) {
        if (seen[it.id]) return;
        seen[it.id] = 1;
        var rec = acc[it.id] || (acc[it.id] = {
          id: it.id,
          doc: it.doc,
          rrf: 0,
          weightSum: 0,
          sources: Object.create(null),
          scores: Object.create(null)
        });
        if (!rec.doc && it.doc) rec.doc = it.doc;
        rec.rrf += w / (k + it.rank);
        rec.weightSum += w;
        rec.sources[name] = it.rank;
        if (it.score != null) rec.scores[name] = it.score;
      });
    });

    var out = [];
    for (var id in acc) out.push(acc[id]);
    /* 主序 rrf 降序；次序：命中路数多者优先；末序 id 升序 → 完全确定性 */
    out.sort(function (a, b) {
      if (b.rrf !== a.rrf) return b.rrf - a.rrf;
      var na = Object.keys(a.sources).length, nb = Object.keys(b.sources).length;
      if (nb !== na) return nb - na;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    out.forEach(function (r, i) { r.fusedRank = i + 1; });
    return out;
  }

  /* 便捷：直接给出前 topK 条 */
  function top(fusedList, topK) {
    return (typeof topK === 'number' && topK > 0) ? fusedList.slice(0, topK) : fusedList;
  }

  /* 诊断：解释某条结果"为什么被推上来"——答辩时可现场拆解 */
  function explain(fusedList, id) {
    for (var i = 0; i < fusedList.length; i++) {
      if (fusedList[i].id === String(id)) {
        var r = fusedList[i];
        var parts = [];
        for (var n in r.sources) parts.push(n + ' 第 ' + r.sources[n] + ' 名');
        return { id: r.id, rrf: r.rrf, fusedRank: r.fusedRank, why: parts.join(' + ') };
      }
    }
    return null;
  }

  window.AV_RRF = {
    K: DEFAULT_K,
    normalizeList: normalizeList,
    fuse: fuse,
    top: top,
    explain: explain
  };
})();
