// colorFinder.js —— 视图 B：色号查找器

(function () {
  async function render(main, params) {
    const patternId = Number(params.id);
    const pattern = await PatternDetailView.ensurePattern(main, patternId);
    if (!pattern) return;

    const PD = PatternDetailView;
    main.innerHTML = PD.header(patternId, 'find') + `<div id="finderBody"></div>`;
    document.getElementById('headerInfo').innerHTML = PD.renderHeaderInfo(pattern);
    const body = document.getElementById('finderBody');

    body.innerHTML = `
      <div class="card">
        <label class="block text-xs text-slate-500 mb-1">输入色号</label>
        <input id="codeInput" class="input font-mono text-lg" placeholder="例如 A1" autofocus />
        <div class="text-xs text-slate-400 mt-2">图纸中用到的色号：
          <div class="flex flex-wrap gap-1 mt-1" id="quickCodes"></div>
        </div>
      </div>
      <div id="findResult" class="mt-4"></div>
    `;

    const input = document.getElementById('codeInput');
    const result = document.getElementById('findResult');
    const quick = document.getElementById('quickCodes');
    quick.innerHTML = pattern.colors.map(c => `<button class="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 font-mono text-xs" data-code="${c.code}">${c.code}</button>`).join('');
    quick.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        input.value = b.getAttribute('data-code');
        doFind();
      });
    });

    async function doFind() {
      const code = Util.normalizeCode(input.value);
      result.innerHTML = '';
      if (!code) return;
      const color = pattern.colors.find(c => c.code === code);
      const locs = locateCode(code, State.boards || []);
      const checked = new Set(pattern.checkedSet || []);
      const isDone = checked.has(code);

      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <div class="flex items-start justify-between mb-2">
          <div>
            <div class="text-2xl font-bold font-mono">${code}</div>
            <div class="text-xs text-slate-500 mt-1">
              ${color ? `本图需 <strong>${color.count}</strong> 颗` : '<span class="text-amber-600">该色号不在本图清单中</span>'}
            </div>
          </div>
          ${color ? `<button id="markBtn" class="btn ${isDone ? 'btn-secondary' : 'btn-primary'}">${isDone ? '已标记（点此撤销）' : '标记完成'}</button>` : ''}
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

    input.addEventListener('input', Util.debounce(doFind, 100));
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doFind(); });
    input.focus();
  }

  window.ColorFinderView = { render };
})();