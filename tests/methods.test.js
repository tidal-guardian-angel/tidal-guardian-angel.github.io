import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMethod, applyPronunciation } from '../src/methods.js';
import { calculateName } from '../src/naming.js';

const dms = (sign, degree, minute = 0, second = 0) => ({ sign, degree, minute, second });
const positions = {
  sun: dms(9, 9, 57, 44), moon: dms(2, 0, 54, 26), mercury: dms(9, 29, 24, 9),
  venus: dms(10, 16, 57, 52), mars: dms(6, 2, 11, 45), jupiter: dms(10, 6, 29, 45),
  saturn: dms(5, 19, 26, 15), ascendant: dms(5, 24, 35, 21),
  mc: dms(2, 23, 11, 35), eleventhCusp: dms(3, 23, 11, 35),
};
const input = method => ({ method, positions, sect: 'night', options: { origin: 'ascendant', triplicity: 'sect' } });
const numberInput = (changes = {}) => ({ method: 'name', nameInput: { text: 'JAMES', inputScript: 'latin', outputScript: 'arabic', suffix: 'el', ...changes } });

test('course ruler example uses integer rows before subtraction, and forms a complete name', () => {
  const result = calculateMethod(input('ascendant'));
  assert.equal(result.selection.selectedPlanet, 'mercury');
  assert.equal(result.points[0].actual_degree_index, 299);
  assert.equal(result.points[0].degree_index, 125);
  assert.equal(result.name.hebrew, 'עאל');
  assert.equal(result.name.pronunciation, 'Eael');
  assert.equal(result.name.letters.length, 3);
  assert.deepEqual(result.order, ['mercury']);
  assert.match(result.formula, /299 − 174/);
  assert.ok(result.details.every(pair => pair.length === 2));
});

test('Aries origin is explicit and does not request an Ascendant for manual selected stars', () => {
  const result = calculateMethod({ method: 'almuten', positions: { target: positions.mercury }, selectedPlanet: 'mercury', sect: 'night', options: { origin: 'aries' } });
  assert.equal(result.points[0].degree_index, 299);
  assert.equal(result.name.hebrew, 'נאל');
  assert.equal(result.name.pronunciation, 'Nuel');
});

test('relative negative rows wrap around 360 before cycling the 22 letters', () => {
  const result = calculateMethod(input('moon'));
  assert.equal(result.selection.selectedPlanet, 'moon');
  assert.equal(result.points[0].actual_degree_index, 60);
  assert.equal(result.points[0].degree_index, 246);
  assert.equal(result.name.hebrew, 'האל');
  assert.equal(result.name.pronunciation, 'Heel');
});

test('Moon in Pisces advances to Aries and selects Mars', () => {
  const result = calculateMethod({ ...input('moon'), positions: { ...positions, moon: dms(11, 29, 59, 59) } });
  assert.equal(result.selection.selectedPlanet, 'mars');
});

test('luminary and almuten need manual star selection and never infer strength', () => {
  for (const method of ['almuten', 'luminary']) assert.throws(() => calculateMethod(input(method)), /手动选择/);
  assert.throws(() => calculateMethod({ ...input('luminary'), selectedPlanet: 'jupiter' }), /太阳或月亮/);
  const result = calculateMethod({ ...input('luminary'), selectedPlanet: 'sun' });
  assert.equal(result.name.hebrew, 'צאל');
  assert.equal(result.name.pronunciation, 'Tzael');
  assert.deepEqual(result.scoreDetails, []);
});

test('11th cusp ruler is separate from dignity selection', () => {
  const result = calculateMethod({ ...input('eleventh'), options: { origin: 'aries', selection: 'ruler' } });
  assert.equal(result.selection.selectedPlanet, 'moon');
  assert.equal(result.name.hebrew, 'פאל');
  assert.equal(result.name.pronunciation, 'Peel');
});

test('course 11th cusp example retains Moon/Jupiter six-point tie as two complete names', () => {
  const result = calculateMethod({ ...input('eleventh'), options: { origin: 'ascendant', selection: 'dignity', triplicity: 'sect' } });
  assert.deepEqual(result.selection.selectedPlanets, ['moon', 'jupiter']);
  assert.equal(result.selection.scores.moon, 6);
  assert.equal(result.selection.scores.jupiter, 6);
  assert.equal(result.selection.scores.mars, 3);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map(item => item.name.hebrew), ['האל', 'אאל']);
  assert.deepEqual(result.candidates.map(item => item.name.pronunciation), ['Heel', 'Ahel']);
  assert.ok(result.candidates.every(item => item.name.letters.length === 3));
  assert.ok(result.warnings.some(message => message.includes('并列')));
});

