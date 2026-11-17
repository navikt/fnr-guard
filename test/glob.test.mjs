import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { lagMatcher, matcherNoen } from '../src/glob.mjs';

test('matcher stjerner og spørsmålstegn innenfor ett segment', () => {
  assert.equal(lagMatcher('rapport-*.pdf')('rapport-2026.pdf'), true);
  assert.equal(lagMatcher('rapport-*.pdf')('arkiv/rapport-2026.pdf'), false);
  assert.equal(lagMatcher('a?c')('abc'), true);
  assert.equal(lagMatcher('a?c')('ac'), false);
  assert.equal(lagMatcher('*')(''), false);
  assert.equal(lagMatcher('a*')('a/b'), false);
});

test('matcher ** som null eller flere hele segmenter', () => {
  assert.equal(lagMatcher('**/rapport.pdf')('rapport.pdf'), true);
  assert.equal(lagMatcher('**/rapport.pdf')('2026/mai/rapport.pdf'), true);
  assert.equal(lagMatcher('dokumenter/**')('dokumenter'), true);
  assert.equal(lagMatcher('dokumenter/**')('dokumenter/rapport.pdf'), true);
  assert.equal(lagMatcher('a/**/b')('a/b'), true);
  assert.equal(lagMatcher('a/**/b')('a/x/y/b'), true);
});

test('behandler andre tegn bokstavelig og matcher hele stien', () => {
  assert.equal(lagMatcher('a.{b}[c]')('a.{b}[c]'), true);
  assert.equal(lagMatcher('a.{b}[c]')('aXbXc'), false);
  assert.equal(lagMatcher('*.pdf')('mappe/fil.pdf'), false);
  assert.equal(lagMatcher('mappe/*.pdf')('mappe/fil.pdf'), true);
});

test('avviser ugyldige mønstre med norske feilmeldinger', () => {
  for (const mønster of ['', '/ab', 'a/../b', 'a\\b']) {
    assert.throws(() => lagMatcher(mønster), /mønster|segment|skråstrek/);
  }
});

test('matcherNoen godtar en sti når minst ett mønster treffer', () => {
  const matcher = matcherNoen(['*.txt', 'dokumenter/**/rapport?.pdf']);
  assert.equal(matcher('notat.txt'), true);
  assert.equal(matcher('dokumenter/2026/rapport1.pdf'), true);
  assert.equal(matcher('bilder/foto.png'), false);
  assert.equal(matcherNoen([])('notat.txt'), false);
});

test('mange stjerner gir forutsigbar kjøretid', () => {
  const matcher = lagMatcher('**/a*a*a*a*a*a*a*a*b');
  const stiMedSegmenter = Array.from({ length: 30 }, () => 'aaaaaaaaaaaaaaaa').join('/');
  const stiLangtSegment = 'a'.repeat(5000);

  const start = performance.now();
  assert.equal(matcher(stiMedSegmenter), false);
  assert.equal(matcher(stiLangtSegment), false);
  assert.ok(performance.now() - start < 200, 'matching skal fullføres på under 200 ms');
});
