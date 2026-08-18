// db.js —— IndexedDB 封装（自实现 openDB，无外部依赖）
// 全局暴露 window.DB

(function () {
  const DB_NAME = 'perler-bead-finder';
  const DB_VERSION = 1;

  let _dbPromise = null;
  let _memFallback = null; // file:// 下 IndexedDB 不可用时走内存
  let _useFallback = false;

  async function getDB() {
    if (_useFallback) return null;
    if (_dbPromise) return _dbPromise;
    _dbPromise = (async () => {
      try {
        return await openDB(DB_NAME, DB_VERSION, {
          upgrade(db) {
            if (!db.objectStoreNames.contains('boards')) {
              db.createObjectStore('boards', { keyPath: 'boardId' });
            }
            if (!db.objectStoreNames.contains('patterns')) {
              const s = db.createObjectStore('patterns', { keyPath: 'patternId', autoIncrement: true });
              s.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('settings')) {
              db.createObjectStore('settings', { keyPath: 'key' });
            }
          }
        });
      } catch (e) {
        console.warn('IndexedDB 不可用，切换到内存模式（file:// 协议或权限被拒）。本次会话数据不会持久化。', e);
        _useFallback = true;
        _memFallback = { boards: new Map(), patterns: new Map(), settings: new Map(), nextPatternId: 1 };
        showFallbackHint();
        return null;
      }
    })();
    return _dbPromise;
  }

  function showFallbackHint() {
    setTimeout(() => {
      if (window.Toast) Toast.show('当前为 file:// 模式，数据仅保存在内存中，刷新后丢失', 4000);
    }, 500);
  }

  // 最小 openDB 兼容层（基于原生 IndexedDB）
  function openDB(name, version, opts) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = e => {
        const db = req.result;
        if (opts && opts.upgrade) opts.upgrade(db, e.oldVersion, e.newVersion, e.transaction);
      };
      req.onsuccess = () => {
        const db = req.result;
        // 构造 idb 兼容的句柄
        resolve({
          get: (store, key) => promisifyReq(db.transaction(store, 'readonly').objectStore(store).get(key)),
          getAll: (store) => promisifyReq(db.transaction(store, 'readonly').objectStore(store).getAll()),
          put: (store, val) => promisifyReq(db.transaction(store, 'readwrite').objectStore(store).put(val)),
          add: (store, val) => promisifyReq(db.transaction(store, 'readwrite').objectStore(store).add(val)),
          delete: (store, key) => promisifyReq(db.transaction(store, 'readwrite').objectStore(store).delete(key)),
          transaction: (store, mode) => {
            const tx = db.transaction(store, mode);
            const storeObj = tx.objectStore(store);
            return {
              store: {
                put: val => promisifyReq(storeObj.put(val)),
                add: val => promisifyReq(storeObj.add(val)),
                get: key => promisifyReq(storeObj.get(key)),
                getAll: () => promisifyReq(storeObj.getAll()),
                delete: key => promisifyReq(storeObj.delete(key))
              },
              done: new Promise((res, rej) => {
                tx.oncomplete = () => res();
                tx.onerror = () => rej(tx.error);
                tx.onabort = () => rej(tx.error);
              })
            };
          }
        });
        db.onversionchange = () => { try { db.close(); } catch (e) {} };
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  function promisifyReq(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('boards')) {
          db.createObjectStore('boards', { keyPath: 'boardId' });
        }
        if (!db.objectStoreNames.contains('patterns')) {
          const s = db.createObjectStore('patterns', { keyPath: 'patternId', autoIncrement: true });
          s.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      }
    });
    return _dbPromise;
  }

  async function getAllBoards() {
    await getDB();
    if (_useFallback) return Array.from(_memFallback.boards.values()).sort((a, b) => a.boardId - b.boardId);
    const db = await getDB();
    const list = await db.getAll('boards');
    return list.sort((a, b) => a.boardId - b.boardId);
  }

  async function getBoard(boardId) {
    await getDB();
    if (_useFallback) return _memFallback.boards.get(Number(boardId));
    const db = await getDB();
    return db.get('boards', boardId);
  }

  async function saveBoard(board) {
    await getDB();
    if (_useFallback) { _memFallback.boards.set(board.boardId, board); return; }
    const db = await getDB();
    await db.put('boards', board);
  }

  async function saveAllBoards(boards) {
    await getDB();
    if (_useFallback) { boards.forEach(b => _memFallback.boards.set(b.boardId, b)); return; }
    const db = await getDB();
    const tx = db.transaction('boards', 'readwrite');
    await Promise.all(boards.map(b => tx.store.put(b)));
    await tx.done;
  }

  function makeEmptyBoard(boardId, layout) {
    const lo = layout || { rows: 4, cols: 6 };
    const total = (lo.rows || 4) * (lo.cols || 6);
    return {
      boardId,
      name: `板${boardId}`,
      layout: { rows: lo.rows || 4, cols: lo.cols || 6 },
      cells: new Array(total).fill(''),
      colorMap: {}
    };
  }

  // 新增一块板，返回新建的 board（含自动分配的 boardId）。
  // 已有最大 boardId + 1；若已有同号则顺延，避免冲突。
  async function addBoard(opts) {
    await getDB();
    const existing = await getAllBoards();
    let nextId = existing.reduce((m, b) => Math.max(m, b.boardId || 0), 0) + 1;
    while (existing.find(b => b.boardId === nextId)) nextId += 1;
    const layout = (opts && opts.layout) ? { rows: opts.layout.rows || 4, cols: opts.layout.cols || 6 } : { rows: 4, cols: 6 };
    const board = {
      boardId: nextId,
      name: (opts && opts.name) || `板${nextId}`,
      layout,
      cells: new Array(layout.rows * layout.cols).fill(''),
      colorMap: {}
    };
    await saveBoard(board);
    return board;
  }

  async function deleteBoard(boardId) {
    await getDB();
    if (_useFallback) { _memFallback.boards.delete(Number(boardId)); return; }
    const db = await getDB();
    await db.delete('boards', Number(boardId));
  }

  async function getAllPatterns() {
    await getDB();
    if (_useFallback) return Array.from(_memFallback.patterns.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    const db = await getDB();
    const list = await db.getAll('patterns');
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function getPattern(patternId) {
    await getDB();
    if (_useFallback) return _memFallback.patterns.get(Number(patternId));
    const db = await getDB();
    return db.get('patterns', patternId);
  }

  async function createPattern(pattern) {
    await getDB();
    const now = Date.now();
    const toAdd = {
      name: pattern.name || '未命名图纸',
      createdAt: now,
      updatedAt: now,
      colors: pattern.colors || [],
      checkedSet: pattern.checkedSet || [],
      templateId: pattern.templateId || null,
      replacements: pattern.replacements || []
    };
    if (_useFallback) {
      const id = _memFallback.nextPatternId++;
      const full = Object.assign({ patternId: id }, toAdd);
      _memFallback.patterns.set(id, full);
      return full;
    }
    const db = await getDB();
    const id = await db.add('patterns', toAdd);
    return Object.assign({ patternId: id }, toAdd);
  }

  async function updatePattern(pattern) {
    await getDB();
    const updated = Object.assign({}, pattern, { updatedAt: Date.now() });
    if (_useFallback) { _memFallback.patterns.set(updated.patternId, updated); return updated; }
    const db = await getDB();
    await db.put('patterns', updated);
    return updated;
  }

  async function deletePattern(patternId) {
    await getDB();
    if (_useFallback) { _memFallback.patterns.delete(Number(patternId)); return; }
    const db = await getDB();
    await db.delete('patterns', Number(patternId));
  }

  // 复制图纸：深拷贝 colors/replacements，清空 checkedSet，名称加" 副本"后缀
  async function copyPattern(patternId, opts) {
    const src = await getPattern(patternId);
    if (!src) throw new Error('原图纸不存在');
    const name = (opts && opts.name) || (src.name + ' 副本');
    return createPattern({
      name: name,
      colors: JSON.parse(JSON.stringify(src.colors || [])),
      checkedSet: [],
      templateId: null,
      replacements: JSON.parse(JSON.stringify(src.replacements || []))
    });
  }

  async function getSetting(key, fallback) {
    await getDB();
    if (_useFallback) {
      return _memFallback.settings.has(key) ? _memFallback.settings.get(key) : (fallback !== undefined ? fallback : null);
    }
    const db = await getDB();
    const row = await db.get('settings', key);
    return row ? row.value : (fallback !== undefined ? fallback : null);
  }

  async function setSetting(key, value) {
    await getDB();
    if (_useFallback) { _memFallback.settings.set(key, value); return; }
    const db = await getDB();
    await db.put('settings', { key: key, value: value });
  }

  // 库存告急色号：全局共享，跨图纸聚合
  async function getLowStock() {
    const arr = await getSetting('lowStockCodes', []);
    return Array.isArray(arr) ? arr : [];
  }

  async function setLowStock(arr) {
    const cleaned = Array.from(new Set((arr || []).map(c => String(c).trim().toUpperCase()).filter(Boolean)));
    await setSetting('lowStockCodes', cleaned);
    return cleaned;
  }

  async function toggleLowStock(code) {
    const norm = String(code || '').trim().toUpperCase();
    if (!norm) return [];
    const arr = await getLowStock();
    const i = arr.indexOf(norm);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(norm);
    return setLowStock(arr);
  }

  // ---------- 数据导入/导出 ----------

  // 导出全部数据为 JSON 对象
  async function exportAll() {
    const [boards, patterns, lowStock] = await Promise.all([
      getAllBoards(),
      getAllPatterns(),
      getLowStock()
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      boards: boards,
      patterns: patterns,
      lowStockCodes: lowStock
    };
  }

  // 导入数据
  // mode: 'merge'（合并，同 ID 覆盖） | 'overwrite'（清空后写入）
  async function importData(data, mode) {
    if (!data || typeof data !== 'object') throw new Error('数据格式无效');
    if (!Array.isArray(data.boards) || !Array.isArray(data.patterns)) {
      throw new Error('数据缺少 boards 或 patterns 字段');
    }
    const m = mode === 'overwrite' ? 'overwrite' : 'merge';

    if (m === 'overwrite') {
      // 清空现有数据
      const [oldBoards, oldPatterns] = await Promise.all([getAllBoards(), getAllPatterns()]);
      await Promise.all(oldBoards.map(b => deleteBoard(b.boardId)));
      await Promise.all(oldPatterns.map(p => deletePattern(p.patternId)));
    }

    // 写入 boards（merge 模式下同 ID 覆盖）
    let boardsAdded = 0, boardsUpdated = 0;
    for (const b of data.boards) {
      if (m === 'merge') {
        const existing = await getBoard(b.boardId);
        if (existing) boardsUpdated++;
        else boardsAdded++;
      }
      await saveBoard(b);
    }

    // 写入 patterns（merge 模式下同 patternId 覆盖，否则 add 新条目）
    let patternsAdded = 0, patternsUpdated = 0;
    for (const p of data.patterns) {
      if (m === 'merge' && p.patternId) {
        const existing = await getPattern(p.patternId);
        if (existing) {
          await updatePattern(p);
          patternsUpdated++;
          continue;
        }
      }
      // 新增：去掉 patternId 让 DB 自动分配
      const { patternId, ...rest } = p;
      await createPattern(rest);
      patternsAdded++;
    }

    // 写入告急色号（合并）
    if (Array.isArray(data.lowStockCodes)) {
      if (m === 'overwrite') {
        await setLowStock(data.lowStockCodes);
      } else {
        const cur = new Set(await getLowStock());
        data.lowStockCodes.forEach(c => cur.add(c));
        await setLowStock([...cur]);
      }
    }

    return {
      mode: m,
      boardsAdded, boardsUpdated,
      patternsAdded, patternsUpdated
    };
  }

  window.DB = {
    getAllBoards: getAllBoards,
    getBoard: getBoard,
    saveBoard: saveBoard,
    saveAllBoards: saveAllBoards,
    addBoard: addBoard,
    deleteBoard: deleteBoard,
    makeEmptyBoard: makeEmptyBoard,
    getAllPatterns: getAllPatterns,
    getPattern: getPattern,
    createPattern: createPattern,
    updatePattern: updatePattern,
    deletePattern: deletePattern,
    copyPattern: copyPattern,
    getSetting: getSetting,
    setSetting: setSetting,
    getLowStock,
    setLowStock,
    toggleLowStock,
    exportAll,
    importData
  };
})();
