// ============================================
// 装修资料库 - 沉浸式翻书阅读器
// ============================================

(function () {
  'use strict';

  // --- 从 URL 获取参数 ---
  var params = new URLSearchParams(window.location.search);
  var fileName = params.get('file') || '';
  var fileType = params.get('type') || 'pdf';

  if (!fileName) {
    window.location.href = 'index.html';
    return;
  }

  // --- DOM 缓存 ---
  var $ = function (id) { return document.getElementById(id); };
  var loadingOverlay = $('loadingOverlay');
  var loadingText = $('loadingText');
  var progressFill = $('progressFill');
  var toolbar = $('toolbar');
  var toolbarTitle = $('toolbarTitle');
  var flipbookArea = $('flipbookArea');
  var bookContainer = $('bookContainer');
  var singlePageContainer = $('singlePageContainer');
  var canvasLeft = $('canvasLeft');
  var canvasRight = $('canvasRight');
  var canvasSingle = $('canvasSingle');
  var excelArea = $('excelArea');
  var tableWrapper = $('tableWrapper');
  var excelTable = $('excelTable');
  var sheetTabs = $('sheetTabs');
  var pageIndicator = $('pageIndicator');
  var currentPageEl = $('currentPage');
  var totalPagesEl = $('totalPages');
  var pageSlider = $('pageSlider');
  var zoomLevelEl = $('zoomLevel');

  // --- 状态 ---
  var pdfDoc = null;
  var totalPages = 0;
  var currentPage = 1;
  var scale = 1.0;
  var minScale = 0.5;
  var maxScale = 3.0;
  var isRendering = false;
  var isSinglePage = false;
  var touchStartX = 0;
  var touchStartY = 0;
  var excelWorkbook = null;
  var activeSheet = 0;
  var pageCache = {};

  // --- 检测单页/双页模式 ---
  function detectLayout() {
    isSinglePage = window.innerWidth <= 640 || window.innerHeight > window.innerWidth;
  }

  // --- 初始化 ---
  function init() {
    detectLayout();
    toolbarTitle.textContent = decodeURIComponent(fileName);
    document.title = decodeURIComponent(fileName) + ' - 沉浸阅读';

    if (fileType === 'pdf') {
      initPDF();
    } else if (fileType === 'xls') {
      initExcel();
    }
    bindEvents();
  }

  // ============================================
  // PDF 阅读
  // ============================================

  function initPDF() {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    flipbookArea.style.display = '';
    excelArea.style.display = 'none';
    pageIndicator.classList.remove('hidden');

    setLoadingText('正在加载文档...');
    updateProgress(0);

    var loadingTask = pdfjsLib.getDocument(fileName);
    loadingTask.onProgress = function (data) {
      if (data.total > 0) {
        var pct = Math.round((data.loaded / data.total) * 100);
        updateProgress(pct);
        setLoadingText('正在加载 ' + pct + '%...');
      }
    };

    loadingTask.promise.then(function (pdf) {
      pdfDoc = pdf;
      totalPages = pdf.numPages;
      totalPagesEl.textContent = totalPages;
      pageSlider.max = totalPages;

      setLoadingText('准备就绪');
      updateProgress(100);

      setTimeout(function () {
        loadingOverlay.classList.add('hidden');
      }, 400);

      renderCurrentView();
    }).catch(function (err) {
      setLoadingText('加载失败: ' + err.message);
    });
  }

  function renderCurrentView() {
    if (!pdfDoc || isRendering) return;

    if (isSinglePage) {
      renderSinglePage(currentPage);
    } else {
      // 双页模式: 左页偶数, 右页奇数
      var leftPage, rightPage;
      if (currentPage === 1) {
        leftPage = null;  // 封面只显示右页
        rightPage = 1;
      } else if (currentPage % 2 === 1) {
        leftPage = currentPage;
        rightPage = currentPage + 1 <= totalPages ? currentPage + 1 : null;
      } else {
        leftPage = currentPage - 1;
        rightPage = currentPage;
      }

      renderPage(leftPage, canvasLeft, 'pageLeft');
      renderPage(rightPage, canvasRight, 'pageRight');
    }

    currentPageEl.textContent = currentPage;
    pageSlider.value = currentPage;
  }

  function renderSinglePage(pageNum) {
    renderPageToCanvas(pageNum, canvasSingle, function () {
      // single page rendered
    });
  }

  function renderPage(pageNum, canvasEl, pageClass) {
    if (pageNum === null) {
      // 清空画布
      var ctx = canvasEl.getContext('2d');
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      canvasEl.style.display = 'none';
      return;
    }

    canvasEl.style.display = '';
    renderPageToCanvas(pageNum, canvasEl);
  }

  function renderPageToCanvas(pageNum, canvasEl, callback) {
    var cacheKey = pageNum + '_' + scale;

    if (pageCache[cacheKey]) {
      var cached = pageCache[cacheKey];
      canvasEl.width = cached.width;
      canvasEl.height = cached.height;
      var ctx = canvasEl.getContext('2d');
      ctx.putImageData(cached.imageData, 0, 0);
      if (callback) callback();
      return;
    }

    isRendering = true;

    pdfDoc.getPage(pageNum).then(function (page) {
      var viewport = page.getViewport({ scale: scale });
      canvasEl.width = viewport.width;
      canvasEl.height = viewport.height;

      var ctx = canvasEl.getContext('2d');
      var renderContext = {
        canvasContext: ctx,
        viewport: viewport
      };

      var renderTask = page.render(renderContext);
      renderTask.promise.then(function () {
        // 缓存渲染结果（限制缓存数量）
        var keys = Object.keys(pageCache);
        if (keys.length > 12) {
          delete pageCache[keys[0]];
        }
        pageCache[cacheKey] = {
          width: canvasEl.width,
          height: canvasEl.height,
          imageData: ctx.getImageData(0, 0, canvasEl.width, canvasEl.height)
        };

        isRendering = false;
        if (callback) callback();
      });
    }).catch(function () {
      isRendering = false;
    });
  }

  // --- 翻页 ---
  function goToPage(pageNum, direction) {
    if (!pdfDoc || isRendering) return;
    if (pageNum < 1 || pageNum > totalPages) return;

    var oldPage = currentPage;
    currentPage = pageNum;

    // 翻页动画
    if (direction && !isSinglePage) {
      animatePageTurn(oldPage, currentPage, direction);
    }

    // 清除缓存（翻页后旧缓存不需要）
    pageCache = {};
    renderCurrentView();
  }

  function animatePageTurn(fromPage, toPage, direction) {
    var targetEl;
    if (direction === 'next') {
      if (isSinglePage) {
        targetEl = canvasSingle.parentElement;
      } else {
        targetEl = toPage % 2 === 1 ? document.querySelector('.page-right') : document.querySelector('.page-left');
      }
    } else {
      if (isSinglePage) {
        targetEl = canvasSingle.parentElement;
      } else {
        targetEl = document.querySelector('.page-right');
      }
    }

    if (targetEl) {
      var cls = direction === 'next' ? 'flipping-left' : 'flipping-right';
      targetEl.classList.add(cls);
      setTimeout(function () {
        targetEl.classList.remove(cls);
      }, 350);
    }
  }

  function nextPage() {
    if (isSinglePage) {
      goToPage(currentPage + 1, 'next');
    } else {
      goToPage(currentPage + 2, 'next');
    }
  }

  function prevPage() {
    if (isSinglePage) {
      goToPage(currentPage - 1, 'prev');
    } else {
      goToPage(Math.max(1, currentPage - 2), 'prev');
    }
  }

  // --- 缩放 ---
  function zoomIn() {
    if (scale >= maxScale) return;
    scale = Math.min(maxScale, scale + 0.25);
    scale = Math.round(scale * 100) / 100;
    pageCache = {};
    updateZoomDisplay();
    renderCurrentView();
  }

  function zoomOut() {
    if (scale <= minScale) return;
    scale = Math.max(minScale, scale - 0.25);
    scale = Math.round(scale * 100) / 100;
    pageCache = {};
    updateZoomDisplay();
    renderCurrentView();
  }

  function updateZoomDisplay() {
    zoomLevelEl.textContent = Math.round(scale * 100) + '%';
  }

  // ============================================
  // Excel 阅读
  // ============================================

  function initExcel() {
    flipbookArea.style.display = 'none';
    excelArea.style.display = '';
    pageIndicator.classList.add('hidden');

    setLoadingText('正在加载表格...');
    updateProgress(0);

    var oReq = new XMLHttpRequest();
    oReq.open('GET', fileName, true);
    oReq.responseType = 'arraybuffer';

    oReq.onprogress = function (e) {
      if (e.lengthComputable) {
        updateProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    oReq.onload = function () {
      updateProgress(100);
      setLoadingText('正在解析...');

      setTimeout(function () {
        try {
          var data = new Uint8Array(oReq.response);
          excelWorkbook = XLSX.read(data, { type: 'array' });
          renderSheetTabs();
          renderSheet(0);
          loadingOverlay.classList.add('hidden');
        } catch (err) {
          setLoadingText('解析失败: ' + err.message);
        }
      }, 100);
    };

    oReq.onerror = function () {
      setLoadingText('加载失败，请检查网络');
    };

    oReq.send();
  }

  function renderSheetTabs() {
    if (!excelWorkbook) return;
    sheetTabs.innerHTML = excelWorkbook.SheetNames.map(function (name, i) {
      return '<button class="sheet-tab ' + (i === 0 ? 'active' : '') + '" data-index="' + i + '">' + name + '</button>';
    }).join('');

    sheetTabs.querySelectorAll('.sheet-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        sheetTabs.querySelectorAll('.sheet-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        activeSheet = parseInt(tab.dataset.index);
        renderSheet(activeSheet);
      });
    });
  }

  function renderSheet(index) {
    if (!excelWorkbook) return;
    var sheetName = excelWorkbook.SheetNames[index];
    var sheet = excelWorkbook.Sheets[sheetName];
    var html = XLSX.utils.sheet_to_html(sheet, { editable: false });

    // 去掉 XLSX 默认加的表头样式，用我们自己的
    excelTable.innerHTML = html;
    tableWrapper.scrollTop = 0;
    tableWrapper.scrollLeft = 0;
  }

  // ============================================
  // 事件绑定
  // ============================================

  function bindEvents() {
    // 返回
    $('btnBack').addEventListener('click', function () {
      window.location.href = 'index.html';
    });

    // 缩放
    $('btnZoomIn').addEventListener('click', zoomIn);
    $('btnZoomOut').addEventListener('click', zoomOut);

    // 翻页按钮
    $('btnPrev').addEventListener('click', prevPage);
    $('btnNext').addEventListener('click', nextPage);
    $('btnPagePrev').addEventListener('click', prevPage);
    $('btnPageNext').addEventListener('click', nextPage);

    // 翻页热区
    $('touchLeft').addEventListener('click', prevPage);
    $('touchRight').addEventListener('click', nextPage);
    $('touchSingleLeft').addEventListener('click', prevPage);
    $('touchSingleRight').addEventListener('click', nextPage);

    // 页码滑块
    pageSlider.addEventListener('input', function () {
      var page = parseInt(pageSlider.value);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        if (isSinglePage) {
          currentPage = page;
        } else {
          // 双页模式下对齐到奇数页
          currentPage = page % 2 === 0 ? page - 1 : page;
        }
        pageCache = {};
        renderCurrentView();
      }
    });

    // 触摸手势
    bindTouchGestures();

    // 键盘
    document.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { prevPage(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { nextPage(); }
      if (e.key === '+' || e.key === '=') { zoomIn(); }
      if (e.key === '-') { zoomOut(); }
      if (e.key === 'Escape' || e.key === 'Backspace') {
        window.location.href = 'index.html';
      }
    });

    // 窗口大小变化
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var wasSingle = isSinglePage;
        detectLayout();
        if (wasSingle !== isSinglePage) {
          pageCache = {};
          renderCurrentView();
        }
      }, 250);
    });

    // 点击阅读区中间切换工具栏显示
    flipbookArea.addEventListener('click', function (e) {
      if (e.target === flipbookArea || e.target.classList.contains('book-container')) {
        toolbar.classList.toggle('hidden');
        pageIndicator.classList.toggle('hidden');
      }
    });

    // 下载
    $('btnDownload').addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = fileName;
      a.download = fileName;
      a.click();
    });

    // 缩放手势（双指）
    bindPinchZoom();

    // 禁用双击缩放（iOS）
    document.addEventListener('dblclick', function (e) {
      e.preventDefault();
    }, { passive: false });
  }

  function bindTouchGestures() {
    var area = fileType === 'pdf' ? flipbookArea : tableWrapper;

    area.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
    }, { passive: true });

    area.addEventListener('touchend', function (e) {
      if (e.changedTouches.length === 1) {
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = e.changedTouches[0].clientY - touchStartY;

        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
          if (fileType === 'pdf') {
            dx > 0 ? prevPage() : nextPage();
          }
        }
      }
    });
  }

  function bindPinchZoom() {
    var initialDist = 0;
    var initialScale = 1;

    flipbookArea.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        initialDist = getTouchDistance(e.touches);
        initialScale = scale;
      }
    }, { passive: true });

    flipbookArea.addEventListener('touchmove', function (e) {
      if (e.touches.length === 2 && fileType === 'pdf') {
        var dist = getTouchDistance(e.touches);
        var newScale = initialScale * (dist / initialDist);
        newScale = Math.max(minScale, Math.min(maxScale, newScale));
        newScale = Math.round(newScale * 100) / 100;

        if (Math.abs(newScale - scale) > 0.05) {
          scale = newScale;
          updateZoomDisplay();
        }
      }
    }, { passive: true });

    flipbookArea.addEventListener('touchend', function () {
      if (scale !== initialScale) {
        pageCache = {};
        renderCurrentView();
      }
    });
  }

  function getTouchDistance(touches) {
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // --- 辅助 ---
  function setLoadingText(text) {
    loadingText.textContent = text;
  }

  function updateProgress(pct) {
    progressFill.style.width = pct + '%';
  }

  // --- 启动 ---
  init();

})();
