// Engelskstigen: øv på engelsk nivå for nivå, litt som Duolingo, men uten streak,
// hjerter eller konto. Alt lagres i localStorage. Ingen rammeverk.
//
// Oppbygging: profil (navn og avatar) → kart med nivåer → nivåark → runde med
// ti oppgaver → oppsummering. Oppgavene lages fra data/engelsk.json når runden
// starter, med vekt på ord man har bommet på. Typen oppgave avhenger av hvor
// mange stjerner nivået har (flere stjerner, mer skriving) og av om man sliter
// akkurat nå (to feil på rad gir lettere oppgaver til det løsner).
import innhold from '../../data/engelsk.json';
import type { Niva, Setning } from '../lib/engelsk';

const NIVAER = (innhold as { nivaer: Niva[] }).nivaer;
const LAGER = 'engelskstigen.v1';
const RUNDE = 10;
const AVATARER = ['🦊', '🐼', '🐸', '🦄', '🐙', '🦖', '🐧', '🦋', '🐝', '🐨', '🦁', '🐬', '🐯', '🦉', '🐰', '🐢'];
const ROS = ['Riktig!', 'Bra!', 'Supert!', 'Flott!', 'Helt riktig!', 'Nydelig!', 'Du kan dette!'];

interface Maalinfo { url: string; forklaring: string; trinn: string }

interface Lagret {
  navn: string;
  avatar: string;
  poeng: number;
  nivaer: Record<string, { stjerner: number; runder: number }>;
  /** Per ord/setning: r riktige og f feil på første forsøk. */
  ting: Record<string, { r: number; f: number }>;
}

type Slag = 'ord' | 'setning' | 'fyll' | 'stav';
interface Kilde { slag: Slag; i: number }
type Sprak = 'en' | 'nb';
type Type = 'velg' | 'bygg' | 'skriv' | 'lytt' | 'lyttskriv';

interface Oppgave {
  id: string;
  kilde: Kilde;
  type: Type;
  instruks: string;
  /** Teksten som vises. Kan ha ___. */
  tekst?: string;
  /** Språket teksten er på. Engelsk får en høyttalerknapp. */
  sprak?: Sprak;
  /** Hjelpetekst under, som oversettelsen. */
  hint?: string;
  /** Det som leses opp i lytteoppgaver. */
  lytt?: string;
  valg?: string[];
  brikker?: string[];
  /** Riktig svar slik det vises. */
  riktig: string;
  /** Språket svaret (og svaralternativene) er på. */
  svarSprak: Sprak;
  /** Alle svar som godtas (før normalisering). */
  godtatt: string[];
  /** Ingen slingringsmonn for skrivefeil. */
  streng?: boolean;
  /** Hvor mange ganger denne har kommet tilbake i runden. */
  forsok: number;
}

// ---------- Små hjelpere ----------

type Barn = Node | string | null | undefined | false | Barn[];
type Attrs = Record<string, string | boolean | number | undefined>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...barn: Barn[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') e.className = String(v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  leggTil(e, barn);
  return e;
}
function leggTil(e: Node, barn: Barn[]): void {
  for (const b of barn) {
    if (b === null || b === undefined || b === false) continue;
    if (Array.isArray(b)) leggTil(e, b);
    else e.appendChild(typeof b === 'string' ? document.createTextNode(b) : b);
  }
}
function knapp(tekst: Barn, klikk: () => void, klasse = 'es-knapp', attrs: Attrs = {}): HTMLButtonElement {
  const b = el('button', { type: 'button', class: klasse, ...attrs }, tekst);
  b.addEventListener('click', klikk);
  return b;
}

