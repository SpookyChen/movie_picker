import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTmdb, toMovie, describeError, posterUrl, TmdbError } from '../js/tmdb.js';

function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, options });
    return responder(parsed);
  };
  fn.calls = calls;
  return fn;
}

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('discover 組出正確網址並轉換結果', async () => {
  const fetch = fakeFetch(() => json({
    page: 3,
    total_pages: 12,
    total_results: 230,
    results: [{ id: 550, title: '鬥陣俱樂部', original_title: 'Fight Club', poster_path: '/fc.jpg', release_date: '1999-10-15', vote_average: 8.4, overview: '簡介' }],
  }));
  const tmdb = createTmdb('abc123', fetch);
  const page = await tmdb.discover({ watch_region: 'TW', with_genres: '28|878' }, 3);
  const { url } = fetch.calls[0];
  assert.equal(url.origin + url.pathname, 'https://api.themoviedb.org/3/discover/movie');
  assert.equal(url.searchParams.get('api_key'), 'abc123');
  assert.equal(url.searchParams.get('language'), 'zh-TW');
  assert.equal(url.searchParams.get('watch_region'), 'TW');
  assert.equal(url.searchParams.get('with_genres'), '28|878');
  assert.equal(url.searchParams.get('page'), '3');
  assert.deepEqual(page, {
    page: 3,
    totalPages: 12,
    totalResults: 230,
    results: [{ id: 550, title: '鬥陣俱樂部', originalTitle: 'Fight Club', poster: '/fc.jpg', year: 1999, rating: 8.4, overview: '簡介' }],
  });
});

test('discover 的方法可以單獨取出呼叫', async () => {
  const { discover } = createTmdb('k', fakeFetch(() => json({ page: 1, total_pages: 1, total_results: 0, results: [] })));
  const page = await discover({}, 1);
  assert.equal(page.totalResults, 0);
});

test('總頁數超過 500 時以 500 計', async () => {
  const tmdb = createTmdb('k', fakeFetch(() => json({ page: 1, total_pages: 900, total_results: 18000, results: [] })));
  assert.equal((await tmdb.discover({}, 1)).totalPages, 500);
});

test('API key 前後空白會被去掉', async () => {
  const fetch = fakeFetch(() => json({ genres: [] }));
  await createTmdb('  abc  \n', fetch).genres();
  assert.equal(fetch.calls[0].url.searchParams.get('api_key'), 'abc');
});

test('Read Access Token 改用 Bearer header 傳送', async () => {
  const fetch = fakeFetch(() => json({ genres: [] }));
  await createTmdb('eyJhbGciOiJIUzI1NiJ9.xyz', fetch).genres();
  const { url, options } = fetch.calls[0];
  assert.equal(url.searchParams.has('api_key'), false);
  assert.equal(options.headers.authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.xyz');
});

test('401 丟出 auth 錯誤', async () => {
  const tmdb = createTmdb('bad', fakeFetch(() => json({ status_message: 'Invalid API key' }, 401)));
  await assert.rejects(tmdb.validateKey(), (e) => e instanceof TmdbError && e.kind === 'auth');
});

test('fetch 失敗丟出 network 錯誤', async () => {
  const tmdb = createTmdb('k', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(tmdb.genres(), (e) => e instanceof TmdbError && e.kind === 'network');
});

test('其他 HTTP 錯誤丟出 http 錯誤並帶狀態碼', async () => {
  const tmdb = createTmdb('k', fakeFetch(() => json({}, 503)));
  await assert.rejects(tmdb.genres(), (e) => e instanceof TmdbError && e.kind === 'http' && e.status === 503);
});

test('回應不是 JSON 時丟出 http 錯誤', async () => {
  const tmdb = createTmdb('k', async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } }));
  await assert.rejects(tmdb.genres(), (e) => e instanceof TmdbError && e.kind === 'http');
});

test('toMovie 處理缺少海報、日期、中文片名、評分', () => {
  assert.deepEqual(toMovie({ id: 1, original_title: 'Original' }), {
    id: 1, title: 'Original', originalTitle: 'Original', poster: null, year: null, rating: null, overview: '',
  });
  assert.equal(toMovie({ id: 2, release_date: '' }).year, null);
  assert.equal(toMovie({ id: 3 }).title, '（無片名）');
});

test('genres 回傳 id 與名稱', async () => {
  const fetch = fakeFetch(() => json({ genres: [{ id: 28, name: '動作' }] }));
  assert.deepEqual(await createTmdb('k', fetch).genres(), [{ id: 28, name: '動作' }]);
  assert.equal(fetch.calls[0].url.pathname, '/3/genre/movie/list');
});

test('movie 回傳片長與台灣的 Netflix / Disney+ 平台', async () => {
  const fetch = fakeFetch(() => json({
    id: 550,
    title: '鬥陣俱樂部',
    original_title: 'Fight Club',
    runtime: 139,
    'watch/providers': { results: {
      TW: { flatrate: [{ provider_id: 119 }, { provider_id: 8 }] },
      US: { flatrate: [{ provider_id: 337 }] },
    } },
  }));
  const m = await createTmdb('k', fetch).movie(550);
  assert.equal(fetch.calls[0].url.pathname, '/3/movie/550');
  assert.equal(fetch.calls[0].url.searchParams.get('append_to_response'), 'watch/providers');
  assert.equal(m.runtime, 139);
  assert.deepEqual(m.providers, [8]);
  assert.equal(m.title, '鬥陣俱樂部');
});

test('movie 沒有台灣上架資料時平台為空陣列', async () => {
  const m = await createTmdb('k', fakeFetch(() => json({ id: 1, runtime: 0 }))).movie(1);
  assert.deepEqual(m.providers, []);
  assert.equal(m.runtime, null);
});

test('searchPerson 空字串不發請求', async () => {
  const fetch = fakeFetch(() => json({ results: [] }));
  assert.deepEqual(await createTmdb('k', fetch).searchPerson('   '), []);
  assert.equal(fetch.calls.length, 0);
});

test('searchPerson 最多回傳 8 筆', async () => {
  const results = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `P${i}`, known_for_department: 'Acting' }));
  const fetch = fakeFetch(() => json({ results }));
  const people = await createTmdb('k', fetch).searchPerson('tom');
  assert.equal(people.length, 8);
  assert.deepEqual(people[0], { id: 0, name: 'P0', department: 'Acting' });
  assert.equal(fetch.calls[0].url.searchParams.get('query'), 'tom');
});

test('describeError 對應中文訊息', () => {
  assert.equal(describeError(new TmdbError('auth', 'x', 401)), 'API key 無效，請到設定頁檢查');
  assert.equal(describeError(new TmdbError('network', 'x')), '無法連線到 TMDB，請稍後再試');
  assert.equal(describeError(new TmdbError('http', 'x', 503)), 'TMDB 發生錯誤（503），請稍後再試');
  assert.equal(describeError(new Error('boom')), '發生未預期的錯誤，請稍後再試');
});

test('posterUrl', () => {
  assert.equal(posterUrl('/fc.jpg'), 'https://image.tmdb.org/t/p/w500/fc.jpg');
  assert.equal(posterUrl('/fc.jpg', 'w185'), 'https://image.tmdb.org/t/p/w185/fc.jpg');
  assert.equal(posterUrl(null), null);
});
