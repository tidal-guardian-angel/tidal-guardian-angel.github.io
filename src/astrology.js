/** Swiss Ephemeris 2.10.03, entirely in the browser. No birth data is sent out. */
import { createSwissEph, Body, Flag, Calendar } from '@kuntay/swisseph';
import { resolveLocal, formatInZone, initTimezones, getTimezoneVersion } from './timezone.js';

const FILES = Object.freeze(['sepl_18.se1', 'semo_18.se1', 'sepl_12.se1', 'semo_12.se1']);
const BLOCK_FILES = Object.freeze({
  18: FILES.slice(0, 2),
  12: FILES.slice(2),
});
const FLAGS = Flag.SwissEphemeris | Flag.Speed;
const PHASE_TOLERANCE = 1e-8;
const CLASSICAL_PLANETS = Object.freeze([
  ['sun', Body.Sun], ['moon', Body.Moon], ['mercury', Body.Mercury],
  ['venus', Body.Venus], ['mars', Body.Mars], ['jupiter', Body.Jupiter],
  ['saturn', Body.Saturn],
]);
const HOUSE_SYSTEMS = Object.freeze({
  whole: { code: 'W', label: '整宫制' },
  porphyry: { code: 'O', label: '波菲利宫制' },
  regiomontanus: { code: 'R', label: '雷吉奥蒙塔努斯宫制' },
  placidus: { code: 'P', label: '普拉西德宫制' },
});
let source = null;
let engineLoading = null;
let timezoneLoading = null;
let engine = null;
let runtime = null;
const fileLoads = new Map();
const loadedFiles = new Set();
const verifiedBlocks = new Set();

export class CalculationError extends Error {
  constructor(message, code = 'invalid_input', choices = []) {
    super(message);
    this.name = 'CalculationError';
    this.code = code;
    this.choices = choices;
  }
}

const normalize = (angle) => {
  const remainder = angle % 360;
  return remainder < 0 ? remainder + 360 : remainder;
};

function number(value, label, lower, upper, inclusive = true) {
  const inside = inclusive ? value >= lower && value <= upper : value > lower && value < upper;
  if (typeof value !== 'number' || !Number.isFinite(value) || !inside) {
    throw new CalculationError(`${label}必须是 ${lower} 至 ${upper} 之间的有效数字。`);
  }
  return value;
}

function dataBaseURL(baseURL) {
  const base = new URL(String(baseURL || './data/'), globalThis.document?.baseURI || import.meta.url);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  if (globalThis.location?.origin && base.origin !== globalThis.location.origin) {
    throw new CalculationError('星历文件必须从本站加载。', 'ephemeris_unavailable');
  }
  return base;
}

