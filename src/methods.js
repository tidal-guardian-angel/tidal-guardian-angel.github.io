/**
 * Additional course methods, HGA Lesson 2 pp. 3–4 and 10–21 / current PPT
 * slides 48–56 and 64–65. Each selected planet supplies one root letter.
 * Scoring selects planets; a score is never used as a letter-table position.
 * Name-number conventions not uniquely specified by the lesson are surfaced.
 */
import {
  parseCoordinate, formatCoordinate, coordinateToNumber, lookupLetter,
  makeRational, addCoordinates, normalizeCoordinate,
} from './naming.js';

const PLANETS = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
const LABELS = {
  sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星',
  jupiter: '木星', saturn: '土星', ascendant: '上升点', mc: '天顶',
  descendant: '下降点', ic: '天底', eleventhCusp: '第十一宫宫头', target: '所选行星',
};
const METHOD_LABELS = {
  ascendant: '命主星法', moon: '月座法', angles: '角宫法',
  eleventh: '第十一宫法', almuten: '胜利星法（手动选星）',
  luminary: '日月法（手动选星）', name: '姓名计算法',
};
const RULERS = ['mars', 'venus', 'mercury', 'moon', 'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'saturn', 'jupiter'];
const EXALTATIONS = ['sun', 'moon', null, 'jupiter', null, 'mercury', 'saturn', null, null, 'mars', null, 'venus'];
const TRIPLICITIES = [
  ['sun', 'jupiter', 'saturn'], ['venus', 'moon', 'mars'],
  ['saturn', 'mercury', 'jupiter'], ['venus', 'mars', 'moon'],
];
// Original PDF p. 9, cumulative upper limits. Do not substitute a different
// table called "Egyptian": e.g. the course's Aries limits are 6/12/20/25/30.
const BOUNDS = [
  [['jupiter', 6], ['venus', 12], ['mercury', 20], ['mars', 25], ['saturn', 30]],
  [['venus', 8], ['mercury', 14], ['jupiter', 22], ['saturn', 27], ['mars', 30]],
  [['mercury', 6], ['jupiter', 12], ['venus', 17], ['mars', 24], ['saturn', 30]],
  [['mars', 7], ['venus', 13], ['mercury', 19], ['jupiter', 26], ['saturn', 30]],
  [['jupiter', 6], ['venus', 11], ['saturn', 18], ['mercury', 24], ['mars', 30]],
  [['mercury', 7], ['venus', 17], ['jupiter', 21], ['mars', 28], ['saturn', 30]],
  [['saturn', 6], ['mercury', 14], ['jupiter', 21], ['venus', 28], ['mars', 30]],
  [['mars', 7], ['venus', 11], ['mercury', 19], ['jupiter', 24], ['saturn', 30]],
  [['jupiter', 12], ['venus', 17], ['mercury', 21], ['saturn', 26], ['mars', 30]],
  [['mercury', 7], ['jupiter', 14], ['venus', 22], ['saturn', 26], ['mars', 30]],
  [['mercury', 7], ['venus', 13], ['jupiter', 20], ['mars', 25], ['saturn', 30]],
  [['venus', 12], ['jupiter', 16], ['mercury', 19], ['mars', 28], ['saturn', 30]],
];
const FACE_CYCLE = ['mars', 'sun', 'venus', 'mercury', 'moon', 'saturn', 'jupiter'];
const HEBREW = [...'אבגדהוזחטיכלמנסעפצקרשת'];
const PRONUNCIATIONS = ['Ah', 'Beh', 'Gi', 'Da', 'He', 'Va', 'Za', 'Che', 'Te', 'Yo', 'Ka', 'La', 'Me', 'Nu', 'Sa', 'Ea', 'Pe', 'Tza', 'Ko', 'Re', 'Shi', 'Tha'];
const FIXED_READING = Object.fromEntries(HEBREW.map((character, index) => [character, PRONUNCIATIONS[index]]));
Object.assign(FIXED_READING, { 'ך': 'Ka', 'ם': 'Me', 'ן': 'Nu', 'ף': 'Pe', 'ץ': 'Tza' });
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const HEBREW_EXTENDED = [...'אבגדהוזחטיכלמנסעפצקרשתךםןףץ'];
const ARABIC = [...'ابجدهوزحطيكلمنسعفصقرشتثخذضظغ'];
const ARABIC_NAMES = ['Alif', 'Ba', 'Jim', 'Dal', 'Ha', 'Waw', 'Zay', 'Ha (ح)', 'Ta (ط)', 'Ya', 'Kaf', 'Lam', 'Mim', 'Nun', 'Sin', 'Ayn', 'Fa', 'Sad', 'Qaf', 'Ra', 'Shin', 'Ta (ت)', 'Tha', 'Kha', 'Dhal', 'Dad', 'Za', 'Ghayn'];
const NAME_CONVENTION = '完整姓名去除空白、连字符和撇号后，从1连续加权；百、十、个位分解，11—19按10加个位；千位先拆商，再记1000，最后拆余数。此为公开的课程实现约定。';

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function requireSect(sect) {
  if (sect !== 'day' && sect !== 'night') throw new RangeError('请明确选择昼生或夜生。');
}
function degreeIndex(value) { return Number(value.n / value.d); }
function signIndex(value) { return Math.floor(degreeIndex(value) / 30); }
function nearBoundary(value) {
  const remainder = value.n % value.d;
  return (remainder < value.d - remainder ? remainder : value.d - remainder) * 3600n < value.d;
}
function compactReading(readings, suffix = 'El') {
  const root = readings.map((reading, index) => index === 0 ? reading : reading.toLowerCase()).join('');
  return root ? root + suffix.toLowerCase() : suffix;
}
function hebrewMetadata(character, value) {
  const normalIndex = HEBREW.indexOf(character);
  if (normalIndex >= 0) return { ...lookupLetter(normalIndex), reading: FIXED_READING[character] };
  const finals = { 'ך': 'Kaph', 'ם': 'Mem', 'ן': 'Nun', 'ף': 'Pe', 'ץ': 'Sadhe' };
  return { hebrew: character, latin: finals[character], reading: FIXED_READING[character], value };
}
function suffixLetters(script, suffix) {
  const values = suffix === 'ayl' ? [1, 10, 30] : [1, 30];
  return values.map(value => numberLetter(value, script));
}
function numberLetter(value, script) {
  const index = VALUES.indexOf(value);
  if (index < 0) throw new RangeError(`课件数表没有数值 ${value}。`);
  if (script === 'hebrew') {
    if (value === 1000) throw new RangeError('课件的希伯来数表没有1000对应字母。请改用阿拉伯字母输出，或提供不含1000的有效拆分；不能混用两种文字。');
    return hebrewMetadata(HEBREW_EXTENDED[index], value);
  }
  return { hebrew: ARABIC[index], latin: ARABIC_NAMES[index], reading: ARABIC_NAMES[index], value };
}
function makeName(rootLetters, suffix = 'el', script = 'hebrew') {
  const sound = suffix === 'ayl' ? 'Ayl' : 'El';
  const letters = [...rootLetters.map(item => ({ ...item })), ...suffixLetters(script, suffix)];
  const readings = rootLetters.map(item => item.reading);
  const pronunciation = script === 'hebrew' ? compactReading(readings, sound) : null;
  return {
    hebrew: letters.map(item => item.hebrew).join(''),
    transliteration: pronunciation ?? `${rootLetters.map(item => item.latin).join(' · ')} · ${sound}`,
    reading: `${readings.join(' · ')} · ${sound}${script === 'arabic' ? '（阿拉伯字母名辅助，不是完整词形发音）' : ''}`,
    pronunciation, script: script === 'arabic' ? 'ar' : 'he', suffix, letters,
  };
}

/** Add the PDF p.21 / PPT pp.64–65 fixed readings without mutating a result. */
export function applyPronunciation(result) {
  if (!record(result) || !record(result.name) || !Array.isArray(result.name.letters)) throw new TypeError('缺少完整的名号字母记录。');
  if (result.name.script === 'ar') return { ...result, name: { ...result.name } };
  const letters = result.name.letters;
  const suffixLength = result.name.suffix === 'ayl' ? 3 : 2;
  const suffix = suffixLength === 3 ? 'ayl' : 'el';
  const roots = letters.slice(0, -suffixLength).map(item => {
    if (!FIXED_READING[item.hebrew]) throw new RangeError('该字母不在课程固定拼读表中。');
    return { ...item, reading: FIXED_READING[item.hebrew] };
  });
  const warnings = (result.warnings ?? []).filter(message => !message.includes('未提供可唯一采用的完整 22 字母固定赋音表'));
  return { ...result, name: makeName(roots, suffix), warnings };
}

function dignityRow(key, longitude, sect, triplicity) {
  const sign = signIndex(longitude);
  const withinSign = longitude.n - BigInt(sign * 30) * longitude.d;
  const scores = Object.fromEntries(PLANETS.map(planet => [planet, 0]));
  const awards = [];
  const award = (planet, kind, points) => {
    if (!planet) return;
    scores[planet] += points;
    awards.push({ planet, label: LABELS[planet], kind, points });
  };
  award(RULERS[sign], '入庙', 5);
  award(EXALTATIONS[sign], '擢升', 4);
  const triplords = TRIPLICITIES[sign % 4];
  for (const planet of triplicity === 'all' ? triplords : [triplords[sect === 'day' ? 0 : 1]]) award(planet, '三分', 3);
  award(BOUNDS[sign].find(([, upper]) => withinSign < BigInt(upper) * longitude.d)[0], '界', 2);
  award(FACE_CYCLE[Math.floor(degreeIndex(longitude) / 10) % 7], '面', 1);
  return { key, label: LABELS[key] ?? key, longitude: coordinateToNumber(longitude), formatted: formatCoordinate(longitude), scores, awards };
}

function scorePositions(entries, sect, triplicity) {
  const rows = entries.map(([key, longitude]) => dignityRow(key, longitude, sect, triplicity));
  const scores = Object.fromEntries(PLANETS.map(planet => [planet, rows.reduce((sum, row) => sum + row.scores[planet], 0)]));
  const maximum = Math.max(...Object.values(scores));
  return { rows, scores, maximum, planets: PLANETS.filter(planet => scores[planet] === maximum) };
}

function combineCandidates(candidates) {
  return { ...candidates[0], candidates };
}

function calculatePlanetMethod(input) {
  const { method, sect, selectedPlanet } = input;
  requireSect(sect);
  if (!record(input.positions)) throw new TypeError('请提供本方法需要的星盘位置。');
  const options = input.options ?? {};
  if (!record(options)) throw new TypeError('方法选项格式无效。');
  const origin = options.origin ?? 'ascendant';
  if (!['ascendant', 'aries'].includes(origin)) throw new RangeError('布字起点须为相对上升或白羊0°。');
  const triplicity = options.triplicity ?? 'sect';
  if (!['sect', 'all'].includes(triplicity)) throw new RangeError('三分计分须选择昼夜单主或三主分别计分。');
  const cache = new Map();
  const position = key => {
    if (!cache.has(key)) {
      if (!Object.hasOwn(input.positions, key)) throw new TypeError(`缺少${LABELS[key] ?? key}的实际黄道位置。`);
      cache.set(key, parseCoordinate(input.positions[key], LABELS[key] ?? key));
    }
    return cache.get(key);
  };
  const originDegree = origin === 'ascendant' ? degreeIndex(position('ascendant')) : 0;
  let selected = [];
  let rule;
  let scoring = null;
  const used = [];
  if (method === 'ascendant') {
    const asc = position('ascendant');
    selected = [RULERS[signIndex(asc)]];
    rule = '取上升星座的古典守护星，再用该行星的实际位置取字。';
    used.push(['ascendant', asc]);
  } else if (method === 'moon') {
    const moon = position('moon');
    selected = [RULERS[(signIndex(moon) + 1) % 12]];
    rule = '取月亮所在星座的下一个星座之古典守护星，再用该行星实际位置取字。';
    used.push(['moon', moon]);
  } else if (method === 'angles') {
    const asc = position('ascendant');
    const mc = position('mc');
    const entries = [['ascendant', asc], ['ic', normalizeCoordinate(addCoordinates(mc, makeRational(180n)))], ['descendant', normalizeCoordinate(addCoordinates(asc, makeRational(180n)))], ['mc', mc]];
    scoring = scorePositions(entries, sect, triplicity);
    selected = scoring.planets;
    used.push(...entries);
    rule = '对上升、天底、下降、天顶四个几何角点的本质尊贵分逐项累加；不计算行星后天强弱。';
  } else if (method === 'eleventh') {
    const cusp = position('eleventhCusp');
    const selection = options.selection ?? 'ruler';
    if (!['ruler', 'dignity'].includes(selection)) throw new RangeError('第十一宫须选择宫主星或宫头本质尊贵胜利星。');
    if (selection === 'ruler') {
      selected = [RULERS[signIndex(cusp)]];
      rule = '取已明确宫制的第十一宫宫头星座之古典守护星。';
    } else {
      scoring = scorePositions([['eleventhCusp', cusp]], sect, triplicity);
      selected = scoring.planets;
      rule = '按第十一宫宫头精确位置的本质尊贵计分选星，全部保留并列。';
    }
    used.push(['eleventhCusp', cusp]);
  } else {
    if (!PLANETS.includes(selectedPlanet)) throw new RangeError('请手动选择一颗古典行星。');
    if (method === 'luminary' && !['sun', 'moon'].includes(selectedPlanet)) throw new RangeError('日月法只可手动选择太阳或月亮。');
    selected = [selectedPlanet];
    rule = '使用者手动确认候选行星；网站只进行位置取字，不自动判定强弱。';
  }
  const tie = selected.length > 1;
  const scoreText = scoring ? PLANETS.map(planet => `${LABELS[planet]}${scoring.scores[planet]}`).join('、') : '';
  const candidates = selected.map(planet => {
    if (selected.length > 1 && !Object.hasOwn(input.positions, planet)) {
      throw new TypeError(`并列候选须分别提供${LABELS[planet]}的实际黄道位置，不能为多颗行星复用同一个target。`);
    }
    const actual = Object.hasOwn(input.positions, planet) ? position(planet) : position('target');
    const actualDegree = degreeIndex(actual);
    const lookupDegree = origin === 'aries' ? actualDegree : ((actualDegree - originDegree) % 360 + 360) % 360;
    const rootLetter = lookupLetter(lookupDegree);
    rootLetter.reading = FIXED_READING[rootLetter.hebrew];
    const key = planet;
    const point = {
      key, label: LABELS[planet], longitude: coordinateToNumber(actual), formatted: formatCoordinate(actual),
      degree_index: lookupDegree, actual_degree_index: actualDegree, origin_degree_index: originDegree,
      letter: rootLetter,
    };
    const formula = origin === 'aries'
      ? `白羊0°起：实际位置整数行 ${actualDegree}，查 ${lookupDegree} 行；余数 ${lookupDegree % 22} 对应 ${rootLetter.latin}，加 El。`
      : `相对上升：(${actualDegree} − ${originDegree} + 360) mod 360 = ${lookupDegree}；查表余数 ${lookupDegree % 22}，对应 ${rootLetter.latin}，加 El。`;
    const warnings = [];
    if (tie) warnings.push('本质尊贵最高分并列，已分别生成全部候选名号；第一项只用于初始展示，不表示自动胜出。');
    if (triplicity === 'all' && scoring) warnings.push('当前采用三分三主各加3分；课程主练习采用按昼夜只取一主的口径。');
    if ([actual, ...used.map(([, value]) => value), ...(origin === 'ascendant' ? [position('ascendant')] : [])].some(nearBoundary)) warnings.push('相关位置距整度不足1角秒；输入精度变化可能改变先取整数行再相减的结果。');
    const details = [
      ['选星依据', rule], ['所选行星', LABELS[planet]],
      ['布字起点', origin === 'aries' ? '白羊座0°，沿黄道顺序' : '上升所在整数行，沿黄道顺序'],
      ['实际位置', `${point.formatted}；累计整数行 ${actualDegree}`], ['取字计算', formula],
      ['构名', '所选行星取1个根字母，再添加אל两个后缀字母；不从度分秒各拆一字。'],
    ];
    if (used.length) details.push(['选星点位', used.map(([name, value]) => `${LABELS[name]} ${formatCoordinate(value)}`).join('；')]);
    if (scoring) {
      details.push(['本质尊贵计分', '入庙5、擢升4、三分3、界2、面1；按原讲义埃及界与面。']);
      details.push(['三分口径', triplicity === 'sect' ? '按昼夜取一主' : '昼、夜、参与主星各加3分']);
      details.push(['各星合计', scoreText]);
      details.push(['最高分候选', selected.map(item => `${LABELS[item]} ${scoring.maximum}分`).join('、')]);
    }
    return {
      name: makeName([rootLetter]), points: [point], order: [key], sect,
      method: METHOD_LABELS[method], methodKey: method, warnings, formula, details,
      selection: {
        rule, origin, selectedPlanet: planet, selectedPlanets: [...selected], tie,
        ...(scoring ? { scores: { ...scoring.scores }, maximum: scoring.maximum, triplicity } : {}),
      },
      scoreDetails: scoring?.rows ?? [],
    };
  });
  return combineCandidates(candidates);
}

function splitUnderThousand(number) {
  const result = [];
  const hundreds = Math.floor(number / 100) * 100;
  const remainder = number % 100;
  if (hundreds) result.push(hundreds);
  const tens = Math.floor(remainder / 10) * 10;
  const ones = remainder % 10;
  if (tens) result.push(tens);
  if (ones) result.push(ones);
  return result;
}
function splitNameNumber(number) {
  const thousands = Math.floor(number / 1000);
  return thousands ? [...splitUnderThousand(thousands), 1000, ...splitUnderThousand(number % 1000)] : splitUnderThousand(number);
}
function checkComponents(components, remainder) {
  if (!Array.isArray(components) || components.length === 0 || components.length > 64
      || components.some(value => typeof value !== 'number' || !Number.isInteger(value) || !VALUES.includes(value))) {
    throw new RangeError('拆分序列须为课件数表内的正整数数值，最多64项。');
  }
  const positions = components.map((value, index) => value === 1000 ? index : -1).filter(index => index >= 0);
  if (positions.length > 1) throw new RangeError('拆分序列最多保留一个1000。');
  let restored;
  if (positions.length) {
    const index = positions[0];
    const before = components.slice(0, index).reduce((sum, value) => sum + value, 0);
    const after = components.slice(index + 1).reduce((sum, value) => sum + value, 0);
    if (before <= 0 || before >= 1000 || after >= 1000) throw new RangeError('1000前须为1—999的系数，1000后须不足1000。');
    restored = before * 1000 + after;
  } else restored = components.reduce((sum, value) => sum + value, 0);
  if (restored !== remainder) throw new RangeError(`拆分序列还原为${restored}，与减去后缀后的数值${remainder}不符。`);
  return [...components];
}

function calculateNumberName(input) {
  const nameInput = input.nameInput;
  if (!record(nameInput) || typeof nameInput.text !== 'string') throw new TypeError('请填写按课程顺序整理的完整姓名字母。');
  const { inputScript = 'latin', outputScript = 'hebrew', suffix = 'el' } = nameInput;
  if (!['latin', 'hebrew', 'arabic'].includes(inputScript)) throw new RangeError('姓名输入字母体系无效。');
  if (!['hebrew', 'arabic'].includes(outputScript)) throw new RangeError('姓名输出须选择希伯来或阿拉伯字母。');
  if (!['el', 'ayl'].includes(suffix)) throw new RangeError('姓名后缀须选择el或ayl。');
  if (nameInput.text.length > 512) throw new RangeError('姓名输入过长，请保留最多40个字母。');
  let normalized = nameInput.text.normalize('NFC').replace(/[\s\-\u2010-\u2015'\u2018\u2019]/gu, '');
  if (inputScript === 'latin') {
    if (!/^[A-Za-z]+$/.test(normalized)) throw new RangeError('拉丁输入只接受课件A—Z字母；请自行确认中文等姓名的转写，不自动拼音转换。');
    normalized = normalized.toUpperCase();
  }
  const characters = [...normalized];
  if (!characters.length || characters.length > 40) throw new RangeError('请填写1—40个姓名字母。');
  const alphabet = inputScript === 'latin' ? [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] : inputScript === 'hebrew' ? HEBREW_EXTENDED : ARABIC;
  const rows = characters.map((character, index) => {
    const letterIndex = alphabet.indexOf(character);
    if (letterIndex < 0) throw new RangeError(`姓名字母“${character}”不在所选课件数表中；不自动转写或移除附标。`);
    const value = VALUES[letterIndex];
    const weight = index + 1;
    return { character, value, weight, subtotal: value * weight };
  });
  const total = rows.reduce((sum, row) => sum + row.subtotal, 0);
  const suffixValue = suffix === 'ayl' ? 41 : 31;
  const remainder = total - suffixValue;
  if (remainder <= 0 || remainder >= 1_000_000) throw new RangeError('减去后缀后的数值须大于0且小于1,000,000；当前课件实现不处理零、负数或百万级拆分。');
  const hasManualComponents = nameInput.components !== undefined;
  const components = checkComponents(hasManualComponents ? nameInput.components : splitNameNumber(remainder), remainder);
  const roots = components.map(value => numberLetter(value, outputScript));
  const name = makeName(roots, suffix, outputScript);
  name.suffix = suffix;
  const warnings = [NAME_CONVENTION, '原讲义示例只明确41854→40、1、1000、800、50、4；当前通用分解与连续权重均公开记录，允许人工提供有效拆分复核。'];
  if (outputScript === 'arabic') warnings.push('阿拉伯输出采用课件大数表；辅助读法列字母名，不把希伯来固定元音表直接套用到阿拉伯文字。');
  if (outputScript === 'hebrew' && components.some(value => value >= 500)) warnings.push('本结果按课件扩展数值使用500—900的词尾字形，是数值构名记录。');
  const formula = `Σ(字母数值 × 连续序号) = ${total}；${total} − ${suffixValue} = ${remainder}；拆分 ${components.join(' · ')}，映射后加回 ${suffix}。`;
  const result = {
    name, points: [], order: [], sect: null, method: METHOD_LABELS.name, methodKey: 'name',
    warnings, formula,
    details: [
      ['姓名顺序', '按课程指定次序预先整理完整姓名，再输入；网站不推断父母姓名顺序或中文转写。'],
      ['输入字母体系', inputScript], ['整理后字母', normalized], ['权重', '从1连续计数，忽略空白、连字符、撇号，不按姓名字段重置。'],
      ['计算', formula], ['拆分来源', hasManualComponents ? '人工提供并校验还原值' : '本网站明确标注的百/十/千分解约定'],
      ['输出字母体系', outputScript === 'hebrew' ? '希伯来大数表（500—900为词尾形，1000无映射）' : '阿拉伯大数表（含1000）'],
      ['实现约定', NAME_CONVENTION],
    ],
    selection: { rule: '按完整姓名的字母数值及连续权重计算，不使用出生星盘。' },
    nameCalculation: { letters: rows, total, suffixValue, remainder, components, convention: NAME_CONVENTION, inputScript, outputScript, suffix, normalizedText: normalized, manualComponents: hasManualComponents },
  };
  return combineCandidates([result]);
}

export function calculateMethod(input) {
  if (!record(input) || !Object.hasOwn(METHOD_LABELS, input.method)) throw new RangeError('请选择受支持的课程取字法。');
  return input.method === 'name' ? calculateNumberName(input) : calculatePlanetMethod(input);
}
