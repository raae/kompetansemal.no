// Oppbyggingen: tegner streker mellom målene som bygger på hverandre, og markerer
// hele kjeden (alt under og alt over) når man trykker på et mål.
const SVG = 'http://www.w3.org/2000/svg';

export function startOppbygging(): void {
  const stabelEl = document.getElementById('stabel');
  const panelEl = document.getElementById('valgt');
  if (!stabelEl || !panelEl) return;
  const stabel: HTMLElement = stabelEl;
  const panel: HTMLElement = panelEl;
  // Noen visninger har ingen streker: der viser plasseringen hva som bygger på hva.
  const svg = stabel.querySelector('svg');

  const blokker = new Map<string, HTMLButtonElement>();
  for (const b of stabel.querySelectorAll<HTMLButtonElement>('.blokk:not(.kopi)')) blokker.set(b.dataset.kode!, b);
  // Kopier (klosser som står oppå flere) markeres likt med originalen.
  const kopier = [...stabel.querySelectorAll<HTMLButtonElement>('.blokk.kopi')];

  const foreldre = new Map<string, string[]>();
  const barn = new Map<string, string[]>();
  for (const [kode, b] of blokker) {
    const p = (b.dataset.bygger ?? '').split(' ').filter((k) => blokker.has(k));
    foreldre.set(kode, p);
    for (const k of p) barn.set(k, [...(barn.get(k) ?? []), kode]);
  }

  // Bare streker mellom ulike trinn. Noen få mål er koblet innenfor samme trinn.
  const kanter: { fra: string; til: string; sti: SVGPathElement }[] = [];
  for (const [til, p] of svg ? foreldre : [])
    for (const fra of p) {
      if (Number(blokker.get(fra)!.dataset.trinn) >= Number(blokker.get(til)!.dataset.trinn)) continue;
      // data-uten-strek: mål klossen allerede står oppå eller rører, og som ikke trenger strek.
      if ((blokker.get(til)!.dataset.utenStrek ?? '').split(' ').includes(fra)) continue;
      const sti = document.createElementNS(SVG, 'path');
      svg!.appendChild(sti);
      kanter.push({ fra, til, sti });
    }

  const midt = stabel.classList.contains('bikube');

  function tegn(): void {
    if (!svg) return;
    const r = stabel.getBoundingClientRect();
    svg.setAttribute('width', String(r.width));
    svg.setAttribute('height', String(r.height));
    for (const { fra, til, sti } of kanter) {
      const a = blokker.get(fra)!.getBoundingClientRect();
      const b = blokker.get(til)!.getBoundingClientRect();
      // Fra toppen av målet under til bunnen av målet over. I bikuben overlapper
      // radene, så der går streken mellom midten av cellene i stedet.
      const x1 = a.left + a.width / 2 - r.left;
      const y1 = (midt ? a.top + a.height / 2 : a.top) - r.top;
      const x2 = b.left + b.width / 2 - r.left;
      const y2 = (midt ? b.top + b.height / 2 : b.bottom) - r.top;
      const dy = Math.max(24, (y1 - y2) / 2);
      sti.setAttribute('d', `M${x1},${y1} C${x1},${y1 - dy} ${x2},${y2 + dy} ${x2},${y2}`);
    }
  }

  function samle(start: string, naboer: Map<string, string[]>): Set<string> {
    const sett = new Set([start]);
    const stakk = [start];
    while (stakk.length) for (const k of naboer.get(stakk.pop()!) ?? []) if (!sett.has(k)) (sett.add(k), stakk.push(k));
    return sett;
  }

  let valgt: string | null = null;

  function velg(kode: string | null, oppdaterHash = true): void {
    valgt = kode && blokker.has(kode) ? kode : null;
    stabel.classList.toggle('har-valg', !!valgt);
    if (oppdaterHash) history.replaceState(null, '', valgt ? `#${valgt}` : location.pathname + location.search);
    if (!valgt) {
      for (const b of [...blokker.values(), ...kopier]) b.classList.remove('under', 'over', 'valgt'), b.removeAttribute('aria-pressed');
      for (const k of kanter) k.sti.classList.remove('paa');
      panel.hidden = true;
      return;
    }
    const under = samle(valgt, foreldre);
    const over = samle(valgt, barn);
    for (const [k, b] of blokker) {
      b.classList.toggle('valgt', k === valgt);
      b.classList.toggle('under', k !== valgt && under.has(k));
      b.classList.toggle('over', k !== valgt && over.has(k));
      b.setAttribute('aria-pressed', String(k === valgt));
    }
    for (const b of kopier) {
      const k = b.dataset.kode!;
      b.classList.toggle('valgt', k === valgt);
      b.classList.toggle('under', k !== valgt && under.has(k));
      b.classList.toggle('over', k !== valgt && over.has(k));
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
    tall.textContent = `Bygger på ${antall(under.size - 1)} · Fører til ${antall(over.size - 1)}`;
    (panel.querySelector('a.aapne') as HTMLAnchorElement).href = b.dataset.url!;
    panel.hidden = false;
  }

  const antall = (n: number) => (n === 1 ? '1 mål' : `${n} mål`);

  stabel.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('.blokk');
    velg(b && b.dataset.kode !== valgt ? b.dataset.kode! : null);
  });
  panel.querySelector('.lukk')!.addEventListener('click', () => velg(null));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && valgt) velg(null);
  });
  window.addEventListener('hashchange', () => velg(location.hash.slice(1).toUpperCase(), false));

  new ResizeObserver(tegn).observe(stabel);
  document.fonts?.ready.then(tegn);
  tegn();

  const fraHash = location.hash.slice(1).toUpperCase();
  if (blokker.has(fraHash)) {
    velg(fraHash, false);
    blokker.get(fraHash)!.scrollIntoView({ block: 'center' });
  }
}
