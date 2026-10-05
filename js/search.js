import { PROVIDERS } from './filters.js';

const MAX_PAGES_PER_PROVIDER = 5;

// 找出某位演員（role='cast'）或導演（role='crew'）在台灣各平台上架的電影
// 每個平台各查一次，合併後即可知道每部片在哪些平台
export async function findPersonMovies({ discover }, personId, role) {
  const personParam = role === 'crew' ? 'with_crew' : 'with_cast';
  const byId = new Map();

  await Promise.all(PROVIDERS.map(async (provider) => {
    const params = {
      watch_region: 'TW',
      with_watch_providers: String(provider.id),
      include_adult: 'false',
      sort_by: 'popularity.desc',
      [personParam]: String(personId),
    };
    let page = 1;
    let lastPage = 1;
    do {
      const data = await discover(params, page);
      lastPage = Math.min(data.totalPages, MAX_PAGES_PER_PROVIDER);
      for (const movie of data.results) {
        const entry = byId.get(movie.id) ?? { movie, providers: new Set() };
        entry.providers.add(provider.id);
        byId.set(movie.id, entry);
      }
      page += 1;
    } while (page <= lastPage);
  }));

  return [...byId.values()]
    .sort((a, b) => (b.movie.popularity ?? 0) - (a.movie.popularity ?? 0))
    .map(({ movie, providers }) => ({
      ...movie,
      providers: PROVIDERS.filter((p) => providers.has(p.id)).map((p) => p.id),
    }));
}

// 逐部查詢上架平台，每查完一部就呼叫 onResult(id, providers)；查詢失敗時 providers 為 null
export async function loadProviders({ movie }, movies, onResult) {
  await Promise.all(movies.map(async ({ id }) => {
    try {
      const details = await movie(id);
      onResult(id, details.providers);
    } catch {
      onResult(id, null);
    }
  }));
}
