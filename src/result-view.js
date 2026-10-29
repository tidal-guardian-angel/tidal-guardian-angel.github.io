/** Shared, presentational result view. No form state, algorithms or events. */
const COLORS = Object.freeze({
  ink: '#3B3345', muted: '#73677B', accent: '#745A7D', purple: '#61496D',
  background: '#F2EEF5', surface: '#FFFCFF', line: '#DCD3E1',
  root: '#F8F3FA', suffix: '#EDF1EB', warning: '#77501F',
});
const FONTS = Object.freeze({
  body: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: '"Songti SC", "STSong", serif',
  hebrew: '"Arial Hebrew", "Noto Sans Hebrew", Arial, sans-serif',
  arabic: '"Geeza Pro", "Noto Naskh Arabic", "Noto Sans Arabic", Arial, sans-serif',
  latin: 'Georgia, "Times New Roman", serif',
});
const isPresent = (value) => value !== undefined && value !== null && value !== '';
const text = (value) => value === undefined || value === null ? '' : String(value);
const strings = (values) => Array.isArray(values) ? values.map(text).filter(Boolean) : [];
const unique = (values) => [...new Set(values)];
const timeText = (value) => text(value).replace('T', ' ').replace(/(?:\.000)?(?:Z|\+00:00)$/, ' UTC');
const angleText = (value, digits = 6) => typeof value === 'number' && Number.isFinite(value)
  ? `${value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')}°` : '';

function viewError(message, code = 'result_view_error') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function model(data) {
  if (!data || !data.name || !Array.isArray(data.name.letters)
      || !data.record || !Array.isArray(data.record.headers)
      || data.record.headers.length !== 5 || !Array.isArray(data.record.rows)
      || data.record.rows.some((row) => !Array.isArray(row) || row.length !== 5)) {
    throw viewError('结果记录格式不完整，请重新计算。');
  }
  const letters = data.name.letters.map((letter) => ({
    hebrew: text(letter.hebrew), latin: text(letter.latin),
    reading: text(letter.reading), value: text(letter.value),
  }));
  const rootCount = Number.isSafeInteger(data.rootCount) ? data.rootCount : Math.max(0, letters.length - 2);
  if (rootCount < 0 || rootCount > letters.length) throw viewError('名号字母数量与记录不一致，请重新计算。');
  const script = data.name.script === 'ar' ? 'ar' : 'he';
  const pointLabels = new Map((Array.isArray(data.points) ? data.points : [])
    .filter((point) => point && isPresent(point.key) && isPresent(point.label))
    .map((point) => [point.key, text(point.label)]));
  const captions = letters.map((_, index) => index >= rootCount ? '后缀'
    : pointLabels.get(Array.isArray(data.order) ? data.order[index] : undefined) || `根字 ${index + 1}`);
  const details = Array.isArray(data.details) ? data.details
    .filter((entry) => Array.isArray(entry) && entry.length >= 2 && isPresent(entry[1]))
    .map(([label, value]) => [text(label), text(value)]) : [];
  const meta = data.meta || {};
  const automatic = [];
  const put = (label, value) => { if (isPresent(value)) automatic.push([label, text(value)]); };
  if (data.mode === 'auto') {
    put('出生地点', data.place);
    put('当地出生时间', timeText(meta.birth_local));
    put('出生时 UTC', timeText(meta.birth_utc));
    put('历史时区', [meta.timezone, meta.utc_offset].filter(isPresent).join(' / '));
    put('时区数据', meta.timezone_data);
    if (typeof meta.latitude === 'number' && Number.isFinite(meta.latitude)
        && typeof meta.longitude === 'number' && Number.isFinite(meta.longitude)) {
      put('出生地坐标', `${meta.latitude}°, ${meta.longitude}°（纬度，经度）`);
    }
    put('太阳几何高度', angleText(meta.sun_altitude, 4));
    put('昼夜口径', meta.sect_rule);
    put('出生前朔望', meta.syzygy_type);
    put('朔望当地时间', timeText(meta.syzygy_local));
    put('朔望 UTC', timeText(meta.syzygy_utc));
    put('朔望月亮黄经', angleText(meta.syzygy_moon));
    put('朔望太阳黄经', angleText(meta.syzygy_sun));
  }
  put('宫制', meta.house_system_name);
  put('黄道口径', meta.zodiac);
  put('计算引擎', meta.engine);
  const seen = new Set();
  const entries = [...details, ...automatic].filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    method: text(data.method) || '名号计算', mode: data.mode,
    sect: data.sect === 'day' ? '昼生' : data.sect === 'night' ? '夜生' : '',
    place: text(data.place), birthLocal: timeText(meta.birth_local),
    hebrew: text(data.name.hebrew), transliteration: text(data.name.transliteration),
    pronunciation: text(data.pronunciation), pronunciationLabel: script === 'ar' ? '字母名辅助' : '固定赋音',
    script, letters, rootCount, captions,
    candidateLabel: text(data.candidateLabel), candidateSummary: text(data.candidateSummary),
    record: {
      title: text(data.record.title) || '取字记录', caption: text(data.record.caption),
      headers: data.record.headers.map(text), rows: data.record.rows.map((row) => row.map(text)),
      formula: text(data.record.formula), notes: strings(data.record.notes),
    },
    details: entries, warnings: unique(strings(data.warnings)),
  };
}

