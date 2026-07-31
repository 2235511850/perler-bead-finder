// app.js —— 入口

(async function () {
  const main = document.getElementById('appMain');

  async function home() {
    const boards = await DB.getAllBoards();
    const patterns = await DB.getAllPatterns();
    const filled = boards.filter(b => b.cells && b.cells.filter(c => String(c).trim()).length > 0).length;
    const lastId = await DB.getSetting('lastActivePatternId', null);

    main.innerHTML = `
      <div class="text-center py-8">
        <div class="inline-block w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 mb-3"></div>
        <h1 class="text-2xl font-bold text-slate-800">拼豆找色助手</h1>
        <p class="text-sm text-slate-500 mt-1">本地存储，离线可用</p>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="card text-center">
          <div class="text-xs text-slate-500">板模板</div>
          <div class="text-2xl font-bold text-slate-800 mt-1">${filled}/6</div>
        </div>
        <div class="card text-center">
          <div class="text-xs text-slate-500">图纸数量</div>
          <div class="text-2xl font-bold text-slate-800 mt-1">${patterns.length}</div>
        </div>
      </div>

      ${lastId ? `
        <div class="card mb-3">
          <div class="text-xs text-slate-500 mb-1">最近图纸</div>
          ${(() => {
            const p = patterns.find(x => x.patternId === lastId);
            if (!p) return '<div class="text-xs text-slate-400">找不到这张图纸</div>';
            const prog = calcProgress(p);
            const beadPct = prog.bead.total ? Math.round(prog.bead.done / prog.bead.total * 100) : 0;
            return `
              <a href="#/patterns/${p.patternId}" class="font-medium text-slate-800 block">${Util.escapeHtml(p.name)}</a>
              <div class="text-xs text-slate-400 mt-1">${prog.code.done}/${prog.code.total} 色号 · ${beadPct}% 颗数</div>
            `;
          })()}
        </div>
      ` : ''}

      <div class="space-y-3">
        <a href="#/patterns/new" class="btn btn-primary w-full">+ 新建图纸</a>
        <a href="#/patterns" class="btn btn-secondary w-full">查看图纸列表（${patterns.length}）</a>
        <a href="#/boards" class="btn btn-secondary w-full">录入板模板（${filled}/6）</a>
      </div>
    `;
  }

  // 记录最近图纸
  async function trackActive(patternId) {
    if (patternId) await DB.setSetting('lastActivePatternId', Number(patternId));
  }

  Router.add('/', async () => home());

  Router.add('/boards', () => BoardSetupView.renderList(main));
  Router.add('/boards/:id', p => BoardSetupView.renderEdit(main, p));

  Router.add('/patterns', () => PatternListView.render(main));
  Router.add('/patterns/new', () => PatternEditView.renderNew(main));
  Router.add('/patterns/:id/edit', async p => {
    trackActive(p.id);
    return PatternEditView.renderEdit(main, p);
  });

  Router.add('/patterns/:id', async p => {
    await trackActive(p.id);
    return PatternDetailView.renderGrouped(main, p);
  });
  Router.add('/patterns/:id/group', async p => {
    await trackActive(p.id);
    return PatternDetailView.renderGrouped(main, p);
  });
  Router.add('/patterns/:id/find', async p => {
    await trackActive(p.id);
    return ColorFinderView.render(main, p);
  });
  Router.add('/patterns/:id/board', async p => {
    await trackActive(p.id);
    return BoardViewCtl.render(main, p);
  });
  Router.add('/patterns/:id/board/:boardId', async p => {
    await trackActive(p.id);
    return BoardViewCtl.render(main, p);
  });

  // Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW register failed', err);
      });
    });
  }

  // 启动路由
  Router.start();
})();