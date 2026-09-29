# Movie Picker 實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手機優先的純前端網頁，從台灣 Netflix / Disney+ 上架電影中依條件隨機抽片，並維護「已看過／沒興趣／待看」清單排除已處理的電影。

**Architecture:** 原生 HTML + ES modules，無建置流程。純邏輯模組（`filters.js`、`storage.js`、`picker.js`）與唯一碰網路的 `tmdb.js` 可在 Node 下單獨測試；`js/ui/*` 各負責一個分頁，透過 `app.js` 傳入的 `ctx` 取得 storage、tmdb、toast、分頁切換。

**Tech Stack:** HTML / CSS / JavaScript（ES2022 modules）、TMDB API v3、localStorage、Node 25 內建 `node:test`（僅測試用，無 npm 相依套件）、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-09-29-movie-picker-design.md`

## Global Constraints

- 只處理電影；`watch_region=TW`；平台 Netflix = `8`、Disney+ = `337`
- 所有 TMDB 請求帶 `language=zh-TW`
- 不得有 npm 相依套件；`package.json` 只用來宣告 `"type": "module"` 與 scripts
- API key 不得寫入原始碼；只存 localStorage，匯出備份不得包含 API key
- localStorage key：`moviePicker`；資料 `version: 1`
- discover 頁數上限 500
- 最低評分 > 0 時一併帶 `vote_count.gte=50`
- 類型、演員、導演多選皆為「任一符合」（以 `|` 串接）
- 以 TMDB API 回傳的資料建立 DOM 時一律用 `textContent` / `el()` 輔助函式，不得用 `innerHTML`
- UI 文字使用繁體中文；App 顯示名稱「今晚看什麼」
- Git commit 訊息使用繁體中文，結尾加 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 所有指令在 `movie_picker/` 目錄下執行（它是獨立 git repo，分支 `main`）

## Review Focus

- 使用者貼上的 API key 前後帶空白，或貼的是 v4 Read Access Token（`eyJ…`）而非 v3 key → 都要能用（Task 2 storage 測試、Task 3 tmdb 測試）
- 抽片途中某一頁網路失敗 → 顯示錯誤訊息；下一次抽片會重抓該頁，已抽過的紀錄不壞（Task 4 picker 測試）
- 年代起始年大於結束年、或輸入空白／非數字 → 自動對調／視為不限，而不是查不到任何片（Task 1 filters 測試）
- 電影缺海報、缺上映日期、沒有中文簡介 → 顯示佔位圖、「年份不明」、「（沒有中文簡介）」，不當掉（Task 3 `toMovie` 測試 + Task 6 UI）
- localStorage 不可用（私密瀏覽）或內容被改壞 → App 仍可在記憶體運作／從空白狀態開始，而不是白畫面（Task 2 storage 測試）

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `package.json` | `"type": "module"`、`test`／`smoke` scripts |
| `.gitignore` | 忽略 `.DS_Store` |
| `js/filters.js` | 條件正規化、轉 discover 參數、條件 key、平台常數 |
| `js/storage.js` | localStorage 狀態：清單、預設組合、API key、匯出/匯入 |
| `js/tmdb.js` | TMDB API 封裝、`toMovie`、`posterUrl`、錯誤類別與中文訊息 |
| `js/picker.js` | 隨機抽片演算法 |
| `js/app.js` | 進入點：建立 storage、ctx、分頁切換、toast |
| `js/ui/dom.js` | `el()` DOM 建構、`poster()`、`movieRow()` |
| `js/ui/settings.js` | 設定頁 |
| `js/ui/watchlist.js` | 待看頁 |
| `js/ui/lists.js` | 已看過／沒興趣頁 |
| `js/ui/pick.js` | 抽片頁 |
| `index.html`、`css/style.css`、`manifest.json`、`icon.svg` | 頁面外殼、樣式、PWA |
| `tests/*.test.js` | 純邏輯模組測試 |
| `scripts/smoke.mjs` | 用真實 TMDB key 的端對端冒煙測試 |
| `README.md` | 使用、開發、部署說明 |

---

### Task 1: 專案骨架與 filters.js

**Files:**
- Create: `package.json`、`.gitignore`、`js/filters.js`
- Test: `tests/filters.test.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - `PROVIDERS: Array<{id:number, name:string}>` = `[{id:8,name:'Netflix'},{id:337,name:'Disney+'}]`
  - `DEFAULT_FILTERS`（frozen）：`{providers:[8,337], genres:[], yearFrom:null, yearTo:null, cast:[], crew:[], minRating:0, language:null, maxRuntime:null}`
  - `normalizeFilters(filters?) → Filters`：補預設值、去重排序、年份轉整數並對調、`cast`/`crew` 為 `{id:number,name:string}[]`
  - `toDiscoverParams(filters) → Record<string,string>`（不含 `page`、`api_key`、`language`）
  - `filtersKey(filters) → string`

- [ ] **Step 1: 建立 package.json 與 .gitignore**

`package.json`：
```json
{
  "name": "movie-picker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/**/*.test.js\"",
    "smoke": "node scripts/smoke.mjs"
  }
}
```

`.gitignore`：
```
.DS_Store
```

- [ ] **Step 2: 寫失敗的測試 `tests/filters.test.js`**

```js
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
```

- [ ] **Step 3: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，錯誤為找不到模組 `js/filters.js`

- [ ] **Step 4: 實作 `js/filters.js`**

```js
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
```

- [ ] **Step 5: 執行測試確認通過**

Run: `npm test`
Expected: PASS（10 個測試）

- [ ] **Step 6: Commit**

```bash
git add package.json .gitignore js/filters.js tests/filters.test.js
git commit -m "新增專案骨架與篩選條件轉換模組

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: storage.js

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Consumes: `normalizeFilters` from `js/filters.js`
- Produces:
  - `LIST_NAMES = ['watched', 'notInterested', 'watchlist']`
  - `createStorage(backend: {getItem, setItem} | null | undefined, now = () => new Date())` 回傳：
    - `getApiKey() → string`、`setApiKey(key)`（去除前後空白）
    - `addToList(name, movie:{id,title,poster,year})`：加入並從其他清單移除，記錄 `addedAt`（ISO 字串）
    - `removeFromList(name, id)`、`moveToList(from, to, id)`
    - `getList(name) → Array<{id,title,poster,year,addedAt}>`（新到舊）
    - `isExcluded(id) → boolean`
    - `getPresets() → Array<{id,name,filters}>`、`savePreset(name, filters) → preset`、`renamePreset(id, name)`、`deletePreset(id)`
    - `exportJson() → string`（不含 `apiKey`）、`importJson(text)`（格式錯誤丟出 `Error('備份檔格式不正確')`）

