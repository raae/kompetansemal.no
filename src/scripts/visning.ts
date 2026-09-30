// Visualiseringene (Oppbygging og Klosser) tegnes i nettleseren. Siden har alle
// målene i faget som JSON, og filteret (scripts/filter.ts) skjuler «stubbene» i en
// usynlig liste. Når filteret endres, leser vi hvilke stubber som er synlige,
// bygger lagene på nytt og tegner visningen på nytt.
import { bikube, bro, sekskantOmriss } from '../lib/visning/flater';
import { kraft } from '../lib/visning/kraft';
import { byggLag, byggerIVisning, klosser, rutenett, type KlossVariant, type Lag, type VMaal } from '../lib/visning/modell';
import { lagMarkering } from './oppbygging';

type Form = 'oppbygging' | KlossVariant;

const esc = (s: string | number) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Knappen for ett mål. Alle visninger bruker samme data-attributter (se scripts/oppbygging.ts). */
function blokk(m: VMaal, bygger: string[], { utenStrek = [] as string[], tekst = m.kode, ekstra = '' } = {}): string {
  const attr = [
    `id="${esc(m.kode)}"`,
    `data-kode="${esc(m.kode)}"`,
    `data-bygger="${esc(bygger.join(' '))}"`,
    `data-trinn="${m.trinn}"`,
    `data-url="${esc(m.url)}"`,
    `data-udir="${esc(m.udir)}"`,
    `data-trinnlabel="${esc(m.trinnLabel)}"`,
    utenStrek.length ? `data-uten-strek="${esc(utenStrek.join(' '))}"` : '',
  ].filter(Boolean);
  return `<button type="button" class="blokk" ${attr.join(' ')}><small>${esc(tekst)}${ekstra}</small><span>${esc(m.forklaring)}</span></button>`;
}

function stabel(lag: Lag[]): string {
  const bygger = byggerIVisning(lag);
  // Tidligste trinn nederst, som byggeklosser.
  const lagHtml = [...lag].reverse().map(
    (l) => `<div class="lag${l.kontekst ? ' kontekst' : ''}">
      <h3 class="lagnavn">${esc(l.label)}${l.kontekst ? '<span class="under"> – det de valgte målene bygger på</span>' : ''}</h3>
      <ol>${l.maal.map((m) => `<li>${blokk(m, bygger(m))}</li>`).join('')}</ol>
    </div>`,
  );
  return `<div class="stabel" id="stabel"><svg class="streker" aria-hidden="true"></svg>${lagHtml.join('')}</div>`;
}

function klossHtml(lag: Lag[], variant: 'tre' | 'traader' | 'merker' | 'kopier'): string {
  const bygger = byggerIVisning(lag);
  const { kolonner, rader, klosser: alle } = klosser(lag, { kopier: variant === 'kopier' });
  const li = alle.map((k) => {
    const stil = `grid-column:${k.kolonne} / span ${k.bredde};grid-row:${k.rad}`;
    const knapp = k.kopi
      ? `<button type="button" class="blokk kopi" data-kode="${esc(k.maal.kode)}" title="Kopi: ${esc(k.maal.kode)} bygger også på dette målet"><small>${esc(k.maal.kode)} · kopi</small><span>${esc(k.maal.forklaring)}</span></button>`
      : blokk(k.maal, bygger(k.maal), {
          utenStrek: variant === 'traader' && k.hoved ? [k.hoved] : [],
          tekst: `${k.maal.kode} · ${k.maal.trinnLabel}`,
          ekstra: variant !== 'merker' && k.paa.length > 1 ? `<b class="flere" title="Bygger på ${k.paa.length} mål"> · på ${k.paa.length}</b>` : '',
        });
    const merker =
      variant === 'merker' && k.paa.length
        ? `<ul class="merker" aria-label="Bygger på">${k.paa
            .map((p, i) => `<li><a href="#${esc(p)}" class="merke${i === 0 ? ' hoved' : ''}" title="${i === 0 ? 'Står oppå dette målet' : 'Bygger også på dette målet'}">${esc(p)}</a></li>`)
            .join('')}</ul>`
        : '';
    return `<li class="${k.kontekst ? 'kontekst' : ''}" style="${stil}">${knapp}${merker}</li>`;
  });
  return `<div class="klosser-rulle"><div class="klosser-flate" id="stabel">
    ${variant === 'traader' ? '<svg class="streker traader" aria-hidden="true"></svg>' : ''}
    <ol class="klosser" style="--kolonner:${kolonner};--rader:${rader}">${li.join('')}</ol>
  </div></div>`;
}

function flateHtml(lag: Lag[], form: 'bikube' | 'bro'): string {
  const bygger = byggerIVisning(lag);
  const flate = form === 'bikube' ? bikube(lag) : bro(lag);
  const navn = lag.map((l, i) => `<span class="flate-lagnavn" style="--y:${flate.lag - 1 - i}">${esc(l.label)}</span>`);
  const li = flate.brikker.map((b) => {
    const stil = `--x:${b.x};--y:${flate.lag - 1 - b.lag};--b:${b.bredde}${form === 'bikube' ? `;--omriss:${sekskantOmriss(b.bredde)}` : ''}`;
    return `<li class="${b.kontekst ? 'kontekst' : ''}" style="${stil}">${blokk(b.maal, bygger(b.maal), { utenStrek: b.utenStrek })}</li>`;
  });
  return `<div class="klosser-rulle"><div class="flate ${form}" id="stabel" style="--bredde:${flate.bredde};--lag:${flate.lag}">
    <svg class="streker" aria-hidden="true"></svg>${navn.join('')}<ol>${li.join('')}</ol>
  </div></div>`;
}