function sourceContext(view) {
  return view.mode === 'auto' ? [view.place || '出生星盘', view.birthLocal].filter(Boolean).join(' / ')
    : view.mode === 'name' ? '姓名计算' : '手动输入';
}
function contextText(view) {
  return [view.method, sourceContext(view)].filter(Boolean).join(' / ');
}

function child(document, tag, value, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text(value);
  return node;
}

/** Render supplied records verbatim; the application owns dirty/busy states. */
export function renderResult(data) {
  const view = model(data);
  const document = globalThis.document;
  const get = (id) => document.getElementById(id);
  const required = ['result', 'empty-state', 'result-context', 'sect-badge', 'hebrew-name',
    'latin-name', 'reading-name', 'letter-strip', 'result-warnings', 'points-table',
    'record-title', 'record-caption', 'formula-label', 'fortune-formula', 'order-note', 'chart-meta'];
  if (required.some((id) => !get(id))) throw viewError('结果区域尚未准备好，请刷新页面。');
  get('empty-state').hidden = true;
  get('result').hidden = false;
  if (get('stale-notice')) get('stale-notice').hidden = true;
  get('result-context').textContent = contextText(view);
  get('sect-badge').textContent = view.sect;
  get('sect-badge').hidden = !view.sect;
  get('hebrew-name').textContent = view.hebrew;
  get('hebrew-name').lang = view.script;
  get('hebrew-name').style.fontFamily = view.script === 'ar' ? FONTS.arabic : FONTS.hebrew;
  get('latin-name').textContent = view.transliteration;
  get('reading-name').textContent = view.pronunciation ? `${view.pronunciationLabel}：${view.pronunciation}`
    : `${view.rootCount} 个取名字母，${view.letters.length - view.rootCount} 个后缀字母`;
  const strip = get('letter-strip');
  strip.style.gridTemplateColumns = 'repeat(auto-fit, minmax(min(58px, 100%), 1fr))';
  strip.replaceChildren(...view.letters.map((letter, index) => {
    const suffix = index >= view.rootCount;
    const cell = child(document, 'div', '', `letter-cell${suffix ? ' suffix' : ''}`);
    const glyph = child(document, 'span', letter.hebrew, 'letter-hebrew');
    glyph.lang = view.script; glyph.dir = 'rtl';
    glyph.style.fontFamily = view.script === 'ar' ? FONTS.arabic : FONTS.hebrew;
    cell.append(glyph, child(document, 'span', letter.latin, 'letter-latin'),
      child(document, 'span', letter.value, 'letter-value'),
      child(document, 'span', view.captions[index], 'letter-caption'));
    if (letter.reading) cell.title = `${letter.latin} / ${letter.reading}`;
    return cell;
  }));
  const readingNote = get('result').querySelector('.reading-note');
  if (readingNote) readingNote.textContent = `字母格按取字顺序从左至右列出，所选文字的整名从右至左读。连读转写与${view.pronunciationLabel}分别保留，可对照各字母读音核对。`;
  let candidates = get('candidate-summary');
  if (!candidates) {
    candidates = document.createElement('div');
    candidates.id = 'candidate-summary';
    candidates.className = 'candidate-summary';
    Object.assign(candidates.style, { margin: '16px 0', padding: '11px 13px', border: '1px solid #DED1E6', borderRadius: '7px', background: '#F5EFF8', color: '#65506F', fontSize: '13px', lineHeight: '1.9', overflowWrap: 'anywhere' });
    get('result').querySelector('.name-display').before(candidates);
  }
  candidates.hidden = !view.candidateLabel && !view.candidateSummary;
  candidates.replaceChildren();
  if (view.candidateLabel) candidates.append(child(document, 'strong', view.candidateLabel));
  if (view.candidateSummary) {
    const paragraph = child(document, 'p', view.candidateSummary);
    paragraph.style.whiteSpace = 'pre-line';
    candidates.append(paragraph);
  }
  get('result-warnings').hidden = !view.warnings.length;
  get('result-warnings').replaceChildren(...view.warnings.map((warning) => child(document, 'p', warning)));
  get('record-title').textContent = view.record.title;
  get('record-caption').textContent = view.record.caption;
  get('record-caption').hidden = !view.record.caption;
  const table = get('points-table').closest('table');
  const header = table?.querySelector('thead tr');
  if (header) header.replaceChildren(...view.record.headers.map((label) => {
    const th = child(document, 'th', label); th.scope = 'col';
    th.style.whiteSpace = 'normal'; return th;
  }));
  if (table?.querySelector('caption')) table.querySelector('caption').textContent = view.record.title;
  get('points-table').replaceChildren(...view.record.rows.map((row) => {
    const tr = document.createElement('tr');
    for (const value of row) {
      const td = document.createElement('td');
      Object.assign(td.style, { whiteSpace: 'normal', overflowWrap: 'anywhere' });
      const isolated = child(document, 'bdi', value); isolated.dir = 'auto';
      td.append(isolated); tr.append(td);
    }
    return tr;
  }));
  get('formula-label').textContent = '计算说明';
  get('formula-label').hidden = !view.record.formula;
  get('fortune-formula').textContent = view.record.formula;
  get('fortune-formula').hidden = !view.record.formula;
  get('order-note').textContent = view.record.notes.join('\n');
  get('order-note').style.whiteSpace = 'pre-line';
  get('order-note').hidden = !view.record.notes.length;
  const formulaRegion = get('fortune-formula').closest('.formula-note');
  if (formulaRegion) formulaRegion.hidden = !view.record.formula && !view.record.notes.length;
  get('chart-meta').replaceChildren(...view.details.flatMap(([label, value]) => [
    child(document, 'dt', label), child(document, 'dd', value),
  ]));
  if (get('meta-details')) {
    get('meta-details').hidden = !view.details.length;
    const summary = get('meta-details').querySelector('summary');
    if (summary) summary.textContent = view.mode === 'auto' ? '查看排盘与计算资料' : '查看计算资料';
  }
}

