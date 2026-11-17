# Når fnr-guard finner et nummer

## Hooken stoppet commiten

Nummeret er ikke i git ennå.

1. Fjern nummeret, eller bytt det med et syntetisk nummer fra Dolly eller Tenor.
2. Er det ikke et identnummer, se [unntak](unntak.md).
3. Legg til endringen med `git add` og commit på nytt.

Ikke bruk `--no-verify`. CI finner nummeret uansett, men da ligger det allerede på GitHub.

## CI fant et nummer

Nummeret er da pushet til GitHub. Er det ekte, er det et personvernavvik, ikke en vanlig byggfeil.

1. **Ikke merge.** Lukk PR-en.
2. **Avgjør om nummeret er ekte.** Er du i tvil, behandle det som ekte.
3. **Meld avviket** i Navs avvikssystem. Spør personvernombudet eller lederen din hvis du ikke vet hvor.
4. **Fjern nummeret fra historikken.** Det holder ikke å lage en ny commit som sletter det. Bruk [git filter-repo](https://github.com/newren/git-filter-repo) og force-push. Alle som har klonet repoet, må klone det på nytt.
5. **Be GitHub Support fjerne cachede visninger** og PR-referanser. Fjernede commits kan fortsatt åpnes via PR-en eller SHA-en til GitHub har ryddet opp.

## Finne alle funn i et repo

```sh
fnr-guard --all       # filer slik de er nå
fnr-guard --history   # alle commits i alle brancher
```

Utskriften viser commit, fil, linje og type, aldri selve nummeret.
