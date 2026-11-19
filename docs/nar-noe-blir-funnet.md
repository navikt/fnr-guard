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
4. **Fjern nummeret fra historikken.** Det holder ikke å lage en ny commit som sletter det. Bruk [git filter-repo](https://github.com/newren/git-filter-repo) og force-push. Alle som har klonet repoet, må klone det på nytt. Klon også selv på nytt, eller tøm refloggen (se [Nummeret ligger fortsatt lokalt](#nummeret-ligger-fortsatt-lokalt)).
5. **Be GitHub Support fjerne cachede visninger** og PR-referanser. Fjernede commits kan fortsatt åpnes via PR-en eller SHA-en til GitHub har ryddet opp.

## Nummeret ligger fortsatt lokalt

Git husker i refloggen hvor `HEAD` og hver branch har pekt. Commits du har skrevet om med `rebase` eller `commit --amend`, ligger derfor fortsatt i klonen din i ukevis, til refloggen utløper og Git rydder. Refloggen blir aldri pushet, men nummeret ligger på maskinen din til det blir slettet.

`git filter-repo` rydder opp i klonen den kjører i. Andre kloner av repoet, også den du vanligvis jobber i, har fortsatt nummeret.

Det enkleste er å slette disse klonene og klone på nytt. Vil du beholde klonen, tøm refloggen og slett objektene:

```sh
git reflog expire --expire=now --all
git gc --prune=now
```

> [!WARNING]
> Kommandoene sletter for godt alt du kan angre til via refloggen, også arbeid som ikke har med nummeret å gjøre. Push eller sikre det du vil beholde først.

`fnr-guard --history` skanner ikke refloggen. Den kan derfor si at repoet er rent selv om nummeret fortsatt ligger lokalt.

## Finne alle funn i et repo

```sh
fnr-guard --all       # filer slik de er nå
fnr-guard --history   # alle commits i alle brancher og tagger
```

Commits som bare finnes i refloggen, blir ikke skannet.

Utskriften viser commit, fil, linje og type, aldri selve nummeret.