function stokk<T>(liste: T[]): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function tilfeldig<T>(liste: T[]): T {
  return liste[Math.floor(Math.random() * liste.length)];
}
/** Trekker ett element etter vekt. */
function trekk<T>(liste: T[], vekt: (x: T) => number): T {
  const sum = liste.reduce((s, x) => s + vekt(x), 0);
  let r = Math.random() * sum;
  for (const x of liste) {
    r -= vekt(x);
    if (r <= 0) return x;
  }
  return liste[liste.length - 1];
}
/** Velger en nøkkel etter vekt: { velg: 30, bygg: 70 }. Nuller telles ikke. */
function velgEtterVekt<T extends string>(vekter: Partial<Record<T, number>>): T {
  const par = (Object.entries(vekter) as [T, number][]).filter(([, v]) => v > 0);
  return trekk(par, ([, v]) => v)[0];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[.,!?;:"«»()…]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
/** Levenshtein-avstand, til å godta én skrivefeil. */
function avstand(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let forrige = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const rad = [i];
    for (let j = 1; j <= n; j++) rad[j] = Math.min(forrige[j] + 1, rad[j - 1] + 1, forrige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    forrige = rad;
  }
  return forrige[n];
}
/** Delt i ord, uten tegnsetting (apostrofer beholdes: don't, o'clock). */
function brikkerAv(setning: string): string[] {
  return setning.replace(/[.,!?;:"«»()…]/g, '').split(/\s+/).filter(Boolean);
}

// ---------- Lagring ----------

function tomLagret(): Lagret {
  return { navn: '', avatar: AVATARER[0], poeng: 0, nivaer: {}, ting: {} };
}
function les(): Lagret {
  const ut = tomLagret();
  try {
    const raa = localStorage.getItem(LAGER);
    if (!raa) return ut;
    const d = JSON.parse(raa);
    if (typeof d.navn === 'string') ut.navn = d.navn.slice(0, 20);
    if (typeof d.avatar === 'string' && AVATARER.includes(d.avatar)) ut.avatar = d.avatar;
    if (typeof d.poeng === 'number' && d.poeng >= 0) ut.poeng = Math.floor(d.poeng);
    if (d.nivaer && typeof d.nivaer === 'object') {
      for (const [k, v] of Object.entries<any>(d.nivaer)) {
        if (v && typeof v.stjerner === 'number') ut.nivaer[k] = { stjerner: Math.max(0, Math.min(3, v.stjerner | 0)), runder: (v.runder | 0) || 0 };
      }
    }
    if (d.ting && typeof d.ting === 'object') {
      for (const [k, v] of Object.entries<any>(d.ting)) if (v && typeof v.r === 'number' && typeof v.f === 'number') ut.ting[k] = { r: v.r | 0, f: v.f | 0 };
    }
  } catch {
    /* ødelagt eller utilgjengelig lager: start på nytt */
  }
  return ut;
}
function lagre(d: Lagret): void {
  try {
    localStorage.setItem(LAGER, JSON.stringify(d));
  } catch {
    /* privat modus eller fullt lager: spillet virker likevel, bare uten minne */
  }
}

// ---------- Opplesing ----------

const kanLese = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
let stemme: SpeechSynthesisVoice | null = null;
let stemmerLastet = false;
function finnStemme(): void {
  if (!kanLese) return;
  const alle = speechSynthesis.getVoices();
  if (!alle.length) return;
  stemmerLastet = true;
  const en = alle.filter((v) => /^en([-_]|$)/i.test(v.lang));
  stemme = en.find((v) => /^en[-_]GB/i.test(v.lang)) ?? en.find((v) => v.default) ?? en[0] ?? null;
}
if (kanLese) {
  finnStemme();
  speechSynthesis.addEventListener('voiceschanged', finnStemme);
}
/** Om vi tør å lage lytteoppgaver: ja hvis det finnes en engelsk stemme, eller
 *  hvis stemmene ikke er lastet ennå (da prøver vi, og oppgaven kan hoppes over). */
function harStemme(): boolean {
  if (!kanLese) return false;
  if (!stemmerLastet) finnStemme();
  return !stemmerLastet || stemme !== null;
}
function si(tekst: string, sakte = false): void {
  if (!kanLese) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(tekst);
    if (!stemmerLastet) finnStemme();
    if (stemme) u.voice = stemme;
    u.lang = stemme?.lang || 'en-GB';
    u.rate = sakte ? 0.6 : 0.9;
    speechSynthesis.speak(u);
  } catch {
    /* ingen opplesing */
  }
}
function stille(): void {
  if (!kanLese) return;
  try {
    speechSynthesis.cancel();
  } catch {
    /* tomt */
  }
}
function horKnapp(tekst: string): HTMLElement | null {
  if (!kanLese) return null;
  return knapp('🔊', () => si(tekst), 'es-hor', { 'aria-label': 'Hør på engelsk', title: 'Hør på engelsk' });
}

// ---------- Oppgaver ----------

function idFor(niva: Niva, k: Kilde): string {
  return `${niva.slug}:${k.slag[0]}:${k.i}`;
}

function andre<T>(liste: T[], unntatt: number, antall: number): T[] {
  return stokk(liste.filter((_, i) => i !== unntatt)).slice(0, antall);
}

/** Setningsbrikker fra andre setninger i nivået som ikke er med i riktig svar. */
function lureBrikker(niva: Niva, s: Setning, antall: number): string[] {
  const iSvar = new Set([s.en, ...(s.alt ?? [])].flatMap((x) => brikkerAv(x).map((w) => norm(w))));
  const kandidater = new Map<string, string>();
  for (const x of stokk(niva.setninger)) for (const w of brikkerAv(x.en)) if (!iSvar.has(norm(w)) && !kandidater.has(norm(w))) kandidater.set(norm(w), w);
  return stokk([...kandidater.values()]).slice(0, antall);
}

interface Innstilling { stjerner: number; stotte: boolean; lytt: boolean }

function lagOppgave(niva: Niva, kilde: Kilde, inn: Innstilling, forsok = 0): Oppgave {
  const id = idFor(niva, kilde);
  const felles = { id, kilde, forsok };
  // Etter to bom i samme runde blir det alltid flervalg.
  const lett = inn.stotte || forsok >= 2;
  const s = inn.stjerner;
  const lytt = inn.lytt;

  if (kilde.slag === 'ord') {
    const o = niva.ord[kilde.i];
    type OrdType = 'velgEn' | 'velgNb' | 'lytt' | 'skriv';
    const type = velgEtterVekt<OrdType>(
      lett ? { velgEn: 45, velgNb: 35, lytt: lytt ? 20 : 0 }
        : s === 0 ? { velgEn: 35, velgNb: 25, lytt: lytt ? 25 : 0, skriv: 15 }
          : s === 1 ? { velgEn: 15, velgNb: 20, lytt: lytt ? 30 : 0, skriv: 35 }
            : { velgEn: 10, velgNb: 15, lytt: lytt ? 30 : 0, skriv: 45 },
    );
    if (type === 'velgEn') {
      const valg = o.valg ? stokk(o.valg) : stokk([o.nb, ...andre(niva.ord, kilde.i, 3).map((x) => x.nb)]);
      return { ...felles, type: 'velg', instruks: 'Hva betyr ordet?', tekst: o.en, sprak: 'en', lytt: o.en, valg, riktig: o.nb, svarSprak: 'nb', godtatt: [o.nb] };
    }
    if (type === 'velgNb') {
      const valg = stokk([o.en, ...andre(niva.ord, kilde.i, 3).map((x) => x.en)]);
      return { ...felles, type: 'velg', instruks: 'Hva heter dette på engelsk?', tekst: o.nb, sprak: 'nb', valg, riktig: o.en, svarSprak: 'en', godtatt: [o.en] };
    }
    if (type === 'lytt') {
      const valg = stokk([o.en, ...andre(niva.ord, kilde.i, 3).map((x) => x.en)]);
      return { ...felles, type: 'lytt', instruks: 'Trykk på det du hører', lytt: o.en, hint: `Betyr «${o.nb}».`, valg, riktig: o.en, svarSprak: 'en', godtatt: [o.en] };
    }
    return { ...felles, type: 'skriv', instruks: 'Skriv på engelsk', tekst: o.nb, sprak: 'nb', riktig: o.en, svarSprak: 'en', godtatt: [o.en, ...(o.alt ?? [])] };
  }

  if (kilde.slag === 'setning') {
    const x = niva.setninger[kilde.i];
    type SetningType = 'velgEn' | 'velgNb' | 'bygg' | 'lytt';
    const type = velgEtterVekt<SetningType>(
      lett ? { velgEn: 50, velgNb: 50 }
        : s === 0 ? { velgEn: 20, velgNb: 40, bygg: 40 }
          : s === 1 ? { velgEn: 10, velgNb: 15, bygg: 55, lytt: lytt ? 20 : 0 }
            : { velgEn: 5, velgNb: 10, bygg: 50, lytt: lytt ? 35 : 0 },
    );
    if (type === 'velgEn') {
      const valg = stokk([x.nb, ...andre(niva.setninger, kilde.i, 3).map((y) => y.nb)]);
      return { ...felles, type: 'velg', instruks: 'Hva betyr setningen?', tekst: x.en, sprak: 'en', lytt: x.en, valg, riktig: x.nb, svarSprak: 'nb', godtatt: [x.nb] };
    }
    if (type === 'velgNb') {
      const valg = stokk([x.en, ...andre(niva.setninger, kilde.i, 3).map((y) => y.en)]);
      return { ...felles, type: 'velg', instruks: 'Velg den engelske setningen', tekst: x.nb, sprak: 'nb', valg, riktig: x.en, svarSprak: 'en', godtatt: [x.en] };
    }
    if (type === 'lytt') {
      const valg = stokk([x.en, ...andre(niva.setninger, kilde.i, 3).map((y) => y.en)]);
      return { ...felles, type: 'lytt', instruks: 'Trykk på det du hører', lytt: x.en, hint: `Betyr «${x.nb}»`, valg, riktig: x.en, svarSprak: 'en', godtatt: [x.en] };
    }
    const egne = brikkerAv(x.en);
    const brikker = stokk([...egne, ...lureBrikker(niva, x, egne.length <= 4 ? 2 : 3)]);
    return { ...felles, type: 'bygg', instruks: 'Lag setningen på engelsk', tekst: x.nb, sprak: 'nb', brikker, riktig: x.en, svarSprak: 'en', godtatt: [x.en, ...(x.alt ?? [])] };
  }

  if (kilde.slag === 'fyll') {
    const f = (niva.fyll ?? [])[kilde.i];
    const skriv = !lett && Math.random() < (s === 0 ? 0 : s === 1 ? 0.5 : 0.8);
    if (skriv) return { ...felles, type: 'skriv', instruks: 'Skriv ordet som mangler', tekst: f.en, sprak: 'en', hint: f.nb, riktig: f.svar, svarSprak: 'en', godtatt: [f.svar, ...(f.alt ?? [])] };
    return { ...felles, type: 'velg', instruks: 'Velg ordet som mangler', tekst: f.en, sprak: 'en', hint: f.nb, valg: stokk(f.valg), riktig: f.svar, svarSprak: 'en', godtatt: [f.svar] };
  }

  // Staving: flervalg først, så «skriv det du hører» når nivået har stjerner.
  const t = (niva.stav ?? [])[kilde.i];
  const vilSkrive = !lett && Math.random() < (s === 0 ? 0 : s === 1 ? 0.5 : 0.8);
  if (vilSkrive && lytt) return { ...felles, type: 'lyttskriv', instruks: 'Skriv det du hører', lytt: t.en, hint: `Betyr «${t.nb}».`, riktig: t.en, svarSprak: 'en', godtatt: [t.en, ...(t.alt ?? [])], streng: true };
  if (vilSkrive) return { ...felles, type: 'skriv', instruks: 'Skriv på engelsk', tekst: t.nb, sprak: 'nb', riktig: t.en, svarSprak: 'en', godtatt: [t.en, ...(t.alt ?? [])], streng: true };
  const valg = stokk([t.en, ...stokk(t.feil).slice(0, 3)]);
  return { ...felles, type: 'velg', instruks: 'Hvilket ord er stavet riktig?', hint: `Ordet betyr «${t.nb}».`, valg, riktig: t.en, svarSprak: 'en', godtatt: [t.en], streng: true };
}

/** Velger hvilke ting runden skal ha med, med vekt på det man har bommet på. */
function velgKilder(niva: Niva, d: Lagret): Kilde[] {
  const antStav = (niva.stav ?? []).length;
  const antFyll = (niva.fyll ?? []).length;
  const plan: Record<Slag, number> = antStav
    ? { ord: 2, setning: 2, fyll: 2, stav: 4 }
    : antFyll >= 10
      ? { ord: 3, setning: 3, fyll: 4, stav: 0 }
      : antFyll
        ? { ord: 4, setning: 4, fyll: 2, stav: 0 }
        : { ord: 5, setning: 5, fyll: 0, stav: 0 };
  const lengde: Record<Slag, number> = { ord: niva.ord.length, setning: niva.setninger.length, fyll: antFyll, stav: antStav };
  const ut: Kilde[] = [];
  for (const slag of ['ord', 'setning', 'fyll', 'stav'] as Slag[]) {
    const kandidater: Kilde[] = Array.from({ length: lengde[slag] }, (_, i) => ({ slag, i }));
    for (let n = 0; n < plan[slag] && kandidater.length; n++) {
      const valgt = trekk(kandidater, (k) => {
        const st = d.ting[idFor(niva, k)];
        if (!st) return 1.5; // nytt: litt oftere
        return Math.max(0.25, 1 + 2 * st.f - 0.6 * st.r);
      });
      ut.push(valgt);
      kandidater.splice(kandidater.indexOf(valgt), 1);
    }
  }
  return stokk(ut).slice(0, RUNDE);
}

// ---------- Selve spillet ----------

export function startEngelsk(): void {
  const rot = document.getElementById('es-app');
  if (!rot) return;
  const app: HTMLElement = rot;
  const maalinfo: Record<string, Maalinfo> = JSON.parse(document.getElementById('es-maal')?.textContent || '{}');
  // Skjult live-område som leser opp resultatet for skjermlesere.
  const melding = el('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  app.insertAdjacentElement('beforebegin', melding);
  const maksStjerner = Number(app.dataset.stjerner || NIVAER.length * 3);
  let d = les();

  const stjerner = (n: Niva) => d.nivaer[n.slug]?.stjerner ?? 0;
  const laastOpp = (i: number) => i === 0 || stjerner(NIVAER[i - 1]) >= 1;
  const sumStjerner = () => NIVAER.reduce((s, n) => s + stjerner(n), 0);

  function vis(...barn: Barn[]): void {
    stille();
    app.replaceChildren();
    leggTil(app, barn);
    const topp = app.getBoundingClientRect().top + window.scrollY - 16;
    if (window.scrollY > topp) window.scrollTo({ top: topp });
  }
  function fokus(e: HTMLElement | null): void {
    if (!e) return;
    if (!e.hasAttribute('tabindex') && !/^(input|button|a|select|textarea)$/i.test(e.tagName)) e.setAttribute('tabindex', '-1');
    e.focus({ preventScroll: true });
  }

  // ----- Profil -----
  function visProfil(forsteGang: boolean): void {
    let avatar = d.avatar;
    const feil = el('p', { class: 'es-feil', role: 'alert', hidden: true });
    const navnInput = el('input', { type: 'text', id: 'es-navn', maxlength: 20, autocomplete: 'off', placeholder: 'Skriv navnet ditt', value: d.navn, class: 'es-input' });
    const avatarer = el('div', { class: 'es-avatarer', role: 'radiogroup', 'aria-label': 'Velg avatar' });
    const oppdaterValgt = () => {
      for (const b of avatarer.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.a === avatar));
    };
    for (const a of AVATARER) {
      const b = knapp(a, () => { avatar = a; oppdaterValgt(); }, 'es-avatarvalg', { role: 'radio', 'data-a': a, 'aria-label': `Avatar ${a}` });
      avatarer.appendChild(b);
    }
    oppdaterValgt();
    const skjema = el('form', { class: 'es-profil' },
      el('h3', {}, forsteGang ? 'Hvem spiller?' : 'Endre navn og avatar'),
      el('label', { for: 'es-navn' }, 'Navnet ditt'),
      navnInput,
      el('p', { class: 'es-ledetekst' }, 'Velg avatar'),
      avatarer,
      feil,
      el('div', { class: 'es-knapper' },
        el('button', { type: 'submit', class: 'es-knapp primar' }, forsteGang ? 'Start!' : 'Lagre'),
        !forsteGang && knapp('Avbryt', () => visKart()),
      ),
      !forsteGang && el('p', { class: 'es-nullstill' }, knapp('Nullstill alt og start på nytt', () => {
        if (confirm('Slette navn, poeng og alle stjerner? Dette kan ikke angres.')) {
          d = tomLagret();
          try { localStorage.removeItem(LAGER); } catch { /* tomt */ }
          visProfil(true);
        }
      }, 'es-lenkeknapp')),
    );
    skjema.addEventListener('submit', (e) => {
      e.preventDefault();
      const navn = navnInput.value.trim().slice(0, 20);
      if (!navn) {
        feil.textContent = 'Skriv et navn først.';
        feil.hidden = false;
        navnInput.focus();
        return;
      }
      d.navn = navn;
      d.avatar = avatar;
      lagre(d);
      visKart();
    });
    vis(skjema);
    fokus(navnInput);
  }

  // ----- Topplinje og stjerner -----
  function topp(): HTMLElement {
    return el('div', { class: 'es-topp' },
      el('span', { class: 'es-avatar', 'aria-hidden': 'true' }, d.avatar),
      el('span', { class: 'es-hvem' }, el('b', {}, d.navn), el('span', { class: 'es-poeng' }, `${d.poeng} poeng · ${sumStjerner()} av ${maksStjerner} stjerner`)),
      knapp('Endre', () => visProfil(false), 'es-knapp liten', { 'aria-label': 'Endre navn og avatar' }),
    );
  }
  function stjernerTekst(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }
  function stjernerEl(n: number, stor = false): HTMLElement {
    return el('span', { class: stor ? 'es-stjerner stor' : 'es-stjerner', role: 'img', 'aria-label': `${n} av 3 stjerner` }, stjernerTekst(n));
  }

  // ----- Kart -----
  function visKart(): void {
    const liste = el('ol', { class: 'es-kart', 'aria-label': 'Nivåene' });
    NIVAER.forEach((n, i) => {
      const aapen = laastOpp(i);
      const st = stjerner(n);
      const li = el('li', { class: `es-niva${aapen ? '' : ' laast'}${st === 3 ? ' ferdig' : ''}` });
      const rund = el('span', { class: 'es-rund', 'aria-hidden': 'true' }, aapen ? n.emoji : '🔒');
      const tekst = el('span', { class: 'es-nivatekst' },
        el('b', {}, `${i + 1}. ${n.navn}`),
        el('span', { class: 'es-om' }, aapen ? n.om : `Fullfør «${NIVAER[i - 1].navn}» først.`),
        aapen && stjernerEl(st),
      );
      if (aapen) li.appendChild(knapp([rund, tekst], () => visNiva(i), 'es-nivaknapp'));
      else li.append(rund, tekst);
      liste.appendChild(li);
    });
    vis(topp(), liste);
    fokus(app.querySelector<HTMLElement>('.es-topp b'));
  }

  // ----- Nivåark -----
  function visNiva(i: number): void {
    const n = NIVAER[i];
    const m = maalinfo[n.kode];
    const st = stjerner(n);
    const ordliste = el('details', { class: 'es-ordliste' },
      el('summary', {}, `Ordene i nivået (${n.ord.length})`),
      el('ul', {}, n.ord.map((o) => el('li', {}, el('span', { lang: 'en' }, o.en), ' – ', o.nb, ' ', horKnapp(o.en)))),
    );
    const ark = el('div', { class: 'es-ark' },
      el('p', { class: 'es-tilbakelenke' }, knapp('← Alle nivåer', () => visKart(), 'es-lenkeknapp')),
      el('div', { class: 'es-arkhode' },
        el('span', { class: 'es-rund stor', 'aria-hidden': 'true' }, n.emoji),
        el('div', {}, el('h3', {}, `${i + 1}. ${n.navn}`), el('p', { class: 'es-om' }, n.om), stjernerEl(st)),
      ),
      m && el('p', { class: 'es-maalref' }, 'Øver på ', el('a', { href: m.url }, n.kode), ` (${m.trinn}): ${m.forklaring}`),
      el('p', { class: 'es-om' },
        st === 0
          ? 'Fullfør en runde for å få den første stjernen og låse opp neste nivå.'
          : st < 3
            ? 'Åtte riktige på første forsøk gir to stjerner, alle ti gir tre. Oppgavene blir litt vanskeligere for hver stjerne.'
            : 'Tre stjerner! Spill gjerne igjen for flere poeng.',
      ),
      el('div', { class: 'es-knapper' }, knapp('Start runde', () => startRunde(i), 'es-knapp primar stor')),
      ordliste,
    );
    vis(topp(), ark);
    fokus(ark.querySelector('h3'));
  }

  // ----- Runde -----
  interface Status { ferdig: number; riktigForste: number; poeng: number; paaRad: number; feilPaaRad: number; bommet: Set<string> }

  function startRunde(i: number): void {
    const n = NIVAER[i];
    const inn: Innstilling = { stjerner: stjerner(n), stotte: false, lytt: harStemme() };
    const ko: Oppgave[] = velgKilder(n, d).map((k) => lagOppgave(n, k, inn));
    const status: Status = { ferdig: 0, riktigForste: 0, poeng: 0, paaRad: 0, feilPaaRad: 0, bommet: new Set() };
    const antall = ko.length;

    function neste(): void {
      if (!ko.length) return visFerdig(i, status, antall);
      visOppgave(ko[0]);
    }

    /** Riktig svar gir tilbake det som ble godtatt, ellers null. `stavefeil` hvis nesten riktig. */
    function sjekk(o: Oppgave, gitt: string): { tekst: string; stavefeil: boolean } | null {
      const g = norm(gitt);
      if (!g) return null;
      for (const ok of o.godtatt) if (norm(ok) === g) return { tekst: ok, stavefeil: false };
      if (o.streng || o.type !== 'skriv') return null;
      for (const ok of o.godtatt) {
        const n2 = norm(ok);
        if (n2.length >= 5 && avstand(n2, g) === 1) return { tekst: ok, stavefeil: true };
      }
      return null;
    }

    function svar(o: Oppgave, gitt: string): void {
      ko.shift();
      const rettet = sjekk(o, gitt);
      const forsteGang = !status.bommet.has(o.id);
      const st = d.ting[o.id] ?? { r: 0, f: 0 };
      if (rettet) {
        status.ferdig++;
        status.paaRad++;
        status.feilPaaRad = 0;
        const p = forsteGang ? 10 : 5;
        status.poeng += p;
        d.poeng += p;
        if (forsteGang) {
          status.riktigForste++;
          d.ting[o.id] = { r: st.r + 1, f: st.f };
        }
        if (status.paaRad >= 2) inn.stotte = false;
      } else {
        status.paaRad = 0;
        status.feilPaaRad++;
        if (forsteGang) d.ting[o.id] = { r: st.r, f: st.f + 1 };
        status.bommet.add(o.id);
        if (status.feilPaaRad >= 2) inn.stotte = true;
        if (o.forsok >= 2) status.ferdig++; // tredje bom: går videre uten poeng
        else ko.push(lagOppgave(n, o.kilde, inn, o.forsok + 1));
      }
      lagre(d);
      visTilbakemelding(o, rettet);
    }

    function rundeHode(): HTMLElement {
      const pst = Math.round((status.ferdig / antall) * 100);
      return el('div', { class: 'es-rundehode' },
        knapp('✕', () => { if (confirm('Avslutte runden? Poengene du har fått så langt beholder du.')) visNiva(i); }, 'es-lukk', { 'aria-label': 'Avslutt runden' }),
        el('div', { class: 'es-framdrift', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': antall, 'aria-valuenow': status.ferdig, 'aria-label': 'Framdrift i runden' }, el('span', { style: `width:${pst}%` })),
        el('span', { class: 'es-rundepoeng' }, `+${status.poeng}`),
      );
    }

    function visOppgave(o: Oppgave): void {
      const lytter = o.type === 'lytt' || o.type === 'lyttskriv';
      const boks = el('div', { class: `es-oppgave type-${o.type}` });
      boks.appendChild(el('h3', { class: 'es-instruks' }, o.instruks));
      if (o.tekst !== undefined) boks.appendChild(el('p', { class: 'es-tekst', lang: o.sprak }, o.sprak === 'en' && o.lytt ? horKnapp(o.lytt) : null, ' ', o.tekst));
      if (lytter) {
        boks.appendChild(el('div', { class: 'es-lyd' },
          knapp('🔊', () => si(o.lytt!), 'es-hor stor', { 'aria-label': 'Hør igjen' }),
          knapp('🐢', () => si(o.lytt!, true), 'es-hor stor', { 'aria-label': 'Hør sakte' }),
        ));
      } else if (o.hint) {
        boks.appendChild(el('p', { class: 'es-hint' }, o.hint));
      }

      if (o.type === 'velg' || o.type === 'lytt') {
        boks.appendChild(el('div', { class: 'es-valg' }, o.valg!.map((v) => {
          const b = knapp(v, () => { b.classList.add('valgt'); svar(o, v); }, 'es-valgknapp', { lang: o.svarSprak });
          return b;
        })));
      } else if (o.type === 'bygg') {
        const svarrad = el('div', { class: 'es-svarrad', role: 'group', 'aria-label': 'Setningen din', lang: 'en' });
        const bank = el('div', { class: 'es-brikker', role: 'group', 'aria-label': 'Ordbrikker', lang: 'en' });
        const sjekkKnapp = el('button', { type: 'button', class: 'es-knapp primar', disabled: true }, 'Sjekk');
        const oppdater = () => { sjekkKnapp.disabled = svarrad.children.length === 0; };
        for (const w of o.brikker!) {
          const b = knapp(w, () => {
            (b.parentElement === bank ? svarrad : bank).appendChild(b);
            oppdater();
          }, 'es-brikke');
          bank.appendChild(b);
        }
        sjekkKnapp.addEventListener('click', () => svar(o, [...svarrad.children].map((b) => b.textContent ?? '').join(' ')));
        boks.append(svarrad, bank, el('div', { class: 'es-knapper' }, sjekkKnapp));
      } else {
        const input = el('input', { type: 'text', class: 'es-input', lang: 'en', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': o.instruks });
        const skjema = el('form', { class: 'es-skriv' }, input, el('div', { class: 'es-knapper' }, el('button', { type: 'submit', class: 'es-knapp primar' }, 'Sjekk')));
        skjema.addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) svar(o, input.value); });
        boks.appendChild(skjema);
      }
      if (lytter) {
        boks.appendChild(el('p', { class: 'es-hopp' }, knapp('Kan ikke høre nå', () => {
          // Bytt til en oppgave uten lyd for samme ord, uten at det teller som feil.
          inn.lytt = false;
          ko[0] = lagOppgave(n, o.kilde, inn, o.forsok);
          visOppgave(ko[0]);
        }, 'es-lenkeknapp')));
      }
      vis(rundeHode(), boks);
      if (lytter) si(o.lytt!);
      fokus(boks.querySelector<HTMLElement>('input') ?? boks.querySelector<HTMLElement>('.es-instruks'));
    }

    function visTilbakemelding(o: Oppgave, rettet: { tekst: string; stavefeil: boolean } | null): void {
      const lytter = o.type === 'lytt' || o.type === 'lyttskriv';
      const panel = el('div', { class: `es-tilbake ${rettet ? 'riktig' : 'feil'}`, role: 'status' });
      const fasit = () => el('p', { class: 'es-fasit', lang: o.svarSprak }, o.riktig, ' ', o.svarSprak === 'en' ? horKnapp(o.riktig) : null);
      if (rettet) {
        panel.appendChild(el('p', { class: 'es-ros' }, rettet.stavefeil ? 'Riktig, men sjekk stavingen:' : tilfeldig(ROS)));
        if (rettet.stavefeil || o.type !== 'velg') panel.appendChild(fasit());
        if (lytter && o.hint) panel.appendChild(el('p', { class: 'es-hint' }, o.hint));
      } else {
        panel.appendChild(el('p', { class: 'es-ros' }, o.forsok >= 2 ? 'Vi går videre. Riktig svar:' : 'Ikke helt. Riktig svar:'));
        panel.appendChild(fasit());
        if (lytter && o.hint) panel.appendChild(el('p', { class: 'es-hint' }, o.hint));
        if (o.forsok < 2) panel.appendChild(el('p', { class: 'es-hint' }, 'Den kommer tilbake senere i runden.'));
      }
      const videre = knapp('Fortsett', () => neste(), 'es-knapp primar stor');
      panel.appendChild(el('div', { class: 'es-knapper' }, videre));
      // Oppgaven blir stående, låst, med panelet under.
      const oppg = app.querySelector('.es-oppgave');
      if (oppg) {
        for (const b of oppg.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')) if (!b.classList.contains('es-hor')) b.disabled = true;
        oppg.querySelector('.es-hopp')?.remove();
        // Vis hva som var riktig, og hva som ble valgt.
        for (const b of oppg.querySelectorAll('.es-valgknapp')) {
          if (b.textContent === o.riktig) b.classList.add('riktigvalg');
          else if (b.classList.contains('valgt')) b.classList.add('feilvalg');
        }
        oppg.querySelector('.es-svarrad')?.classList.add(rettet ? 'riktigvalg' : 'feilvalg');
        oppg.querySelector('input')?.classList.add(rettet ? 'riktigvalg' : 'feilvalg');
      }
      melding.textContent = rettet ? `${rettet.stavefeil ? 'Nesten riktig staving' : 'Riktig'}. ${o.riktig}` : `Feil. Riktig svar: ${o.riktig}`;
      app.querySelector('.es-rundehode')?.replaceWith(rundeHode());
      app.appendChild(panel);
      fokus(videre);
    }

    neste();
  }

  // ----- Oppsummering -----
  function visFerdig(i: number, status: Status, antall: number): void {
    const n = NIVAER[i];
    const opptjent = status.riktigForste >= antall ? 3 : status.riktigForste >= 8 ? 2 : 1;
    const forr = stjerner(n);
    const naa = Math.max(forr, opptjent);
    const bonus = 20 + (opptjent === 3 ? 30 : 0);
    d.poeng += bonus;
    d.nivaer[n.slug] = { stjerner: naa, runder: (d.nivaer[n.slug]?.runder ?? 0) + 1 };
    lagre(d);
    const nye = naa - forr;
    const nesteFinnes = i + 1 < NIVAER.length;
    const forsteTekst = naa === 1 ? 'Første stjerne!' : naa === 2 ? 'To stjerner med én gang!' : 'Tre stjerner med én gang!';
    const tekst = nye > 0
      ? forr === 0
        ? nesteFinnes ? `${forsteTekst} Nivå ${i + 2}, «${NIVAER[i + 1].navn}», er låst opp.` : `${forsteTekst} Det var det siste nivået.`
        : `${nye === 1 ? 'Ny stjerne' : 'To nye stjerner'} på «${n.navn}»!`
      : naa === 3
        ? 'Du har allerede tre stjerner her. Bra jobba!'
        : `Spill igjen med ${naa === 1 ? 'åtte' : 'ti'} riktige på første forsøk for neste stjerne.`;
    const boks = el('div', { class: 'es-ferdig' },
      el('p', { class: 'es-storavatar', 'aria-hidden': 'true' }, d.avatar),
      el('h3', {}, opptjent === 3 ? 'Perfekt runde!' : 'Runde ferdig!'),
      el('p', { class: 'es-tall' }, `${status.riktigForste} av ${antall} riktige på første forsøk.`),
      el('p', { class: 'es-tall' }, `+${status.poeng + bonus} poeng`, el('span', { class: 'es-hint' }, ` (${status.poeng} for svarene og ${bonus} i bonus)`)),
      stjernerEl(naa, true),
      el('p', { class: 'es-om' }, tekst),
      el('div', { class: 'es-knapper' },
        nesteFinnes && laastOpp(i + 1) && knapp(`Neste: ${NIVAER[i + 1].navn} →`, () => visNiva(i + 1), 'es-knapp primar'),
        knapp('Spill igjen', () => startRunde(i)),
        knapp('Alle nivåer', () => visKart()),
      ),
    );
    vis(topp(), boks);
    fokus(boks.querySelector('h3'));
  }

  if (d.navn) visKart();
  else visProfil(true);
}