/** Complete plain-text record, independent of DOM and selected UI controls. */
export function recordText(data) {
  const view = model(data);
  const lines = ['潮汐纪年社出品', '守护天使名号计算记录', view.method, sourceContext(view)];
  if (view.candidateLabel) lines.push(view.candidateLabel);
  if (view.candidateSummary) lines.push(`全部候选：${view.candidateSummary}`);
  if (view.sect) lines.push(`昼夜：${view.sect}`);
  lines.push(`名号：${view.hebrew}`, `连读转写：${view.transliteration}`);
  if (view.pronunciation) lines.push(`${view.pronunciationLabel}：${view.pronunciation}`);
  lines.push(`取名字母：${view.rootCount} 个；后缀字母：${view.letters.length - view.rootCount} 个`, '', '逐字记录：');
  view.letters.forEach((letter, index) => lines.push(`${index + 1}. ${letter.hebrew} / ${letter.latin}${letter.reading ? ` / ${letter.reading}` : ''}；数值 ${letter.value}；${view.captions[index]}`));
  lines.push('', view.record.title);
  if (view.record.caption) lines.push(view.record.caption);
  lines.push(view.record.headers.join('\t'), ...view.record.rows.map((row) => row.join('\t')));
  if (view.record.formula) lines.push('', '计算说明：', view.record.formula);
  if (view.record.notes.length) lines.push('', '记录说明：', ...view.record.notes);
  if (view.details.length) lines.push('', '计算资料：', ...view.details.map(([label, value]) => `${label}：${value}`));
  if (view.warnings.length) lines.push('', '核对提示：', ...view.warnings);
  return lines.join('\n');
}

