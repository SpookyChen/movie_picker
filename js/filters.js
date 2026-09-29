export const PROVIDERS = [
  { id: 8, name: 'Netflix' },
  { id: 337, name: 'Disney+' },
];

export const DEFAULT_FILTERS = Object.freeze({
  providers: [8, 337],
  genres: [],
  yearFrom: null,
  yearTo: null,
  cast: [],
  crew: [],
  minRating: 0,
  language: null,
  maxRuntime: null,
});

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function uniqueSortedIds(ids) {
  if (!Array.isArray(ids)) return [];
  const clean = ids.map(Number).filter(Number.isInteger);
  return [...new Set(clean)].sort((a, b) => a - b);
}

function uniqueSortedPeople(people) {
  if (!Array.isArray(people)) return [];
  const byId = new Map();
  for (const p of people) {
    if (!p || !Number.isInteger(Number(p.id))) continue;
    byId.set(Number(p.id), { id: Number(p.id), name: String(p.name ?? '') });
  }
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function normalizeFilters(filters = {}) {
  const f = { ...DEFAULT_FILTERS, ...filters };
  let yearFrom = toInt(f.yearFrom);
  let yearTo = toInt(f.yearTo);
  if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
    [yearFrom, yearTo] = [yearTo, yearFrom];
  }
  return {
    providers: uniqueSortedIds(f.providers),
    genres: uniqueSortedIds(f.genres),
    yearFrom,
    yearTo,
    cast: uniqueSortedPeople(f.cast),
    crew: uniqueSortedPeople(f.crew),
    minRating: Number(f.minRating) || 0,
    language: f.language || null,
    maxRuntime: toInt(f.maxRuntime) || null,
  };
}

export function toDiscoverParams(filters) {
  const f = normalizeFilters(filters);
  const params = {
    watch_region: 'TW',
    with_watch_providers: f.providers.join('|'),
    include_adult: 'false',
    sort_by: 'popularity.desc',
  };
  if (f.genres.length) params.with_genres = f.genres.join('|');
  if (f.yearFrom !== null) params['primary_release_date.gte'] = `${f.yearFrom}-01-01`;
  if (f.yearTo !== null) params['primary_release_date.lte'] = `${f.yearTo}-12-31`;
  if (f.cast.length) params.with_cast = f.cast.map((p) => p.id).join('|');
  if (f.crew.length) params.with_crew = f.crew.map((p) => p.id).join('|');
  if (f.minRating > 0) {
    params['vote_average.gte'] = String(f.minRating);
    params['vote_count.gte'] = '50';
  }
  if (f.language) params.with_original_language = f.language;
  if (f.maxRuntime) params['with_runtime.lte'] = String(f.maxRuntime);
  return params;
}

export function filtersKey(filters) {
  return JSON.stringify(toDiscoverParams(filters));
}
