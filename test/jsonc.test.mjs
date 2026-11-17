import assert from 'node:assert/strict';
import test from 'node:test';
import { parseJsonc } from '../src/jsonc.mjs';

test('leser kommentarer og etterfølgende komma', () => {
  const verdi = parseJsonc(`{
    // kommentar
    "navn": "Ada",
    "liste": [1, 2,], /* kommentar */
  }`);
  assert.deepEqual(verdi, { navn: 'Ada', liste: [1, 2] });
});

test('beholder kommentarliknende tekst inne i strenger', () => {
  assert.deepEqual(parseJsonc('{"url":"https://eksempel.no/a//b", "tekst":"/* ikke kommentar */"}'), {
    url: 'https://eksempel.no/a//b',
    tekst: '/* ikke kommentar */',
  });
});

test('behandler escaped anførselstegn riktig når kommentarer fjernes', () => {
  assert.deepEqual(parseJsonc('{"tekst":"escaped \\" // fremdeles streng", "ok":true}'), {
    tekst: 'escaped " // fremdeles streng',
    ok: true,
  });
});

test('fjerner ikke komma eller kommentarer inne i strenger', () => {
  assert.deepEqual(parseJsonc('{"tekst":"komma, } og kommentar //x /*y*/"}'), {
    tekst: 'komma, } og kommentar //x /*y*/',
  });
});

test('rapporterer uavsluttet blokkkommentar uten innhold fra teksten', () => {
  assert.throws(() => parseJsonc('{\n  "hemmelig": "persondata" /* uferdig'), (feil) => {
    assert.match(feil.message, /Uavsluttet blokkkommentar på linje 2/);
    assert.doesNotMatch(feil.message, /persondata|hemmelig|uferdig/);
    return true;
  });
});

test('skjuler input ved JSON-syntaksfeil', () => {
  assert.throws(() => parseJsonc('{"hemmelig":"persondata",} ugyldig'), (feil) => {
    assert.match(feil.message, /Ugyldig JSONC-syntaks/);
    assert.doesNotMatch(feil.message, /persondata|hemmelig|ugyldig/);
    return true;
  });
});
