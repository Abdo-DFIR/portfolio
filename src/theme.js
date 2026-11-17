/* Runs in <head> before the page paints, so the saved theme never flashes. Loaded as a file (not inline) so the Content Security Policy can stay strict. */
(function () {
  var d = document.documentElement, p = null;
  d.className = d.className.replace(/\bno-js\b/, 'js');
  try { p = localStorage.getItem('theme'); } catch (e) {}
  if (!p) {
    try { var m = /(?:^|;)dfir-theme=(light|dark)/.exec(window.name); if (m) p = m[1]; } catch (e) {}
  }
  var T = window.__theme = { pref: p === 'light' || p === 'dark' ? p : null };
  if (T.pref) d.setAttribute('data-theme', T.pref);
  // Keep the visitor's choice even if a host page sets its own theme. Observe continuously so a
  // choice made on a first visit (when nothing was saved yet) is preserved too.
  try {
    new MutationObserver(function () {
      if (T.pref && d.getAttribute('data-theme') !== T.pref) d.setAttribute('data-theme', T.pref);
    }).observe(d, { attributes: true, attributeFilter: ['data-theme'] });
  } catch (e) {}
})();