test('Egyptian Aries bounds use the actual lesson 6/12/20/25/30 table and half-open intervals', () => {
  const at = (cusp) => calculateMethod({ ...input('eleventh'), positions: { ...positions, eleventhCusp: cusp }, options: { selection: 'dignity', origin: 'aries' } }).scoreDetails[0].awards.find(award => award.kind === '界').planet;
  assert.equal(at(dms(0, 5, 59, '59.999999999999')), 'jupiter');
  assert.equal(at(6), 'venus');
  assert.equal(at(11.99999999), 'venus');
  assert.equal(at(12), 'mercury');
  assert.equal(at(20), 'mars');
  assert.equal(at(25), 'saturn');
});

test('sect/all triplicity scoring is explicit and differing versions are recorded', () => {
  const result = calculateMethod({ ...input('eleventh'), options: { selection: 'dignity', origin: 'aries', triplicity: 'all' } });
  const awards = result.scoreDetails[0].awards.filter(award => award.kind === '三分');
  assert.deepEqual(awards.map(item => item.planet), ['venus', 'mars', 'moon']);
  assert.ok(result.warnings.some(message => message.includes('三分三主')));
});

test('four-angle scoring uses MC and its actual opposite, not an assumed whole-sign 10th cusp', () => {
  const result = calculateMethod(input('angles'));
  assert.equal(result.scoreDetails.length, 4);
  assert.deepEqual(result.scoreDetails.map(row => row.key), ['ascendant', 'ic', 'descendant', 'mc']);
  assert.ok(Math.abs(result.scoreDetails[1].longitude - (83 + 11 / 60 + 35 / 3600 + 180)) < 1e-10);
  assert.ok(result.candidates.every(item => item.points.length === 1 && item.name.letters.length === 3));
  for (const planet of Object.keys(result.selection.scores)) {
    assert.equal(result.selection.scores[planet], result.scoreDetails.reduce((sum, row) => sum + row.scores[planet], 0));
  }
});

test('the fixed 22-letter pronunciation helper does not change the original five-point function', () => {
  const original = calculateName({ sun: positions.sun, moon: positions.moon, ascendant: positions.ascendant, syzygy: dms(8, 27, 33, 39), sect: 'night' });
  const snapshot = structuredClone(original);
  const result = applyPronunciation(original);
  assert.deepEqual(original, snapshot);
  assert.equal(result.name.hebrew, 'פעשלדאל');
  assert.equal(result.name.pronunciation, 'Peeashiladael');
  assert.equal(result.name.reading, 'Pe · Ea · Shi · La · Da · El');
  assert.equal(result.warnings.some(message => message.includes('未提供可唯一采用')), false);
  const readings = [];
  for (let value = 0; value < 22; value++) {
    const testResult = calculateMethod({ method: 'almuten', positions: { target: value }, selectedPlanet: 'sun', sect: 'day', options: { origin: 'aries' } });
    readings.push(testResult.name.letters[0].reading);
  }
  assert.deepEqual(readings, ['Ah', 'Beh', 'Gi', 'Da', 'He', 'Va', 'Za', 'Che', 'Te', 'Yo', 'Ka', 'La', 'Me', 'Nu', 'Sa', 'Ea', 'Pe', 'Tza', 'Ko', 'Re', 'Shi', 'Tha']);
});

