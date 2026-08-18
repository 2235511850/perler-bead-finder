// colorFinder.js —— 视图 B：色号查找器

(function () {

  // ---------- 辅助：检测并解析 HEX ----------
  function parseHexInput(val) {
    const hex = (val || '').trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{6}$/.test(hex)) {
      return '#' + hex;
    }
    return null;
  }

  // ---------- 辅助：渲染颜色预览卡片 ----------
  function renderSwatch(hex, size) {
    const s = size || 48;
    return `<span style="
      display:inline-block;width:${s}px;height:${s}px;
      background:${hex};border-radius:6px;
      border:1.5px solid rgba(0,0,0,.12);
      vertical-align:middle;flex-shrink:0;
    "></span>`;
  }

  // ---------- 辅助：渲染单个候选结果 ----------
  function renderHexMatchCard(result, pattern, patternId) {
    const { list, error } = result;
    if (error) {
      const msg = error === 'invalid_hex' ? 'HEX 格式不正确，请输入 6 位十六进制颜色（如 #f4e2d8）' : '找不到色库数据';
      return `<div class="text-sm text-slate-500 mt-2">${msg}</div>`;
    }

    const best = list[0];
    const distInfo = ColorMatch.describeDistance(best.distance);

    return `
      <div class="space-y-3 mt-3">
        ${list.map((item, i) => {
          const info = ColorMatch.describeDistance(item.distance);
          return `
            <div class="card flex items-center gap-3 p-3">
              ${renderSwatch(item.hex)}
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold font-mono text-lg">${item.code}</span>
                  <span class="text-xs text-slate-400">${item.hex.toUpperCase()}</span>
                </div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${info.color}22;color:${info.color}">
                    ${info.text}
                  </span>
                  <span class="text-xs text-slate-400">色差 ${item.distance.toFixed(3)}</span>
                </div>
              </div>
              <a class="btn btn-ghost text-xs shrink-0" href="#/patterns/${patternId}/find?code=${item.code}">查此色号</a>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  async function render(main, params) {
    const patternId = Number(params.id);
    const pattern = await PatternDetailView.ensurePattern(main, patternId);
    if (!pattern) return;

    const PD = PatternDetailView;
    main.innerHTML = PD.header(patternId, 'find') + `<div id="finderBody"></div>`;
    document.getElementById('headerInfo').innerHTML = PD.renderHeaderInfo(pattern);
    PD.bindCopyBtn(patternId);
    const body = document.getElementById('finderBody');

    body.innerHTML = `
      <div class="card">
        <label class="block text-xs text-slate-500 mb-1">输入色号 或 HEX 颜色</label>
        <div class="flex gap-2 items-center">
          <div id="inputSwatch" class="shrink-0 rounded-md border border-slate-200 w-10 h-10" style="background:transparent"></div>
          <input id="codeInput" class="input font-mono text-lg flex-1" placeholder="#f4e2d8 或 A1" autofocus />
        </div>
        <div class="text-xs text-slate-400 mt-2">
          支持色号（如 <span class="font-mono">A1</span>）或 HEX 颜色（如 <span class="font-mono">#f4e2d8</span>）
        </div>
        <div class="text-xs text-slate-400 mt-2">图纸中用到的色号：
          <div class="flex flex-wrap gap-1 mt-1" id="quickCodes"></div>
        </div>
      </div>
      <div id="findResult" class="mt-4"></div>
    `;

    const input = document.getElementById('codeInput');
    const result = document.getElementById('findResult');
    const quick = document.getElementById('quickCodes');
    const inputSwatch = document.getElementById('inputSwatch');
    quick.innerHTML = pattern.colors.map(c => `<button class="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 font-mono text-xs" data-code="${c.code}">${c.code}</button>`).join('');
    quick.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        input.value = b.getAttribute('data-code');
        doFind();
      });
    });

    async function doFind() {
      const val = Util.normalizeCode(input.value);
      result.innerHTML = '';
      if (!val) return;

      const hex = parseHexInput(val);

      // ---------- HEX 模式 ----------
      if (hex) {
        inputSwatch.style.background = hex;
        const matchResult = ColorMatch.findClosestFromHex(hex, 3);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <div class="flex items-center gap-3">
            ${renderSwatch(hex, 64)}
            <div>
              <div class="font-mono text-sm text-slate-500">你输入的颜色</div>
              <div class="font-mono text-lg font-bold">${hex.toUpperCase()}</div>
            </div>
          </div>
          <div class="text-xs text-slate-500 mt-3 mb-1 font-medium">221 色中最接近的色号：</div>
          ${renderHexMatchCard(matchResult, pattern, patternId)}
        `;
        result.appendChild(card);
        return;
      }

      // ---------- 色号模式 ----------
      inputSwatch.style.background = 'transparent';
      const code = val;
      const color = pattern.colors.find(c => c.code === code);
      const locs = locateCode(code, State.boards || []);
      const checked = new Set(pattern.checkedSet || []);
      const isDone = checked.has(code);
      const lowStock = new Set(lowStockCache);
      const isLow = lowStock.has(code);
      const incoming = PatternDetailView.getIncomingReplacements(pattern, code);

      const card = document.createElement('div');
      card.className = 'card';
      const replChip = incoming.length
        ? `<div class="mt-2"><span class="replaced-from"><span class="replaced-from-label">原色</span>${incoming.map(x => `<span class="line-through">${Util.escapeHtml(x.from)}</span>`).join('、')}</span></div>`
        : '';
      card.innerHTML = `
        <div class="flex items-start justify-between mb-2">
          <div>
            <div class="text-2xl font-bold font-mono flex items-center gap-2">
              ${code}
              ${isLow ? '<span class="badge-low-stock">⚠ 库存告急</span>' : ''}
            </div>
            <div class="text-xs text-slate-500 mt-1">
              ${color ? `本图需 <strong>${color.count}</strong> 颗` : '<span class="text-amber-600">该色号不在本图清单中</span>'}
            </div>
            ${replChip}
            ${isLow ? '<div class="text-xs text-rose-600 mt-1">告急状态在<strong>板模板</strong>页面管理。<a href="#/boards" class="underline">去查看汇总</a></div>' : ''}
          </div>
          <div class="flex gap-2">
            ${color ? `<button id="markBtn" class="btn ${isDone ? 'btn-secondary' : 'btn-primary'}">${isDone ? '已标记（点此撤销）' : '标记完成'}</button>` : ''}
          </div>
        </div>
        ${locs.length === 0 ? `
          <div class="text-amber-700 text-sm bg-amber-50 rounded-md p-3 border border-amber-200">
            该色号没有录入到任何板上。<a href="#/boards" class="underline">去板模板</a>补录。
          </div>
        ` : `
          <div class="text-sm text-slate-600 mb-2">出现在 ${locs.length} 个位置：</div>
          <div class="space-y-2">
            ${locs.map(l => `
              <div class="rounded-md border border-slate-200 p-3 flex items-center justify-between">
                <div>
                  <div class="font-medium">${Util.escapeHtml(l.boardName)} <span class="text-xs text-slate-400">板${l.boardId}</span></div>
                  <div class="text-xs text-slate-500">第 ${l.row} 行 · 第 ${l.col} 列（格子 ${l.index + 1}）</div>
                </div>
                <a class="btn btn-ghost text-xs" href="#/patterns/${patternId}/board/${l.boardId}?focus=${code}">查看板</a>
              </div>
            `).join('')}
          </div>
        `}
      `;
      result.appendChild(card);

      const btn = card.querySelector('#markBtn');
      if (btn) {
        btn.addEventListener('click', async () => {
          const set = new Set(pattern.checkedSet || []);
          const wasDone = set.has(code);
          if (wasDone) set.delete(code); else set.add(code);
          pattern.checkedSet = Array.from(set);
          await DB.updatePattern(pattern);
          document.getElementById('headerInfo').innerHTML = PD.renderHeaderInfo(pattern);
          showUndoBar(
            wasDone ? `已撤销：${code}` : `已标记完成：${code}`,
            async () => {
              const set2 = new Set(pattern.checkedSet || []);
              if (wasDone) set2.add(code); else set2.delete(code);
              pattern.checkedSet = Array.from(set2);
              await DB.updatePattern(pattern);
              document.getElementById('headerInfo').innerHTML = PD.renderHeaderInfo(pattern);
              doFind();
            }
          );
          doFind();
        });
      }
    }

    input.addEventListener('input', Util.debounce(doFind, 150));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doFind(); });
    input.focus();
  }

  // 缓存告急色号，每次页面打开时加载
  let lowStockCache = [];

  // 装饰：包装 render，让每次进入页面时刷新缓存
  const _origRender = render;
  async function renderWithCache(main, params) {
    lowStockCache = await DB.getLowStock();
    return _origRender(main, params);
  }

  window.ColorFinderView = { render: renderWithCache };
})();