import { el, poster } from './dom.js';
import { openDetail } from './detail.js';
import { describeError } from '../tmdb.js';
import { PROVIDERS } from '../filters.js';
import { findPersonMovies, loadProviders } from '../search.js';

const MODES = { title: '片名', cast: '演員', crew: '導演' };
const PLACEHOLDERS = { title: '輸入片名', cast: '輸入演員名字', crew: '輸入導演名字' };
const LIST_LABELS = { watched: '已看過', notInterested: '沒興趣', watchlist: '待看' };
const MAX_TITLE_RESULTS = 10;

let root;
let ctx;
let mode = 'title';
let timer;
let seq = 0;
const els = {};

export function mount(element, context) {
  root = element;
  ctx = context;
  els.modes = el('div', { class: 'segmented' });
  els.input = el('input', { type: 'search', autocomplete: 'off', oninput: onInput });
  els.suggestions = el('ul', { class: 'suggestions' });
  els.results = el('div', { class: 'search-results' });
  root.replaceChildren(
    el('h1', {}, '搜尋'),
    el('p', { class: 'muted' }, '查詢電影在台灣的 Netflix、Disney+、Apple TV（租/買）上架情形'),
    els.modes,
    els.input,
    els.suggestions,
    els.results,
  );
  renderModes();
}

export function onShow() {}

function renderModes() {
  els.modes.replaceChildren(...Object.entries(MODES).map(([name, label]) =>
    el('button', { class: name === mode ? 'active' : '', onclick: () => setMode(name) }, label)));
  els.input.placeholder = PLACEHOLDERS[mode];
}

function setMode(name) {
  mode = name;
  seq += 1;
  clearTimeout(timer);
  els.input.value = '';
  els.suggestions.replaceChildren();
  els.results.replaceChildren();
  renderModes();
  els.input.focus();
}

function showMessage(text) {
  els.results.replaceChildren(el('p', { class: 'empty' }, text));
}

function onInput() {
  clearTimeout(timer);
  seq += 1;
  const mySeq = seq;
  const query = els.input.value.trim();
  els.suggestions.replaceChildren();
  if (!query) {
    els.results.replaceChildren();
    return;
  }
  timer = setTimeout(() => {
    const tmdb = ctx.tmdb();
    if (!tmdb) {
      ctx.goTo('settings');
      return;
    }
    if (mode === 'title') searchTitle(tmdb, query, mySeq);
    else searchPeople(tmdb, query, mySeq);
  }, 400);
}

// ---------- 片名 ----------

async function searchTitle(tmdb, query, mySeq) {
  showMessage('搜尋中…');
  try {
    const movies = (await tmdb.searchMovie(query)).slice(0, MAX_TITLE_RESULTS);
    if (mySeq !== seq) return;
    if (!movies.length) {
      showMessage('找不到這部電影');
      return;
    }
    const platformCells = new Map();
    els.results.replaceChildren(el('ul', { class: 'movie-list' }, movies.map((m) => {
      const cell = el('div', { class: 'chips' }, el('span', { class: 'muted' }, '查詢平台中…'));
      platformCells.set(m.id, cell);
      return resultRow(m, cell);
    })));
    await loadProviders(tmdb, movies, (id, providers) => {
      if (mySeq !== seq) return;
      fillPlatforms(platformCells.get(id), providers);
    });
  } catch (err) {
    if (mySeq === seq) showMessage(describeError(err));
  }
}

// ---------- 演員／導演 ----------

async function searchPeople(tmdb, query, mySeq) {
  try {
    const people = await tmdb.searchPerson(query);
    if (mySeq !== seq) return;
    if (!people.length) {
      els.suggestions.replaceChildren(el('li', { class: 'muted' }, '找不到這個人'));
      return;
    }
    els.suggestions.replaceChildren(...people.map((p) => el('li', {},
      el('button', { onclick: () => showPerson(tmdb, p) }, p.name))));
  } catch (err) {
    if (mySeq === seq) els.suggestions.replaceChildren(el('li', { class: 'muted' }, describeError(err)));
  }
}

async function showPerson(tmdb, person) {
  seq += 1;
  const mySeq = seq;
  const role = mode;
  els.suggestions.replaceChildren();
  els.input.value = person.name;
  showMessage('搜尋中…');
  try {
    const movies = await findPersonMovies(tmdb, person.id, role);
    if (mySeq !== seq) return;
    const heading = el('h2', {}, `${person.name}（${MODES[role]}）`);
    if (!movies.length) {
      els.results.replaceChildren(heading, el('p', { class: 'empty' }, '目前沒有在這些平台上的作品'));
      return;
    }
    els.results.replaceChildren(
      heading,
      el('p', { class: 'muted' }, `共 ${movies.length} 部`),
      el('ul', { class: 'movie-list' }, movies.map((m) => {
        const cell = el('div', { class: 'chips' });
        fillPlatforms(cell, m.providers);
        return resultRow(m, cell);
      })));
  } catch (err) {
    if (mySeq === seq) showMessage(describeError(err));
  }
}

// ---------- 共用 ----------

function fillPlatforms(cell, providers) {
  if (providers === null) {
    cell.replaceChildren(el('span', { class: 'muted' }, '平台查詢失敗'));
  } else if (!providers.length) {
    cell.replaceChildren(el('span', { class: 'muted' }, '目前不在這些平台'));
  } else {
    cell.replaceChildren(...PROVIDERS
      .filter((p) => providers.includes(p.id))
      .map((p) => el('span', { class: 'chip' }, p.name)));
  }
}

const MARK_ACTIONS = [
  { list: 'watchlist', label: '🍿 加入待看', class: 'primary', toast: '已加入待看' },
  { list: 'watched', label: '✅ 看過了', toast: '已加入已看過' },
  { list: 'notInterested', label: '🙅 沒興趣', toast: '已加入沒興趣' },
];

function resultRow(movie, platformCell) {
  const tag = el('span', { class: 'chip list-tag' });
  function refreshTag() {
    const list = ctx.storage.listOf(movie.id);
    tag.textContent = list ? LIST_LABELS[list] : '';
    tag.hidden = !list;
  }
  refreshTag();

  function open() {
    const current = ctx.storage.listOf(movie.id);
    const actions = MARK_ACTIONS.map((a) => ({
      label: a.label,
      class: a.class,
      disabled: current === a.list,
      onClick: () => {
        ctx.storage.addToList(a.list, { id: movie.id, title: movie.title, poster: movie.poster, year: movie.year });
        ctx.toast(a.toast);
        refreshTag();
      },
    }));
    openDetail(ctx, movie, actions, { tag: current ? LIST_LABELS[current] : null });
  }

  return el('li', { class: 'movie-row' },
    el('div', { class: 'clickable', onclick: open }, poster(movie.poster, 'w185', 'thumb')),
    el('div', { class: 'movie-row-info' },
      el('div', { class: 'clickable', onclick: open },
        el('div', { class: 'movie-row-title' }, movie.title),
        el('div', { class: 'muted' },
          [movie.year ?? '年份不明', movie.originalTitle && movie.originalTitle !== movie.title ? movie.originalTitle : null]
            .filter(Boolean).join('・'))),
      tag,
      platformCell));
}
