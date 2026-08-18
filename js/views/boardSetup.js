// boardSetup.js —— 板模板管理视图
// 路由：
//   #/boards          板列表（含告急色号汇总；可新增任意数量的板）
//   #/boards/:id      单板录入（行列数可自定义，支持"一键录入"批量粘贴）

(function () {

  // ---------- 汇总数据：跨图纸聚合告急色号 ----------
  async function buildLowStockSummary() {
    const [lowStock, patterns, boards] = await Promise.all([
      DB.getLowStock(),
      DB.getAllPatterns(),
      DB.getAllBoards()
    ]);
    const lowSet = new Set(lowStock);
    const summary = new Map();
    lowStock.forEach(code => {
      summary.set(code, {
        code,
        patterns: [],    // [{patternId, name, count}]
        totalBeads: 0,
        boards: new Set() // boardId
      });
    });

    patterns.forEach(p => {
      (p.colors || []).forEach(c => {
        if (!lowSet.has(c.code)) return;
        const s = summary.get(c.code);
        s.patterns.push({ patternId: p.patternId, name: p.name, count: c.count });
        s.totalBeads += c.count;
      });
    });

    boards.forEach(b => {
      (b.cells || []).forEach(c => {
        const code = Util.normalizeCode(c);
        if (code && summary.has(code)) {
          summary.get(code).boards.add(b.boardId);
        }
      });
    });

    // 排序：被引用图纸数多者优先
    const list = Array.from(summary.values()).sort((a, b) => {
      const dp = b.patterns.length - a.patterns.length;
      if (dp !== 0) return dp;
      return a.code.localeCompare(b.code);
    });

    const totalBeads = list.reduce((s, x) => s + x.totalBeads, 0);
    const totalPatterns = new Set();
    list.forEach(s => s.patterns.forEach(p => totalPatterns.add(p.patternId)));
    return { list, totalBeads, totalPatterns: totalPatterns.size };
  }

  // 渲染汇总卡（用于列表页和单板编辑页）
  function renderLowStockSummaryEl(summary, opts) {
    if (!summary.list.length) {
      return `
        <div class="card mb-3">
          <div class="flex items-center justify-between mb-1">
            <h2 class="text-base font-semibold text-slate-800">⚠ 告急色号</h2>
            <span class="text-xs text-slate-400">0 个</span>
          </div>
          <p class="text-xs text-slate-500">还没有告急色号。在板录入页面进入"告急模式"，点击格子即可标记。</p>
        </div>
      `;
    }

    const compact = opts && opts.compact;
    const visible = compact ? summary.list.slice(0, 8) : summary.list;
    const more = summary.list.length - visible.length;

    return `
      <div class="card mb-3 low-stock-summary">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h2 class="text-base font-semibold text-rose-700">⚠ 告急色号（${summary.list.length}）</h2>
            <p class="text-xs text-slate-500 mt-0.5">共 ${summary.totalBeads} 颗，分布在 ${summary.totalPatterns} 张图纸</p>
          </div>
          <div class="flex gap-2">
            <button id="lsCopy" class="btn btn-secondary text-xs">复制清单</button>
            ${compact && more > 0 ? `<span class="text-xs text-slate-400">还有 ${more} 个…</span>` : ''}
          </div>
        </div>
        <div class="low-stock-list">
          ${visible.map(s => {
            const hex = (window.MARD221 && window.MARD221[s.code]) || '#f1f5f9';
            const patList = s.patterns.length
              ? s.patterns.slice(0, 3).map(p => `${Util.escapeHtml(p.name)}×${p.count}`).join('、')
                + (s.patterns.length > 3 ? ` 等 ${s.patterns.length} 张` : '')
              : '<span class="text-xs text-slate-400">未用于图纸</span>';
            const boardList = s.boards.size
              ? Array.from(s.boards).sort((a, b) => a - b).map(bid => `板${bid}`).join('、')
              : '<span class="text-xs text-amber-600">未录入板</span>';
            return `
              <div class="low-stock-row" data-code="${Util.escapeHtml(s.code)}">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="color-swatch" style="background:${hex};width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,0.1);flex-shrink:0;"></span>
                  <span class="font-mono font-semibold">${Util.escapeHtml(s.code)}</span>
                  <span class="text-xs text-slate-500">${s.totalBeads} 颗</span>
                </div>
                <div class="text-xs text-slate-600 truncate" title="${Util.escapeHtml(patList)}">${patList}</div>
                <div class="text-xs text-slate-500">${boardList}</div>
                <button class="btn btn-ghost text-xs ls-remove" data-code="${Util.escapeHtml(s.code)}">取消告急</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 绑定汇总卡片的按钮（取消告急 / 复制清单）
  async function bindLowStockSummaryActions(rootEl, onAfter) {
    rootEl.querySelectorAll('.ls-remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        const code = btn.getAttribute('data-code');
        const cur = new Set(await DB.getLowStock());
        cur.delete(code);
        await DB.setLowStock([...cur]);
        Toast.show(`已取消告急：${code}`);
        if (onAfter) onAfter();
      });
    });
    const copyBtn = rootEl.querySelector('#lsCopy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const summary = await buildLowStockSummary();
        const lines = ['# 告急色号清单', `# 总计 ${summary.list.length} 个色号，${summary.totalBeads} 颗`];
        summary.list.forEach(s => {
          lines.push(`${s.code} ${s.totalBeads} 颗（${s.patterns.length} 张图）`);
        });
        const text = lines.join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            () => Toast.show('已复制到剪贴板'),
            () => Toast.show('复制失败，请手动选择')
          );
        } else {
          Toast.show('当前环境不支持复制');
        }
      });
    }
  }

  // ---------- 列表页 ----------
  async function renderList(main) {
    let boards = await DB.getAllBoards();
    State.boards = boards.length ? boards : [];

    // 若没有任何板，自动创建默认 6 块空板（首次访问体验）
    if (!boards.length) {
      const seeds = [];
      for (let i = 1; i <= 6; i++) {
        seeds.push(DB.makeEmptyBoard(i, { rows: 4, cols: 6 }));
      }
      await DB.saveAllBoards(seeds);
      boards = await DB.getAllBoards();
      State.boards = boards;
    }

    const summary = await buildLowStockSummary();
    const lowSet = new Set(summary.list.map(x => x.code));

    // 每块板上的告急色号集合
    const boardLow = new Map();
    boards.forEach(b => {
      const set = new Set();
      (b.cells || []).forEach(c => {
        const code = Util.normalizeCode(c);
        if (code && lowSet.has(code)) set.add(code);
      });
      boardLow.set(b.boardId, set);
    });

    const html = `
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h1 class="text-xl font-bold text-slate-800">板模板</h1>
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-500">共 ${boards.length} 块板</span>
          <button id="addBoardBtn" class="btn btn-primary text-xs">+ 新增板</button>
        </div>
      </div>
      <div id="lowStockSummaryHere">${renderLowStockSummaryEl(summary, { compact: true })}</div>
      <div class="grid grid-cols-2 gap-3">
        ${boards.map(b => {
          const cols = (b.layout && b.layout.cols) || 6;
          const rows = (b.layout && b.layout.rows) || 4;
          const total = cols * rows;
          const filled = (b.cells || []).filter(c => String(c).trim()).length;
          const complete = filled === total && total > 0;
          const lowCount = (boardLow.get(b.boardId) || new Set()).size;
          const lowHere = Array.from(boardLow.get(b.boardId) || []);
          return `
            <div class="relative">
              <a href="#/boards/${b.boardId}" class="card hover:border-indigo-400 transition flex flex-col items-center ${lowCount ? 'border-rose-300' : ''}">
                <div class="text-sm font-medium text-slate-500 mb-1 flex items-center gap-1">
                  ${Util.escapeHtml(b.name || `板${b.boardId}`)}
                  ${lowCount ? `<span class="badge-low-stock" title="${Util.escapeHtml(lowHere.join('、'))}">⚠ ${lowCount}</span>` : ''}
                </div>
                <div class="board-grid my-2" style="--cell-size:24px; --cell-gap:2px; grid-template-columns: repeat(${cols}, var(--cell-size));">
                  ${Array.from({ length: total }).map((_, i) => {
                    const code = (b.cells || [])[i] || '';
                    const isLow = code && lowSet.has(Util.normalizeCode(code));
                    return `<div class="cell-display ${code ? '' : 'empty'} ${isLow ? 'low-stock' : ''}" style="font-size:10px;">${code ? Util.escapeHtml(code) : '·'}</div>`;
                  }).join('')}
                </div>
                <div class="text-xs ${complete ? 'text-emerald-600' : 'text-slate-400'}">
                  ${complete ? '✓ 已完成' : `${filled} / ${total}`} · ${rows}×${cols}
                </div>
              </a>
              <button class="board-delete-btn" data-board-id="${b.boardId}" title="删除板">×</button>
            </div>`;
        }).join('')}
      </div>
      <div class="mt-6 text-xs text-slate-500 leading-5">
        <p>提示：</p>
        <ul class="list-disc list-inside space-y-1 mt-1">
          <li>点任意板卡进入录入界面；右上角 × 可删除空板。</li>
          <li>每块板默认 4 行 6 列共 24 格，新建板时可自定义行列数。</li>
          <li>同一色号可以重复出现在不同板的格子上。</li>
          <li>录入时打开"告急模式"可在录入的同时标记告急色号。</li>
          <li>录入页顶部有"一键录入"：粘贴整板的色号文本，或加载示例模板。</li>
        </ul>
      </div>
    `;
    main.innerHTML = html;
    bindLowStockSummaryActions(main, () => renderList(main));
    const addBtn = document.getElementById('addBoardBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => openAddBoardDialog(main));
    }
    main.querySelectorAll('.board-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = Number(btn.getAttribute('data-board-id'));
        const b = boards.find(x => x.boardId === id);
        if (!b) return;
        const filled = (b.cells || []).filter(c => String(c).trim()).length;
        if (filled > 0) {
          if (!confirm(`板${b.boardId}「${b.name}」还有 ${filled} 个色号，确定删除？\n（删除后可在同一编号重新录入新板，但旧色号会丢失）`)) return;
        } else {
          if (!confirm(`确定删除板${b.boardId}「${b.name}」？`)) return;
        }
        await DB.deleteBoard(id);
        Toast.show('已删除');
        renderList(main);
      });
    });
  }

  // ---------- 新增板弹窗 ----------
  function openAddBoardDialog(main) {
    let root = document.getElementById('boardDialogRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'boardDialogRoot';
      document.body.appendChild(root);
    }
    root.innerHTML = `
      <div class="modal-mask" id="addBoardMask">
        <div class="modal-panel" style="max-width:420px;">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold text-slate-800">+ 新增板模板</h3>
            <button id="addBoardClose" class="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <p class="text-xs text-slate-500 mb-3">自定义板的行/列数与名称。常见拼豆板规格：4×6=24、5×6=30、4×8=32。</p>
          <div class="space-y-2">
            <div>
              <label class="block text-xs text-slate-500 mb-1">板名</label>
              <input id="addBoardName" class="input" placeholder="例如：板7" maxlength="20" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs text-slate-500 mb-1">行数</label>
                <input id="addBoardRows" type="number" min="1" max="20" value="4" class="input" />
              </div>
              <div>
                <label class="block text-xs text-slate-500 mb-1">列数</label>
                <input id="addBoardCols" type="number" min="1" max="20" value="6" class="input" />
              </div>
            </div>
            <div class="flex flex-wrap gap-1 text-[11px]">
              <span class="text-slate-400 mr-1">快速规格：</span>
              <button class="board-preset" data-rows="4" data-cols="6">4×6 (24)</button>
              <button class="board-preset" data-rows="5" data-cols="6">5×6 (30)</button>
              <button class="board-preset" data-rows="4" data-cols="8">4×8 (32)</button>
              <button class="board-preset" data-rows="6" data-cols="6">6×6 (36)</button>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-4">
            <button id="addBoardCancel" class="btn btn-ghost text-sm">取消</button>
            <button id="addBoardConfirm" class="btn btn-primary text-sm">创建</button>
          </div>
        </div>
      </div>
    `;
    const mask = root.querySelector('.modal-mask');
    const panel = root.querySelector('.modal-panel');
    const rowsInput = root.querySelector('#addBoardRows');
    const colsInput = root.querySelector('#addBoardCols');
    const nameInput = root.querySelector('#addBoardName');
    function close() { root.innerHTML = ''; }
    root.querySelector('#addBoardClose').addEventListener('click', close);
    root.querySelector('#addBoardCancel').addEventListener('click', close);
    mask.addEventListener('click', e => { if (e.target === mask) close(); });
    panel.addEventListener('click', e => e.stopPropagation());
    root.querySelectorAll('.board-preset').forEach(b => {
      b.addEventListener('click', () => {
        rowsInput.value = b.getAttribute('data-rows');
        colsInput.value = b.getAttribute('data-cols');
      });
    });
    // 自动建议下一个板名
    DB.getAllBoards().then(list => {
      const nextId = list.reduce((m, b) => Math.max(m, b.boardId || 0), 0) + 1;
      nameInput.value = `板${nextId}`;
      nameInput.focus();
      nameInput.select();
    });
    root.querySelector('#addBoardConfirm').addEventListener('click', async () => {
      const rows = Math.max(1, Math.min(20, Number(rowsInput.value) || 4));
      const cols = Math.max(1, Math.min(20, Number(colsInput.value) || 6));
      const name = nameInput.value.trim();
      const board = await DB.addBoard({
        name: name || undefined,
        layout: { rows, cols }
      });
      Toast.show(`已创建「${board.name}」(${rows}×${cols})`);
      close();
      renderList(main);
      // 跳转到新板的录入页
      location.hash = `#/boards/${board.boardId}`;
    });
  }

  // ---------- 单板录入 ----------
  async function renderEdit(main, params) {
    const boardId = Number(params.id);
    if (!Number.isFinite(boardId) || boardId < 1) {
      main.innerHTML = `<div class="card">板号无效</div>`;
      return;
    }
    let board = await DB.getBoard(boardId);
    if (!board) {
      board = DB.makeEmptyBoard(boardId);
    }
    const cols = (board.layout && board.layout.cols) || 6;
    const rows = (board.layout && board.layout.rows) || 4;
    const total = rows * cols;
    // 确保 cells 长度匹配当前 layout（兼容旧数据）
    if (!Array.isArray(board.cells) || board.cells.length !== total) {
      const arr = new Array(total).fill('');
      for (let i = 0; i < Math.min(total, (board.cells || []).length); i++) arr[i] = board.cells[i];
      board.cells = arr;
    }

    // 告急模式开关（仅在录入时切换）
    let lowStockMode = false;
    let lowStockCache = await DB.getLowStock();

    async function toggleStockFor(code) {
      const set = new Set(lowStockCache);
      const was = set.has(code);
      if (was) set.delete(code); else set.add(code);
      lowStockCache = await DB.setLowStock([...set]);
      Toast.show(was ? `已取消告急：${code}` : `已标记告急：${code}`);
      render();
    }

    function render() {
      const lowSet = new Set(lowStockCache);
      const cellsHtml = board.cells.map((c, i) => {
        const row = Math.floor(i / cols) + 1;
        const col = (i % cols) + 1;
        const norm = Util.normalizeCode(c);
        const isLow = norm && lowSet.has(norm);
        const warn = isLow ? `<button class="cell-low-btn" data-code="${Util.escapeHtml(norm)}" title="取消告急">!</button>` : '';
        return `<div class="relative">
          <input data-i="${i}" class="cell-input ${isLow ? 'low-stock' : ''}" value="${Util.escapeHtml(c)}" placeholder="${row}-${col}" maxlength="4" />
          ${warn}
        </div>`;
      }).join('');

      const lowHereCount = board.cells.filter(c => lowSet.has(Util.normalizeCode(c))).length;

      const html = `
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <a href="#/boards" class="text-sm text-slate-500">← 返回板列表</a>
          <div class="flex gap-2 flex-wrap">
            <button id="bulkInputBtn" class="btn btn-secondary text-xs">⚡ 一键录入</button>
            <button id="lowStockToggle" class="btn ${lowStockMode ? 'btn-primary' : 'btn-ghost'} text-xs">${lowStockMode ? '✓ 告急模式' : '标记告急'}</button>
            <button id="resetBtn" class="btn btn-ghost text-xs">清空</button>
          </div>
        </div>
        <div class="card mb-4">
          <div class="flex items-center gap-3 mb-2 flex-wrap">
            <span class="section-title">板号</span>
            <span class="font-semibold text-slate-700">${boardId}</span>
            <span class="text-xs text-slate-500">${rows}×${cols}（共 ${total} 格）</span>
            ${lowHereCount ? `<span class="badge-low-stock">本板 ${lowHereCount} 个告急</span>` : ''}
          </div>
          <label class="block text-xs text-slate-500 mb-1">板名</label>
          <input id="boardName" class="input mb-3" value="${Util.escapeHtml(board.name)}" maxlength="20" />
          <p class="text-xs text-slate-500 mb-2">
            ${lowStockMode
              ? '当前为<strong>告急模式</strong>：输入或编辑格子后，失焦将自动标记为告急。'
              : `行号从上到下：1→${rows}；列号从左到右：1→${cols}。点击右上角"一键录入"可批量粘贴整板色号。`}
          </p>
          <div class="board-grid" id="boardGrid" style="grid-template-columns: repeat(${cols}, var(--cell-size));">${cellsHtml}</div>
          <div class="flex justify-between items-center mt-3 text-xs text-slate-500">
            <span>已填 <span id="filledCount">${board.cells.filter(c => String(c).trim()).length}</span> / ${total}</span>
            <div class="flex gap-2">
              <button id="cancelBtn" class="btn btn-ghost">取消</button>
              <button id="saveBtn" class="btn btn-primary">保存</button>
            </div>
          </div>
        </div>
      `;
      main.innerHTML = html;

      // 单元格输入
      const grid = document.getElementById('boardGrid');
      grid.querySelectorAll('input.cell-input').forEach(inp => {
        inp.addEventListener('input', e => {
          const i = Number(inp.dataset.i);
          const v = Util.normalizeCode(inp.value).slice(0, 4);
          board.cells[i] = v;
          document.getElementById('filledCount').textContent = board.cells.filter(c => String(c).trim()).length;
          const isLow = v && lowSet.has(v);
          inp.classList.toggle('low-stock', !!isLow);
        });
        inp.addEventListener('blur', e => {
          inp.value = Util.normalizeCode(inp.value).slice(0, 4);
        });
      });

      // 告急按钮（每格右上角）
      grid.querySelectorAll('.cell-low-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const code = btn.getAttribute('data-code');
          if (code) await toggleStockFor(code);
        });
      });

      // 告急模式开关
      const modeBtn = document.getElementById('lowStockToggle');
      modeBtn.addEventListener('click', () => {
        lowStockMode = !lowStockMode;
        if (lowStockMode) {
          Toast.show('告急模式：输入或编辑格子后，失焦将自动标记为告急');
        }
        render();
      });

      if (lowStockMode) {
        grid.querySelectorAll('input.cell-input').forEach(inp => {
          inp.addEventListener('blur', async () => {
            const code = Util.normalizeCode(inp.value);
            if (!code) return;
            if (lowSet.has(code)) return;
            const set = new Set(lowStockCache);
            set.add(code);
            lowStockCache = await DB.setLowStock([...set]);
            Toast.show(`已标记告急：${code}`);
            render();
          });
        });
      }

      document.getElementById('boardName').addEventListener('input', e => {
        board.name = e.target.value;
      });
      document.getElementById('resetBtn').addEventListener('click', () => {
        if (!confirm(`确认清空板${boardId}的所有色号？`)) return;
        board.cells = new Array(total).fill('');
        render();
      });
      document.getElementById('cancelBtn').addEventListener('click', () => {
        location.hash = '#/boards';
      });
      document.getElementById('saveBtn').addEventListener('click', async () => {
        board.name = (board.name || '').trim() || `板${boardId}`;
        for (let i = 0; i < board.cells.length; i++) {
          const v = Util.normalizeCode(board.cells[i]);
          if (v && !Parser.CODE_RE.test(v)) {
            const r = Math.floor(i / cols) + 1;
            const c = (i % cols) + 1;
            Toast.show(`第 ${r} 行第 ${c} 列的色号 "${v}" 不合法`);
            return;
          }
          board.cells[i] = v;
        }
        await DB.saveBoard(board);
        Toast.show('已保存');
        location.hash = '#/boards';
      });
      document.getElementById('bulkInputBtn').addEventListener('click', () => {
        openBulkInputDialog(board, rows, cols, () => render());
      });
    }
    render();
  }

  // ---------- 一键录入弹窗 ----------
  // 录入格式（默认按"按行从左到右"）：
  //   每行一条板行的色号；色号之间用空格 / 逗号 / 分号 / Tab 分隔都允许；
  //   空格可省略（如 `A1A3B2` 视为 A1、A3、B2，但要求每个色号是合法字母+数字）。
  //   空行/注释行（# 或 //）忽略。
  //   提供两种"填入方向"：按行（默认）/ 按列。
  //   提供"行号自增"与"自动列到行"两种辅助编号方案。
  function buildBulkSample(rows, cols) {
    // 默认示例：用 mard 221 前若干色号按"色差循环"铺板
    const sample = [];
    const mardKeys = window.MARD221 ? Object.keys(window.MARD221).slice(0, 50) : [];
    const palette = mardKeys.length ? mardKeys : ['A1','A2','A3','B1','B2','B3','C1','C2','C3','D1','D2','D3','E1','E2','E3','F1','F2','F3'];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      const rowArr = [];
      for (let c = 0; c < cols; c++) {
        rowArr.push(palette[idx % palette.length]);
        idx++;
      }
      sample.push(rowArr.join(' '));
    }
    return sample.join('\n');
  }

  function parseBulkText(text, expected, rows, cols) {
    // expected: 'rows' | 'cols'：填入方向
    // 行/列总数校验：先解析 token 列表，再按方向拼到 cells
    const tokens = [];
    const lines = String(text || '').split(/\r?\n/);
    const invalid = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      if (raw.startsWith('#') || raw.startsWith('//')) continue;
      // 先尝试按空格分隔
      let parts = raw.split(/[\s,;\t]+/).filter(Boolean);
      if (parts.length === 0) continue;
      // 兼容连写（如 A1A3B2）：如果整行只 1 个部分且长度>=2 且没分隔符，按字母切
      if (parts.length === 1 && raw.length >= 2 && !/[\s,;\t]/.test(raw)) {
        const codes = [];
        let rest = raw;
        while (rest.length) {
          const m = rest.match(/^([A-Za-z]\d{1,3})/);
          if (!m) break;
          codes.push(m[1]);
          rest = rest.slice(m[1].length);
        }
        if (codes.length > 1) parts = codes;
      }
      // 校验+归一
      const lineCodes = [];
      for (let j = 0; j < parts.length; j++) {
        const code = Util.normalizeCode(parts[j]);
        if (!Parser.CODE_RE.test(code)) {
          invalid.push({ line: i + 1, raw: parts[j], reason: '色号格式错误' });
          continue;
        }
        lineCodes.push(code);
      }
      if (lineCodes.length) tokens.push(lineCodes);
    }
    // 拼接成 cells
    const cells = new Array(rows * cols).fill('');
    if (expected === 'rows') {
      // 每行 lineCodes 写入 board 一行；不足时只填前几个
      for (let r = 0; r < rows && r < tokens.length; r++) {
        const line = tokens[r];
        for (let c = 0; c < cols && c < line.length; c++) {
          cells[r * cols + c] = line[c];
        }
      }
    } else {
      // 按列：每行 lineCodes 写入 board 一列；不足时只填前几行
      for (let c = 0; c < cols && c < tokens.length; c++) {
        const line = tokens[c];
        for (let r = 0; r < rows && r < line.length; r++) {
          cells[r * cols + c] = line[r];
        }
      }
    }
    return { cells, invalid, tokenLines: tokens.length };
  }

  function openBulkInputDialog(board, rows, cols, onApplied) {
    let root = document.getElementById('boardDialogRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'boardDialogRoot';
      document.body.appendChild(root);
    }
    const initialSample = buildBulkSample(rows, cols);
    root.innerHTML = `
      <div class="modal-mask" id="bulkInputMask">
        <div class="modal-panel" style="max-width:560px;">
          <div class="flex items-center justify-between mb-2">
            <h3 class="font-semibold text-slate-800">⚡ 一键录入 · ${Util.escapeHtml(board.name || ('板' + board.boardId))}（${rows}×${cols}）</h3>
            <button id="bulkClose" class="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <p class="text-xs text-slate-500 mb-3">按"行/列"逐条填入色号；色号之间用空格/逗号/Tab 分隔；空行或 # / // 开头为注释。支持连写（如 A1A3B2）。</p>

          <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-500">填入方向：</span>
              <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="bulkDir" value="rows" checked /><span>按行</span></label>
              <label class="flex items-center gap-1 cursor-pointer"><input type="radio" name="bulkDir" value="cols" /><span>按列</span></label>
            </div>
            <div class="flex gap-1">
              <button id="bulkLoadSample" class="btn btn-ghost text-xs">加载示例模板</button>
              <button id="bulkClear" class="btn btn-ghost text-xs">清空</button>
            </div>
          </div>

          <textarea id="bulkText" class="textarea font-mono text-sm" rows="${Math.min(10, rows + 2)}" placeholder="例如：&#10;A1 A2 A3 A4 A5 A6&#10;B1 B2 B3 B4 B5 B6&#10;..."></textarea>

          <div id="bulkPreview" class="mt-2 text-xs text-slate-500"></div>

          <div class="flex justify-end gap-2 mt-3">
            <button id="bulkCancel" class="btn btn-ghost text-sm">取消</button>
            <button id="bulkApply" class="btn btn-primary text-sm">应用到板</button>
          </div>
        </div>
      </div>
    `;
    const mask = root.querySelector('.modal-mask');
    const panel = root.querySelector('.modal-panel');
    const ta = root.querySelector('#bulkText');
    const preview = root.querySelector('#bulkPreview');
    const dirInputs = root.querySelectorAll('input[name="bulkDir"]');

    function refreshPreview() {
      const dir = root.querySelector('input[name="bulkDir"]:checked').value;
      const { cells, invalid, tokenLines } = parseBulkText(ta.value, dir, rows, cols);
      const filled = cells.filter(c => String(c).trim()).length;
      const dirText = dir === 'rows' ? '按行（每行一条板行）' : '按列（每行一条板列）';
      const errHtml = invalid.length ? `<div class="mt-1 text-rose-600">⚠ ${invalid.length} 行无效（已忽略）：${invalid.slice(0, 3).map(x => `第${x.line}行「${Util.escapeHtml(x.raw)}」`).join('、')}${invalid.length > 3 ? '…' : ''}</div>` : '';
      const lineInfo = dir === 'rows'
        ? `已识别 ${tokenLines} 行`
        : `已识别 ${tokenLines} 列`;
      preview.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-2">
          <span>${dirText} · <strong class="text-indigo-600">${filled}</strong> 格（${lineInfo}）</span>
          <span class="text-slate-400">目标：${rows}×${cols}（${rows * cols} 格）</span>
        </div>
        ${errHtml}
      `;
    }

    function close() { root.innerHTML = ''; }

    root.querySelector('#bulkClose').addEventListener('click', close);
    root.querySelector('#bulkCancel').addEventListener('click', close);
    mask.addEventListener('click', e => { if (e.target === mask) close(); });
    panel.addEventListener('click', e => e.stopPropagation());

    root.querySelector('#bulkLoadSample').addEventListener('click', () => {
      ta.value = buildBulkSample(rows, cols);
      refreshPreview();
      Toast.show('已加载示例模板');
    });
    root.querySelector('#bulkClear').addEventListener('click', () => {
      ta.value = '';
      refreshPreview();
    });
    dirInputs.forEach(r => r.addEventListener('change', refreshPreview));
    ta.addEventListener('input', Util.debounce(refreshPreview, 120));

    root.querySelector('#bulkApply').addEventListener('click', () => {
      const dir = root.querySelector('input[name="bulkDir"]:checked').value;
      const { cells, invalid, tokenLines } = parseBulkText(ta.value, dir, rows, cols);
      const filled = cells.filter(c => String(c).trim()).length;
      if (filled === 0) {
        Toast.show('文本中没有可识别的色号');
        return;
      }
      // 应用方式：覆盖整个板（与示例模板的设计一致）
      board.cells = cells;
      const overWrite = confirm(`将用识别结果覆盖当前板的 ${filled} 格（${rows * cols} 格中）。\n点"确定"= 覆盖；点"取消"= 仅覆盖空位（保留已有色号）。`);
      if (!overWrite) {
        for (let i = 0; i < cells.length; i++) {
          if (!String(board.cells[i] || '').trim() && String(cells[i]).trim()) {
            board.cells[i] = cells[i];
          }
        }
        Toast.show('已合并到空位');
      } else {
        Toast.show(`已应用 ${filled} 格`);
      }
      close();
      if (onApplied) onApplied();
    });

    // 默认填示例
    ta.value = initialSample;
    refreshPreview();
    setTimeout(() => ta.focus(), 0);
  }

  window.BoardSetupView = {
    renderList,
    renderEdit,
    buildLowStockSummary,
    renderLowStockSummaryEl,
    bindLowStockSummaryActions
  };
})();
