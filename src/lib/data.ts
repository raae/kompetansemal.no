// Datalaget: slår sammen data/udir.json (rådata fra Udir) og data/forklaringer.json
// (våre egne forklaringer og idéer) ved bygging. Ingen nettverkskall.
import udirJson from '../../data/udir.json';
import forklaringerJson from '../../data/forklaringer.json';
import { FAG, grupperForTrinn, slug } from './fag.mjs';

export type FagKey = 'MAT' | 'NOR' | 'ENG' | 'NAT' | 'SAF' | 'KRLE' | 'KHV' | 'MUS' | 'MHE' | 'KRO';

export interface Maal {
  kode: string;
  fag: FagKey;
  trinn: number;
  rekkefolge: number;
  udir: string;
  udir_forklaring?: string;
  forklaring: string;
  ideer: string[];
  kjerneelementer: string[];
  tverrfaglige_temaer: string[];
  bygger_paa: string[];
  kompetansemaalsett: string;
  laereplan: string;
}

export interface Fag {
  key: FagKey;
  slug: string;
  navn: string;
  note: string;
  antall: number;
  grupper: Gruppe[];
}

export interface Gruppe {
  slug: string;
  label: string;
  fra: number;
  til: number;
  /** Ett avsnitt per trinn med mål. Matte har flere per gruppe, andre fag ett. */
  trinn: TrinnAvsnitt[];
  maal: Maal[];
}

export interface TrinnAvsnitt {
  trinn: number;
  label: string;
  udirUrl: string;
  maal: Maal[];
}

interface UdirFil {
  kilde: string;
  laereplaner: Record<string, { kode: string; gyldig_fra: string | null }>;
  maal: Omit<Maal, 'forklaring' | 'ideer'>[];
}

const udir = udirJson as UdirFil;
const forklaringer = forklaringerJson as Record<string, { forklaring: string; ideer: string[] }>;
const fagIndeks: Record<string, number> = Object.fromEntries(FAG.map((f, i) => [f.key, i]));

const ALLE: Maal[] = udir.maal
  .map((m) => {
    const f = forklaringer[m.kode];
    if (!f?.forklaring) throw new Error(`Målet ${m.kode} mangler forklaring i data/forklaringer.json`);
    return { ...(m as Maal), forklaring: f.forklaring, ideer: f.ideer ?? [] };
  })
  .sort((a, b) => fagIndeks[a.fag] - fagIndeks[b.fag] || a.trinn - b.trinn || a.rekkefolge - b.rekkefolge);

const PER_KODE = new Map(ALLE.map((m) => [m.kode, m]));

/** Direkte barn: mål som har dette målet i bygger_paa. */
const BARN = new Map<string, Maal[]>();
for (const m of ALLE) for (const p of m.bygger_paa) BARN.set(p, [...(BARN.get(p) ?? []), m]);

export function alleMaal(): Maal[] {
  return ALLE;
}

export function maalMedKode(kode: string): Maal | undefined {
  return PER_KODE.get(kode);
}

export function fagMedKey(key: string): Fag | undefined {
  return ALLE_FAG.find((f) => f.key === key);
}

export function fagMedSlug(s: string): Fag | undefined {
  return ALLE_FAG.find((f) => f.slug === s);
}

/** «5. trinn» i matte, «Etter 7. trinn» i andre fag. */
export function trinnLabel(fag: FagKey, trinn: number, stor = true): string {
  if (fag === 'MAT') return `${trinn}. trinn`;
  return `${stor ? 'Etter' : 'etter'} ${trinn}. trinn`;
}

export function udirUrl(m: Maal): string {
  return `https://www.udir.no/lk20/${m.laereplan.toLowerCase()}/kompetansemaal-og-vurdering/${m.kompetansemaalsett.toLowerCase()}`;
}

export function maalUrl(m: Maal): string {
  return `/mal/${m.kode}/`;
}

export function gruppeForMaal(m: Maal): { fag: Fag; gruppe: Gruppe } {
  const fag = fagMedKey(m.fag)!;
  const gruppe = fag.grupper.find((g) => m.trinn >= g.fra && m.trinn <= g.til)!;
  return { fag, gruppe };
}

export function gruppeUrl(fag: Fag, gruppe: Gruppe): string {
  return `/${fag.slug}/${gruppe.slug}/`;
}

export function kjerneelementUrl(fag: Fag, navn: string): string {
  return `/kjerneelement/${fag.slug}/${slug(navn)}/`;
}

export function temaUrl(navn: string): string {
  return `/tema/${slug(navn)}/`;
}

/** Bygger på: bare direkte foreldre, i rekkefølge. */
export function byggerPaa(m: Maal): Maal[] {
  return m.bygger_paa.map((k) => PER_KODE.get(k)).filter((x): x is Maal => !!x).sort(sorter);
}

