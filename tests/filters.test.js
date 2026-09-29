import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_FILTERS, PROVIDERS, normalizeFilters, toDiscoverParams, filtersKey } from '../js/filters.js';

test('平台常數', () => {
  assert.deepEqual(PROVIDERS, [{ id: 8, name: 'Netflix' }, { id: 337, name: 'Disney+' }]);
});

test('預設條件只帶平台與固定參數', () => {
  assert.deepEqual(toDiscoverParams(DEFAULT_FILTERS), {
    watch_region: 'TW',
    with_watch_providers: '8|337',
    include_adult: 'false',
    sort_by: 'popularity.desc',
  });
});

test('所有條件都轉成對應參數', () => {
  const params = toDiscoverParams({
    providers: [337],
    genres: [878, 28],
    yearFrom: 2010,
    yearTo: 2019,
    cast: [{ id: 31, name: 'Tom Hanks' }, { id: 5344, name: 'Meg Ryan' }],
    crew: [{ id: 525, name: 'Christopher Nolan' }],
    minRating: 7,
    language: 'ja',
    maxRuntime: 120,
  });
  assert.deepEqual(params, {
    watch_region: 'TW',
    with_watch_providers: '337',
    include_adult: 'false',
    sort_by: 'popularity.desc',
    with_genres: '28|878',
    'primary_release_date.gte': '2010-01-01',
    'primary_release_date.lte': '2019-12-31',
    with_cast: '31|5344',
    with_crew: '525',
    'vote_average.gte': '7',
    'vote_count.gte': '50',
    with_original_language: 'ja',
    'with_runtime.lte': '120',
  });
});

test('年份字串轉成數字，起始大於結束時自動對調', () => {
  const f = normalizeFilters({ yearFrom: '2020', yearTo: '2000' });
  assert.equal(f.yearFrom, 2000);
  assert.equal(f.yearTo, 2020);
});

test('空白或非數字的年份視為不限', () => {
  const f = normalizeFilters({ yearFrom: '', yearTo: 'abc' });
  assert.equal(f.yearFrom, null);
  assert.equal(f.yearTo, null);
  assert.equal(toDiscoverParams(f)['primary_release_date.gte'], undefined);
});

test('空字串的語言與片長視為不限', () => {
  const f = normalizeFilters({ language: '', maxRuntime: '' });
  assert.equal(f.language, null);
  assert.equal(f.maxRuntime, null);
});

test('非陣列或格式錯誤的欄位不會讓程式壞掉', () => {
  const f = normalizeFilters({ providers: 'x', genres: null, cast: [null, { id: 'a' }, { id: 31, name: 'Tom Hanks' }] });
  assert.deepEqual(f.providers, []);
  assert.deepEqual(f.genres, []);
  assert.deepEqual(f.cast, [{ id: 31, name: 'Tom Hanks' }]);
});

test('人物依 id 去重並排序', () => {
  const f = normalizeFilters({ cast: [{ id: 31, name: 'Tom Hanks' }, { id: 2, name: 'A' }, { id: 31, name: 'Tom Hanks' }] });
  assert.deepEqual(f.cast.map((p) => p.id), [2, 31]);
});

test('filtersKey 與陣列順序無關', () => {
  assert.equal(filtersKey({ genres: [28, 878] }), filtersKey({ genres: [878, 28] }));
});

test('filtersKey 條件不同時不同', () => {
  assert.notEqual(filtersKey({ genres: [28] }), filtersKey({ genres: [878] }));
});

test('打到一半或不合理的年份視為不限', () => {
  const f = normalizeFilters({ yearFrom: '199', yearTo: '-5' });
  assert.equal(f.yearFrom, null);
  assert.equal(f.yearTo, null);
  assert.equal(normalizeFilters({ yearFrom: '20' }).yearFrom, null);
  assert.equal(normalizeFilters({ yearFrom: '1870', yearTo: '2100' }).yearTo, 2100);
});
