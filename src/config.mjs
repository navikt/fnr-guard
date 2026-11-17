// 🔴 Rød sone: config kan svekke vernet. Gå gjennom nøye.
//
// Leser og validerer .fnr-guard.json. Reglene under er harde feil. En config
// som ikke kan valideres stopper alltid kjøringen, og ingenting godkjennes
// stille:
//   - ukjente felt
//   - exclude uten begrunnelse, eller som treffer testdata eller mocks
//   - roots, include eller exclude med `..`, absolutt sti eller backslash
//   - ekstraBlokkerteTyper utenfor hnr/tnr (fnr og dnr kan ikke slås av)
//
// I CI leses config fra base-branchen (se miljo.mjs), aldri fra PR-en selv.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { parseJsonc } from "./jsonc.mjs";
import { lagMatcher, matcherNoen } from "./glob.mjs";

export const CONFIGFIL = ".fnr-guard.json";
export const SCHEMA_URL = "https://raw.githubusercontent.com/navikt/fnr-guard/main/schema/fnr-guard.schema.json";

export const STANDARD = Object.freeze({
  versjon: 1,
  roots: ["."],
  include: ["**"],
  exclude: [],
  ekstraBlokkerteTyper: [],
  pdf: true,
  maksFilstørrelseKb: 2048,
  manglendeNode: "stopp",
});

const FELT = new Set(["$schema", ...Object.keys(STANDARD)]);
const EKSTRA_TYPER = new Set(["hnr", "tnr"]);
const MIN_BEGRUNNELSE = 10;
const MAKS_KB = 102400;

// Stier der testdata og mocks typisk ligger. En exclude som treffer noen av
// disse avvises: det er der ekte fnr oftest havner.
const TESTDATA_PROBER = [
  "test/a.json",
  "tests/a.json",
  "src/test/a.kt",
  "src/test/resources/a.json",
  "src/testFixtures/a.kt",
  "src/__tests__/a.ts",
  "src/__mocks__/a.ts",
  "app/mocks/a.ts",
  "app/mock/a.ts",
  "src/mockdata/a.json",
  "testdata/a.json",
  "src/testdata/a.json",
  "fixtures/a.json",
  "src/a.test.ts",
  "src/a.spec.ts",
  "src/aTest.kt",
  "src/main/a.kt",
];

function feil(melding) {
  return new Error(`${CONFIGFIL}: ${melding}`);
}

/** Avviser stier som kan peke ut av repoet. Gjelder roots og glob-mønstre. */
function sjekkSti(sti, felt) {
  if (typeof sti !== "string" || sti.trim() === "") throw feil(`${felt} må være en ikke-tom tekst`);
  if (sti.includes("\\")) throw feil(`${felt} kan ikke inneholde backslash, bruk /`);
  if (sti.startsWith("/") || /^[A-Za-z]:/.test(sti)) throw feil(`${felt} kan ikke være en absolutt sti`);
  if (sti.split("/").includes("..")) throw feil(`${felt} kan ikke inneholde ..`);
  if (sti.includes("\0")) throw feil(`${felt} inneholder ugyldige tegn`);
}

function lagMatcherSikkert(mønster, felt) {
  sjekkSti(mønster, felt);
  try {
    return lagMatcher(mønster);
  } catch (e) {
    throw feil(`${felt}: ${e.message}`);
  }
}

function liste(verdi, felt) {
  if (!Array.isArray(verdi)) throw feil(`${felt} må være en liste`);
  return verdi;
}

/**
 * Validerer et parset config-objekt og fyller inn standardverdier.
 * Returnerer et fryst objekt med ferdige matchere.
 */
