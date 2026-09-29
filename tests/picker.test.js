import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPicker } from '../js/picker.js';
import { DEFAULT_FILTERS } from '../js/filters.js';

function makeMovies(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `片${i + 1}` }));
}

function fakeDiscover(movies, { pageSize = 20, failOnce = [] } = {}) {
  const calls = [];
  const failing = new Set(failOnce);
  const fn = async (params, page) => {
    calls.push({ params, page });
    if (failing.has(page)) {
      failing.delete(page);
      throw new Error('network down');
    }
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

function seeded(seed = 42) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const none = () => false;

test('抽到一部符合條件的電影', async () => {
  const picker = createPicker({ discover: fakeDiscover(makeMovies(30)), isExcluded: none, random: seeded() });
  const r = await picker.pick(DEFAULT_FILTERS);
  assert.equal(r.status, 'ok');
  assert.ok(r.movie.id >= 1 && r.movie.id <= 30);
});

test('同一輪不重複，全部抽完後回報 round-exhausted，每頁只請求一次', async () => {
  const discover = fakeDiscover(makeMovies(45));
  const picker = createPicker({ discover, isExcluded: none, random: seeded() });
  const seen = new Set();
  for (let i = 0; i < 45; i++) {
    const r = await picker.pick(DEFAULT_FILTERS);
    assert.equal(r.status, 'ok');
    assert.ok(!seen.has(r.movie.id), `重複抽到 ${r.movie.id}`);
    seen.add(r.movie.id);
  }
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'round-exhausted');
  assert.deepEqual(discover.calls.map((c) => c.page).sort((a, b) => a - b), [1, 2, 3]);
});

test('就算只剩最後一部沒被排除也找得到', async () => {
  const picker = createPicker({ discover: fakeDiscover(makeMovies(100)), isExcluded: (id) => id !== 77, random: seeded(7) });
  const r = await picker.pick(DEFAULT_FILTERS);
  assert.equal(r.status, 'ok');
  assert.equal(r.movie.id, 77);
});

test('全部被排除時回報 all-excluded', async () => {
  const picker = createPicker({ discover: fakeDiscover(makeMovies(30)), isExcluded: () => true, random: seeded() });
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'all-excluded');
});

test('沒有任何結果時回報 no-results', async () => {
  const picker = createPicker({ discover: fakeDiscover([]), isExcluded: none, random: seeded() });
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'no-results');
});

test('resetRound 之後可以重新抽', async () => {
  const picker = createPicker({ discover: fakeDiscover(makeMovies(5)), isExcluded: none, random: seeded() });
  for (let i = 0; i < 5; i++) await picker.pick(DEFAULT_FILTERS);
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'round-exhausted');
  picker.resetRound();
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'ok');
});

test('排除清單即時生效：抽到就排除，最後回報 all-excluded 而非 round-exhausted', async () => {
  const excluded = new Set();
  const picker = createPicker({ discover: fakeDiscover(makeMovies(3)), isExcluded: (id) => excluded.has(id), random: seeded() });
  for (let i = 0; i < 3; i++) {
    const r = await picker.pick(DEFAULT_FILTERS);
    assert.equal(r.status, 'ok');
    excluded.add(r.movie.id);
  }
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'all-excluded');
});

test('換條件時重新查詢，同條件不同順序不重新查詢', async () => {
  const discover = fakeDiscover(makeMovies(10));
  const picker = createPicker({ discover, isExcluded: none, random: seeded() });
  const firstPageCalls = () => discover.calls.filter((c) => c.page === 1).length;

  await picker.pick({ ...DEFAULT_FILTERS, genres: [28, 878] });
  await picker.pick({ ...DEFAULT_FILTERS, genres: [878, 28] });
  assert.equal(firstPageCalls(), 1);

  await picker.pick({ ...DEFAULT_FILTERS, genres: [28] });
  assert.equal(firstPageCalls(), 2);
  assert.equal(discover.calls.at(-1).params.with_genres, '28');
});

test('換條件後本輪紀錄重新開始', async () => {
  const picker = createPicker({ discover: fakeDiscover(makeMovies(1)), isExcluded: none, random: seeded() });
  await picker.pick({ ...DEFAULT_FILTERS, genres: [28] });
  assert.equal((await picker.pick({ ...DEFAULT_FILTERS, genres: [28] })).status, 'round-exhausted');
  assert.equal((await picker.pick({ ...DEFAULT_FILTERS, genres: [35] })).status, 'ok');
});

test('某一頁抓取失敗時丟出錯誤，下一次會重抓該頁', async () => {
  const discover = fakeDiscover(makeMovies(40), { failOnce: [2] });
  const picker = createPicker({ discover, isExcluded: (id) => id <= 20, random: seeded() });
  await assert.rejects(picker.pick(DEFAULT_FILTERS), /network down/);
  const r = await picker.pick(DEFAULT_FILTERS);
  assert.equal(r.status, 'ok');
  assert.ok(r.movie.id > 20);
  assert.equal(discover.calls.filter((c) => c.page === 2).length, 2);
});

test('第一頁失敗時不會留下半套狀態', async () => {
  const picker = createPicker({ discover: fakeDiscover(makeMovies(10), { failOnce: [1] }), isExcluded: none, random: seeded() });
  await assert.rejects(picker.pick(DEFAULT_FILTERS), /network down/);
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'ok');
});

test('不同頁出現同一部片時不會在同一輪重複抽到', async () => {
  const movies = [...makeMovies(20), { id: 1, title: '片1' }];
  const picker = createPicker({ discover: fakeDiscover(movies), isExcluded: none, random: seeded() });
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push((await picker.pick(DEFAULT_FILTERS)).movie.id);
  assert.equal(new Set(ids).size, 20);
  assert.equal((await picker.pick(DEFAULT_FILTERS)).status, 'round-exhausted');
});
