// patternList.js —— 图纸列表

(function () {
  async function render(main) {
    const patterns = await DB.getAllPatterns();

    const html = `
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold text-slate-800">图纸列表</h1>
        <a href="#/patterns/new" class="btn btn-primary text-sm">+ 新建图纸</a>
      </div>
      ${patterns.length === 0 ? `
        <div class="card text-center py-12">
          <p class="text-slate-500 mb-3">还没有图纸</p>
          <a href="#/patterns/new" class="btn btn-primary">新建第一张图纸</a>
        </div>
      ` : `
        <div class="space-y-3">
          ${patterns.map(p => {
            const prog = calcProgress(p);
            const codePct = prog.code.total ? Math.round(prog.code.done / prog.code.total * 100) : 0;
            const beadPct = prog.bead.total ? Math.round(prog.bead.done / prog.bead.total * 100) : 0;
            const complete = prog.code.total > 0 && prog.code.done === prog.code.total;
            const replN = (p.replacements || []).length;
            return `
              <div class="card">
                <div class="flex items-start justify-between gap-3">
                  <a href="#/patterns/${p.patternId}" class="flex-1 block">
                    <div class="font-semibold text-slate-800 flex items-center gap-2">
                      ${Util.escapeHtml(p.name)}
                      ${complete ? '<span class="text-xs text-emerald-600">已完成</span>' : ''}
                      ${replN ? `<span class="replaced-from" title="在录入时选用了替代色号"><span class="replaced-from-label">替代</span>${replN}</span>` : ''}
                    </div>
                    <div class="text-xs text-slate-400 mt-1">更新于 ${Util.formatDate(p.updatedAt)}</div>
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
                  </a>
                  <div class="flex flex-col gap-1">
                    <a href="#/patterns/${p.patternId}/edit" class="btn btn-ghost text-xs">编辑</a>
                    <button class="btn btn-ghost text-xs" data-copy="${p.patternId}">复制</button>
                    <button class="btn btn-ghost text-xs text-red-600" data-del="${p.patternId}">删除</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `}
    `;
    main.innerHTML = html;
    main.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-del'));
        if (!confirm('确认删除这张图纸？此操作不可恢复。')) return;
        await DB.deletePattern(id);
        Toast.show('已删除');
        render(main);
      });
    });
    main.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.getAttribute('data-copy'));
        const copy = await DB.copyPattern(id);
        Toast.show(`已复制为「${copy.name}」`);
        render(main);
      });
    });
  }

  window.PatternListView = { render };
})();
