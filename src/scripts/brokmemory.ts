// Brøkmemory: finn to kort som viser samme brøk på ulike måter. Alt skjer på
// klientsiden. Valgene legges i adressen, så en lenke med valgene kan deles.

type Type = 'tall' | 'ord' | 'sirkel' | 'rektangel' | 'tallinje' | 'prikker';
type Niva = 'lett' | 'middels' | 'vanskelig';

interface Kort {
  par: number;
  type: Type;
  a: number; // teller
  b: number; // nevner
}

const TYPER: Type[] = ['tall', 'ord', 'sirkel', 'rektangel', 'tallinje', 'prikker'];
const STANDARD_TYPER: Type[] = ['tall', 'ord', 'sirkel', 'rektangel'];

// Brøkene trekkes fra alle forkortede ekte brøker med disse nevnerne, så to par
// aldri har samme verdi. På vanskelig utvides det ene kortet, f.eks. 1/2 → 3/6.
const NIVAER: Record<Niva, { navn: string; nevnere: number[]; par: number; utvid: boolean }> = {
  lett: { navn: 'Lett', nevnere: [2, 3, 4, 5], par: 6, utvid: false },
  middels: { navn: 'Middels', nevnere: [2, 3, 4, 5, 6, 8, 10], par: 8, utvid: false },
  vanskelig: { navn: 'Vanskelig', nevnere: [2, 3, 4, 5, 6], par: 10, utvid: true },
};
const MAKS_NEVNER = 12;

const TALLORD = ['null', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti', 'elleve'];
const DELER: Record<number, string> = {
  3: 'tredjedel', 4: 'fjerdedel', 5: 'femtedel', 6: 'sjettedel', 7: 'sjuendedel', 8: 'åttendedel',
  9: 'niendedel', 10: 'tidel', 11: 'ellevtedel', 12: 'tolvtedel',
};

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);

