// ============================================
// 装修资料库 - 书架首页逻辑
// ============================================

(function () {
  'use strict';

  // --- 文件清单 ---
  const files = [
    { name: '01.避坑手册打印版（100页）.pdf', type: 'pdf', desc: '装修避坑手册 · 100页精简版' },
    { name: '02.避坑手册打印版（200页）.pdf', type: 'pdf', desc: '装修避坑手册 · 200页完整版' },
    { name: '装修避坑指南.pdf',                      type: 'pdf', desc: '装修避坑实用指南' },
    { name: '装修主辅材购买指南.pdf',                type: 'pdf', desc: '主材辅材选购全攻略' },
    { name: '装修扫盲白皮书.pdf',                    type: 'pdf', desc: '从零开始学装修' },
    { name: '《装修常用数据手册：空间布局和尺寸》.pdf', type: 'pdf', desc: '空间尺寸数据速查' },
    { name: '装修预算标准模板.xls',                   type: 'xls', desc: '装修预算标准模板' },
    { name: '基础装修半包报价模板.xls',               type: 'xls', desc: '半包装修报价模板' },
    { name: '01.毛坯房验房清单-标准版.xls',           type: 'xls', desc: '毛坯房验房清单' }
  ];

  // --- DOM ---
  const bookshelf = document.getElementById('bookshelf');
  const searchInput = document.getElementById('searchInput');
  const emptiness = document.getElementById('emptyState');
  const fileCount = document.getElementById('fileCount');
  const filterTabs = document.getElementById('filterTabs');
  const installPrompt = document.getElementById('installPrompt');
  const installBtn = document.getElementById('installBtn');
  const dismissBtn = document.getElementById('dismissBtn');

  let activeFilter = 'all';
  let deferredPrompt = null;

  // --- 初始化 ---
  function init() {
    renderFiles();
    updateCount();
    bindEvents();
    registerSW();
    listenInstall();
  }

  // --- 渲染文件列表 ---
  function renderFiles() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = files.filter(function (f) {
      var matchType = activeFilter === 'all' || f.type === activeFilter;
      var matchSearch = !query || f.name.toLowerCase().includes(query) || f.desc.toLowerCase().includes(query);
      return matchType && matchSearch;
    });

    if (filtered.length === 0) {
      bookshelf.style.display = 'none';
      emptiness.style.display = 'flex';
    } else {
      bookshelf.style.display = '';
      emptiness.style.display = 'none';
    }

    bookshelf.innerHTML = filtered.map(function (f) {
      var iconSvg = f.type === 'pdf'
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-1.5v2H13V7h1.5c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>'
        : '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21.17 3.25c.52.52.83 1.24.83 2.01V18c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h3.18L9 5.5h1.5l.65-1.5h1.7l.65 1.5H15l1.76-2.25H14V2h4.25l1.92 1.25zM6.5 12.5H8L9.5 8 11 12.5h1.5L14 8h-1.25l-.75 3.5L10.5 8H8.5L7 11.5 6.25 8H5l1.5 4.5zM16 8h-2v4.5h2c.83 0 1.5-.67 1.5-1.5v-1.5c0-.83-.67-1.5-1.5-1.5zm.5 3c0 .28-.22.5-.5.5h-.75V8.5H16c.28 0 .5.22.5.5v2z"/></svg>';

      return '<div class="file-card" data-file="' + f.name + '" data-type="' + f.type + '">'
        + '<div class="card-icon ' + f.type + '">' + iconSvg + '</div>'
        + '<div class="card-info">'
        +   '<div class="card-name">' + f.name + '</div>'
        +   '<div class="card-meta">' + f.desc + '</div>'
        + '</div>'
        + '<span class="card-badge ' + f.type + '">' + f.type.toUpperCase() + '</span>'
        + '</div>';
    }).join('');

    // 绑定点击
    bookshelf.querySelectorAll('.file-card').forEach(function (card) {
      card.addEventListener('click', function () {
        openViewer(card.dataset.file, card.dataset.type);
      });
    });
  }

  function updateCount() {
    fileCount.textContent = files.length + ' 个文件';
  }

  // --- 打开阅读器 ---
  function openViewer(filename, type) {
    var url = 'viewer.html?file=' + encodeURIComponent(filename) + '&type=' + type;
    window.location.href = url;
  }

  // --- 事件绑定 ---
  function bindEvents() {
    // 搜索
    var debounceTimer;
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(renderFiles, 200);
    });

    // 分类筛选
    filterTabs.addEventListener('click', function (e) {
      var tab = e.target.closest('.filter-tab');
      if (!tab) return;
      filterTabs.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      activeFilter = tab.dataset.type;
      renderFiles();
    });

    // PWA 安装
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(function (r) {
            deferredPrompt = null;
            installPrompt.style.display = 'none';
          });
        }
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        installPrompt.style.display = 'none';
        try { localStorage.setItem('installDismissed', '1'); } catch (e) {}
      });
    }
  }

  // --- 监听 PWA 安装 ---
  function listenInstall() {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      try {
        if (!localStorage.getItem('installDismissed')) {
          installPrompt.style.display = 'flex';
        }
      } catch (ex) {
        installPrompt.style.display = 'flex';
      }
    });

    window.addEventListener('appinstalled', function () {
      installPrompt.style.display = 'none';
    });
  }

  // --- Service Worker ---
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {
        // 静默失败
      });
    }
  }

  // --- 启动 ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
