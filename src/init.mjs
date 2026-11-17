import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKJEMA = "https://raw.githubusercontent.com/navikt/fnr-guard/main/schema/fnr-guard.schema.json";

const STØYMAPPER = new Map([
  ["node_modules", "Tredjepartskode installert av npm"],
  ["dist", "Byggeresultat generert av prosjektet"],
  ["build", "Byggeresultat generert av prosjektet"],
  [".gradle", "Mellomlagrede filer generert av Gradle"],
  ["target", "Byggeresultat generert av prosjektverktøy"],
  [".next", "Byggeresultat generert av Next.js"],
  ["out", "Byggeresultat generert av prosjektverktøy"],
  ["coverage", "Dekningsrapporter generert av testkjøring"],
  ["vendor", "Tredjepartskode levert med prosjektet"],
  [".venv", "Python-avhengigheter installert i virtuelt miljø"],
]);

function erMappe(sti) {
  try {
    return lstatSync(sti).isDirectory();
  } catch {
    return false;
  }
}

function erGitRot(sti) {
  const gitSti = join(sti, ".git");
  try {
    const info = lstatSync(gitSti);
    return info.isDirectory() || info.isFile();
  } catch {
    return false;
  }
}

function mapperUnder(rot, maksDybde, { hoppOverSkjulte = false } = {}) {
  const treff = [];
  const gå = (mappe, dybde) => {
    if (dybde >= maksDybde) return;
    let oppføringer;
    try {
      oppføringer = readdirSync(mappe, { withFileTypes: true });
    } catch {
      return;
    }
    for (const oppføring of oppføringer) {
      if (!oppføring.isDirectory() || oppføring.name === ".git") continue;
      if (hoppOverSkjulte && (oppføring.name.startsWith(".") || oppføring.name === "node_modules")) continue;
      const sti = join(mappe, oppføring.name);
      treff.push({ sti, navn: oppføring.name, dybde: dybde + 1 });
      gå(sti, dybde + 1);
    }
  };
  gå(rot, 0);
  return treff;
}

function lesTekst(sti) {
  try {
    return readFileSync(sti, "utf8");
  } catch {
    return null;
  }
}

function pakkerFraPackageJson(rot) {
  const tekst = lesTekst(join(rot, "package.json"));
  if (!tekst) return null;
  try {
    const json = JSON.parse(tekst);
    const workspaces = Array.isArray(json.workspaces) ? json.workspaces : json.workspaces?.packages;
    return Array.isArray(workspaces) ? workspaces : null;
  } catch {
    return null;
  }
}

