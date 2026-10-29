import { calculateName } from './naming.js';
import { calculateMethod, applyPronunciation } from './methods.js';
import { calculateBirth, initAstrology } from './astrology.js';

const BIRTH_FIELDS = ['date', 'time', 'latitude', 'longitude', 'timezone', 'fold', 'houseSystem'];

function birthSnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new TypeError('请填写出生资料。');
  const birth = Object.fromEntries(BIRTH_FIELDS.map(key => [key, payload[key]]));
  for (const key of ['fold', 'houseSystem']) {
    if (birth[key] === undefined || birth[key] === null || birth[key] === '') birth[key] = null;
  }
  return structuredClone(birth);
}

function birthCacheKey(birth, includeSyzygy) {
  // Keep input types and exact coordinate representations distinct. In
  // particular, JSON's usual NaN/Infinity -> null coercion must not make an
  // invalid request hit a valid cached chart before astronomy validation.
  return JSON.stringify([
    ...BIRTH_FIELDS.map(key => [key, typeof birth[key], String(birth[key])]),
    ['includeSyzygy', includeSyzygy],
  ]);
}

/**
 * Bounded, session-memory-only LRU cache. It never writes user data to storage.
 * Full charts can satisfy requests that do not need a prenatal syzygy; charts
 * without that calculation cannot satisfy a full-chart request. Both pending
 * and completed entries count toward maxEntries. Eviction does not cancel a
 * caller's pending computation, and completion never reinserts evicted data.
 */
export function createBirthChartCache(calculateBirthFn, maxEntries = 8) {
  if (typeof calculateBirthFn !== 'function') throw new TypeError('排盘计算器必须是函数。');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new RangeError('缓存上限须为正整数。');
  const entries = new Map();

  function touch(key, entry) {
    entries.delete(key);
    entries.set(key, entry);
    return entry;
  }

  function createEntry(key, birth, includeSyzygy) {
    const entry = {};
    entry.promise = Promise.resolve()
      .then(() => calculateBirthFn(structuredClone(birth), { includeSyzygy }))
      .then(chart => structuredClone(chart))
      .catch(error => {
        // clear/eviction may already have replaced this exact key.
        if (entries.get(key) === entry) entries.delete(key);
        throw error;
      });
    entries.set(key, entry);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    return entry;
  }

  return {
    async get(payload, { includeSyzygy = true } = {}) {
      if (typeof includeSyzygy !== 'boolean') throw new TypeError('朔望计算选项须为布尔值。');
      const birth = birthSnapshot(payload);
      const key = birthCacheKey(birth, includeSyzygy);
      let entry = entries.get(key);
      let actualKey = key;
      if (!entry && !includeSyzygy) {
        actualKey = birthCacheKey(birth, true);
        entry = entries.get(actualKey);
      }
      if (entry) touch(actualKey, entry);
      else entry = createEntry(key, birth, includeSyzygy);
      return structuredClone(await entry.promise);
    },
    clear() { entries.clear(); },
    get size() { return entries.size; },
  };
}

const birthChartCache = createBirthChartCache(calculateBirth);
export function clearBirthChartCache() { birthChartCache.clear(); }