let watermarkPromise;
function loadWatermark() {
  if (!watermarkPromise) {
    watermarkPromise = new Promise((resolve, reject) => {
      const url = new URL('./assets/tidal-watermark.png', document.baseURI);
      if (url.origin !== location.origin) {
        reject(viewError('品牌水印必须从本站载入。', 'watermark_unavailable')); return;
      }
      const picture = new Image();
      picture.decoding = 'async';
      picture.onload = () => picture.naturalWidth && picture.naturalHeight
        ? resolve(picture) : reject(viewError('品牌水印文件无效，请刷新后重试。', 'watermark_unavailable'));
      picture.onerror = () => reject(viewError('品牌水印未能载入，请刷新后重试。', 'watermark_unavailable'));
      picture.src = url.href;
    }).catch((error) => { watermarkPromise = null; throw error; });
  }
  return watermarkPromise;
}

const WIDTH = 1440;
const PAGE_HEIGHT = 2800;
const MAX_PAGES = 3;
const LEFT = 115;
const RIGHT = 1325;
const CONTENT_WIDTH = RIGHT - LEFT;
const FOOTER_HEIGHT = 230;
const MAX_TEXT_LENGTH = 30000;
const tooLong = () => viewError('记录较长，结果图无法完整容纳。请使用“打印／存为 PDF”保存全部记录。', 'result_too_long');