- [ ] **Step 1: 寫失敗的測試 `tests/storage.test.js`**

```js
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，找不到模組 `js/storage.js`（filters 測試仍 PASS）

- [ ] **Step 3: 實作 `js/storage.js`**

```js
import { normalizeFilters } from './filters.js';

const STORAGE_KEY = 'moviePicker';
export const LIST_NAMES = ['watched', 'notInterested', 'watchlist'];

function emptyState() {
  return {
    version: 1,
    apiKey: '',
    lists: { watched: {}, notInterested: {}, watchlist: {} },
    presets: [],
  };
}

function memoryBackend() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeMovie(id, movie) {
  const numId = Number(id);
  if (!Number.isInteger(numId) || !isPlainObject(movie)) return null;
  return {
    id: numId,
    title: typeof movie.title === 'string' ? movie.title : '',
    poster: typeof movie.poster === 'string' ? movie.poster : null,
    year: Number.isInteger(movie.year) ? movie.year : null,
    addedAt: typeof movie.addedAt === 'string' ? movie.addedAt : '',
  };
}

function sanitizePreset(preset) {
  if (!isPlainObject(preset) || typeof preset.id !== 'string' || typeof preset.name !== 'string' || !isPlainObject(preset.filters)) {
    return null;
  }
  return { id: preset.id, name: preset.name, filters: normalizeFilters(preset.filters) };
}

function sanitizeState(raw) {
  const state = emptyState();
  if (!isPlainObject(raw)) return state;
  if (typeof raw.apiKey === 'string') state.apiKey = raw.apiKey;
  const lists = isPlainObject(raw.lists) ? raw.lists : {};
  for (const name of LIST_NAMES) {
    if (!isPlainObject(lists[name])) continue;
    for (const [id, movie] of Object.entries(lists[name])) {
      const clean = sanitizeMovie(id, movie);
      if (clean) state.lists[name][clean.id] = clean;
    }
  }
  if (Array.isArray(raw.presets)) state.presets = raw.presets.map(sanitizePreset).filter(Boolean);
  return state;
}

export function createStorage(backend, now = () => new Date()) {
  const store = backend ?? memoryBackend();
  let state;
  try {
    const text = store.getItem(STORAGE_KEY);
    state = sanitizeState(text ? JSON.parse(text) : null);
  } catch {
    state = emptyState();
  }

  function save() {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 無法寫入（私密瀏覽、容量已滿）時只保留在記憶體
    }
  }

  function assertList(name) {
    if (!LIST_NAMES.includes(name)) throw new Error(`未知的清單：${name}`);
  }

  function removeEverywhere(id) {
    for (const name of LIST_NAMES) delete state.lists[name][id];
  }

  function addToList(name, movie) {
    assertList(name);
    const clean = sanitizeMovie(movie.id, { ...movie, addedAt: now().toISOString() });
    if (!clean) throw new Error('電影資料不正確');
    removeEverywhere(clean.id);
    state.lists[name][clean.id] = clean;
    save();
  }

  let presetSeq = 0;

  return {
    getApiKey: () => state.apiKey,

    setApiKey(key) {
      state.apiKey = String(key).trim();
      save();
    },

    addToList,

    removeFromList(name, id) {
      assertList(name);
      delete state.lists[name][id];
      save();
    },

    moveToList(from, to, id) {
      assertList(from);
      assertList(to);
      const movie = state.lists[from][id];
      if (movie) addToList(to, movie);
    },

    getList(name) {
      assertList(name);
      return Object.values(state.lists[name])
        .map((m) => ({ ...m }))
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },

    isExcluded: (id) => LIST_NAMES.some((name) => id in state.lists[name]),

    getPresets: () => structuredClone(state.presets),

    savePreset(name, filters) {
      presetSeq += 1;
      const preset = {
        id: `p_${now().getTime().toString(36)}_${presetSeq}_${Math.random().toString(36).slice(2, 6)}`,
        name: String(name).trim(),
        filters: normalizeFilters(filters),
      };
      state.presets.push(preset);
      save();
      return structuredClone(preset);
    },

    renamePreset(id, name) {
      const preset = state.presets.find((p) => p.id === id);
      if (!preset) return;
      preset.name = String(name).trim();
      save();
    },

    deletePreset(id) {
      state.presets = state.presets.filter((p) => p.id !== id);
      save();
    },

    exportJson() {
      const { apiKey, ...rest } = state;
      return JSON.stringify(rest, null, 2);
    },

    importJson(text) {
      let raw;
      try {
        raw = JSON.parse(text);
      } catch {
        throw new Error('備份檔格式不正確');
      }
      if (!isPlainObject(raw) || raw.version !== 1 || !isPlainObject(raw.lists)) {
        throw new Error('備份檔格式不正確');
      }
      const incoming = sanitizeState(raw);
      for (const name of LIST_NAMES) {
        for (const movie of Object.values(incoming.lists[name])) {
          removeEverywhere(movie.id);
          state.lists[name][movie.id] = movie;
        }
      }
      for (const preset of incoming.presets) {
        const index = state.presets.findIndex((p) => p.id === preset.id);
        if (index >= 0) state.presets[index] = preset;
        else state.presets.push(preset);
      }
      save();
    },
  };
}
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS（filters 10 個 + storage 21 個）

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/storage.test.js
git commit -m "新增清單、預設組合與備份的儲存模組

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: tmdb.js

**Files:**
- Create: `js/tmdb.js`
- Test: `tests/tmdb.test.js`

**Interfaces:**
- Consumes: `PROVIDERS` from `js/filters.js`
- Produces:
  - `MAX_PAGES = 500`
  - `class TmdbError extends Error { kind: 'auth'|'network'|'http'; status?: number }`
  - `posterUrl(path: string|null, size = 'w500') → string|null`
  - `toMovie(raw) → Movie`，`Movie = {id, title, originalTitle, poster: string|null, year: number|null, rating: number|null, overview: string}`
  - `describeError(err) → string`（中文訊息）
  - `createTmdb(apiKey, fetchFn?)` 回傳（方法不依賴 `this`，可單獨取出傳遞）：
    - `discover(params, page) → Promise<{page, totalPages, totalResults, results: Movie[]}>`（`totalPages` 已套用 500 上限）
    - `genres() → Promise<Array<{id, name}>>`
    - `searchPerson(query) → Promise<Array<{id, name, department}>>`（最多 8 筆；空字串回傳 `[]` 且不發請求）
    - `movie(id) → Promise<Movie & {runtime: number|null, providers: number[]}>`
    - `validateKey() → Promise<true>`

