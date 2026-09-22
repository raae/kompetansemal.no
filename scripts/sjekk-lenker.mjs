// Lenkesjekker for dist/: finner alle interne lenker (href og src) i de bygde
// HTML-filene og sjekker at målet finnes. Eksterne lenker sjekkes ikke.
// Kjør: npm run build && npm run sjekk-lenker
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;

function* htmlFiler(dir) {
  for (const navn of readdirSync(dir)) {
    const p = join(dir, navn);
    if (statSync(p).isDirectory()) yield* htmlFiler(p);
    else if (navn.endsWith('.html')) yield p;
  }
}

function finnes(sti) {
  const [uten] = sti.split('#');
  const ren = decodeURIComponent(uten.split('?')[0]);
  if (ren === '') return true;
  const fil = join(DIST, ren);
  if (ren.endsWith('/')) return existsSync(join(fil, 'index.html'));
  if (existsSync(fil) && statSync(fil).isFile()) return true;
  return existsSync(join(fil, 'index.html'));
}

let antallLenker = 0;
let antallFiler = 0;
const feil = [];
const ankerFeil = [];
for (const fil of htmlFiler(DIST)) {
  antallFiler++;
  // Fjern <script>-blokker, så maler i søkeskriptet ikke leses som lenker.
  const html = readFileSync(fil, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const url = m[1];
    if (/^(https?:|mailto:|tel:|data:)/.test(url)) continue;
    antallLenker++;
    if (url.startsWith('#')) {
      if (url.length > 1 && !ids.has(url.slice(1))) ankerFeil.push(`${relative(DIST, fil)}: ${url}`);
      continue;
    }
    if (!url.startsWith('/')) {
      feil.push(`${relative(DIST, fil)}: relativ lenke «${url}»`);
      continue;
    }
    if (!finnes(url)) feil.push(`${relative(DIST, fil)}: ${url}`);
    // Lenker til sider skal ha skråstrek til slutt (trailingSlash: 'always'), unntatt filer.
    if (!/\.[a-z0-9]+(\?|#|$)/i.test(url) && !url.split('#')[0].split('?')[0].endsWith('/')) feil.push(`${relative(DIST, fil)}: mangler skråstrek «${url}»`);
  }
}
console.log(`${antallFiler} HTML-filer, ${antallLenker} interne lenker sjekket.`);
if (ankerFeil.length) console.log(`Ankere som ikke finnes (${ankerFeil.length}):\n  ${ankerFeil.slice(0, 20).join('\n  ')}`);
if (feil.length) {
  console.error(`Døde lenker (${feil.length}):\n  ${feil.slice(0, 50).join('\n  ')}`);
  process.exit(1);
}
console.log('Alle interne lenker virker.');
