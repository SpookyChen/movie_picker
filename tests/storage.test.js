import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/storage.js';

function memBackend(initialText = null) {
  const data = new Map();
  if (initialText !== null) data.set('moviePicker', initialText);
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
  };
}

function clock(start = Date.UTC(2026, 8, 29, 12)) {
  let t = start;
  return () => new Date((t += 1000));
}

const fightClub = { id: 550, title: '鬥陣俱樂部', poster: '/fc.jpg', year: 1999 };
const inception = { id: 27205, title: '全面啟動', poster: '/in.jpg', year: 2010 };
const forrest = { id: 13, title: '阿甘正傳', poster: null, year: 1994 };

test('新的儲存空間是空的', () => {
  const s = createStorage(memBackend());
  assert.equal(s.getApiKey(), '');
  assert.deepEqual(s.getList('watched'), []);
  assert.deepEqual(s.getList('notInterested'), []);
  assert.deepEqual(s.getList('watchlist'), []);
  assert.deepEqual(s.getPresets(), []);
  assert.equal(s.isExcluded(550), false);
});

test('加入清單後會被排除，並寫入 backend', () => {
  const backend = memBackend();
  const s = createStorage(backend, clock());
  s.addToList('watched', fightClub);
  assert.equal(s.isExcluded(550), true);
  const reloaded = createStorage(backend);
  assert.deepEqual(reloaded.getList('watched').map((m) => m.id), [550]);
  assert.equal(reloaded.isExcluded(550), true);
});

test('一部電影同時只會在一個清單', () => {
  const s = createStorage(memBackend(), clock());
  s.addToList('watchlist', fightClub);
  s.addToList('notInterested', fightClub);
  assert.deepEqual(s.getList('watchlist'), []);
  assert.deepEqual(s.getList('notInterested').map((m) => m.id), [550]);
});

test('moveToList 從待看移到已看過', () => {
  const s = createStorage(memBackend(), clock());
  s.addToList('watchlist', fightClub);
  s.moveToList('watchlist', 'watched', 550);
  assert.deepEqual(s.getList('watchlist'), []);
  const [m] = s.getList('watched');
  assert.equal(m.title, '鬥陣俱樂部');
  assert.equal(s.isExcluded(550), true);
});

test('moveToList 來源沒有這部片時不做任何事', () => {
  const s = createStorage(memBackend(), clock());
  s.moveToList('watchlist', 'watched', 550);
  assert.deepEqual(s.getList('watched'), []);
});

test('removeFromList 之後不再被排除', () => {
  const s = createStorage(memBackend(), clock());
  s.addToList('notInterested', fightClub);
  s.removeFromList('notInterested', 550);
  assert.equal(s.isExcluded(550), false);
});

test('getList 依加入時間新到舊，保留片名、海報、年份', () => {
  const s = createStorage(memBackend(), clock());
  s.addToList('watched', fightClub);
  s.addToList('watched', inception);
  const list = s.getList('watched');
  assert.deepEqual(list.map((m) => m.id), [27205, 550]);
  assert.equal(list[0].title, '全面啟動');
  assert.equal(list[0].poster, '/in.jpg');
  assert.equal(list[0].year, 2010);
  assert.match(list[0].addedAt, /^2026-09-29T/);
});

test('未知的清單名稱會丟出錯誤', () => {
  const s = createStorage(memBackend());
  assert.throws(() => s.addToList('favorites', fightClub));
});

test('setApiKey 會去掉前後空白並保存', () => {
  const backend = memBackend();
  createStorage(backend).setApiKey('  abc123 \n');
  assert.equal(createStorage(backend).getApiKey(), 'abc123');
});

test('預設組合可以新增、改名、刪除，條件會被正規化', () => {
  const backend = memBackend();
  const s = createStorage(backend, clock());
  const p = s.savePreset(' 週末爆米花 ', { genres: [878, 28], yearFrom: '2010' });
  assert.equal(p.name, '週末爆米花');
  assert.deepEqual(p.filters.genres, [28, 878]);
  assert.equal(p.filters.yearFrom, 2010);
  s.renamePreset(p.id, '動作科幻');
  assert.deepEqual(createStorage(backend).getPresets().map((x) => x.name), ['動作科幻']);
  s.deletePreset(p.id);
  assert.deepEqual(createStorage(backend).getPresets(), []);
});

