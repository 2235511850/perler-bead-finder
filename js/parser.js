// parser.js —— 色号文本解析（模板格式）
// 全局暴露 window.Parser

(function () {
  // 模板格式：每行 "色号 颗数"，颗数省略=1；色号 = 字母+数字，例如 A1 / H12
  const CODE_RE = /^[A-Za-z]\d{1,3}$/;

  function parse(text) {
    const lines = String(text || '').split(/\r?\n/);
    const map = new Map(); // code -> count
    const invalid = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      // 允许注释行（以 # 或 // 开头）
      if (raw.startsWith('#') || raw.startsWith('//')) continue;
      const parts = raw.split(/[\s,;\t]+/).filter(Boolean);
      if (parts.length === 0) continue;
      const codeRaw = parts[0];
      const code = Util.normalizeCode(codeRaw);
      if (!CODE_RE.test(code)) {
        invalid.push({ line: i + 1, raw, reason: '色号格式错误，应为字母+数字，如 A1' });
        continue;
      }
      let count = 1;
      if (parts.length > 1) {
        const n = Number(parts[1]);
        if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
          invalid.push({ line: i + 1, raw, reason: '颗数必须为正整数' });
          continue;
        }
        count = n;
      }
      map.set(code, (map.get(code) || 0) + count);
    }
    const colors = Array.from(map.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => {
        // 按字母升序，再按数字升序
        const ar = a.code.match(/^([A-Z])(\d+)$/);
        const br = b.code.match(/^([A-Z])(\d+)$/);
        if (!ar || !br) return a.code.localeCompare(b.code);
        if (ar[1] !== br[1]) return ar[1].localeCompare(br[1]);
        return Number(ar[2]) - Number(br[2]);
      });
    return { colors, invalid };
  }

  function serialize(colors) {
    return (colors || []).map(c => `${c.code} ${c.count}`).join('\n');
  }

  function templateSample() {
    return [
      '# 每行一个色号，空格分隔颗数，颗数省略=1',
      'A1 12',
      'A3 30',
      'B2 8',
      'C3 45',
      'H5 6'
    ].join('\n');
  }

  window.Parser = {
    parse: parse,
    serialize: serialize,
    templateSample: templateSample,
    CODE_RE: CODE_RE
  };
})();
