import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { installer, avinstaller, status } from "../src/hooks.mjs";
import { FNR, lagRepo, miljo, BIN } from "./hjelpere.mjs";

const commit = (repo, melding = "a") =>
  spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "commit", "-q", "-m", melding], {
    cwd: repo,
    encoding: "utf8",
    env: miljo(),
  });

function medConfig(repo) {
  writeFileSync(join(repo, ".fnr-guard.json"), '{ "versjon": 1 }\n');
}

test("install: pre-commit stopper commit med fnr og slipper rene commits", () => {
  const { repo, g } = lagRepo();
  try {
    medConfig(repo);
    const r = installer(repo, { binSti: BIN });
    assert.equal(r.status, "installert");
    const hook = join(g("config", "--get", "core.hooksPath"), "pre-commit");
    assert.ok(statSync(hook).mode & 0o100);

    writeFileSync(join(repo, "ok.txt"), "ok\n");
    g("add", ".");
    assert.equal(commit(repo).status, 0);

    writeFileSync(join(repo, "feil.txt"), `${FNR}\n`);
    g("add", ".");
    const c = commit(repo);
    assert.equal(c.status, 1);
    assert.match(c.stderr, /feil\.txt:1 {2}type=fnr/);
    assert.doesNotMatch(c.stderr, new RegExp(FNR));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("install: hooken skriver ikke config selv om den mangler", () => {
  const { repo, g } = lagRepo();
  try {
    installer(repo, { binSti: BIN });
    writeFileSync(join(repo, "ok.txt"), "ok\n");
    g("add", ".");
    assert.equal(commit(repo).status, 0);
    assert.ok(!existsSync(join(repo, ".fnr-guard.json")));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("install: repoets egen commit-msg i .git/hooks kjører fortsatt", () => {
  const { repo, g } = lagRepo();
  try {
    medConfig(repo);
    const egen = join(repo, ".git", "hooks", "commit-msg");
    mkdirSync(join(repo, ".git", "hooks"), { recursive: true });
    writeFileSync(egen, '#!/bin/sh\ntouch "$(git rev-parse --git-dir)/commit-msg-kjort"\n');
    chmodSync(egen, 0o755);
    installer(repo, { binSti: BIN });
    writeFileSync(join(repo, "a.txt"), "a\n");
    g("add", ".");
    assert.equal(commit(repo).status, 0);
    assert.ok(existsSync(join(repo, ".git", "commit-msg-kjort")));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("install: eksisterende core.hooksPath beholdes uten --force", () => {
  const { repo, g } = lagRepo();
  try {
    g("config", "core.hooksPath", "annet");
    assert.equal(installer(repo, { binSti: BIN }).status, "hoppet-over");
    assert.equal(g("config", "--get", "core.hooksPath"), "annet");
    assert.equal(installer(repo, { binSti: BIN, force: true }).status, "installert");
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("install: husky og lefthook gir snutt og endrer ingenting", () => {
  for (const [lag, forventet] of [
    [(r) => mkdirSync(join(r, ".husky")), "husky"],
    [(r) => writeFileSync(join(r, "lefthook.yml"), "pre-commit:\n"), "lefthook"],
  ]) {
    const { repo } = lagRepo();
    try {
      lag(repo);
      const r = installer(repo, { binSti: BIN });
      assert.equal(r.status, forventet);
      assert.match(r.snutt, /FNR_GUARD_HOOK=1 npx fnr-guard scan --staged/);
      assert.equal(status(repo).aktiv, false);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  }
});

test("install: binær som er borte gir tydelig feil, ikke stille godkjenning", () => {
  const { repo, g } = lagRepo();
  try {
    installer(repo, { binSti: join(repo, "finnes-ikke.mjs") });
    writeFileSync(join(repo, "a.txt"), "a\n");
    g("add", ".");
    const c = commit(repo);
    assert.equal(c.status, 1);
    assert.match(c.stderr, /fnr-guard install på nytt/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("status og avinstaller", () => {
  const { repo, g } = lagRepo();
  try {
    assert.equal(status(repo).aktiv, false);
    installer(repo, { binSti: BIN });
    assert.equal(status(repo).aktiv, true);
    assert.equal(installer(repo, { binSti: BIN }).status, "allerede");
    assert.equal(avinstaller(repo).status, "fjernet");
    assert.equal(status(repo).aktiv, false);
    assert.throws(() => execFileSync("git", ["config", "--get", "core.hooksPath"], { cwd: repo, stdio: "pipe" }));
    assert.equal(avinstaller(repo).status, "ikke-installert");
    void g;
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