async function fetchFile(url) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'force-cache' });
  if (!response.ok) throw new Error(`星历文件读取失败：${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function makeRuntime(swe) {
  const raw = swe.raw;
  // All C calls below are synchronous. One WASM instance is used serially on
  // the browser's JS thread; no global settings are changed per calculation.
  const scratch = raw._malloc(1024);
  if (!scratch) throw new Error('无法分配星历计算内存。');
  const position = scratch;
  const error = scratch + 64;
  const integers = scratch + 320;
  const seconds = scratch + 344;
  const julian = scratch + 352;
  const geo = scratch + 384;
  const horizontalInput = scratch + 416;
  const horizontalOutput = scratch + 448;
  const calc = raw.cwrap('swe_calc_ut', 'number', Array(5).fill('number'));
  const utcToJD = raw.cwrap('swe_utc_to_jd', 'number', Array(9).fill('number'));
  const jdToUTC = raw.cwrap('swe_jdut1_to_utc', null, Array(8).fill('number'));
  const azalt = raw.cwrap('swe_azalt', null, Array(7).fill('number'));
  const doubles = (pointer, count) => Array.from({ length: count }, (_, index) => raw.getValue(pointer + index * 8, 'double'));
  const write = (pointer, values) => values.forEach((value, index) => raw.setValue(pointer + index * 8, value, 'double'));

  return {
    dispose() { raw._free(scratch); },
    position(jd, body) {
      raw.setValue(error, 0, 'i8');
      const flags = calc(jd, body, FLAGS, position, error);
      if (flags < 0) {
        throw new CalculationError('星历计算失败，请重新加载本页的星历文件。', 'ephemeris_error');
      }
      // Swiss can silently fall back to Moshier: inspect the *returned* source
      // bits on every birth and every phase-search evaluation, not just init.
      if ((flags & 7) !== Flag.SwissEphemeris) {
        throw new CalculationError('所需的 Swiss 星历文件未正确加载，暂时无法全自动计算。请重新加载，或使用手动输入。', 'ephemeris_unavailable');
      }
      const values = doubles(position, 6);
      if (!values.every(Number.isFinite)) throw new CalculationError('星历返回了无效位置。', 'ephemeris_error');
      return { values, flags };
    },
    utcToJD(utcMillis) {
      const date = new Date(utcMillis);
      raw.setValue(error, 0, 'i8');
      const code = utcToJD(date.getUTCFullYear(), date.getUTCMonth() + 1,
        date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(),
        date.getUTCSeconds() + date.getUTCMilliseconds() / 1000,
        Calendar.Gregorian, julian, error);
      if (code < 0) throw new CalculationError('UTC 转换失败，请检查出生时间。', 'ephemeris_error');
      return raw.getValue(julian + 8, 'double'); // UT1; first double is TT
    },
    jdToUTCMillis(jd) {
      jdToUTC(jd, Calendar.Gregorian, integers, integers + 4, integers + 8,
        integers + 12, integers + 16, seconds);
      const fields = Array.from({ length: 5 }, (_, index) => raw.getValue(integers + index * 4, 'i32'));
      return Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4])
        + raw.getValue(seconds, 'double') * 1000;
    },
    altitude(jd, latitude, longitude, sun) {
      write(geo, [longitude, latitude, 0]);
      write(horizontalInput, sun.slice(0, 3));
      // SE_ECL2HOR=0; second output is true altitude. Refraction (third
      // output), temperature, pressure and the solar upper limb are unused.
      azalt(jd, 0, geo, 0, 15, horizontalInput, horizontalOutput);
      return raw.getValue(horizontalOutput + 8, 'double');
    },
  };
}

function neededBlocks(date, includeSyzygy) {
  if (date === undefined || date === null || date === '') return ['18'];
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new CalculationError('请填写有效公历出生日期。');
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
      || date < '1800-01-01' || date > '2100-12-31') {
    throw new CalculationError('出生日期须为公历 1800—2100 年内的有效日期。');
  }
  // The Jan 23 margin covers the 22-day phase-search bracket and civil UTC
  // offsets. Jan 1 itself can be in 1799 UTC even without a prenatal search.
  const previousBlock = date === '1800-01-01' || (includeSyzygy && date < '1800-01-23');
  return previousBlock ? ['18', '12'] : ['18'];
}

function requireSyzygyOption(value) {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new CalculationError('朔望计算选项须为 true 或 false。');
  }
  return value !== false;
}

function prepareEngine() {
  if (engineLoading) return engineLoading;
  const attempt = (async () => {
    const candidate = await source.createEngine();
    try {
      const candidateRuntime = makeRuntime(candidate);
      engine = candidate; runtime = candidateRuntime;
      return candidate;
    } catch (error) { candidate.dispose(); throw error; }
  })();
  engineLoading = attempt;
  attempt.catch(() => {
    if (engineLoading === attempt) {
      engineLoading = null;
      fileLoads.clear(); loadedFiles.clear(); verifiedBlocks.clear();
    }
  });
  return attempt;
}

function prepareTimezones() {
  if (timezoneLoading) return timezoneLoading;
  const attempt = initTimezones(source.timezoneData || source.base.href);
  timezoneLoading = attempt;
  attempt.catch(() => { if (timezoneLoading === attempt) timezoneLoading = null; });
  return attempt;
}

function prepareFile(filename, readyEngine) {
  if (loadedFiles.has(filename)) return Promise.resolve();
  if (fileLoads.has(filename)) return fileLoads.get(filename);
  const attempt = (async () => {
    const content = await source.loadFile(new URL(`ephe/${filename}`, source.base), filename);
    const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
    if (bytes.byteLength < 1024) throw new Error(`星历文件不完整：${filename}`);
    const target = await readyEngine;
    target.mountEphemeris({ [filename]: bytes });
    loadedFiles.add(filename);
  })();
  fileLoads.set(filename, attempt);
  attempt.then(
    () => { if (fileLoads.get(filename) === attempt) fileLoads.delete(filename); },
    () => { if (fileLoads.get(filename) === attempt) fileLoads.delete(filename); },
  );
  return attempt;
}

function verifyBlock(block) {
  if (verifiedBlocks.has(block)) return;
  if (!BLOCK_FILES[block].every((filename) => loadedFiles.has(filename))) {
    throw new CalculationError('所需星历文件未能完整加载，请重试。', 'ephemeris_unavailable');
  }
  try {
    const jd = block === '18' ? 2451545 : 2378491;
    for (const [, body] of CLASSICAL_PLANETS) runtime.position(jd, body);
    verifiedBlocks.add(block);
  } catch (error) {
    // A downloaded but corrupt/wrong-block file must be fetched afresh on a
    // retry, rather than remaining forever in the successful-file cache.
    for (const filename of BLOCK_FILES[block]) {
      loadedFiles.delete(filename);
      try { engine.raw.FS.unlink(`/ephe/${filename}`); } catch { /* absent */ }
    }
    engine.setEphemerisPath('/ephe');
    throw error;
  }
}

/**
 * Prepare WASM and date-appropriate same-origin files in parallel. Source URL,
 * loader and timezone data are configured only on the first call and retained
 * by later calls, including calculateBirth. createEngine is a Node-test seam;
 * production always uses the default createSwissEph factory.
 */
export async function initAstrology(baseURL, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new CalculationError('星历初始化选项无效。');
  const includeSyzygy = requireSyzygyOption(options.includeSyzygy);
  const blocks = neededBlocks(options.date, includeSyzygy);
  if (!source) {
    if (options.loadFile !== undefined && typeof options.loadFile !== 'function') throw new CalculationError('星历读取方式无效。');
    if (options.createEngine !== undefined && typeof options.createEngine !== 'function') throw new CalculationError('星历引擎初始化方式无效。');
    source = { base: dataBaseURL(baseURL), loadFile: options.loadFile || fetchFile,
      timezoneData: options.timezoneData, createEngine: options.createEngine || createSwissEph };
  }
  try {
    // Start the WASM fetch/instantiation *before awaiting any data download*.
    const readyEngine = prepareEngine();
    const downloads = blocks.flatMap((block) => BLOCK_FILES[block]).map((filename) => prepareFile(filename, readyEngine));
    await Promise.all([readyEngine, prepareTimezones(), ...downloads]);
    for (const block of blocks) verifyBlock(block);
    return { engine: `Swiss Ephemeris ${engine.version} WebAssembly`,
      files: FILES.filter((filename) => loadedFiles.has(filename)), timezone_data: getTimezoneVersion() };
  } catch (error) {
    if (error?.code) throw error;
    throw new CalculationError('星历或时区文件尚未加载成功，请重试；手动输入仍可使用。', 'ephemeris_unavailable');
  }
}

function positions(jd) {
  return [runtime.position(jd, Body.Sun), runtime.position(jd, Body.Moon)];
}

function phase(jd) {
  const [sun, moon] = positions(jd);
  return normalize(moon.values[0] - sun.values[0]);
}

function residual(jd, target) {
  return normalize(phase(jd) - target + 180) - 180;
}

function previousSyzygy(jd) {
  const angle = phase(jd);
  const nearest = Math.round(angle / 180) * 180;
  if (Math.abs(angle - nearest) <= PHASE_TOLERANCE) return [jd, normalize(nearest)];
  const target = Math.floor(angle / 180) * 180;
  let high = jd;
  let low = high;
  let bracketed = false;
  for (let index = 0; index < 44; index++) {
    low -= 0.5;
    if (residual(low, target) <= 0) { bracketed = true; break; }
  }
  if (!bracketed) throw new CalculationError('未能定位出生前朔望，请检查输入或重新加载星历。', 'ephemeris_error');
  for (let index = 0; index < 64; index++) {
    const middle = (low + high) / 2;
    if (middle === low || middle === high) break;
    if (residual(middle, target) < 0) low = middle;
    else high = middle;
  }
  return [Math.min((low + high) / 2, jd), normalize(target)];
}

const utcISO = (milliseconds) => new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', '+00:00');

export async function calculateBirth(payload, { includeSyzygy = true } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new CalculationError('请填写出生资料。');
  const latitude = number(payload.latitude, '纬度', -90, 90, false);
  const longitude = number(payload.longitude, '经度', -180, 180);
  const houseSystemKey = payload.houseSystem ?? null;
  if (houseSystemKey !== null && (typeof houseSystemKey !== 'string'
      || !Object.hasOwn(HOUSE_SYSTEMS, houseSystemKey))) {
    throw new CalculationError('请选择整宫、波菲利、雷吉奥蒙塔努斯或普拉西德宫制。', 'invalid_house_system');
  }
  includeSyzygy = requireSyzygyOption(includeSyzygy);
  if (!source) throw new CalculationError('星历尚未就绪，请先等待文件加载完成。', 'ephemeris_unavailable');
  await initAstrology(undefined, { date: payload.date, includeSyzygy });
  // resolveLocal performs strict date/time/zone and DST overlap/gap validation.
  const local = resolveLocal(payload.date, payload.time, payload.timezone, payload.fold ?? null);
  const warnings = [];
  try {
    const jd = runtime.utcToJD(local.utcMillis);
    const [sun, moon] = positions(jd);
    const planets = { sun, moon };
    for (const [key, body] of CLASSICAL_PLANETS.slice(2)) planets[key] = runtime.position(jd, body);
    // Equal is used ONLY as the independent geometric-axes calculation. It
    // is never presented as the user's house system or used for an 11th cusp.
    const geometric = engine.houses(jd, latitude, longitude, 'E');
    const angles = {
      ascendant: normalize(geometric.ascendant), mc: normalize(geometric.midheaven),
      descendant: normalize(geometric.ascendant + 180), ic: normalize(geometric.midheaven + 180),
    };
    const ascendant = angles.ascendant;
    let houseCusps = null;
    if (houseSystemKey !== null) {
      const selected = engine.houses(jd, latitude, longitude, HOUSE_SYSTEMS[houseSystemKey].code);
      if (selected.substituted) {
        throw new CalculationError('所选宫制在这个纬度无法使用。请明确改选其他宫制后再计算，系统不会自动替换宫制。', 'house_system_unavailable');
      }
      if (selected.cusps.length !== 12 || !selected.cusps.every(Number.isFinite)) {
        throw new CalculationError('宫头计算返回了无效数据，请核对出生地点。', 'ephemeris_error');
      }
      houseCusps = selected.cusps.map(normalize);
    }
    const altitude = runtime.altitude(jd, latitude, longitude, sun.values);
    let eventMeta = {};
    let eventFlags = {};
    let syzygy = null;
    if (includeSyzygy) {
      const [eventJD, target] = previousSyzygy(jd);
      const [eventSun, eventMoon] = positions(eventJD);
      const eventMillis = runtime.jdToUTCMillis(eventJD);
      syzygy = normalize(eventMoon.values[0]);
      eventMeta = {
        syzygy_type: target === 0 ? '新月（朔）' : '满月（望）', syzygy_phase: target,
        syzygy_local: formatInZone(Math.floor(eventMillis / 1000) * 1000, payload.timezone),
        syzygy_utc: utcISO(eventMillis), syzygy_sun: normalize(eventSun.values[0]),
        syzygy_moon: syzygy, syzygy_julian_day_ut: eventJD,
      };
      eventFlags = { syzygy_sun: eventSun.flags, syzygy_moon: eventMoon.flags };
    }
    if (!Number.isFinite(altitude) || !Object.values(angles).every(Number.isFinite)) throw new Error('invalid axis');
    if (Math.abs(altitude) < 1) warnings.push('太阳接近地平线，出生时间的小幅变化可能改变昼夜判定与名号顺序。');
    if (Math.abs(latitude) >= 66) warnings.push('出生地位于高纬度地区，请特别核对准确时间和坐标；此处使用几何上升点。');
    if (Number(payload.date.slice(0, 4)) < 1900) warnings.push('1900 年以前的民用时间记录可能采用地方平时；请核对所选时区与史料。');
    return {
      sun: normalize(sun.values[0]), moon: normalize(moon.values[0]), ascendant,
      syzygy, sect: altitude >= 0 ? 'day' : 'night',
      positions: Object.fromEntries(CLASSICAL_PLANETS.map(([key]) => [key, normalize(planets[key].values[0])])),
      angles, mc: angles.mc, descendant: angles.descendant, ic: angles.ic,
      houseCusps, eleventhCusp: houseCusps?.[10] ?? null,
      meta: {
        birth_local: local.localISO, birth_utc: local.utcISO,
        timezone: payload.timezone, timezone_data: `tzdata ${getTimezoneVersion()}`,
        utc_offset: `UTC${local.utcOffset.replace(/^-/, '−')}`, fold: local.fold,
        latitude, longitude, sun_altitude: altitude,
        sect_rule: '太阳中心的几何高度 ≥ 0° 为昼生；不计大气折射与太阳半径。',
        ...eventMeta,
        engine: `Swiss Ephemeris ${engine.version} WebAssembly（Swiss 星历文件）`,
        ephemeris_flags: { ...Object.fromEntries(CLASSICAL_PLANETS.map(([key]) => [key, planets[key].flags])), ...eventFlags },
        house_system: houseSystemKey,
        house_system_name: houseSystemKey === null ? '未选择（仅计算四角）' : HOUSE_SYSTEMS[houseSystemKey].label,
        zodiac: '回归黄道，地心视位置', julian_day_ut: jd,
      },
      warnings,
    };
  } catch (error) {
    if (error?.code) throw error;
    throw new CalculationError('星历计算失败，请核对出生资料或重新加载星历文件。', 'ephemeris_error');
  }
}