const labels = { sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星',ascendant:'上升',mc:'天顶',fortune:'福点',syzygy:'朔望' };
const degrees = value => Number(value).toFixed(6).replace(/0+$/,'').replace(/\.$/,'')+'°';

function makeRecord(raw, method) {
  if (method === 'name') {
    const calculation = raw.nameCalculation;
    if (!calculation) throw new Error('姓名计算记录不完整。');
    let sum = 0;
    const rows = calculation.letters.map(item => {
      sum += Number(item.subtotal);
      return [item.character, item.value, item.weight, item.subtotal, sum].map(String);
    });
    return {
      title:'姓名逐字加权记录', caption:'全名连写，序号从 1 连续递增',
      headers:['字母','字母数值','序号权重','乘积','累计和'], rows,
      formula:'加权总数 '+calculation.total+' − 后缀 '+calculation.suffixValue+' = '+calculation.remainder,
      notes:['拆分数值：'+calculation.components.join(' · '), calculation.restoredExpression ? '数值还原：'+calculation.restoredExpression : '', calculation.convention || '千位组先拆，再记 1000；其余按百、十、个位拆分。'].filter(Boolean),
    };
  }
  const points = raw.points || [];
  let formula = raw.formula || '';
  let notes = [];
  if (method === 'five') {
    const byKey = Object.fromEntries(points.map(point => [point.key, point]));
    const keys = raw.sect === 'day' ? ['ascendant','moon','sun'] : ['ascendant','sun','moon'];
    formula = raw.fortune.formula+'；（'+degrees(byKey[keys[0]].longitude)+' ＋ '+degrees(byKey[keys[1]].longitude)+' − '+degrees(byKey[keys[2]].longitude)+'）归入 0—360°，得 '+degrees(raw.fortune.longitude)+'。';
    notes = ['取字顺序：'+raw.order.map(key => labels[key] || key).join('、')+'，再加 el。'];
  } else notes = ['选定行星取一个根字母，再加 el 后缀。'];
  return {
    title: method === 'five' ? '五生命点取字记录' : '行星取字记录',
    caption: method === 'five' ? '累计黄经向下取整' : '查表行随所选起点计算',
    headers:['点位','实际黄道位置',method === 'five' ? '累计整数度' : '取字整数行','字母','数值'],
    rows:points.map(point => [point.label || labels[point.key] || point.key, point.formatted, String(point.degree_index), point.letter.hebrew+' '+point.letter.latin, String(point.letter.value)]),
    formula, notes,
  };
}
function decorate(raw, common, method, payload) {
  const result = { ...raw, ...common };
  result.selectedPlanet = raw.selectedPlanet || raw.selection?.selectedPlanet;
  result.rootCount = raw.name.letters.length - (method === 'name' && payload.nameInput?.suffix === 'ayl' ? 3 : 2);
  result.pronunciation = raw.name.reading || raw.pronunciation || raw.name.pronunciation;
  result.record = makeRecord(raw, method);
  result.details = Array.isArray(raw.details) ? raw.details.map(row => [...row]) : [];
  if (method === 'five') {
    result.details.unshift(['取字依据','太阳、月亮、上升、福点、出生前朔望；按昼夜排列']);
  }
  if (common.meta.house_system_name) result.details.push(['宫制', common.meta.house_system_name]);
  result.warnings = [...new Set([...(raw.warnings || []), ...(common.chartWarnings || [])])]
    .filter(warning => !warning.includes('完整 22 字母固定赋音表'));
  delete result.chartWarnings;
  delete result.candidates;
  if (common.mode === 'manual' && !['five','angles'].includes(method)
      && !(method === 'eleventh' && payload.options?.selection === 'dignity')) result.sect = null;
  return result;
}

export async function calculate(payload, dataBase) {
  if (!payload || typeof payload !== 'object') throw new Error('请填写计算资料。');
  const method = payload.method || 'five';
  let positions, sect, common;
  if (method === 'name') {
    const raw = calculateMethod({ method, nameInput:payload.nameInput });
    common = { mode:'name',place:'',meta:{engine:'浏览器内姓名字母计算'} };
    return decorate(raw, common, method, payload);
  }
  if (payload.mode === 'manual') {
    positions = payload.positions;
    sect = payload.sect;
    common = { mode:'manual',place:'',meta:{zodiac:'回归黄道',engine:'手动输入点位（浏览器计算）'} };
  } else if (payload.mode === 'auto') {
    const includeSyzygy = method === 'five';
    await initAstrology(dataBase, { date: payload.date, includeSyzygy });
    const chart = await birthChartCache.get(payload, { includeSyzygy });
    positions = { ...chart.positions,ascendant:chart.ascendant,mc:chart.mc,syzygy:chart.syzygy,eleventhCusp:chart.eleventhCusp };
    sect = chart.sect;
    common = { mode:'auto',place:payload.place || '',meta:chart.meta,chartWarnings:chart.warnings };
  } else throw new Error('请选择出生资料或手动点位模式。');
  const raw = method === 'five'
    ? applyPronunciation(calculateName({ ...positions, sect }))
    : calculateMethod({method,positions,sect,options:payload.options,selectedPlanet:payload.selectedPlanet});
  const result = decorate(raw, common, method, payload);
  if (raw.candidates?.length > 1) result.candidates = raw.candidates.map(candidate => decorate(candidate, common, method, payload));
  return result;
}