function layoutImage(view, measure) {
  const commands = [];
  const pages = [];
  let page = -1;
  let y = 0;
  const font = (size, family = FONTS.body) => `${size}px ${family}`;
  const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'grapheme' }) : null;
  function wrap(value, width, size = 24, family = FONTS.body) {
    measure.font = font(size, family);
    const lines = [];
    for (const paragraph of text(value).split(/\r?\n/)) {
      let row = '';
      const chars = graphemes ? [...graphemes.segment(paragraph)].map((entry) => entry.segment) : Array.from(paragraph);
      for (const char of chars) {
        if (row && measure.measureText(row + char).width > width) { lines.push(row); row = char; }
        else row += char;
      }
      lines.push(row);
    }
    return lines;
  }
  function drawText(value, x, baseline, size = 24, color = COLORS.ink, family = FONTS.body, align = 'left', direction = 'ltr') {
    commands.push({ type: 'text', value: text(value), x, y: baseline, size, color, family, align, direction });
  }
  function rectangle(x, top, width, height, color) { commands.push({ type: 'rect', x, y: top, width, height, color }); }
  function rule(top) { commands.push({ type: 'line', x: LEFT, y: top, width: CONTENT_WIDTH, color: COLORS.line }); }
  function newPage() {
    page++;
    if (page >= MAX_PAGES) throw tooLong();
    const base = page * PAGE_HEIGHT;
    pages.push({ base, end: 0 });
    y = base + 100;
    drawText('潮汐纪年社出品', LEFT, y, 21, COLORS.accent);
    y += 61;
    drawText(page === 0 ? '守护天使名号计算记录' : '守护天使名号计算记录（续）', LEFT, y, 37, COLORS.ink, FONTS.serif);
    y += 48;
    for (const line of wrap([view.method, view.sect].filter(Boolean).join(' / '), CONTENT_WIDTH, 25)) {
      drawText(line, LEFT, y, 25, COLORS.muted); y += 36;
    }
    if (view.candidateLabel) {
      for (const line of wrap(view.candidateLabel, CONTENT_WIDTH, 23)) {
        drawText(line, LEFT, y, 23, COLORS.accent); y += 34;
      }
    }
    rule(y + 8); y += 42;
    if (y > base + PAGE_HEIGHT - FOOTER_HEIGHT - 150) throw tooLong();
  }
  const bottom = () => (page + 1) * PAGE_HEIGHT - FOOTER_HEIGHT;
  function ensure(height) {
    if (y + height <= bottom()) return false;
    newPage();
    if (y + height > bottom()) throw tooLong();
    return true;
  }
  function paragraph(value, { size = 24, color = COLORS.muted, family = FONTS.body, align = 'left', before = 0, after = 10, width = CONTENT_WIDTH } = {}) {
    if (!isPresent(value)) return;
    const rows = wrap(value, width, size, family);
    const lineHeight = Math.ceil(size * 1.55);
    ensure(before + lineHeight); y += before;
    for (const row of rows) {
      ensure(lineHeight);
      drawText(row, align === 'center' ? WIDTH / 2 : LEFT, y + size, size, color, family, align,
        family === FONTS.hebrew || family === FONTS.arabic ? 'rtl' : 'ltr');
      y += lineHeight;
    }
    y += after;
  }
  function heading(value) {
    ensure(145);
    paragraph(value, { size: 29, color: COLORS.ink, family: FONTS.serif, before: 20, after: 10 });
  }
  newPage();
  if (view.candidateSummary) paragraph(`全部候选：${view.candidateSummary}`, { size: 22, color: COLORS.accent, after: 17 });
  const hebrewSize = view.hebrew.length > 24 ? 66 : view.hebrew.length > 14 ? 84 : 100;
  const scriptFont = view.script === 'ar' ? FONTS.arabic : FONTS.hebrew;
  paragraph(view.hebrew, { size: hebrewSize, color: COLORS.purple, family: scriptFont, align: 'center', before: 14, after: 6 });
  paragraph(view.transliteration, { size: 29, color: COLORS.ink, family: FONTS.latin, align: 'center', after: 7 });
  if (view.pronunciation) paragraph(`${view.pronunciationLabel}：${view.pronunciation}`, { size: 24, align: 'center', after: 14 });
  paragraph(`${view.rootCount} 个取名字母，${view.letters.length - view.rootCount} 个后缀字母`, { size: 21, align: 'center', after: 20 });
  const columns = Math.min(7, Math.max(1, view.letters.length));
  const cellWidth = 157;
  const gap = 18;
  for (let start = 0; start < view.letters.length; start += columns) {
    const row = view.letters.slice(start, start + columns);
    const latinLines = row.map((letter) => wrap(letter.latin, cellWidth - 18, 21, FONTS.latin));
    const readingLines = row.map((letter) => letter.reading && letter.reading !== letter.latin ? wrap(letter.reading, cellWidth - 18, 18) : []);
    const maxLatin = Math.max(1, ...latinLines.map((lines) => lines.length));
    const maxReading = Math.max(0, ...readingLines.map((lines) => lines.length));
    const height = 119 + maxLatin * 29 + maxReading * 25 + 33;
    ensure(height + 15);
    const startX = (WIDTH - (row.length * cellWidth + (row.length - 1) * gap)) / 2;
    row.forEach((letter, index) => {
      const position = start + index;
      const x = startX + index * (cellWidth + gap);
      rectangle(x, y, cellWidth, height, position >= view.rootCount ? COLORS.suffix : COLORS.root);
      drawText(letter.hebrew, x + cellWidth / 2, y + 59, 44, COLORS.purple, scriptFont, 'center', 'rtl');
      latinLines[index].forEach((line, lineIndex) => drawText(line, x + cellWidth / 2, y + 99 + lineIndex * 29, 21, COLORS.muted, FONTS.latin, 'center'));
      const readingY = y + 99 + maxLatin * 29;
      readingLines[index].forEach((line, lineIndex) => drawText(line, x + cellWidth / 2, readingY + lineIndex * 25, 18, COLORS.muted, FONTS.body, 'center'));
      drawText(letter.value, x + cellWidth / 2, y + height - 40, 21, COLORS.accent, FONTS.body, 'center');
      drawText(view.captions[position], x + cellWidth / 2, y + height - 14, 18, COLORS.muted, FONTS.body, 'center');
    });
    y += height + 15;
  }
  paragraph('字母格按取字顺序列出；所选文字的整名从右至左读。', { size: 20, align: 'center', after: 16 });
  const widths = [0.17, 0.30, 0.19, 0.22, 0.12].map((ratio) => ratio * CONTENT_WIDTH);
  const headerRows = view.record.headers.map((value, index) => wrap(value, widths[index] - 24, 21));
  const headerHeight = Math.max(...headerRows.map((rows) => rows.length)) * 31 + 28;
  const titleHeight = wrap(view.record.title, CONTENT_WIDTH, 29, FONTS.serif).length * 45 + 30;
  const captionHeight = view.record.caption ? wrap(view.record.caption, CONTENT_WIDTH, 21).length * 33 + 12 : 0;
  ensure(titleHeight + captionHeight + headerHeight + 70);
  heading(view.record.title);
  if (view.record.caption) paragraph(view.record.caption, { size: 21, after: 12 });
  function tableHeader() {
    ensure(headerHeight + 60);
    rectangle(LEFT, y, CONTENT_WIDTH, headerHeight, '#F5EFF8');
    let x = LEFT;
    headerRows.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => drawText(line, x + 12, y + 29 + lineIndex * 31, 21, COLORS.muted));
      x += widths[index];
    });
    y += headerHeight;
    rule(y);
  }
  tableHeader();
  for (const row of view.record.rows) {
    const lines = row.map((value, index) => wrap(value, widths[index] - 24, 23));
    const count = Math.max(1, ...lines.map((list) => list.length));
    let first = 0;
    while (first < count) {
      const fullHeight = (count - first) * 35 + 30;
      if (first === 0 && y + fullHeight > bottom() && fullHeight <= PAGE_HEIGHT - FOOTER_HEIGHT - 400 - headerHeight) {
        newPage(); tableHeader();
      }
      const capacity = Math.floor((bottom() - y - 30) / 35);
      if (capacity < 1) { newPage(); tableHeader(); continue; }
      const take = Math.min(count - first, capacity);
      let x = LEFT;
      lines.forEach((cellLines, column) => {
        cellLines.slice(first, first + take).forEach((line, lineIndex) => {
          const rtl = /^[\u0590-\u08FF]/u.test(line.trim());
          drawText(line, rtl ? x + widths[column] - 12 : x + 12, y + 31 + lineIndex * 35,
            23, COLORS.ink, FONTS.body, rtl ? 'right' : 'left', rtl ? 'rtl' : 'ltr');
        });
        x += widths[column];
      });
      y += take * 35 + 30; rule(y); first += take;
      if (first < count) { newPage(); tableHeader(); }
    }
  }
  y += 15;
  if (view.record.formula) {
    heading('计算说明');
    paragraph(view.record.formula, { size: 24, color: COLORS.ink });
  }
  for (const note of view.record.notes) paragraph(note, { size: 22, after: 11 });
  if (view.details.length) {
    heading('计算资料');
    for (const [label, value] of view.details) paragraph(`${label}：${value}`, { size: 22, after: 10 });
  }
  if (view.warnings.length) {
    heading('核对提示');
    for (const warning of view.warnings) paragraph(warning, { size: 21, color: COLORS.warning, after: 11 });
  }
  pages[page].end = y - pages[page].base;
  // Each preceding page is full-height; the final page ends after its content
  // plus a reserved watermark footer. No image is drawn then cropped to fit.
  const lastHeight = Math.max(780, Math.ceil(pages[page].end + FOOTER_HEIGHT));
  const height = page * PAGE_HEIGHT + lastHeight;
  if (height > PAGE_HEIGHT * MAX_PAGES || WIDTH * height > 12500000) throw tooLong();
  pages.forEach((entry, index) => { entry.height = index === pages.length - 1 ? lastHeight : PAGE_HEIGHT; });
  return { commands, pages, width: WIDTH, height };
}

