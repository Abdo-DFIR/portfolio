(function () {
  var d = document;
  var root = d.documentElement;
  // Open every page at the top. The browser would otherwise restore the old scroll position
  // on reload or reopen, sometimes after the page has loaded. So restoration is handled here:
  // new visits, links and reloads start at the top, the Back/Forward buttons return to the
  // saved position, and a #section link goes to its section.
  (function () {
    var nav = window.performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var key = 'scrollpos:' + location.pathname;
    var target = 0, touched = false, timer;
    try { history.scrollRestoration = 'manual'; } catch (e) {}
    if (!location.hash && nav && nav.type === 'back_forward') {
      try { target = Number(sessionStorage.getItem(key)) || 0; } catch (e) {}
    }
    function go() {
      if (location.hash || touched) return;
      window.scrollTo({ top: target, left: 0, behavior: 'instant' });
    }
    function save() { try { sessionStorage.setItem(key, String(Math.round(window.scrollY))); } catch (e) {} }
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (ev) {
      window.addEventListener(ev, function () { touched = true; }, { passive: true, once: true });
    });
    go();
    window.addEventListener('load', function () { go(); requestAnimationFrame(go); setTimeout(go, 300); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) go(); });
    window.addEventListener('pagehide', save);
    window.addEventListener('scroll', function () { clearTimeout(timer); timer = setTimeout(save, 150); }, { passive: true });
  })();

  function $(s, c) { return (c || d).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); }

  var typewriter = $('[data-typewriter]');
  if (typewriter && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    var characters = Array.from(typewriter.textContent);
    var characterIndex = 0;
    typewriter.textContent = '';
    typewriter.classList.add('is-typing');
    function typeNextCharacter() {
      if (characterIndex === characters.length) {
        typewriter.classList.remove('is-typing');
        return;
      }
      typewriter.textContent += characters[characterIndex++];
      window.setTimeout(typeNextCharacter, 45);
    }
    typeNextCharacter();
  }

  // Theme toggle. The saved choice is applied by a small inline script in <head>.
  var themeBtn = $('#theme');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var light = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      var cur = root.getAttribute('data-theme') || (light ? 'light' : 'dark');
      var next = cur === 'dark' ? 'light' : 'dark';
      // Remember the visitor's choice. It wins over the device setting and over a host page that sets its own theme.
      if (window.__theme) window.__theme.pref = next;
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      // Fallback when storage is blocked: window.name lasts for this tab across pages.
      try { window.name = (window.name || '').replace(/(^|;)dfir-theme=[a-z]+/g, '') + ';dfir-theme=' + next; } catch (e) {}
    });
  }

  // Mobile menu
  var bar = $('.bar');
  var menuBtn = $('#menu');
  if (bar && menuBtn) {
    menuBtn.addEventListener('click', function () {
      var open = bar.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Tag filter and search on index pages
  var items = $$('[data-items] > [data-tags]');
  if (items.length) {
    var chips = $$('[data-filter] .chip');
    var search = $('[data-search]');
    var empty = $('[data-empty]');
    var count = $('[data-count]');
    function tagFromUrl() {
      var requested = new URLSearchParams(location.search).get('tag');
      return chips.some(function (chip) { return chip.getAttribute('data-tag') === requested; }) ? requested : 'All';
    }
    function updateUrl() {
      var url = new URL(location.href);
      if (tag === 'All') url.searchParams.delete('tag');
      else url.searchParams.set('tag', tag);
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    var tag = tagFromUrl();
    var query = '';
    var apply = function () {
      var shown = 0;
      var q = query.toLowerCase().trim();
      items.forEach(function (el) {
        var tags = (el.getAttribute('data-tags') || '').split(',');
        var okTag = tag === 'All' || tags.indexOf(tag) !== -1;
        var okQuery = !q || (el.getAttribute('data-text') || '').indexOf(q) !== -1;
        var show = okTag && okQuery;
        el.hidden = !show;
        if (show) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      if (count) count.textContent = shown + (shown === 1 ? ' entry' : ' entries');
      chips.forEach(function (c) {
        c.setAttribute('aria-pressed', c.getAttribute('data-tag') === tag ? 'true' : 'false');
      });
    };
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        tag = c.getAttribute('data-tag');
        updateUrl();
        apply();
      });
    });
    window.addEventListener('popstate', function () {
      tag = tagFromUrl();
      apply();
    });
    if (search) {
      search.addEventListener('input', function () { query = search.value; apply(); });
    }
    apply();
  }

  // Copy buttons (code blocks and the email address)
  function copyText(text, btn) {
    var label = btn.textContent;
    function done(ok) {
      btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      setTimeout(function () { btn.textContent = label; }, 1600);
    }
    function fallback() {
      var ta = d.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      d.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = d.execCommand('copy'); } catch (e) {}
      d.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }
  $$('.code .copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var pre = $('pre', b.closest('.code')).cloneNode(true);
      $$('.p', pre).forEach(function (n) { n.remove(); });
      copyText(pre.textContent.replace(/\s+$/, ''), b);
    });
  });
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () { copyText(b.getAttribute('data-copy'), b); });
  });

  // Open article images in a modal viewer.
  var articleImages = $$('.prose figure img');
  if (articleImages.length && typeof HTMLDialogElement !== 'undefined') {
    var imageViewer = d.createElement('dialog');
    imageViewer.className = 'image-viewer';
    imageViewer.setAttribute('aria-label', 'Image viewer');
    var viewerClose = d.createElement('button');
    viewerClose.type = 'button';
    viewerClose.className = 'image-viewer-close';
    viewerClose.textContent = 'Close';
    var viewerImage = d.createElement('img');
    var viewerScrollX = 0;
    var viewerScrollY = 0;
    imageViewer.appendChild(viewerClose);
    imageViewer.appendChild(viewerImage);
    d.body.appendChild(imageViewer);

    function openImage(img) {
      viewerScrollX = window.scrollX;
      viewerScrollY = window.scrollY;
      viewerImage.src = img.currentSrc || img.src;
      viewerImage.alt = img.alt;
      imageViewer.showModal();
      window.requestAnimationFrame(function () {
        window.scrollTo({ left: viewerScrollX, top: viewerScrollY, behavior: 'instant' });
      });
    }

    articleImages.forEach(function (img) {
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', img.alt ? 'View image: ' + img.alt : 'View image enlarged');
      img.addEventListener('click', function () { openImage(img); });
      img.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openImage(img);
        }
      });
    });

    viewerClose.addEventListener('click', function () { imageViewer.close(); });
    imageViewer.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        imageViewer.close();
      }
    });
    imageViewer.addEventListener('click', function (event) {
      if (event.target === imageViewer) imageViewer.close();
    });
    imageViewer.addEventListener('close', function () {
      viewerImage.removeAttribute('src');
      window.scrollTo({ left: viewerScrollX, top: viewerScrollY, behavior: 'instant' });
    });
  }

  // Table of contents: highlight the section being read
  var links = $$('.toc a');
  if (links.length) {
    var heads = links.map(function (a) { return d.getElementById(a.getAttribute('href').slice(1)); });
    var spy = function () {
      var y = window.scrollY + 120;
      var cur = 0;
      heads.forEach(function (h, i) {
        if (h && h.getBoundingClientRect().top + window.scrollY <= y) cur = i;
      });
      links.forEach(function (a, i) { a.classList.toggle('on', i === cur); });
    };
    window.addEventListener('scroll', spy, { passive: true });
    spy();
  }
})();
