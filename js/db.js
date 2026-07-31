// db.js —— IndexedDB 封装（基于 idb v8 UMD 全局）
// 全局暴露 window.DB

(function () {
  const DB_NAME = 'perler-bead-finder';
  const DB_VERSION = 1;

  let _dbPromise = null;

  function getDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = idb.openDB(DB_NAME, DB_VERSION, {
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
    const db = await getDB();
    const list = await db.getAll('boards');
    return list.sort((a, b) => a.boardId - b.boardId);
  }

  async function getBoard(boardId) {
    const db = await getDB();
    return db.get('boards', boardId);
  }

  async function saveBoard(board) {
    const db = await getDB();
    await db.put('boards', board);
  }

  async function saveAllBoards(boards) {
    const db = await getDB();
    const tx = db.transaction('boards', 'readwrite');
    await Promise.all(boards.map(b => tx.store.put(b)));
    await tx.done;
  }

  function makeEmptyBoard(boardId) {
    return {
      boardId,
      name: `板${boardId}`,
      layout: { rows: 4, cols: 6 },
      cells: new Array(24).fill(''),
      colorMap: {}
    };
  }

  async function getAllPatterns() {
    const db = await getDB();
    const list = await db.getAll('patterns');
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async function getPattern(patternId) {
    const db = await getDB();
    return db.get('patterns', Number(patternId));
  }

  async function createPattern(pattern) {
    const db = await getDB();
    const now = Date.now();
    const toAdd = {
      name: pattern.name || '未命名图纸',
      createdAt: now,
      updatedAt: now,
      colors: pattern.colors || [],
      checkedSet: pattern.checkedSet || [],
      templateId: pattern.templateId || null
    };
    const id = await db.add('patterns', toAdd);
    return Object.assign({ patternId: id }, toAdd);
  }

  async function updatePattern(pattern) {
    const db = await getDB();
    const updated = Object.assign({}, pattern, { updatedAt: Date.now() });
    await db.put('patterns', updated);
    return updated;
  }

  async function deletePattern(patternId) {
    const db = await getDB();
    await db.delete('patterns', Number(patternId));
  }

  async function getSetting(key, fallback) {
    const db = await getDB();
    const row = await db.get('settings', key);
    return row ? row.value : (fallback !== undefined ? fallback : null);
  }

  async function setSetting(key, value) {
    const db = await getDB();
    await db.put('settings', { key: key, value: value });
  }

  window.DB = {
    getAllBoards: getAllBoards,
    getBoard: getBoard,
    saveBoard: saveBoard,
    saveAllBoards: saveAllBoards,
    makeEmptyBoard: makeEmptyBoard,
    getAllPatterns: getAllPatterns,
    getPattern: getPattern,
    createPattern: createPattern,
    updatePattern: updatePattern,
    deletePattern: deletePattern,
    getSetting: getSetting,
    setSetting: setSetting
  };
})();
