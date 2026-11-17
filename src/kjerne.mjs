// 🔴 Rød sone: avgjør hvilke tall som stopper en commit. Gå gjennom nøye.
//
// Kjernen i fnr-guard. Finner kandidater på 11 siffer i tekst og avgjør om de
// skal blokkeres. Fødselsnummer (fnr) og D-nummer (dnr) blokkeres alltid.
// H-nummer (Dolly, +40 på måned) og T-nummer (Tenor, +80 på måned) er
// syntetiske og slippes gjennom, med mindre config legger dem til med
// `ekstraBlokkerteTyper`.
//
// Funnene inneholder aldri selve nummeret, bare linje og type, slik at ingen
// logg (lokal eller CI) gjengir persondata.
//
// Endret fra watson-developer: unntakslisten (.fnr-allowlist) er fjernet og
// erstattet av linjemarkøren i unntak.mjs, og ekstraTyper er lagt til.

// idnr() godtar alle typer (også hnr/tnr). Vi filtrerer på type selv.
import { idnr } from "./fnrvalidator.mjs";

const ALLTID_BLOKKERT = new Set(["fnr", "dnr"]);

// 6 siffer, valgfritt ett skilletegn (mellomrom, bindestrek, punktum), 5 siffer.
// Ingen siffer rett før eller etter, så lengre tall (12+ siffer) ikke gir treff.
const KANDIDAT = /(?<![0-9])([0-9]{6})[ .-]?([0-9]{5})(?![0-9])/g;

/**
 * Returnerer typen ("fnr", "dnr", eller en type fra ekstraTyper) hvis nummeret
 * skal blokkeres, ellers null. fnr og dnr blokkeres uansett hva ekstraTyper er.
 */
export function blokkertType(elleveSiffer, ekstraTyper = new Set()) {
  const resultat = idnr(elleveSiffer);
  if (resultat.status !== "valid") return null;
  if (ALLTID_BLOKKERT.has(resultat.type) || ekstraTyper.has(resultat.type)) return resultat.type;
  return null;
}

/** Alle blokkerte numre i én linje som { type, nummer }. */
export function finnIRad(rad, ekstraTyper = new Set()) {
  const funn = [];
  for (const treff of rad.matchAll(KANDIDAT)) {
    const nummer = treff[1] + treff[2];
    const type = blokkertType(nummer, ekstraTyper);
    if (type) funn.push({ type, nummer });
  }
  return funn;
}

/**
 * Skanner en tekst linje for linje. Returnerer [{ linje, type }] uten nummer.
 * `erUnntatt(rad)` avgjør om en hel linje er unntatt (linjemarkør).
 */
export function skannTekst(tekst, { ekstraTyper = new Set(), erUnntatt = () => false, forsteLinje = 1 } = {}) {
  const funn = [];
  tekst.split(/\r?\n/).forEach((rad, i) => {
    const treff = finnIRad(rad, ekstraTyper);
    if (treff.length === 0 || erUnntatt(rad)) return;
    for (const { type } of treff) funn.push({ linje: forsteLinje + i, type });
  });
  return funn;
}

/**
 * Erstatter alle gyldige identnumre (alle typer, også hnr/tnr) i en tekst
 * (filnavn, feilmeldinger) med stjerner før utskrift. Maskering er bevisst
 * bredere enn blokkering: ingenting som ligner et identnummer skal i logger.
 */
export function masker(tekst) {
  return String(tekst).replace(KANDIDAT, (hele, a, b) =>
    idnr(a + b).status === "valid" ? "*".repeat(hele.length) : hele,
  );
}