/** A complete watermarked PNG. Download, object URLs and stale checks are external. */
export async function resultImage(data) {
  const view = model(data);
  if (recordText(data).length > MAX_TEXT_LENGTH || view.letters.length > 140) throw tooLong();
  const watermark = await loadWatermark();
  if (document.fonts?.ready) await document.fonts.ready;
  const measurement = document.createElement('canvas');
  measurement.width = WIDTH; measurement.height = 1;
  const measuringContext = measurement.getContext('2d');
  if (!measuringContext) throw viewError('当前浏览器无法生成结果图，请使用打印／存为 PDF。', 'canvas_unavailable');
  const plan = layoutImage(view, measuringContext);
  const canvas = document.createElement('canvas');
  canvas.width = plan.width; canvas.height = plan.height;
  const context = canvas.getContext('2d');
  if (!context) throw viewError('当前浏览器无法生成结果图，请使用打印／存为 PDF。', 'canvas_unavailable');
  context.fillStyle = COLORS.background; context.fillRect(0, 0, plan.width, plan.height);
  for (const page of plan.pages) {
    context.fillStyle = COLORS.surface;
    context.fillRect(50, page.base + 50, WIDTH - 100, page.height - 100);
  }
  context.textBaseline = 'alphabetic';
  for (const command of plan.commands) {
    context.save();
    if (command.type === 'text') {
      context.fillStyle = command.color;
      context.font = `${command.size}px ${command.family}`;
      context.textAlign = command.align; context.direction = command.direction;
      context.fillText(command.value, command.x, command.y);
    } else if (command.type === 'rect') {
      context.fillStyle = command.color;
      context.fillRect(command.x, command.y, command.width, command.height);
    } else {
      context.strokeStyle = command.color; context.lineWidth = 2;
      context.beginPath(); context.moveTo(command.x, command.y);
      context.lineTo(command.x + command.width, command.y); context.stroke();
    }
    context.restore();
  }
  const stampWidth = 330;
  const stampHeight = stampWidth * watermark.naturalHeight / watermark.naturalWidth;
  plan.pages.forEach((page, index) => {
    const stampY = page.base + page.height - stampHeight - 70;
    context.save(); context.globalAlpha = 0.16;
    context.drawImage(watermark, RIGHT - stampWidth, stampY, stampWidth, stampHeight);
    context.restore();
    context.fillStyle = COLORS.muted; context.font = `18px ${FONTS.body}`;
    context.textAlign = 'left'; context.direction = 'ltr';
    context.fillText(`${index + 1} / ${plan.pages.length}`, LEFT, page.base + page.height - 80);
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 1; canvas.height = 1; measurement.width = 1;
      if (blob) resolve(blob);
      else reject(viewError('结果图未能生成，请使用打印／存为 PDF。', 'canvas_unavailable'));
    }, 'image/png');
  });
}
