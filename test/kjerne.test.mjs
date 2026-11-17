// Gyldige numre lages mens testen kjører. Ingen gyldige fnr står som tekst i
// filen, ellers ville fnr-guard stoppet sin egen commit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, chmodSync, statSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { blokkertType, skannTekst, masker } from "../src/kjerne.mjs";
import { parseDiff, parseNavneliste } from "../src/git-kilder.mjs";

const HER = dirname(fileURLToPath(import.meta.url));
const BIN = join(HER, "..", "bin", "fnr-guard.mjs");
// CI=true: ingen config genereres ved første kjøring. Uten base-ref leses config fra disk.
const ENV = { ...process.env, CI: "true", GITHUB_ACTIONS: "", FNR_GUARD_CONFIG_REF: "" };

/** Lager et gyldig 11-sifret nummer fra 6 datosiffer ved å finne individnummer med gyldige kontrollsiffer. */
function lagNummer(dato6, start = 100) {
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

const FNR = lagNummer("150385");
const FNR2 = lagNummer("010190");
const DNR = lagNummer("550385"); // dag + 40
const HNR = lagNummer("154385"); // måned + 40 (Dolly)
const TNR = lagNummer("158385"); // måned + 80 (Tenor)

test("blokkerer gyldig fnr og dnr", () => {
  assert.equal(blokkertType(FNR), "fnr");
  assert.equal(blokkertType(DNR), "dnr");
});

test("slipper syntetiske og ugyldige numre gjennom", () => {
  assert.equal(blokkertType(HNR), null);
  assert.equal(blokkertType(TNR), null);
  assert.equal(blokkertType("12345678901"), null);
  assert.equal(blokkertType("11111111111"), null);
  // Eksempler fra fnrvalidator: T-nummer og D-nummer + T-nummer
  assert.equal(blokkertType("10915596784"), null);
  assert.equal(blokkertType("50846202355"), null);
});

test("finner numre i JSON-strenger og JSON-tall", () => {
  assert.deepEqual(skannTekst(`{"fnr": "${FNR}"}`), [{ linje: 1, type: "fnr" }]);
  assert.deepEqual(skannTekst(`{\n  "ident": ${DNR}\n}`), [{ linje: 2, type: "dnr" }]);
});

test("finner numre med skilletegn mellom 6 og 5 siffer", () => {
  for (const skille of [" ", "-", "."]) {
    const tekst = `${FNR.slice(0, 6)}${skille}${FNR.slice(6)}`;
    assert.equal(skannTekst(tekst).length, 1, `skilletegn '${skille}'`);
  }
});

test("treffer ikke når nummeret er del av et lengre tall", () => {
  assert.deepEqual(skannTekst(`1${FNR}`), []);
  assert.deepEqual(skannTekst(`${FNR}9`), []);
});

test("masker skjuler blokkerte numre", () => {
  assert.equal(masker(`data/${FNR}.json`), "data/***********.json");
  assert.equal(masker(`data/${TNR}.json`), "data/***********.json"); // alle gyldige typer maskeres
  assert.equal(masker("data/12345678901.json"), "data/12345678901.json");
});

test("masker skjuler numre i feilmeldinger", () => {
  assert.equal(masker(`feil i ${FNR}`), "feil i ***********");
});


test("scan --staged: stopper commit, skriver ikke nummeret og slipper linje med markør", () => {
  const repo = mkdtempSync(join(tmpdir(), "fnr-guard-"));
  try {
    const g = (...a) => execFileSync("git", a, { cwd: repo });
    g("init", "-q");
    writeFileSync(join(repo, "ok.json"), `{"a": "${HNR}", "b": "12345678901"}\n`);
    writeFileSync(join(repo, "feil.json"), `{\n"fnr": "${FNR}"\n}\n`);
    g("add", ".");
    const kjør = () => spawnSync("node", [BIN, "scan", "--staged"], { cwd: repo, encoding: "utf8", env: ENV });

    const r = kjør();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /feil\.json:2 {2}type=fnr/);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(FNR.slice(0, 6)));

    writeFileSync(join(repo, "feil.json"), `{\n"fnr": "${FNR}" // fnr-guard-ignore: generert i test, ikke ekte\n}\n`);
    g("add", ".");
    assert.equal(kjør().status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// Hjelpere for integrasjonstester mot ekte git-repoer
function lagRepo() {
  const repo = mkdtempSync(join(tmpdir(), "fnr-guard-"));
  const g = (...a) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd: repo }).toString().trim();
  g("init", "-q", "-b", "main");
  return { repo, g };
}
const kjørScan = (repo, ...args) => spawnSync("node", [BIN, "scan", ...args], { cwd: repo, encoding: "utf8", env: ENV });

test("parseDiff: innholdslinje som starter med ++ er ikke et filhode", () => {
  const diff = [
    "diff --git a/a.txt b/a.txt",
    "--- a/a.txt",
    "+++ b/a.txt",
    "@@ -0,0 +1,2 @@",
    `+++ ${FNR}`,
    "+++ /dev/null",
  ].join("\n");
  const linjer = [...parseDiff(diff)];
  assert.equal(linjer.length, 2);
  assert.deepEqual(linjer[0], { commit: null, fil: "a.txt", linje: 1, tekst: `++ ${FNR}` });
  assert.equal(linjer[1].fil, "a.txt");
});

test("scan --staged: finner fnr på linje som starter med ++", () => {
  const { repo, g } = lagRepo();
  try {
    writeFileSync(join(repo, "a.txt"), `++ ${FNR}\n`);
    g("add", ".");
    const r = kjørScan(repo, "--staged");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a\.txt:1 {2}type=fnr/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("scan --range: finner fnr som legges til og fjernes i neste commit", () => {
  const { repo, g } = lagRepo();
  try {
    g("commit", "-q", "--allow-empty", "-m", "start");
    const base = g("rev-parse", "HEAD");
    writeFileSync(join(repo, "a.json"), `{"fnr": "${FNR}"}\n`);
    g("add", "."); g("commit", "-q", "-m", "legg til");
    writeFileSync(join(repo, "a.json"), `{"fnr": "${HNR}"}\n`);
    g("add", "."); g("commit", "-q", "-m", "fjern");
    const r = kjørScan(repo, "--range", `${base}...HEAD`);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a\.json:1 {2}type=fnr/);
    assert.doesNotMatch(r.stdout + r.stderr, new RegExp(FNR.slice(0, 6)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("scan --range og --history: finner fnr som bare finnes i en merge-commit", () => {
  const { repo, g } = lagRepo();
  try {
    writeFileSync(join(repo, "a.txt"), "start\n");
    g("add", "."); g("commit", "-q", "-m", "start");
    const base = g("rev-parse", "HEAD");
    g("switch", "-q", "-c", "gren");
    writeFileSync(join(repo, "b.txt"), "b\n");
    g("add", "."); g("commit", "-q", "-m", "b");
    g("switch", "-q", "main");
    writeFileSync(join(repo, "c.txt"), "c\n");
    g("add", "."); g("commit", "-q", "-m", "c");
    g("merge", "-q", "--no-commit", "--no-ff", "gren");
    writeFileSync(join(repo, "a.txt"), `start ${FNR}\n`);
    g("add", "."); g("commit", "-q", "-m", "merge");
    for (const args of [["--range", `${base}..HEAD`], ["--history"]]) {
      const r = kjørScan(repo, ...args);
      assert.equal(r.status, 1, args.join(" "));
      assert.match(r.stderr, /a\.txt:1 {2}type=fnr/);
    }
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("scan: feilmeldinger maskerer fnr i filstier", () => {
  const { repo } = lagRepo();
  try {
    const r = kjørScan(repo, "--range", `${FNR}..HEAD`);
    assert.equal(r.status, 2);
    assert.doesNotMatch(r.stderr, new RegExp(FNR));
    assert.match(r.stderr, /\*{11}/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("parseNavneliste: filnavn kan ikke forveksles med commit-markør", () => {
  const logg = "\0aaa\0\n@@COMMIT x\0n\ny\0\0bbb\0\nc\0";
  assert.deepEqual([...parseNavneliste(logg, false)], [
    { commit: "aaa", sti: "@@COMMIT x" },
    { commit: "aaa", sti: "n\ny" },
    { commit: "bbb", sti: "c" },
  ]);
  assert.deepEqual([...parseNavneliste("@@COMMIT x\0c\0", true)], [
    { commit: null, sti: "@@COMMIT x" },
    { commit: null, sti: "c" },
  ]);
});

test("scan: finner fnr i filnavn som starter med @@COMMIT, staged og i range", () => {
  const { repo, g } = lagRepo();
  try {
    g("commit", "-q", "--allow-empty", "-m", "start");
    const base = g("rev-parse", "HEAD");
    writeFileSync(join(repo, `@@COMMIT ${FNR}.txt`), "x\n");
    g("add", ".");
    const staged = kjørScan(repo, "--staged");
    assert.equal(staged.status, 1);
    assert.match(staged.stderr, /@@COMMIT \*{11}\.txt \(filnavn\)/);
    g("commit", "-q", "-m", "a");
    const range = kjørScan(repo, "--range", `${base}..HEAD`);
    assert.equal(range.status, 1);
    assert.match(range.stderr, /@@COMMIT \*{11}\.txt \(filnavn\)/);
    assert.doesNotMatch(staged.stderr + range.stderr, new RegExp(FNR));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
