// router.js —— 简易 hash 路由
// 全局暴露 window.Router

(function () {
  const routes = [];
  function add(pattern, handler) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    }) + '$');
    routes.push({ re, keys, handler });
  }
  function parseHash() {
    const h = (location.hash || '#/').replace(/^#/, '');
    const noQuery = h.split('?')[0];
    return noQuery || '/';
  }
  async function dispatch() {
    const path = parseHash();
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        try {
          await r.handler(params);
        } catch (e) {
          console.error('Route handler error', e);
          Toast.show('页面加载出错：' + (e && e.message ? e.message : '未知错误'));
        }
        updateNav();
        return;
      }
    }
    // 未匹配
    document.getElementById('appMain').innerHTML = `
      <div class="card text-center py-10">
        <p class="text-slate-600 mb-3">页面不存在</p>
        <a href="#/" class="btn btn-primary">回首页</a>
      </div>`;
    updateNav();
  }
  function updateNav() {
    document.querySelectorAll('.nav-link').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (location.hash.startsWith(href) && href !== '#/') {
        a.classList.add('active');
      } else if (href === '#/' && (location.hash === '' || location.hash === '#' || location.hash === '#/')) {
        a.classList.add('active');
      } else {
        a.classList.remove('active');
      }
    });
  }
  function start() {
    window.addEventListener('hashchange', dispatch);
    dispatch();
  }

  window.Router = { add, start, dispatch };
})();
