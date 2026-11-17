# Konfigurasjon

fnr-guard leser konfigurasjonen fra `.fnr-guard.json` i roten av repoet. Fila kan ha kommentarer (`//` og `/* */`) og komma etter siste element.

Lag den med `fnr-guard init`, eller la fnr-guard lage den ved første kjøring.

## Eksempel

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/navikt/fnr-guard/main/schema/fnr-guard.schema.json",
  "versjon": 1,
  "roots": ["."],
  "include": ["**"],
  "exclude": [
    { "mønster": "**/node_modules/**", "begrunnelse": "Tredjepartskode installert av npm" }
  ],
  "ekstraBlokkerteTyper": [],
  "pdf": true,
  "maksFilstørrelseKb": 2048,
  "manglendeNode": "stopp"
}
```

`$schema` gir autofullføring og validering i VS Code og IntelliJ.

## Felt

| Felt | Standard | Beskrivelse |
|---|---|---|
| `versjon` | påkrevd | Må være `1`. |
| `roots` | `["."]` | Git-repoer som skal skannes, relativt til fila. Se [flere repoer](#flere-repoer-i-én-mappe). |
| `include` | `["**"]` | Glob-mønstre for filer som skannes. |
| `exclude` | `[]` | Filer som ikke skannes. Hvert mønster trenger en begrunnelse. |
| `ekstraBlokkerteTyper` | `[]` | `"hnr"` og/eller `"tnr"`, hvis syntetiske numre også skal stoppes. |
| `pdf` | `true` | Skann tekst i PDF-er. Krever `pdftotext`. |
| `maksFilstørrelseKb` | `2048` | Filer over grensen leses bit for bit. De hoppes aldri over. |
| `manglendeNode` | `"stopp"` | Hva hooken gjør når `node` mangler: `"stopp"` eller `"advar"`. Leses ved `install`. |

## Glob-mønstre

Mønstrene er relative til roten av hvert repo og bruker `/` som skilletegn.

| Mønster | Treffer |
|---|---|
| `**` | null eller flere mapper |
| `*` | null eller flere tegn innenfor én mappe |
| `?` | ett tegn |

`**/build/**` treffer `build/a.txt` og `app/build/a.txt`. `*.pdf` treffer bare PDF-er i roten. Bruk `**/*.pdf` for alle.

## Regler som ikke kan slås av

Disse reglene hindrer at du slår av beskyttelsen ved et uhell. Bryter config en av dem, stopper fnr-guard med exit 2.

- **fnr og dnr blokkeres alltid.** `ekstraBlokkerteTyper` kan bare legge til typer.
- **Hver exclude trenger en begrunnelse** på minst 10 tegn.
- **Testdata skannes alltid.** En exclude som treffer mapper som `test/`, `src/test/`, `__mocks__/`, `mocks/`, `testdata/`, `fixtures/` eller filer som `*.test.ts` og `*Test.kt`, avvises. Det er der ekte fødselsnumre oftest havner.
- **Stier kan ikke peke ut av repoet.** `..`, absolutte stier og backslash avvises.
- **Ukjente felt gir feil**, så en skrivefeil ikke fører til at en innstilling blir ignorert uten varsel.
- **Symlenker følges ikke.** fnr-guard skanner lenkemålet som tekst, slik git lagrer det.

## Flere repoer i én mappe

Har du klonet flere repoer under én mappe, for eksempel slik:

```
utviklermiljo/
├── .fnr-guard.json
└── repos/
    ├── app-a/   (git-repo)
    └── app-b/   (git-repo)
```

så setter du:

```json
{ "versjon": 1, "roots": [".", "repos/*"] }
```

`fnr-guard install`, `status`, `--all` og `--history` går da gjennom alle repoene. Kjører du fnr-guard inne i `repos/app-a`, finner den config i mappen over, men skanner bare `app-a`.

## Monorepo

I et monorepo holder én `.fnr-guard.json` i roten. `init` legger til exclude for genererte mapper i hver pakke. `init` begrenser aldri `include` automatisk. Alt skal skannes med mindre du har en grunn til noe annet.

## Config i CI

GitHub Action-en leser config fra base-branchen, ikke fra PR-en. Endrer en PR `.fnr-guard.json`, gjelder endringen først etter merge. Slik kan ikke en PR legge til en exclude og et nummer i samme endring.

Mangler config på base-branchen, brukes standardverdiene.
