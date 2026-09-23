# Hva betyr målet? – kompetansemål.no

Alle kompetansemål i grunnskolen (1.–10. trinn) på vanlig norsk. Statisk Astro-side som publiseres på [kompetansemål.no](https://kompetansemål.no) via Netlify.

## Kom i gang

```sh
npm ci
npm run dev        # utviklingsserver
npm run build      # bygger til dist/
npm run check      # astro check (typer og maler)
npm run sjekk-lenker   # sjekker alle interne lenker i dist/
```

Byggingen leser bare fra `data/` og gjør **ingen** nettverkskall.

## Data

| Fil | Hva |
|---|---|
| `data/forklaringer.json` | **Vårt eget innhold.** Nøkkel er kompetansemålkoden, verdien er `{ forklaring, ideer[] }`. Redigeres for hånd. Forklaringene og idéene er laget med hjelp av KI, og det står på siden. |
| `data/udir.json` | Rådata fra Udirs Grep-API (NLOD), uten våre forklaringer. Skrives av `npm run hent-udir` og sjekkes inn. Har også `laereplaner` med versjon og gyldig-fra-dato per fag. |

De to filene slås sammen ved bygging i `src/lib/data.ts`.

### Oppdatere fra Udir

Kjør bare når Udir har endret læreplanene:

```sh
npm run hent-udir
```

Skriptet finner selv gjeldende versjon av hver læreplan (publisert og gyldig i dag), henter alle mål, og skriver en endringsrapport: nye mål, fjernede mål, endret Udir-tekst og mål som mangler forklaring. Skriv forklaringer for nye mål i `data/forklaringer.json` før du committer. Kjøringen er deterministisk: to kjøringer på rad gir identisk fil.

#### Om språk i Grep-API-et

Dette er grunnen til at skriptet henter hvert objekt for seg:

- Tekster kommer som liste av `{ spraak, verdi }`. Oppføringen `default` er **målformen læreplanen ble fastsatt som forskrift i**. Matte, samfunnsfag, mat og helse og kroppsøving er fastsatt på nynorsk, de seks andre på bokmål. Det er derfor «en del ting kommer som nynorsk».
- Referanser inne i et objekt (`bygger-paa`, `tilknyttede-kjerneelementer`, lista over mål i et kompetansemålsett) har bare én tittel: default-språket til objektet det pekes på.
- API-et støtter verken `Accept-Language` eller språkparameter i URL-en.
- Derfor: hent hvert mål, kjerneelement og tema for seg, og velg alltid `spraak === "nob"`. Skriptet feiler høyt hvis bokmål mangler.

Andre ting å vite:

- `etter-aarstrinn` på kompetansemålsettene er feil for minst ett sett (KV1076, naturfag etter 4. trinn, står som årstrinn 5). Skriptet bruker tittelen som fasit og advarer ved avvik.
- Én `bygger-paa`-kobling (KM13336 → KM266) peker utenfor grunnskolen og filtreres bort.
- 98 mål har Udirs egen «Begrepsforklaring / didaktisk støtte». Den lagres som `udir_forklaring` i `udir.json` og vises som «Udir forklarer:» i kortet.

## Sider

| Rute | Hva |
|---|---|
| `/` | Forside med søk og fagvalg |
| `/[fag]/` | Alle målene i et fag, med hopp til hver trinngruppe |
| `/[fag]/oppbygging/` | Alle målene i et fag stablet trinn for trinn, tidligste nederst, med streker for «bygger på». Trykk på et mål for å markere hele kjeden. `#KODE` i URL-en velger et mål |
| `/[fag]/[gruppe]/` | Målene i et fag for én trinngruppe, f.eks. `/matte/5-7/` |
| `/mal/[kode]/` | Ett mål, med «Bygger på og fører til» åpent og lenker til forrige og neste |
| `/kjerneelement/[fag]/[slug]/` | Alle mål i faget med kjerneelementet |
| `/tema/[slug]/` | Alle mål i alle fag med det tverrfaglige temaet |
| `/sok.json` | Søkeindeks for søket på klientsiden |

Trinngrupper: 1–2, 3–4, 5–7 og 8–10. KRLE og mat og helse har ikke mål etter 2. trinn og får 1–4, 5–7 og 8–10. Matte har mål per trinn og merkes «5. trinn». Andre fag merkes med gruppa, f.eks. «5.–7. trinn».

## Netlify

`netlify.toml` bygger med `npm run build` til `dist/` på Node 22. Sitemap og `robots.txt` bruker punycode-formen `xn--kompetanseml-3cb.no`.