test('兩個預設組合的 id 不同', () => {
  const s = createStorage(memBackend(), () => new Date(0));
  const a = s.savePreset('A', {});
  const b = s.savePreset('B', {});
  assert.notEqual(a.id, b.id);
});

test('匯出不包含 API key', () => {
  const s = createStorage(memBackend(), clock());
  s.setApiKey('secret');
  s.addToList('watched', fightClub);
  const text = s.exportJson();
  assert.equal(text.includes('secret'), false);
  const parsed = JSON.parse(text);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.lists.watched['550'].title, '鬥陣俱樂部');
});

test('匯入會合併清單，衝突時以匯入檔為準', () => {
  const a = createStorage(memBackend(), clock());
  a.addToList('watchlist', fightClub);
  a.addToList('watched', inception);
  const b = createStorage(memBackend(), clock());
  b.addToList('watched', fightClub);
  b.addToList('notInterested', forrest);

  a.importJson(b.exportJson());

  assert.deepEqual(a.getList('watchlist'), []);
  assert.deepEqual(a.getList('watched').map((m) => m.id).sort((x, y) => x - y), [550, 27205]);
  assert.deepEqual(a.getList('notInterested').map((m) => m.id), [13]);
});

test('匯入的預設組合依 id 合併', () => {
  const a = createStorage(memBackend(), clock());
  const kept = a.savePreset('原本的', {});
  const b = createStorage(memBackend(), clock());
  b.importJson(a.exportJson());
  b.renamePreset(kept.id, '改過的');
  b.savePreset('新的', {});
  a.importJson(b.exportJson());
  assert.deepEqual(a.getPresets().map((p) => p.name), ['改過的', '新的']);
});

test('匯入格式錯誤時丟出錯誤且不改變資料', () => {
  const s = createStorage(memBackend(), clock());
  s.addToList('watched', fightClub);
  assert.throws(() => s.importJson('not json'), /備份檔格式不正確/);
  assert.throws(() => s.importJson('{"version":2,"lists":{}}'), /備份檔格式不正確/);
  assert.throws(() => s.importJson('[]'), /備份檔格式不正確/);
  assert.deepEqual(s.getList('watched').map((m) => m.id), [550]);
});

test('儲存的資料損壞時從空白狀態開始', () => {
  const s = createStorage(memBackend('{broken'));
  assert.deepEqual(s.getList('watched'), []);
  assert.equal(s.getApiKey(), '');
});

test('儲存的資料欄位不完整時自動補齊', () => {
  const s = createStorage(memBackend(JSON.stringify({
    version: 1,
    lists: { watched: { 550: { title: '鬥陣俱樂部' }, abc: { title: 'x' } } },
    presets: [{ bad: true }],
  })));
  assert.deepEqual(s.getList('watched').map((m) => m.id), [550]);
  assert.deepEqual(s.getList('watchlist'), []);
  assert.deepEqual(s.getPresets(), []);
});

test('backend 無法寫入時仍可在記憶體中運作', () => {
  const s = createStorage({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } }, clock());
  s.addToList('watched', fightClub);
  assert.equal(s.isExcluded(550), true);
});

test('backend 讀取時丟錯也能啟動', () => {
  const s = createStorage({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} });
  assert.deepEqual(s.getList('watched'), []);
});

test('沒有 backend 時使用記憶體', () => {
  const s = createStorage(null, clock());
  s.addToList('watched', fightClub);
  assert.equal(s.isExcluded(550), true);
});

test('getList 回傳的是複本，修改不影響內部狀態', () => {
  const s = createStorage(memBackend(), clock());
  s.addToList('watched', fightClub);
  s.getList('watched')[0].title = '被改掉';
  assert.equal(s.getList('watched')[0].title, '鬥陣俱樂部');
});

test('setApiKey 會去掉 key 中間的換行與空白', () => {
  const s = createStorage(memBackend());
  s.setApiKey(' eyJab\ncd ef\t');
  assert.equal(s.getApiKey(), 'eyJabcdef');
});
