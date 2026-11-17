import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";
import { FNR, DNR, HNR, lagRepo, kjor, miljo } from "./hjelpere.mjs";

const ingenNummer = (r) => assert.doesNotMatch(r.stdout + r.stderr, new RegExp(`${FNR.slice(0, 6)}|${DNR.slice(0, 6)}`));
const config = (repo, obj) => writeFileSync(join(repo, ".fnr-guard.json"), JSON.stringify({ versjon: 1, ...obj }));

test("første kjøring lokalt: lager config og stopper", () => {
  const { repo } = lagRepo();
  try {
    const r = kjor(repo, ["scan", "--all"], miljo());
    assert.equal(r.status, 1);
    assert.match(r.stderr, /fant ingen \.fnr-guard\.json/);
    assert.ok(existsSync(join(repo, ".fnr-guard.json")));
    assert.equal(kjor(repo, ["scan", "--all"], miljo()).status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("første kjøring i CI og hook: skriver ingenting, bruker standardverdier", () => {
  for (const env of [miljo({ CI: "true" }), miljo({ GITHUB_ACTIONS: "true" }), miljo({ FNR_GUARD_HOOK: "1" })]) {
    const { repo, g } = lagRepo();
    try {
      writeFileSync(join(repo, "a.txt"), `${FNR}\n`);
      g("add", ".");
      const r = kjor(repo, ["scan", "--staged"], env);
      assert.equal(r.status, 1);
      assert.ok(!existsSync(join(repo, ".fnr-guard.json")));
      ingenNummer(r);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test("exclude hopper over mapper, testdata skannes alltid", () => {
  const { repo, g } = lagRepo();
  try {
    config(repo, { exclude: [{ mønster: "**/build/**", begrunnelse: "Byggeresultat fra Gradle" }] });
    mkdirSync(join(repo, "app/build"), { recursive: true });
    mkdirSync(join(repo, "app/src/test"), { recursive: true });
    writeFileSync(join(repo, "app/build/a.txt"), `${FNR}\n`);
    g("add", ".");
    assert.equal(kjor(repo, ["scan", "--staged"]).status, 0);
    writeFileSync(join(repo, "app/src/test/a.json"), `"${FNR}"\n`);
    g("add", ".");
    const r = kjor(repo, ["scan", "--staged"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /app\/src\/test\/a\.json:1/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("ugyldig config stopper med exit 2 og nevner ikke filinnholdet", () => {
  const { repo } = lagRepo();
  try {
    config(repo, { ekstraBlokkerteTyper: ["fnr"] });
    const r = kjor(repo, ["scan", "--all"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /hnr og tnr/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("ekstraBlokkerteTyper: hnr blokkeres når det er lagt til", () => {
  const { repo, g } = lagRepo();
  try {
    writeFileSync(join(repo, "a.txt"), `${HNR}\n`);
    g("add", ".");
    assert.equal(kjor(repo, ["scan", "--staged"]).status, 0);
    config(repo, { ekstraBlokkerteTyper: ["hnr"] });
    const r = kjor(repo, ["scan", "--staged"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /type=hnr/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("markør: unntar bare sin egen linje, og ugyldig markør varsles", () => {
  const { repo, g } = lagRepo();
  try {
    writeFileSync(join(repo, "a.kt"), `val a = "${FNR}" // fnr-guard-ignore: generert i test, ikke ekte\nval b = "${DNR}"\nval c = "${FNR}" // fnr-guard-ignore: kort\n`);
    g("add", ".");
    const r = kjor(repo, ["scan", "--staged"]);
    assert.equal(r.status, 1);
    assert.doesNotMatch(r.stderr, /a\.kt:1 /);
    assert.match(r.stderr, /a\.kt:2 {2}type=dnr/);
    assert.match(r.stderr, /a\.kt:3 {2}type=fnr/);
    assert.match(r.stderr, /1 linje har fnr-guard-ignore uten gyldig begrunnelse/);
    ingenNummer(r);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("CI med base-ref: config i PR-en gjelder ikke", () => {
  const { repo, g } = lagRepo();
  try {
    writeFileSync(join(repo, "README.md"), "start\n");
    g("add", ".");
    g("commit", "-q", "-m", "start");
    const base = g("rev-parse", "HEAD");
    // PR-en legger til en exclude og et nummer i samme commit
    mkdirSync(join(repo, "generert"));
    config(repo, { exclude: [{ mønster: "generert/**", begrunnelse: "Generert kode som ikke skal skannes" }] });
    writeFileSync(join(repo, "generert/a.txt"), `${FNR}\n`);
    g("add", ".");
    g("commit", "-q", "-m", "pr");
    const lokal = kjor(repo, ["scan", "--range", `${base}..HEAD`], miljo({ CI: "true" }));
    assert.equal(lokal.status, 0, "uten ref brukes config fra disk");
    const ci = kjor(repo, ["scan", "--range", `${base}..HEAD`], miljo({ CI: "true", FNR_GUARD_CONFIG_REF: base }));
    assert.equal(ci.status, 1);
    assert.match(ci.stderr, /generert\/a\.txt:1/);
    assert.match(ci.stderr, /standardverdier/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("--all: roots skanner alle repoer under repos/*", () => {
  const { repo: rot } = lagRepo();
  try {
    config(rot, { roots: [".", "repos/*"] });
    for (const navn of ["a", "b"]) {
      mkdirSync(join(rot, "repos", navn), { recursive: true });
      const { g } = lagRepo(join(rot, "repos", navn));
      writeFileSync(join(rot, "repos", navn, "x.txt"), navn === "b" ? `${FNR}\n` : "ok\n");
      g("add", ".");
    }
    const r = kjor(rot, ["scan", "--all"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /repos\/b\/x\.txt:1 {2}type=fnr/);
    // Fra underrepoet skannes bare det repoet, med config fra roten
    assert.equal(kjor(join(rot, "repos", "a"), ["scan", "--all"]).status, 0);
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});

test("--all: symlenker følges ikke", () => {
  const { repo, g } = lagRepo();
  const utenfor = mkdtempSync(join(tmpdir(), "fnr-utenfor-"));
  try {
    config(repo, {});
    writeFileSync(join(utenfor, "hemmelig.txt"), `${FNR}\n`);
    symlinkSync(join(utenfor, "hemmelig.txt"), join(repo, "lenke.txt"));
    g("add", ".");
    assert.equal(kjor(repo, ["scan", "--all"]).status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(utenfor, { recursive: true, force: true });
  }
});

test("--all: filer over maksFilstørrelseKb skannes likevel, med riktig linjenummer", () => {
  const { repo, g } = lagRepo();
  try {
    config(repo, { maksFilstørrelseKb: 1 });
    const fyll = "x".repeat(100) + "\n";
    writeFileSync(join(repo, "stor.txt"), fyll.repeat(25000) + `${FNR}\n`);
    g("add", ".");
    const r = kjor(repo, ["scan", "--all"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /stor\.txt:25001 {2}type=fnr/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("init: skriver config, nekter å overskrive uten --force", () => {
  const { repo } = lagRepo();
  try {
    const r = kjor(repo, ["init"], miljo());
    assert.equal(r.status, 0);
    const forste = readFileSync(join(repo, ".fnr-guard.json"), "utf8");
    assert.match(forste, /"versjon": 1/);
    assert.equal(kjor(repo, ["init"], miljo()).status, 2);
    assert.equal(kjor(repo, ["init", "--force"], miljo()).status, 0);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("ukjent kommando og ugyldige argumenter gir exit 2", () => {
  const { repo } = lagRepo();
  try {
    assert.equal(kjor(repo, ["bogus"]).status, 2);
    assert.equal(kjor(repo, ["scan", "--range"]).status, 2);
    assert.equal(kjor(repo, ["scan", "--range", "--output=x"]).status, 2);
    assert.equal(kjor(repo, ["scan", "--all", "ekstra"]).status, 2);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
