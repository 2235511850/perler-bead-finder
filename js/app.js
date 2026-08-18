// app.js —— 入口

(async function () {
  const main = document.getElementById('appMain');

  async function home() {
    const boards = await DB.getAllBoards();
    const patterns = await DB.getAllPatterns();
    const filled = boards.filter(b => b.cells && b.cells.filter(c => String(c).trim()).length > 0).length;
    const lastId = await DB.getSetting('lastActivePatternId', null);
    const lowStockCount = (await DB.getLowStock()).length;

    main.innerHTML = `
      <div class="text-center py-8">
        <div class="inline-block w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 mb-3"></div>
        <h1 class="text-2xl font-bold text-slate-800">拼豆找色助手</h1>
        <p class="text-sm text-slate-500 mt-1">本地存储，离线可用</p>
      </div>

      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="card text-center">
          <div class="text-xs text-slate-500">板模板</div>
          <div class="text-2xl font-bold text-slate-800 mt-1">${filled}/${boards.length}</div>
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
        <a href="#/boards" class="btn btn-secondary w-full flex items-center justify-between">
          <span>录入板模板（${filled}/${boards.length}）</span>
          ${lowStockCount ? `<span class="badge-low-stock">告急 ${lowStockCount}</span>` : ''}
        </a>
      </div>

      <div class="flex gap-2 mt-4">
        <button id="exportBtn" class="btn btn-ghost text-xs flex-1">导出数据</button>
        <button id="importBtn" class="btn btn-ghost text-xs flex-1">导入数据</button>
      </div>
      <input type="file" id="importFile" accept=".json" class="hidden" />
    `;

    // ---- 导入导出 ----
    document.getElementById('exportBtn').addEventListener('click', async () => {
      const data = await DB.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `perler-bead-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.show('已导出备份文件');
    });

    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.boards && !data.patterns) {
          Toast.show('文件格式不正确');
          return;
        }
        openImportDialog(data);
      } catch (err) {
        Toast.show('读取文件失败：' + (err.message || '未知错误'));
      }
      e.target.value = '';
    });
  }

  // 记录最近图纸
  async function trackActive(patternId) {
    if (patternId) await DB.setSetting('lastActivePatternId', Number(patternId));
  }

  Router.add('/', async () => home());

  // ---- 导入确认弹窗 ----
  function openImportDialog(data) {
    let root = document.getElementById('importDialogRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'importDialogRoot';
      document.body.appendChild(root);
    }
    const boardCount = (data.boards || []).length;
    const patternCount = (data.patterns || []).length;
    const lowCount = (data.lowStockCodes || []).length;
    const dateStr = data.exportedAt ? new Date(data.exportedAt).toLocaleString('zh-CN') : '未知时间';

    root.innerHTML = `
      <div class="modal-mask" id="importMask">
        <div class="modal-panel" style="max-width:420px;">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-semibold text-slate-800">导入数据</h3>
            <button id="importClose" class="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <div class="text-xs text-slate-500 space-y-1 mb-4">
            <div>备份时间：${dateStr}</div>
            <div>包含：${boardCount} 块板 · ${patternCount} 张图纸${lowCount ? ' · ' + lowCount + ' 个告急色号' : ''}</div>
          </div>
          <div class="space-y-2 mb-4">
            <label class="flex items-start gap-2 cursor-pointer p-3 rounded-lg border border-slate-200 hover:border-indigo-300">
              <input type="radio" name="importMode" value="merge" checked class="mt-0.5" />
              <div>
                <div class="text-sm font-medium text-slate-700">合并导入</div>
                <div class="text-xs text-slate-500">保留现有数据，同 ID 的板/图纸会被覆盖，新的会添加</div>
              </div>
            </label>
            <label class="flex items-start gap-2 cursor-pointer p-3 rounded-lg border border-slate-200 hover:border-rose-300">
              <input type="radio" name="importMode" value="overwrite" class="mt-0.5" />
              <div>
                <div class="text-sm font-medium text-rose-600">覆盖导入</div>
                <div class="text-xs text-slate-500">清空当前所有数据，替换为备份内容（不可恢复）</div>
              </div>
            </label>
          </div>
          <div class="flex justify-end gap-2">
            <button id="importCancel" class="btn btn-ghost text-sm">取消</button>
            <button id="importConfirm" class="btn btn-primary text-sm">确认导入</button>
          </div>
        </div>
      </div>
    `;

    function close() { root.innerHTML = ''; }
    root.querySelector('#importClose').addEventListener('click', close);
    root.querySelector('#importCancel').addEventListener('click', close);
    root.querySelector('.modal-mask').addEventListener('click', e => {
      if (e.target === root.querySelector('.modal-mask')) close();
    });
    root.querySelector('#importConfirm').addEventListener('click', async () => {
      const mode = root.querySelector('input[name="importMode"]:checked').value;
      if (mode === 'overwrite') {
        if (!confirm('覆盖导入将清空当前所有数据！确定继续？')) return;
      }
      try {
        close();
        const result = await DB.importData(data, mode);
        let msg = `导入完成：板 +${result.boardsAdded} 更${result.boardsUpdated}，图纸 +${result.patternsAdded} 更${result.patternsUpdated}`;
        Toast.show(msg, 4000);
        home();
      } catch (err) {
        Toast.show('导入失败：' + (err.message || '未知错误'));
      }
    });
  }

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

  // 注意：file:// 协议下 Service Worker 不可用，此功能仅部署到 http(s) 时生效
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW register failed', err);
      });
    });
  }

  // 键盘弹出时隐藏底部导航，收起时恢复（移动端适配）
  if (window.visualViewport) {
    const nav = document.getElementById('appNav');
    const vv = window.visualViewport;
    let baselineHeight = vv.height;
    vv.addEventListener('resize', () => {
      if (vv.height < baselineHeight - 150) {
        if (nav) nav.style.display = 'none';
      } else {
        baselineHeight = vv.height;
        if (nav) nav.style.display = '';
      }
    });
  }

  // 启动路由
  Router.start();
})();