// Kraftgraf: målene er punkter som skyver hverandre bort, og koblingene er fjærer
// som trekker målene som bygger på hverandre sammen. Da samles hver tråd (kjede av
// mål) på ett sted, og strekene krysser mindre enn når hvert trinn er en rad med
// fast rekkefølge.
//
// `rader`: hvert trinn ligger på sin egen rad, bare x flyttes.
// Ellers: fritt, men hvert mål dras svakt mot høyden til trinnet sitt, så tidlige
// mål fortsatt havner nederst.
import type { Lag, VMaal } from './modell';

export interface Punkt {
  maal: VMaal;
  x: number;
  y: number;
  lag: number;
  kontekst: boolean;
}

/** Avstand mellom radene og mellom punktene, i «enheter» (se CSS: --u og --rad). */
const RAD = 1;
const MIN_AVSTAND = 0.9;

export function kraft(lag: Lag[], { rader }: { rader: boolean }): { punkter: Punkt[]; bredde: number; hoyde: number } {
  const punkter: Punkt[] = [];
  const hoyest = lag.length - 1;
  lag.forEach((l, i) =>
    l.maal.forEach((m, j) =>
      // Start i rekkefølgen fra lagene (barysenter), sentrert. Tidligste lag nederst.
      punkter.push({ maal: m, x: j - (l.maal.length - 1) / 2, y: (hoyest - i) * RAD, lag: i, kontekst: !!l.kontekst }),
    ),
  );
  const indeks = new Map(punkter.map((p, i) => [p.maal.kode, i]));
  const kanter: [number, number][] = [];
  for (const p of punkter)
    for (const k of p.maal.bygger) {
      const q = indeks.get(k);
      if (q !== undefined && punkter[q].lag < p.lag) kanter.push([q, indeks.get(p.maal.kode)!]);
    }

  const n = punkter.length;
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const RUNDER = 400;
  for (let runde = 0; runde < RUNDER; runde++) {
    const varme = 1 - runde / RUNDER;
    // Frastøtning mellom alle par (få nok mål til at n² går fint).
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        let dx = punkter[b].x - punkter[a].x;
        let dy = rader ? 0 : punkter[b].y - punkter[a].y;
        // Bare punkter på samme rad skyver hverandre når radene er faste.
        if (rader && punkter[a].lag !== punkter[b].lag) continue;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-6) (dx = (a % 2 ? 1 : -1) * 0.01), (dy = 0), (d2 = 1e-4);
        const d = Math.sqrt(d2);
        const f = (rader ? 0.03 : 0.05) / d2 + (d < MIN_AVSTAND ? (MIN_AVSTAND - d) * 0.5 : 0);
        vx[a] -= (dx / d) * f;
        vx[b] += (dx / d) * f;
        if (!rader) (vy[a] -= (dy / d) * f), (vy[b] += (dy / d) * f);
      }
    // Fjærer langs koblingene. Med faste rader trekker de bare sidelengs.
    for (const [a, b] of kanter) {
      const dx = punkter[b].x - punkter[a].x;
      const dy = punkter[b].y - punkter[a].y;
      const lengde = rader ? 0 : 1.1;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
      const f = 0.08 * (rader ? d : d - lengde);
      vx[a] += (dx / d) * f;
      vx[b] -= (dx / d) * f;
      if (!rader) (vy[a] += (dy / d) * f), (vy[b] -= (dy / d) * f);
    }
    // Trekk mot trinnhøyden (fritt) og svakt mot midten.
    for (let i = 0; i < n; i++) {
      const p = punkter[i];
      if (!rader) vy[i] += ((hoyest - p.lag) * RAD * 1.6 - p.y) * 0.05;
      vx[i] -= p.x * 0.004;
      p.x += Math.max(-0.3, Math.min(0.3, vx[i])) * varme;
      if (!rader) p.y += Math.max(-0.3, Math.min(0.3, vy[i])) * varme;
      vx[i] *= 0.5;
      vy[i] *= 0.5;
    }
  }
  // Faste rader: rydd opp så ingen står oppå hverandre, i den rekkefølgen kreftene ga.
  if (rader)
    for (let i = 0; i < lag.length; i++) {
      const rad = punkter.filter((p) => p.lag === i).sort((a, b) => a.x - b.x);
      for (let j = 1; j < rad.length; j++) rad[j].x = Math.max(rad[j].x, rad[j - 1].x + 1);
    }
  const minX = Math.min(...punkter.map((p) => p.x));
  const minY = Math.min(...punkter.map((p) => p.y));
  for (const p of punkter) (p.x -= minX), (p.y -= minY);
  return {
    punkter,
    bredde: Math.max(...punkter.map((p) => p.x)) + 1,
    hoyde: Math.max(...punkter.map((p) => p.y)) + 1,
  };
}

