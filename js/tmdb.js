import { PROVIDERS } from './filters.js';

const API_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/';
export const MAX_PAGES = 500;

export class TmdbError extends Error {
  constructor(kind, message, status) {
    super(message);
    this.name = 'TmdbError';
    this.kind = kind;
    this.status = status;
  }
}

export function posterUrl(path, size = 'w500') {
  return path ? `${IMAGE_BASE}${size}${path}` : null;
}

export function toMovie(raw) {
  const year = Number.parseInt(String(raw.release_date ?? '').slice(0, 4), 10);
  return {
    id: raw.id,
    title: raw.title || raw.original_title || '（無片名）',
    originalTitle: raw.original_title || '',
    poster: raw.poster_path || null,
    year: Number.isFinite(year) ? year : null,
    rating: typeof raw.vote_average === 'number' ? raw.vote_average : null,
    overview: raw.overview || '',
  };
}

export function describeError(err) {
  if (err instanceof TmdbError) {
    if (err.kind === 'auth') return 'API key 無效，請到設定頁檢查';
    if (err.kind === 'network') return '無法連線到 TMDB，請稍後再試';
    return `TMDB 發生錯誤（${err.status ?? '未知'}），請稍後再試`;
  }
  return '發生未預期的錯誤，請稍後再試';
}

export function createTmdb(apiKey, fetchFn = (...args) => globalThis.fetch(...args)) {
  // 合法的 key 不含空白；手機複製長 token 時常夾帶換行
  const key = String(apiKey).replace(/\s+/g, '');
  const isBearer = key.startsWith('eyJ');

  async function get(path, params = {}) {
    const url = new URL(API_BASE + path);
    if (!isBearer) url.searchParams.set('api_key', key);
    url.searchParams.set('language', 'zh-TW');
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, String(value));
    const headers = { accept: 'application/json' };
    if (isBearer) headers.authorization = `Bearer ${key}`;

    let res;
    try {
      res = await fetchFn(url.toString(), { headers });
    } catch {
      throw new TmdbError('network', '無法連線到 TMDB');
    }
    if (res.status === 401) throw new TmdbError('auth', 'API key 無效', 401);
    if (!res.ok) throw new TmdbError('http', `TMDB 回應 ${res.status}`, res.status);
    try {
      return await res.json();
    } catch {
      throw new TmdbError('http', 'TMDB 回應格式錯誤', res.status);
    }
  }

  return {
    async discover(params, page) {
      const data = await get('/discover/movie', { ...params, page });
      return {
        page: data.page,
        totalPages: Math.min(data.total_pages ?? 0, MAX_PAGES),
        totalResults: data.total_results ?? 0,
        results: (data.results ?? []).map(toMovie),
      };
    },

    async genres() {
      const data = await get('/genre/movie/list');
      return (data.genres ?? []).map((g) => ({ id: g.id, name: g.name }));
    },

    async searchPerson(query) {
      const q = String(query).trim();
      if (!q) return [];
      const data = await get('/search/person', { query: q, include_adult: 'false' });
      return (data.results ?? []).slice(0, 8).map((p) => ({
        id: p.id,
        name: p.name,
        department: p.known_for_department || '',
      }));
    },

    async movie(id) {
      const data = await get(`/movie/${id}`, { append_to_response: 'watch/providers' });
      const flatrate = data['watch/providers']?.results?.TW?.flatrate ?? [];
      const available = new Set(flatrate.map((p) => p.provider_id));
      return {
        ...toMovie(data),
        runtime: data.runtime || null,
        providers: PROVIDERS.filter((p) => available.has(p.id)).map((p) => p.id),
      };
    },

    async validateKey() {
      await get('/configuration');
      return true;
    },
  };
}
