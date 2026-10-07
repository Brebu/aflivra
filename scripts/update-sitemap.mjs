import {execFileSync} from 'node:child_process';
import {readdirSync, readFileSync, writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';

// Regenerates public/sitemap.xml from the real route tree. Routes are every
// app/*/page.tsx (plus app/page.tsx → /); app/api/* are data endpoints, never
// pages. lastmod is route-derived: the git author date of the last commit
// that touched the route's page file — the day that route's source last
// changed, never an invented date. New, uncommitted routes fall back to
// today. Run after adding or changing a route: `node scripts/update-sitemap.mjs`.
const SITE_URL = 'https://aflivra.brebu.workers.dev';
const ROOT = new URL('..', import.meta.url).pathname;
const APP_DIR = join(ROOT, 'app'), OUT = join(ROOT, 'public', 'sitemap.xml');

function routeFiles() {
  const routes = [{route: '/', file: join(APP_DIR, 'page.tsx')}];
  for (const entry of readdirSync(APP_DIR, {withFileTypes: true})) {
    if (!entry.isDirectory() || entry.name === 'api') continue;
    const file = join(APP_DIR, entry.name, 'page.tsx');
    if (existsSync(file)) routes.push({route: '/' + entry.name, file});
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

function lastmodFor(file) {
  try {
    const date = execFileSync('git', ['log', '-1', '--format=%as', '--', file], {cwd: ROOT, encoding: 'utf8'}).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  } catch { /* no git history for this file yet */ }
  return new Date().toISOString().slice(0, 10);
}

const before = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
const entries = routeFiles().map(({route, file}) => ({route, lastmod: lastmodFor(file)}));
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(({route, lastmod}) => `  <url>
    <loc>${SITE_URL}${route}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`).join('\n')}
</urlset>
`.replace(/\n$/, '') + '\n';

writeFileSync(OUT, xml);
const changed = before !== xml;
console.log(`sitemap.xml: ${entries.length} rute (${entries.map(entry => entry.route + ' · ' + entry.lastmod).join(', ')}) — ${changed ? 'rescris' : 'neschimbat'}.`);
if (changed) console.log('Rulează commit pentru public/sitemap.xml împreună cu ruta nouă.');
