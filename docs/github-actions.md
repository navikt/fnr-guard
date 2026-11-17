# GitHub Actions

Action-en skanner hver commit i en PR eller push for seg, også merge-commits. Et nummer som legges til i én commit og fjernes i den neste blir dermed også funnet.

## Oppsett

`.github/workflows/fnr-guard.yml`:

```yaml
name: fnr-guard

on:
  pull_request:
  push:
    branches: [main]
  merge_group:

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

- **`fetch-depth: 0`** er påkrevd. Uten hele historikken kan ikke action-en skanne hver commit, og den stopper med en feilmelding.
- **`persist-credentials: false`** hindrer at tokenet blir liggende i `.git/config`. fnr-guard trenger det ikke.
- **Bruk commit-SHA, ikke tag.** Finn SHA-en til siste release under [Releases](https://github.com/navikt/fnr-guard/releases). Dependabot oppdaterer den for deg.
- Action-en trenger ikke tilgang til GitHub Packages.

## Gjør sjekken påkrevd

Under **Settings → Branches → Branch protection rules** (eller Rulesets) legger du jobben `fnr-guard` til som påkrevd statussjekk. Først da kan en PR med et fødselsnummer ikke merges.

## Inputs

| Input | Standard | Beskrivelse |
|---|---|---|
| `modus` | `auto` | `auto` skanner commitene i PR-en eller pushen. `all` skanner alle filer. `history` skanner hele historikken. |
| `node-version` | `20` | Node-versjonen fnr-guard kjøres med. |
| `config-fra-base` | `true` | Les config fra base-branchen. La den stå på `true`. |

## Hva som skannes

| Hendelse | Skannes |
|---|---|
| `pull_request` | Hver commit fra base til head i PR-en |
| `push` | Hver commit fra forrige til ny head |
| `merge_group` | Hver commit i merge-køen |
| Ny branch, eller annen hendelse | Alle sporede filer (`--all`) |

## Config fra base-branchen

Action-en leser `.fnr-guard.json` fra base-commiten. Endringer i config i en PR gjelder derfor først etter merge. Dette hindrer at en PR legger til en exclude og et nummer i samme endring.

Legg gjerne `.fnr-guard.json` i `CODEOWNERS`, slik at endringer i config krever godkjenning.

## Engangsskanning av hele historikken

Kjør en gang med `modus: history`, for eksempel i en egen workflow med `workflow_dispatch`:

```yaml
on: workflow_dispatch
# …
      - uses: navikt/fnr-guard@<sha> # v1
        with:
          modus: history
```

## Utskrift

Funn vises som feil i PR-en (annotations) med fil, linje og type. Selve nummeret og innholdet i linjen vises aldri, heller ikke i loggen.

Finner action-en noe, les [Når fnr-guard finner et nummer](nar-noe-blir-funnet.md).
