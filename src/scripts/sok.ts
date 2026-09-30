// Søk på klientsiden. Henter /sok.json første gang noen skriver, og viser treff
// i stedet for sideinnholdet. Ingen rammeverk, ingen lagring.
interface Treff {
  k: string; // kode
  f: string; // fag-nøkkel
  fn: string; // fagnavn
  t: number; // trinn
  tl: string; // trinn-etikett
  p: string; // forklaring
  u: string; // udir-tekst
  i: string[]; // idéer
  e: [string, string][]; // emner, [navn, url]
  ke: [string, string][]; // [navn, url]
  tv: [string, string][]; // [navn, url]
  url: string;
  fu: string; // fag-url
}

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function kort(t: Treff): string {
  return `<li class="goal" style="--fag:var(--${t.f})">
    <div class="meta"><span class="code"><a href="${t.url}">${t.k}</a> <span>${esc(t.tl)}</span></span><a class="fagtag" href="${t.fu}">${esc(t.fn)}</a></div>
    <p class="plain">${esc(t.p)}</p>
    <p class="udir"><b>Udir sier:</b> ${esc(t.u)}</p>
    ${t.i.length ? `<h4>Idéer til aktiviteter</h4><ul class="ideas">${t.i.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    ${t.e.length + t.ke.length + t.tv.length ? `<ul class="tags">${t.e.map(([n, u]) => `<li><a class="emne" href="${u}">${esc(n)}</a></li>`).join('')}${t.ke.map(([n, u]) => `<li><a href="${u}">${esc(n)}</a></li>`).join('')}${t.tv.map(([n, u]) => `<li><a class="tv" href="${u}">${esc(n)}</a></li>`).join('')}</ul>` : ''}
    <p class="chain"><a href="${t.url}">Bygger på og fører til →</a></p>
  </li>`;
}

export function startSok(): void {
  const input = document.getElementById('q') as HTMLInputElement | null;
  const innholdEl = document.getElementById('innhold');
  const utEl = document.getElementById('sok-resultat');
  if (!input || !innholdEl || !utEl) return;
  const innhold: HTMLElement = innholdEl;
  const ut: HTMLElement = utEl;

  let indeks: Treff[] | null = null;
  let laster: Promise<Treff[]> | null = null;
  const hent = () => (laster ??= fetch(input.dataset.sok || '/sok.json').then((r) => r.json()).then((d) => (indeks = d)));

  function vis(q: string) {
    const ord = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!ord.length) {
      ut.hidden = true;
      ut.innerHTML = '';
      innhold.hidden = false;
      return;
    }
    if (!indeks) {
      hent().then(() => vis(input!.value));
      return;
    }
    const treff = indeks.filter((t) => {
      const hay = `${t.p} ${t.u} ${t.i.join(' ')} ${t.e.map(([n]) => n).join(' ')} ${t.k} ${t.fn}`.toLowerCase();
      return ord.every((w) => hay.includes(w));
    });
    innhold.hidden = true;
    ut.hidden = false;
    ut.innerHTML =
      `<div class="fagHead"><p>${treff.length} mål passer med «${esc(q.trim())}».</p></div>` +
      (treff.length ? `<ol class="goals">${treff.map(kort).join('')}</ol>` : '<p class="empty">Ingen treff. Prøv et kortere ord, eller velg et fag over.</p>');
  }

  let timer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      vis(input.value);
      const url = new URL(location.href);
      if (input.value.trim()) url.searchParams.set('q', input.value.trim());
      else url.searchParams.delete('q');
      history.replaceState(null, '', url);
    }, 120);
  });
  input.addEventListener('focus', () => void hent(), { once: true });
  input.closest('form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    vis(input.value);
  });

  const q = new URLSearchParams(location.search).get('q');
  if (q) {
    input.value = q;
    vis(q);
  }
}
