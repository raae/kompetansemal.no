// Datamodellen for visualiseringene (Oppbygging og Klosser). Kjører i nettleseren:
// siden får målene i faget som JSON, filtrerer dem og regner ut oppsettet på nytt.
// Importerer derfor ikke data.ts (som drar med seg alle datafilene).

/** Det visualiseringene trenger om hvert mål. Lages av visningsMaal() i data.ts. */
export interface VMaal {
  kode: string;
  trinn: number;
  /** Trinngruppa, f.eks. «5-7». Brukes av trinnfilteret. */
  gruppe: string;
  trinnLabel: string;
  forklaring: string;
  udir: string;
  url: string;
  /** Mål i samme fag som dette bygger på. */
  bygger: string[];
  /** Slugs for filtrene. */
  emner: string[];
  kjerne: string[];
}

export interface Lag {
  trinn: number;
  label: string;
  maal: VMaal[];
  /** Laget under de valgte trinnene: vises tonet ned, bare med målene de bygger på. */
  kontekst?: boolean;
}

export type KlossVariant = 'tre' | 'traader' | 'merker' | 'kopier' | 'bikube' | 'bro' | 'rutenett' | 'kraft' | 'nettverk';

export const KLOSS_VARIANTER: { slug: KlossVariant; navn: string; forklaring: string }[] = [
  { slug: 'tre', navn: 'Tre', forklaring: 'Hvert mål står oppå ett mål det bygger på, det med høyest trinn. Andre koblinger vises bare når du trykker på et mål.' },
  { slug: 'traader', navn: 'Tråder', forklaring: 'Som «Tre», men stiplede tråder går fra hvert mål ned til de andre målene det også bygger på.' },
  { slug: 'merker', navn: 'Merker', forklaring: 'Under hver kloss står merker for alle målene den bygger på. Det fylte merket er målet den står oppå. Trykk på et merke for å hoppe dit.' },
  { slug: 'kopier', navn: 'Kopier', forklaring: 'Et mål som bygger på flere, står oppå alle. Kopiene er stripete og har ikke noe oppå seg. Trykk på en kopi for å se originalen.' },
  { slug: 'bikube', navn: 'Bikube', forklaring: 'Sekskanter, ett lag per trinn. Et mål rører med en side alle målene det bygger på i trinnet under. Trengs det, blir målet flere celler slått sammen. Strekene går bare til mål det ikke rører, for eksempel fra trinn lenger ned.' },
  { slug: 'bro', navn: 'Bro', forklaring: 'Ett lag per trinn. Et mål spenner over alle målene det bygger på i laget under, som en bro, og er bredt nok til det som står oppå det. Strekene går bare til mål det ikke står over.' },
  { slug: 'kraft', navn: 'Kraft', forklaring: 'Ett lag per trinn, men rekkefølgen i hvert lag bestemmes av krefter: koblingene trekker målene som bygger på hverandre mot hverandre, så trådene blir rettere og strekene krysser mindre. Trykk på et mål for å se teksten i hele tråden.' },
  { slug: 'nettverk', navn: 'Nettverk', forklaring: 'Hele målene som kort, plassert fritt. Målene som bygger på hverandre, trekkes sammen til tråder, så strekene krysser lite. Tidlige mål dras litt nedover, og fargen viser trinnet: lysere er tidligere.' },
  { slug: 'rutenett', navn: 'Rutenett', forklaring: 'Én tabell per trinn. Hver rad er et mål, og en prikk viser hvilke mål fra trinnet under det bygger på. Flere prikker i en rad betyr at målet står på flere.' },
];

/**
 * Målene stablet i lag, ett lag per trinn, tidligste først. `alle` er alle målene i
 * faget i Udirs rekkefølge, `synlige` kodene som passer filteret.
 *
 * Er trinnfilteret på, legges målene fra laget rett under hvert valgt område til som
 * et tonet lag (kontekst), men bare de de valgte målene bygger på direkte.
 *
 * Rekkefølgen i hvert lag er valgt så strekene mellom lagene krysser minst mulig:
 * hvert mål flyttes mot snittet av posisjonene til målene det henger sammen med
 * (barysenter), noen runder opp og ned, og den beste rekkefølgen beholdes.
 */
