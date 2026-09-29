import { el, poster } from './dom.js';
import { describeError } from '../tmdb.js';
import { PROVIDERS, DEFAULT_FILTERS, normalizeFilters, filtersKey } from '../filters.js';
import { createPicker } from '../picker.js';

const LANGUAGES = [
  ['', '不限'], ['en', '英語'], ['zh', '華語'], ['ja', '日語'], ['ko', '韓語'],
  ['fr', '法語'], ['es', '西班牙語'], ['de', '德語'], ['th', '泰語'],
];
const RUNTIMES = [['', '不限'], ['90', '90 分鐘'], ['120', '120 分鐘'], ['150', '150 分鐘'], ['180', '180 分鐘']];
const DEPARTMENTS = { Acting: '演員', Directing: '導演', Writing: '編劇', Production: '製作' };

let root;
let ctx;
let filters = normalizeFilters(DEFAULT_FILTERS);
let genres = null;
let genresError = null;
let picker = null;
let pickerTmdb = null;
let current = null;
let busy = false;
const els = {};

export function mount(element, context) {
  root = element;
  ctx = context;
  els.presets = el('div', { class: 'preset-bar' });
  els.form = el('div', { class: 'filters' });
  els.drawButton = el('button', { class: 'primary big', onclick: () => draw() }, '🎲 抽一部');
  els.result = el('div', { class: 'result' });
  root.replaceChildren(
    el('h1', {}, '今晚看什麼？'),
    els.presets,
    el('details', { class: 'card' },
      el('summary', {}, '篩選條件'),
      els.form,
      el('button', { onclick: savePreset }, '💾 存成預設組合')),
    els.drawButton,
    els.result,
  );
}

export function onShow() {
  renderPresets();
  renderForm();
  loadGenres();
}

// ---------- 條件 ----------

function setFilter(patch) {
  filters = normalizeFilters({ ...filters, ...patch });
  renderPresets();
}

function toggleIn(key, id) {
  const set = new Set(filters[key]);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  setFilter({ [key]: [...set] });
  renderForm();
}

async function loadGenres() {
  if (genres) return;
  const tmdb = ctx.tmdb();
  if (!tmdb) {
    genresError = '請先到設定頁輸入 API key';
    renderForm();
    return;
  }
  try {
    genres = await tmdb.genres();
    genresError = null;
  } catch (err) {
    genresError = describeError(err);
  }
  renderForm();
}

function renderPresets() {
  const presets = ctx.storage.getPresets();
  const activeKey = filtersKey(filters);
  els.presets.replaceChildren(...presets.map((p) =>
    el('button', { class: filtersKey(p.filters) === activeKey ? 'chip active' : 'chip', onclick: () => applyPreset(p) }, p.name)));
  els.presets.hidden = presets.length === 0;
}

function applyPreset(preset) {
  filters = normalizeFilters(preset.filters);
  current = null;
  els.result.replaceChildren();
  renderPresets();
  renderForm();
}

function savePreset() {
  const name = prompt('幫這組條件取個名字');
  if (!name || !name.trim()) return;
  ctx.storage.savePreset(name, filters);
  ctx.toast(`已儲存「${name.trim()}」`);
  renderPresets();
}

function field(label, control) {
  return el('div', { class: 'field' }, el('div', { class: 'field-label' }, label), control);
}

function toggleChip(label, active, onClick) {
  return el('button', { class: active ? 'chip active' : 'chip', onclick: onClick }, label);
}

function renderForm() {
  els.form.replaceChildren(
    field('平台', el('div', { class: 'chips' },
      PROVIDERS.map((p) => toggleChip(p.name, filters.providers.includes(p.id), () => toggleIn('providers', p.id))))),
    field('類型', genreChips()),
    field('年代', el('div', { class: 'row' }, yearInput('yearFrom', '起'), el('span', {}, '～'), yearInput('yearTo', '迄'))),
    field('演員', personPicker('cast', '輸入演員名字')),
    field('導演', personPicker('crew', '輸入導演名字')),
    ratingField(),
    selectField('原始語言', LANGUAGES, filters.language ?? '', (v) => setFilter({ language: v || null })),
    selectField('片長上限', RUNTIMES, filters.maxRuntime ? String(filters.maxRuntime) : '', (v) => setFilter({ maxRuntime: v || null })),
  );
}

function genreChips() {
  if (genresError) {
    return el('div', {},
      el('span', { class: 'muted' }, genresError), ' ',
      el('button', { onclick: () => { genresError = null; renderForm(); loadGenres(); } }, '重試'));
  }
  if (!genres) return el('span', { class: 'muted' }, '載入中…');
  return el('div', { class: 'chips' },
    genres.map((g) => toggleChip(g.name, filters.genres.includes(g.id), () => toggleIn('genres', g.id))));
}

function yearInput(key, placeholder) {
  return el('input', {
    type: 'number',
    inputmode: 'numeric',
    min: '1900',
    max: '2100',
    placeholder,
    value: filters[key] ?? '',
    'data-year': key,
    onchange: (e) => {
      setFilter({ [key]: e.target.value });
      // 只更新兩個年份欄位（可能已對調），不重畫表單，避免使用者正要點的下一個欄位失去焦點
      for (const input of els.form.querySelectorAll('input[data-year]')) {
        input.value = filters[input.dataset.year] ?? '';
      }
    },
  });
}

function ratingText(value) {
  return value > 0 ? `${value} 分以上` : '不限';
}

function ratingField() {
  const label = el('span', {}, ratingText(filters.minRating));
  const input = el('input', {
    type: 'range',
    min: '0',
    max: '9',
    step: '0.5',
    value: String(filters.minRating),
    oninput: () => { label.textContent = ratingText(Number(input.value)); },
    onchange: () => setFilter({ minRating: Number(input.value) }),
  });
  return field(el('span', {}, '最低評分：', label), input);
}

