// Static site build: reads Markdown from content/, settings from site.config.json,
// writes plain HTML to dist/. Run with `npm run build`, or `npm run preview` to serve it.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');
const DIST = path.join(ROOT, 'dist');
let cfg;

// Public address of the site, e.g. https://username.github.io/ (set in site.config.json, or with the SITE_URL environment variable).
// Needed for the sitemap, canonical links and the share image. Empty means those are skipped.
let SITE;
let HAS_OG;
let PHOTO_PATH;
let PHOTO_SRC;
let PHOTO_BASENAME;
function loadSettings() {
  cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  const siteUrl = (process.env.SITE_URL || cfg.siteUrl || '').trim();
  SITE = siteUrl ? siteUrl.replace(/\/*$/, '/') : '';
  HAS_OG = fs.existsSync(path.join(CONTENT, 'assets', 'og-image.png'));
  PHOTO_PATH = cfg.photo ? cfg.photo.replace(/^\/+/, '') : '';
  PHOTO_SRC = PHOTO_PATH ? path.join(SRC, PHOTO_PATH) : '';
  PHOTO_BASENAME = PHOTO_PATH ? path.basename(PHOTO_PATH) : '';
}
// Allow Cloudflare Web Analytics while keeping other third-party sources blocked.
const CSP = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; object-src 'none'; base-uri 'none'; form-action 'none';";
const RESPONSE_CSP = `${CSP} frame-ancestors 'none';`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = (iso) => { const [y, m] = iso.split('-'); return MONTHS[+m - 1] + ' ' + y; };
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-') || 'section';

/* ---------- front matter ---------- */
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  m[1].split('\n').forEach((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return;
    const i = line.indexOf(':');
    if (i < 1) return;
    const key = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    const unq = (s) => s.trim().replace(/^["']|["']$/g, '');
    if (v.startsWith('[') && v.endsWith(']')) data[key] = v.slice(1, -1).split(',').map(unq).filter(Boolean);
    else if (v === 'true') data[key] = true;
    else if (v === 'false') data[key] = false;
    else data[key] = unq(v);
  });
  return { data, body: m[2] };
}

/* ---------- Markdown ---------- */
let ctx = { base: '', heads: [], used: new Set() };
const fixUrl = (h) => {
  if (/^(https?:|mailto:|#|data:)/.test(h)) return h;
  if (h.startsWith('/')) return ctx.base + h.slice(1);
  return h.startsWith('assets/') ? ctx.base + h : h;
};
function imageSizeAttributes(href) {
  if (!href.startsWith('assets/')) return '';
  const file = path.resolve(CONTENT, href);
  if (!file.startsWith(CONTENT + path.sep) || !fs.existsSync(file)) return '';
  const image = fs.readFileSync(file);
  if (image.length < 24 || !image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return '';
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  return width && height ? ` width="${width}" height="${height}"` : '';
}
marked.use({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const html = this.parser.parseInline(tokens);
      if (depth === 2 || depth === 3) {
        let id = slugify(html), n = 2;
        const root = id;
        while (ctx.used.has(id)) id = root + '-' + n++;
        ctx.used.add(id);
        if (depth === 2) ctx.heads.push({ id, text: html.replace(/<[^>]+>/g, '') });
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      }
      return `<h${depth}>${html}</h${depth}>\n`;
    },
    code({ text, lang }) {
      const l = (lang || '').split(/\s+/)[0];
      const shell = /^(bash|sh|shell|zsh|powershell|ps1|cmd|console)$/i.test(l);
      const lines = text.replace(/\n$/, '').split('\n').map((line) => {
        if (shell) {
          const m = line.match(/^(\$|PS>|>) (.*)$/);
          if (m) return `<span class="p">${esc(m[1])} </span>${esc(m[2])}`;
          if (/^\s*(#|\/\/)/.test(line)) return `<span class="c">${esc(line)}</span>`;
        }
        return esc(line);
      });
      return `<div class="code"><div class="cap"><span>${esc(l || 'text')}</span><button type="button" class="copy">Copy</button></div><pre tabindex="0"><code>${lines.join('\n')}</code></pre></div>\n`;
    },
    image({ href, title, text }) {
      const cap = title ? `<figcaption>${esc(title)}</figcaption>` : '';
      return `<figure><img src="${esc(fixUrl(href))}" alt="${esc(text)}" loading="lazy"${imageSizeAttributes(href)}>${cap}</figure>`;
    },
    paragraph({ tokens }) {
      const inner = this.parser.parseInline(tokens);
      return tokens.length === 1 && tokens[0].type === 'image' ? inner + '\n' : `<p>${inner}</p>\n`;
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const ext = /^https?:/.test(href);
      return `<a href="${esc(fixUrl(href))}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`;
    },
  },
});

function renderBlock(b) {
  if (b.type === 'callout') {
    const label = b.arg || 'Note';
    return `<div class="callout"><span class="callout-label">${esc(label)}</span>${marked.parse(b.inner)}</div>`;
  }
  if (b.type === 'timeline') {
    const items = b.inner.split('\n').filter((l) => l.trim()).map((l) => {
      const [t, title, ...rest] = l.split('|').map((s) => s.trim());
      const detail = rest.join(' | ');
      return `<li><span class="when">${esc(t)}</span><b>${marked.parseInline(title || '')}</b>${detail ? `<span>${marked.parseInline(detail)}</span>` : ''}</li>`;
    });
    return `<ol class="timeline">${items.join('')}</ol>`;
  }
  throw new Error(`Unknown block ":::${b.type}". Use callout or timeline.`);
}

function renderMarkdown(md, base) {
  const blocks = [];
  md = md.replace(/^:::(\w+)[ \t]*(.*)\n([\s\S]*?)\n:::[ \t]*$/gm, (_, type, arg, inner) => {
    blocks.push({ type, arg: arg.trim(), inner });
    return `\n\n<!--BLOCK:${blocks.length - 1}-->\n\n`;
  });
  ctx = { base, heads: [], used: new Set() };
  let html = marked.parse(md);
  const heads = ctx.heads;
  html = html.replace(/<!--BLOCK:(\d+)-->/g, (_, i) => renderBlock(blocks[+i]));
  html = html.replace(/<table>/g, '<div class="tablewrap" tabindex="0"><table>').replace(/<\/table>/g, '</table></div>');
  return { html, heads };
}

/* ---------- content ---------- */
function loadCollection(dir, urlDir) {
  const d = path.join(CONTENT, dir);
  if (!fs.existsSync(d)) return [];
  const out = [];
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.md') && !x.startsWith('_'))) {
    const raw = fs.readFileSync(path.join(d, f), 'utf8').replace(/\r\n/g, '\n');
    const { data, body } = parseFrontmatter(raw);
    if (data.draft) continue;
    if (!data.title) throw new Error(`${dir}/${f}: front matter needs a title`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '')) throw new Error(`${dir}/${f}: date must look like 2026-10-12`);
    if (!data.summary) console.warn(`warning: ${dir}/${f} has no summary`);
    const slug = data.slug || f.replace(/\.md$/, '');
    const words = body.split(/\s+/).filter(Boolean).length;
    out.push({
      title: data.title, date: data.date, category: data.category || 'General', summary: data.summary || '',
      tags: data.tags || [], tools: data.tools || [], attack: data.attack || [], sample: !!data.sample,
      source: data.source || '', body, slug, url: `${urlDir}/${slug}/`, readMin: Math.max(1, Math.round(words / 200)),
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/* ---------- shared HTML pieces ---------- */
const NAV = [
  { key: 'home', label: 'Home', href: 'index.html' },
  { key: 'cases', label: 'Case Studies', href: 'case-studies/index.html' },
  { key: 'ctfs', label: 'CTFs', href: 'ctfs/index.html' },
  { key: 'write-ups', label: 'Write-ups', href: 'write-ups/index.html' },
  /* { key: 'skills', label: 'Skills', href: 'skills.html' },
  { key: 'certs', label: 'Certifications', href: 'certifications.html' }, */
  { key: 'about', label: 'About', href: 'about.html' },
  { key: 'contact', label: 'Contact', href: 'contact.html' },
];
const ICON_THEME = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/></svg>';
const ICON_MENU = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function layout({ title, desc, base, active, body, home, file, article, noindex }) {
  const [brandA, brandB] = cfg.brand.split('@');
  const full = home ? `${brandA} | ${cfg.role}` : `${title} | ${cfg.name}`;
  const nav = NAV.map((n) => `<a href="${base}${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${n.label}</a>`).join('');
  const description = desc || cfg.description;
  const abs = SITE && file ? (file === 'index.html' ? SITE : SITE + file) : '';
  const share = abs
    ? `
<link rel="canonical" href="${abs}">
<meta property="og:type" content="${article ? 'article' : 'website'}">
<meta property="og:site_name" content="${esc(cfg.name)}">
<meta property="og:url" content="${abs}">
<meta name="twitter:card" content="${HAS_OG ? 'summary_large_image' : 'summary'}">${HAS_OG ? `
<meta property="og:image" content="${SITE}assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:image" content="${SITE}assets/og-image.png">` : ''}`
    : '';
  return `<!doctype html>
<html lang="${esc(cfg.lang || 'en')}" class="no-js">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description)}">
<meta name="theme-color" content="#0d1117">${noindex ? '\n<meta name="robots" content="noindex">' : ''}${share}
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="preload" href="${base}fonts/inter-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}fonts/jetbrains-mono-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<script src="${base}theme.js"></script>
<link rel="stylesheet" href="${base}style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="bar">
  <div class="wrap bar-in">
    <a class="logo" href="${base}index.html"><img class="logo-icon" src="${base}favicon.svg" alt="">${esc(brandA)}<span>@</span>${esc(brandB || '')}</a>
    <nav id="nav" aria-label="Main">${nav}</nav>
    <div class="tools">
      <button class="icon-btn" id="theme" type="button" aria-label="Switch light or dark theme">${ICON_THEME}</button>
      <button class="icon-btn menu-btn" id="menu" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav">${ICON_MENU}</button>
    </div>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-in">
    <span>© ${new Date().getFullYear()} ${esc(cfg.name)} · ${esc(cfg.role)}</span>
  </div>
</footer>
<script src="${base}site.js" defer></script>
</body>
</html>
`;
}

const sampleBadge = (e) => (cfg.showSampleNotes && e.sample ? '<span class="sample-badge">Sample</span>' : '');
const searchText = (e) => esc([e.title, e.summary, e.category, ...e.tags, ...e.tools, ...e.attack].join(' ').toLowerCase());

function caseCard(e, base, isCtf = false) {
  const ids = e.attack.map((a) => a.split(' ')[0]);
  return `<a class="case${isCtf ? ' ctf-case' : ''}" href="${base}${e.url}" data-tags="${esc(e.tags.join(','))}" data-text="${searchText(e)}">
  <div class="meta"><span>${isCtf ? '<span class="challenge-label">CTF CHALLENGE</span> ' : ''}${esc(e.category)}</span><span>${sampleBadge(e)}${fmtDate(e.date)}</span></div>
  <h3>${esc(e.title)}</h3>
  <p>${esc(e.summary)}</p>
  <div class="tags">${e.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${ids.map((a) => `<span class="tag att">${esc(a)}</span>`).join('')}</div>
</a>`;
}
function entryRow(e, base) {
  return `<a class="row" href="${base}${e.url}" data-tags="${esc(e.tags.join(','))}" data-text="${searchText(e)}">
  <time datetime="${e.date}">${fmtDate(e.date)}</time>
  <span class="t"><strong>${esc(e.title)}</strong><span>${esc(e.summary)}</span></span>
  <span class="cat">${esc(e.category)}</span>
</a>`;
}
function filterUI(entries, label, stacked = false) {
  const counts = new Map();
  entries.forEach((e) => e.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const chips = [['All', entries.length], ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))];
  return `<div class="toolbar${stacked ? ' ctf-toolbar' : ''}">
  <label class="sr-only" for="q">Search ${esc(label)}</label>
  <input class="search" id="q" type="search" placeholder="Search ${esc(label)}" data-search autocomplete="off">
  <div class="filter" data-filter role="group" aria-label="Filter by tag">${chips.map(([t, n]) => `<button type="button" class="chip" data-tag="${esc(t)}" aria-pressed="${t === 'All'}">${esc(t)}<span class="n">${n}</span></button>`).join('')}</div>
  <button class="btn sm share-filter" type="button" data-share-filter hidden>Copy filtered link</button>
</div>
<p class="count" data-count aria-live="polite"></p>`;
}
const pagehead = (title, lede) => `<section class="pagehead"><div class="wrap"><h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}</div></section>`;
const sampleNote = (entries) => (cfg.showSampleNotes && entries.some((e) => e.sample) ? '<p></p>' : '');

function skillsRows(limit) {
  return cfg.skills.slice(0, limit || cfg.skills.length).map((g) => `<div class="skill-row"><dt>${esc(g.group)}</dt><dd>${g.items.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</dd></div>`).join('');
}
function certItem(c) {
  const done = /earned|completed/i.test(c.status);
  const sub = [c.issuer, c.year].filter(Boolean).join(' · ');
  return `<div class="cert"><div><strong>${esc(c.name)}</strong><span class="sub">${esc(sub)}</span></div><span class="pill${done ? '' : ' progress'}">${esc(c.status)}</span></div>`;
}
function contactBlock() {
  const links = cfg.links.map((l) => `<div><span>${esc(l.label.toLowerCase())}</span><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.text)}</a></div>`).join('');
  return `<section class="contact" id="contact"><div class="wrap">
  <div><h2 class="sec-title">Contact</h2><p>Open to SOC & DFIR work. Write to me about a role, a project, or one of the investigations on this site.</p></div>
  <div class="links"><div><span>email</span><a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a></div>${links}</div>
</div></section>`;
}

/* ---------- pages ---------- */
const pages = []; // { file, html, url }
const add = (file, html, url = file) => pages.push({ file, html, url });

let cases = [];
let ctfs = [];
let articles = [];
function homePage() {
  const base = '';
  const featured = cases.slice(0, 3);
  const latest = articles.slice(0, 3);
  const activity = [
    ...cases.map((e) => ({ ...e, activityType: 'CASE STUDY' })),
    ...ctfs.map((e) => ({ ...e, activityType: 'CTF' })),
    ...articles.map((e) => ({ ...e, activityType: 'WRITE-UP' })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const activityDate = (iso) => {
    const [year, month, day] = iso.split('-');
    return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
  };
  const activityRows = activity.map((e) => `<li class="activity-item">
    <a href="${base}${e.url}">
      <span class="activity-meta"><span class="activity-type">${e.activityType}</span><time datetime="${e.date}">${activityDate(e.date)}</time></span>
      <strong>${esc(e.title)}</strong>
      <span class="activity-summary">${esc(e.summary)}</span>
    </a>
  </li>`).join('');
  const body = `<section class="hero"><div class="wrap">
  <div class="hero-text">
    <div class="hero-identity">
      ${cfg.photo ? `<img class="hero-avatar" src="${esc(cfg.photo)}" alt="Portrait of ${esc(cfg.name)}" width="104" height="116">` : ''}
      <h1>${esc(cfg.name)}<br><span class="hero-role">${esc(cfg.role)}</span></h1>
    </div>
    <p class="lede hero-intro" aria-label="${esc(cfg.intro)}"><span data-typewriter aria-hidden="true">${esc(cfg.intro)}</span></p>
    <div class="actions"><a class="btn primary" href="case-studies/index.html">View case studies</a><a class="btn" href="contact.html">Contact me</a></div>
  </div>
  <aside class="activity-terminal" aria-label="Latest site activity">
    <div class="activity-titlebar">
      <span class="terminal-lights" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="activity-label">LATEST</span>
      <span class="activity-filename"><span class="activity-shell-prompt" aria-hidden="true">$</span> cat activity.log</span>
    </div>
    <div class="activity-screen">
      ${activityRows ? `<ol class="activity-list">${activityRows}</ol>` : '<p class="activity-empty">No activity has been published yet.</p>'}
    </div>
  </aside>
</div></section>
${featured.length ? `<section><div class="wrap">
  <div class="head"><h2 class="sec-title">Case studies</h2><a class="more-link" href="case-studies/index.html">All case studies →</a></div>
  <p class="lede">In-depth investigations, evidence analysis, timelines, and findings.</p>
  ${sampleNote(featured)}
  <div class="cases">${featured.map((e) => caseCard(e, base)).join('')}</div>
</div></section>` : ''}
${ctfs.length ? `<section><div class="wrap">
  <div class="head"><h2 class="sec-title">CTFs</h2><a class="more-link" href="ctfs/index.html">All CTFs →</a></div>
  <p class="lede">Hands-on challenges, investigations, and solutions.</p>
  ${sampleNote(ctfs.slice(0, 3))}
  <div class="cases">${ctfs.slice(0, 3).map((e) => caseCard(e, base, true)).join('')}</div>
</div></section>` : ''}
${latest.length ? `<section><div class="wrap">
  <div class="head"><h2 class="sec-title">Write-ups</h2><a class="more-link" href="write-ups/index.html">All write-ups →</a></div>
  <p class="lede">Forensic artifacts, tools, techniques, and methodologies.</p>
  <div class="list">${latest.map((e) => entryRow(e, base)).join('')}</div>
</div></section>` : ''}

${false ? `<section><div class="wrap"><div class="cols">
  <div><div class="head"><h2 class="sec-title">Skills &amp; tools</h2><a class="more-link" href="skills.html">Details →</a></div><dl class="skills">${skillsRows(5)}</dl></div>
  <div><div class="head"><h2 class="sec-title">Certifications</h2><a class="more-link" href="certifications.html">Details →</a></div><div class="certs">${cfg.certifications.map(certItem).join('')}</div></div>
</div></div></section>` : ''} 

${contactBlock()}`;
  add('index.html', layout({ title: 'Home', base, active: 'home', body, home: true, file: 'index.html' }));
}

function indexPage({ dir, active, title, lede, entries, label, render }) {
  const base = '../';
  const isCtf = dir === 'ctfs';
  const listing = entries.length
    ? `${sampleNote(entries)}
  <h2 class="sr-only">All ${esc(label)}</h2>
  ${filterUI(entries, label, isCtf)}
  <div class="${render === 'card' ? 'cases' : 'list'}${isCtf ? ' ctf-cases' : ''}" data-items>${entries.map((e) => (render === 'card' ? caseCard(e, base, isCtf) : entryRow(e, base))).join('')}</div>
  <p class="empty" data-empty hidden>Nothing matches. Clear the search or pick another tag.</p>`
    : `<p class="empty">Nothing published here yet.</p>`;
  const body = `${pagehead(title, lede)}
<section><div class="wrap">
  ${listing}
</div></section>`;
  add(`${dir}/index.html`, layout({ title, desc: lede, base, active, body, file: `${dir}/index.html` }));
}

function articlePage(e, { dir, active, indexLabel, all }) {
  const base = '../../';
  const { html, heads } = renderMarkdown(e.body, base);
  const toc = heads.length >= 2
    ? `<aside class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ol>${heads.map((h, i) => `<li><a href="#${h.id}"${i === 0 ? ' class="on"' : ''}>${h.text}</a></li>`).join('')}</ol></aside>`
    : '';
  const more = all.filter((x) => x !== e).slice(0, 3);
  const kicker = [`<span class="cat">${esc(e.category)}</span>`, `<time datetime="${e.date}">${fmtDate(e.date)}</time>`, `<span>${e.readMin} min read</span>`, e.source ? `<span>${esc(e.source)}</span>` : '', sampleBadge(e)].filter(Boolean).join('');
  const body = `<article>
<section class="arthead"><div class="wrap">
  <a class="crumb" href="${base}${dir}/index.html">← ${esc(indexLabel)}</a>
  <div class="kicker">${kicker}</div>
  <h1>${esc(e.title)}</h1>
  <p class="summary">${esc(e.summary)}</p>
  <div class="tags">${e.tools.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}${e.attack.map((a) => `<span class="tag att">${esc(a)}</span>`).join('')}</div>
</div></section>
<div class="layout${toc ? '' : ' no-toc'}"><div class="wrap">
  ${toc}
  <div class="prose">${html}</div>
</div></div>
</article>
${more.length ? `<section class="more"><div class="wrap">
  <div class="head"><h2 class="sec-title">More ${esc(indexLabel.toLowerCase())}</h2><a class="more-link" href="${base}${dir}/index.html">See all →</a></div>
  <div class="list">${more.map((x) => entryRow(x, base)).join('')}</div>
</div></section>` : ''}`;
  add(`${e.url}index.html`, layout({ title: e.title, desc: e.summary, base, active, body, file: e.url, article: true }), e.url);
}

function simplePages() {
  // Skills
  /*
  add('skills.html', layout({
    title: 'Skills', file: 'skills.html', base: '', active: 'skills', desc: 'Tools and techniques, grouped by area.',
    body: `${pagehead('Skills & tools', 'Tools and techniques I use in investigations, grouped by area.')}
<section><div class="wrap">
  <h2 class="sr-only">Skill groups</h2>
  <div class="groups">${cfg.skills.map((g) => `<div class="group"><h3>${esc(g.group)}</h3><div class="tags">${g.items.map((i) => `<span class="tag">${esc(i)}</span>`).join('')}</div></div>`).join('')}</div>
</div></section>
<section><div class="wrap">
  <div class="head"><h2 class="sec-title">Currently learning</h2></div>
  <ul class="bullets">${cfg.learning.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
</div></section>`,
  }));
  // Certifications
  add('certifications.html', layout({
    title: 'Certifications', file: 'certifications.html', base: '', active: 'certs', desc: 'Certifications and training.',
    body: `${pagehead('Certifications & training', 'Credentials I hold and the training I am doing now.')}
<section><div class="wrap"><div class="cols">
  <div><div class="head"><h2 class="sec-title">Certifications</h2></div><div class="certs">${cfg.certifications.map(certItem).join('')}</div></div>
  <div><div class="head"><h2 class="sec-title">Training and labs</h2></div><div class="certs">${cfg.training.map(certItem).join('')}</div></div>
</div></div></section>`,
  })); */
  
  // About
  const aboutRaw = fs.existsSync(path.join(CONTENT, 'about.md')) ? fs.readFileSync(path.join(CONTENT, 'about.md'), 'utf8').replace(/\r\n/g, '\n') : '';
  const about = parseFrontmatter(aboutRaw);
  const { html } = renderMarkdown(about.body, '');
  add('about.html', layout({
    title: 'About', file: 'about.html', base: '', active: 'about', desc: about.data.summary || 'About me.',
    body: `${pagehead(about.data.title || 'About', about.data.summary)}
<section class="about-editorial"><div class="wrap">
  <article class="about-article">
    <div class="prose">${html}</div>
    <p class="about-contact">Interested in working together? <a href="contact.html">Get in touch.</a></p>
  </article>
  <aside class="about-profile">
    ${cfg.photo ? `<img class="about-portrait" src="${esc(cfg.photo)}" alt="Portrait of ${esc(cfg.name)}" width="180" height="180">` : ''}
    <h2>${esc(cfg.name)}</h2>
    <p class="about-role">${esc(cfg.role)}</p>
    <blockquote class="about-quote">“Digital evidence doesn't tell the whole story until you know where to look.”</blockquote>
    ${cfg.cv ? `<div class="about-resume"><a class="btn primary" href="${esc(cfg.cv)}" download>Download CV (PDF)</a></div>` : ''}
  </aside>
</div></section>`,
  }));
  // Contact
  const rows = cfg.links.map((l) => `<a class="contact-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><span class="contact-link-label">${esc(l.label)}</span><span class="contact-link-text">${esc(l.text)}</span><span class="contact-link-arrow" aria-hidden="true">↗</span></a>`).join('');
  add('contact.html', layout({
    title: 'Contact', file: 'contact.html', base: '', active: 'contact', desc: 'How to reach me.',
    body: `${pagehead('Get in touch', 'For professional inquiries, collaboration, or questions about my investigations, LinkedIn is the best way to reach me.')}
<section class="contact-page"><div class="wrap"><div class="contact-grid">
  <div class="contact-panel">
    <div class="contact-email">
      <span class="contact-label">EMAIL</span>
      <a class="contact-address" href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>
      <div class="actions">
        <a class="btn primary" href="mailto:${esc(cfg.email)}">Send an email</a>
        <button class="btn" type="button" data-copy="${esc(cfg.email)}">Copy address</button>
      </div>
    </div>
    ${rows ? `<div class="contact-profiles"><h3>Professional profiles</h3><div class="contact-links">${rows}</div></div>` : ''}
    ${cfg.cv ? `<a class="btn contact-cv" href="${esc(cfg.cv)}" download>Download CV (PDF)</a>` : ''}
    ${cfg.pgp ? `<div class="contact-pgp"><h3>PGP public key</h3><pre class="pgp">${esc(cfg.pgp)}</pre></div>` : ''}
  </div>
</div></div></section>`,
  }));
  // 404
  const root = cfg.basePath || '/';
  add('404.html', layout({
    title: 'Page not found', desc: 'This page could not be found. Return to the homepage or browse DFIR case studies and write-ups.', base: root, active: '', noindex: true,
    body: `<section class="error-page" aria-labelledby="error-title"><div class="wrap">
  <div class="error-card">
    <div class="error-copy">
      <p class="eyebrow">PAGE NOT FOUND <span aria-hidden="true">/</span> HTTP 404</p>
      <h1 id="error-title">We lost this trail.</h1>
      <p class="lede">That address doesn't lead to a page here. It may be outdated, or the page may have moved.</p>
      <p class="error-prompt">Pick up the investigation somewhere else:</p>
      <div class="actions">
        <a class="btn primary" href="${root}index.html">Return home</a>
        <a class="btn" href="${root}case-studies/index.html">Browse case studies</a>
      </div>
      <a class="error-articles" href="${root}write-ups/index.html">Explore the write-ups <span aria-hidden="true">→</span></a>
    </div>
    <div class="error-signal" aria-hidden="true">
      <div class="error-signal-head"><span><i></i> ROUTE DIAGNOSTICS</span><span>LOOKUP FAILED</span></div>
      <div class="error-number"><span>ERR_</span><strong>404</strong></div>
      <div class="error-trace">
        <svg viewBox="0 0 320 56" preserveAspectRatio="none">
          <path d="M4 38h76l16-18h50" />
          <path d="M178 20h42l18 18h78" />
          <circle cx="4" cy="38" r="3" />
          <circle cx="316" cy="38" r="3" />
          <path class="error-trace-break" d="m151 13 8 14m5-14 8 14" />
        </svg>
        <span>REQUESTED ROUTE <b>UNRESOLVED</b></span>
      </div>
      <div class="error-log">
        <span><b>01</b> requested page</span><span class="error-log-value">not found</span>
        <span><b>02</b> site index</span><span class="error-log-value">online</span>
      </div>
      <div class="error-signal-foot"><span></span> END OF TRACE <span class="error-trace-time">STATUS 404</span></div>
    </div>
  </div>
</div></section>`,
  }));
}

/* ---------- build ---------- */
function build() {
  loadSettings();
  pages.length = 0;
  cases = loadCollection('case-studies', 'case-studies');
  ctfs = loadCollection('ctfs', 'ctfs');
  articles = loadCollection('write-ups', 'write-ups');
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  homePage();
  indexPage({ dir: 'case-studies', active: 'cases', title: 'Case Studies', lede: 'In-depth investigations, evidence analysis, timelines, and findings.', entries: cases, label: 'case studies', render: 'card' });
  indexPage({ dir: 'write-ups', active: 'write-ups', title: 'Write-ups', lede: 'Forensic artifacts, tools, techniques, and methodologies.', entries: articles, label: 'write-ups', render: 'row' });
  indexPage({ dir: 'ctfs', active: 'ctfs', title: 'CTFs', lede: 'Hands-on challenges, investigations, and solutions.', entries: ctfs, label: 'CTFs', render: 'card' });
  cases.forEach((e) => articlePage(e, { dir: 'case-studies', active: 'cases', indexLabel: 'Case studies', all: cases }));
  ctfs.forEach((e) => articlePage(e, { dir: 'ctfs', active: 'ctfs', indexLabel: 'CTFs', all: ctfs }));
  articles.forEach((e) => articlePage(e, { dir: 'write-ups', active: 'write-ups', indexLabel: 'Write-ups', all: articles }));
  simplePages();
  for (const p of pages) {
    const out = path.join(DIST, p.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, p.html);
  }
  // One stylesheet: the font faces first, then the site styles. Fonts and theme.js are served from this site.
  fs.writeFileSync(path.join(DIST, 'style.css'), fs.readFileSync(path.join(SRC, 'fonts.css'), 'utf8') + '\n' + fs.readFileSync(path.join(SRC, 'style.css'), 'utf8'));
  for (const f of ['site.js', 'theme.js', 'favicon.svg']) fs.copyFileSync(path.join(SRC, f), path.join(DIST, f));
  if (PHOTO_BASENAME) {
    const resolvedPhoto = fs.existsSync(PHOTO_SRC) ? PHOTO_SRC : (fs.existsSync(path.join(SRC, 'me.jpg')) ? path.join(SRC, 'me.jpg') : '');
    if (resolvedPhoto) fs.copyFileSync(resolvedPhoto, path.join(DIST, path.basename(resolvedPhoto)));
  }
  fs.cpSync(path.join(SRC, 'fonts'), path.join(DIST, 'fonts'), { recursive: true });
  // robots.txt always; sitemap.xml only when the public address is known (siteUrl or SITE_URL).
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n${SITE ? `\nSitemap: ${SITE}sitemap.xml\n` : ''}`);
  fs.writeFileSync(path.join(DIST, '_headers'), `/*
  Content-Security-Policy: ${RESPONSE_CSP}
  Strict-Transport-Security: max-age=31536000
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Access-Control-Allow-Origin: https://abdo-mo.pages.dev

/robots.txt
  Cache-Control: no-store
`);
  if (SITE) {
    const dates = new Map([...cases, ...ctfs, ...articles].map((e) => [e.url, e.date]));
    const urls = pages.filter((p) => p.file !== '404.html').map((p) => `  <url><loc>${esc(p.url === 'index.html' ? SITE : SITE + p.url)}</loc>${dates.has(p.url) ? `<lastmod>${dates.get(p.url)}</lastmod>` : ''}</url>`);
    fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  }
  const assets = path.join(CONTENT, 'assets');
  if (fs.existsSync(assets)) fs.cpSync(assets, path.join(DIST, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
  console.log(`Built ${pages.length} pages (${cases.length} case studies, ${ctfs.length} CTFs, ${articles.length} write-ups) into dist/`);
}

build();

if (process.argv.includes('--serve')) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };
  const liveReloadScript = "const events=new EventSource('/__events');events.addEventListener('reload',()=>location.reload());";
  const clients = new Set();
  const notifyReload = () => {
    for (const client of clients) client.write('event: reload\ndata: changed\n\n');
  };
  const portArg = process.argv.find((arg) => arg.startsWith('--port='));
  const portIndex = process.argv.indexOf('--port');
  const requestedPort = portArg ? portArg.slice('--port='.length) : (portIndex >= 0 ? process.argv[portIndex + 1] : '4173');
  const startPort = Number(requestedPort);
  if (!Number.isInteger(startPort) || startPort < 1 || startPort > 65535) {
    console.error(`Invalid preview port: ${requestedPort}`);
    process.exitCode = 1;
  } else {
    const server = http.createServer((req, res) => {
      if (req.url === '/__live-reload.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(liveReloadScript);
        return;
      }
      if (req.url === '/__events') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write('\n');
        clients.add(res);
        res.on('close', () => clients.delete(res));
        return;
      }
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      let file = path.join(DIST, path.normalize(p));
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(path.join(DIST, '404.html')).pipe(res);
        return;
      }
      if (path.extname(file) === '.html') {
        const html = fs.readFileSync(file, 'utf8').replace('</body>', '<script src="/__live-reload.js"></script></body>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    const rebuild = () => {
      try {
        build();
        notifyReload();
      } catch (error) {
        console.error(`Unable to rebuild preview: ${error.message}`);
      }
    };
    const watchTargets = [CONTENT, SRC, path.join(ROOT, 'site.config.json')];
    let rebuildTimer;
    for (const target of watchTargets) {
      const watcher = fs.watch(target, { recursive: fs.statSync(target).isDirectory() }, () => {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(rebuild, 300);
      });
      watcher.on('error', (error) => console.error(`Preview watcher error for ${target}: ${error.message}`));
    }
    let port = startPort;
    const listen = () => {
      const onError = (error) => {
        if (error.code === 'EADDRINUSE' && port < Math.min(startPort + 20, 65535)) {
          port += 1;
          listen();
          return;
        }
        console.error(error.code === 'EADDRINUSE'
          ? `Preview ports ${startPort}-${port} are already in use. Try --port with another starting port.`
          : `Unable to start preview server: ${error.message}`);
        process.exitCode = 1;
      };
      server.once('error', onError);
      server.listen(port, () => {
        server.removeListener('error', onError);
        console.log(`Preview at http://localhost:${port}`);
      });
    };
    listen();
  }
}