export function byggLag(alle: VMaal[], synlige: Set<string>, medKontekst: boolean): Lag[] {
  const trinnListe = [...new Set(alle.map((m) => m.trinn))].sort((a, b) => a - b);
  const valgte = alle.filter((m) => synlige.has(m.kode));
  const valgteTrinn = new Set(valgte.map((m) => m.trinn));
  const kontekst = new Set<string>();
  if (medKontekst) {
    for (const t of valgteTrinn) {
      const under = trinnListe[trinnListe.indexOf(t) - 1];
      if (under === undefined || valgteTrinn.has(under)) continue;
      const iLaget = new Set(alle.filter((m) => m.trinn === under).map((m) => m.kode));
      for (const m of valgte) if (m.trinn === t) for (const k of m.bygger) if (iLaget.has(k)) kontekst.add(k);
    }
  }
  const med = alle.filter((m) => synlige.has(m.kode) || kontekst.has(m.kode));
  const iSett = new Set(med.map((m) => m.kode));
  const perKode = new Map(med.map((m) => [m.kode, m]));
  const lag = [...new Set(med.map((m) => m.trinn))].sort((a, b) => a - b).map((t) => med.filter((m) => m.trinn === t));

  const foreldreAv = new Map(med.map((m) => [m.kode, m.bygger.filter((k) => iSett.has(k) && perKode.get(k)!.trinn < m.trinn).map((k) => perKode.get(k)!)]));
  const barnAv = new Map<string, VMaal[]>(med.map((m) => [m.kode, []]));
  for (const m of med) for (const p of foreldreAv.get(m.kode)!) barnAv.get(p.kode)!.push(m);

  const pos = new Map<string, number>();
  const oppdater = () => lag.forEach((l) => l.forEach((m, i) => pos.set(m.kode, (i + 0.5) / l.length)));
  const kryssinger = () => {
    const kanter = med.flatMap((m) => foreldreAv.get(m.kode)!.map((p) => [pos.get(p.kode)!, pos.get(m.kode)!, p.trinn, m.trinn]));
    let n = 0;
    for (let i = 0; i < kanter.length; i++)
      for (let j = i + 1; j < kanter.length; j++) {
        const [a1, b1, fa, ta] = kanter[i];
        const [a2, b2, fb, tb] = kanter[j];
        if (fa === fb && ta === tb && (a1 - a2) * (b1 - b2) < 0) n++;
      }
    return n;
  };
  const sorterEtter = (l: VMaal[], naboer: (m: VMaal) => VMaal[]) => {
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
    if (runde % 2 === 0) for (let i = 1; i < lag.length; i++) sorterEtter(lag[i], (m) => foreldreAv.get(m.kode)!);
    else for (let i = lag.length - 2; i >= 0; i--) sorterEtter(lag[i], (m) => barnAv.get(m.kode)!);
    const n = kryssinger();
    if (n < minst) {
      minst = n;
      best = lag.map((l) => [...l]);
    }
  }
  return best.map((maal) => ({
    trinn: maal[0].trinn,
    label: maal[0].trinnLabel,
    maal,
    kontekst: maal.every((m) => kontekst.has(m.kode)) || undefined,
  }));
}

/** Kodene i visningen som et mål bygger på. */
export function byggerIVisning(lag: Lag[]): (m: VMaal) => string[] {
  const iSett = new Set(lag.flatMap((l) => l.maal.map((m) => m.kode)));
  return (m) => m.bygger.filter((k) => iSett.has(k));
}

export interface Kloss {
  maal: VMaal;
  /** Første kolonne (1-basert) og hvor mange kolonner klossen dekker. */
  kolonne: number;
  bredde: number;
  /** Rad fra toppen (1-basert). Grunnmuren ligger i nederste rad. */
  rad: number;
  kontekst: boolean;
  /** Målet klossen står oppå. */
  hoved?: string;
  /** Alle mål i visningen som målet bygger på, det klossen står oppå først. */
  paa: string[];
  /** En kopi av et mål som står oppå et annet mål det også bygger på. */
  kopi: boolean;
}

