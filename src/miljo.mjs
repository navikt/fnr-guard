// 🔴 Rød sone: avgjør om fnr-guard kan skrive config og hvor config leses fra.
//
// Tre miljøer:
//   - CI:    CI eller GITHUB_ACTIONS er satt. Skriver aldri filer.
//   - hook:  FNR_GUARD_HOOK=1, satt av hookene fra `fnr-guard install`.
//            Skriver aldri filer, siden en commit ikke skal endre arbeidstreet.
//   - lokal: alt annet. Kan generere config ved første kjøring.
//
// Feiler trygt: er vi i tvil, regnes miljøet som CI.

const SANN = (v) => v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";

export function erCI(env = process.env) {
  return SANN(env.CI) || env.GITHUB_ACTIONS === "true";
}

export function erHook(env = process.env) {
  return env.FNR_GUARD_HOOK === "1";
}

export function kanSkriveConfig(env = process.env) {
  return !erCI(env) && !erHook(env);
}

/**
 * Git-ref config skal leses fra i CI (base-branchen), eller null.
 * Satt av action.yml. Config i PR-en selv brukes aldri i CI, slik at en PR
 * ikke kan svekke config og legge inn et nummer i samme endring.
 */
export function configRef(env = process.env) {
  if (!erCI(env)) return null;
  const ref = env.FNR_GUARD_CONFIG_REF;
  if (!ref || /^0+$/.test(ref)) return null;
  if (!/^[0-9a-fA-F]{7,64}$|^[A-Za-z0-9._\/-]+$/.test(ref) || ref.startsWith("-")) {
    throw new Error("FNR_GUARD_CONFIG_REF er ikke en gyldig git-ref");
  }
  return ref;
}
