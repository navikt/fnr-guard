import { test } from "node:test";
import assert from "node:assert/strict";
import { erUnntatt, harUgyldigMarkor, begrunnelse } from "../src/unntak.mjs";
import { erCI, erHook, kanSkriveConfig, configRef } from "../src/miljo.mjs";

test("unntak: markør med begrunnelse unntar linjen", () => {
  assert.equal(erUnntatt(`x = 1 // fnr-guard-ignore: generert testnummer`), true);
  assert.equal(erUnntatt(`<!-- fnr-guard-ignore: eksempel i dokumentasjon -->`), true);
  assert.equal(erUnntatt(`/* fnr-guard-ignore: eksempel fra skatteetaten */`), true);
  assert.equal(erUnntatt(`x = 1 # fnr-guard-ignore: generert testnummer`), true);
});

test("unntak: markør uten eller med for kort begrunnelse unntar ikke", () => {
  for (const rad of ["x // fnr-guard-ignore", "x // fnr-guard-ignore:", "x // fnr-guard-ignore: ok", "x /* fnr-guard-ignore: kort */", "x <!-- fnr-guard-ignore: -->"]) {
    assert.equal(erUnntatt(rad), false, rad);
    assert.equal(harUgyldigMarkor(rad), true, rad);
  }
});

test("unntak: markøren må stå med kolon og riktig navn", () => {
  assert.equal(erUnntatt("x // fnr-guard-ignore generert testnummer"), false);
  assert.equal(erUnntatt("x // FNR-GUARD-IGNORE: generert testnummer"), false);
  assert.equal(erUnntatt("x // fnr-guard-ignored: generert testnummer"), false);
  assert.equal(begrunnelse("ingen markør"), null);
});

test("miljø: CI og hook skriver aldri config", () => {
  assert.equal(kanSkriveConfig({}), true);
  assert.equal(kanSkriveConfig({ CI: "true" }), false);
  assert.equal(kanSkriveConfig({ CI: "1" }), false);
  assert.equal(kanSkriveConfig({ GITHUB_ACTIONS: "true" }), false);
  assert.equal(kanSkriveConfig({ FNR_GUARD_HOOK: "1" }), false);
  assert.equal(erCI({ CI: "false" }), false);
  assert.equal(erHook({ FNR_GUARD_HOOK: "0" }), false);
});

test("miljø: config-ref brukes bare i CI og må være en trygg ref", () => {
  assert.equal(configRef({ FNR_GUARD_CONFIG_REF: "abc1234" }), null);
  assert.equal(configRef({ CI: "true", FNR_GUARD_CONFIG_REF: "abc1234" }), "abc1234");
  assert.equal(configRef({ CI: "true", FNR_GUARD_CONFIG_REF: "0000000000000000000000000000000000000000" }), null);
  assert.equal(configRef({ CI: "true" }), null);
  assert.throws(() => configRef({ CI: "true", FNR_GUARD_CONFIG_REF: "--output=/tmp/x" }), /gyldig/);
  assert.throws(() => configRef({ CI: "true", FNR_GUARD_CONFIG_REF: "a b" }), /gyldig/);
});