/**
 * Klosser: hvert mål står oppå ett mål det bygger på, og er like bredt som alt som
 * står oppå det. Et mål som bygger på flere, står oppå det siste av dem (høyest trinn).
 * Med `kopier` står en smal kopi også oppå hvert av de andre.
 * Raden er hvor høyt i stabelen målet står, ikke trinnet.
 */
export function klosser(lag: Lag[], { kopier = false } = {}): { kolonner: number; rader: number; klosser: Kloss[] } {
  const rekkefolge = lag.flatMap((l) => l.maal);
  const indeks = new Map(rekkefolge.map((m, i) => [m.kode, i]));
  const perKode = new Map(rekkefolge.map((m) => [m.kode, m]));
  const kontekst = new Set(lag.filter((l) => l.kontekst).flatMap((l) => l.maal.map((m) => m.kode)));
  type Node = { maal: VMaal; kopi: boolean };
  const oppaa = new Map<string, Node[]>();
  const paa = new Map<string, string[]>();
  const roter: Node[] = [];
  for (const m of rekkefolge) {
    const under = m.bygger
      .map((k) => perKode.get(k))
      .filter((p): p is VMaal => !!p && p.trinn < m.trinn)
      .sort((a, b) => b.trinn - a.trinn || indeks.get(a.kode)! - indeks.get(b.kode)!);
    paa.set(m.kode, under.map((p) => p.kode));
    const legg = (p: VMaal, n: Node) => oppaa.set(p.kode, [...(oppaa.get(p.kode) ?? []), n]);
    if (under.length) legg(under[0], { maal: m, kopi: false });
    else roter.push({ maal: m, kopi: false });
    if (kopier) for (const p of under.slice(1)) legg(p, { maal: m, kopi: true });
  }
  const barnAv = (n: Node) => (n.kopi ? [] : (oppaa.get(n.maal.kode) ?? []));
  const bredde = new Map<Node, number>();
  const hoyde = new Map<Node, number>();
  const mal = (n: Node): void => {
    const barn = barnAv(n);
    barn.forEach(mal);
    bredde.set(n, barn.reduce((s, b) => s + bredde.get(b)!, 0) || 1);
    hoyde.set(n, 1 + Math.max(0, ...barn.map((b) => hoyde.get(b)!)));
  };
  roter.forEach(mal);
  // De bredeste stablene først, så mål som står alene samles til høyre.
  roter.sort((a, b) => bredde.get(b)! - bredde.get(a)! || indeks.get(a.maal.kode)! - indeks.get(b.maal.kode)!);
  const rader = Math.max(1, ...roter.map((r) => hoyde.get(r)!));
  const ut: Kloss[] = [];
  const plasser = (n: Node, kolonne: number, dybde: number): void => {
    const p = paa.get(n.maal.kode)!;
    ut.push({ maal: n.maal, kolonne, bredde: bredde.get(n)!, rad: rader - dybde, kontekst: kontekst.has(n.maal.kode), hoved: p[0], paa: p, kopi: n.kopi });
    let k = kolonne;
    for (const b of barnAv(n)) (plasser(b, k, dybde + 1), (k += bredde.get(b)!));
  };
  let k = 1;
  for (const r of roter) (plasser(r, k, 0), (k += bredde.get(r)!));
  return { kolonner: k - 1, rader, klosser: ut };
}

/** Rutenett: for hvert lag over det nederste, hvilke mål i laget under hvert mål bygger på. */
export function rutenett(lag: Lag[]): { over: Lag; under: Lag; rader: { maal: VMaal; paa: Set<string> }[] }[] {
  return lag.slice(1).map((over, i) => ({
    over,
    under: lag[i],
    rader: over.maal.map((m) => ({ maal: m, paa: new Set(m.bygger) })),
  }));
}
