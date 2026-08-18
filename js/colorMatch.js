// colorMatch.js —— 感知色差匹配（Oklab 色空间）
// 算法参考：Björn Ottosson 的 Oklab 公式 (https://bottosson.github.io/posts/oklab/)
// 纯 JS，零依赖。
// 全局暴露 window.ColorMatch
(function () {

  // ---------------- sRGB <-> linear sRGB ----------------
  function srgbToLinear(c) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  function rgbToLinear(r, g, b) {
    return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  }

  // ---------------- linear sRGB -> Oklab ----------------
  function linearToOklab(r, g, b) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return [
      0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
      1.9779984951 * l_ - 2.4285922420 * m_ + 0.4505937099 * s_,
      0.0259040374 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    ];
  }

  // 计算一组 RGB 的 Oklab 表示一次，复用线性转换
  function rgbToOklab(r, g, b) {
    return linearToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
  }

  // ---------------- Oklab 距离 ----------------
  function oklabDistance(a, b) {
    const dl = a[0] - b[0];
    const da = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  // ---------------- 主 API ----------------

  /**
   * 在板上的色号集合里，找出与 unmappedCode 感知最近的前 N 个色号
   * @param {string} unmappedCode 图纸中的色号（需在 MARD221 表中）
   * @param {string[]} boardCodes 板上所有色号（去重）
   * @param {number} [topN=3]  返回前 N 个候选
   * @returns {{ list: Array<{code, distance}>, error: string|null }}
   */
  function findClosestOnBoard(unmappedCode, boardCodes, topN) {
    const limit = Math.max(1, Number(topN) || 3);
    const targetRGB = window.MARD221_RGB && window.MARD221_RGB[unmappedCode];
    if (!targetRGB) {
      return { list: [], error: 'no_rgb_reference' };
    }
    const target = rgbToOklab(targetRGB[0], targetRGB[1], targetRGB[2]);

    const scored = (boardCodes || [])
      .map(code => {
        const c = window.MARD221_RGB[code];
        if (!c) return null;
        return {
          code,
          distance: oklabDistance(target, rgbToOklab(c[0], c[1], c[2]))
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);

    if (!scored.length) {
      return { list: [], error: 'no_board_codes' };
    }
    return { list: scored.slice(0, limit), error: null };
  }

  /**
   * 取某色号的感知距离阈值上限，用于过滤过远候选
   * 默认 0.5 足够宽松（Oklab 距离基本不会超过 1）
   */
  const MAX_CANDIDATE_DISTANCE = 0.5;

  /**
   * 从任意 HEX 颜色找出 221 色表中最接近的前 N 个色号
   * @param {string} hex 例如 "#f4e2d8" 或 "f4e2d8"
   * @param {number} [topN=3] 返回前 N 个候选
   * @returns {{ list: Array<{code, distance, hex}>, error: string|null }}
   */
  function findClosestFromHex(hex, topN) {
    const limit = Math.max(1, Number(topN) || 3);
    const cleaned = hex.replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      return { list: [], error: 'invalid_hex' };
    }
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    const target = rgbToOklab(r, g, b);
    const codes = window.MARD221_CODES || Object.keys(window.MARD221_RGB || {});
    const scored = codes
      .map(code => {
        const c = window.MARD221_RGB[code];
        if (!c) return null;
        return {
          code,
          hex: window.MARD221[code] || '#' + cleaned.toUpperCase(),
          distance: oklabDistance(target, rgbToOklab(c[0], c[1], c[2]))
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);

    if (!scored.length) {
      return { list: [], error: 'no_color_data' };
    }
    return { list: scored.slice(0, limit), error: null };
  }

  /**
   * 色差值到人话描述
   * 阈值为经验值，参考 [perler-bead-algorithm] 等项目
   */
  function describeDistance(d) {
    if (d == null) return { text: '未知', level: 'unknown', color: '#94a3b8' };
    if (d < 0.05) return { text: '几乎一致', level: 'tiny', color: '#10b981' };
    if (d < 0.10) return { text: '很小',     level: 'small', color: '#22c55e' };
    if (d < 0.20) return { text: '较明显',   level: 'noticeable', color: '#f59e0b' };
    if (d < 0.30) return { text: '明显',     level: 'big', color: '#f97316' };
    return { text: '差别大', level: 'huge', color: '#ef4444' };
  }

  window.ColorMatch = {
    rgbToOklab,
    oklabDistance,
    findClosestOnBoard,
    findClosestFromHex,
    describeDistance,
    MAX_CANDIDATE_DISTANCE
  };
})();
