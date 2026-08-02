// Shared chrome behavior reused across every page: theme toggle, status-bar
// clock, back-to-top, toast, command palette, keyboard-shortcuts help
// overlay, and the konami-code matrix theme easter egg.
//
// Pages provide their own command list via `window.SITE_COMMANDS` (read
// lazily, so it can be set before or after this script runs) and can call
// into shared behavior via the `Site` global this script exposes.
(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- theme toggle ----
  var toggleBtn = document.getElementById('theme-toggle');
  var icon = document.getElementById('theme-icon');
  function syncToggle(){
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    toggleBtn.setAttribute('aria-pressed', String(isLight));
    icon.textContent = isLight ? '☀️' : '🌙';
    var tcm = document.getElementById('theme-color-meta');
    if (tcm) tcm.setAttribute('content', isLight ? '#f3f4f6' : '#0a0e12');
  }
  if (toggleBtn && icon) {
    syncToggle();
    toggleBtn.addEventListener('click', function(){
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      if (!reduce) {
        icon.style.transform = 'rotate(90deg) scale(.4)';
        icon.style.opacity = '0';
        setTimeout(function(){
          document.documentElement.setAttribute('data-theme', next);
          syncToggle();
          icon.style.transform = 'rotate(0deg) scale(1)';
          icon.style.opacity = '1';
        }, 160);
      } else {
        document.documentElement.setAttribute('data-theme', next);
        syncToggle();
      }
      try{ localStorage.setItem('theme', next); }catch(e){}
    });
  }

  // ---- live clock in status bar ----
  var sbClock = document.getElementById('sb-clock');
  function updateClock(){
    if (!sbClock) return;
    sbClock.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  }
  if (sbClock) { updateClock(); setInterval(updateClock, 30000); }

  // ---- scroll progress (if present) + back-to-top button ----
  var progress = document.getElementById('progress');
  var topBtn = document.getElementById('top-btn');
  function onScroll(){
    var h = document.documentElement;
    if (progress) {
      var max = h.scrollHeight - h.clientHeight;
      progress.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    }
    if (topBtn) topBtn.classList.toggle('show', h.scrollTop > 400);
  }
  if (progress || topBtn) {
    document.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
  }

  // ---- toast helper ----
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(msg){
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.hidden = true; }, 2600);
  }

  // ---- command palette ----
  var cmdkOverlay = document.getElementById('cmdk-overlay');
  var cmdkInput = document.getElementById('cmdk-input');
  var cmdkList = document.getElementById('cmdk-list');
  var cmdkLastFocused = null;

  function commands(){ return window.SITE_COMMANDS || []; }

  function cmdkFiltered(){
    var q = cmdkInput.value.trim().toLowerCase();
    var list = commands();
    if (!q) return list;
    return list.filter(function(c){ return c.label.toLowerCase().indexOf(q) !== -1; });
  }

  function cmdkRender(){
    var matches = cmdkFiltered();
    cmdkList.innerHTML = '';
    if (!matches.length){
      var empty = document.createElement('div');
      empty.className = 'cmdk-empty';
      empty.textContent = 'No matching commands';
      cmdkList.appendChild(empty);
      return;
    }
    matches.forEach(function(c, i){
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      if (i === 0) li.classList.add('active');
      var label = document.createElement('span');
      label.textContent = c.label;
      li.appendChild(label);
      if (c.hint){
        var hint = document.createElement('span');
        hint.className = 'cmdk-hint';
        hint.textContent = c.hint;
        li.appendChild(hint);
      }
      li.addEventListener('click', function(){ cmdkRun(c); });
      cmdkList.appendChild(li);
    });
  }

  function cmdkRun(c){
    cmdkClose();
    c.run();
  }

  function cmdkOpen(){
    cmdkLastFocused = document.activeElement;
    cmdkOverlay.hidden = false;
    cmdkInput.value = '';
    cmdkRender();
    cmdkInput.focus();
  }

  function cmdkClose(){
    cmdkOverlay.hidden = true;
    if (cmdkLastFocused && cmdkLastFocused.focus) cmdkLastFocused.focus();
  }

  if (cmdkOverlay && cmdkInput && cmdkList) {
    cmdkInput.addEventListener('input', cmdkRender);

    cmdkInput.addEventListener('keydown', function(e){
      var items = cmdkList.querySelectorAll('li');
      if (e.key === 'Escape'){ e.preventDefault(); cmdkClose(); return; }
      if (!items.length) return;
      var activeIdx = -1;
      items.forEach(function(li, i){ if (li.classList.contains('active')) activeIdx = i; });
      if (e.key === 'ArrowDown'){
        e.preventDefault();
        if (items[activeIdx]) items[activeIdx].classList.remove('active');
        var next = items[Math.min(activeIdx + 1, items.length - 1)];
        next.classList.add('active');
        next.scrollIntoView({block: 'nearest'});
      } else if (e.key === 'ArrowUp'){
        e.preventDefault();
        if (items[activeIdx]) items[activeIdx].classList.remove('active');
        var prev = items[Math.max(activeIdx - 1, 0)];
        prev.classList.add('active');
        prev.scrollIntoView({block: 'nearest'});
      } else if (e.key === 'Enter'){
        e.preventDefault();
        var matches = cmdkFiltered();
        var idx = activeIdx === -1 ? 0 : activeIdx;
        if (matches[idx]) cmdkRun(matches[idx]);
      }
    });

    cmdkOverlay.addEventListener('click', function(e){ if (e.target === cmdkOverlay) cmdkClose(); });

    document.addEventListener('keydown', function(e){
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')){
        e.preventDefault();
        if (cmdkOverlay.hidden) cmdkOpen(); else cmdkClose();
      }
    });

    var sbCmdkBtn = document.getElementById('sb-cmdk-btn');
    if (sbCmdkBtn) sbCmdkBtn.addEventListener('click', cmdkOpen);
  }

  // ---- keyboard-shortcuts help overlay ----
  var helpOverlay = document.getElementById('help-overlay');
  var helpLastFocused = null;

  function helpOpen(){
    if (!helpOverlay) return;
    helpLastFocused = document.activeElement;
    helpOverlay.hidden = false;
  }

  function helpClose(){
    if (!helpOverlay) return;
    helpOverlay.hidden = true;
    if (helpLastFocused && helpLastFocused.focus) helpLastFocused.focus();
  }

  if (helpOverlay) {
    helpOverlay.addEventListener('click', function(e){ if (e.target === helpOverlay) helpClose(); });

    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && !helpOverlay.hidden){ helpClose(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey || e.key !== '?') return;
      var active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      e.preventDefault();
      if (helpOverlay.hidden) helpOpen(); else helpClose();
    });

    var sbHelpBtn = document.getElementById('sb-help-btn');
    if (sbHelpBtn) sbHelpBtn.addEventListener('click', helpOpen);
  }

  // ---- konami code easter egg -> hidden "matrix" theme ----
  var konamiSeq = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  var konamiPos = 0;
  var matrixCanvas = document.getElementById('matrix-rain');
  var matrixCtx = matrixCanvas ? matrixCanvas.getContext('2d') : null;
  var matrixRAF = null;
  var matrixCols = [];
  var matrixFontSize = 16;
  var matrixChars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789';

  function matrixResize(){
    if (!matrixCanvas) return;
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;
    var columns = Math.ceil(matrixCanvas.width / matrixFontSize);
    matrixCols = new Array(columns).fill(0);
  }

  function matrixDraw(){
    if (!matrixCtx) return;
    matrixCtx.fillStyle = 'rgba(0,4,1,0.09)';
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    matrixCtx.fillStyle = '#39ff14';
    matrixCtx.font = matrixFontSize + 'px monospace';
    for (var i = 0; i < matrixCols.length; i++){
      var ch = matrixChars[Math.floor(Math.random() * matrixChars.length)];
      var x = i * matrixFontSize;
      var y = matrixCols[i] * matrixFontSize;
      matrixCtx.fillText(ch, x, y);
      if (y > matrixCanvas.height && Math.random() > 0.975) matrixCols[i] = 0;
      matrixCols[i]++;
    }
    matrixRAF = requestAnimationFrame(matrixDraw);
  }

  function matrixStart(){
    if (!matrixCanvas || !matrixCtx || reduce) return;
    matrixCanvas.hidden = false;
    matrixResize();
    matrixCtx.fillStyle = '#000401';
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    if (matrixRAF) cancelAnimationFrame(matrixRAF);
    matrixDraw();
  }

  function matrixStop(){
    if (matrixRAF) cancelAnimationFrame(matrixRAF);
    matrixRAF = null;
    if (matrixCanvas) matrixCanvas.hidden = true;
  }

  window.addEventListener('resize', function(){
    if (matrixCanvas && !matrixCanvas.hidden) matrixResize();
  });

  function toggleMatrixTheme(){
    var root = document.documentElement;
    var current = root.getAttribute('data-theme');
    if (current === 'matrix'){
      var prev = sessionStorage.getItem('theme-before-matrix') || 'dark';
      root.setAttribute('data-theme', prev);
      try{ localStorage.setItem('theme', prev); }catch(e){}
      matrixStop();
      showToast('matrix mode: disengaged');
    } else {
      try{ sessionStorage.setItem('theme-before-matrix', current || 'dark'); }catch(e){}
      root.setAttribute('data-theme', 'matrix');
      try{ localStorage.setItem('theme', 'matrix'); }catch(e){}
      matrixStart();
      showToast(reduce ? 'sudo access granted — matrix mode engaged (motion reduced)' : 'sudo access granted — wake up, Neo…');
    }
  }
  if (document.documentElement.getAttribute('data-theme') === 'matrix') matrixStart();

  document.addEventListener('keydown', function(e){
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === konamiSeq[konamiPos]){
      konamiPos++;
      if (konamiPos === konamiSeq.length){
        konamiPos = 0;
        toggleMatrixTheme();
      }
    } else {
      konamiPos = (key === konamiSeq[0]) ? 1 : 0;
    }
  });

  // ---- public API for page-specific scripts ----
  window.Site = {
    reduceMotion: reduce,
    toggleTheme: function(){ if (toggleBtn) toggleBtn.click(); },
    openCmdk: cmdkOpen,
    closeCmdk: cmdkClose,
    openHelp: helpOpen,
    closeHelp: helpClose,
    showToast: showToast,
    scrollToId: function(id){
      var el = document.getElementById(id);
      if (el) el.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block: 'start'});
    },
    scrollToTop: function(){
      window.scrollTo({top: 0, behavior: reduce ? 'auto' : 'smooth'});
    }
  };
})();
