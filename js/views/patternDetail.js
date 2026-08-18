// patternDetail.js —— 图纸详情总入口 + 视图 A（按板聚合）

(function () {

  function header(patternId, active) {
    return `
      <div class="flex items-center justify-between mb-3">
        <a href="#/patterns" class="text-sm text-slate-500">← 图纸列表</a>
        <div class="flex gap-3">
          <button id="copyPatternBtn" class="text-sm text-slate-500">复制</button>
          <a href="#/patterns/${patternId}/edit" class="text-sm text-slate-500">编辑</a>
        </div>
      </div>
      <div class="card mb-3">
        <div id="headerInfo"></div>
        <div class="tab-bar mt-3" id="tabBar">
          <a href="#/patterns/${patternId}/group" class="${active === 'group' ? 'active' : ''}">按板聚合</a>
          <a href="#/patterns/${patternId}/find" class="${active === 'find' ? 'active' : ''}">色号查找</a>
          <a href="#/patterns/${patternId}/board" class="${active === 'board' ? 'active' : ''}">虚拟板视图</a>
        </div>
      </div>
    `;
  }

  // 绑定复制按钮（各视图渲染 header 后调用）
  function bindCopyBtn(patternId) {
    const btn = document.getElementById('copyPatternBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const copy = await DB.copyPattern(patternId);
      Toast.show(`已复制为「${copy.name}」`);
      location.hash = `#/patterns/${copy.patternId}`;
    });
  }

  async function ensurePattern(main, patternId) {
    const p = await DB.getPattern(patternId);
    if (!p) {
      main.innerHTML = `<div class="card">图纸不存在。<a href="#/patterns" class="text-indigo-600">返回列表</a></div>`;
      return null;
    }
    State.activePattern = p;
    if (!State.boards || !State.boards.length) {
      State.boards = await DB.getAllBoards();
    }
    return p;
  }

  function renderHeaderInfo(pattern) {
    const prog = calcProgress(pattern);
    const codePct = prog.code.total ? Math.round(prog.code.done / prog.code.total * 100) : 0;
    const beadPct = prog.bead.total ? Math.round(prog.bead.done / prog.bead.total * 100) : 0;
    const complete = prog.code.total > 0 && prog.code.done === prog.code.total;
    const repls = pattern.replacements || [];
    const replsHtml = repls.length ? `
      <div class="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2">
        <div class="text-xs text-emerald-800 font-medium mb-1">已替代色号（${repls.length}）</div>
        <div class="replaced-chips">
          ${repls.map(r => `
            <span class="repl-chip">
              <span class="line-through text-slate-500">${Util.escapeHtml(r.from)}</span>
              <span class="text-slate-400 mx-1">→</span>
              <span class="font-mono font-semibold">${Util.escapeHtml(r.to)}</span>
              ${r.count > 1 ? `<span class="text-[10px] text-slate-400 ml-1">×${r.count}</span>` : ''}
            </span>
          `).join('')}
        </div>
      </div>
    ` : '';
    return `
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-lg font-bold text-slate-800">${Util.escapeHtml(pattern.name)}</h1>
          <div class="text-xs text-slate-400 mt-1">共 ${pattern.colors.length} 种色号 · ${prog.bead.total} 颗</div>
        </div>
        ${complete ? '<span class="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">已完成</span>' : ''}
      </div>
      <div class="mt-3 space-y-2">
        <div>
          <div class="flex justify-between text-xs text-slate-500 mb-1">
            <span>色号进度</span>
            <span>${prog.code.done} / ${prog.code.total}（${codePct}%）</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${codePct}%"></div></div>
        </div>
        <div>
          <div class="flex justify-between text-xs text-slate-500 mb-1">
            <span>颗数进度</span>
            <span>${prog.bead.done} / ${prog.bead.total}（${beadPct}%）</span>
          </div>
          <div class="progress-track"><div class="progress-fill beads" style="width:${beadPct}%"></div></div>
        </div>
      </div>
      ${replsHtml}
    `;
  }

  // ---------------- 视图 A：按板聚合 ----------------
  async function renderGrouped(main, params) {
    const patternId = Number(params.id);
    const pattern = await ensurePattern(main, patternId);
    if (!pattern) return;

    const boards = State.boards || [];
    const hasBoards = boards.length > 0;

    main.innerHTML = header(patternId, 'group') + `<div id="groupBody"></div>`;
    document.getElementById('headerInfo').innerHTML = renderHeaderInfo(pattern);
    bindCopyBtn(patternId);
    const body = document.getElementById('groupBody');

    if (!hasBoards) {
      body.innerHTML = `
        <div class="card text-center py-10">
          <p class="text-slate-600 mb-3">还没录入板模板</p>
          <a href="#/boards" class="btn btn-primary">去录入板模板</a>
        </div>`;
      return;
    }

    // 按板分组：找出该图纸中每块板用到的色号
    const codeMap = new Map();
    pattern.colors.forEach(c => codeMap.set(c.code, c.count));
    const allCodes = new Set(Array.from(codeMap.keys()));

    // 每块板上每个色号 → 出现位置集合
    const boardMap = new Map();
    boards.forEach(b => {
      const list = [];
      const posByCode = new Map();
      b.cells.forEach((cell, i) => {
        const code = Util.normalizeCode(cell);
        if (code && allCodes.has(code)) {
          if (!posByCode.has(code)) posByCode.set(code, []);
          posByCode.get(code).push(Util.indexToPos(i, b.layout.cols));
        }
      });
      posByCode.forEach((pos, code) => list.push({ code, pos }));
      boardMap.set(b.boardId, list);
    });

    // 收集未在任何板上的色号
    const orphan = [];
    allCodes.forEach(code => {
      let found = false;
      boardMap.forEach(list => {
        if (list.find(x => x.code === code)) found = true;
      });
      if (!found) orphan.push(code);
    });

    function renderBody() {
      const checked = new Set(pattern.checkedSet || []);
      let html = '';
      boards.forEach(b => {
        const list = boardMap.get(b.boardId) || [];
        if (list.length === 0) return;
        html += `
          <div class="card mb-3">
            <div class="flex items-center justify-between mb-2">
              <div class="font-semibold text-slate-700">${Util.escapeHtml(b.name)} <span class="text-xs text-slate-400">板${b.boardId}</span></div>
              <div class="text-xs text-slate-400">${list.length} 种色号</div>
            </div>
            <div class="space-y-2">
              ${list.map(item => {
                const isDone = checked.has(item.code);
                const incoming = PatternDetailView.getIncomingReplacements(pattern, item.code);
                const replClass = incoming.length ? ' has-replacement' : '';
                const replChip = incoming.length
                  ? `<div class="mt-1"><span class="replaced-from"><span class="replaced-from-label">原色</span>${incoming.map(x => `<span class="line-through">${Util.escapeHtml(x.from)}</span>`).join('、')}</span></div>`
                  : '';
                return `
                  <label class="checkbox-row ${isDone ? 'done' : ''}${replClass}">
                    <input type="checkbox" data-code="${item.code}" ${isDone ? 'checked' : ''} />
                    <div class="flex-1">
                      <div class="font-mono text-sm font-semibold">${item.code}</div>
                      <div class="text-xs text-slate-500">
                        位置：${item.pos.map(p => `R${p.row}C${p.col}`).join('、')}
                      </div>
                      ${replChip}
                    </div>
                    <div class="text-xs text-slate-500">×${codeMap.get(item.code) || 1}</div>
                  </label>
                `;
              }).join('')}
            </div>
          </div>
        `;
      });
      if (orphan.length) {
        html += `
          <div class="card mb-3 border-amber-200 bg-amber-50">
            <div class="font-semibold text-amber-800 mb-2">未在任何板上找到的色号</div>
            <div class="space-y-1">
              ${orphan.map(c => `<span class="inline-block px-2 py-1 rounded-md bg-white border border-amber-200 text-amber-800 font-mono text-sm mr-2 mb-1">${c}</span>`).join('')}
            </div>
            <p class="text-xs text-amber-700 mt-2">提示：去 <a href="#/boards" class="underline">板模板</a> 补录这些色号。</p>
          </div>
        `;
      }
      body.innerHTML = html || `<div class="card text-center text-slate-500 py-10">该图纸所有色号都没在板上找到</div>`;
      body.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', async () => {
          const code = cb.getAttribute('data-code');
          const wasDone = !cb.checked;
          // cb.checked 反映新状态
          const set = new Set(pattern.checkedSet || []);
          if (cb.checked) set.add(code); else set.delete(code);
          pattern.checkedSet = Array.from(set);
          await DB.updatePattern(pattern);
          document.getElementById('headerInfo').innerHTML = renderHeaderInfo(pattern);
          showUndoBar(
            wasDone ? `已撤销：${code}` : `已标记完成：${code}`,
            async () => {
              const set2 = new Set(pattern.checkedSet || []);
              if (wasDone) set2.add(code); else set2.delete(code);
              pattern.checkedSet = Array.from(set2);
              await DB.updatePattern(pattern);
              renderBody();
              document.getElementById('headerInfo').innerHTML = renderHeaderInfo(pattern);
            }
          );
          renderBody();
        });
      });
    }

    renderBody();
  }

  // 把 replacements 列表（{from, to, count}[]）构造成 Map：toCode -> [{from, count}]
  // 用于详情页、虚拟板、色号查找器等任意视图查询"这个色号曾由哪些原色号替换而来"
  function buildIncomingMap(repls) {
    const map = new Map();
    (repls || []).forEach(r => {
      if (!r || !r.to) return;
      if (!map.has(r.to)) map.set(r.to, []);
      map.get(r.to).push({ from: r.from, count: r.count || 1 });
    });
    return map;
  }

  function getIncomingReplacements(pattern, code) {
    return buildIncomingMap(pattern && pattern.replacements).get(code) || [];
  }

  window.PatternDetailView = { renderGrouped, renderHeaderInfo, ensurePattern, header, buildIncomingMap, getIncomingReplacements, bindCopyBtn };
})();
