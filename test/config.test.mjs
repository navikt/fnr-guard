import { test } from "node:test";
import assert from "node:assert/strict";
import { validerConfig, parseConfig, tilFil, STANDARD } from "../src/config.mjs";
import { foreslaConfig } from "../src/init.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const gyldig = (ekstra = {}) => ({ versjon: 1, ...ekstra });

test("config: standardverdier fylles inn", () => {
  const c = validerConfig(gyldig());
  assert.deepEqual(c.roots, STANDARD.roots);
  assert.equal(c.pdf, true);
  assert.equal(c.manglendeNode, "stopp");
  assert.equal(c.skalSkanne("src/a.kt"), true);
});

test("config: ukjente felt gir feil", () => {
  assert.throws(() => validerConfig(gyldig({ allowlist: [] })), /ukjent felt «allowlist»/);
  assert.throws(() => validerConfig(gyldig({ exclude: [{ mønster: "**/build/**", begrunnelse: "Byggeresultat fra Gradle", x: 1 }] })), /ukjent felt «x»/);
});

test("config: versjon må være 1", () => {
  assert.throws(() => validerConfig({}), /versjon/);
  assert.throws(() => validerConfig({ versjon: 2 }), /versjon/);
});

test("config: fnr og dnr kan ikke slås av, bare hnr og tnr kan legges til", () => {
  assert.throws(() => validerConfig(gyldig({ ekstraBlokkerteTyper: ["fnr"] })), /bare inneholde hnr og tnr/);
  assert.throws(() => validerConfig(gyldig({ ekstraBlokkerteTyper: ["hnr", "hnr"] })), /duplikater/);
  assert.deepEqual([...validerConfig(gyldig({ ekstraBlokkerteTyper: ["hnr", "tnr"] })).ekstraBlokkerteTyper], ["hnr", "tnr"]);
});

test("config: exclude krever begrunnelse", () => {
  assert.throws(() => validerConfig(gyldig({ exclude: ["**/build/**"] })), /objekt/);
  assert.throws(() => validerConfig(gyldig({ exclude: [{ mønster: "**/build/**" }] })), /begrunnelse/);
  assert.throws(() => validerConfig(gyldig({ exclude: [{ mønster: "**/build/**", begrunnelse: "kort" }] })), /begrunnelse/);
  const c = validerConfig(gyldig({ exclude: [{ mønster: "**/build/**", begrunnelse: "Byggeresultat fra Gradle" }] }));
  assert.equal(c.skalSkanne("app/build/a.txt"), false);
  assert.equal(c.skalSkanne("app/src/a.txt"), true);
});

test("config: exclude som treffer testdata, mocks eller all kildekode avvises", () => {
  for (const mønster of ["**", "**/test/**", "**/src/test/**", "**/*mock*/**", "**/testdata/**", "**/*.test.ts", "**/*Test.kt", "src/**", "**/__mocks__/**", "**/fixtures/**"]) {
    assert.throws(
      () => validerConfig(gyldig({ exclude: [{ mønster, begrunnelse: "Vil ikke skanne dette" }] })),
      /testdata/,
      mønster,
    );
  }
});

test("config: stier kan ikke peke ut av repoet", () => {
  for (const sti of ["../annet", "/etc", "a/../../b", "C:/x", "a\\b"]) {
    assert.throws(() => validerConfig(gyldig({ roots: [sti] })), /roots/, sti);
    assert.throws(() => validerConfig(gyldig({ include: [sti] })), /include/, sti);
  }
});

test("config: tomme lister og ugyldige verdier gir feil", () => {
  assert.throws(() => validerConfig(gyldig({ roots: [] })), /roots/);
  assert.throws(() => validerConfig(gyldig({ include: [] })), /include/);
  assert.throws(() => validerConfig(gyldig({ pdf: "ja" })), /pdf/);
  assert.throws(() => validerConfig(gyldig({ maksFilstørrelseKb: 0 })), /maksFilstørrelseKb/);
  assert.throws(() => validerConfig(gyldig({ maksFilstørrelseKb: 1.5 })), /maksFilstørrelseKb/);
  assert.throws(() => validerConfig(gyldig({ manglendeNode: "ignorer" })), /manglendeNode/);
});

test("config: JSONC med kommentarer leses, og feil inneholder ikke filinnhold", () => {
  const c = parseConfig(`{\n  // kommentar\n  "versjon": 1,\n}\n`);
  assert.equal(c.versjon, 1);
  const hemmelig = "hemmelig-innhold-01019012345";
  assert.throws(() => parseConfig(`{ "versjon": 1, ${hemmelig} }`), (e) => !e.message.includes(hemmelig));
});

test("config: forslag fra init er alltid gyldig og kan serialiseres", () => {
  const rot = mkdtempSync(join(tmpdir(), "fnr-guard-cfg-"));
  try {
    const { config } = foreslaConfig(rot);
    const tekst = tilFil(config);
    assert.equal(parseConfig(tekst).versjon, 1);
    assert.match(tekst, /^\{\n {2}"\$schema"/);
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
});
