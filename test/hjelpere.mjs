// Felles hjelpere for testene. Gyldige numre lages mens testene kjører, så
// ingen gyldige fnr står som tekst i repoet (fnr-guard skanner seg selv).
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "fnr-guard.mjs");

/** Lager et gyldig 11-sifret nummer fra 6 datosiffer. */
export function lagNummer(dato6, start = 100) {
  const v1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
  const v2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  for (let ind = start; ind < 1000; ind++) {
    const ni = (dato6 + String(ind).padStart(3, "0")).split("").map(Number);
    let k1 = 11 - (ni.reduce((s, n, i) => s + n * v1[i], 0) % 11);
    if (k1 === 11) k1 = 0;
    if (k1 === 10) continue;
    const ti = [...ni, k1];
    let k2 = 11 - (ti.reduce((s, n, i) => s + n * v2[i], 0) % 11);
    if (k2 === 11) k2 = 0;
    if (k2 === 10) continue;
    return ti.join("") + k2;
  }
  throw new Error("fant ikke gyldig nummer");
}

export const FNR = lagNummer("150385");
export const DNR = lagNummer("550385");
export const HNR = lagNummer("154385");

const GIT_C = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main"];

export function lagRepo(dir = mkdtempSync(join(tmpdir(), "fnr-guard-"))) {
  const g = (...a) => execFileSync("git", [...GIT_C, ...a], { cwd: dir }).toString().trim();
  g("init", "-q", "-b", "main");
  return { repo: dir, g };
}

/** Miljø uten CI-variabler fra omgivelsene. */
export function miljo(ekstra = {}) {
  const env = { ...process.env };
  for (const k of ["CI", "GITHUB_ACTIONS", "FNR_GUARD_HOOK", "FNR_GUARD_CONFIG_REF"]) delete env[k];
  return { ...env, ...ekstra };
}

export const kjor = (cwd, args, env = miljo({ CI: "true" })) =>
  spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env });
