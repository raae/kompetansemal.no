// Skriver public/_redirects for Netlify: /[fag] -> /[fag]/[første gruppe]/.
// Kjøres automatisk før `npm run build` (prebuild). Astro-konfigurasjonen har de
// samme omdirigeringene, slik at de også virker uten Netlify (f.eks. `astro preview`).
import { writeFileSync } from 'node:fs';
import { fagRedirects } from '../src/lib/ruter.mjs';

const linjer = Object.entries(fagRedirects).map(([fra, til]) => `${fra}  ${til}  301!`);
writeFileSync(new URL('../public/_redirects', import.meta.url), linjer.join('\n') + '\n');
console.log(`Skrev public/_redirects med ${linjer.length} omdirigeringer.`);
