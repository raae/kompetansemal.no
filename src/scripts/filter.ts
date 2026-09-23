// Filterpiller på fagsidene. Hver rad (`[data-filter="navn"]`) styrer elementer med
// `data-f-navn="verdi ..."`. Flere valg i samme rad er «eller», flere rader er «og».
// Valget ligger i URL-en (?trinn=1-2,5-7&kjerne=teknologi) så siden kan bokmerkes.

export function startFilter(): void {
  const rader = [...document.querySelectorAll<HTMLElement>('[data-filter]')];
  const liste = document.querySelector<HTMLElement>('[data-filtrert]');
  if (!rader.length || !liste) return;

  const lovlige = new Map(
    rader.map((r) => [r.dataset.filter!, new Set([...r.querySelectorAll<HTMLElement>('[data-verdi]')].map((b) => b.dataset.verdi!))]),
  );

  function lesUrl(): Map<string, Set<string>> {
    const params = new URLSearchParams(location.search);
    const valgt = new Map<string, Set<string>>();
    for (const [navn, lov] of lovlige) {
      const verdier = (params.get(navn) ?? '').split(',').filter((v) => lov.has(v));
      valgt.set(navn, new Set(verdier));
    }
    return valgt;
  }

  function skrivUrl(valgt: Map<string, Set<string>>): void {
    const params = new URLSearchParams(location.search);
    for (const [navn, verdier] of valgt) {
      if (verdier.size) params.set(navn, [...verdier].join(','));
      else params.delete(navn);
    }
    // Komma er lov i query, og er lettere å lese enn %2C.
    const q = params.toString().replace(/%2C/gi, ',');
    history.replaceState(history.state, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  }

  function vis(valgt: Map<string, Set<string>>): void {
    for (const rad of rader) {
      const verdier = valgt.get(rad.dataset.filter!)!;
      rad.querySelector('[data-alle]')!.setAttribute('aria-pressed', String(!verdier.size));
      for (const b of rad.querySelectorAll<HTMLElement>('[data-verdi]')) b.setAttribute('aria-pressed', String(verdier.has(b.dataset.verdi!)));
    }

    // Skjul alt som ikke passer, innenfra og ut.
    for (const [navn, verdier] of valgt) {
      for (const el of liste!.querySelectorAll<HTMLElement>(`[data-f-${navn}]`)) {
        const egne = el.getAttribute(`data-f-${navn}`)!.split(' ');
        el.toggleAttribute(`data-skjult-${navn}`, verdier.size > 0 && !egne.some((v) => verdier.has(v)));
      }
    }
    const synlig = (el: Element) => ![...lovlige.keys()].some((n) => el.closest(`[data-skjult-${n}]`));
    const maal = [...liste!.querySelectorAll<HTMLElement>('li.goal')];
    let antall = 0;
    for (const m of maal) {
      const ok = synlig(m);
      m.hidden = !ok;
      if (ok) antall++;
    }
    // Avsnitt og grupper uten synlige mål skjules helt, med overskrift.
    for (const s of liste!.querySelectorAll<HTMLElement>('[data-seksjon]')) {
      s.hidden = !s.querySelector('li.goal:not([hidden])');
    }

    const aktiv = [...valgt.values()].some((v) => v.size);
    const status = document.querySelector<HTMLElement>('[data-filter-status]');
    if (status) {
      status.hidden = !aktiv;
      status.textContent = antall ? `Viser ${antall} av ${maal.length} mål.` : 'Ingen mål passer valgene. Trykk «Alle» for å nullstille.';
    }

    // Lenker som skal ta med seg filtrene (f.eks. til andre trinnsider).
    for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-behold-filter]')) {
      const url = new URL(a.getAttribute('href')!, location.href);
      for (const [navn, verdier] of valgt) {
        if (verdier.size) url.searchParams.set(navn, [...verdier].join(','));
        else url.searchParams.delete(navn);
      }
      a.href = url.pathname + url.search.replace(/%2C/gi, ',');
    }
  }

  let valgt = lesUrl();
  vis(valgt);
  // Forhåndsvisningen fra FilterStart.astro er ikke lenger nødvendig.
  document.getElementById('filter-start')?.remove();

  for (const rad of rader) {
    rad.addEventListener('click', (e) => {
      const knapp = (e.target as Element).closest<HTMLElement>('button');
      if (!knapp) return;
      const verdier = valgt.get(rad.dataset.filter!)!;
      if (knapp.hasAttribute('data-alle')) verdier.clear();
      else if (verdier.has(knapp.dataset.verdi!)) verdier.delete(knapp.dataset.verdi!);
      else verdier.add(knapp.dataset.verdi!);
      skrivUrl(valgt);
      vis(valgt);
    });
  }

  addEventListener('popstate', () => {
    valgt = lesUrl();
    vis(valgt);
  });
}
