# Endringslogg

## 1.0.0

Første versjon som eget repo. Flyttet fra `navikt/watson-developer/scripts/fnr-guard`.

- CLI `fnr-guard` med `scan`, `init`, `install`, `uninstall` og `status`.
- Config i `.fnr-guard.json` med roots, include, exclude, ekstra blokkerte typer, PDF og filstørrelse.
- Config genereres ved første lokale kjøring.
- GitHub Action som leser config fra base-branchen.
- Linjemarkøren `fnr-guard-ignore:` erstatter `.fnr-allowlist`.
- Store filer skannes bit for bit i stedet for å bli hoppet over. Symlenker følges ikke.
- Alle gyldige identnumre maskeres i utskrift, også H- og T-numre.
