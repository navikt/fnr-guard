# fnr-guard

Stopper gyldige fødselsnumre og D-numre før de havner i git. Du kan kjøre fnr-guard som pre-commit-hook, som GitHub Action eller som engangsskanning av et repo og hele historikken.

Utskriften viser aldri selve nummeret, bare fil, linje og type.

| Type | Typisk kilde | Resultat |
|---|---|---|
| Fødselsnummer (fnr) | ekte person | 🛑 stoppes |
| D-nummer (dag + 40) | ekte person | 🛑 stoppes |
| H-nummer (måned + 40) | Dolly | ✅ slipper gjennom, med mindre du slår det på |
| T-nummer (måned + 80) | Tenor | ✅ slipper gjennom, med mindre du slår det på |
| Ugyldige tall, som `12345678901` | mock | ✅ slipper gjennom |

Krever Node 20 eller nyere. fnr-guard har ingen avhengigheter.

## Kom i gang

### Før du starter: tilgang til GitHub Packages

Pakken ligger på GitHub Packages. GitHub krever token også for å installere public pakker derfra. Lag et [classic personal access token](https://github.com/settings/tokens) med `read:packages`, aktiver SSO for navikt, og legg dette i `~/.npmrc`:

```
@navikt:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<token>
```

GitHub Action-en trenger ikke token.

### 1. Pre-commit-hook

```sh
npm install --global @navikt/fnr-guard
cd mitt-repo
fnr-guard init       # lager .fnr-guard.json ut fra mappestrukturen
fnr-guard install    # installerer hooken
```

Sjekk inn `.fnr-guard.json`. Fra nå av stopper hooken commits med fødselsnumre.

Bruker repoet husky eller lefthook, endrer `install` ingenting og viser i stedet linjen du skal legge inn selv. Se [docs/pre-commit.md](docs/pre-commit.md).

### 2. Engangsskanning

```sh
npx @navikt/fnr-guard --all       # alle sporede filer nå
npx @navikt/fnr-guard --history   # hver commit i hele historikken, alle brancher
```

### 3. GitHub Actions

`.github/workflows/fnr-guard.yml`:

```yaml
name: fnr-guard
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  fnr-guard:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@<sha> # v7
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: navikt/fnr-guard@<sha> # v1
```

Bytt `<sha>` med commit-SHA-en til en release. Se [docs/github-actions.md](docs/github-actions.md).

## Hooken advarer tidlig, CI håndhever

`git commit --no-verify` hopper over hooken. Derfor er det GitHub Action-en som faktisk håndhever regelen. Gjør jobben til en påkrevd sjekk med branch protection. CI leser config fra base-branchen, så en PR kan ikke svekke config og legge inn et nummer i samme endring.

## Første kjøring

Finnes det ingen `.fnr-guard.json`, lager fnr-guard en ut fra mappestrukturen og avslutter med exit-kode 1. Se over fila, sjekk den inn og kjør på nytt. Hooks og CI skriver aldri filer. Der brukes standardverdiene når config mangler.

`init` gjenkjenner:

- flere git-repoer under én mappe, for eksempel `repos/*`
- monorepo-workspaces i npm, pnpm, Gradle og Go
- mapper med generert innhold, som `node_modules`, `build` og `dist`
- eksisterende oppsett med husky, lefthook eller pre-commit

## Når et tall ser ut som et fødselsnummer, men ikke er det

Bruk helst numre fra [Dolly](https://dolly.ekstern.dev.nav.no) eller Tenor. Må tallet likevel stå, legg en markør på samme linje:

```kotlin
val id = "…" // fnr-guard-ignore: ID fra testmiljø, ikke et identnummer
```

Se [docs/unntak.md](docs/unntak.md).

## Dokumentasjon

- [Konfigurasjon](docs/konfigurasjon.md)
- [Pre-commit, husky og lefthook](docs/pre-commit.md)
- [GitHub Actions](docs/github-actions.md)
- [Unntak](docs/unntak.md)
- [Når fnr-guard finner et nummer](docs/nar-noe-blir-funnet.md)

## Kommandoer

| Kommando | Hva den gjør |
|---|---|
| `fnr-guard --staged` | Skanner endringer som er lagt til for commit |
| `fnr-guard --range A..B` | Skanner hver commit i B som ikke er i A |
| `fnr-guard --all` | Skanner alle sporede filer i alle roots |
| `fnr-guard --history` | Skanner hver commit i historikken, alle brancher |
| `fnr-guard init [--force]` | Lager `.fnr-guard.json` |
| `fnr-guard install [--force]` | Installerer hooken i alle roots |
| `fnr-guard uninstall` | Fjerner hooken |
| `fnr-guard status` | Viser om config er gyldig og hooken er aktiv |

Exit-kode 0 betyr ingen funn, 1 betyr funn (eller at config nettopp ble laget), og 2 betyr feil.

## Slik virker det

fnr-guard finner 11 siffer på rad, også med mellomrom, bindestrek eller punktum mellom de seks første og de fem siste. Den validerer numrene med en kopi av [@navikt/fnrvalidator](https://github.com/navikt/fnrvalidator) (`src/fnrvalidator.mjs`). Filnavn skannes også. PDF-er skannes når `pdftotext` er installert (`brew install poppler`).

## Utvikling

```sh
npm test
```

Testene lager gyldige numre mens de kjører. Skriv aldri et gyldig fødselsnummer rett inn i en testfil. Da stopper fnr-guard sin egen commit, og nummeret kan tilhøre en ekte person.

Ved oppdatering av `src/fnrvalidator.mjs`: sammenlign med ny versjon av `validator.ts` i fnrvalidator og kjør testene.

## Eierskap

Team Holmes eier repoet. Spørsmål og feil meldes som issue. Sikkerhetsproblemer meldes som beskrevet i [SECURITY.md](SECURITY.md).
