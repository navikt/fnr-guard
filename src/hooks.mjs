// Installerer fnr-guard som git-hook i ett repo.
//
// Hookene skrives til <git-common-dir>/fnr-guard/hooks/, og core.hooksPath
// peker dit. pre-commit og pre-merge-commit kjører `fnr-guard scan --staged`.
// Alle hooks sender videre til repoets egne hooks i .git/hooks, slik at
// eksisterende commit-msg, pre-push osv. virker som før.
//
// Bruker repoet husky eller lefthook, endres ingenting. Da returneres en
// snutt brukeren kan lime inn selv.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKANNENDE_HOOKS = ["pre-commit", "pre-merge-commit"];
const ANDRE_HOOKS = [
  "applypatch-msg",
  "pre-applypatch",
  "post-applypatch",
  "commit-msg",
  "prepare-commit-msg",
  "post-commit",
  "post-checkout",
  "post-merge",
  "post-rewrite",
  "pre-push",
  "pre-rebase",
  "push-to-checkout",
];
const LEFTHOOK_FILER = ["lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml"];

const STANDARD_BIN = fileURLToPath(new URL("../bin/fnr-guard.mjs", import.meta.url));

export const HUSKY_SNUTT = "FNR_GUARD_HOOK=1 npx fnr-guard scan --staged";
export const LEFTHOOK_SNUTT = `pre-commit:
  commands:
    fnr-guard:
      run: FNR_GUARD_HOOK=1 npx fnr-guard scan --staged`;