export function validerConfig(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw feil("må være et JSON-objekt");
  for (const nøkkel of Object.keys(raw)) {
    if (!FELT.has(nøkkel)) throw feil(`ukjent felt «${nøkkel}»`);
  }
  if (raw.versjon !== 1) throw feil("versjon må være 1");

  const c = { ...STANDARD, ...raw };

  const roots = liste(c.roots, "roots");
  if (roots.length === 0) throw feil("roots kan ikke være tom");
  roots.forEach((r, i) => sjekkSti(r, `roots[${i}]`));

  const include = liste(c.include, "include");
  if (include.length === 0) throw feil("include kan ikke være tom");
  include.forEach((m, i) => lagMatcherSikkert(m, `include[${i}]`));

  const exclude = liste(c.exclude, "exclude");
  exclude.forEach((e, i) => {
    const felt = `exclude[${i}]`;
    if (e === null || typeof e !== "object" || Array.isArray(e)) {
      throw feil(`${felt} må være et objekt med «mønster» og «begrunnelse»`);
    }
    for (const nøkkel of Object.keys(e)) {
      if (nøkkel !== "mønster" && nøkkel !== "begrunnelse") throw feil(`${felt}: ukjent felt «${nøkkel}»`);
    }
    if (typeof e.begrunnelse !== "string" || e.begrunnelse.trim().length < MIN_BEGRUNNELSE) {
      throw feil(`${felt} mangler begrunnelse (minst ${MIN_BEGRUNNELSE} tegn)`);
    }
    const matcher = lagMatcherSikkert(e.mønster, `${felt}.mønster`);
    const treff = TESTDATA_PROBER.find((p) => matcher(p));
    if (treff) {
      throw feil(`${felt}.mønster «${e.mønster}» treffer testdata, mocks eller kildekode (${treff}). Testdata skal alltid skannes`);
    }
  });

  const typer = liste(c.ekstraBlokkerteTyper, "ekstraBlokkerteTyper");
  for (const t of typer) {
    if (!EKSTRA_TYPER.has(t)) throw feil(`ekstraBlokkerteTyper kan bare inneholde hnr og tnr (fnr og dnr blokkeres alltid)`);
  }
  if (new Set(typer).size !== typer.length) throw feil("ekstraBlokkerteTyper har duplikater");

  if (typeof c.pdf !== "boolean") throw feil("pdf må være true eller false");
  if (!Number.isInteger(c.maksFilstørrelseKb) || c.maksFilstørrelseKb < 1 || c.maksFilstørrelseKb > MAKS_KB) {
    throw feil(`maksFilstørrelseKb må være et heltall mellom 1 og ${MAKS_KB}`);
  }
  if (c.manglendeNode !== "stopp" && c.manglendeNode !== "advar") {
    throw feil("manglendeNode må være «stopp» eller «advar»");
  }

  const inkluder = matcherNoen(include);
  const ekskluder = matcherNoen(exclude.map((e) => e.mønster));

  return Object.freeze({
    versjon: 1,
    roots: [...roots],
    include: [...include],
    exclude: exclude.map((e) => ({ mønster: e.mønster, begrunnelse: e.begrunnelse })),
    ekstraBlokkerteTyper: new Set(typer),
    pdf: c.pdf,
    maksFilstørrelseKb: c.maksFilstørrelseKb,
    manglendeNode: c.manglendeNode,
    /** True hvis stien (relativ til git-roten) skal skannes. */
    skalSkanne: (sti) => inkluder(sti) && !ekskluder(sti),
  });
}

export function parseConfig(tekst) {
  let raw;
  try {
    raw = parseJsonc(tekst);
  } catch (e) {
    throw feil(`kunne ikke lese fila: ${e.message}`);
  }
  return validerConfig(raw);
}

/** Leter etter .fnr-guard.json fra `fra` og oppover. Returnerer stien eller null. */
export function finnConfigFil(fra) {
  let dir = fra;
  const { root } = parse(dir);
  for (;;) {
    const kandidat = join(dir, CONFIGFIL);
    if (existsSync(kandidat)) return kandidat;
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

/**
 * Henter config for et repo.
 *   - ref satt (CI): leses fra `git show <ref>:.fnr-guard.json`. Mangler den
 *     der, brukes standardverdier, selv om PR-en legger til en config.
 *   - ellers: nærmeste .fnr-guard.json fra git-roten og oppover.
 * Returnerer { config, kilde } der kilde er null når standardverdier brukes.
 */
export function hentConfig({ gitRot, git, ref = null }) {
  if (ref) {
    let tekst;
    try {
      tekst = git.tekst(["show", `${ref}:${CONFIGFIL}`]);
    } catch {
      return { config: validerConfig({ versjon: 1 }), kilde: null };
    }
    return { config: parseConfig(tekst), kilde: `${ref.slice(0, 10)}:${CONFIGFIL}` };
  }
  const fil = finnConfigFil(gitRot);
  if (!fil) return { config: validerConfig({ versjon: 1 }), kilde: null };
  return { config: parseConfig(readFileSync(fil, "utf8")), kilde: fil, dir: dirname(fil) };
}

/** Serialiserer et forslag fra init til fil, med $schema først. */
export function tilFil(forslag) {
  validerConfig(forslag); // aldri skriv en config vi selv ville avvist
  const { $schema, ...rest } = forslag;
  return JSON.stringify({ $schema: $schema ?? SCHEMA_URL, ...rest }, null, 2) + "\n";
}
