/* ── core/bm25.js ─────────────────────────────────────────────────────────
   BM25 关键词检索（实现参考：Robertson & Zaragoza, 2009, "The Probabilistic
   Relevance Framework: BM25 and Beyond"）。
   本项目为**自行实现**，非引入第三方库——因为项目约束是零依赖、file:// 可跑。

   ┌ BM25 公式（本项目采用的形式）────────────────────────────────────────┐
   │  score(D, Q) = Σ_{t ∈ Q} IDF(t) · ─────────────────────────────      │
   │                                   f(t,D) · (k1 + 1)                  │
   │             ────────────────────────────────────────────────         │
   │              f(t,D) + k1 · (1 - b + b · |D| / avgdl)                 │
   │                                                                       │
   │  IDF(t) = ln( 1 + (N - n(t) + 0.5) / (n(t) + 0.5) )                  │
   └───────────────────────────────────────────────────────────────────────┘
   k1 = 1.5（词频饱和），b = 0.75（长度归一化）—— 文献常用默认值。

   中文分词方案：**字级 bigram**（"织女星" → 织女 / 女星）。
   理由：不引入词典、不做最大匹配，纯前端零依赖；对"实体名检索"这种
   短查询效果接近分词，且对未登录别名天然鲁棒（无需维护词表）。

   设计约束：
     1. 零依赖、可在 file:// 运行；
     2. 同步构建索引（数据量 ~500 实体，构建耗时可忽略）；
     3. 暴露 window.AV_BM25 供核心检索与验证脚本调用。
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var K1 = 1.5;
  var B = 0.75;

  /* 归一化：与项目既有 norm() 保持一致的下标处理策略，
     但这里额外保留字母数字（英文名需要），并把连续空白压成单空格。 */
  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\u3000\s]+/g, ' ')
      .trim();
  }

  /* 分词：中文取字级 bigram（单字查询时退化为 unigram），拉丁按词切。
     这样 "织女星" → ['织女','女星']，同时保留 '织女星' 整串以增强精确性。
     返回 { grams: 计频表, len: 有效词元数 } */
  function tokenize(text) {
    var t = normalize(text);
    var grams = Object.create(null);
    var len = 0;
    function add(g) {
      if (!g) return;
      grams[g] = (grams[g] || 0) + 1;
      len++;
    }

    /* 按"中文段 / 非中文段"切分，分别处理 */
    var re = /[\u4e00-\u9fff]+|[a-z0-9]+/g, m;
    while ((m = re.exec(t)) !== null) {
      var seg = m[0];
      if (/[\u4e00-\u9fff]/.test(seg)) {
        if (seg.length === 1) { add(seg); }
        else {
          for (var i = 0; i < seg.length - 1; i++) add(seg.substr(i, 2));
          /* 整段也作为一个词元（提升完整实体名的权重） */
          if (seg.length >= 3) add(seg);
        }
      } else {
        add(seg);
      }
    }
    return { grams: grams, len: len };
  }

  /* 索引构建 */
  function build(docs) {
    /* docs: [{ id, text, ... }]，text 为用于检索的文本（可拼接名称+别名+描述） */
    var list = (docs || []).filter(function (d) { return d && d.text; });
    var idx = {
      docs: [],            // 原始文档（保留外部字段）
      df: Object.create(null),  // 词元 -> 文档频次
      N: list.length,
      avgdl: 0,
      postings: Object.create(null) // 词元 -> { docIdx: tf }
    };

    var totalLen = 0;
    list.forEach(function (d, i) {
      var tk = tokenize(d.text);
      var rec = { src: d, len: tk.len, tf: tk.grams };
      idx.docs.push(rec);
      totalLen += tk.len;
      for (var g in tk.grams) {
        idx.df[g] = (idx.df[g] || 0) + 1;
        if (!idx.postings[g]) idx.postings[g] = Object.create(null);
        idx.postings[g][i] = tk.grams[g];
      }
    });
    idx.avgdl = idx.N ? totalLen / idx.N : 0;

    /* 预计算 IDF，避免每次查询重复算 */
    idx.idf = Object.create(null);
    for (var g2 in idx.df) {
      var n = idx.df[g2];
      idx.idf[g2] = Math.log(1 + (idx.N - n + 0.5) / (n + 0.5));
    }
    return idx;
  }

  /* 检索：返回 [{ id, score, doc }]，按 score 降序 */
  function search(idx, query, topK) {
    var out = [];
    if (!idx || !idx.N) return out;
    var q = tokenize(query);
    var keys = Object.keys(q.grams);
    if (!keys.length) return out;

    var acc = Object.create(null);   // docIdx -> score
    for (var i = 0; i < keys.length; i++) {
      var g = keys[i];
      var post = idx.postings[g];
      if (!post) continue;
      var idf = idx.idf[g] || 0;
      var qtf = q.grams[g];
      for (var di in post) {
        var f = post[di];
        var rec = idx.docs[di];
        var denom = f + K1 * (1 - B + B * (idx.avgdl ? rec.len / idx.avgdl : 1));
        var s = idf * (f * (K1 + 1)) / (denom || 1);
        acc[di] = (acc[di] || 0) + s * qtf;
      }
    }
    for (var d2 in acc) {
      out.push({ id: idx.docs[d2].src.id, score: acc[d2], doc: idx.docs[d2].src });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return (typeof topK === 'number' && topK > 0) ? out.slice(0, topK) : out;
  }

  window.AV_BM25 = {
    K1: K1, B: B,
    normalize: normalize,
    tokenize: tokenize,
    build: build,
    search: search
  };
})();
