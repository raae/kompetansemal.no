#!/usr/bin/env node
// Henter alle kompetansemål i grunnskolen fra Udirs Grep-API og skriver data/udir.json.
//
// Kjøres BARE manuelt med `npm run hent-udir` når Udir har endret læreplanene.
// Byggingen leser data/udir.json fra repoet og kaller aldri data.udir.no.
//
// Om språk i Grep-API-et (dette er grunnen til at vi henter hvert objekt for seg):
// - Tekster kommer som liste av {spraak, verdi}. Oppføringen "default" er målformen
//   læreplanen ble fastsatt som forskrift i. Matte, samfunnsfag, mat og helse og
//   kroppsøving er fastsatt på nynorsk, de seks andre på bokmål.
// - Referanser inne i et objekt (bygger-paa, kjerneelementer, lista over mål i et
//   kompetansemålsett) har bare én tittel: default-språket til objektet det pekes på.
// - API-et støtter verken Accept-Language eller språkparameter i URL-en.
// Derfor: hent hvert mål, kjerneelement og tema for seg, og velg alltid spraak === "nob".

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { FAG } from '../src/lib/fag.mjs';

const BASE = 'https://data.udir.no/kl06/v201906';
const ROT = new URL('../', import.meta.url);
const UDIR_FIL = new URL('data/udir.json', ROT);
const FORKLARINGER_FIL = new URL('data/forklaringer.json', ROT);
const STATUS_PUBLISERT = 'https://data.udir.no/kl06/v201906/status/status_publisert';

// ---------- henting ----------

