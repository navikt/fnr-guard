// 🔴 Rød sone: bestemmer hva som blir skannet og hva som skrives ut. Gå gjennom nøye.
//
// Moduser (kjøres fra et git-repo):
//   --staged      linjer som legges til i staged diff (pre-commit)
//   --range A..B  hvert commit i B som ikke er i A (CI)
//   --all         alle sporede filer i arbeidstreet, i alle roots
//   --history     hvert commit i hele historikken, alle brancher, i alle roots
//
// Exit-kode: 0 = ingen funn, 1 = funn eller ny config generert, 2 = feil.
// Utskriften inneholder aldri et gyldig nummer, heller ikke i feilmeldinger,
// og aldri innholdet i linjen der nummeret står.

import { closeSync, existsSync, openSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { finnIRad, skannTekst, masker } from "./kjerne.mjs";
import { erUnntatt, harUgyldigMarkor, MARKOR } from "./unntak.mjs";
import { CONFIGFIL, hentConfig, tilFil } from "./config.mjs";
import { configRef, kanSkriveConfig } from "./miljo.mjs";
import { foreslaConfig } from "./init.mjs";
import { lagGit, tillagteLinjer, endredeFiler, arbeidstre, pdfTilTekst, erPdf } from "./git-kilder.mjs";

const BIT = 1024 * 1024;

const tilPosix = (sti) => sti.split(sep).join("/");

/** Utvider roots (f.eks. "repos/*") til absolutte stier til git-repoer. */
export function utvidRoots(roots, basis) {
  const funnet = new Set();
  for (const root of roots) {
    let kandidater = [basis];
    for (const segment of root.split("/").filter((s) => s !== "" && s !== ".")) {
      const neste = [];
      for (const dir of kandidater) {
        if (segment.includes("*")) {
          const mønster = new RegExp(`^${segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`);
          for (const navn of readdirSync(dir, { withFileTypes: true })) {
            if (navn.isDirectory() && !navn.name.startsWith(".") && mønster.test(navn.name)) neste.push(join(dir, navn.name));
          }
        } else if (statSync(join(dir, segment), { throwIfNoEntry: false })?.isDirectory()) {
          neste.push(join(dir, segment));
        }
      }
      kandidater = neste;
    }
    for (const dir of kandidater) if (existsSync(join(dir, ".git"))) funnet.add(dir);
  }
  return [...funnet].sort();
}

function lagSkanner(config) {
  const ekstraTyper = config.ekstraBlokkerteTyper;
  const ugyldigeMarkorer = { antall: 0 };

  const linjeFunn = (rad) => {
    const treff = finnIRad(rad, ekstraTyper);
    if (treff.length === 0 || erUnntatt(rad)) return [];
    if (harUgyldigMarkor(rad)) ugyldigeMarkorer.antall++;
    return treff.map(({ type }) => type);
  };

  const tekstFunn = (tekst, forsteLinje = 1) => skannTekst(tekst, { ekstraTyper, erUnntatt, forsteLinje });

  // Filnavn og PDF-er kan ikke unntas med markør.
  const filnavnFunn = (sti) => finnIRad(sti, ekstraTyper).map(({ type }) => type);
  const pdfFunn = (tekst) => skannTekst(tekst, { ekstraTyper });

  return { linjeFunn, tekstFunn, filnavnFunn, pdfFunn, ugyldigeMarkorer };
}

/** Skanner store filer bit for bit, så maksFilstørrelseKb aldri gjør at noe hoppes over. */
function skannStorFil(full, skanner) {
  const fd = openSync(full, "r");
  const funn = [];
  try {
    const buffer = Buffer.alloc(BIT);
    let rest = "";
    let linje = 1;
    let forste = true;
    for (;;) {
      const lest = readSync(fd, buffer, 0, BIT, null);
      if (lest === 0) break;
      const bit = buffer.subarray(0, lest);
      if (forste && bit.includes(0)) return []; // binærfil
      forste = false;
      const tekst = rest + bit.toString("utf8");
      const slutt = tekst.lastIndexOf("\n");
      if (slutt === -1) {
        rest = tekst;
        continue;
      }
      const hele = tekst.slice(0, slutt);
      rest = tekst.slice(slutt + 1);
      funn.push(...skanner.tekstFunn(hele, linje));
      linje += hele.split("\n").length;
    }
    if (rest) funn.push(...skanner.tekstFunn(rest, linje));
  } finally {
    closeSync(fd);
  }
  return funn;
}

function skannKilde(kilde, git, config, skanner) {
  const funn = [];
  for (const { commit, fil, linje, tekst } of tillagteLinjer(kilde, git)) {
    if (!config.skalSkanne(fil)) continue;
    for (const type of skanner.linjeFunn(tekst)) funn.push({ commit, fil, linje, type });
  }
  for (const { commit, sti, les } of endredeFiler(kilde, git)) {
    if (!config.skalSkanne(sti)) continue;
    for (const type of skanner.filnavnFunn(sti)) funn.push({ commit, fil: sti, linje: 0, type, filnavn: true });
    if (config.pdf && erPdf(sti)) {
      const tekst = pdfTilTekst(les());
      if (tekst) for (const f of skanner.pdfFunn(tekst)) funn.push({ commit, fil: sti, ...f, pdf: true });
    }
  }
  return funn;
}

function skannArbeidstre(git, cwd, config, skanner) {
  const funn = [];
  const grense = config.maksFilstørrelseKb * 1024;
  for (const fil of arbeidstre(git, cwd)) {
    const { sti } = fil;
    if (!config.skalSkanne(sti)) continue;
    for (const type of skanner.filnavnFunn(sti)) funn.push({ fil: sti, linje: 0, type, filnavn: true });
    if (erPdf(sti) && !fil.symlenke) {
      if (!config.pdf) continue;
      const tekst = pdfTilTekst(fil.les());
      if (tekst) for (const f of skanner.pdfFunn(tekst)) funn.push({ fil: sti, ...f, pdf: true });
      continue;
    }
    if (fil.storrelse > grense) {
      for (const f of skannStorFil(fil.full, skanner)) funn.push({ fil: sti, ...f });
      continue;
    }
    const buffer = fil.les();
    if (!buffer || buffer.includes(0)) continue;
    for (const f of skanner.tekstFunn(buffer.toString("utf8"))) funn.push({ fil: sti, ...f });
  }
  return funn;
}

function skrivFunn(funn, ut, env) {
  for (const f of funn) {
    const fil = masker(f.root ? `${f.root}/${f.fil}` : f.fil);
    const sted = f.filnavn ? `${fil} (filnavn)` : `${fil}:${f.linje}`;
    const prefiks = f.commit ? `${f.commit.slice(0, 10)} ` : "";
    ut.error(`  ${prefiks}${sted}  type=${f.type}${f.pdf ? " (pdf)" : ""}`);
    if (env.GITHUB_ACTIONS === "true") {
      const linje = f.linje > 0 ? `,line=${f.linje}` : "";
      const commit = f.commit ? ` i commit ${f.commit.slice(0, 10)}` : "";
      ut.log(`::error file=${fil}${linje}::Gyldig ${f.type} funnet${commit}`);
    }
  }
}

function lesModus(argv) {
  const [modus, verdi, ...rest] = argv;
  if (rest.length > 0) return null;
  if (modus === "--staged" && verdi === undefined) return { type: "staged" };
  if (modus === "--range" && verdi && !verdi.startsWith("-")) {
    // A...B betyr symmetrisk differanse i git log. Vi vil bare ha commits i B.
    return { type: "range", range: verdi.replace("...", "..") };
  }
  if (modus === "--all" && verdi === undefined) return { type: "alle" };
  if (modus === "--history" && verdi === undefined) return { type: "historikk" };
  return null;
}

function forsteKjoring(gitRot, ut) {
  const fil = join(gitRot, CONFIGFIL);
  const { config, funn } = foreslaConfig(gitRot);
  writeFileSync(fil, tilFil(config), { flag: "wx" });
  ut.error(`📝 fnr-guard: fant ingen ${CONFIGFIL}. Den er laget i ${gitRot}.\n`);
  for (const linje of funn) ut.error(`  • ${linje}`);
  ut.error(`
Se over fila, sjekk den inn i git og kjør fnr-guard på nytt.
Dokumentasjon: https://github.com/navikt/fnr-guard/blob/main/docs/konfigurasjon.md
`);
  return 1;
}

export function kjorScan(argv, { cwd = process.cwd(), env = process.env, ut = console } = {}) {
  const modus = lesModus(argv);
  if (!modus) {
    ut.error("Bruk: fnr-guard scan --staged | --range A..B | --all | --history");
    return 2;
  }

  const git = lagGit(cwd);
  let gitRot;
  try {
    gitRot = git.tekst(["rev-parse", "--show-toplevel"]).trim();
  } catch {
    ut.error("🛑 fnr-guard: må kjøres i et git-repo");
    return 2;
  }

  const ref = configRef(env);
  const { config, kilde, dir } = hentConfig({ gitRot, git, ref });
  if (!kilde && !ref && kanSkriveConfig(env)) return forsteKjoring(gitRot, ut);
  if (ref) ut.error(`ℹ️  fnr-guard: bruker config fra ${kilde ?? "standardverdier"} (base-branchen). Endringer i config gjelder etter merge.`);

  const skanner = lagSkanner(config);
  let funn = [];
  if (modus.type === "staged" || modus.type === "range") {
    funn = skannKilde(modus, git, config, skanner);
  } else {
    // roots gjelder bare når vi står i repoet der config ligger. Fra et
    // underrepo skannes bare det repoet.
    const basis = dir && tilPosix(dir) === tilPosix(gitRot) ? dir : null;
    const repoer = basis ? utvidRoots(config.roots, basis) : [gitRot];
    if (basis && repoer.length === 0) {
      ut.error("🛑 fnr-guard: roots i config traff ingen git-repoer");
      return 2;
    }
    for (const repo of repoer) {
      const rel = tilPosix(relative(gitRot, repo));
      const g = lagGit(repo);
      const deler = modus.type === "alle" ? skannArbeidstre(g, repo, config, skanner) : skannKilde(modus, g, config, skanner);
      funn.push(...deler.map((f) => (rel ? { ...f, root: rel } : f)));
    }
  }

  // Samme nummer kan dukke opp flere ganger (f.eks. i en merge mot første forelder)
  const unike = [...new Map(funn.map((f) => [JSON.stringify(f), f])).values()];
  if (unike.length === 0) return 0;

  ut.error(`\n🛑 fnr-guard: fant ${unike.length === 1 ? "1 gyldig identnummer" : `${unike.length} gyldige identnumre`}:\n`);
  skrivFunn(unike, ut, env);
  ut.error(`
Fjern nummeret, eller bytt det med et syntetisk nummer fra Dolly eller Tenor.
Er det ikke et ekte identnummer, kan linjen unntas med en kommentar:
  ${MARKOR}: <begrunnelse på minst 10 tegn>`);
  if (skanner.ugyldigeMarkorer.antall > 0) {
    ut.error(`\n⚠️  ${skanner.ugyldigeMarkorer.antall === 1 ? "1 linje" : `${skanner.ugyldigeMarkorer.antall} linjer`} har ${MARKOR} uten gyldig begrunnelse.`);
  }
  ut.error("");
  return 1;
}

/** Kjører kjorScan og maskerer feilmeldinger, som kan inneholde filstier med numre. */
export function kjorScanTrygt(argv, opts = {}) {
  const ut = opts.ut ?? console;
  try {
    return kjorScan(argv, opts);
  } catch (e) {
    ut.error(`🛑 fnr-guard: feil under skanning: ${masker(e.message)}`);
    return 2;
  }
}
