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

/** «5. trinn» i matte. I andre fag navnet på trinngruppa målet gjelder for, f.eks. «5.–7. trinn». */
export function trinnLabel(fag: FagKey, trinn: number): string {
  if (fag === 'MAT') return `${trinn}. trinn`;
  const gruppe = grupperForTrinn(TRINN_PER_FAG[fag]).find((g) => trinn >= g.fra && trinn <= g.til);
  return gruppe ? gruppe.label : `${trinn}. trinn`;
}

/** Hvilke trinn hvert fag har mål på. */
const TRINN_PER_FAG: Record<string, number[]> = Object.fromEntries(
  FAG.map((f) => [f.key, [...new Set(ALLE.filter((m) => m.fag === f.key).map((m) => m.trinn))].sort((a, b) => a - b)]),
);

export function udirUrl(m: Maal): string {
  return `https://www.udir.no/lk20/${m.laereplan.toLowerCase()}/kompetansemaal-og-vurdering/${m.kompetansemaalsett.toLowerCase()}`;
}

export function maalUrl(m: Maal): string {
  // Små bokstaver: Netlify gjør URL-er små og sender store til små med 301.
  return `/mal/${m.kode.toLowerCase()}/`;
}

export function gruppeForMaal(m: Maal): { fag: Fag; gruppe: Gruppe } {
  const fag = fagMedKey(m.fag)!;
  const gruppe = fag.grupper.find((g) => m.trinn >= g.fra && m.trinn <= g.til)!;
  return { fag, gruppe };
}

export function fagUrl(fag: Fag): string {
  return `/${fag.slug}/`;
}

export function gruppeUrl(fag: Fag, gruppe: Gruppe): string {
  return `/${fag.slug}/${gruppe.slug}/`;
}

export function oppbyggingUrl(fag: Fag, gruppe?: Gruppe): string {
  return `${gruppe ? gruppeUrl(fag, gruppe) : fagUrl(fag)}oppbygging/`;
}

