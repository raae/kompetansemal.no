// Fritt plasserte visninger av klossene: bikube og bro. Begge har ett lag per trinn,
// tidligste nederst, og regner ut x-posisjon og bredde i «enheter» (én kloss bred).
import { byggerPaaKoder, type Lag, type Maal } from './data';

export interface Brikke {
  maal: Maal;
  /** Venstre kant og bredde i enheter. */
  x: number;
  bredde: number;
  /** Lag nedenfra, 0 er nederst. */
  lag: number;
  kontekst: boolean;
  /** Mål den står på eller rører, som ikke trenger strek. */
  utenStrek: string[];
}

export interface Flate {
  brikker: Brikke[];
  bredde: number;
  lag: number;
}

/** Foreldre i visningen, med laget de ligger i. */
function foreldreMedLag(lag: Lag[]): Map<string, { kode: string; lag: number }[]> {
  const lagFor = new Map(lag.flatMap((l, i) => l.maal.map((m) => [m.kode, i] as const)));
  return new Map(
    lag.flatMap((l, i) =>
      l.maal.map((m) => [m.kode, byggerPaaKoder(m).filter((k) => (lagFor.get(k) ?? i) < i).map((k) => ({ kode: k, lag: lagFor.get(k)! }))] as const),
    ),
  );
}

/** Flytt ønskede posisjoner (sortert) så de ikke overlapper, og sentrer rundt ønsket. */
function spre(onsket: number[], bredder: number[], rute = 0): number[] {
  const ut: number[] = [];
  for (let i = 0; i < onsket.length; i++) {
    const x = rute ? Math.round(onsket[i] / rute) * rute : onsket[i];
    ut.push(i ? Math.max(x, ut[i - 1] + bredder[i - 1]) : x);
  }
  // Skyv hele raden tilbake så snittforskyvningen blir null, uten å bryte rekkefølgen.
  const snitt = ut.reduce((s, x, i) => s + x - onsket[i], 0) / (ut.length || 1);
  const flytt = rute ? Math.round(snitt / rute) * rute : snitt;
  return ut.map((x) => x - flytt);
}

/**
 * Bikube: sekskanter der hver rad er forskjøvet en halv celle. En celle rører de to
 * cellene skrått under seg, og en kloss av k celler slått sammen rører k + 1 under seg.
 * Hvert mål blir så bredt som trengs for å røre alle målene det bygger på i laget
 * rett under (høyst MAKS_CELLER), og så bredt at målene som bygger på det, får plass.
 * Det som likevel ikke rører, får strek.
 */
const MAKS_CELLER = 4;

