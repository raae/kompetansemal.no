import type { APIRoute } from 'astro';
import { alleMaal, fagMedKey, gruppeUrl, kjerneelementUrl, maalUrl, temaUrl, trinnLabel } from '../lib/data';

/** Søkeindeksen: alle mål i alle fag, liten nok til én JSON-fil. */
export const GET: APIRoute = () => {
  const liste = alleMaal().map((m) => {
    const fag = fagMedKey(m.fag)!;
    return {
      k: m.kode,
      f: m.fag,
      fn: fag.navn,
      t: m.trinn,
      tl: trinnLabel(m.fag, m.trinn),
      p: m.forklaring,
      u: m.udir,
      i: m.ideer,
      ke: m.kjerneelementer.map((ke) => [ke, kjerneelementUrl(fag, ke)]),
      tv: m.tverrfaglige_temaer.map((t) => [t, temaUrl(t)]),
      url: maalUrl(m),
      fu: gruppeUrl(fag, fag.grupper[0]),
    };
  });
  return new Response(JSON.stringify(liste), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