function stokk<T>(liste: T[]): T[] {
  const l = [...liste];
  for (let i = l.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

function iOrd(a: number, b: number): string {
  if (b === 2) return a === 1 ? 'en halv' : `${TALLORD[a]} halve`;
  return `${TALLORD[a]} ${DELER[b]}${a === 1 ? '' : 'er'}`;
}

// ---- Kortflater ----

const svg = (viewBox: string, innhold: string) =>
  `<svg viewBox="${viewBox}" aria-hidden="true" focusable="false">${innhold}</svg>`;

function sirkel(a: number, b: number): string {
  const r = 46;
  const punkt = (i: number) => {
    const v = (i / b) * 2 * Math.PI - Math.PI / 2;
    return `${(50 + r * Math.cos(v)).toFixed(2)} ${(50 + r * Math.sin(v)).toFixed(2)}`;
  };
  let biter = '';
  for (let i = 0; i < b; i++) {
    biter += `<path class="${i < a ? 'bm-fylt' : 'bm-tom'}" d="M50 50 L${punkt(i)} A${r} ${r} 0 0 1 ${punkt(i + 1)} Z"/>`;
  }
  return svg('0 0 100 100', biter);
}

function rektangel(a: number, b: number): string {
  const w = 96 / b;
  let biter = '';
  for (let i = 0; i < b; i++) {
    biter += `<rect class="${i < a ? 'bm-fylt' : 'bm-tom'}" x="${(2 + i * w).toFixed(2)}" y="2" width="${w.toFixed(2)}" height="40"/>`;
  }
  return svg('0 0 100 44', biter);
}

function tallinje(a: number, b: number): string {
  const x = (i: number) => (6 + (88 * i) / b).toFixed(2);
  let streker = '';
  for (let i = 0; i <= b; i++) {
    const endepunkt = i === 0 || i === b;
    streker += `<line class="bm-strek" x1="${x(i)}" x2="${x(i)}" y1="${endepunkt ? 13 : 16}" y2="${endepunkt ? 31 : 28}"/>`;
  }
  return svg(
    '0 8 100 42',
    `<line class="bm-strek" x1="6" x2="94" y1="22" y2="22"/>${streker}` +
      `<text x="6" y="46">0</text><text x="94" y="46">1</text>` +
      `<circle class="bm-fylt bm-punkt" cx="${x(a)}" cy="22" r="5"/>`,
  );
}

function prikker(a: number, b: number): string {
  const kol = b <= 4 ? b : Math.ceil(b / 2);
  const rader = Math.ceil(b / kol);
  let p = '';
  for (let i = 0; i < b; i++) {
    const cx = 12 + (i % kol) * 22;
    const cy = 12 + Math.floor(i / kol) * 22;
    p += `<circle class="${i < a ? 'bm-fylt' : 'bm-tom'}" cx="${cx}" cy="${cy}" r="8.5"/>`;
  }
  return svg(`0 0 ${kol * 22 + 2} ${rader * 22 + 2}`, p);
}

function flate(k: Kort): string {
  switch (k.type) {
    case 'tall': return `<span class="bm-tall"><span>${k.a}</span><span>${k.b}</span></span>`;
    // Myk bindestrek, så lange ord deles som «fjerde-deler» på smale kort.
    case 'ord': return `<span class="bm-ord">${iOrd(k.a, k.b).replace(/del(er)?$/, '\u00addel$1')}</span>`;
    case 'sirkel': return sirkel(k.a, k.b);
    case 'rektangel': return rektangel(k.a, k.b);
    case 'tallinje': return tallinje(k.a, k.b);
    case 'prikker': return prikker(k.a, k.b);
  }
}

/** Tekst til skjermleser. Sier hva kortet viser, uten å regne det ut. */
function beskriv(k: Kort): string {
  switch (k.type) {
    case 'tall': return `tall: ${k.a} over brøkstreken, ${k.b} under`;
    case 'ord': return `ord: ${iOrd(k.a, k.b)}`;
    case 'sirkel': return `sirkel delt i ${k.b} like biter, ${k.a} er fargelagt`;
    case 'rektangel': return `rektangel delt i ${k.b} like biter, ${k.a} er fargelagt`;
    case 'tallinje': return `tallinje fra 0 til 1 delt i ${k.b} like deler, punktet står på strek ${k.a} etter 0`;
    case 'prikker': return `${k.a} av ${k.b} prikker er fylt`;
  }
}

// ---- Stokke ut ----

function lagKort(niva: Niva, typer: Type[]): Kort[] {
  const n = NIVAER[niva];
  const alle: [number, number][] = [];
  for (const b of n.nevnere) for (let a = 1; a < b; a++) if (gcd(a, b) === 1) alle.push([a, b]);
  const valgt = stokk(alle).slice(0, n.par);

  // Alle par av ulike fremstillinger, fordelt jevnt. Med én type blir begge like.
  const kombinasjoner: [Type, Type][] = [];
  for (let i = 0; i < typer.length; i++) for (let j = i + 1; j < typer.length; j++) kombinasjoner.push([typer[i], typer[j]]);
  if (!kombinasjoner.length) kombinasjoner.push([typer[0], typer[0]]);
  let kombi: [Type, Type][] = [];

  const kort: Kort[] = [];
  valgt.forEach(([a, b], par) => {
    if (!kombi.length) kombi = stokk(kombinasjoner);
    const [t1, t2] = stokk(kombi.pop()!);
    let [a2, b2] = [a, b];
    if (n.utvid) {
      const faktorer = [2, 3, 4, 5, 6].filter((f) => b * f <= MAKS_NEVNER);
      const f = faktorer[Math.floor(Math.random() * faktorer.length)];
      [a2, b2] = [a * f, b * f];
    }
    kort.push({ par, type: t1, a, b }, { par, type: t2, a: a2, b: b2 });
  });
  return stokk(kort);
}

// ---- Spillet ----

export function startBrokmemory(): void {
  const form = document.getElementById('bm-valg') as HTMLFormElement | null;
  const brett = document.getElementById('bm-brett');
  const status = document.getElementById('bm-status');
  const melding = document.getElementById('bm-melding');
  const feil = document.getElementById('bm-feil');
  const utskrift = document.getElementById('bm-utskrift');
  const skrivUt = document.getElementById('bm-skriv-ut');
  const seksjon = form?.closest('section');
  if (!form || !seksjon || !brett || !status || !melding || !feil || !utskrift || !skrivUt) return;

  let kort: Kort[] = [];
  let knapper: HTMLButtonElement[] = [];
  let oppe: number[] = [];
  let funnet = new Set<number>();
  // Hvem som fant hvert par (0 eller 1), så kortene får fargen til spilleren.
  let finner = new Map<number, number>();
  let forsok = 0;
  let spillere = 1;
  let tur = 0;
  let poeng = [0, 0];
  let snuTimer: number | undefined;
  let niva: Niva = 'lett';

  // Valg fra adressen, f.eks. ?niva=middels&vis=tall,ord,sirkel&spillere=2
  const q = new URLSearchParams(location.search);
  const qNiva = q.get('niva');
  if (qNiva && qNiva in NIVAER) (form.querySelector(`input[name="niva"][value="${qNiva}"]`) as HTMLInputElement).checked = true;
  const qVis = q.get('vis')?.split(',').filter((t): t is Type => TYPER.includes(t as Type));
  if (qVis?.length) for (const el of form.querySelectorAll<HTMLInputElement>('input[name="vis"]')) el.checked = qVis.includes(el.value as Type);
  if (q.get('spillere') === '2') (form.querySelector('input[name="spillere"][value="2"]') as HTMLInputElement).checked = true;

  function lesValg() {
    const data = new FormData(form!);
    return {
      niva: (data.get('niva') as Niva) || 'lett',
      typer: data.getAll('vis') as Type[],
      spillere: data.get('spillere') === '2' ? 2 : 1,
    };
  }

  function lagreValg(v: ReturnType<typeof lesValg>) {
    const p = new URLSearchParams();
    if (v.niva !== 'lett') p.set('niva', v.niva);
    if (v.typer.join() !== STANDARD_TYPER.join()) p.set('vis', v.typer.join(','));
    if (v.spillere === 2) p.set('spillere', '2');
    const s = p.toString();
    history.replaceState(null, '', s ? `?${s}` : location.pathname);
  }

  function visStatus() {
    const antallPar = kort.length / 2;
    const ferdig = funnet.size === antallPar;
    if (spillere === 1) {
      status!.textContent = ferdig
        ? `Ferdig! Du fant alle ${antallPar} parene på ${forsok} forsøk.`
        : `Par funnet: ${funnet.size} av ${antallPar}. Forsøk: ${forsok}.`;
    } else if (ferdig) {
      const [p1, p2] = poeng;
      status!.textContent = p1 === p2 ? `Uavgjort! Begge fant ${p1} par.` : `Spiller ${p1 > p2 ? 1 : 2} vant med ${Math.max(p1, p2)} par mot ${Math.min(p1, p2)}!`;
    } else {
      status!.innerHTML = `<b>Spiller ${tur + 1} sin tur.</b> <span class="bm-s1">Spiller 1: ${poeng[0]} par.</span> <span class="bm-s2">Spiller 2: ${poeng[1]} par.</span>`;
    }
    status!.classList.toggle('ferdig', ferdig);
    // Oransje for spiller 1, lilla for spiller 2. Settes på seksjonen, så både status og brett får fargen.
    if (spillere === 2 && !ferdig) seksjon!.dataset.tur = String(tur + 1);
    else delete seksjon!.dataset.tur;
  }

  function oppdaterKnapp(i: number) {
    const k = kort[i];
    const knapp = knapper[i];
    const vises = oppe.includes(i) || funnet.has(k.par);
    knapp.classList.toggle('snudd', vises);
    knapp.classList.toggle('funnet', funnet.has(k.par));
    if (spillere === 2 && finner.has(k.par)) knapp.dataset.spiller = String(finner.get(k.par)! + 1);
    else delete knapp.dataset.spiller;
    knapp.setAttribute('aria-disabled', String(vises));
    knapp.setAttribute('aria-label', `Kort ${i + 1}: ${vises ? beskriv(k) : 'skjult'}${funnet.has(k.par) ? ', par funnet' : ''}`);
  }

  function snuTilbake() {
    clearTimeout(snuTimer);
    snuTimer = undefined;
    const ned = oppe;
    oppe = [];
    ned.forEach(oppdaterKnapp);
  }

  function snu(i: number) {
    if (snuTimer !== undefined) snuTilbake();
    if (oppe.includes(i) || funnet.has(kort[i].par) || oppe.length >= 2) return;
    oppe.push(i);
    oppdaterKnapp(i);
    if (oppe.length < 2) {
      melding!.textContent = beskriv(kort[i]);
      return;
    }
    forsok++;
    const [x, y] = oppe.map((j) => kort[j]);
    if (x.par === y.par) {
      funnet.add(x.par);
      finner.set(x.par, tur);
      poeng[tur]++;
      oppe = [];
      knapper.forEach((_, j) => oppdaterKnapp(j));
      melding!.textContent = `${beskriv(y)}. Par! Begge er ${iOrd(x.a / gcd(x.a, x.b), x.b / gcd(x.a, x.b))}.`;
      if (spillere === 2 && funnet.size < kort.length / 2) melding!.textContent += ` Spiller ${tur + 1} får en tur til.`;
    } else {
      melding!.textContent = `${beskriv(y)}. Ikke par.`;
      if (spillere === 2) {
        tur = 1 - tur;
        melding!.textContent += ` Spiller ${tur + 1} sin tur.`;
      }
      snuTimer = window.setTimeout(snuTilbake, 1600);
    }
    visStatus();
  }

  function tegnUtskrift() {
    utskrift!.innerHTML =
      `<p class="bm-utskrift-topp">${NIVAER[niva].navn} brøkmemory fra kompetansemål.no. Klipp langs linjene og stokk kortene.</p>` +
      `<ol>${kort.map((k) => `<li class="bm-flate bm-vis-${k.type}">${flate(k)}</li>`).join('')}</ol>`;
  }

  function nyttSpill(): boolean {
    const v = lesValg();
    const min = v.niva === 'vanskelig' ? 1 : 2;
    if (v.typer.length < min) {
      feil!.textContent = v.niva === 'vanskelig' ? 'Velg minst én ting kortene skal vise.' : 'Velg minst to ting kortene skal vise, så parene blir ulike. (På vanskelig holder én.)';
      feil!.hidden = false;
      return false;
    }
    feil!.hidden = true;
    lagreValg(v);
    clearTimeout(snuTimer);
    snuTimer = undefined;
    niva = v.niva;
    spillere = v.spillere;
    kort = lagKort(v.niva, v.typer);
    oppe = [];
    funnet = new Set();
    finner = new Map();
    forsok = 0;
    tur = 0;
    poeng = [0, 0];

    brett!.style.setProperty('--kol', String(kort.length > 16 ? 5 : 4));
    brett!.innerHTML = kort
      .map((k) => `<li><button type="button" class="bm-kort"><span class="bm-bak"></span><span class="bm-flate bm-vis-${k.type}">${flate(k)}</span></button></li>`)
      .join('');
    knapper = [...brett!.querySelectorAll<HTMLButtonElement>('button')];
    knapper.forEach((knapp, i) => {
      knapp.addEventListener('click', () => snu(i));
      oppdaterKnapp(i);
    });
    tegnUtskrift();
    visStatus();
    melding!.textContent = `Nytt spill med ${kort.length} kort.`;
    return true;
  }

  form.addEventListener('change', () => nyttSpill());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    nyttSpill();
  });
  skrivUt.addEventListener('click', () => window.print());

  nyttSpill();
}
