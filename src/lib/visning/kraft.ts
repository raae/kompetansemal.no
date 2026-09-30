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