/**
 * Fører til. Matte: alle etterkommere, uansett dybde, som ligger på trinn + 1.
 * Andre fag: bare direkte barn.
 */
export function forerTil(m: Maal): Maal[] {
  if (m.fag !== 'MAT') return [...(BARN.get(m.kode) ?? [])].sort(sorter);
  const sett = new Set<string>();
  const ut: Maal[] = [];
  const stakk = [m.kode];
  while (stakk.length) {
    const k = stakk.pop()!;
    for (const b of BARN.get(k) ?? []) {
      if (sett.has(b.kode)) continue;
      sett.add(b.kode);
      if (b.trinn === m.trinn + 1) ut.push(b);
      // Bare gå videre gjennom mål som ikke har passert neste trinn.
      if (b.trinn <= m.trinn + 1) stakk.push(b.kode);
    }
  }
  return ut.sort(sorter);
}

export function tomByggerPaa(m: Maal): string {
  return m.trinn === 2 ? 'Dette er blant de første målene i faget.' : 'Udir har ikke koblet dette målet til tidligere mål.';
}

export function tomForerTil(m: Maal): string {
  if (m.trinn === 10) return 'Siste trinn i grunnskolen.';
  return m.fag === 'MAT' ? 'Ingen mål på neste trinn bygger på dette.' : 'Ingen senere mål bygger på dette.';
}

/** Forrige og neste mål i samme fag. */
export function naboer(m: Maal): { forrige?: Maal; neste?: Maal } {
  const iFag = ALLE.filter((x) => x.fag === m.fag);
  const i = iFag.findIndex((x) => x.kode === m.kode);
  return { forrige: iFag[i - 1], neste: iFag[i + 1] };
}

export function kjerneelementerForFag(fag: Fag): { navn: string; slug: string; maal: Maal[] }[] {
  const per = new Map<string, Maal[]>();
  for (const m of ALLE) if (m.fag === fag.key) for (const ke of m.kjerneelementer) per.set(ke, [...(per.get(ke) ?? []), m]);
  return [...per].map(([navn, maal]) => ({ navn, slug: slug(navn), maal }));
}

export function tverrfagligeTemaer(): { navn: string; slug: string; maal: Maal[] }[] {
  const per = new Map<string, Maal[]>();
  for (const m of ALLE) for (const t of m.tverrfaglige_temaer) per.set(t, [...(per.get(t) ?? []), m]);
  return [...per].map(([navn, maal]) => ({ navn, slug: slug(navn), maal }));
}

/** Når læreplanversjonene gjelder fra, som «1. august 2026», hvis alle er like. */
export function gyldigFraTekst(): string | null {
  const datoer = new Set(Object.values(udir.laereplaner).map((l) => l.gyldig_fra));
  if (datoer.size !== 1) return null;
  const [d] = datoer;
  if (!d) return null;
  const [aar, mnd, dag] = d.split('-').map(Number);
  const mnder = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
  return `${dag}. ${mnder[mnd - 1]} ${aar}`;
}

function sorter(a: Maal, b: Maal): number {
  return fagIndeks[a.fag] - fagIndeks[b.fag] || a.trinn - b.trinn || a.rekkefolge - b.rekkefolge;
}

function lagFag(): Fag[] {
  return FAG.map((f) => {
    const maal = ALLE.filter((m) => m.fag === f.key);
    const trinnMedMaal = [...new Set(maal.map((m) => m.trinn))].sort((a, b) => a - b);
    const grupper: Gruppe[] = grupperForTrinn(trinnMedMaal).map((g) => {
      const iGruppe = maal.filter((m) => m.trinn >= g.fra && m.trinn <= g.til);
      const trinn = [...new Set(iGruppe.map((m) => m.trinn))].sort((a, b) => a - b).map((t) => {
        const paaTrinn = iGruppe.filter((m) => m.trinn === t);
        return { trinn: t, label: trinnLabel(f.key as FagKey, t), udirUrl: udirUrl(paaTrinn[0]), maal: paaTrinn };
      });
      return { ...g, trinn, maal: iGruppe };
    });
    const etter = trinnMedMaal.map((t) => `${t}.`);
    const note =
      f.key === 'MAT'
        ? 'Matte har egne mål for hvert trinn fra 2. til 10. trinn. Målene etter 2. trinn gjelder også 1. trinn.'
        : `Målene er satt etter ${etter.slice(0, -1).join(', ')} og ${etter.at(-1)} trinn, og gjelder for trinnene fram til dit.`;
    return { key: f.key as FagKey, slug: f.slug, navn: f.navn, note, antall: maal.length, grupper };
  });
}

export const ALLE_FAG: Fag[] = lagFag();
