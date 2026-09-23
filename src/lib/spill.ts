// Spill som hører til en idé på et mål. Idéteksten må finnes ordrett i
// data/forklaringer.json, ellers feiler byggingen (se sjekkSpill).
import { maalMedKode, type Maal } from './data';

export interface Spill {
  slug: string;
  navn: string;
  kode: string;
  ide: string;
}

export const SPILL: Spill[] = [
  {
    slug: 'brokmemory',
    navn: 'Brøkmemory',
    kode: 'KM13267',
    ide: 'Lag et memory-spill der kortene viser samme brøk på ulike måter.',
  },
];

export function spillUrl(s: Spill): string {
  return `/spill/${s.slug}/`;
}

export function spillForIde(maal: Maal, ide: string): Spill | undefined {
  return SPILL.find((s) => s.kode === maal.kode && s.ide === ide);
}

/** Målet spillet hører til. Feiler hvis målet eller idéen er borte. */
export function maalForSpill(s: Spill): Maal {
  const maal = maalMedKode(s.kode);
  if (!maal) throw new Error(`Spillet ${s.slug} peker på ${s.kode}, som ikke finnes`);
  if (!maal.ideer.includes(s.ide)) throw new Error(`Spillet ${s.slug}: idéen finnes ikke lenger på ${s.kode} i data/forklaringer.json`);
  return maal;
}