export function bikube(lag: Lag[]): Flate {
  const foreldre = foreldreMedLag(lag);
  const kontekst = new Set(lag.filter((l) => l.kontekst).flatMap((l) => l.maal.map((m) => m.kode)));
  const naere = (kode: string, i: number) => foreldre.get(kode)!.filter((f) => f.lag === i - 1).map((f) => f.kode);

  // Egen bredde: én celle per barn i laget over (delt på hvor mange barnet står på).
  const egen = new Map<string, number>();
  lag.forEach((l, i) => {
    for (const m of l.maal) {
      const andel = (lag[i + 1]?.maal ?? []).filter((b) => naere(b.kode, i + 1).includes(m.kode)).reduce((s, b) => s + 1 / naere(b.kode, i + 1).length, 0);
      egen.set(m.kode, Math.min(MAKS_CELLER, Math.max(1, Math.ceil(andel - 0.001))));
    }
  });

  const pos = new Map<string, { x: number; k: number }>();
  const brikker: Brikke[] = [];
  // Rører en kloss på rad i (x, k celler) en kloss på raden under (y, m celler)?
  const rorer = (x: number, k: number, y: number, m: number) => Math.max(x - 0.5, y) <= Math.min(x + k - 0.5, y + m - 1);

  lag.forEach((l, i) => {
    const forskyv = i % 2 ? 0.5 : 0;
    const paaRute = (v: number) => Math.round(v - forskyv) + forskyv;
    const hoyre = i ? Math.max(...[...pos.values()].map((p) => p.x + p.k)) + 1 : 0;
    const onsket = l.maal.map((m, j) => {
      let k = egen.get(m.kode)!;
      let under = naere(m.kode, i).map((kode) => pos.get(kode)!);
      if (!i) return { m, k, lo: 0, hi: 0 };
      if (!under.length) {
        // Ingen i laget rett under: over snittet av foreldre lenger ned, ellers til høyre.
        const lenger = foreldre.get(m.kode)!.map((f) => pos.get(f.kode)!).filter(Boolean);
        const midt = lenger.length ? lenger.reduce((s, p) => s + p.x + (p.k - 1) / 2, 0) / lenger.length : hoyre + j;
        const x = paaRute(midt - (k - 1) / 2);
        return { m, k, lo: x, hi: x };
      }
      // Minste bredde som rører alle: x må ligge i [A - (k-1), B] for hver forelder.
      for (;;) {
        const A = Math.max(...under.map((p) => p.x - 0.5));
        const B = Math.min(...under.map((p) => p.x + p.k - 0.5));
        const trengs = Math.max(k, 1 + Math.max(0, A - B));
        if (trengs <= MAKS_CELLER || under.length === 1) {
          k = Math.min(trengs, MAKS_CELLER);
          // Alle x i [lo, hi] rører alle foreldrene som er igjen.
          const lo = A - (k - 1);
          return { m, k, lo: Math.min(lo, B), hi: B };
        }
        // For langt fra hverandre: slipp forelderen lengst fra midten, den får strek.
        const midt = under.reduce((s, p) => s + p.x + p.k / 2, 0) / under.length;
        under = [...under].sort((a, b) => Math.abs(b.x + b.k / 2 - midt) - Math.abs(a.x + a.k / 2 - midt)).slice(1);
      }
    });
    if (!i) {
      let x = 0;
      for (const o of onsket) (o.lo = o.hi = x), (x += o.k);
    }
    // Legg klossene fra venstre, den med tidligste frist (hi) først, så langt til
    // venstre som mulig innenfor [lo, hi]. Rekker en ikke fristen, havner den rett etter.
    onsket.sort((a, b) => a.hi - b.hi || a.lo - b.lo);
    let slutt = -Infinity;
    for (const o of onsket) {
      const x = Math.max(o.lo, paaRute(Math.ceil(slutt - forskyv - 1e-9) + forskyv));
      pos.set(o.m.kode, { x, k: o.k });
      slutt = x + o.k;
    }
    for (const o of onsket) {
      const p = pos.get(o.m.kode)!;
      const rort = naere(o.m.kode, i).filter((kode) => {
        const q = pos.get(kode)!;
        return rorer(p.x, p.k, q.x, q.k);
      });
      brikker.push({ maal: o.m, x: p.x, bredde: p.k, lag: i, kontekst: kontekst.has(o.m.kode), utenStrek: rort });
    }
  });
  return normaliser(brikker, lag.length);
}

/** Omriss for k sekskanter slått sammen side ved side, som clip-path i prosent. */
export function sekskantOmriss(k: number): string {
  const p = (x: number, y: number) => `${+((x / k) * 100).toFixed(3)}% ${y}%`;
  const pkt = [p(0, 25)];
  for (let i = 0; i < k; i++) pkt.push(p(i + 0.5, 0), p(i + 1, 25));
  pkt.push(p(k, 75));
  for (let i = k - 1; i >= 0; i--) pkt.push(p(i + 0.5, 100), p(i, 75));
  return `polygon(${pkt.join(',')})`;
}

/**
 * Bro: et mål spenner over målene det bygger på i laget rett under, som en bro.
 * Hvert mål får plass til det som skal stå oppå det: bredden er summen av det barna
 * trenger, delt på hvor mange de står på. Står et mål på to som ligger langt fra
 * hverandre, bygger det bare bro over nærmeste del og får strek til resten.
 */