- [ ] **Step 1: 寫失敗的測試 `tests/tmdb.test.js`**

```js
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，找不到模組 `js/tmdb.js`

- [ ] **Step 3: 實作 `js/tmdb.js`**

```js
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
  const key = String(apiKey).trim();
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS（filters + storage + tmdb 17 個）

- [ ] **Step 5: Commit**

```bash
git add js/tmdb.js tests/tmdb.test.js
git commit -m "新增 TMDB API 封裝模組

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: picker.js

**Files:**
- Create: `js/picker.js`
- Test: `tests/picker.test.js`

**Interfaces:**
- Consumes: `filtersKey`、`toDiscoverParams` from `js/filters.js`；`discover(params, page)` 形狀同 Task 3（回傳 `{page, totalPages, totalResults, results}`）
- Produces:
  - `createPicker({ discover, isExcluded, random = Math.random })` 回傳：
    - `pick(filters) → Promise<{status:'ok', movie} | {status:'no-results'} | {status:'all-excluded'} | {status:'round-exhausted'}>`；網路錯誤會原樣丟出（`TmdbError`）
    - `resetRound()`

- [ ] **Step 1: 寫失敗的測試 `tests/picker.test.js`**

```js
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
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm test`
Expected: FAIL，找不到模組 `js/picker.js`

- [ ] **Step 3: 實作 `js/picker.js`**

```js
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
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm test`
Expected: PASS（全部 4 個測試檔）

- [ ] **Step 5: Commit**

```bash
git add js/picker.js tests/picker.test.js
git commit -m "新增隨機抽片演算法

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 頁面外殼、設定頁、待看頁、清單頁

**Files:**
- Create: `index.html`、`css/style.css`、`manifest.json`、`icon.svg`、`js/app.js`、`js/ui/dom.js`、`js/ui/settings.js`、`js/ui/watchlist.js`、`js/ui/lists.js`、`js/ui/pick.js`（本 task 只放暫時內容，Task 6 取代）

**Interfaces:**
- Consumes: `createStorage`（Task 2）、`createTmdb`、`describeError`、`posterUrl`（Task 3）
- Produces:
  - 每個 `js/ui/*.js` 分頁模組匯出 `mount(element, ctx)` 與 `onShow()`
  - `ctx = { storage, tmdb(): TmdbClient|null, toast(message), goTo(tabName) }`，`tabName ∈ 'pick'|'watchlist'|'lists'|'settings'`；`ctx.tmdb()` 在 key 不變時回傳同一個實例
  - `js/ui/dom.js`：`el(tag, attrs, ...children)`、`poster(path, size='w500', cls='poster')`、`movieRow(movie, actions: Array<{label, onClick, class?}>)`

- [ ] **Step 1: 建立 `index.html`**

```html
<!doctype html>
<html lang="zh-Hant-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#121212">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="今晚看什麼">
  <title>今晚看什麼</title>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/style.css">
  <script type="module" src="js/app.js"></script>
</head>
<body>
  <main>
    <section id="tab-pick" hidden></section>
    <section id="tab-watchlist" hidden></section>
    <section id="tab-lists" hidden></section>
    <section id="tab-settings" hidden></section>
  </main>
  <nav class="tabbar">
    <button data-tab="pick">🎲<span>抽片</span></button>
    <button data-tab="watchlist">🍿<span>待看</span></button>
    <button data-tab="lists">📋<span>清單</span></button>
    <button data-tab="settings">⚙️<span>設定</span></button>
  </nav>
  <div id="toast" role="status" aria-live="polite"></div>
</body>
</html>
```

- [ ] **Step 2: 建立 `manifest.json` 與 `icon.svg`**

`manifest.json`：
```json
{
  "name": "今晚看什麼",
  "short_name": "看什麼",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#121212",
  "theme_color": "#121212",
  "lang": "zh-Hant-TW",
  "icons": [{ "src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any" }]
}
```

`icon.svg`：
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#e50914"/><path d="M200 150 L370 256 L200 362 Z" fill="#fff"/></svg>
```

- [ ] **Step 3: 建立 `css/style.css`**

```css
:root {
  --bg: #121212;
  --surface: #1e1e1e;
  --surface-2: #2a2a2a;
  --border: #3a3a3a;
  --text: #f2f2f2;
  --muted: #a0a0a0;
  --accent: #e50914;
  --accent-text: #fff;
  --danger: #ff6b6b;
  --radius: 12px;
  color-scheme: dark;
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

html, body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", "Noto Sans TC", sans-serif;
  font-size: 16px;
  line-height: 1.5;
}

main {
  max-width: 640px;
  margin: 0 auto;
  padding: 16px 16px calc(88px + env(safe-area-inset-bottom));
}

h1 { font-size: 1.5rem; margin: 8px 0 16px; }
h2 { font-size: 1.15rem; margin: 0 0 8px; }
a { color: #6cb4ff; }
.muted { color: var(--muted); font-size: 0.9rem; }
.empty { color: var(--muted); text-align: center; padding: 48px 0; }

.card { background: var(--surface); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
summary { font-weight: 600; cursor: pointer; margin-bottom: 12px; }

button {
  font: inherit;
  color: var(--text);
  background: var(--surface-2);
  border: 0;
  border-radius: 999px;
  padding: 8px 16px;
  min-height: 40px;
  cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: default; }
button.primary { background: var(--accent); color: var(--accent-text); }
button.danger { color: var(--danger); }
button.big { width: 100%; font-size: 1.2rem; min-height: 56px; margin-bottom: 16px; }

input, select {
  font: inherit;
  color: var(--text);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  min-height: 40px;
}
input[type="text"], input[type="search"] { width: 100%; }
input[type="number"] { width: 6.5em; }
input[type="range"] { width: 100%; accent-color: var(--accent); padding: 0; }
.card > input { margin-bottom: 12px; }

.field { margin-bottom: 16px; }
.field-label { font-weight: 600; margin-bottom: 6px; }
.row { display: flex; align-items: center; gap: 8px; }
.button-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 12px; min-height: 36px; font-size: 0.95rem; }
.chip.active { background: var(--accent); color: var(--accent-text); }
span.chip { display: inline-block; background: var(--surface-2); border-radius: 999px; min-height: 0; }

.preset-bar { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 8px; }
.preset-bar .chip { flex: none; }

.suggestions { list-style: none; padding: 0; margin: 4px 0 0; }
.suggestions li { padding: 2px 0; }
.suggestions button { width: 100%; text-align: left; border-radius: 8px; }

.movie-card .poster {
  display: block;
  width: 100%;
  max-width: 360px;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  margin: 0 auto 16px;
  border-radius: 8px;
}
.movie-card .chips { margin: 8px 0; }
.poster-empty { display: flex; align-items: center; justify-content: center; background: var(--surface-2); font-size: 3rem; }
.overview { white-space: pre-line; }
.actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 16px; }
.message p { margin: 0 0 12px; }

