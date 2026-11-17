// Sjekker at npm-pakken bare inneholder filene den skal. Kjøres i CI.
// Eksport-kode (som skriver ekte numre til fil) skal aldri publiseres.
import { execFileSync } from "node:child_process";

const json = execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" });
const filer = JSON.parse(json)[0].files.map((f) => f.path);
const lov = /^(bin\/|src\/|schema\/|README\.md$|LICENSE$|package\.json$)/;
const feil = filer.filter((f) => !lov.test(f) || /eksport/i.test(f));

if (feil.length > 0) {
  console.error("Uventede filer i pakken:", feil);
  process.exit(1);
}
console.log(`${filer.length} filer i pakken, alle tillatt`);
