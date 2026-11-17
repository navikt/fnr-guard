# Pre-commit, husky og lefthook

Hooken stopper en commit før den blir laget. Den skanner bare linjer og filnavn som legges til, så den er rask også i store repoer.

## fnr-guard install

```sh
fnr-guard install
```

Dette gjør `install`:

1. Skriver hooks til `.git/fnr-guard/hooks/`.
2. Setter `core.hooksPath` til den mappen.
3. Sender alle andre hooks videre til repoets egne i `.git/hooks/`, så `commit-msg`, `pre-push` og andre virker som før.

Hooken kjører i `pre-commit` og `pre-merge-commit`.

Er `core.hooksPath` allerede satt, endrer `install` ingenting med mindre du bruker `--force`.

Med `roots` i config installeres hooken i alle repoene. Se [konfigurasjon](konfigurasjon.md#flere-repoer-i-én-mappe).

Sjekk at alt er på plass:

```sh
fnr-guard status
```

Fjern hooken:

```sh
fnr-guard uninstall
```

### Når node mangler

Hooken husker hvilken node den ble installert med. Finner den ikke den, prøver den `node` i `PATH`. Mangler begge, stopper hooken commiten. Setter du `"manglendeNode": "advar"` i config og kjører `install` på nytt, advarer hooken i stedet og slipper commiten gjennom. CI skanner den uansett.

### Når fnr-guard er oppdatert eller flyttet

Hooken peker på stien fnr-guard var installert i. Er den borte, stopper hooken og ber deg kjøre `fnr-guard install` på nytt.

## husky

Legg til i `.husky/pre-commit`:

```sh
FNR_GUARD_HOOK=1 npx fnr-guard scan --staged
```

Legg `@navikt/fnr-guard` til i `devDependencies`, så `npx` bruker versjonen i repoet.

## lefthook

Legg til i `lefthook.yml`:

```yaml
pre-commit:
  commands:
    fnr-guard:
      run: FNR_GUARD_HOOK=1 npx fnr-guard scan --staged
```

## Hvorfor FNR_GUARD_HOOK=1

Variabelen sier til fnr-guard at den kjører i en hook. Da lager den ikke config ved første kjøring, siden en commit ikke skal endre filer i arbeidstreet. Uten config brukes standardverdiene.

## Hooken er ikke nok alene

`git commit --no-verify` hopper over alle hooks. Bruk også [GitHub Action-en](github-actions.md).
