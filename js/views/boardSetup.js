// boardSetup.js —— 板模板管理视图
// 路由：
//   #/boards          6 块板列表
//   #/boards/:id      单板 4×6 录入

(function () {

  // ---------- 列表页 ----------
  async function renderList(main) {
    const boards = await DB.getAllBoards();
    State.boards = boards.length ? boards : [];

    const html = `
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-xl font-bold text-slate-800">板模板</h1>
        <div class="text-xs text-slate-500">共 6 块板，每块 24 格（4×6）</div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        ${[1, 2, 3, 4, 5, 6].map(id => {
          const b = boards.find(x => x.boardId === id);
          const filled = b ? b.cells.filter(c => String(c).trim()).length : 0;
          const complete = filled === 24;
          return `
            <a href="#/boards/${id}" class="card hover:border-indigo-400 transition flex flex-col items-center">
              <div class="text-sm font-medium text-slate-500 mb-1">${b ? Util.escapeHtml(b.name) : `板${id}`}</div>
              <div class="board-grid my-2" style="--cell-size:24px; --cell-gap:2px;">
                ${Array.from({ length: 24 }).map((_, i) => {
                  const code = b ? b.cells[i] : '';
                  return `<div class="cell-display ${code ? '' : 'empty'}" style="font-size:10px;">${code ? Util.escapeHtml(code) : '·'}</div>`;
                }).join('')}
              </div>
              <div class="text-xs ${complete ? 'text-emerald-600' : 'text-slate-400'}">
                ${complete ? '✓ 已完成' : `${filled} / 24`}
              </div>
            </a>`;
        }).join('')}
      </div>
      <div class="mt-6 text-xs text-slate-500 leading-5">
        <p>提示：</p>
        <ul class="list-disc list-inside space-y-1 mt-1">
          <li>每块板固定 4 行 6 列共 24 格。</li>
          <li>点任意板卡进入录入界面。</li>
          <li>同一色号可以重复出现在不同板的格子上。</li>
        </ul>
      </div>
    `;
    main.innerHTML = html;
  }

  // ---------- 单板录入 ----------
  async function renderEdit(main, params) {
    const boardId = Number(params.id);
    if (!(boardId >= 1 && boardId <= 6)) {
      main.innerHTML = `<div class="card">板号无效</div>`;
      return;
    }
    let board = await DB.getBoard(boardId);
    if (!board) {
      board = DB.makeEmptyBoard(boardId);
    }
    // 确保 24 格
    if (!Array.isArray(board.cells) || board.cells.length !== 24) {
      const arr = new Array(24).fill('');
      for (let i = 0; i < Math.min(24, (board.cells || []).length); i++) arr[i] = board.cells[i];
      board.cells = arr;
    }

    function render() {
      const html = `
        <div class="flex items-center justify-between mb-3">
          <a href="#/boards" class="text-sm text-slate-500">← 返回板列表</a>
          <button id="resetBtn" class="btn btn-ghost text-xs">清空</button>
        </div>
        <div class="card mb-4">
          <div class="flex items-center gap-3 mb-2">
            <span class="section-title">板号</span>
            <span class="font-semibold text-slate-700">${boardId}</span>
          </div>
          <label class="block text-xs text-slate-500 mb-1">板名</label>
          <input id="boardName" class="input mb-3" value="${Util.escapeHtml(board.name)}" maxlength="20" />
          <p class="text-xs text-slate-500 mb-2">行号从上到下：1→4；列号从左到右：1→6。</p>
          <div class="board-grid" id="boardGrid"></div>
          <div class="flex justify-between items-center mt-3 text-xs text-slate-500">
            <span>已填 <span id="filledCount">${board.cells.filter(c => String(c).trim()).length}</span> / 24</span>
            <div class="flex gap-2">
              <button id="cancelBtn" class="btn btn-ghost">取消</button>
              <button id="saveBtn" class="btn btn-primary">保存</button>
            </div>
          </div>
        </div>
      `;
      main.innerHTML = html;
      const grid = document.getElementById('boardGrid');
      grid.innerHTML = board.cells.map((c, i) => {
        const row = Math.floor(i / 6) + 1;
        const col = (i % 6) + 1;
        return `<div class="relative"><input data-i="${i}" class="cell-input" value="${Util.escapeHtml(c)}" placeholder="${row}-${col}" maxlength="4" /></div>`;
      }).join('');
      document.getElementById('filledCount').textContent = board.cells.filter(c => String(c).trim()).length;
      grid.querySelectorAll('input.cell-input').forEach(inp => {
        inp.addEventListener('input', e => {
          const i = Number(inp.dataset.i);
          const v = Util.normalizeCode(inp.value).slice(0, 4);
          board.cells[i] = v;
          document.getElementById('filledCount').textContent = board.cells.filter(c => String(c).trim()).length;
        });
        inp.addEventListener('blur', e => {
          inp.value = Util.normalizeCode(inp.value).slice(0, 4);
        });
      });
      document.getElementById('boardName').addEventListener('input', e => {
        board.name = e.target.value;
      });
      document.getElementById('resetBtn').addEventListener('click', () => {
        if (!confirm(`确认清空板${boardId}的所有色号？`)) return;
        board.cells = new Array(24).fill('');
        render();
      });
      document.getElementById('cancelBtn').addEventListener('click', () => {
        location.hash = '#/boards';
      });
      document.getElementById('saveBtn').addEventListener('click', async () => {
        board.name = (board.name || '').trim() || `板${boardId}`;
        // 校验
        for (let i = 0; i < board.cells.length; i++) {
          const v = Util.normalizeCode(board.cells[i]);
          if (v && !Parser.CODE_RE.test(v)) {
            Toast.show(`第 ${Math.floor(i / 6) + 1} 行第 ${i % 6 + 1} 列的色号 "${v}" 不合法`);
            return;
          }
          board.cells[i] = v;
        }
        await DB.saveBoard(board);
        Toast.show('已保存');
        location.hash = '#/boards';
      });
    }
    render();
  }

  window.BoardSetupView = { renderList, renderEdit };
})();