function rutenettHtml(lag: Lag[]): string {
  const bygger = byggerIVisning(lag);
  // Nyeste trinn øverst, som i stablene.
  const tabeller = rutenett(lag).reverse().map(
    (t) => `<section class="rutenett-lag">
      <h3 class="lagnavn">${esc(t.over.label)} <span class="under">bygger på ${esc(t.under.label)}</span></h3>
      <div class="klosser-rulle"><table>
        <thead><tr><th scope="col" class="hjorne"><span class="visually-hidden">Mål</span></th>${t.under.maal
          .map((u) => `<th scope="col" class="kol" title="${esc(u.forklaring)}"><a href="${esc(u.url)}">${esc(u.kode.replace('KM', ''))}</a></th>`)
          .join('')}</tr></thead>
        <tbody>${t.rader
          .map(
            (r) => `<tr class="${t.under.maal.filter((u) => r.paa.has(u.kode)).length > 1 ? 'flere' : ''}">
              <th scope="row">${blokk(r.maal, bygger(r.maal))}</th>
              ${t.under.maal.map((u) => `<td>${r.paa.has(u.kode) ? `<span class="prikk" title="Bygger på ${esc(u.kode)}: ${esc(u.forklaring)}">●</span>` : ''}</td>`).join('')}
            </tr>`,
          )
          .join('')}</tbody>
      </table></div>
    </section>`,
  );
  if (!tabeller.length) return `<div id="stabel" class="rutenett"><p class="empty">Rutenettet trenger mål fra minst to trinn.</p></div>`;
  return `<div id="stabel" class="rutenett">${tabeller.join('')}</div>`;
}

function kraftHtml(lag: Lag[], rader: boolean): string {
  const bygger = byggerIVisning(lag);
  const { punkter, bredde, hoyde } = kraft(lag, { rader });
  // Trinnet som tone (0 = tidligst) i nettverket, og som radnavn med faste rader.
  const navn = rader ? lag.map((l, i) => `<span class="flate-lagnavn" style="--y:${lag.length - 1 - i}">${esc(l.label)}</span>`).join('') : '';
  const li = punkter.map((p) => {
    const tone = lag.length > 1 ? p.lag / (lag.length - 1) : 1;
    return `<li class="${p.kontekst ? 'kontekst' : ''}" style="--x:${p.x.toFixed(3)};--y:${p.y.toFixed(3)};--tone:${tone.toFixed(2)}">${blokk(p.maal, bygger(p.maal), {
      // Med faste rader står trinnet i radnavnet; i nettverket står det på merket.
      tekst: rader ? p.maal.kode : `${p.maal.kode} · ${p.maal.trinnLabel}`,
    })}</li>`;
  });
  return `<div class="klosser-rulle"><div class="kraft${rader ? ' rader' : ''}" id="stabel" style="--bredde:${bredde.toFixed(3)};--hoyde:${hoyde.toFixed(3)}">
    <svg class="streker" aria-hidden="true"></svg>${navn}<ol>${li.join('')}</ol>
  </div></div>`;
}

function tegn(form: Form, lag: Lag[]): string {
  if (!lag.length) return '<p class="empty">Ingen mål passer valgene. Trykk «Alle» for å nullstille.</p>';
  switch (form) {
    case 'oppbygging':
      return stabel(lag);
    case 'bikube':
    case 'bro':
      return flateHtml(lag, form);
    case 'rutenett':
      return rutenettHtml(lag);
    case 'kraft':
    case 'nettverk':
      return kraftHtml(lag, form === 'kraft');
    default:
      return klossHtml(lag, form);
  }
}

export function startVisualisering(): void {
  const rot = document.getElementById('visning');
  const data = document.getElementById('visningsdata');
  const panel = document.getElementById('valgt');
  if (!rot || !data || !panel) return;
  const form = rot.dataset.form as Form;
  const alle = JSON.parse(data.textContent!) as VMaal[];
  const stubber = [...document.querySelectorAll<HTMLElement>('[data-filtrert] li.goal')];
  const markering = lagMarkering(rot, panel);

  let forrige = '';
  const oppdater = () => {
    const synlige = new Set(stubber.filter((s) => !s.hidden).map((s) => s.dataset.kode!));
    // Kontekstlaget (det de valgte trinnene bygger på) bare når trinnfilteret er på.
    const medKontekst = new URLSearchParams(location.search).has('trinn');
    const nokkel = `${[...synlige].join(',')}|${medKontekst}`;
    if (nokkel === forrige) return;
    forrige = nokkel;
    rot.innerHTML = tegn(form, byggLag(alle, synlige, medKontekst));
    markering.nyttInnhold();
  };
  // Filteret sender «filter-endret» første gang det har lest URL-en, og ved hver endring.
  document.addEventListener('filter-endret', oppdater);
  if (!document.querySelector('[data-filter]')) oppdater();
}