test('Latin name values use the course large-range table, continuous one-based weights and restored suffix', () => {
  const result = calculateMethod(numberInput());
  assert.deepEqual(result.nameCalculation.letters, [
    { character: 'J', value: 10, weight: 1, subtotal: 10 },
    { character: 'A', value: 1, weight: 2, subtotal: 2 },
    { character: 'M', value: 40, weight: 3, subtotal: 120 },
    { character: 'E', value: 5, weight: 4, subtotal: 20 },
    { character: 'S', value: 100, weight: 5, subtotal: 500 },
  ]);
  assert.equal(result.nameCalculation.total, 652);
  assert.equal(result.nameCalculation.remainder, 621);
  assert.deepEqual(result.nameCalculation.components, [600, 20, 1]);
  assert.equal(result.name.hebrew, 'خكاال');
  assert.equal(result.name.script, 'ar');
  assert.equal(result.name.pronunciation, null);
  assert.deepEqual(result.points, []);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('name whitespace/hyphens/apostrophes do not reset weights or auto-transliterate', () => {
  assert.deepEqual(calculateMethod(numberInput({ text: "Ja-m e’s" })), calculateMethod(numberInput()));
  assert.throws(() => calculateMethod(numberInput({ text: '中文姓名' })), /自行确认/);
  assert.throws(() => calculateMethod(numberInput({ text: 'ß' })), /自行确认/);
});

test('Hebrew and Arabic input use their own explicit extended value tables', () => {
  const hebrew = calculateMethod(numberInput({ text: 'םכא', inputScript: 'hebrew', outputScript: 'hebrew' }));
  assert.equal(hebrew.nameCalculation.total, 643);
  assert.deepEqual(hebrew.nameCalculation.components, [600, 10, 2]);
  assert.equal(hebrew.name.hebrew, 'םיבאל');
  const arabic = calculateMethod(numberInput({ text: 'خكا', inputScript: 'arabic' }));
  assert.equal(arabic.nameCalculation.total, 643);
  assert.equal(arabic.name.hebrew, 'خيبال');
});

test('Ayl subtracts 41 and adds the matching three-letter suffix back', () => {
  const result = calculateMethod(numberInput({ suffix: 'ayl' }));
  assert.equal(result.nameCalculation.suffixValue, 41);
  assert.equal(result.nameCalculation.remainder, 611);
  assert.deepEqual(result.nameCalculation.components, [600, 10, 1]);
  assert.equal(result.name.hebrew, 'خياايل');
});

test('teens are explicitly decomposed as ten plus units', () => {
  const result = calculateMethod(numberInput({ text: 'PA' })); // 70*1+1*2-31=41, manual example below.
  assert.equal(result.nameCalculation.remainder, 41);
  const teen = calculateMethod(numberInput({ text: 'LDD' })); // 30+8+12-31=19.
  assert.equal(teen.nameCalculation.remainder, 19);
  assert.deepEqual(teen.nameCalculation.components, [10, 9]);
  assert.match(teen.nameCalculation.convention, /11—19/);
});

test('thousand split preserves numeric structure rather than summing the tokens', () => {
  // Twenty W's: 500*(1+...+20)-31 = 104969.
  const result = calculateMethod(numberInput({ text: 'W'.repeat(20) }));
  assert.equal(result.nameCalculation.remainder, 104969);
  assert.deepEqual(result.nameCalculation.components, [100, 4, 1000, 900, 60, 9]);
  assert.equal((100 + 4) * 1000 + 900 + 60 + 9, result.nameCalculation.remainder);
  assert.ok(result.name.hebrew.includes('غ'));
  assert.throws(() => calculateMethod(numberInput({ text: 'W'.repeat(20), outputScript: 'hebrew' })), /没有1000/);
});

test('the original lesson 41854 decomposition generates a complete single-script Arabic name', () => {
  // This synthetic 30-letter fixture has weighted total 41885, so subtracting
  // El=31 reaches the exact published numerical example without real names.
  const result = calculateMethod(numberInput({ text: `Q${'A'.repeat(27)}XZ` }));
  assert.equal(result.nameCalculation.total, 41885);
  assert.equal(result.nameCalculation.remainder, 41854);
  assert.deepEqual(result.nameCalculation.components, [40, 1, 1000, 800, 50, 4]);
  assert.equal(result.name.hebrew, 'ماغضندال');
  assert.equal(result.name.letters.length, 8);
  const manual = calculateMethod(numberInput({ text: `Q${'A'.repeat(27)}XZ`, components: [40, 1, 1000, 800, 50, 4] }));
  assert.equal(manual.name.hebrew, result.name.hebrew);
});

test('manual component overrides must restore the remainder and preserve a single script', () => {
  const result = calculateMethod(numberInput({ components: [500, 100, 20, 1] }));
  assert.equal(result.nameCalculation.manualComponents, true);
  assert.deepEqual(result.nameCalculation.components, [500, 100, 20, 1]);
  for (const components of [[600, 20], [1000, 621], [1, 1000, 1000], [11, 600, 10], [621], ['600', 20, 1], [], null]) {
    assert.throws(() => calculateMethod(numberInput({ components })));
  }
  const thousand = calculateMethod(numberInput({ text: 'W'.repeat(20), components: [100, 4, 1000, 900, 60, 9] }));
  assert.equal(thousand.nameCalculation.remainder, 104969);
});

test('invalid method options, missing coordinates, nonfinite/bool DMS and name contracts are rejected', () => {
  for (const changes of [
    { method: 'unknown' }, { sect: 'DAY' }, { options: { origin: 'descendant' } },
    { options: { triplicity: 'both' } }, { positions: {} },
    { positions: { ...positions, mercury: NaN } }, { positions: { ...positions, ascendant: true } },
    { positions: { ...positions, mercury: dms(0, 0, 0, '1e-1000000000') } },
  ]) assert.throws(() => calculateMethod({ ...input('ascendant'), ...changes }));
  assert.throws(() => calculateMethod({ ...input('angles'), positions: { ascendant: 10 } }), /天顶/);
  assert.throws(() => calculateMethod({ ...input('eleventh'), options: { selection: 'strongest' } }));
  for (const changes of [
    { text: '' }, { text: 'Z'.repeat(41) }, { text: 'A' }, { inputScript: 'chinese' },
    { outputScript: 'mixed' }, { suffix: 'yah' }, { text: '123' }, { text: 'א׳', inputScript: 'hebrew' },
  ]) assert.throws(() => calculateMethod(numberInput(changes)));
});
