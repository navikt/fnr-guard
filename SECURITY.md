# Sikkerhet

## Melde sårbarheter

Ikke opprett et offentlig issue for sårbarheter. Bruk [GitHub Security Advisories](https://github.com/navikt/fnr-guard/security/advisories/new), eller følg Navs [retningslinjer for å melde sikkerhetsproblemer](https://www.nav.no/.well-known/security.txt).

Eksempler på sårbarheter: måter å få fnr-guard til å slippe gjennom gyldige fødselsnumre uten at det synes, eller utskrift som lekker numre.

## Har du funnet et fødselsnummer i dette repoet

Meld det med en security advisory, ikke som issue eller PR. Se [Når fnr-guard finner et nummer](docs/nar-noe-blir-funnet.md).

## Hva fnr-guard gjør og ikke gjør

- fnr-guard leser filer og git-historikk lokalt. Den gjør ingen nettverkskall og sender ingen telemetri.
- Utskriften inneholder aldri numre eller innholdet i linjer med funn.
- Hooken kan omgås med `--no-verify`. CI er det som håndhever.
