// 🔴 Rød sone: avgjør hvilke linjer som slipper gjennom selv om de har treff.
//
// Et nummer som ser ut som et gyldig fnr eller D-nummer, men ikke tilhører en
// person, kan unntas med en markør på samme linje:
//
//   val id = "…" // fnr-guard-ignore: generert testnummer, ikke ekte person
//
// Regler:
//   - Markøren gjelder bare linjen den står på.
//   - Det må stå en begrunnelse på minst MIN_BEGRUNNELSE tegn. Uten
//     begrunnelse er linjen IKKE unntatt (feiler trygt).
//   - Ingen numre lagres noe sted. Unntaket er synlig i diffen der det brukes.
//   - Filnavn og PDF-innhold kan ikke unntas.

export const MARKOR = "fnr-guard-ignore";
export const MIN_BEGRUNNELSE = 10;

// Avsluttende kommentartegn som kan stå etter begrunnelsen i ulike språk.
const KOMMENTARSLUTT = /\s*(?:\*\/|-->|%>|#}|}}|\*\)|-})\s*$/;
const MARKOR_REGEX = new RegExp(`${MARKOR}:([^\\n]*)$`);

/** Begrunnelsen fra markøren, eller null hvis linjen ikke har markør. */
export function begrunnelse(rad) {
  const treff = MARKOR_REGEX.exec(rad);
  if (!treff) return null;
  return treff[1].replace(KOMMENTARSLUTT, "").trim();
}

/** True bare når linjen har markør med gyldig begrunnelse. */
export function erUnntatt(rad) {
  const tekst = begrunnelse(rad);
  return tekst !== null && tekst.length >= MIN_BEGRUNNELSE;
}

/** True når linjen har markøren, men begrunnelsen mangler eller er for kort. */
export function harUgyldigMarkor(rad) {
  if (!rad.includes(MARKOR)) return false;
  const tekst = begrunnelse(rad);
  return tekst === null || tekst.length < MIN_BEGRUNNELSE;
}