.movie-list { list-style: none; padding: 0; margin: 0; }
.movie-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--surface-2); }
.thumb { width: 56px; height: 84px; border-radius: 6px; object-fit: cover; flex: none; }
.thumb.poster-empty { font-size: 1.5rem; }
.movie-row-info { flex: 1; min-width: 0; }
.movie-row-title { font-weight: 600; overflow-wrap: anywhere; }
.movie-row-actions { display: flex; flex-direction: column; gap: 6px; }

.segmented { display: flex; gap: 8px; margin-bottom: 16px; }
.segmented button.active { background: var(--accent); color: var(--accent-text); }

.plain-list { list-style: none; padding: 0; margin: 0; }
.preset-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.preset-row span { flex: 1; overflow-wrap: anywhere; }

.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  background: var(--surface);
  border-top: 1px solid var(--surface-2);
  padding-bottom: env(safe-area-inset-bottom);
}
.tabbar button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: none;
  border-radius: 0;
  padding: 8px 0;
  min-height: 56px;
  font-size: 1.2rem;
  color: var(--muted);
}
.tabbar button span { font-size: 0.75rem; }
.tabbar button.active { color: var(--text); }

#toast {
  position: fixed;
  left: 50%;
  bottom: calc(80px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  background: #333;
  color: #fff;
  padding: 10px 18px;
  border-radius: 999px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}
#toast.show { opacity: 1; }
```

- [ ] **Step 4: 建立 `js/ui/dom.js`**

```js
import { posterUrl } from '../tmdb.js';

// 建立 DOM 元素；文字一律以 text node 加入，不使用 innerHTML
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  node.append(
    ...children
      .flat(Infinity)
      .filter((c) => c != null && c !== false)
      .map((c) => (c instanceof Node ? c : String(c))),
  );
  // 子元素先加入，select 的 value 才設得上去
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'value' || typeof value === 'boolean') node[key] = value;
    else node.setAttribute(key, value);
  }
  return node;
}

export function poster(path, size = 'w500', cls = 'poster') {
  const url = posterUrl(path, size);
  return url
    ? el('img', { class: cls, src: url, alt: '', loading: 'lazy' })
    : el('div', { class: `${cls} poster-empty` }, '🎬');
}

export function movieRow(movie, actions) {
  return el('li', { class: 'movie-row' },
    poster(movie.poster, 'w185', 'thumb'),
    el('div', { class: 'movie-row-info' },
      el('div', { class: 'movie-row-title' }, movie.title),
      el('div', { class: 'muted' }, movie.year ?? '年份不明')),
    el('div', { class: 'movie-row-actions' },
      actions.map((a) => el('button', { class: a.class ?? '', onclick: a.onClick }, a.label))));
}
```

- [ ] **Step 5: 建立 `js/app.js`**

```js
import { createStorage } from './storage.js';
import { createTmdb } from './tmdb.js';
import * as pickTab from './ui/pick.js';
import * as watchlistTab from './ui/watchlist.js';
import * as listsTab from './ui/lists.js';
import * as settingsTab from './ui/settings.js';

// 私密瀏覽等情況下存取 localStorage 可能直接丟錯
function localStorageOrNull() {
  try {
    const store = window.localStorage;
    store.getItem('__probe__');
    return store;
  } catch {
    return null;
  }
}

const storage = createStorage(localStorageOrNull());
const tabs = { pick: pickTab, watchlist: watchlistTab, lists: listsTab, settings: settingsTab };
let tmdb = null;
let tmdbKey = null;
let toastTimer;