function pakkerFraPnpm(rot) {
  const tekst = lesTekst(join(rot, "pnpm-workspace.yaml"));
  if (tekst === null) return null;
  const pakker = [];
  let leserPakker = false;
  for (const linje of tekst.split(/\r?\n/)) {
    if (/^\s*#/.test(linje)) continue;
    if (/^packages\s*:\s*(?:#.*)?$/.test(linje)) {
      leserPakker = true;
      continue;
    }
    if (leserPakker && /^\S/.test(linje)) leserPakker = false;
    if (leserPakker) {
      const match = /^\s*-\s*["']?([^"'#\s]+)["']?/.exec(linje);
      if (match) pakker.push(match[1]);
    }
  }
  return pakker;
}

function pakkerFraGradle(rot) {
  for (const fil of ["settings.gradle", "settings.gradle.kts"]) {
    const tekst = lesTekst(join(rot, fil));
    if (tekst === null) continue;
    const pakker = [];
    for (const match of tekst.matchAll(/\binclude\s*(?:\(([^)]*)\)|([^\n;]+))/g)) {
      const argumenti = match[1] ?? match[2];
      for (const modul of argumenti.matchAll(/["'](:[^"']+)["']/g)) pakker.push(modul[1]);
    }
    return pakker;
  }
  return null;
}

function pakkerFraGoWork(rot) {
  const tekst = lesTekst(join(rot, "go.work"));
  if (tekst === null) return null;
  const pakker = [];
  let iUseBlokk = false;
  for (const linje of tekst.split(/\r?\n/)) {
    const ren = linje.replace(/\/\/.*$/, "").trim();
    if (!ren) continue;
    if (/^use\s*\(/.test(ren)) {
      iUseBlokk = true;
      const rest = ren.slice(ren.indexOf("(") + 1).replace(/\)$/, "").trim();
      if (rest) pakker.push(rest);
      if (ren.endsWith(")")) iUseBlokk = false;
    } else if (iUseBlokk && ren === ")") {
      iUseBlokk = false;
    } else if (iUseBlokk) {
      pakker.push(ren);
    } else {
      const match = /^use\s+(.+)$/.exec(ren);
      if (match) pakker.push(match[1].trim());
    }
  }
  return pakker;
}

function gitRøtter(rot, mapper) {
  const røtter = [];
  for (const mappe of mapper) {
    if (mappe.dybde !== 1 || mappe.navn === "node_modules" || mappe.navn.startsWith(".")) continue;
    const barn = mapper.filter((kandidat) => kandidat.dybde === 2 && kandidat.sti.startsWith(`${mappe.sti}${sep}`));
    if (barn.filter((kandidat) => erGitRot(kandidat.sti)).length >= 2) {
      røtter.push(relative(rot, mappe.sti).split(sep).join("/") + "/*");
    }
  }
  return røtter.sort();
}

function hookFunn(rot, arbeidsrøtter) {
  const funn = [];
  const sett = new Set();
  for (const arbeidsrot of arbeidsrøtter) {
    const husky = join(arbeidsrot, ".husky");
    if (erMappe(husky) && !sett.has("husky")) {
      funn.push("Husky er satt opp; legg fnr-guard til i pre-commit-hooken.");
      sett.add("husky");
    }
    const lefthook = ["lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml"]
      .some((fil) => existsSync(join(arbeidsrot, fil)));
    if (lefthook && !sett.has("lefthook")) {
      funn.push("Lefthook er satt opp; legg fnr-guard til i pre-commit-hooken.");
      sett.add("lefthook");
    }
    if (existsSync(join(arbeidsrot, ".pre-commit-config.yaml")) && !sett.has("pre-commit")) {
      funn.push("pre-commit er satt opp; legg fnr-guard til i hook-konfigurasjonen.");
      sett.add("pre-commit");
    }
    const gitConfig = lesTekst(join(arbeidsrot, ".git", "config"));
    if (gitConfig && /^\s*hooksPath\s*=/im.test(gitConfig) && !sett.has("hooksPath")) {
      funn.push("Git bruker en egendefinert hooksPath; integrer fnr-guard der.");
      sett.add("hooksPath");
    }
  }
  return funn;
}

/** Foreslår fnr-guard-konfigurasjon uten å skrive filer. */
export function foreslaConfig(rot) {
  const arbeidsrot = rot;
  const mapperForRepo = mapperUnder(arbeidsrot, 2, { hoppOverSkjulte: true });
  const flereRepoer = gitRøtter(arbeidsrot, mapperForRepo);
  const harGitRot = erGitRot(arbeidsrot);
  const roots = flereRepoer.length
    ? [...(harGitRot ? ["."] : []), ...flereRepoer]
    : ["."];

  const funn = [];
  if (flereRepoer.length) {
    for (const mønster of flereRepoer) funn.push(`Fant flere Git-repoer under ${mønster.slice(0, -2)}/.`);
  }
  if (harGitRot) funn.push("Fant Git-repo i prosjektroten.");

  const packageWorkspaces = pakkerFraPackageJson(arbeidsrot);
  if (packageWorkspaces) funn.push(`Fant npm-workspaces (${packageWorkspaces.length} pakkemønstre).`);
  const pnpmWorkspaces = pakkerFraPnpm(arbeidsrot);
  if (pnpmWorkspaces) funn.push(`Fant pnpm-workspace (${pnpmWorkspaces.length} pakkemønstre).`);
  const gradleWorkspaces = pakkerFraGradle(arbeidsrot);
  if (gradleWorkspaces) funn.push(`Fant Gradle-moduler (${gradleWorkspaces.length}).`);
  const goWorkspaces = pakkerFraGoWork(arbeidsrot);
  if (goWorkspaces) funn.push(`Fant go.work (${goWorkspaces.length} moduler).`);

  const støyNavn = new Set();
  for (const mappe of mapperUnder(arbeidsrot, 4)) {
    if (STØYMAPPER.has(mappe.navn)) støyNavn.add(mappe.navn);
  }
  const exclude = [...støyNavn]
    .map((navn) => ({ mønster: `**/${navn}/**`, begrunnelse: STØYMAPPER.get(navn) }))
    .sort((a, b) => a.mønster.localeCompare(b.mønster, "en"));

  const hookArbeidsrøtter = [arbeidsrot, ...mapperForRepo.filter((mappe) => erGitRot(mappe.sti)).map((mappe) => mappe.sti)];
  funn.push(...hookFunn(arbeidsrot, hookArbeidsrøtter));

  return {
    config: {
      "$schema": SKJEMA,
      versjon: 1,
      roots: roots.sort((a, b) => (a === "." ? -1 : b === "." ? 1 : a.localeCompare(b))),
      include: ["**"],
      exclude,
      ekstraBlokkerteTyper: [],
      pdf: true,
      maksFilstørrelseKb: 2048,
      manglendeNode: "stopp",
    },
    funn,
  };
}
