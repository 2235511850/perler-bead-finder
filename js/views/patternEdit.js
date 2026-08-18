// patternEdit.js —— 图纸新建 / 编辑（粘贴模板）
// 新增：自动找最相近色号（Oklab 感知色差）

(function () {

  const LS_AUTO = 'perler.autoSuggest';
  const LS_THRESH = 'perler.suggestThreshold';

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

    // 持久化设置读取
    const autoSuggest = localStorage.getItem(LS_AUTO) === '1';
    const threshold = Number(localStorage.getItem(LS_THRESH)) || 0.20;

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
        <div class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <label class="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
            <input id="autoSuggestSwitch" type="checkbox" ${autoSuggest ? 'checked' : ''} />
            <span>自动找最相近色号</span>
          </label>
          <div class="flex items-center gap-2 mt-2 pl-6">
            <span class="text-xs text-slate-500">色差阈值</span>
            <input id="thresholdRange" type="range" min="0.05" max="0.50" step="0.01" value="${threshold}" class="threshold-range flex-1" />
            <span id="thresholdLabel" class="text-xs font-mono text-slate-600 w-10 text-right">${threshold.toFixed(2)}</span>
          </div>
          <p class="text-[11px] text-slate-400 mt-1 pl-6">超过阈值会标 ⚠；阈值仅影响标注，不改变推荐结果。</p>
        </div>
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="block text-xs text-slate-500">色号清单（每行：色号 颗数）</label>
            <div class="flex gap-2 flex-wrap justify-end">
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
      <div id="suggestionModalRoot"></div>
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

    // 开关 & 阈值事件
    const switchEl = document.getElementById('autoSuggestSwitch');
    const rangeEl = document.getElementById('thresholdRange');
    const labelEl = document.getElementById('thresholdLabel');
    switchEl.addEventListener('change', () => {
      localStorage.setItem(LS_AUTO, switchEl.checked ? '1' : '0');
      parseAndRender();
    });
    rangeEl.addEventListener('input', () => {
      labelEl.textContent = Number(rangeEl.value).toFixed(2);
    });
    rangeEl.addEventListener('change', () => {
      localStorage.setItem(LS_THRESH, rangeEl.value);
      parseAndRender();
    });

    // 缓存板上色号集合
    const allBoards = await DB.getAllBoards();
    State.boards = allBoards;
    const boardCodes = new Set();
    allBoards.forEach(b => (b.cells || []).forEach(c => {
      const code = Util.normalizeCode(c);
      if (code) boardCodes.add(code);
    }));

    // 低库存告急色号（全局），录入时使用
    let lowStockSet = new Set(await DB.getLowStock());

    let lastColors = [];
    let lastUnmapped = [];
    let lastSuggestions = []; // { unmappedCode, suggestion, alternative, location, hasRgbRef }
    let lastModalShown = 0;
    // 会话级替换记录：targetCode -> [{ from, at }]
    const sessionReplacements = new Map();

    function buildSuggestions(unmappedCodes) {
      const suggestions = unmappedCodes.map(um => {
        const hasRgbRef = !!(window.MARD221_RGB && window.MARD221_RGB[um]);
        let candidates = [];
        if (boardCodes.size > 0 && hasRgbRef) {
          const m = window.ColorMatch.findClosestOnBoard(um, [...boardCodes], 5);
          candidates = m.list;
        }
        const top1 = candidates[0] || null;
        const top2 = candidates[1] || null;
        let location = null;
        if (top1) {
          const locs = window.locateCode(top1.code, allBoards);
          if (locs.length) {
            location = { boardId: locs[0].boardId, boardName: locs[0].boardName, row: locs[0].row, col: locs[0].col, extra: locs.length - 1 };
          }
        }
        return { unmappedCode: um, candidates, top1, top2, location, hasRgbRef };
      });
      return suggestions;
    }

    function unmappedSet(colors) {
      // 找出 colors 中存在但板上没有的色号（去重、保持出现顺序）
      const seen = new Set();
      const out = [];
      colors.forEach(c => {
        if (!boardCodes.has(c.code) && !seen.has(c.code)) {
          seen.add(c.code);
          out.push(c.code);
        }
      });
      return out;
    }

    // 返回本次清单中处于"告急状态"的色号（去重、保持顺序）
    function lowStockInPattern(colors) {
      if (!lowStockSet.size) return [];
      const seen = new Set();
      const out = [];
      colors.forEach(c => {
        if (lowStockSet.has(c.code) && !seen.has(c.code)) {
          seen.add(c.code);
          out.push(c.code);
        }
      });
      return out;
    }

    function escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // 历史快照：每次替换前存一份文本，用于"撤销全部"
    let historyStack = [];

    function applyReplacement(unmappedCode, targetCode) {
      const ta = document.getElementById('pText');
      // 替换所有 "CODE" 形式的出现，保留后续数字/分隔
      const re = new RegExp('\\b' + escapeReg(unmappedCode) + '\\b', 'gi');
      const before = ta.value;
      const after = before.replace(re, targetCode);
      if (after === before) return;
      // 写回前先快照
      historyStack.push({ from: unmappedCode, to: targetCode, before, after });
      ta.value = after;
      // 记录本次替换（同一原色号被采纳多次也合并到一支记录里）
      if (!sessionReplacements.has(targetCode)) sessionReplacements.set(targetCode, []);
      const arr = sessionReplacements.get(targetCode);
      const existing = arr.find(x => x.from === unmappedCode);
      if (existing) existing.count += 1;
      else arr.push({ from: unmappedCode, at: Date.now(), count: 1 });
      Toast.show(`已将 ${unmappedCode} 替换为 ${targetCode}`);
      parseAndRender();
    }

    // 反向查：当前色号在本次编辑中曾经由哪些原色号替换而来
    function findIncomingReplacements(code) {
      const arr = sessionReplacements.get(code);
      return arr || [];
    }

    // 总数：所有 targetCode -> [{from,...}] 的 from 总数
    function totalReplacements() {
      let n = 0;
      sessionReplacements.forEach(arr => arr.forEach(x => { n += x.count; }));
      return n;
    }

    // 撤销全部：恢复到"第一次替换之前"的原始文本
    function undoAllReplacements() {
      if (!historyStack.length) return;
      const first = historyStack[0];
      const ta = document.getElementById('pText');
      ta.value = first.before;
      historyStack = [];
      sessionReplacements.clear();
      Toast.show('已撤销全部采纳');
      parseAndRender();
    }

    function openSuggestionModal(suggestions) {
      const root = document.getElementById('suggestionModalRoot');
      if (!suggestions.length) {
        root.innerHTML = '';
        return;
      }
      const rows = suggestions.map(s => {
        const top1 = s.top1;
        const dist = top1 ? top1.distance : null;
        const desc = top1 ? window.ColorMatch.describeDistance(dist) : null;
        const distText = top1 ? dist.toFixed(2) : '—';
        const candidates = s.candidates || [];
        // 原色 swatch
        const origRgb = (window.MARD221_RGB && window.MARD221_RGB[s.unmappedCode]);
        const origHex = window.MARD221 && window.MARD221[s.unmappedCode];
        const origBg = origHex || (origRgb ? `rgb(${origRgb[0]},${origRgb[1]},${origRgb[2]})` : '#f1f5f9');
        // 推荐下拉选项：top1 + 其他候选（按色差排），差太多就跳过
        const maxDist = window.ColorMatch.MAX_CANDIDATE_DISTANCE || 0.5;
        const opts = candidates
          .filter(c => c.distance <= maxDist)
          .map(c => {
            const hex = window.MARD221 && window.MARD221[c.code];
            const bg = hex || '#f1f5f9';
            const dStr = c.distance.toFixed(2);
            const dDesc = window.ColorMatch.describeDistance(c.distance).text;
            const sel = (top1 && c.code === top1.code) ? 'selected' : '';
            return `<option value="${Util.escapeHtml(c.code)}" ${sel} data-bg="${Util.escapeHtml(bg)}" data-dist="${dStr}">${Util.escapeHtml(c.code)} · 色差 ${dStr} (${dDesc})</option>`;
          }).join('');
        const locText = s.location
          ? `板${s.location.boardId} ${s.location.boardName} · R${s.location.row}C${s.location.col}${s.location.extra ? ` (+${s.location.extra})` : ''}`
          : (top1 ? '未在板上找到位置' : '');
        const noRef = !s.hasRgbRef
          ? `<div class="text-xs text-rose-600 mt-1">⚠ 无 RGB 参考：${Util.escapeHtml(s.unmappedCode)} 不在 mard 221 色表中</div>`
          : '';
        const noBoard = (!top1 && s.hasRgbRef)
          ? `<div class="text-xs text-amber-600 mt-1">⚠ 板为空，无法推荐</div>`
          : '';
        return `
          <tr data-row="${Util.escapeHtml(s.unmappedCode)}">
            <td>
              <div class="flex items-center gap-2">
                <span class="color-swatch" style="background:${origBg};width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,0.1);"></span>
                <span class="font-mono font-semibold">${Util.escapeHtml(s.unmappedCode)}</span>
              </div>
            </td>
            <td>
              ${top1 ? `
                <div class="flex items-center gap-2">
                  <span class="color-swatch sug-preview-swatch" data-row="${Util.escapeHtml(s.unmappedCode)}" style="background:${window.MARD221[top1.code] || '#f1f5f9'};width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,0.1);"></span>
                  <select class="select sug-select" data-from="${Util.escapeHtml(s.unmappedCode)}" style="font-size:0.8rem;padding:0.25rem 0.5rem;width:auto;min-width:120px;">
                    ${opts}
                  </select>
                </div>
              ` : '<span class="text-xs text-slate-400">—</span>'}
              ${noRef}${noBoard}
            </td>
            <td>
              <div class="text-xs text-slate-600">${Util.escapeHtml(locText)}</div>
            </td>
            <td>
              ${top1
                ? `<span class="inline-block text-xs px-2 py-1 rounded-full sug-dist-badge" data-row="${Util.escapeHtml(s.unmappedCode)}" style="background:${desc.color}15;color:${desc.color};font-weight:600">${desc.text}</span>
                   <span class="text-xs text-slate-400 ml-1 sug-dist-num" data-row="${Util.escapeHtml(s.unmappedCode)}">${distText}</span>`
                : '<span class="text-xs text-slate-400">—</span>'}
            </td>
            <td class="text-right whitespace-nowrap">
              <button class="btn btn-ghost text-xs sug-adopt" data-from="${Util.escapeHtml(s.unmappedCode)}" ${top1 ? '' : 'disabled'}>采纳</button>
              <button class="btn btn-ghost text-xs sug-skip" data-from="${Util.escapeHtml(s.unmappedCode)}">跳过</button>
            </td>
          </tr>
        `;
      }).join('');

      // 本会话已采纳（按目标色号聚合）
      const replacedRows = [];
      sessionReplacements.forEach((arr, target) => {
        arr.forEach(x => {
          replacedRows.push(`
            <span class="repl-chip">
              <span class="line-through text-slate-400">${Util.escapeHtml(x.from)}</span>
              <span class="text-slate-400 mx-1">→</span>
              <span class="font-mono font-semibold">${Util.escapeHtml(target)}</span>
              ${x.count > 1 ? `<span class="text-[10px] text-slate-400 ml-1">×${x.count}</span>` : ''}
            </span>
          `);
        });
      });
      const total = totalReplacements();
      const summaryHtml = total ? `
        <div class="replaced-summary">
          <div class="flex items-center justify-between mb-2">
            <div class="text-xs text-slate-600">
              <span class="badge badge-success">${total}</span> 本会话已采纳
            </div>
            <button id="undoAllBtn" class="btn btn-ghost text-xs">撤销全部</button>
          </div>
          <div class="replaced-chips">${replacedRows.join('')}</div>
        </div>
      ` : '';

      root.innerHTML = `
        <div class="modal-mask" id="suggestModal">
          <div class="modal-panel">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-slate-800">板上相近色推荐</h3>
              <button id="suggestClose" class="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
            </div>
            <p class="text-xs text-slate-500 mb-3">以下 ${suggestions.length} 个色号不在你录入的板上，按感知色差推荐板上最相近色。</p>
            ${summaryHtml}
            <div class="suggest-table-wrap overflow-auto max-h-80">
              <table class="suggest-table">
                <thead><tr><th>原色</th><th>推荐</th><th>位置</th><th>色差</th><th></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <button id="suggestAdoptAll" class="btn btn-secondary text-sm">全部采纳</button>
              <button id="suggestCloseBtn" class="btn btn-primary text-sm">关闭</button>
            </div>
          </div>
        </div>
      `;

      function close() { root.innerHTML = ''; }
      // 转义 CSS 选择器里的特殊字符（色号里通常没有，但稳妥起见）
      function cssEscape(s) {
        return String(s).replace(/["\\]/g, '\\$&');
      }

      root.querySelector('#suggestClose').addEventListener('click', close);
      root.querySelector('#suggestCloseBtn').addEventListener('click', close);
      root.querySelector('#suggestAdoptAll').addEventListener('click', () => {
        suggestions.forEach(s => {
          if (!s.top1) return;
          const sel = root.querySelector(`.sug-select[data-from="${cssEscape(s.unmappedCode)}"]`);
          const target = sel ? sel.value : s.top1.code;
          applyReplacement(s.unmappedCode, target);
        });
        close();
      });
      // 撤销全部：恢复到第一次替换前的文本
      const undoAllBtn = root.querySelector('#undoAllBtn');
      if (undoAllBtn) {
        undoAllBtn.addEventListener('click', () => {
          undoAllReplacements();
          close();
        });
      }
      root.querySelectorAll('.sug-adopt').forEach(btn => {
        btn.addEventListener('click', () => {
          const from = btn.getAttribute('data-from');
          const sel = root.querySelector(`.sug-select[data-from="${cssEscape(from)}"]`);
          const to = sel ? sel.value : null;
          if (!to) return;
          applyReplacement(from, to);
          close();
          parseAndRender();
        });
      });
      // 下拉切换：实时更新预览色块 + 色差标签
      root.querySelectorAll('.sug-select').forEach(sel => {
        sel.addEventListener('change', () => {
          const from = sel.getAttribute('data-from');
          const opt = sel.selectedOptions[0];
          const bg = opt ? opt.getAttribute('data-bg') : '';
          const dist = opt ? Number(opt.getAttribute('data-dist')) : null;
          const swatch = root.querySelector(`.sug-preview-swatch[data-row="${cssEscape(from)}"]`);
          if (swatch && bg) swatch.style.background = bg;
          const numEl = root.querySelector(`.sug-dist-num[data-row="${cssEscape(from)}"]`);
          const badgeEl = root.querySelector(`.sug-dist-badge[data-row="${cssEscape(from)}"]`);
          if (numEl && dist != null && !Number.isNaN(dist)) {
            numEl.textContent = dist.toFixed(2);
            const desc = window.ColorMatch.describeDistance(dist);
            numEl.nextElementSibling; // no-op
            if (badgeEl) {
              badgeEl.textContent = desc.text;
              badgeEl.style.background = desc.color + '15';
              badgeEl.style.color = desc.color;
            }
          }
        });
      });
      root.querySelectorAll('.sug-skip').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = btn.closest('tr');
          if (row) row.style.display = 'none';
        });
      });
      const mask = root.querySelector('.modal-mask');
      mask.addEventListener('click', e => {
        if (e.target === mask) close();
      });
    }

    function renderSuggestionBannerAndTable(unmapped, suggestions) {
      // 把建议信息塞回预览区
      const result = document.getElementById('parseResult');
      // 1) 顶部 banner
      let banner = result.querySelector('.suggest-banner');
      const replacedN = totalReplacements();
      if (!unmapped.length && !replacedN) {
        if (banner) banner.remove();
        return;
      }
      if (!banner) {
        const b = document.createElement('div');
        b.className = 'suggest-banner';
        b.innerHTML = `
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="text-sm flex items-center gap-2 flex-wrap">
              ${unmapped.length ? `<span>⚠ <span class="badge badge-warn">${unmapped.length}</span> 个色号不在你的板中</span>` : ''}
              ${replacedN ? `<span class="text-emerald-700">✓ 已采纳 <span class="badge badge-success">${replacedN}</span> 个替代</span>` : ''}
            </div>
            <div class="flex gap-2">
              ${unmapped.length ? `<button id="openSuggestBtn" class="btn btn-secondary text-xs">一键找相近色</button>` : ''}
            </div>
          </div>
        `;
        const card = result.querySelector('.parse-card');
        if (card) card.insertBefore(b, card.firstChild);
        const openBtn = b.querySelector('#openSuggestBtn');
        if (openBtn) openBtn.addEventListener('click', () => {
          lastModalShown = Date.now();
          openSuggestionModal(lastSuggestions);
        });
      } else {
        const warnBadge = banner.querySelector('.badge-warn');
        if (warnBadge) warnBadge.textContent = unmapped.length;
        const openBtn = banner.querySelector('#openSuggestBtn');
        if (openBtn) openBtn.style.display = unmapped.length ? '' : 'none';
        // 已采纳数量是动态的，重渲染
        banner.innerHTML = `
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="text-sm flex items-center gap-2 flex-wrap">
              ${unmapped.length ? `<span>⚠ <span class="badge badge-warn">${unmapped.length}</span> 个色号不在你的板中</span>` : ''}
              ${replacedN ? `<span class="text-emerald-700">✓ 已采纳 <span class="badge badge-success">${replacedN}</span> 个替代</span>` : ''}
            </div>
            <div class="flex gap-2">
              ${unmapped.length ? `<button id="openSuggestBtn" class="btn btn-secondary text-xs">一键找相近色</button>` : ''}
            </div>
          </div>
        `;
        const openBtn2 = banner.querySelector('#openSuggestBtn');
        if (openBtn2) openBtn2.addEventListener('click', () => {
          lastModalShown = Date.now();
          openSuggestionModal(lastSuggestions);
        });
      }
    }

    function renderPreviewExtra(suggestions, threshold) {
      // 在预览列表里，对未映射的色号加行内提示
      // 对已被采纳替代的色号（出现在 sessionReplacements 的 target 列表里）显示原色号
      const rows = document.querySelectorAll('#parseResult .preview-row');
      rows.forEach(r => r.classList.remove('unmapped'));
      rows.forEach(r => {
        const code = r.getAttribute('data-code');
        if (!code) return;
        const sug = suggestions.find(s => s.unmappedCode === code);
        const incoming = findIncomingReplacements(code);
        if (!sug && !incoming.length) return;

        if (sug) r.classList.add('unmapped');

        const sugCode = sug ? (sug.top1 ? sug.top1.code : '—') : null;
        const dist = (sug && sug.top1) ? sug.top1.distance : null;
        const desc = dist != null ? window.ColorMatch.describeDistance(dist) : null;
        const warn = dist != null && dist >= threshold;
        const tip = sug
          ? (sug.top1 ? `建议 ${sugCode}（${desc.text}${dist != null ? ` ${dist.toFixed(2)}` : ''}）` : '板上无相近推荐')
          : '';

        const incomingText = incoming.length
          ? `来自 ${incoming.map(x => x.from + (x.count > 1 ? `×${x.count}` : '')).join('、')}`
          : '';

        let extra = r.querySelector('.preview-extra');
        if (!extra) {
          extra = document.createElement('div');
          extra.className = 'preview-extra text-xs';
          r.appendChild(extra);
        }
        extra.innerHTML = `
          ${tip ? `<span class="${warn ? 'preview-warn' : 'preview-tip'}">${warn ? '⚠ ' : ''}${Util.escapeHtml(tip)}</span>` : ''}
          ${incomingText ? `<span class="preview-original">${Util.escapeHtml(incomingText)}</span>` : ''}
          ${sug && sug.top1 ? `<button class="btn btn-ghost text-[11px] ml-1 preview-adopt" data-from="${Util.escapeHtml(code)}" data-to="${Util.escapeHtml(sugCode)}">采纳</button>` : ''}
        `;
      });
      document.querySelectorAll('.preview-adopt').forEach(btn => {
        btn.addEventListener('click', () => {
          applyReplacement(btn.getAttribute('data-from'), btn.getAttribute('data-to'));
        });
      });
    }

    function parseAndRender() {
      const text = document.getElementById('pText').value;
      const { colors, invalid } = Parser.parse(text);
      lastColors = colors;
      const result = document.getElementById('parseResult');
      const saveBtn = document.getElementById('saveBtn');
      const autoOn = document.getElementById('autoSuggestSwitch').checked;
      const thr = Number(document.getElementById('thresholdRange').value);

      if (colors.length === 0) {
        result.innerHTML = `<div class="parse-card text-xs text-slate-400">识别到 0 个色号</div>`;
        saveBtn.disabled = true;
        return;
      }
      const total = colors.reduce((s, c) => s + c.count, 0);
      const unmapped = unmappedSet(colors);
      const lowCodes = lowStockInPattern(colors);
      lastUnmapped = unmapped;
      lastSuggestions = autoOn && unmapped.length ? buildSuggestions(unmapped) : [];

      // 告急色号 banner（在预览卡片顶部），包含：一键替换、忽略选项
      // 给未映射的告急色号（既需要替代又告急的）自动推荐相近色
      // 给"已映射但告急"的色号可选"用相近色号替代"
      const lowSugs = lowCodes.map(code => {
        const sug = lastSuggestions.find(s => s.unmappedCode === code);
        const onBoard = boardCodes.has(code);
        return { code, onBoard, sug };
      });
      const lowHtml = lowCodes.length ? `
        <div class="low-stock-banner">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1">
              <div class="font-medium text-rose-800 mb-1">⚠ 检测到 ${lowCodes.length} 个告急色号</div>
              <div class="flex flex-wrap gap-2">
                ${lowSugs.map(ls => {
                  const target = ls.sug && ls.sug.top1 ? ls.sug.top1.code : null;
                  const distText = ls.sug && ls.sug.top1 ? `色差 ${ls.sug.top1.distance.toFixed(2)}` : '';
                  return `
                    <span class="low-stock-chip" data-code="${Util.escapeHtml(ls.code)}">
                      <span class="line-through text-rose-700">${Util.escapeHtml(ls.code)}</span>
                      ${target ? `<span class="text-slate-400 mx-1">→</span>
                        <span class="font-mono font-semibold text-emerald-700">${Util.escapeHtml(target)}</span>
                        <span class="text-[10px] text-slate-400 ml-1">${distText}</span>
                        <button class="btn btn-secondary text-[11px] ml-2 low-replace" data-from="${Util.escapeHtml(ls.code)}" data-to="${Util.escapeHtml(target)}">用此替代</button>` : '<span class="text-[10px] text-slate-500 ml-1">（板上无相近）</span>'}
                    </span>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      ` : '';

      result.innerHTML = `
        <div class="parse-card rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          ${lowHtml}
          <div class="flex justify-between items-center mb-2">
            <span class="font-medium text-slate-700">预览（${colors.length} 种色号，${total} 颗）</span>
            <div class="flex items-center gap-2">
              ${autoOn && unmapped.length ? `<span class="text-xs text-amber-600">${unmapped.length} 个未映射</span>` : ''}
              ${lowCodes.length ? `<span class="text-xs text-rose-600">${lowCodes.length} 个告急</span>` : ''}
              ${invalid.length ? `<span class="text-xs text-rose-600">${invalid.length} 行无效</span>` : ''}
            </div>
          </div>
          <div class="max-h-56 overflow-auto divide-y divide-slate-200">
            ${colors.map(c => {
              const isUn = unmapped.includes(c.code);
              const isLow = lowCodes.includes(c.code);
              return `<div data-code="${Util.escapeHtml(c.code)}" class="preview-row flex items-center justify-between py-1 text-xs ${isUn ? 'unmapped' : ''} ${isLow ? 'low' : ''}">
                <span class="font-mono text-slate-700 flex items-center gap-2">
                  <span class="color-swatch" style="background:${(window.MARD221 && window.MARD221[c.code]) || '#f1f5f9'};width:10px;height:10px;border-radius:2px;border:1px solid rgba(0,0,0,0.08);"></span>
                  ${Util.escapeHtml(c.code)}
                  ${isLow ? '<span class="text-rose-600" title="库存告急">⚠</span>' : ''}
                </span>
                <span class="preview-actions flex items-center gap-2">
                  <span class="text-slate-500">×${c.count}</span>
                </span>
              </div>`;
            }).join('')}
          </div>
          ${invalid.length ? `
            <details class="mt-2 text-xs text-rose-700">
              <summary class="cursor-pointer">无效行 (${invalid.length})</summary>
              <ul class="list-disc list-inside mt-1">
                ${invalid.map(it => `<li>第 ${it.line} 行：${Util.escapeHtml(it.raw)} — ${Util.escapeHtml(it.reason)}</li>`).join('')}
              </ul>
            </details>
          ` : ''}
        </div>
      `;
      saveBtn.disabled = false;

      // 绑定"用此替代"按钮
      result.querySelectorAll('.low-replace').forEach(btn => {
        btn.addEventListener('click', () => {
          const from = btn.getAttribute('data-from');
          const to = btn.getAttribute('data-to');
          if (from && to) applyReplacement(from, to);
        });
      });

      if (autoOn) {
        renderSuggestionBannerAndTable(unmapped, lastSuggestions);
        renderPreviewExtra(lastSuggestions, thr);
        // 自动弹窗：去抖，连续解析 800ms 内只弹一次
        if (unmapped.length) {
          const now = Date.now();
          if (now - lastModalShown > 800) {
            lastModalShown = now;
            openSuggestionModal(lastSuggestions);
          }
        }
      } else {
        // 关掉开关时清理 banner
        const banner = result.querySelector('.suggest-banner');
        if (banner) banner.remove();
        document.querySelectorAll('.preview-extra').forEach(el => el.remove());
      }
    }

    // 监听 hash 变化（用户在别的视图标记告急后回到这里时刷新缓存）
    async function refreshLowStockCache() {
      lowStockSet = new Set(await DB.getLowStock());
    }
    window.addEventListener('hashchange', refreshLowStockCache);

    document.getElementById('pText').addEventListener('input', Util.debounce(parseAndRender, 150));
    // 键盘弹出时确保可见
    document.getElementById('pText').addEventListener('focus', () => {
      setTimeout(() => {
        document.getElementById('pText').scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 300);
    });
    parseAndRender();

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const name = document.getElementById('pName').value.trim() || '未命名图纸';
      if (!lastColors.length) {
        Toast.show('请先录入色号');
        return;
      }
      // 合并本次 replacements 到原有记录（追加，新条目 inDocument=true）
      const prevReplacements = editingId && editing.replacements ? editing.replacements : [];
      const newOnes = [];
      sessionReplacements.forEach((arr, target) => {
        arr.forEach(x => {
          newOnes.push({ from: x.from, to: target, count: x.count, at: x.at, inDocument: true });
        });
      });
      const mergedReplacements = prevReplacements.concat(newOnes);

      if (editingId) {
        await DB.updatePattern({
          patternId: editingId,
          name,
          colors: lastColors,
          checkedSet: editing.checkedSet || [],
          templateId: editing.templateId || null,
          replacements: mergedReplacements
        });
        Toast.show('已保存');
        location.hash = `#/patterns/${editingId}`;
      } else {
        const p = await DB.createPattern({
          name,
          colors: lastColors,
          checkedSet: [],
          replacements: mergedReplacements
        });
        Toast.show('已创建');
        location.hash = `#/patterns/${p.patternId}`;
      }
    });
  }

  window.PatternEditView = { renderNew, renderEdit };
})();