function git(repo, args) {
  return execFileSync("git", args, { cwd: repo, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
}

function hooksPath(repo) {
  try {
    return git(repo, ["config", "--get", "core.hooksPath"]) || null;
  } catch {
    return null; // ikke satt
  }
}

function fnrGuardHooksDir(repo) {
  const commonDir = git(repo, ["rev-parse", "--git-common-dir"]);
  return join(isAbsolute(commonDir) ? commonDir : resolve(repo, commonDir), "fnr-guard", "hooks");
}

const siter = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

function videresending() {
  return `repo_hook="$(git rev-parse --git-common-dir)/hooks/$navn"
if [ -x "$repo_hook" ]; then
  repo_hook="$(cd "$(dirname "$repo_hook")" && pwd)/$navn"
  # Unngå løkke hvis .git/hooks av en eller annen grunn er denne katalogen
  if [ "$repo_hook" != "$hooks_dir/$navn" ]; then
    exec "$repo_hook" "$@"
  fi
fi
exit 0
`;
}

function skannendeHook(navn, { nodeSti, binSti, manglendeNode }) {
  const vedManglendeNode =
    manglendeNode === "advar"
      ? `echo "⚠️  fnr-guard: node finnes ikke, så endringene ble IKKE skannet. CI skanner dem." >&2`
      : `echo "🛑 fnr-guard: node finnes ikke. Installer Node 20+ eller kjør fnr-guard install på nytt." >&2
  exit 1`;
  return `#!/usr/bin/env bash
# Generert av fnr-guard install. Ikke rediger, kjør fnr-guard install på nytt.
set -euo pipefail

navn=${siter(navn)}
hooks_dir="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
node_sti=${siter(nodeSti)}
bin_sti=${siter(binSti)}

# manglendeNode=${manglendeNode} ble lest fra config ved install. Hooken kan
# ikke lese config når node mangler.
if [ ! -x "$node_sti" ]; then
  node_sti="$(command -v node || true)"
fi
if [ -z "$node_sti" ]; then
  ${vedManglendeNode}
elif [ ! -f "$bin_sti" ]; then
  echo "🛑 fnr-guard: finner ikke $bin_sti. Kjør fnr-guard install på nytt." >&2
  exit 1
else
  FNR_GUARD_HOOK=1 "$node_sti" "$bin_sti" scan --staged
fi

${videresending()}`;
}

function videresendHook(navn) {
  return `#!/usr/bin/env bash
# Generert av fnr-guard install. Sender videre til repoets egen hook.
set -euo pipefail

navn=${siter(navn)}
hooks_dir="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"

${videresending()}`;
}

function finnHookVerktoy(repo, eksisterende) {
  if (existsSync(join(repo, ".husky")) || (eksisterende && /(^|\/)\.husky(\/|$)/.test(eksisterende))) return "husky";
  if (LEFTHOOK_FILER.some((f) => existsSync(join(repo, f)))) return "lefthook";
  return null;
}

/**
 * Installerer hookene i repoet.
 * @returns {{ status: "installert"|"allerede"|"hoppet-over"|"husky"|"lefthook", melding: string, snutt?: string }}
 */
export function installer(repo, { force = false, binSti = STANDARD_BIN, manglendeNode = "stopp", nodeSti = process.execPath } = {}) {
  const dir = fnrGuardHooksDir(repo);
  const eksisterende = hooksPath(repo);

  if (!force) {
    const verktoy = finnHookVerktoy(repo, eksisterende);
    if (verktoy === "husky") {
      return { status: "husky", melding: "Repoet bruker husky. Legg denne linjen i .husky/pre-commit:", snutt: HUSKY_SNUTT };
    }
    if (verktoy === "lefthook") {
      return { status: "lefthook", melding: "Repoet bruker lefthook. Legg dette i lefthook-config:", snutt: LEFTHOOK_SNUTT };
    }
    if (eksisterende && resolve(repo, eksisterende) !== dir) {
      return {
        status: "hoppet-over",
        melding: `core.hooksPath er allerede satt (${eksisterende}). Bruk --force for å overstyre.`,
      };
    }
  }

  const varInstallert = eksisterende && resolve(repo, eksisterende) === dir;
  mkdirSync(dir, { recursive: true });
  for (const navn of SKANNENDE_HOOKS) {
    const fil = join(dir, navn);
    writeFileSync(fil, skannendeHook(navn, { nodeSti, binSti, manglendeNode }));
    chmodSync(fil, 0o755);
  }
  for (const navn of ANDRE_HOOKS) {
    const fil = join(dir, navn);
    writeFileSync(fil, videresendHook(navn));
    chmodSync(fil, 0o755);
  }
  git(repo, ["config", "core.hooksPath", dir]);
  return varInstallert
    ? { status: "allerede", melding: "fnr-guard var allerede installert. Hookene er oppdatert." }
    : { status: "installert", melding: "fnr-guard er installert." };
}

/** Fjerner core.hooksPath bare hvis den peker til fnr-guard sin mappe. */
export function avinstaller(repo) {
  const dir = fnrGuardHooksDir(repo);
  const eksisterende = hooksPath(repo);
  if (!eksisterende || resolve(repo, eksisterende) !== dir) {
    return { status: "ikke-installert", melding: "fnr-guard er ikke installert i dette repoet." };
  }
  git(repo, ["config", "--unset", "core.hooksPath"]);
  rmSync(join(dir, ".."), { recursive: true, force: true });
  return { status: "fjernet", melding: "fnr-guard er fjernet." };
}

export function status(repo) {
  const dir = fnrGuardHooksDir(repo);
  const eksisterende = hooksPath(repo);
  const aktiv = Boolean(eksisterende) && resolve(repo, eksisterende) === dir && existsSync(join(dir, "pre-commit"));
  if (aktiv) return { aktiv, hooksPath: eksisterende, melding: "aktiv" };
  const verktoy = finnHookVerktoy(repo, eksisterende);
  if (verktoy) return { aktiv: false, hooksPath: eksisterende, melding: `bruker ${verktoy}, sjekk at fnr-guard står i pre-commit` };
  if (eksisterende) return { aktiv: false, hooksPath: eksisterende, melding: `core.hooksPath peker til ${eksisterende}` };
  return { aktiv: false, hooksPath: null, melding: "ikke installert" };
}