const ctx = {
  storage,

  tmdb() {
    const key = storage.getApiKey();
    if (!key) return null;
    if (key !== tmdbKey) {
      tmdb = createTmdb(key);
      tmdbKey = key;
    }
    return tmdb;
  },

  toast(message) {
    const box = document.getElementById('toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('show'), 2000);
  },

  goTo(name) {
    for (const tab of Object.keys(tabs)) {
      document.getElementById(`tab-${tab}`).hidden = tab !== name;
    }
    for (const button of document.querySelectorAll('.tabbar button')) {
      button.classList.toggle('active', button.dataset.tab === name);
    }
    tabs[name].onShow();
    window.scrollTo(0, 0);
  },
};

for (const [name, tab] of Object.entries(tabs)) {
  tab.mount(document.getElementById(`tab-${name}`), ctx);
}
for (const button of document.querySelectorAll('.tabbar button')) {
  button.addEventListener('click', () => ctx.goTo(button.dataset.tab));
}
ctx.goTo(storage.getApiKey() ? 'pick' : 'settings');
```

- [ ] **Step 6: 建立 `js/ui/settings.js`**

```js
import { el } from './dom.js';
import { createTmdb, describeError } from '../tmdb.js';

let root;
let ctx;

export function mount(element, context) {
  root = element;
  ctx = context;
}

export function onShow() {
  render();
}

function render() {
  root.replaceChildren(
    el('h1', {}, '設定'),
    apiKeySection(),
    presetSection(),
    backupSection(),
    el('p', { class: 'muted' }, 'This product uses the TMDB API but is not endorsed or certified by TMDB.'),
  );
}

function apiKeySection() {
  const input = el('input', {
    type: 'text',
    value: ctx.storage.getApiKey(),
    placeholder: '貼上 TMDB API key',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
  });
  const status = el('p', { class: 'muted' });
  const saveButton = el('button', {
    class: 'primary',
    onclick: async () => {
      const key = input.value.trim();
      if (!key) {
        status.textContent = '請輸入 API key';
        return;
      }
      saveButton.disabled = true;
      status.textContent = '驗證中…';
      try {
        await createTmdb(key).validateKey();
        ctx.storage.setApiKey(key);
        ctx.toast('API key 已儲存');
        ctx.goTo('pick');
      } catch (err) {
        status.textContent = describeError(err);
      } finally {
        saveButton.disabled = false;
      }
    },
  }, '驗證並儲存');

  return el('section', { class: 'card' },
    el('h2', {}, 'TMDB API key'),
    el('p', { class: 'muted' },
      '到 ',
      el('a', { href: 'https://www.themoviedb.org/settings/api', target: '_blank', rel: 'noopener' }, 'TMDB 的 API 設定頁'),
      ' 註冊並申請（免費），複製「API Key」或「API Read Access Token」貼到下面。key 只會存在這個瀏覽器。'),
    input,
    saveButton,
    status);
}

function presetSection() {
  const presets = ctx.storage.getPresets();
  const body = presets.length
    ? el('ul', { class: 'plain-list' }, presets.map((p) => el('li', { class: 'preset-row' },
        el('span', {}, p.name),
        el('button', {
          onclick: () => {
            const name = prompt('新的名稱', p.name);
            if (name && name.trim()) {
              ctx.storage.renamePreset(p.id, name);
              render();
            }
          },
        }, '改名'),
        el('button', {
          class: 'danger',
          onclick: () => {
            if (confirm(`刪除「${p.name}」？`)) {
              ctx.storage.deletePreset(p.id);
              render();
            }
          },
        }, '刪除'))))
    : el('p', { class: 'muted' }, '還沒有預設組合，可以在抽片頁把條件存起來。');
  return el('section', { class: 'card' }, el('h2', {}, '預設組合'), body);
}

function backupSection() {
  const status = el('p', { class: 'muted' });
  const fileInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        ctx.storage.importJson(await file.text());
        ctx.toast('匯入完成');
        render();
      } catch (err) {
        status.textContent = err.message;
      } finally {
        fileInput.value = '';
      }
    },
  });

  return el('section', { class: 'card' },
    el('h2', {}, '備份'),
    el('p', { class: 'muted' }, '清單只存在這個瀏覽器，建議定期匯出備份。匯出檔不含 API key。'),
    el('div', { class: 'button-row' },
      el('button', { onclick: exportBackup }, '匯出 JSON'),
      el('button', { onclick: () => fileInput.click() }, '匯入 JSON')),
    fileInput,
    status);
}

