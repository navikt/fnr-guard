# Unntak

Noen tall er gyldige fødselsnumre eller D-numre matematisk, uten å tilhøre noen. Det kan være et tall fra en spesifikasjon, et tilfeldig generert testnummer, eller noe som bare ser ut som et fødselsnummer, for eksempel en ID fra et annet system.

## Bytt heller nummeret

Bruk syntetiske numre fra [Dolly](https://dolly.ekstern.dev.nav.no) (H-nummer) eller Tenor (T-nummer). fnr-guard slipper dem gjennom, og de kan aldri tilhøre en ekte person.

## Markør på linjen

Må tallet stå, legg en markør med begrunnelse på samme linje:

```kotlin
val id = "…" // fnr-guard-ignore: tilfeldig generert i testen, ikke en person
```

```html
<td>…</td> <!-- fnr-guard-ignore: eksempel fra skjemaspesifikasjonen -->
```

```yaml
ident: "…" # fnr-guard-ignore: generert av testdatabyggeren
```

Vanlig JSON har ikke kommentarer. Der må du bytte til et syntetisk nummer, eller bruke JSONC eller kode i stedet.

### Regler

- Markøren skrives `fnr-guard-ignore:` med kolon.
- Begrunnelsen må være minst 10 tegn. Uten den gjelder ikke unntaket, og fnr-guard advarer.
- Markøren gjelder bare linjen den står på.
- Filnavn og PDF-er kan ikke unntas.

### Hvorfor ikke en unntaksliste

Tidligere versjoner hadde en `.fnr-allowlist` med numrene. I et public repo publiserer en slik liste numrene, og en hash hjelper ikke: det finnes så få gyldige fødselsnumre at alle kan regnes ut på kort tid. Markøren lagrer ingen numre, og unntaket er synlig i diffen der det brukes.

## Vær sikker før du unntar

Et gyldig nummer kan tilhøre en ekte person, selv om du tror det er laget. Er du i tvil, bytt det ut.
