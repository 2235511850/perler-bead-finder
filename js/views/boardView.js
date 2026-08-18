// boardView.js —— 视图 C：4×6 虚拟板视图
// 路由：
//   #/patterns/:id/board            板选择 + 默认板1
//   #/patterns/:id/board/:boardId   单板视图

(function () {
  async function render(main, params) {
    const patternId = Number(params.id);
    const requestedBoardId = params.boardId ? Number(params.boardId) : null;
    const pattern = await PatternDetailView.ensurePattern(main, patternId);
    if (!pattern) return;

    const PD = PatternDetailView;
    main.innerHTML = PD.header(patternId, 'board') + `<div id="boardBody"></div>`;
    document.getElementById('headerInfo').innerHTML = PD.renderHeaderInfo(pattern);
    const body = document.getElementById('boardBody');

    if (!State.boards || !State.boards.length) {
      body.innerHTML = `
        <div class="card text-center py-10">
          <p class="text-slate-600 mb-3">还没录入板模板</p>
          <a href="#/boards" class="btn btn-primary">去录入板模板</a>
        </div>`;
      return;
    }

    // 从 URL hash 中提取 focus 参数
    const hash = location.hash;
    const focusMatch = hash.match(/[?&]focus=([^&]+)/);
    const focusCode = focusMatch ? Util.normalizeCode(decodeURIComponent(focusMatch[1])) : null;
    if (focusMatch) {
      const cleanHash = hash.split('?')[0];
      history.replaceState(null, '', cleanHash);
    }

    let activeBoardId = requestedBoardId;
    if (!activeBoardId || !State.boards.find(b => b.boardId === activeBoardId)) {
      const codes = new Set(pattern.colors.map(c => c.code));
      const candidate = State.boards.find(b => b.cells.some(c => codes.has(Util.normalizeCode(c))));
      activeBoardId = candidate ? candidate.boardId : (State.boards[0] && State.boards[0].boardId) || 1;
    }

    const lowStock = new Set(await DB.getLowStock());

    function renderBoardPicker() {
      const wrap = document.createElement('div');
      wrap.className = 'card mb-3';
      wrap.innerHTML = `
        <div class="text-xs text-slate-500 mb-2">切换板</div>
        <div class="grid grid-cols-3 gap-2">
          ${State.boards.map(b => `
            <a href="#/patterns/${patternId}/board/${b.boardId}" class="text-center py-2 rounded-md text-sm ${b.boardId === activeBoardId ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'bg-slate-100 text-slate-700'}">
              ${Util.escapeHtml(b.name)}
            </a>
          `).join('')}
        </div>
      `;
      return wrap;
    }

    function renderActiveBoard() {
      const board = State.boards.find(b => b.boardId === activeBoardId);
      if (!board) {
        const empty = document.createElement('div');
        empty.className = 'card text-center text-slate-500 py-10';
        empty.textContent = '该板不存在';
        return empty;
      }
      const card = document.createElement('div');
      card.className = 'card';
      const checked = new Set(pattern.checkedSet || []);
      const needCodes = new Set(pattern.colors.map(c => c.code));

      card.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div>
            <div class="font-semibold text-slate-700">${Util.escapeHtml(board.name)} <span class="text-xs text-slate-400">板${board.boardId}</span></div>
            <div class="text-xs text-slate-400">点击格子标记完成</div>
          </div>
          <div class="text-xs text-slate-500" id="boardStats"></div>
        </div>
        <div class="board-grid" id="boardCells"></div>
      `;
      const cells = card.querySelector('#boardCells');
      // 反向索引：色号 -> 该色号曾由哪些原色号替代而来
      const incomingMap = PatternDetailView.buildIncomingMap(pattern.replacements);
      cells.innerHTML = board.cells.map((code, i) => {
        const c = Util.normalizeCode(code);
        const isNeed = c && needCodes.has(c);
        const isDone = c && checked.has(c);
        const isFocus = c && c === focusCode;
        const isLow = c && lowStock.has(c);
        const hasRepl = c && incomingMap.has(c);
        let cls = 'cell-display';
        if (!c) cls += ' empty';
        else if (isDone) cls += ' done';
        if (isFocus) cls += ' match';
        if (isLow) cls += ' low-stock';
        if (hasRepl) cls += ' has-replacement';
        const warn = isLow ? '<span class="low-warn-dot" title="库存告急">!</span>' : '';
        // 原色角标（删除线原色号，截断显示）
        const replBadge = hasRepl
          ? `<span class="repl-badge" title="原色：${incomingMap.get(c).map(x => x.from).join('、')}">${incomingMap.get(c).map(x => `<span class="line-through">${Util.escapeHtml(x.from)}</span>`).join(',')}</span>`
          : '';
        return `<div class="${cls}" data-i="${i}" data-code="${Util.escapeHtml(c)}" style="position:relative;cursor:${isNeed ? 'pointer' : 'default'}; ${isNeed ? '' : 'opacity:0.55;'}">${replBadge}${c ? Util.escapeHtml(c) : '·'}${warn}</div>`;
      }).join('');

      const stats = card.querySelector('#boardStats');
      const usedHere = board.cells.map(c => Util.normalizeCode(c)).filter(c => c && needCodes.has(c));
      const doneHere = usedHere.filter(c => checked.has(c)).length;
      stats.innerHTML = `本板需 <strong>${usedHere.length}</strong>，已完成 <strong>${doneHere}</strong>`;

      cells.querySelectorAll('.cell-display').forEach(el => {
        el.addEventListener('click', async () => {
          const code = el.getAttribute('data-code');
          if (!code || !needCodes.has(code)) return;
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
              renderAll();
            }
          );
          renderAll();
        });
      });
      return card;
    }

    function renderAll() {
      body.innerHTML = '';
      body.appendChild(renderBoardPicker());
      body.appendChild(renderActiveBoard());
    }

    renderAll();
  }

  window.BoardViewCtl = { render };
})();
