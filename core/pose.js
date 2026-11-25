/* ============================================================================
 * 星阑归序 · 「手机姿态 → 天空方向」换算（全项目只这一份）
 *   手机只报原始 alpha/beta/gamma，谁来画谁来换算。换算一旦在电脑端和手机端
 *   各写一遍，就会出现「同一只手、两个方向」，而且两边都自洽、单查看不出来。
 *   口径：M = Rz(a)·Rx(b)·Ry(g)，a=(−alpha+azOff)°，b=beta°，g=gamma°；
 *   手机坐标系 x=右 y=上 z=屏幕外，earth 系取 (东,北,天顶)。
 *   视向 = M·(0,0,−1)（屏幕法线朝外，看的是反方向），屏幕上方 = M·(0,1,0)。
 *   踩过的坑：屏幕上方那条曾按另一套展开式手写，结果「朝正北看时整片天上下
 *   颠倒」——错的基照样满足「单位长 + 与视向垂直」。所以现在只建一次 M，
 *   视向与上方都从同一份系数里取列。
 * ==========================================================================*/
(function () {
  'use strict';
  var DEG = Math.PI / 180;

  function toView(alpha, beta, gamma, azOffDeg) {
    var a = (-alpha + (azOffDeg || 0)) * DEG, b = beta * DEG, g = gamma * DEG;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
    /* M = Rz(a)·Rx(b)·Ry(g) 的三个列向量（按 earth 东/北/天顶 排）：
       列0 = M·(1,0,0) 手机右，列1 = M·(0,1,0) 手机上，列2 = M·(0,0,1) 屏幕外 */
    var c0e = ca * cg - sa * sb * sg, c0n = sa * cg + ca * sb * sg, c0u = -cb * sg;
    var c1e = -sa * cb, c1n = ca * cb, c1u = sb;
    var c2e = ca * sg + sa * sb * cg, c2n = sa * sg - ca * sb * cg, c2u = cb * cg;
    /* 视向 = −列2 */
    var vx = -c2e, vy = -c2n, vz = -c2u;
    /* 屏幕上方 = 列1；正立时它本就与视向垂直（同一旋转矩阵的两列），
       仍做一次正交化：数值噪声或将来有人改口径时，这里退化成投影而不是炸掉。 */
    var ux = c1e, uy = c1n, uz = c1u;
    var d = ux * vx + uy * vy + uz * vz;
    ux -= d * vx; uy -= d * vy; uz -= d * vz;
    var len = Math.sqrt(ux * ux + uy * uy + uz * uz);
    return {
      az: (Math.atan2(vx, vy) / DEG + 360) % 360,
      alt: Math.asin(Math.max(-1, Math.min(1, vz))) / DEG,
      e: vx, n: vy, u: vz,
      ux: len > 1e-4 ? ux / len : 0, uy: len > 1e-4 ? uy / len : 0, uz: len > 1e-4 ? uz / len : 1
    };
  }

  /* 反向：没有陀螺仪时用同一口径伪造一组 alpha/beta/gamma，
     这样下游拿到的永远是同一种数据。
     物理口径：alpha＝手机顶端指的罗盘方位，beta＝90＋高度，gamma＝0，
     代进上面的 M 正好还原 (方位, 高度)，所以这里就是 alpha = 方位。
     早前写成 180−方位 是把「罗盘读数」和「罗盘反方向」混了，
     拖到正东会发一个正西的读数——电脑端那片天会转 180°。 */
  function fromAzAlt(azDeg, altDeg) {
    return {
      alpha: ((azDeg % 360) + 360) % 360,
      beta: 90 + altDeg,
      gamma: 0
    };
  }

  window.__POSE__ = { version: 'prod-1', toView: toView, fromAzAlt: fromAzAlt };
})();
