// state.js —— 全局状态 + 简易事件总线 + 工具
// 全局暴露 window.State / window.Util / window.Toast

(function () {
  const State = {
    boards: [],          // 6 块板的最新缓存
    activePattern: null, // 当前打开的图纸
    listeners: {},       // { event: [cb] }
  };

  function on(evt, cb) {
    (State.listeners[evt] || (State.listeners[evt] = [])).push(cb);
    return () => off(evt, cb);
  }
  function off(evt, cb) {
    const arr = State.listeners[evt];
    if (!arr) return;
    const i = arr.indexOf(cb);
    if (i >= 0) arr.splice(i, 1);
  }
  function emit(evt, payload) {
    const arr = State.listeners[evt] || [];
    arr.forEach(cb => { try { cb(payload); } catch (e) { console.error(e); } });
  }

  // ---------------- 工具 ----------------
  const Util = {
    escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    debounce(fn, ms) {
      let t = null;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    },
    indexToPos(i, cols) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      return { row: r + 1, col: c + 1 };
    },
    posToIndex(row, col, cols) {
      return (row - 1) * cols + (col - 1);
    },
    normalizeCode(s) {
      if (s == null) return '';
      return String(s).trim().toUpperCase();
    },
    formatDate(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  };

  // ---------------- Toast ----------------
  const Toast = {
    show(text, ms = 1800) {
      const wrap = document.getElementById('toastWrap');
      if (!wrap) return;
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = text;
      wrap.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.2s';
        setTimeout(() => el.remove(), 220);
      }, ms);
    }
  };

  // ---------------- 撤销栏 ----------------
  let undoTimer = null;
  function showUndoBar(text, onUndo, duration = 4000) {
    const bar = document.getElementById('undoBar');
    const textEl = document.getElementById('undoBarText');
    const btn = document.getElementById('undoBarBtn');
    if (!bar || !textEl || !btn) return;
    textEl.textContent = text;
    bar.classList.remove('hidden');
    clearTimeout(undoTimer);
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      onUndo();
      hideUndoBar();
    });
    undoTimer = setTimeout(hideUndoBar, duration);
  }
  function hideUndoBar() {
    const bar = document.getElementById('undoBar');
    if (bar) bar.classList.add('hidden');
  }

  // ---------------- 进度计算 ----------------
  function calcProgress(pattern) {
    if (!pattern) return { code: { done: 0, total: 0 }, bead: { done: 0, total: 0 } };
    const total = pattern.colors.length;
    let doneCount = 0;
    let doneBeads = 0;
    let totalBeads = 0;
    const checked = new Set(pattern.checkedSet || []);
    pattern.colors.forEach(c => {
      totalBeads += c.count;
      if (checked.has(c.code)) {
        doneCount += 1;
        doneBeads += c.count;
      }
    });
    return {
      code: { done: doneCount, total: total },
      bead: { done: doneBeads, total: totalBeads }
    };
  }

  // 查找某色号在哪块板的哪个格子
  function locateCode(code, boards) {
    const norm = Util.normalizeCode(code);
    const results = [];
    (boards || []).forEach(b => {
      if (!b || !b.cells) return;
      b.cells.forEach((cell, i) => {
        if (Util.normalizeCode(cell) === norm) {
          results.push({
            boardId: b.boardId,
            boardName: b.name,
            index: i,
            row: Math.floor(i / (b.layout.cols || 6)) + 1,
            col: (i % (b.layout.cols || 6)) + 1
          });
        }
      });
    });
    return results;
  }

  window.State = State;
  window.Util = Util;
  window.Toast = Toast;
  window.calcProgress = calcProgress;
  window.locateCode = locateCode;
  window.on = on;
  window.off = off;
  window.emit = emit;
  window.showUndoBar = showUndoBar;
  window.hideUndoBar = hideUndoBar;
})();
