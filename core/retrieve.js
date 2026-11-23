/* ── core/retrieve.js ─────────────────────────────────────────────────────
   混合检索总入口：把"确定性快路径"与"两路统计召回"编排成一条管线。

   ┌ 三层架构 ─────────────────────────────────────────────────────────────┐
   │  L0 快路径（确定性）  精确表 / 正则 → 命中即返回，零歧义               │
   │  L1 统计召回（并行）  BM25(core/bm25.js) ⊕ 向量(core/vector.js)        │
   │  L2 融合（core/rrf.js）RRF 重排 → 统一候选表                          │
   └───────────────────────────────────────────────────────────────────────┘

   **为什么要分三层，而不是直接上混合检索**：
     BM25 与向量都可能在**强精确**查询上犯错（"天狼星"被"天狼"的其它实体
     抢走），而精确表命中是零歧义的。因此 L0 命中时直接短路，
     统计召回只在 L0 未命中时兜底 —— 这保证"确定性行为不被统计模型扰动"。
     这是工业检索的常规做法（rule-first, model-second），不是本项目发明。

   **本模块为编排层，不含算法**；算法分别在 bm25.js / vector.js / rrf.js。
   数据注入：语料由调用方给出（本项目为 index.html 内的 stars / FAQ / 别名），
   本模块不直接读 DOM，便于 Node 端单测。

   暴露 window.AV_RETRIEVE。
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function hasBM25() { return typeof window.AV_BM25 === 'object' && window.AV_BM25; }
  function hasVec() { return typeof window.AV_VECTOR === 'object' && window.AV_VECTOR; }
  function hasRRF() { return typeof window.AV_RRF === 'object' && window.AV_RRF; }

  /* 引擎：一次性建好两路索引，之后可反复 search */
  function create(corpus, opts) {
    var o = opts || {};
    var docs = (corpus || []).filter(function (d) { return d && d.text && d.id != null; });

    var engine = {
      docs: docs,
      N: docs.length,
      bm25: null,
      vector: null,
      stages: { bm25: false, vector: false, rrf: false }
    };

    if (hasBM25() && !o.disableBM25) {
      engine.bm25 = window.AV_BM25.build(docs);
      engine.stages.bm25 = true;
    }
    if (hasVec() && !o.disableVector) {
      engine.vector = window.AV_VECTOR.build(docs);
      engine.stages.vector = true;
    }
    engine.stages.rrf = hasRRF() && engine.stages.bm25 && engine.stages.vector;

    /* 降级记录：任何一路缺席都要留下可观测的痕迹，不允许静默 */
    engine.missing = [];
    if (!engine.stages.bm25) engine.missing.push('bm25');
    if (!engine.stages.vector) engine.missing.push('vector');
    if (!engine.stages.rrf) engine.missing.push('rrf');
    return engine;
  }

  /* 单路检索（供对照实验使用） */
  function searchSingle(engine, query, topK, which) {
    if (!engine) return [];
    if (which === 'bm25') return engine.bm25 ? window.AV_BM25.search(engine.bm25, query, topK) : [];
    if (which === 'vector') return engine.vector ? window.AV_VECTOR.search(engine.vector, query, topK) : [];
    return [];
  }

  /* 混合检索：RRF 融合两路
     fastPath: 可选，一个函数 (query) => [{id, doc}] —— L0 快路径钩子。
               返回非空时短路（保证确定性优先）。 */
  function search(engine, query, opts) {
    var o = opts || {};
    var topK = o.topK || 8;
    var pool = o.pool || 20;   /* 每路先取 pool 条再融合 */

    var result = {
      query: query,
      mode: null,        /* 'fast' | 'hybrid' | 'single' | 'none' */
      items: [],
      channels: [],
      missing: engine ? engine.missing : ['engine']
    };
    if (!engine || !engine.N) { result.mode = 'none'; return result; }

    /* L0 快路径短路 */
    if (typeof o.fastPath === 'function') {
      var fp = o.fastPath(query) || [];
      if (fp.length) {
        result.mode = 'fast';
        result.items = fp.map(function (it, i) {
          return { id: String(it.id), doc: it.doc || it, score: null, rank: i + 1, fusedRank: i + 1, rrf: null, sources: { fast: i + 1 } };
        }).slice(0, topK);
        result.channels = [{ name: 'fast', size: fp.length }];
        return result;
      }
    }

    /* L1 两路召回 */
    var chans = [];
    var bm = engine.bm25 ? window.AV_BM25.search(engine.bm25, query, pool) : null;
    var ve = engine.vector ? window.AV_VECTOR.search(engine.vector, query, pool) : null;
    if (bm && bm.length) chans.push({ name: 'bm25', list: bm, weight: o.wBM25 || 1 });
    if (ve && ve.length) chans.push({ name: 'vector', list: ve, weight: o.wVector || 1 });

    if (!chans.length) { result.mode = 'none'; return result; }
    result.channels = chans.map(function (c) { return { name: c.name, size: c.list.length }; });

    /* L2 融合：两路都在 → RRF；只剩一路 → 直接透传（诚实反映降级） */
    if (chans.length >= 2 && hasRRF()) {
      var fused = window.AV_RRF.fuse(chans, { k: o.k });
      result.mode = 'hybrid';
      result.items = window.AV_RRF.top(fused, topK);
    } else {
      var only = chans[0];
      result.mode = 'single';
      result.items = window.AV_RRF
        ? window.AV_RRF.top(window.AV_RRF.fuse([only], { k: o.k }), topK)
        : only.list.slice(0, topK).map(function (it, i) {
            return { id: String(it.id), doc: it.doc, score: it.score, rank: i + 1, fusedRank: i + 1, rrf: null, sources: {} };
          });
    }
    return result;
  }

  /* 自检：报告各层可用性（供 verify_retrieve.js 与运行时诊断） */
  function selftest() {
    return {
      bm25: !!hasBM25(),
      vector: !!hasVec(),
      rrf: !!hasRRF(),
      ready: !!(hasBM25() && hasVec() && hasRRF())
    };
  }

  window.AV_RETRIEVE = {
    create: create,
    search: search,
    searchSingle: searchSingle,
    selftest: selftest
  };
})();
