import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPersonMovies, loadProviders } from '../js/search.js';

// 依 with_watch_providers 回傳不同平台的片單
function fakeDiscover(catalog, { pageSize = 20 } = {}) {
  const calls = [];
  const fn = async (params, page) => {
    calls.push({ params, page });
    const movies = catalog[params.with_watch_providers] ?? [];
    return {
      page,
      totalPages: Math.ceil(movies.length / pageSize),
      totalResults: movies.length,
      results: movies.slice((page - 1) * pageSize, page * pageSize),
    };
  };
  fn.calls = calls;
  return fn;
}

const movie = (id, popularity) => ({ id, title: `片${id}`, popularity });

test('合併各平台結果，標出每部片在哪些平台，依熱門度排序', async () => {
  const discover = fakeDiscover({
    8: [movie(1, 50), movie(2, 10)],
    337: [movie(2, 10), movie(3, 99)],
    2: [movie(1, 50)],
  });
  const result = await findPersonMovies({ discover }, 31, 'cast');
  assert.deepEqual(result.map((m) => [m.id, m.providers]), [[3, [337]], [1, [8, 2]], [2, [8, 337]]]);
});

test('演員用 with_cast、導演用 with_crew，並限定台灣', async () => {
  const discover = fakeDiscover({});
  await findPersonMovies({ discover }, 31, 'cast');
  await findPersonMovies({ discover }, 525, 'crew');
  const castCalls = discover.calls.slice(0, 3).map((c) => c.params);
  const crewCalls = discover.calls.slice(3).map((c) => c.params);
  assert.ok(castCalls.every((p) => p.with_cast === '31' && p.with_crew === undefined && p.watch_region === 'TW'));
  assert.ok(crewCalls.every((p) => p.with_crew === '525' && p.with_cast === undefined));
  assert.deepEqual(castCalls.map((p) => p.with_watch_providers).sort(), ['2', '337', '8']);
});

test('單一平台超過一頁時多抓，但最多 5 頁', async () => {
  const many = Array.from({ length: 200 }, (_, i) => movie(i + 1, 200 - i));
  const discover = fakeDiscover({ 8: many });
  const result = await findPersonMovies({ discover }, 31, 'cast');
  const netflixPages = discover.calls.filter((c) => c.params.with_watch_providers === '8').map((c) => c.page);
  assert.deepEqual(netflixPages, [1, 2, 3, 4, 5]);
  assert.equal(result.length, 100);
});

test('沒有任何上架作品時回傳空陣列', async () => {
  assert.deepEqual(await findPersonMovies({ discover: fakeDiscover({}) }, 31, 'cast'), []);
});

test('查詢失敗時丟出錯誤', async () => {
  const discover = async () => { throw new Error('network down'); };
  await assert.rejects(findPersonMovies({ discover }, 31, 'cast'), /network down/);
});

test('loadProviders 逐部回報平台，失敗的回報 null', async () => {
  const movieFn = async (id) => {
    if (id === 2) throw new Error('boom');
    return { id, providers: id === 1 ? [8] : [] };
  };
  const reported = [];
  await loadProviders({ movie: movieFn }, [{ id: 1 }, { id: 2 }, { id: 3 }], (id, providers) => reported.push([id, providers]));
  assert.deepEqual(reported.sort((a, b) => a[0] - b[0]), [[1, [8]], [2, null], [3, []]]);
});
