// Checks the built site in dist/.
//   node check.mjs            every local link, image, font and #anchor must resolve; pages must follow the
//                             Content Security Policy (no inline scripts or styles)
//   node check.mjs --launch   also fails if placeholder content is still on the site
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const launch = process.argv.includes('--launch');
if (!fs.existsSync(DIST)) { console.log('dist/ not found. Run `npm run build` first.'); process.exit(1); }

const files = [];
(function walk(d) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    fs.statSync(p).isDirectory() ? walk(p) : files.push(p);
  }
})(DIST);

const htmlFiles = files.filter((f) => f.endsWith('.html'));
const idCache = new Map();
const ids = (f) => {
  if (!idCache.has(f)) idCache.set(f, new Set([...fs.readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idCache.get(f);
};

let bad = 0, checked = 0;
const fail = (msg) => { console.log(msg); bad++; };

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIST, file);
  for (const m of html.matchAll(/(?:href|src)="([^"]*)"/g)) {
    const url = m[1];
    if (!url || /^(https?:|mailto:|data:|tel:)/.test(url)) continue;
    if (rel === '404.html' && url.startsWith('/')) continue;
    checked++;
    const [target, hash] = url.split('#');
    let dest = target ? path.resolve(path.dirname(file), target) : file;
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory() && fs.existsSync(path.join(dest, 'index.html'))) {
      dest = path.join(dest, 'index.html');
    }
    if (!fs.existsSync(dest)) { fail(`MISSING     ${rel}: ${url}`); continue; }
    if (hash && dest.endsWith('.html') && !ids(dest).has(hash)) fail(`NO ANCHOR   ${rel}: ${url}`);
  }
  if (!/<title>[^<]+<\/title>/.test(html)) fail(`NO TITLE    ${rel}`);
  if (!/<meta name="description" content="[^"]+"/.test(html)) fail(`NO DESCRIPTION ${rel}`);
  if (/<script(?![^>]*\ssrc=)[^>]*>/.test(html)) fail(`INLINE SCRIPT ${rel} (blocked by the Content Security Policy)`);
  if (/<style[\s>]/.test(html) || /\sstyle="/.test(html)) fail(`INLINE STYLE  ${rel} (blocked by the Content Security Policy)`);
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) fail(`H1 COUNT ${h1}  ${rel} (each page should have exactly one h1)`);
}

// fonts and other files referenced from the stylesheet
const css = path.join(DIST, 'style.css');
if (fs.existsSync(css)) {
  for (const m of fs.readFileSync(css, 'utf8').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (/^(data:|https?:)/.test(m[1])) { if (/^https?:/.test(m[1])) fail(`EXTERNAL    style.css: ${m[1]}`); continue; }
    checked++;
    if (!fs.existsSync(path.resolve(DIST, m[1]))) fail(`MISSING     style.css: ${m[1]}`);
  }
}

console.log(`${htmlFiles.length} pages, ${checked} local references checked, ${bad} problem${bad === 1 ? '' : 's'}`);

if (launch) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
  const site = (process.env.SITE_URL || cfg.siteUrl || '').trim();
  const todo = [];
  if (/^your name$/i.test(cfg.name.trim())) todo.push('Set "name" in site.config.json (it still says "Your Name").');
  if (/example\.(com|org)$/i.test(cfg.email)) todo.push('Set "email" in site.config.json.');
  if (cfg.links.some((l) => /your-name/i.test(l.url + l.text))) todo.push('Set your real LinkedIn and GitHub links in "links".');
  if (cfg.showSampleNotes) todo.push('Set "showSampleNotes" to false once the sample entries are gone.');
  if (/beta build/i.test(cfg.footerNote || '')) todo.push('Change or clear "footerNote" (it still says "Beta build").');
  if (!site) todo.push('Set "siteUrl" (your public address) so the sitemap, canonical links and share image work.');
  const samples = [];
  for (const dir of ['case-studies', 'ctfs', 'write-ups']) {
    const d = path.join(ROOT, 'content', dir);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.md'))) {
      const head = (fs.readFileSync(path.join(d, f), 'utf8').match(/^---\n([\s\S]*?)\n---/) || [, ''])[1];
      if (/^sample:\s*true\s*$/m.test(head) && !/^draft:\s*true\s*$/m.test(head)) samples.push(`content/${dir}/${f}`);
    }
  }
  if (samples.length) todo.push(`Replace or delete ${samples.length} sample entr${samples.length === 1 ? 'y' : 'ies'}:\n      ${samples.join('\n      ')}`);
  const about = fs.existsSync(path.join(ROOT, 'content', 'about.md')) ? fs.readFileSync(path.join(ROOT, 'content', 'about.md'), 'utf8') : '';
  if (/^sample:\s*true/m.test(about) || /Replace this text/.test(about)) todo.push('Rewrite content/about.md (it still has the placeholder text).');
  if (/\bBTL1\b|GCFE|Security\+/.test(JSON.stringify(cfg.certifications))) todo.push('Check "certifications": only list ones you actually hold or are working on.');
  if (todo.length) {
    console.log(`\nLaunch check: ${todo.length} thing${todo.length === 1 ? '' : 's'} still to do before publishing`);
    todo.forEach((t) => console.log('  - ' + t));
    bad += todo.length;
  } else {
    console.log('\nLaunch check: no placeholders found.');
  }
}
process.exit(bad ? 1 : 0);
