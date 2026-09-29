import { filtersKey, toDiscoverParams } from './filters.js';

function shuffle(items, random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createPicker({ discover, isExcluded, random = Math.random }) {
  let key = null;
  let params = null;
  let totalResults = 0;
  let pageOrder = [];
  let pageCache = new Map();
  let shownThisRound = new Set();

  async function prepare(filters) {
    const nextKey = filtersKey(filters);
    if (nextKey === key) return;
    const nextParams = toDiscoverParams(filters);
    const first = await discover(nextParams, 1);
    // 第一頁成功後才更新狀態，失敗時下次會重新查詢
    key = nextKey;
    params = nextParams;
    totalResults = first.totalResults;
    pageCache = new Map([[1, first.results]]);
    shownThisRound = new Set();
    pageOrder = shuffle(Array.from({ length: first.totalPages }, (_, i) => i + 1), random);
  }

  async function loadPage(page) {
    if (!pageCache.has(page)) {
      const data = await discover(params, page);
      pageCache.set(page, data.results);
    }
    return pageCache.get(page);
  }

  async function pick(filters) {
    await prepare(filters);
    if (totalResults === 0) return { status: 'no-results' };

    let hasShownCandidate = false;
    for (const page of pageOrder) {
      const movies = await loadPage(page);
      const candidates = [];
      for (const movie of movies) {
        if (isExcluded(movie.id)) continue;
        if (shownThisRound.has(movie.id)) {
          hasShownCandidate = true;
          continue;
        }
        candidates.push(movie);
      }
      if (candidates.length) {
        const movie = candidates[Math.floor(random() * candidates.length)];
        shownThisRound.add(movie.id);
        return { status: 'ok', movie };
      }
    }
    return { status: hasShownCandidate ? 'round-exhausted' : 'all-excluded' };
  }

  function resetRound() {
    shownThisRound = new Set();
  }

  return { pick, resetRound };
}