async function get(path, forsok = 0) {
  const url = `${BASE}/${path}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(40_000) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } catch (feil) {
    if (forsok < 3) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** forsok));
      return get(path, forsok + 1);
    }
    throw new Error(`Klarte ikke hente ${url}: ${feil.message}`);
  }
}

/** Kjør `fn` på alle elementene, maks `n` om gangen, og behold rekkefølgen. */
async function kart(liste, n, fn) {
  const ut = new Array(liste.length);
  let neste = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, liste.length) }, async () => {
      while (neste < liste.length) {
        const i = neste++;
        ut[i] = await fn(liste[i], i);
      }
    }),
  );
  return ut;
}

// ---------- språk ----------

/** Bokmålsteksten fra et Grep-tekstfelt. Feiler høyt hvis bokmål mangler. */
function nob(felt, hva) {
  const liste = Array.isArray(felt) ? felt : felt?.tekst;
  if (typeof felt === 'string') return felt;
  if (!Array.isArray(liste)) throw new Error(`Uventet tekstfelt for ${hva}: ${JSON.stringify(felt)}`);
  const treff = liste.find((t) => t.spraak === 'nob');
  if (!treff) throw new Error(`Mangler bokmål (nob) for ${hva}. Har: ${liste.map((t) => t.spraak).join(', ')}`);
  return treff.verdi;
}

function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normaliser tekst fra Udir: fjern punktum til slutt og overflødig mellomrom. */
function rydd(s) {
  return String(s).trim().replace(/\s+/g, ' ').replace(/\.$/, '');
}

// ---------- læreplanversjoner ----------

/**
 * Finn gjeldende versjon av hver læreplan fra lista over alle LK20-læreplaner.
 * Gjeldende = publisert, gyldig fra før i dag og ikke utgått. Hvis ingen er
 * gyldig ennå (ny versjon vedtatt, men ikke trådt i kraft), tas den nyeste.
 */
async function finnLaereplaner() {
  const alle = await get('laereplaner-lk20');
  const naa = new Date();
  const valgt = {};
  for (const fag of FAG) {
    const kandidater = alle
      .filter((lp) => lp.kode.startsWith(fag.laereplanprefiks + '-') && lp.status === STATUS_PUBLISERT)
      .map((lp) => ({ kode: lp.kode, fra: lp['gyldig-fra'] ? new Date(lp['gyldig-fra']) : null, til: lp['gyldig-til'] ? new Date(lp['gyldig-til']) : null }))
      .sort((a, b) => (b.fra?.getTime() ?? 0) - (a.fra?.getTime() ?? 0));
    if (!kandidater.length) throw new Error(`Fant ingen publisert læreplan for ${fag.key} (${fag.laereplanprefiks})`);
    const gyldig = kandidater.find((k) => (!k.fra || k.fra <= naa) && (!k.til || k.til >= naa));
    const lp = gyldig ?? kandidater[0];
    if (!gyldig) console.warn(`  ! ${fag.key}: ingen versjon er gyldig i dag, bruker nyeste (${lp.kode}, gyldig fra ${lp.fra?.toISOString().slice(0, 10)})`);
    valgt[fag.key] = { kode: lp.kode, gyldig_fra: lp.fra ? lp.fra.toISOString().slice(0, 10) : null };
  }
  return valgt;
}

// ---------- hoved ----------

async function main() {
  console.log('Finner gjeldende læreplanversjoner …');
  const laereplaner = await finnLaereplaner();
  for (const fag of FAG) console.log(`  ${fag.key.padEnd(5)} ${laereplaner[fag.key].kode}  gyldig fra ${laereplaner[fag.key].gyldig_fra}`);

  // 1) Kompetansemålsettene i grunnskolen (de som er "etter årstrinn" 1–10)
  console.log('Henter læreplaner og finner kompetansemålsett …');
  const sett = [];
  for (const fag of FAG) {
    const lp = laereplaner[fag.key].kode;
    const d = await get(`laereplaner-lk20/${lp}`);
    for (const s of d['kompetansemaal-kapittel']['kompetansemaalsett']) {
      const tittel = nob(s.tittel, `sett ${s.kode}`);
      const iTittel = tittel.match(/(\d+)\.\s*trinn/i);
      if (!iTittel) continue; // vg-sett o.l.
      sett.push({ fag: fag.key, laereplan: lp, kode: s.kode, trinn: Number(iTittel[1]) });
    }
  }

  // 2) Målene i hvert sett. Settet gir rekkefølgen (titlene der er bare på default-språket).
  console.log(`Henter ${sett.length} kompetansemålsett …`);
  const jobber = [];
  for (const s of await kart(sett, 8, async (x) => ({ ...x, data: await get(`kompetansemaalsett-lk20/${x.kode}`) }))) {
    const etter = (s.data['etter-aarstrinn'] ?? []).map((a) => Number(String(a.kode).replace(/\D/g, ''))).filter(Boolean);
    const trinnFraApi = etter.length ? Math.max(...etter) : null;
    // Tittelen er fasit. Udirs 'etter-aarstrinn' er feil for minst ett sett (KV1076, naturfag
    // etter 4. trinn, står som årstrinn 5), så avvik gir bare en advarsel.
    if (trinnFraApi && trinnFraApi !== s.trinn) console.warn(`  ! ${s.kode}: tittelen sier ${s.trinn}. trinn, Udirs etter-aarstrinn sier ${trinnFraApi}. Bruker tittelen.`);
    if (s.trinn > 10) continue;
    s.data.kompetansemaal.forEach((km, i) => jobber.push({ fag: s.fag, laereplan: s.laereplan, sett: s.kode, trinn: s.trinn, rekkefolge: i, kode: km.kode }));
  }

  // 3) Hvert mål for seg: bokmålstekst, bygger-paa, kjerneelementer, tverrfaglige temaer
  console.log(`Henter ${jobber.length} kompetansemål …`);
  let ferdig = 0;
  const raa = await kart(jobber, 12, async (j) => {
    const d = await get(`kompetansemaal-lk20/${j.kode}`);
    if (++ferdig % 100 === 0) console.log(`  ${ferdig}/${jobber.length}`);
    const koder = (felt) => (d[felt] ?? []).map((x) => x.referanse.kode);
    const forklaringNob = (d.forklaring ?? []).find((t) => t.spraak === 'nob')?.verdi;
    return {
      kode: j.kode,
      fag: j.fag,
      trinn: j.trinn,
      rekkefolge: j.rekkefolge,
      udir: rydd(nob(d.tittel, j.kode)),
      bygger_paa: koder('bygger-paa'),
      ke_koder: koder('tilknyttede-kjerneelementer'),
      tema_koder: koder('tilknyttede-tverrfaglige-temaer'),
      udir_forklaring: forklaringNob ? stripHtml(forklaringNob) : undefined,
      kompetansemaalsett: j.sett,
      laereplan: j.laereplan,
    };
  });

  // 4) Navn på kjerneelementer og tverrfaglige temaer på bokmål
  const keKoder = [...new Set(raa.flatMap((m) => m.ke_koder))].sort();
  const temaKoder = [...new Set(raa.flatMap((m) => m.tema_koder))].sort();
  console.log(`Henter ${keKoder.length} kjerneelementer og ${temaKoder.length} tverrfaglige temaer …`);
  const keNavn = Object.fromEntries(await kart(keKoder, 8, async (k) => [k, nob((await get(`kjerneelementer-lk20/${k}`)).tittel, k)]));
  const temaNavn = Object.fromEntries(await kart(temaKoder, 4, async (k) => [k, nob((await get(`tverrfaglige-temaer-lk20/${k}`)).tittel, k)]));

  // 5) Sett sammen, og fjern bygger-paa-koblinger som peker utenfor grunnskolen
  const alleKoder = new Set(raa.map((m) => m.kode));
  const utenfor = [];
  const fagIndeks = Object.fromEntries(FAG.map((f, i) => [f.key, i]));
  const maal = raa
    .map((m) => {
      const { ke_koder, tema_koder, ...rest } = m;
      const bygger = m.bygger_paa.filter((b) => {
        if (alleKoder.has(b)) return true;
        utenfor.push(`${m.kode} → ${b}`);
        return false;
      });
      const ut = { ...rest, bygger_paa: bygger, kjerneelementer: ke_koder.map((k) => keNavn[k]), tverrfaglige_temaer: tema_koder.map((k) => temaNavn[k]) };
      if (!ut.udir_forklaring) delete ut.udir_forklaring;
      return ut;
    })
    .sort((a, b) => fagIndeks[a.fag] - fagIndeks[b.fag] || a.trinn - b.trinn || a.rekkefolge - b.rekkefolge);

  const nyData = {
    kilde: 'https://data.udir.no/kl06/v201906 (NLOD)',
    laereplaner: Object.fromEntries(FAG.map((f) => [f.key, laereplaner[f.key]])),
    maal,
  };

  // 6) Endringsrapport mot forrige udir.json og mot forklaringene
  const gammel = existsSync(UDIR_FIL) ? JSON.parse(await readFile(UDIR_FIL, 'utf8')) : null;
  const forklaringer = existsSync(FORKLARINGER_FIL) ? JSON.parse(await readFile(FORKLARINGER_FIL, 'utf8')) : {};

  await mkdir(new URL('data/', ROT), { recursive: true });
  await writeFile(UDIR_FIL, JSON.stringify(nyData, null, 2) + '\n');

  const koblinger = maal.reduce((n, m) => n + m.bygger_paa.length, 0);
  console.log(`\nSkrev data/udir.json: ${maal.length} mål, ${koblinger} bygger-på-koblinger.`);
  const perFag = FAG.map((f) => `${f.key} ${maal.filter((m) => m.fag === f.key).length}`).join(', ');
  console.log(`Per fag: ${perFag}`);
  if (utenfor.length) console.log(`Koblinger utenfor grunnskolen (fjernet): ${utenfor.join(', ')}`);

  console.log('\n=== Endringsrapport ===');
  if (gammel?.maal) {
    const forrige = new Map(gammel.maal.map((m) => [m.kode, m]));
    const naa = new Map(maal.map((m) => [m.kode, m]));
    const nye = maal.filter((m) => !forrige.has(m.kode));
    const fjernet = gammel.maal.filter((m) => !naa.has(m.kode));
    const endret = maal.filter((m) => forrige.has(m.kode) && forrige.get(m.kode).udir !== m.udir);
    const versjoner = FAG.filter((f) => gammel.laereplaner?.[f.key]?.kode !== laereplaner[f.key].kode).map((f) => `${f.key}: ${gammel.laereplaner?.[f.key]?.kode ?? '–'} → ${laereplaner[f.key].kode}`);
    console.log(`Læreplanversjoner endret: ${versjoner.length ? versjoner.join(', ') : 'ingen'}`);
    console.log(`Nye mål (${nye.length}): ${nye.map((m) => m.kode).join(', ') || '–'}`);
    console.log(`Fjernede mål (${fjernet.length}): ${fjernet.map((m) => m.kode).join(', ') || '–'}`);
    console.log(`Endret Udir-tekst (${endret.length}):`);
    for (const m of endret) console.log(`  ${m.kode}\n    før: ${forrige.get(m.kode).udir}\n    nå:  ${m.udir}`);
  } else {
    console.log('Ingen tidligere udir.json å sammenligne med.');
  }
  const manglerForklaring = maal.filter((m) => !forklaringer[m.kode]?.forklaring).map((m) => m.kode);
  const forklaringUtenMaal = Object.keys(forklaringer).filter((k) => !alleKoder.has(k));
  console.log(`Mål som mangler forklaring (${manglerForklaring.length}): ${manglerForklaring.join(', ') || '–'}`);
  console.log(`Forklaringer uten mål (${forklaringUtenMaal.length}): ${forklaringUtenMaal.join(', ') || '–'}`);
}

main().catch((feil) => {
  console.error(feil);
  process.exit(1);
});
