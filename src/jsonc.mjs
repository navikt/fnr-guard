/**
 * Leser JSONC ved å fjerne kommentarer og etterfølgende komma før JSON.parse.
 * Feiltekster viser aldri innhold fra teksten som ble lest.
 * @param {string} tekst
 * @returns {unknown}
 */
export function parseJsonc(tekst) {
  if (typeof tekst !== 'string') {
    throw new Error('JSONC-innholdet må være tekst.');
  }

  const utenKommentarer = fjernKommentarer(tekst);
  const utenEtterfolgendeKomma = fjernEtterfolgendeKomma(utenKommentarer);
  try {
    return JSON.parse(utenEtterfolgendeKomma);
  } catch {
    throw new Error('Ugyldig JSONC-syntaks.');
  }
}

function fjernKommentarer(tekst) {
  const resultat = tekst.split('');
  let i = 0;
  let iStreng = false;
  let escaped = false;

  while (i < tekst.length) {
    const tegn = tekst[i];
    if (iStreng) {
      if (escaped) {
        escaped = false;
      } else if (tegn === '\\') {
        escaped = true;
      } else if (tegn === '"') {
        iStreng = false;
      }
      i += 1;
      continue;
    }

    if (tegn === '"') {
      iStreng = true;
      i += 1;
      continue;
    }
    if (tegn === '/' && tekst[i + 1] === '/') {
      resultat[i] = ' ';
      resultat[i + 1] = ' ';
      i += 2;
      while (i < tekst.length && tekst[i] !== '\n' && tekst[i] !== '\r') {
        resultat[i] = ' ';
        i += 1;
      }
      continue;
    }
    if (tegn === '/' && tekst[i + 1] === '*') {
      const start = i;
      resultat[i] = ' ';
      resultat[i + 1] = ' ';
      i += 2;
      let avsluttet = false;
      while (i < tekst.length) {
        if (tekst[i] === '*' && tekst[i + 1] === '/') {
          resultat[i] = ' ';
          resultat[i + 1] = ' ';
          i += 2;
          avsluttet = true;
          break;
        }
        if (tekst[i] !== '\n' && tekst[i] !== '\r') {
          resultat[i] = ' ';
        }
        i += 1;
      }
      if (!avsluttet) {
        const linje = 1 + tekst.slice(0, start).split('\n').length - 1;
        throw new Error(`Uavsluttet blokkkommentar på linje ${linje}.`);
      }
      continue;
    }
    i += 1;
  }

  return resultat.join('');
}

function fjernEtterfolgendeKomma(tekst) {
  const resultat = tekst.split('');
  let iStreng = false;
  let escaped = false;

  for (let i = 0; i < tekst.length; i += 1) {
    const tegn = tekst[i];
    if (iStreng) {
      if (escaped) {
        escaped = false;
      } else if (tegn === '\\') {
        escaped = true;
      } else if (tegn === '"') {
        iStreng = false;
      }
      continue;
    }
    if (tegn === '"') {
      iStreng = true;
    } else if (tegn === ',') {
      let neste = i + 1;
      while (neste < tekst.length && /\s/.test(tekst[neste])) {
        neste += 1;
      }
      if (tekst[neste] === '}' || tekst[neste] === ']') {
        resultat[i] = ' ';
      }
    }
  }

  return resultat.join('');
}
