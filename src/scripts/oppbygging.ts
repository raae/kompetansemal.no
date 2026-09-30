// Markering i visualiseringene: tegner streker mellom målene som bygger på hverandre,
// og markerer hele kjeden (alt under og alt over) når man trykker på et mål.
// `rot` får nytt innhold hver gang filteret endres; da kalles nyttInnhold().
const SVG = 'http://www.w3.org/2000/svg';

export function lagMarkering(rot: HTMLElement, panel: HTMLElement): { nyttInnhold(): void } {
  let stabel: HTMLElement | null = null;
  let svg: SVGSVGElement | null = null;
  let blokker = new Map<string, HTMLButtonElement>();
  let kopier: HTMLButtonElement[] = [];
  let foreldre = new Map<string, string[]>();
  let barn = new Map<string, string[]>();
  let kanter: { fra: string; til: string; sti: SVGPathElement }[] = [];
  let valgt: string | null = null;

  function les(): void {
    stabel = rot.querySelector<HTMLElement>('#stabel');
    // Noen visninger har ingen streker: der viser plasseringen hva som bygger på hva.
    svg = stabel?.querySelector('svg') ?? null;
    blokker = new Map();
    for (const b of rot.querySelectorAll<HTMLButtonElement>('.blokk:not(.kopi)')) blokker.set(b.dataset.kode!, b);
    // Kopier (klosser som står oppå flere) markeres likt med originalen.
    kopier = [...rot.querySelectorAll<HTMLButtonElement>('.blokk.kopi')];
    foreldre = new Map();
    barn = new Map();
    for (const [kode, b] of blokker) {
      const p = (b.dataset.bygger ?? '').split(' ').filter((k) => blokker.has(k));
      foreldre.set(kode, p);
      for (const k of p) barn.set(k, [...(barn.get(k) ?? []), kode]);
    }
    // Bare streker mellom ulike trinn. Noen få mål er koblet innenfor samme trinn.
    kanter = [];
    for (const [til, p] of svg ? foreldre : [])
      for (const fra of p) {
        if (Number(blokker.get(fra)!.dataset.trinn) >= Number(blokker.get(til)!.dataset.trinn)) continue;
        // data-uten-strek: mål klossen allerede står oppå eller rører, og som ikke trenger strek.
        if ((blokker.get(til)!.dataset.utenStrek ?? '').split(' ').includes(fra)) continue;
        const sti = document.createElementNS(SVG, 'path');
        svg!.appendChild(sti);
        kanter.push({ fra, til, sti });
      }
  }

  /** Punktet der linjen fra midten av r mot (x, y) går ut av rektangelet. */
  function kant(r: DOMRect, x: number, y: number, luft: number): [number, number] {
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    const t = Math.min(dx ? (r.width / 2 + luft) / Math.abs(dx) : Infinity, dy ? (r.height / 2 + luft) / Math.abs(dy) : Infinity);
    return [cx + dx * Math.min(t, 1), cy + dy * Math.min(t, 1)];
  }

  function tegn(): void {
    if (!svg || !stabel) return;
    // I bikuben overlapper radene, så der går streken mellom midten av cellene.
    // Kraftgrafen har rette streker mellom midtene. Nettverket (kort) har piler som
    // går fra kant til kant, fra målet som kommer først til målet som bygger på det.
    const rett = stabel.classList.contains('kraft');
    const piler = stabel.classList.contains('kort');
    const midt = rett || stabel.classList.contains('bikube');
    const r = stabel.getBoundingClientRect();
    svg.setAttribute('width', String(r.width));
    svg.setAttribute('height', String(r.height));
    for (const { fra, til, sti } of kanter) {
      const a = blokker.get(fra)!.getBoundingClientRect();
      const b = blokker.get(til)!.getBoundingClientRect();
      if (piler) {
        const [x1, y1] = kant(a, b.left + b.width / 2, b.top + b.height / 2, 2);
        const [x2, y2] = kant(b, a.left + a.width / 2, a.top + a.height / 2, 5);
        sti.setAttribute('d', `M${x1 - r.left},${y1 - r.top} L${x2 - r.left},${y2 - r.top}`);
        continue;
      }
      // Fra toppen av målet under til bunnen av målet over.
      const x1 = a.left + a.width / 2 - r.left;
      const y1 = (midt ? a.top + a.height / 2 : a.top) - r.top;
      const x2 = b.left + b.width / 2 - r.left;
      const y2 = (midt ? b.top + b.height / 2 : b.bottom) - r.top;
      const dy = Math.max(24, (y1 - y2) / 2);
      sti.setAttribute('d', rett ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${x1},${y1 - dy} ${x2},${y2 + dy} ${x2},${y2}`);
    }
  }


  function samle(start: string, naboer: Map<string, string[]>): Set<string> {
    const sett = new Set([start]);
    const stakk = [start];
    while (stakk.length) for (const k of naboer.get(stakk.pop()!) ?? []) if (!sett.has(k)) (sett.add(k), stakk.push(k));
    return sett;
  }

  const antall = (n: number) => (n === 1 ? '1 mål' : `${n} mål`);

  function velg(kode: string | null, oppdaterHash = true): void {
    valgt = kode && blokker.has(kode) ? kode : null;
    stabel?.classList.toggle('har-valg', !!valgt);
    if (oppdaterHash) history.replaceState(history.state, '', `${location.pathname}${location.search}${valgt ? `#${valgt}` : ''}`);
    if (!valgt) {
      for (const b of [...blokker.values(), ...kopier]) b.classList.remove('under', 'over', 'valgt'), b.removeAttribute('aria-pressed');
      for (const k of kanter) k.sti.classList.remove('paa');
      panel.hidden = true;
      return;
    }
    const under = samle(valgt, foreldre);
    const over = samle(valgt, barn);
    for (const b of [...blokker.values(), ...kopier]) {
      const k = b.dataset.kode!;
      b.classList.toggle('valgt', k === valgt);
      b.classList.toggle('under', k !== valgt && under.has(k));
      b.classList.toggle('over', k !== valgt && over.has(k));
      if (!b.classList.contains('kopi')) b.setAttribute('aria-pressed', String(k === valgt));
    }
    for (const k of kanter) k.sti.classList.toggle('paa', (under.has(k.fra) && under.has(k.til)) || (over.has(k.fra) && over.has(k.til)));
    // Løft de markerte strekene over de andre.
    for (const k of kanter) if (k.sti.classList.contains('paa')) svg!.appendChild(k.sti);

    const b = blokker.get(valgt)!;
    const [meta, plain, udir, tall] = panel.querySelectorAll('p');
    meta.textContent = `${valgt}, ${b.dataset.trinnlabel}`;
    plain.textContent = b.querySelector('span')!.textContent;
    udir.innerHTML = '';
    udir.append(Object.assign(document.createElement('b'), { textContent: 'Udir sier: ' }), b.dataset.udir ?? '');
    tall.textContent = `Bygger på ${antall(under.size - 1)} · Fører til ${antall(over.size - 1)} (blant målene som vises)`;
    (panel.querySelector('a.aapne') as HTMLAnchorElement).href = b.dataset.url!;
    panel.hidden = false;
  }

  rot.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.blokk');
    if (b) velg(b.dataset.kode !== valgt ? b.dataset.kode! : null);
    else if ((e.target as Element).closest('#stabel')) velg(null);
  });
  panel.querySelector('.lukk')!.addEventListener('click', () => velg(null));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && valgt) velg(null);
  });
  window.addEventListener('hashchange', () => velg(location.hash.slice(1).toUpperCase(), false));
  new ResizeObserver(tegn).observe(rot);
  document.fonts?.ready.then(tegn);

  let forste = true;
  return {
    nyttInnhold() {
      les();
      tegn();
      // Behold markeringen hvis målet fortsatt vises. Første gang: målet i URL-en.
      const kode = forste ? location.hash.slice(1).toUpperCase() : valgt;
      velg(kode, !forste);
      if (forste && valgt) blokker.get(valgt)!.scrollIntoView({ block: 'center' });
      forste = false;
    },
  };
}