function exportBackup() {
  const blob = new Blob([ctx.storage.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const link = el('a', { href: url, download: `movie-picker-backup-${stamp}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

- [ ] **Step 7: 建立 `js/ui/watchlist.js`**

```js
import { el, movieRow } from './dom.js';

let root;
let ctx;

export function mount(element, context) {
  root = element;
  ctx = context;
}

export function onShow() {
  render();
}

function render() {
  const items = ctx.storage.getList('watchlist');
  root.replaceChildren(
    el('h1', {}, '待看'),
    items.length
      ? el('ul', { class: 'movie-list' }, items.map((m) => movieRow(m, [
          {
            label: '看完了',
            class: 'primary',
            onClick: () => {
              ctx.storage.moveToList('watchlist', 'watched', m.id);
              ctx.toast(`「${m.title}」已移到已看過`);
              render();
            },
          },
          {
            label: '移除',
            onClick: () => {
              ctx.storage.removeFromList('watchlist', m.id);
              render();
            },
          },
        ])))
      : el('p', { class: 'empty' }, '還沒有待看的片，去抽一部吧！'),
  );
}
```

- [ ] **Step 8: 建立 `js/ui/lists.js`**

```js
import { el, movieRow } from './dom.js';

const LABELS = { watched: '已看過', notInterested: '沒興趣' };

let root;
let ctx;
let current = 'watched';

export function mount(element, context) {
  root = element;
  ctx = context;
}

export function onShow() {
  render();
}

function render() {
  const items = ctx.storage.getList(current);
  root.replaceChildren(
    el('h1', {}, '清單'),
    el('div', { class: 'segmented' }, Object.entries(LABELS).map(([name, label]) =>
      el('button', {
        class: name === current ? 'active' : '',
        onclick: () => {
          current = name;
          render();
        },
      }, `${label}（${ctx.storage.getList(name).length}）`))),
    items.length
      ? el('ul', { class: 'movie-list' }, items.map((m) => movieRow(m, [{
          label: '移除',
          onClick: () => {
            ctx.storage.removeFromList(current, m.id);
            render();
          },
        }])))
      : el('p', { class: 'empty' }, `「${LABELS[current]}」清單是空的`),
  );
}
```

- [ ] **Step 9: 建立暫時的 `js/ui/pick.js`（Task 6 會整個取代）**

```js
import { el } from './dom.js';

export function mount(element) {
  element.replaceChildren(el('p', { class: 'empty' }, '抽片頁將在下一個步驟完成'));
}

export function onShow() {}
```

- [ ] **Step 10: 語法檢查與單元測試**

Run: `for f in js/*.js js/ui/*.js; do node --check "$f" || exit 1; done && npm test`
Expected: 沒有語法錯誤輸出；測試全部 PASS

- [ ] **Step 11: 啟動本機伺服器確認檔案都能載入**

Run（背景執行）: `python3 -m http.server 8000`
然後 Run: `for p in / css/style.css manifest.json icon.svg js/app.js js/ui/dom.js js/ui/settings.js js/ui/watchlist.js js/ui/lists.js js/ui/pick.js js/storage.js js/tmdb.js js/filters.js; do printf "%s %s\n" "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/$p)" "$p"; done`
Expected: 每一行都是 `200`

- [ ] **Step 12: 在瀏覽器中檢查（手機寬度，例如 DevTools 390×844）**

打開 `http://localhost:8000`，確認：
1. 沒有 API key 時直接顯示「設定」頁，底部導覽列「設定」高亮
2. 輸入 `abc` 按「驗證並儲存」→ 顯示「API key 無效，請到設定頁檢查」
3. 輸入有效 key（向使用者索取，或跳過此項並在回報中註明）→ 顯示 toast「API key 已儲存」並跳到抽片頁
4. 「待看」「清單」頁顯示空狀態文字；清單頁可切換「已看過（0）」「沒興趣（0）」
5. 「匯出 JSON」會下載檔案，內容不含 apiKey；匯入一個隨便的文字檔 → 顯示「備份檔格式不正確」
6. DevTools Console 沒有錯誤

- [ ] **Step 13: Commit**

```bash
git add index.html manifest.json icon.svg css/style.css js/app.js js/ui
git commit -m "新增頁面外殼、設定頁、待看頁與清單頁

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 抽片頁

**Files:**
- Modify: `js/ui/pick.js`（整個取代 Task 5 的暫時內容）

**Interfaces:**
- Consumes: `el`、`poster`（dom.js）；`describeError`（tmdb.js）；`PROVIDERS`、`DEFAULT_FILTERS`、`normalizeFilters`、`filtersKey`（filters.js）；`createPicker`（picker.js）；`ctx`（Task 5）
- Produces: `mount(element, ctx)`、`onShow()`

- [ ] **Step 1: 以下列內容取代 `js/ui/pick.js`**

```js
import { el, poster } from './dom.js';
import { describeError } from '../tmdb.js';
import { PROVIDERS, DEFAULT_FILTERS, normalizeFilters, filtersKey } from '../filters.js';
import { createPicker } from '../picker.js';

const LANGUAGES = [
  ['', '不限'], ['en', '英語'], ['zh', '華語'], ['ja', '日語'], ['ko', '韓語'],
  ['fr', '法語'], ['es', '西班牙語'], ['de', '德語'], ['th', '泰語'],
];
const RUNTIMES = [['', '不限'], ['90', '90 分鐘'], ['120', '120 分鐘'], ['150', '150 分鐘'], ['180', '180 分鐘']];
const DEPARTMENTS = { Acting: '演員', Directing: '導演', Writing: '編劇', Production: '製作' };

let root;
let ctx;
let filters = normalizeFilters(DEFAULT_FILTERS);
let genres = null;
let genresError = null;
let picker = null;
let pickerTmdb = null;
let current = null;
let busy = false;
const els = {};

export function mount(element, context) {
  root = element;
  ctx = context;
  els.presets = el('div', { class: 'preset-bar' });
  els.form = el('div', { class: 'filters' });
  els.drawButton = el('button', { class: 'primary big', onclick: () => draw() }, '🎲 抽一部');
  els.result = el('div', { class: 'result' });
  root.replaceChildren(
    el('h1', {}, '今晚看什麼？'),
    els.presets,
    el('details', { class: 'card', open: true },
      el('summary', {}, '篩選條件'),
      els.form,
      el('button', { onclick: savePreset }, '💾 存成預設組合')),
    els.drawButton,
    els.result,
  );
}

export function onShow() {
  renderPresets();
  renderForm();
  loadGenres();
}

// ---------- 條件 ----------

function setFilter(patch) {
  filters = normalizeFilters({ ...filters, ...patch });
  renderPresets();
}

function toggleIn(key, id) {
  const set = new Set(filters[key]);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  setFilter({ [key]: [...set] });
  renderForm();
}

async function loadGenres() {
  if (genres) return;
  const tmdb = ctx.tmdb();
  if (!tmdb) {
    genresError = '請先到設定頁輸入 API key';
    renderForm();
    return;
  }
  try {
    genres = await tmdb.genres();
    genresError = null;
  } catch (err) {
    genresError = describeError(err);
  }
  renderForm();
}

function renderPresets() {
  const presets = ctx.storage.getPresets();
  const activeKey = filtersKey(filters);
  els.presets.replaceChildren(...presets.map((p) =>
    el('button', { class: filtersKey(p.filters) === activeKey ? 'chip active' : 'chip', onclick: () => applyPreset(p) }, p.name)));
  els.presets.hidden = presets.length === 0;
}

function applyPreset(preset) {
  filters = normalizeFilters(preset.filters);
  current = null;
  els.result.replaceChildren();
  renderPresets();
  renderForm();
}

function savePreset() {
  const name = prompt('幫這組條件取個名字');
  if (!name || !name.trim()) return;
  ctx.storage.savePreset(name, filters);
  ctx.toast(`已儲存「${name.trim()}」`);
  renderPresets();
}

function field(label, control) {
  return el('div', { class: 'field' }, el('div', { class: 'field-label' }, label), control);
}

function toggleChip(label, active, onClick) {
  return el('button', { class: active ? 'chip active' : 'chip', onclick: onClick }, label);
}

function renderForm() {
  els.form.replaceChildren(
    field('平台', el('div', { class: 'chips' },
      PROVIDERS.map((p) => toggleChip(p.name, filters.providers.includes(p.id), () => toggleIn('providers', p.id))))),
    field('類型', genreChips()),
    field('年代', el('div', { class: 'row' }, yearInput('yearFrom', '起'), el('span', {}, '～'), yearInput('yearTo', '迄'))),
    field('演員', personPicker('cast', '輸入演員名字')),
    field('導演', personPicker('crew', '輸入導演名字')),
    ratingField(),
    selectField('原始語言', LANGUAGES, filters.language ?? '', (v) => setFilter({ language: v || null })),
    selectField('片長上限', RUNTIMES, filters.maxRuntime ? String(filters.maxRuntime) : '', (v) => setFilter({ maxRuntime: v || null })),
  );
}

function genreChips() {
  if (genresError) {
    return el('div', {},
      el('span', { class: 'muted' }, genresError), ' ',
      el('button', { onclick: () => { genresError = null; renderForm(); loadGenres(); } }, '重試'));
  }
  if (!genres) return el('span', { class: 'muted' }, '載入中…');
  return el('div', { class: 'chips' },
    genres.map((g) => toggleChip(g.name, filters.genres.includes(g.id), () => toggleIn('genres', g.id))));
}

function yearInput(key, placeholder) {
  return el('input', {
    type: 'number',
    inputmode: 'numeric',
    min: '1900',
    max: '2100',
    placeholder,
    value: filters[key] ?? '',
    onchange: (e) => {
      setFilter({ [key]: e.target.value });
      renderForm();
    },
  });
}

function ratingText(value) {
  return value > 0 ? `${value} 分以上` : '不限';
}

function ratingField() {
  const label = el('span', {}, ratingText(filters.minRating));
  const input = el('input', {
    type: 'range',
    min: '0',
    max: '9',
    step: '0.5',
    value: String(filters.minRating),
    oninput: () => { label.textContent = ratingText(Number(input.value)); },
    onchange: () => setFilter({ minRating: Number(input.value) }),
  });
  return field(el('span', {}, '最低評分：', label), input);
}

function selectField(label, options, value, onChange) {
  return field(label, el('select', { value, onchange: (e) => onChange(e.target.value) },
    options.map(([v, text]) => el('option', { value: v }, text))));
}

function personPicker(key, placeholder) {
  const selected = el('div', { class: 'chips' }, filters[key].map((p) =>
    el('button', {
      class: 'chip active',
      onclick: () => {
        setFilter({ [key]: filters[key].filter((x) => x.id !== p.id) });
        renderForm();
      },
    }, `${p.name} ✕`)));
  const suggestions = el('ul', { class: 'suggestions' });
  let timer;
  let seq = 0;
  const input = el('input', {
    type: 'search',
    placeholder,
    autocomplete: 'off',
    oninput: () => {
      clearTimeout(timer);
      const query = input.value.trim();
      seq += 1;
      if (!query) {
        suggestions.replaceChildren();
        return;
      }
      const mySeq = seq;
      timer = setTimeout(async () => {
        const tmdb = ctx.tmdb();
        if (!tmdb) return;
        try {
          const people = await tmdb.searchPerson(query);
          if (mySeq !== seq) return;
          if (!people.length) {
            suggestions.replaceChildren(el('li', { class: 'muted' }, '找不到這個人'));
            return;
          }
          suggestions.replaceChildren(...people.map((p) => el('li', {},
            el('button', {
              onclick: () => {
                setFilter({ [key]: [...filters[key], { id: p.id, name: p.name }] });
                renderForm();
              },
            }, p.name, el('span', { class: 'muted' }, ` ${DEPARTMENTS[p.department] ?? ''}`)))));
        } catch (err) {
          if (mySeq === seq) suggestions.replaceChildren(el('li', { class: 'muted' }, describeError(err)));
        }
      }, 300);
    },
  });
  return el('div', {}, selected, input, suggestions);
}

// ---------- 抽片 ----------

function getPicker() {
  const tmdb = ctx.tmdb();
  if (!tmdb) return null;
  if (tmdb !== pickerTmdb) {
    picker = createPicker({ discover: tmdb.discover, isExcluded: (id) => ctx.storage.isExcluded(id) });
    pickerTmdb = tmdb;
  }
  return picker;
}

function setBusy(value) {
  busy = value;
  els.drawButton.disabled = value;
}

function showMessage(text, ...extra) {
  current = null;
  els.result.replaceChildren(el('div', { class: 'card message' }, el('p', {}, text), ...extra));
}

async function draw() {
  if (busy) return;
  const activePicker = getPicker();
  if (!activePicker) {
    ctx.goTo('settings');
    return;
  }
  if (!filters.providers.length) {
    showMessage('請至少選一個平台');
    return;
  }
  setBusy(true);
  showMessage('抽片中…');
  try {
    const result = await activePicker.pick(filters);
    if (result.status === 'ok') showMovie(result.movie);
    else if (result.status === 'no-results') showMessage('找不到符合條件的電影，試著放寬條件');
    else if (result.status === 'all-excluded') showMessage('符合條件的片都在你的清單裡了');
    else {
      showMessage('符合條件的片已經全部出現過了，要從頭再抽嗎？',
        el('button', { class: 'primary', onclick: () => { activePicker.resetRound(); draw(); } }, '從頭再抽'));
    }
  } catch (err) {
    showMessage(describeError(err));
  } finally {
    setBusy(false);
  }
}

function summary(movie) {
  return { id: movie.id, title: movie.title, poster: movie.poster, year: movie.year };
}

function metaText(movie, runtime) {
  return [
    movie.year ?? '年份不明',
    runtime ? `${runtime} 分鐘` : null,
    movie.rating ? `⭐ ${movie.rating.toFixed(1)}` : null,
  ].filter(Boolean).join('・');
}

function mark(list, message) {
  if (!current) return;
  ctx.storage.addToList(list, summary(current));
  ctx.toast(message);
  draw();
}

function showMovie(movie) {
  current = movie;
  const meta = el('p', { class: 'muted' }, metaText(movie));
  const platforms = el('div', { class: 'chips' });
  const watchButton = el('button', {
    class: 'primary',
    onclick: () => {
      ctx.storage.addToList('watchlist', summary(movie));
      ctx.toast('已加入待看');
      watchButton.disabled = true;
      watchButton.textContent = '已加入待看';
    },
  }, '🍿 就看這部');

  els.result.replaceChildren(el('article', { class: 'card movie-card' },
    poster(movie.poster),
    el('h2', {}, movie.title),
    movie.originalTitle && movie.originalTitle !== movie.title ? el('p', { class: 'muted' }, movie.originalTitle) : null,
    meta,
    platforms,
    el('p', { class: 'overview' }, movie.overview || '（沒有中文簡介）'),
    el('div', { class: 'actions' },
      el('button', { onclick: () => draw() }, '🔄 再抽一次'),
      el('button', { onclick: () => mark('watched', '已加入已看過') }, '✅ 看過了'),
      el('button', { onclick: () => mark('notInterested', '已加入沒興趣') }, '🙅 沒興趣'),
      watchButton)));

  loadDetails(movie, meta, platforms);
}

async function loadDetails(movie, meta, platforms) {
  try {
    const details = await ctx.tmdb().movie(movie.id);
    if (current?.id !== movie.id) return;
    meta.textContent = metaText(movie, details.runtime);
    platforms.replaceChildren(...PROVIDERS
      .filter((p) => details.providers.includes(p.id))
      .map((p) => el('span', { class: 'chip' }, p.name)));
  } catch {
    // 詳情載入失敗時只顯示基本資訊
  }
}
```

- [ ] **Step 2: 語法檢查與單元測試**

Run: `node --check js/ui/pick.js && npm test`
Expected: 沒有語法錯誤；測試全部 PASS

- [ ] **Step 3: 在瀏覽器中檢查（手機寬度，需要有效的 TMDB key；沒有的話向使用者索取，或把本步驟交給使用者並在回報中註明）**

伺服器：`python3 -m http.server 8000`，打開 `http://localhost:8000`，確認：
1. 類型標籤顯示中文名稱（動作、喜劇…）
2. 預設條件按「🎲 抽一部」→ 顯示海報、中文片名、年份、評分、簡介；稍後補上片長與 Netflix / Disney+ 標籤
3. 「再抽一次」連按數次不會出現同一部片；抽片中按鈕為 disabled
4. 「看過了」→ toast 並自動抽下一部；「清單 → 已看過」出現該片
5. 「就看這部」→ 按鈕變「已加入待看」；「待看」頁出現該片；按「看完了」後移到已看過
6. 演員欄輸入 `Tom Hanks` → 出現建議，點選後成為標籤；再抽出的片應有他參演
7. 年代輸入 2020 ～ 2000 → 離開欄位後自動變成 2000 ～ 2020
8. 取消兩個平台再抽 → 「請至少選一個平台」
9. 條件設成極嚴格（例如 Disney+、泰語、評分 9 分以上）→ 「找不到符合條件的電影，試著放寬條件」
10. 「存成預設組合」取名後，上方出現該組合並高亮；改條件後高亮消失；點組合會還原條件
11. DevTools 切到 Offline 後抽片 → 「無法連線到 TMDB，請稍後再試」；恢復 Online 再抽成功
12. Console 沒有錯誤

- [ ] **Step 4: Commit**

```bash
git add js/ui/pick.js
git commit -m "完成抽片頁：條件篩選、預設組合、抽片結果與標記

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 冒煙測試腳本與 README

**Files:**
- Create: `scripts/smoke.mjs`、`README.md`

**Interfaces:**
- Consumes: `createTmdb`、`createPicker`、`DEFAULT_FILTERS`
- Produces: `npm run smoke`（需環境變數 `TMDB_KEY`）

- [ ] **Step 1: 建立 `scripts/smoke.mjs`**

```js
// 用真實 TMDB API 驗證整條抽片流程：TMDB_KEY=你的key npm run smoke
import { createTmdb } from '../js/tmdb.js';
import { createPicker } from '../js/picker.js';
import { DEFAULT_FILTERS, PROVIDERS } from '../js/filters.js';

const key = process.env.TMDB_KEY;
if (!key) {
  console.error('請設定環境變數 TMDB_KEY');
  process.exit(1);
}

const tmdb = createTmdb(key);
await tmdb.validateKey();
console.log('API key 驗證成功');

const genres = await tmdb.genres();
console.log(`類型 ${genres.length} 種：${genres.slice(0, 5).map((g) => g.name).join('、')}…`);

const picker = createPicker({ discover: tmdb.discover, isExcluded: () => false });
const cases = [
  ['Netflix + Disney+', DEFAULT_FILTERS],
  ['只有 Disney+、2010 年後', { ...DEFAULT_FILTERS, providers: [337], yearFrom: 2010 }],
  ['Netflix、日語、評分 7 以上', { ...DEFAULT_FILTERS, providers: [8], language: 'ja', minRating: 7 }],
];
for (const [label, filters] of cases) {
  const result = await picker.pick(filters);
  if (result.status !== 'ok') {
    console.log(`${label}：${result.status}`);
    continue;
  }
  const details = await tmdb.movie(result.movie.id);
  const names = PROVIDERS.filter((p) => details.providers.includes(p.id)).map((p) => p.name).join('、') || '（無台灣上架資料）';
  console.log(`${label}：${result.movie.title}（${result.movie.year ?? '?'}）${details.runtime ?? '?'} 分鐘，${names}`);
}

const [person] = await tmdb.searchPerson('Tom Hanks');
console.log(`搜尋 Tom Hanks：${person?.name}（id ${person?.id}）`);
```

- [ ] **Step 2: 執行冒煙測試（有 key 時）**

Run: `TMDB_KEY=<key> npm run smoke`
Expected: 印出「API key 驗證成功」、類型清單、三組抽片結果（片名、年份、片長、平台至少有一個是 Netflix 或 Disney+）、Tom Hanks 的 id `31`。沒有 key 時跳過並在回報中註明。

- [ ] **Step 3: 建立 `README.md`**

````markdown
# 今晚看什麼（Movie Picker）

從台灣 Netflix / Disney+ 上架的電影中，依類型、年代、演員、導演、評分、語言、片長隨機抽一部來看。
可以把抽到的片標記為「看過了」「沒興趣」或加入「待看」，之後抽片會自動排除。

- 純前端網頁，資料存在瀏覽器的 localStorage，不需要伺服器
- 電影資料來自 [TMDB](https://www.themoviedb.org/)，上架資訊可能有數天延遲
- This product uses the TMDB API but is not endorsed or certified by TMDB.

## 第一次使用

1. 到 <https://www.themoviedb.org/settings/api> 註冊並申請 API（免費）
2. 打開網頁，在「設定」頁貼上「API Key」或「API Read Access Token」
3. 手機上用瀏覽器的「加入主畫面」，就能像 App 一樣開啟

清單只存在該瀏覽器中，換手機前請先在「設定 → 備份」匯出 JSON，再到新手機匯入。

## 本機開發

```bash
python3 -m http.server 8000   # 打開 http://localhost:8000
npm test                      # 單元測試（Node 20 以上，無需安裝套件）
TMDB_KEY=你的key npm run smoke  # 用真實 API 跑一次抽片流程
```

ES modules 不能用 `file://` 直接開啟，一定要透過本機伺服器。

## 部署到 GitHub Pages

1. 在 GitHub 建立新的 repository，然後：
   ```bash
   git remote add origin git@github.com:<帳號>/movie-picker.git
   git push -u origin main
   ```
2. GitHub repository → Settings → Pages → Source 選「Deploy from a branch」，Branch 選 `main`、資料夾 `/ (root)`
3. 約一分鐘後可在 `https://<帳號>.github.io/movie-picker/` 使用

API key 不在原始碼中，repository 設為公開也不會外洩 key。

## 程式結構

| 檔案 | 說明 |
|---|---|
| `js/filters.js` | 篩選條件正規化、轉成 TMDB discover 參數 |
| `js/storage.js` | 清單、預設組合、API key、匯出/匯入 |
| `js/tmdb.js` | TMDB API 呼叫 |
| `js/picker.js` | 隨機抽片（隨機頁序、每頁只抓一次、同一輪不重複） |
| `js/app.js` | 進入點與分頁切換 |
| `js/ui/*.js` | 各分頁畫面 |

設計文件：`docs/superpowers/specs/2026-09-29-movie-picker-design.md`
````

- [ ] **Step 4: 最終驗證**

Run: `npm test && for f in js/*.js js/ui/*.js scripts/*.mjs; do node --check "$f" || exit 1; done && git status --short`
Expected: 測試全部 PASS；沒有語法錯誤；`git status` 只列出 `README.md` 與 `scripts/smoke.mjs`

- [ ] **Step 5: Commit**

```bash
git add README.md scripts/smoke.mjs
git commit -m "新增冒煙測試腳本與 README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