function selectField(label, options, value, onChange) {
  return field(label, el('select', { value, onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => el('option', { value: v }, text))));
}

function personPicker(key, placeholder) {
  const selected = el('div', { class: 'chips' }, filters[key].map((p) =>
    el('button', {
      class: 'chip active',
      onclick: () => {
        setFilter({ [key]: filters[key].filter((x) => x.id !== p.id) });
        renderForm();
      },
    }, `${p.name} ✕`)));
  const suggestions = el('ul', { class: 'suggestions' });
  let timer;
  let seq = 0;
  const input = el('input', {
    type: 'search',
    placeholder,
    autocomplete: 'off',
    oninput: () => {
      clearTimeout(timer);
      const query = input.value.trim();
      seq += 1;
      if (!query) {
        suggestions.replaceChildren();
        return;
      }
      const mySeq = seq;
      timer = setTimeout(async () => {
        const tmdb = ctx.tmdb();
        if (!tmdb) return;
        try {
          const people = await tmdb.searchPerson(query);
          if (mySeq !== seq) return;
          if (!people.length) {
            suggestions.replaceChildren(el('li', { class: 'muted' }, '找不到這個人'));
            return;
          }
          suggestions.replaceChildren(...people.map((p) => el('li', {},
            el('button', {
              onclick: () => {
                setFilter({ [key]: [...filters[key], { id: p.id, name: p.name }] });
                renderForm();
              },
            }, p.name, el('span', { class: 'muted' }, ` ${DEPARTMENTS[p.department] ?? ''}`)))));
        } catch (err) {
          if (mySeq === seq) suggestions.replaceChildren(el('li', { class: 'muted' }, describeError(err)));
        }
      }, 300);
    },
  });
  return el('div', {}, selected, input, suggestions);
}

// ---------- 抽片 ----------

function getPicker() {
  const tmdb = ctx.tmdb();
  if (!tmdb) return null;
  if (tmdb !== pickerTmdb) {
    picker = createPicker({ discover: tmdb.discover, isExcluded: (id) => ctx.storage.isExcluded(id) });
    pickerTmdb = tmdb;
  }
  return picker;
}

function setBusy(value) {
  busy = value;
  els.drawButton.disabled = value;
}

function showMessage(text, ...extra) {
  current = null;
  els.result.replaceChildren(el('div', { class: 'card message' }, el('p', {}, text), ...extra));
}

async function draw() {
  if (busy) return;
  const activePicker = getPicker();
  if (!activePicker) {
    ctx.goTo('settings');
    return;
  }
  if (!filters.providers.length) {
    showMessage('請至少選一個平台');
    return;
  }
  setBusy(true);
  showMessage('抽片中…');
  try {
    const result = await activePicker.pick(filters);
    if (result.status === 'ok') showMovie(result.movie);
    else if (result.status === 'no-results') showMessage('找不到符合條件的電影，試著放寬條件');
    else if (result.status === 'all-excluded') showMessage('符合條件的片都在你的清單裡了');
    else {
      showMessage('符合條件的片已經全部出現過了，要從頭再抽嗎？',
        el('button', { class: 'primary', onclick: () => { activePicker.resetRound(); draw(); } }, '從頭再抽'));
    }
  } catch (err) {
    showMessage(describeError(err));
  } finally {
    setBusy(false);
    // 手機上結果卡片常在畫面外，抽完自動捲過去
    els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function summary(movie) {
  return { id: movie.id, title: movie.title, poster: movie.poster, year: movie.year };
}

function metaText(movie, runtime) {
  return [
    movie.year ?? '年份不明',
    runtime ? `${runtime} 分鐘` : null,
    movie.rating ? `⭐ ${movie.rating.toFixed(1)}` : null,
  ].filter(Boolean).join('・');
}

function mark(list, message) {
  if (!current) return;
  ctx.storage.addToList(list, summary(current));
  ctx.toast(message);
  draw();
}

function showMovie(movie) {
  current = movie;
  const meta = el('p', { class: 'muted' }, metaText(movie));
  const platforms = el('div', { class: 'chips' });
  const watchButton = el('button', {
    class: 'primary',
    onclick: () => {
      ctx.storage.addToList('watchlist', summary(movie));
      ctx.toast('已加入待看');
      watchButton.disabled = true;
      watchButton.textContent = '已加入待看';
    },
  }, '🍿 就看這部');

  els.result.replaceChildren(el('article', { class: 'card movie-card' },
    poster(movie.poster),
    el('h2', {}, movie.title),
    movie.originalTitle && movie.originalTitle !== movie.title ? el('p', { class: 'muted' }, movie.originalTitle) : null,
    meta,
    platforms,
    el('p', { class: 'overview' }, movie.overview || '（沒有中文簡介）'),
    el('div', { class: 'actions' },
      el('button', { onclick: () => draw() }, '🔄 再抽一次'),
      el('button', { onclick: () => mark('watched', '已加入已看過') }, '✅ 看過了'),
      el('button', { onclick: () => mark('notInterested', '已加入沒興趣') }, '🙅 沒興趣'),
      watchButton)));

  loadDetails(movie, meta, platforms);
}

async function loadDetails(movie, meta, platforms) {
  try {
    const details = await ctx.tmdb().movie(movie.id);
    if (current?.id !== movie.id) return;
    meta.textContent = metaText(movie, details.runtime);
    platforms.replaceChildren(...PROVIDERS
      .filter((p) => details.providers.includes(p.id))
      .map((p) => el('span', { class: 'chip' }, p.name)));
  } catch {
    // 詳情載入失敗時只顯示基本資訊
  }
}
