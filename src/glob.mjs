/**
 * Lager en glob-matcher uten regulære uttrykk fra mønsteret.
 * Stier og mønstre bruker skråstrek som skilletegn.
 * @param {string} mønster
 * @returns {(sti: string) => boolean}
 */
export function lagMatcher(mønster) {
  if (typeof mønster !== 'string' || mønster.length === 0) {
    throw new Error('Glob-mønsteret kan ikke være tomt.');
  }
  if (mønster.startsWith('/')) {
    throw new Error('Glob-mønsteret kan ikke starte med skråstrek.');
  }
  if (mønster.includes('\\')) {
    throw new Error('Glob-mønsteret kan ikke inneholde omvendt skråstrek.');
  }

  const mønstersegmenter = mønster.split('/');
  if (mønstersegmenter.includes('..')) {
    throw new Error('Glob-mønsteret kan ikke inneholde et ..-segment.');
  }

  return (sti) => {
    if (typeof sti !== 'string' || sti.length === 0 || sti.startsWith('/') || sti.includes('\\')) {
      return false;
    }
    const stisegmenter = sti.split('/');
    if (stisegmenter.includes('..') || stisegmenter.some((segment) => segment.length === 0)) {
      return false;
    }

    // dp[i][j] sier om de første i mønstersegmentene matcher de første j stisegmentene.
    const dp = Array.from({ length: mønstersegmenter.length + 1 }, () =>
      Array(stisegmenter.length + 1).fill(false),
    );
    dp[0][0] = true;

    for (let i = 1; i <= mønstersegmenter.length; i += 1) {
      const segment = mønstersegmenter[i - 1];
      if (segment === '**') {
        dp[i][0] = dp[i - 1][0];
        for (let j = 1; j <= stisegmenter.length; j += 1) {
          dp[i][j] = dp[i - 1][j] || dp[i][j - 1];
        }
      } else {
        for (let j = 1; j <= stisegmenter.length; j += 1) {
          dp[i][j] = dp[i - 1][j - 1] && matcherSegment(segment, stisegmenter[j - 1]);
        }
      }
    }

    return dp[mønstersegmenter.length][stisegmenter.length];
  };
}

/**
 * Lager en matcher som godtar stien dersom minst ett mønster matcher.
 * @param {string[]} mønstre
 * @returns {(sti: string) => boolean}
 */
export function matcherNoen(mønstre) {
  if (!Array.isArray(mønstre)) {
    throw new Error('Glob-mønstrene må være en liste.');
  }
  const matchere = mønstre.map(lagMatcher);
  return (sti) => matchere.some((matcher) => matcher(sti));
}

function matcherSegment(mønster, tekst) {
  // DP gir O(n·m)-tid også for mønstre med mange stjerner.
  let forrige = Array(tekst.length + 1).fill(false);
  forrige[0] = true;

  for (let i = 0; i < mønster.length; i += 1) {
    const tegn = mønster[i];
    const neste = Array(tekst.length + 1).fill(false);
    if (tegn === '*') {
      neste[0] = forrige[0];
      for (let j = 1; j <= tekst.length; j += 1) {
        neste[j] = forrige[j] || neste[j - 1];
      }
    } else {
      for (let j = 1; j <= tekst.length; j += 1) {
        neste[j] = forrige[j - 1] && (tegn === '?' || tegn === tekst[j - 1]);
      }
    }
    forrige = neste;
  }

  return forrige[tekst.length];
}