export function bro(lag: Lag[]): Flate {
  const foreldre = foreldreMedLag(lag);
  const kontekst = new Set(lag.filter((l) => l.kontekst).flatMap((l) => l.maal.map((m) => m.kode)));
  const naere = (kode: string, i: number) => foreldre.get(kode)!.filter((f) => f.lag === i - 1).map((f) => f.kode);

  // Behov, ovenfra og ned.
  const behov = new Map<string, number>();
  for (let i = lag.length - 1; i >= 0; i--)
    for (const m of lag[i].maal) {
      const barn = (lag[i + 1]?.maal ?? []).filter((b) => naere(b.kode, i + 1).includes(m.kode));
      behov.set(m.kode, Math.max(1, barn.reduce((s, b) => s + behov.get(b.kode)! / naere(b.kode, i + 1).length, 0)));
    }

  const pos = new Map<string, { x: number; bredde: number }>();
  const brikker: Brikke[] = [];
  lag.forEach((l, i) => {
    // Del hver forelders bredde mellom barna i dette laget, i barnas rekkefølge.
    const andel = new Map<string, { fra: number; til: number; kode: string }[]>();
    const under = lag[i - 1]?.maal ?? [];
    for (const p of under) {
      const barn = l.maal.filter((b) => naere(b.kode, i).includes(p.kode));
      const total = barn.reduce((s, b) => s + behov.get(b.kode)! / naere(b.kode, i).length, 0);
      const { x, bredde } = pos.get(p.kode)!;
      let fra = x;
      for (const b of barn) {
        const w = (bredde * behov.get(b.kode)!) / naere(b.kode, i).length / total;
        andel.set(b.kode, [...(andel.get(b.kode) ?? []), { fra, til: fra + w, kode: p.kode }]);
        fra += w;
      }
    }
    const hoyre = Math.max(0, ...[...pos.values()].map((p) => p.x + p.bredde));
    const onsket = l.maal.map((m, j) => {
      const b = behov.get(m.kode)!;
      let deler = andel.get(m.kode) ?? [];
      // For langt spenn: bruk bare den sammenhengende delen rundt den største andelen.
      if (deler.length > 1) {
        deler.sort((a, c) => a.fra - c.fra);
        const storst = deler.reduce((s, d) => (d.til - d.fra > s.til - s.fra ? d : s));
        deler = deler.filter((d) => Math.abs((d.fra + d.til) / 2 - (storst.fra + storst.til) / 2) <= b + 1);
      }
      // Uten bro: over snittet av foreldre lenger ned, eller til høyre for alt annet.
      const lenger = foreldre.get(m.kode)!.map((f) => pos.get(f.kode)).filter((p) => !!p);
      const reserve = lenger.length ? lenger.reduce((s, p) => s + p.x + p.bredde / 2, 0) / lenger.length - b / 2 : hoyre + j / 1000;
      const fra = deler.length ? Math.min(...deler.map((d) => d.fra)) : reserve;
      const til = deler.length ? Math.max(...deler.map((d) => d.til)) : reserve + b;
      return { m, x: fra, bredde: Math.max(b, til - fra), bro: deler.map((d) => d.kode) };
    });
    onsket.sort((a, c) => a.x + a.bredde / 2 - (c.x + c.bredde / 2));
    const plass = spre(onsket.map((o) => o.x), onsket.map((o) => o.bredde));
    onsket.forEach((o, j) => {
      pos.set(o.m.kode, { x: plass[j], bredde: o.bredde });
      // Strek bare til foreldre den faktisk står over.
      const over = o.bro.filter((k) => {
        const p = pos.get(k)!;
        return p.x < plass[j] + o.bredde - 0.05 && p.x + p.bredde > plass[j] + 0.05;
      });
      brikker.push({ maal: o.m, x: plass[j], bredde: o.bredde, lag: i, kontekst: kontekst.has(o.m.kode), utenStrek: over });
    });
  });
  return normaliser(brikker, lag.length);
}

function normaliser(brikker: Brikke[], antallLag: number): Flate {
  const min = Math.min(...brikker.map((b) => b.x));
  for (const b of brikker) b.x -= min;
  return { brikker, bredde: Math.max(...brikker.map((b) => b.x + b.bredde)), lag: antallLag };
}
