// Engelskstigen: innholdet i data/engelsk.json, med typer og sjekk ved bygging.
// Klientskriptet (src/scripts/engelsk.ts) leser JSON-fila direkte og bruker bare
// typene herfra, så det ikke drar med seg hele data.ts til nettleseren.
import engelskJson from '../../data/engelsk.json';
import { maalMedKode, type Maal } from './data';

/** Et ord eller en frase. `alt` er andre engelske svar som godtas når man skriver.
 *  `valg` er norske svaralternativer som skal vises (for falske venner). */
export interface Ord {
  en: string;
  nb: string;
  alt?: string[];
  valg?: string[];
}

export interface Setning {
  en: string;
  nb: string;
  alt?: string[];
}

/** Setning med ___ som skal fylles inn. */
export interface Fyll {
  en: string;
  svar: string;
  valg: string[];
  nb: string;
  alt?: string[];
}

/** Et ord som er lett å stave feil. */
export interface Stav {
  en: string;
  feil: string[];
  nb: string;
  alt?: string[];
}

export interface Niva {
  slug: string;
  navn: string;
  emoji: string;
  /** Kompetansemålet nivået øver på. */
  kode: string;
  om: string;
  ord: Ord[];
  setninger: Setning[];
  fyll?: Fyll[];
  stav?: Stav[];
}

export interface EngelskInnhold {
  om: string;
  nivaer: Niva[];
}

export const ENGELSK_URL = '/spill/engelsk/';
export const ENGELSK_NAVN = 'Engelskstigen';

export const ENGELSK = engelskJson as EngelskInnhold;

/** Nivåene med målet hvert nivå hører til. Feiler byggingen hvis innholdet er ødelagt. */
export function nivaerMedMaal(): { niva: Niva; maal: Maal }[] {
  const slugs = new Set<string>();
  return ENGELSK.nivaer.map((niva) => {
    const hvor = `Engelskstigen, nivået «${niva.slug}»`;
    if (!/^[a-z0-9-]+$/.test(niva.slug)) throw new Error(`${hvor}: slug må være små bokstaver, tall og bindestrek`);
    if (slugs.has(niva.slug)) throw new Error(`${hvor}: slug brukes to ganger`);
    slugs.add(niva.slug);
    for (const felt of ['navn', 'emoji', 'om'] as const) if (!niva[felt]) throw new Error(`${hvor}: mangler ${felt}`);

    const maal = maalMedKode(niva.kode);
    if (!maal) throw new Error(`${hvor}: peker på ${niva.kode}, som ikke finnes`);
    if (maal.fag !== 'ENG') throw new Error(`${hvor}: ${niva.kode} er ikke et engelskmål`);

    if (niva.ord.length < 8) throw new Error(`${hvor}: trenger minst 8 ord`);
    if (niva.setninger.length < 6) throw new Error(`${hvor}: trenger minst 6 setninger`);
    sjekkUnike(hvor, 'ord (en)', niva.ord.map((o) => o.en));
    sjekkUnike(hvor, 'ord (nb)', niva.ord.map((o) => o.nb));
    sjekkUnike(hvor, 'setninger', niva.setninger.map((s) => s.en));
    sjekkUnike(hvor, 'utfyllinger', (niva.fyll ?? []).map((f) => f.en));
    sjekkUnike(hvor, 'staveord', (niva.stav ?? []).map((t) => t.en));
    for (const o of niva.ord) {
      if (!o.en || !o.nb) throw new Error(`${hvor}: ordet «${o.en || o.nb}» mangler en eller nb`);
      if (o.valg && (o.valg.length < 3 || !o.valg.includes(o.nb))) throw new Error(`${hvor}: ordet «${o.en}» må ha minst tre valg, og nb må være ett av dem`);
    }
    for (const s of niva.setninger) if (!s.en || !s.nb) throw new Error(`${hvor}: setningen «${s.en || s.nb}» mangler en eller nb`);
    for (const f of niva.fyll ?? []) {
      if (!f.en.includes('___')) throw new Error(`${hvor}: utfyllingen «${f.en}» mangler ___`);
      if (!f.nb || !f.svar) throw new Error(`${hvor}: utfyllingen «${f.en}» mangler svar eller nb`);
      if (f.valg.length < 2 || !f.valg.includes(f.svar)) throw new Error(`${hvor}: utfyllingen «${f.en}» må ha minst to valg, og svaret må være ett av dem`);
    }
    for (const t of niva.stav ?? []) {
      if (!t.en || !t.nb) throw new Error(`${hvor}: staveordet «${t.en || t.nb}» mangler en eller nb`);
      if (t.feil.length < 2) throw new Error(`${hvor}: staveordet «${t.en}» trenger minst to feilstavinger`);
      if (t.feil.includes(t.en)) throw new Error(`${hvor}: staveordet «${t.en}» står også som feilstaving`);
    }
    return { niva, maal };
  });
}

function sjekkUnike(hvor: string, hva: string, liste: string[]): void {
  const sett = new Set<string>();
  for (const x of liste) {
    const n = x.trim().toLowerCase();
    if (sett.has(n)) throw new Error(`${hvor}: ${hva} har «${x}» to ganger`);
    sett.add(n);
  }
}

/** Antall stjerner man kan få til sammen: tre per nivå. */
export function maksStjerner(): number {
  return ENGELSK.nivaer.length * 3;
}
