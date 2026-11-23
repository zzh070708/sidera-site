/* ── core/vector.js ───────────────────────────────────────────────────────
   向量空间检索（TF-IDF 加权 + 余弦相似度），与 core/bm25.js 互补。

   为什么需要向量召回——它与 BM25 的**失效模式不同**：
     · BM25 是"词项精确匹配"：查询里没有出现过的字，一条都召回不了。
       问"最亮的那颗星是什么" → 语料里若写的是"天狼星 亮度 -1.46"，
       BM25 对"最亮的"这几个字毫无办法（bigram 也不重叠）。
     · 向量模型把文档与查询映射到同一空间，用**加权词项重合度**衡量整体
       语义接近，对表述差异更宽容（这是经典的"词袋 + 余弦"检索观，
       见 Salton & Buckley, 1988, "Term-Weighting Approaches in Automatic
       Text Retrieval"）。

   本实现刻意保持与 BM25 **共享同一套分词器**（见下方 tokenize 说明），
   这样两路召回的差异只来自"权重与聚合方式"，而不是分词口径，
   融合时（core/rrf.js）才具备可比性。

   ┌ 模型定义 ─────────────────────────────────────────────────────────────┐
   │  tf(t,d)  = 1 + ln( f(t,d) )                     （次线性词频压缩）    │
   │  idf(t)   = ln( (1 + N) / (1 + df(t)) ) + 1       （平滑 IDF，恒正）   │
   │  w(t,d)   = tf(t,d) · idf(t)                                          │
   │  vec(d)   = w(t,d) 经 L2 归一化  → 单位向量                           │
   │  sim(q,d) = cos = Σ_t w(t,q)·w(t,d)   （两边均已归一化，点积即余弦）   │
   └───────────────────────────────────────────────────────────────────────┘
   平滑 IDF 采用 sklearn 的 HashingTF/TfidfTransformer 同一形式
   （`smooth_idf=True`），保证“任何词都有正权重”，避免零向量。

   设计约束（与 core/ 其它模块一致）：
     1. 零依赖、file:// 可跑；
     2. 同步构建（语料 ~500 条，构建耗时可忽略）；
     3. 暴露 window.AV_VECTOR。
   ──────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  /* 与 bm25.js 保持**完全一致**的分词口径（字级 bigram + 整段 + 拉丁词）。
     这里复制而非引用，是为了让两个模块都能单独加载（file:// 下无模块系统，
     且 verify_*.js 各自在最小沙箱里跑单文件）。

     ⚠️ 若修改任一侧的分词规则，必须同步另一侧与 tools/verify_vector.js 的
        D1 断言，否则融合分值的可比性不成立。 */
  function normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[\u3000\s]+/g, ' ')
      .trim();
  }

  function tokenize(text) {
    var t = normalize(text);
    var grams = Object.create(null);
    var len = 0;
    function add(g) {
      if (!g) return;
      grams[g] = (grams[g] || 0) + 1;
      len++;
    }
    var re = /[\u4e00-\u9fff]+|[a-z0-9]+/g, m;
    while ((m = re.exec(t)) !== null) {
      var seg = m[0];
      if (/[\u4e00-\u9fff]/.test(seg)) {
        if (seg.length === 1) { add(seg); }
        else {
          for (var i = 0; i < seg.length - 1; i++) add(seg.substr(i, 2));
          if (seg.length >= 3) add(seg);
        }
      } else {
        add(seg);
      }
    }
    return { grams: grams, len: len };
  }

  /* L2 归一化辅助：就地折算出模长，避免重复遍历 */
  function l2norm(vec) {
    var s = 0;
    for (var k in vec) s += vec[k] * vec[k];
    return Math.sqrt(s);
  }

  /* 构建索引
     docs: [{ id, text, ... }]
     返回：{ docs:[{src, tfidf:[{t,w}], norm}], idf, N, vocabSize }
     说明：文档向量以**稀疏数组**存（只存非零项），余弦用双指针合并求和，
          不做稠密展开——语料虽小，但这是向量检索的标准省算做法。 */
  function build(docs) {
    var list = (docs || []).filter(function (d) { return d && d.text; });
    var N = list.length;

    var df = Object.create(null);
    var toks = list.map(function (d) {
      var tk = tokenize(d.text);
      for (var g in tk.grams) df[g] = (df[g] || 0) + 1;
      return tk.grams;
    });

    /* 平滑 IDF：恒正，不会产生零向量 */
    var idf = Object.create(null);
    for (var g2 in df) {
      idf[g2] = Math.log((1 + N) / (1 + df[g2])) + 1;
    }

    var idx = { docs: [], idf: idf, N: N, vocabSize: Object.keys(df).length };

    toks.forEach(function (grams, i) {
      var raw = Object.create(null);
      for (var g in grams) {
        /* tf = 1 + ln(f)，f>=1 恒有 tf>=1 */
        var tf = 1 + Math.log(grams[g]);
        raw[g] = tf * (idf[g] || 0);
      }
      var norm = l2norm(raw);
      var sparse = [];
      for (var g3 in raw) {
        if (raw[g3] > 0) sparse.push([g3, raw[g3] / (norm || 1)]);
      }
      /* ⚠️ 必须按词项字典序排序：dot() 是双指针合并，依赖两侧有序。
         早期版本漏了这一步，导致余弦被静默算小（应为 0.62 时算出 0.19），
         且不报错——属于"结果错但不崩"的静默失真，最需要在测试里钉死。 */
      sparse.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
      idx.docs.push({ src: list[i], vec: sparse, norm: norm || 1 });
    });

    return idx;
  }

  /* 把查询投到同一空间（同样 L2 归一化） */
  function encodeQuery(idx, query) {
    var tk = tokenize(query);
    var raw = Object.create(null);
    for (var g in tk.grams) {
      /* 查询侧只用"是否出现"级别的 tf（1+ln(1)=1），
         因为查询极短，重复字不构成有意义的相关性信号 */
      raw[g] = (idx.idf[g] || 0);
    }
    var norm = l2norm(raw);
    var sparse = [];
    for (var g2 in raw) {
      if (raw[g2] > 0) sparse.push([g2, raw[g2] / (norm || 1)]);
    }
    /* 与文档侧同口径排序，dot() 的双指针合并才成立 */
    sparse.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
    return sparse;
  }

  /* 稀疏点积（两边均已归一化 → 结果即余弦相似度）
     ⚠️ 前置条件：a、b 必须按词项字典序排列。build() / encodeQuery() 已保证。
     防御：若调用方传入乱序（外部误用），线性扫描兜底 —— 宁可慢，
     绝不允许"结果错但不报错"。判据：单次扫描确认有序性。 */
  function isSorted(a) {
    for (var i = 1; i < a.length; i++) if (a[i - 1][0] > a[i][0]) return false;
    return true;
  }

  function dot(a, b) {
    if (!isSorted(a) || !isSorted(b)) return dotLinear(a, b);
    var i = 0, j = 0, s = 0;
    while (i < a.length && j < b.length) {
      if (a[i][0] === b[j][0]) { s += a[i][1] * b[j][1]; i++; j++; }
      else if (a[i][0] < b[j][0]) { i++; }
      else { j++; }
    }
    return s;
  }

  /* 兜底：与顺序无关的哈希合并（外部误调用时保证正确性） */
  function dotLinear(a, b) {
    var m = Object.create(null), s = 0, k;
    for (k = 0; k < a.length; k++) m[a[k][0]] = a[k][1];
    for (k = 0; k < b.length; k++) if (m[b[k][0]] != null) s += m[b[k][0]] * b[k][1];
    return s;
  }

  /* 检索：返回 [{ id, score, doc }]，按 score 降序，只保留 score>0 */
  function search(idx, query, topK) {
    var out = [];
    if (!idx || !idx.N) return out;
    var qv = encodeQuery(idx, query);
    if (!qv.length) return out;

    idx.docs.forEach(function (rec, i) {
      var s = dot(qv, rec.vec);
      if (s > 0) out.push({ id: rec.src.id, score: s, doc: rec.src });
    });
    /* 并列分按 id 升序，保证结果**确定性**（同分不依赖遍历顺序） */
    out.sort(function (a, b) {
      return (b.score - a.score) || String(a.id).localeCompare(String(b.id));
    });
    return (typeof topK === 'number' && topK > 0) ? out.slice(0, topK) : out;
  }

  /* 诊断用：打印某条文档的 Top-N 高权重词项（答辩时可现场解释"为什么召回它"） */
  function explainTop(idx, docIdx, n) {
    var rec = idx.docs[docIdx];
    if (!rec) return [];
    return rec.vec.slice()
      .sort(function (a, b) { return b[1] - a[1]; })
      .slice(0, n || 5)
      .map(function (p) { return { term: p[0], weight: p[1] }; });
  }

  window.AV_VECTOR = {
    normalize: normalize,
    tokenize: tokenize,
    build: build,
    encodeQuery: encodeQuery,
    isSorted: isSorted,
    dot: dot,
    dotLinear: dotLinear,
    search: search,
    explainTop: explainTop
  };
})();
