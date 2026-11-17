#!/usr/bin/env node
// fnr-guard: stopper commits som inneholder gyldige fødselsnumre eller D-numre.
// Se https://github.com/navikt/fnr-guard

import { existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { kjorScanTrygt, utvidRoots } from "../src/scan.mjs";
import { CONFIGFIL, hentConfig, tilFil } from "../src/config.mjs";
import { foreslaConfig } from "../src/init.mjs";
import { installer, avinstaller, status } from "../src/hooks.mjs";
import { lagGit } from "../src/git-kilder.mjs";
import { masker } from "../src/kjerne.mjs";

const HJELP = `fnr-guard: stopper gyldige fødselsnumre og D-numre før de havner i git

Bruk:
  fnr-guard [scan] --staged        skann endringer som er lagt til for commit
  fnr-guard [scan] --range A..B    skann hver commit i B som ikke er i A (CI)
  fnr-guard [scan] --all           skann alle sporede filer i alle roots
  fnr-guard [scan] --history       skann hele historikken i alle roots
  fnr-guard init [--force]         lag ${CONFIGFIL} ut fra mappestrukturen
  fnr-guard install [--force]      installer git-hooks i alle roots
  fnr-guard uninstall              fjern git-hooks fra alle roots
  fnr-guard status                 vis om hooken er aktiv og config er gyldig

Exit-kode: 0 = ingen funn, 1 = funn, 2 = feil.
Dokumentasjon: https://github.com/navikt/fnr-guard`;

function gitRot(cwd) {
  try {
    return lagGit(cwd).tekst(["rev-parse", "--show-toplevel"]).trim();
  } catch {
    return null;
  }
}

/** Repoene en kommando gjelder: alle roots hvis config ligger i dette repoet, ellers bare dette. */
function repoer(cwd) {
  const rot = gitRot(cwd);
  if (!rot) throw new Error("må kjøres i et git-repo");
  const { config, dir } = hentConfig({ gitRot: rot, git: lagGit(rot) });
  const liste = dir === rot ? utvidRoots(config.roots, rot) : [rot];
  return { rot, config, liste: liste.length > 0 ? liste : [rot] };
}

const navn = (rot, repo) => relative(rot, repo) || ".";

function init(args, cwd) {
  const force = args.includes("--force");
  const rot = gitRot(cwd) ?? cwd;
  const fil = join(rot, CONFIGFIL);
  if (existsSync(fil) && !force) {
    console.error(`${CONFIGFIL} finnes allerede. Bruk --force for å skrive over.`);
    return 2;
  }
  const { config, funn } = foreslaConfig(rot);
  writeFileSync(fil, tilFil(config));
  console.log(`📝 Skrev ${fil}\n`);
  for (const linje of funn) console.log(`  • ${linje}`);
  console.log("\nSe over fila og sjekk den inn i git.");
  return 0;
}

function install(args, cwd) {
  const force = args.includes("--force");
  const { rot, config, liste } = repoer(cwd);
  let feil = 0;
  for (const repo of liste) {
    const r = installer(repo, { force, manglendeNode: config.manglendeNode });
    const ikon = r.status === "installert" || r.status === "allerede" ? "✓" : "⚠";
    console.log(`  ${ikon} ${navn(rot, repo)}: ${r.melding}`);
    if (r.snutt) console.log(`\n${r.snutt}\n`);
    if (r.status === "hoppet-over") feil++;
  }
  return feil > 0 ? 1 : 0;
}

function uninstall(cwd) {
  const { rot, liste } = repoer(cwd);
  for (const repo of liste) console.log(`  ${navn(rot, repo)}: ${avinstaller(repo).melding}`);
  return 0;
}

function visStatus(cwd) {
  let rot;
  let liste;
  try {
    ({ rot, liste } = repoer(cwd));
    console.log(`✓ config er gyldig`);
  } catch (e) {
    console.error(`✗ ${masker(e.message)}`);
    return 1;
  }
  let inaktive = 0;
  for (const repo of liste) {
    const s = status(repo);
    console.log(`  ${s.aktiv ? "✓" : "✗"} ${navn(rot, repo)}: ${s.melding}`);
    if (!s.aktiv) inaktive++;
  }
  return inaktive > 0 ? 1 : 0;
}

function main(argv) {
  const [kommando, ...rest] = argv;
  const cwd = process.cwd();
  if (kommando === undefined || kommando === "--help" || kommando === "-h" || kommando === "help") {
    console.log(HJELP);
    return kommando === undefined ? 2 : 0;
  }
  if (kommando === "scan") return kjorScanTrygt(rest);
  if (kommando.startsWith("--")) return kjorScanTrygt(argv);
  try {
    if (kommando === "init") return init(rest, cwd);
    if (kommando === "install") return install(rest, cwd);
    if (kommando === "uninstall") return uninstall(cwd);
    if (kommando === "status") return visStatus(cwd);
  } catch (e) {
    console.error(`🛑 fnr-guard: ${masker(e.message)}`);
    return 2;
  }
  console.error(`Ukjent kommando «${masker(kommando)}».\n\n${HJELP}`);
  return 2;
}

process.exitCode = main(process.argv.slice(2));