export function klosserUrl(fag: Fag, gruppe?: Gruppe): string {
  return `${gruppe ? gruppeUrl(fag, gruppe) : fagUrl(fag)}klosser/`;
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

export interface Lag {
  trinn: number;
  label: string;
  maal: Maal[];
  /** Laget under en trinngruppe: vises tonet ned, bare med målene gruppa bygger på. */
  kontekst?: boolean;
}

/** Hvilke mål i samme fag dette målet bygger på, som koder. */
export function byggerPaaKoder(m: Maal): string[] {
  return m.bygger_paa.filter((k) => PER_KODE.get(k)?.fag === m.fag);
}

/**
 * Målene i et fag stablet i lag, ett lag per trinn, tidligste først.
 * Rekkefølgen i hvert lag er valgt så strekene mellom lagene krysser minst mulig:
 * hvert mål flyttes mot snittet av posisjonene til målene det henger sammen med
 * (barysenter), noen runder opp og ned, og den beste rekkefølgen beholdes.
 */
export function oppbygging(fag: Fag): Lag[] {
  const lag = fag.grupper.flatMap((g) => g.trinn.map((t) => [...t.maal]));
  const pos = new Map<string, number>();
  const oppdater = () => lag.forEach((l) => l.forEach((m, i) => pos.set(m.kode, (i + 0.5) / l.length)));
  const barn = (m: Maal) => (BARN.get(m.kode) ?? []).filter((b) => b.fag === m.fag && b.trinn > m.trinn);
  const foreldre = (m: Maal) => byggerPaaKoder(m).map((k) => PER_KODE.get(k)!).filter((p) => p.trinn < m.trinn);
  const kryssinger = () => {
    const kanter = lag.flatMap((l) => l.flatMap((m) => foreldre(m).map((p) => [pos.get(p.kode)!, pos.get(m.kode)!, p.trinn, m.trinn])));
    let n = 0;
    for (let i = 0; i < kanter.length; i++)
      for (let j = i + 1; j < kanter.length; j++) {
        const [a1, b1, fa, ta] = kanter[i];
        const [a2, b2, fb, tb] = kanter[j];
        if (fa === fb && ta === tb && (a1 - a2) * (b1 - b2) < 0) n++;
      }
    return n;
  };
  const sorterEtter = (l: Maal[], naboer: (m: Maal) => Maal[]) => {
    const nokkel = new Map(
      l.map((m) => {
        const n = naboer(m);
        return [m.kode, n.length ? n.reduce((s, x) => s + pos.get(x.kode)!, 0) / n.length : pos.get(m.kode)!];
      }),
    );
    l.sort((a, b) => nokkel.get(a.kode)! - nokkel.get(b.kode)!);
    oppdater();
  };

  oppdater();
  let best = lag.map((l) => [...l]);
  let minst = kryssinger();
  for (let runde = 0; runde < 8; runde++) {
    if (runde % 2 === 0) for (let i = 1; i < lag.length; i++) sorterEtter(lag[i], foreldre);
    else for (let i = lag.length - 2; i >= 0; i--) sorterEtter(lag[i], barn);
    const n = kryssinger();
    if (n < minst) {
      minst = n;
      best = lag.map((l) => [...l]);
    }
  }
  return best.map((maal) => ({ trinn: maal[0].trinn, label: trinnLabel(fag.key, maal[0].trinn), maal }));
}

/**
 * Oppbyggingen for én trinngruppe: lagene i gruppa, og under dem målene fra laget
 * rett under som gruppa bygger på direkte.
 */
export function oppbyggingForGruppe(fag: Fag, gruppe: Gruppe): Lag[] {
  const alle = oppbygging(fag);
  const iGruppe = alle.filter((l) => l.trinn >= gruppe.fra && l.trinn <= gruppe.til);
  const under = alle.findLast((l) => l.trinn < gruppe.fra);
  if (!under || !iGruppe.length) return iGruppe;
  const trenger = new Set(iGruppe[0].maal.flatMap(byggerPaaKoder));
  const maal = under.maal.filter((m) => trenger.has(m.kode));
  return maal.length ? [{ ...under, maal, kontekst: true }, ...iGruppe] : iGruppe;
}

export interface Kloss {
  maal: Maal;
  /** Første kolonne (1-basert) og hvor mange kolonner klossen dekker. */
  kolonne: number;
  bredde: number;
  /** Rad fra toppen (1-basert). Grunnmuren ligger i nederste rad. */
  rad: number;
  kontekst: boolean;
}

/**
 * Klosser: hvert mål står oppå ett mål det bygger på, og er like bredt som alt som
 * står oppå det. Et mål som bygger på flere, står oppå det siste av dem (høyest trinn).
 * Raden er hvor høyt i stabelen målet står, ikke trinnet.
 */
export function klosser(lag: Lag[]): { kolonner: number; rader: number; klosser: Kloss[] } {
  const rekkefolge = lag.flatMap((l) => l.maal);
  const indeks = new Map(rekkefolge.map((m, i) => [m.kode, i]));
  const kontekst = new Set(lag.filter((l) => l.kontekst).flatMap((l) => l.maal.map((m) => m.kode)));
  const oppaa = new Map<string, Maal[]>();
  const roter: Maal[] = [];
  for (const m of rekkefolge) {
    const under = byggerPaaKoder(m)
      .map((k) => PER_KODE.get(k)!)
      .filter((p) => indeks.has(p.kode) && p.trinn < m.trinn)
      .sort((a, b) => b.trinn - a.trinn || indeks.get(a.kode)! - indeks.get(b.kode)!)[0];
    if (under) oppaa.set(under.kode, [...(oppaa.get(under.kode) ?? []), m]);
    else roter.push(m);
  }
  const bredde = new Map<string, number>();
  const hoyde = new Map<string, number>();
  const mal = (m: Maal): void => {
    const barn = oppaa.get(m.kode) ?? [];
    barn.forEach(mal);
    bredde.set(m.kode, barn.reduce((s, b) => s + bredde.get(b.kode)!, 0) || 1);
    hoyde.set(m.kode, 1 + Math.max(0, ...barn.map((b) => hoyde.get(b.kode)!)));
  };
  roter.forEach(mal);
  // De bredeste stablene først, så mål som står alene samles til høyre.
  roter.sort((a, b) => bredde.get(b.kode)! - bredde.get(a.kode)! || indeks.get(a.kode)! - indeks.get(b.kode)!);
  const rader = Math.max(1, ...roter.map((r) => hoyde.get(r.kode)!));
  const ut: Kloss[] = [];
  const plasser = (m: Maal, kolonne: number, dybde: number): void => {
    ut.push({ maal: m, kolonne, bredde: bredde.get(m.kode)!, rad: rader - dybde, kontekst: kontekst.has(m.kode) });
    let k = kolonne;
    for (const b of oppaa.get(m.kode) ?? []) (plasser(b, k, dybde + 1), (k += bredde.get(b.kode)!));
  };
  let k = 1;
  for (const r of roter) (plasser(r, k, 0), (k += bredde.get(r.kode)!));
  return { kolonner: k - 1, rader, klosser: ut };
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
    const trinnMedMaal = TRINN_PER_FAG[f.key];
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