export interface Kort {
  maal: VMaal;
  /** Midtpunkt, bredde og høyde i rem. */
  x: number;
  y: number;
  b: number;
  h: number;
  lag: number;
  kontekst: boolean;
}

const KORT_BREDDE = 12;
const LUFT = 0.8;

/** Omtrentlig høyde på et kort med hele teksten (0,8 rem tekst, ca. 26 tegn per linje). */
function kortHoyde(m: VMaal): number {
  return 2.4 + Math.ceil(m.forklaring.length / 26) * 1.1;
}

/**
 * Kraftgraf med hele målene som kort. Kortene står helt fritt: koblingene trekker
 * målene som bygger på hverandre sammen, kortene skyver hverandre bort og kan ikke
 * overlappe. Retningen vises med piler, ikke med plasseringen. Kortene starter i
 * lagene (tidligste nederst), så grafen blir lik hver gang.
 * `hoyder` er målte korthøyder i rem; uten dem brukes et anslag.
 */
export function kortgraf(lag: Lag[], hoyder?: Map<string, number>): { kort: Kort[]; bredde: number; hoyde: number } {
  const hoyest = lag.length - 1;
  const RAD = 9;
  const kort: Kort[] = [];
  lag.forEach((l, i) =>
    l.maal.forEach((m, j) =>
      kort.push({ maal: m, x: (j - (l.maal.length - 1) / 2) * (KORT_BREDDE + 1), y: (hoyest - i) * RAD, b: KORT_BREDDE, h: hoyder?.get(m.kode) ?? kortHoyde(m), lag: i, kontekst: !!l.kontekst }),
    ),
  );
  const indeks = new Map(kort.map((k, i) => [k.maal.kode, i]));
  const kanter: [number, number][] = [];
  for (const k of kort)
    for (const kode of k.maal.bygger) {
      const q = indeks.get(kode);
      if (q !== undefined && kort[q].lag < k.lag) kanter.push([q, indeks.get(k.maal.kode)!]);
    }
  const n = kort.length;

  // Skyv overlappende kort fra hverandre langs aksen med minst overlapp.
  const skilt = (styrke: number) => {
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const A = kort[a];
        const B = kort[b];
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const ox = (A.b + B.b) / 2 + LUFT - Math.abs(dx);
        const oy = (A.h + B.h) / 2 + LUFT - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        if (ox < oy) {
          const s = ((dx >= 0 ? 1 : -1) * ox * styrke) / 2;
          (A.x -= s), (B.x += s);
        } else {
          const s = ((dy >= 0 ? 1 : -1) * oy * styrke) / 2;
          (A.y -= s), (B.y += s);
        }
      }
  };

  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  const midtY = (hoyest * RAD) / 2;
  const grad = new Uint16Array(n);
  for (const [a, b] of kanter) grad[a]++, grad[b]++;
  const RUNDER = 500;
  for (let runde = 0; runde < RUNDER; runde++) {
    const varme = 1 - runde / RUNDER;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) {
        const dx = kort[b].x - kort[a].x;
        const dy = kort[b].y - kort[a].y;
        const d2 = Math.max(dx * dx + dy * dy, 1);
        const d = Math.sqrt(d2);
        const f = 40 / d2;
        (vx[a] -= (dx / d) * f), (vx[b] += (dx / d) * f);
        (vy[a] -= (dy / d) * f), (vy[b] += (dy / d) * f);
      }
    for (const [a, b] of kanter) {
      const dx = kort[b].x - kort[a].x;
      const dy = kort[b].y - kort[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1e-3;
      const f = 0.04 * (d - 11);
      (vx[a] += (dx / d) * f), (vx[b] -= (dx / d) * f);
      (vy[a] += (dy / d) * f), (vy[b] -= (dy / d) * f);
    }
    for (let i = 0; i < n; i++) {
      const k = kort[i];
      // Svakt drag mot midten, så løse mål ikke driver langt av gårde. Mål uten
      // koblinger i visningen dras sterkere, ellers skyves de helt ut i kanten.
      const drag = grad[i] ? 0.003 : 0.02;
      vx[i] -= k.x * drag;
      vy[i] -= (k.y - midtY) * drag;
      k.x += Math.max(-2, Math.min(2, vx[i])) * varme;
      k.y += Math.max(-2, Math.min(2, vy[i])) * varme;
      vx[i] *= 0.5;
      vy[i] *= 0.5;
    }
    skilt(0.5);
  }
  for (let i = 0; i < 40; i++) skilt(1);

  const minX = Math.min(...kort.map((k) => k.x - k.b / 2));
  const minY = Math.min(...kort.map((k) => k.y - k.h / 2));
  for (const k of kort) (k.x -= minX), (k.y -= minY);
  return {
    kort,
    bredde: Math.max(...kort.map((k) => k.x + k.b / 2)),
    hoyde: Math.max(...kort.map((k) => k.y + k.h / 2)),
  };
}
