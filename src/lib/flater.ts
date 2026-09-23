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
 * Bikube: sekskanter der hver rad er forskjøvet en halv celle, så hver celle hviler på
 * to celler under seg. Et mål plasseres over snittet av målene det bygger på, og havner
 * dermed mellom to foreldre som ligger ved siden av hverandre.
 */
export function bikube(lag: Lag[]): Flate {
  const foreldre = foreldreMedLag(lag);
  const kontekst = new Set(lag.filter((l) => l.kontekst).flatMap((l) => l.maal.map((m) => m.kode)));
  const x = new Map<string, number>();
  const brikker: Brikke[] = [];
  lag.forEach((l, i) => {
    // Mål uten foreldre i visningen legges til høyre for det som alt er plassert.
    const hoyre = i ? Math.max(...x.values()) + 1 : 0;
    const onsket = l.maal.map((m, j) => {
      const p = foreldre.get(m.kode)!.filter((f) => x.has(f.kode));
      return { m, x: p.length ? p.reduce((s, f) => s + x.get(f.kode)!, 0) / p.length + (p.length === 1 ? 0.5 : 0) : hoyre + j / 1000 };
    });
    onsket.sort((a, b) => a.x - b.x);
    const forskyv = i % 2 ? 0.5 : 0;
    const plass = spre(onsket.map((o) => o.x - forskyv), onsket.map(() => 1), 1).map((v) => v + forskyv);
    onsket.forEach((o, j) => x.set(o.m.kode, plass[j]));
    for (const o of onsket) {
      const mx = x.get(o.m.kode)!;
      // Rører: forelderen ligger i laget rett under, en halv celle til siden.
      const rorer = foreldre.get(o.m.kode)!.filter((f) => f.lag === i - 1 && Math.abs(x.get(f.kode)! - mx) === 0.5).map((f) => f.kode);
      brikker.push({ maal: o.m, x: mx, bredde: 1, lag: i, kontekst: kontekst.has(o.m.kode), utenStrek: rorer });
    }
  });
  return normaliser(brikker, lag.length);
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
