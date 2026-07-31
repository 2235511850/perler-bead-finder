// patternEdit.js —— 图纸新建 / 编辑（粘贴模板）

(function () {

  async function renderNew(main) {
    return renderEdit(main, { id: null });
  }

  async function renderEdit(main, params) {
    const editingId = params.id ? Number(params.id) : null;
    let editing = null;
    if (editingId) {
      editing = await DB.getPattern(editingId);
      if (!editing) {
        main.innerHTML = `<div class="card">图纸不存在</div>`;
        return;
      }
    }

    const initialText = editing ? Parser.serialize(editing.colors) : Parser.templateSample();

    main.innerHTML = `
      <div class="flex items-center justify-between mb-3">
        <a href="${editingId ? `#/patterns/${editingId}` : '#/patterns'}" class="text-sm text-slate-500">← 返回</a>
        <span class="text-xs text-slate-400">${editingId ? '编辑图纸' : '新建图纸'}</span>
      </div>
      <div class="card space-y-3">
        <div>
          <label class="block text-xs text-slate-500 mb-1">图纸名称</label>
          <input id="pName" class="input" value="${editing ? Util.escapeHtml(editing.name) : ''}" placeholder="例如：皮卡丘像素图" maxlength="50" />
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs text-slate-500">色号清单（每行：色号 颗数）</label>
            <div class="flex gap-2">
              <button id="copyTpl" class="btn btn-ghost text-xs">复制模板</button>
              <button id="fillDemo" class="btn btn-ghost text-xs">填示例</button>
              <button id="clearTxt" class="btn btn-ghost text-xs">清空</button>
            </div>
          </div>
          <textarea id="pText" class="textarea font-mono text-sm" rows="12" placeholder="A1 12&#10;A3 30&#10;B2 8"></textarea>
        </div>
        <div id="parseResult"></div>
        <div class="flex justify-end gap-2">
          <a href="${editingId ? `#/patterns/${editingId}` : '#/patterns'}" class="btn btn-ghost">取消</a>
          <button id="saveBtn" class="btn btn-primary" disabled>保存</button>
        </div>
      </div>
    `;

    document.getElementById('pText').value = initialText;
    document.getElementById('copyTpl').addEventListener('click', () => {
      navigator.clipboard.writeText(Parser.templateSample()).then(
        () => Toast.show('模板已复制到剪贴板'),
        () => Toast.show('复制失败，请手动选择')
      );
    });
    document.getElementById('fillDemo').addEventListener('click', () => {
      document.getElementById('pText').value = Parser.templateSample();
      parseAndRender();
    });
    document.getElementById('clearTxt').addEventListener('click', () => {
      document.getElementById('pText').value = '';
      parseAndRender();
    });

    let lastColors = [];

    function parseAndRender() {
      const text = document.getElementById('pText').value;
      const { colors, invalid } = Parser.parse(text);
      lastColors = colors;
      const result = document.getElementById('parseResult');
      const saveBtn = document.getElementById('saveBtn');
      if (colors.length === 0) {
        result.innerHTML = `<div class="text-xs text-slate-400">识别到 0 个色号</div>`;
        saveBtn.disabled = true;
        return;
      }
      const total = colors.reduce((s, c) => s + c.count, 0);
      result.innerHTML = `
        <div class="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <div class="flex justify-between mb-2">
            <span class="font-medium text-slate-700">预览（${colors.length} 种色号，${total} 颗）</span>
            ${invalid.length ? `<span class="text-xs text-amber-600">${invalid.length} 行无效</span>` : ''}
          </div>
          <div class="max-h-48 overflow-auto divide-y divide-slate-200">
            ${colors.map(c => `<div class="flex justify-between py-1 text-xs"><span class="font-mono text-slate-700">${c.code}</span><span class="text-slate-500">×${c.count}</span></div>`).join('')}
          </div>
          ${invalid.length ? `
            <details class="mt-2 text-xs text-amber-700">
              <summary class="cursor-pointer">无效行 (${invalid.length})</summary>
              <ul class="list-disc list-inside mt-1">
                ${invalid.map(it => `<li>第 ${it.line} 行：${Util.escapeHtml(it.raw)} — ${Util.escapeHtml(it.reason)}</li>`).join('')}
              </ul>
            </details>
          ` : ''}
        </div>
      `;
      saveBtn.disabled = false;
    }

    document.getElementById('pText').addEventListener('input', Util.debounce(parseAndRender, 150));
    parseAndRender();

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const name = document.getElementById('pName').value.trim() || '未命名图纸';
      if (!lastColors.length) {
        Toast.show('请先录入色号');
        return;
      }
      if (editingId) {
        await DB.updatePattern({
          patternId: editingId,
          name,
          colors: lastColors,
          checkedSet: editing.checkedSet || [],
          templateId: editing.templateId || null
        });
        Toast.show('已保存');
        location.hash = `#/patterns/${editingId}`;
      } else {
        const p = await DB.createPattern({
          name,
          colors: lastColors,
          checkedSet: []
        });
        Toast.show('已创建');
        location.hash = `#/patterns/${p.patternId}`;
      }
    });
  }

  window.PatternEditView = { renderNew, renderEdit };
})();
