// Omdirigeringer som Astro-konfigurasjonen trenger: /[fag]/ -> /[fag]/[første gruppe]/.
// Leser data/udir.json direkte, siden astro.config.mjs kjører før content-laget finnes.
import { readFileSync } from 'node:fs';
import { FAG, grupperForTrinn } from './fag.mjs';

const udir = JSON.parse(readFileSync(new URL('../../data/udir.json', import.meta.url), 'utf8'));

/** @type {Record<string, string>} */
export const fagRedirects = {};
for (const fag of FAG) {
  const trinn = udir.maal.filter((m) => m.fag === fag.key).map((m) => m.trinn);
  const [forste] = grupperForTrinn(trinn);
  if (forste) fagRedirects[`/${fag.slug}`] = `/${fag.slug}/${forste.slug}/`;
}
