import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { foreslaConfig } from "../src/init.mjs";

function medRot(kjør) {
  const rot = mkdtempSync(join(tmpdir(), "fnr-guard-init-"));
  try {
    kjør(rot);
  } finally {
    rmSync(rot, { recursive: true, force: true });
  }
}

function fil(rot, sti, innhold = "") {
  const fullSti = join(rot, sti);
  mkdirSync(join(fullSti, ".."), { recursive: true });
  writeFileSync(fullSti, innhold);
}

function mappe(rot, sti) {
  mkdirSync(join(rot, sti), { recursive: true });
}

function sjekkIngenTestExclude(config) {
  for (const { mønster } of config.exclude) {
    assert.doesNotMatch(mønster, /test|mock|testdata/i);
  }
}

test("enkeltrepo foreslår standardkonfigurasjon", () => {
  medRot((rot) => {
    mappe(rot, ".git");
    const { config, funn } = foreslaConfig(rot);
    assert.equal(config["$schema"], "https://raw.githubusercontent.com/navikt/fnr-guard/main/schema/fnr-guard.schema.json");
    assert.deepEqual(config.roots, ["."]);
    assert.deepEqual(config.include, ["**"]);
    assert.deepEqual(config.exclude, []);
    assert.ok(funn.some((tekst) => tekst.includes("Git-repo i prosjektroten")));
  });
});

test("multi-repo velger repos/* og tar med rot-repo først", () => {
  medRot((rot) => {
    mappe(rot, ".git");
    mappe(rot, "repos/a/.git");
    fil(rot, "repos/b/.git", "gitdir: ../.git/worktrees/b\n");
    const { config, funn } = foreslaConfig(rot);
    assert.deepEqual(config.roots, [".", "repos/*"]);
    assert.ok(funn.some((tekst) => tekst.includes("repos/")));
  });
});

test("npm workspaces påvirker funn, men ikke include", () => {
  medRot((rot) => {
    fil(rot, "package.json", JSON.stringify({ workspaces: ["apps/*", "packages/*"] }));
    mappe(rot, "apps/web/node_modules");
    const { config, funn } = foreslaConfig(rot);
    assert.deepEqual(config.include, ["**"]);
    assert.ok(funn.some((tekst) => tekst.includes("npm-workspaces")));
    assert.ok(config.exclude.some(({ mønster }) => mønster === "**/node_modules/**"));
  });
});

test("pnpm-workspace.yaml gjenkjennes med enkel linjeparsing", () => {
  medRot((rot) => {
    fil(rot, "pnpm-workspace.yaml", "packages:\n  - 'apps/*'\n  - packages/core\nignored: true\n");
    const { funn, config } = foreslaConfig(rot);
    assert.ok(funn.some((tekst) => tekst.includes("pnpm-workspace (2 pakkemønstre)")));
    assert.deepEqual(config.include, ["**"]);
  });
});

test("Gradle include-direktiver gjenkjennes", () => {
  medRot((rot) => {
    fil(rot, "settings.gradle.kts", 'rootProject.name = "demo"\ninclude(":app", ":lib")\n');
    assert.ok(foreslaConfig(rot).funn.some((tekst) => tekst.includes("Gradle-moduler (2)")));
  });
});

test("go.work use-direktiver gjenkjennes", () => {
  medRot((rot) => {
    fil(rot, "go.work", "go 1.22\nuse (\n ./api\n ./worker\n)\n");
    assert.ok(foreslaConfig(rot).funn.some((tekst) => tekst.includes("go.work (2 moduler)")));
  });
});

test("støymapper oppdages til dybde fire, men ikke under .git", () => {
  medRot((rot) => {
    for (const navn of ["node_modules", "dist", "build", ".gradle", "target", ".next", "out", "coverage", "vendor", ".venv"]) {
      mappe(rot, `pakke/under/mappe/${navn}`);
    }
    mappe(rot, ".git/objekter/node_modules");
    const { config } = foreslaConfig(rot);
    assert.deepEqual(config.exclude.map(({ mønster }) => mønster), [
      "**/.gradle/**", "**/.next/**", "**/.venv/**", "**/build/**", "**/coverage/**",
      "**/dist/**", "**/node_modules/**", "**/out/**", "**/target/**", "**/vendor/**",
    ]);
    sjekkIngenTestExclude(config);
  });
});

test("husky og lefthook anbefales som integrasjonspunkter", () => {
  medRot((rot) => {
    mappe(rot, ".husky");
    fil(rot, "lefthook.yml", "pre-commit:\n");
    const { config, funn } = foreslaConfig(rot);
    assert.ok(funn.some((tekst) => tekst.includes("Husky")));
    assert.ok(funn.some((tekst) => tekst.includes("Lefthook")));
    assert.deepEqual(config.exclude, []);
  });
});
