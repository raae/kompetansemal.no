// Fagene i grunnskolen, i visningsrekkefølge. Brukes både av hentescriptet,
// Astro-konfigurasjonen og sidene. Holdes i .mjs så alle kan importere den.

/** @typedef {{ key: string, slug: string, navn: string, laereplanprefiks: string }} Fag */

/** @type {Fag[]} */
export const FAG = [
  { key: 'MAT', slug: 'matte', navn: 'Matte', laereplanprefiks: 'MAT01' },
  { key: 'NOR', slug: 'norsk', navn: 'Norsk', laereplanprefiks: 'NOR01' },
  { key: 'ENG', slug: 'engelsk', navn: 'Engelsk', laereplanprefiks: 'ENG01' },
  { key: 'NAT', slug: 'naturfag', navn: 'Naturfag', laereplanprefiks: 'NAT01' },
  { key: 'SAF', slug: 'samfunnsfag', navn: 'Samfunnsfag', laereplanprefiks: 'SAF01' },
  { key: 'KRLE', slug: 'krle', navn: 'KRLE', laereplanprefiks: 'RLE01' },
  { key: 'KHV', slug: 'kunst-og-handverk', navn: 'Kunst og håndverk', laereplanprefiks: 'KHV01' },
  { key: 'MUS', slug: 'musikk', navn: 'Musikk', laereplanprefiks: 'MUS01' },
  { key: 'MHE', slug: 'mat-og-helse', navn: 'Mat og helse', laereplanprefiks: 'MHE01' },
  { key: 'KRO', slug: 'kroppsoving', navn: 'Kroppsøving', laereplanprefiks: 'KRO01' },
];

/** Trinngruppene, i rekkefølge. `fra`–`til` er trinnene som hører til. */
export const GRUPPER = [
  { slug: '1-2', fra: 1, til: 2, label: '1.–2. trinn' },
  { slug: '3-4', fra: 3, til: 4, label: '3.–4. trinn' },
  { slug: '5-7', fra: 5, til: 7, label: '5.–7. trinn' },
  { slug: '8-10', fra: 8, til: 10, label: '8.–10. trinn' },
];

/** Fag uten mål etter 2. trinn (KRLE og mat og helse) får 1–4 i stedet for 1–2 og 3–4. */
export const GRUPPE_1_4 = { slug: '1-4', fra: 1, til: 4, label: '1.–4. trinn' };

/**
 * Trinngruppene for et fag, ut fra hvilke trinn faget har mål på.
 * @param {number[]} trinn
 */
export function grupperForTrinn(trinn) {
  const harTrinn2 = trinn.some((t) => t <= 2);
  const grupper = harTrinn2 ? GRUPPER : [GRUPPE_1_4, ...GRUPPER.slice(2)];
  return grupper.filter((g) => trinn.some((t) => t >= g.fra && t <= g.til));
}

/** Slug fra et navn: æ→ae, ø→o, å→a, små bokstaver, bindestrek mellom ord. */
export function slug(navn) {
  return String(navn)
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'a')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
