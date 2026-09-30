# Movie Picker 設計文件

日期：2026-09-29

## 目的

一個手機優先的小工具：從台灣地區 Netflix / Disney+ 上架的電影中，依條件隨機抽一部來看，並記錄「已看過」、「沒興趣」、「待看」三份清單，抽片時自動排除清單中的電影。

## 範圍

- 只處理**電影**（不含影集）
- 只處理**台灣地區**（`watch_region=TW`）
- 平台：Netflix（TMDB provider id `8`）、Disney+（TMDB provider id `337`）、Apple TV 商店租借/購買（TMDB provider id `2`，預設不勾選）
- 單人使用；資料只存在該瀏覽器，不做多裝置同步（以匯出/匯入 JSON 補足）

不做（YAGNI）：影集、其他國家、其他平台、帳號系統、雲端同步、搜尋片名手動加入清單、快速滑卡建立清單。

## 部署形式

- 純前端靜態網頁（原生 HTML / CSS / JavaScript ES modules），**沒有建置流程、沒有 npm 相依套件**
- 部署於 GitHub Pages，提供 `manifest.json` 讓手機可「加到主畫面」
- 獨立 git repo（`movie_picker/` 自身），與上層 `2026_Kiosk_Projects` 無關
- 本機開發：ES modules 無法用 `file://` 開啟，以 `python3 -m http.server 8000` 啟動後瀏覽 `http://localhost:8000`

## 資料來源：TMDB API

- 所有電影資料來自 TMDB（The Movie Database）API v3，上架資訊來自 TMDB 的 watch providers（資料源為 JustWatch），可能有數天延遲
- API key 由使用者在「設定」頁輸入，只存在該瀏覽器的 localStorage，**不寫入原始碼**
- 接受 v3「API Key」或 v4「API Read Access Token」（以 `eyJ` 開頭者改用 `Authorization: Bearer` header 傳送）；輸入值會去除前後空白
- 依 TMDB 使用條款，設定頁顯示「This product uses the TMDB API but is not endorsed or certified by TMDB.」
- 所有請求帶 `language=zh-TW` 以取得中文片名與簡介

使用的 endpoints：

| 用途 | Endpoint |
|---|---|
| 條件查詢電影 | `GET /discover/movie` |
| 類型清單 | `GET /genre/movie/list` |
| 演員／導演自動完成 | `GET /search/person` |
| 電影詳情（片長、台灣上架平台） | `GET /movie/{id}?append_to_response=watch/providers` |
| 驗證 API key | `GET /configuration` |

海報圖片網址：`https://image.tmdb.org/t/p/w500{poster_path}`（列表縮圖用 `w185`）。

## 篩選條件

| 條件 | UI | TMDB discover 參數 |
|---|---|---|
| 平台 | Netflix / Disney+ / Apple TV（租/買）勾選（至少一個；Apple TV 預設不勾） | `with_watch_providers=8\|337`、`watch_region=TW` |
| 類型 | 多選標籤（任一符合） | `with_genres=28\|878` |
| 年代範圍 | 起始年、結束年（可留空） | `primary_release_date.gte=YYYY-01-01`、`primary_release_date.lte=YYYY-12-31` |
| 演員 | 自動完成，可多選（任一符合） | `with_cast=id1\|id2` |
| 導演 | 自動完成，可多選（任一符合） | `with_crew=id1\|id2` |
| 最低評分 | 0–9 滑桿（0 表示不限） | `vote_average.gte=7`，並加 `vote_count.gte=50` 避免少數票極端值 |
| 原始語言 | 下拉選單：不限、英（en）、華（zh）、粵（cn，TMDB 對粵語片使用的代碼）、日（ja）、韓（ko）、法（fr）、西（es）、德（de）、泰（th） | `with_original_language=ja` |
| 片長上限 | 下拉選單（不限、90、120、150、180 分鐘） | `with_runtime.lte=120` |

固定參數：`include_adult=false`、`sort_by=popularity.desc`（排序只影響分頁內容，抽選本身是隨機的）。

註：`with_crew` 會比對所有幕後職位，不只導演。對於以導演身分聞名的人物結果仍以其執導作品為主，接受此近似。

## 畫面

單一 `index.html`，底部導覽列切換 4 個分頁。

### ① 抽片（首頁）

- 頂部：預設組合的橫向按鈕列，點擊即套用該組條件
- 條件區（可收合）：上表所有條件
- 按鈕：「🎲 抽一部」、「存成預設組合」（輸入名稱）
- 結果卡片：海報、中文片名／原文片名、年份、片長、評分、平台標示、簡介
- 結果按鈕：
  - **再抽一次**：抽下一部
  - **看過了**：加入已看過，並自動抽下一部
  - **沒興趣**：加入沒興趣，並自動抽下一部
  - **就看這部**：加入待看，顯示「已加入待看」

### ② 待看

列出待看電影（縮圖＋片名＋年份），每部有「看完了」（移至已看過）與「移除」按鈕。

### ③ 清單

切換「已看過」／「沒興趣」，每部電影可「移除」。

### ④ 設定

- TMDB API key 輸入欄（儲存時呼叫 `/configuration` 驗證）與申請教學連結
- 預設組合管理：改名、刪除
- 匯出 JSON（下載檔案）、匯入 JSON（選擇檔案）

### 邊界情況

- 尚未設定 API key：開啟即導向設定頁
- API key 無效（401）：顯示「API key 無效，請到設定頁檢查」
- 網路錯誤：顯示「無法連線到 TMDB，請稍後再試」，保留目前畫面
- 條件查無任何電影（`total_results=0`）：「找不到符合條件的電影，試著放寬條件」
- 符合條件的電影全部在排除清單中：「符合條件的片都在你的清單裡了」
- 本輪已全部抽過：「符合條件的片已經全部出現過了，要從頭再抽嗎？」（按下即清空本輪紀錄）

## 程式架構

```
movie_picker/
├── index.html
├── manifest.json
├── css/style.css
├── js/
│   ├── app.js          # 進入點：分頁切換、初始化、API key 檢查
│   ├── tmdb.js         # TMDB API 呼叫封裝（唯一碰網路的模組）
│   ├── storage.js      # localStorage 讀寫、清單操作、預設組合、匯出/匯入
│   ├── filters.js      # 條件物件 → discover 查詢參數
│   ├── picker.js       # 隨機抽片邏輯（不碰 DOM）
│   └── ui/
│       ├── pick.js
│       ├── watchlist.js
│       ├── lists.js
│       └── settings.js
├── tests/              # node:test 測試純邏輯模組
└── docs/
```

### 模組介面

- **`tmdb.js`**：`createTmdb(apiKey, fetchFn = fetch)` 回傳 `{ discover(params, page), genres(), searchPerson(query), movie(id), validateKey() }`；`movie(id)` 另回傳 `runtime` 與 `providers`（台灣 flatrate、rent、buy 中屬於 8 / 337 / 2 的 id）。另匯出 `posterUrl(path, size)`、`toMovie(raw)`、`describeError(err)`（錯誤 → 中文訊息）。錯誤統一丟出 `TmdbError`，帶 `kind`：`'auth' | 'network' | 'http'`。
- **`filters.js`**：`toDiscoverParams(filters)` → 純物件（不含 `page`、`api_key`）；`filtersKey(filters)` → 正規化後的字串，用於判斷條件是否改變。
- **`storage.js`**：`createStorage(backend, now)`（backend 為 null 時使用記憶體），提供 `getApiKey()`、`getList(name)`、`getPresets()`、`addToList(list, movie)`、`removeFromList(list, id)`、`moveToList(from, to, id)`、`isExcluded(id)`、`savePreset(name, filters)`、`renamePreset(id, name)`、`deletePreset(id)`、`exportJson()`、`importJson(text)`、`setApiKey(key)`。
- **`picker.js`**：`createPicker({ discover, isExcluded, random = Math.random })`，提供 `pick(filters)` 與 `resetRound()`。

## 隨機抽片演算法（picker.js）

狀態（以 `filtersKey` 區分，換條件即重建）：

- `pageOrder`：打亂後的頁碼陣列
- `pageCache`：`Map<page, movie[]>`，已抓過的頁面
- `shownThisRound`：`Set<movieId>`，本輪已抽出的電影

`pick(filters)` 流程：

1. 若條件與上次不同：重設所有狀態，抓第 1 頁取得 `total_pages`（上限 500），把 `1..total_pages` 用 Fisher–Yates 打亂成 `pageOrder`，並把第 1 頁放入快取
2. 若 `total_results = 0` → 回傳 `{ status: 'no-results' }`
3. 依 `pageOrder` 順序逐頁處理（快取有就用快取，否則呼叫 `discover` 抓取並存入快取）：
   - 候選 = 該頁電影中 `!isExcluded(id) && !shownThisRound.has(id)` 者
   - 候選非空 → 隨機選一部，加入 `shownThisRound`，回傳 `{ status: 'ok', movie }`
4. 所有頁都沒有候選：
   - 若存在「未被排除但本輪已出現過」的電影 → 回傳 `{ status: 'round-exhausted' }`
   - 否則 → 回傳 `{ status: 'all-excluded' }`

`resetRound()`：清空 `shownThisRound`，保留快取與頁序。

性質：只要存在「符合條件、未排除、本輪未出現」的電影，就一定抽得到；每頁在同一條件下最多只向 TMDB 請求一次。頁序隨機、頁內也隨機挑選，整體接近均勻分布；當部分頁面的候選較少時會略有偏差，可接受。

限制：TMDB discover 最多 500 頁（10,000 部），超過的部分抽不到。台灣 Netflix + Disney+ 電影總量預期低於此數。

抽到後呼叫 `movie(id)` 補上片長與平台標示；此呼叫失敗時仍顯示卡片，只是不顯示這兩項。

## 資料結構（localStorage）

單一 key `moviePicker`，值為 JSON：

```json
{
  "version": 1,
  "apiKey": "xxxx",
  "lists": {
    "watched":       { "550": { "id": 550, "title": "鬥陣俱樂部", "poster": "/abc.jpg", "year": 1999, "addedAt": "2026-09-29T12:00:00.000Z" } },
    "notInterested": {},
    "watchlist":     {}
  },
  "presets": [
    {
      "id": "p_1727580000000",
      "name": "週末爆米花",
      "filters": {
        "providers": [8, 337],
        "genres": [28, 878],
        "yearFrom": 2010,
        "yearTo": null,
        "cast": [{ "id": 31, "name": "Tom Hanks" }],
        "crew": [],
        "minRating": 7,
        "language": null,
        "maxRuntime": 150
      }
    }
  ]
}
```

- 排除判斷：`id` 存在於三份清單任一份即排除
- `addedAt` 為 ISO 時間字串，清單頁依此由新到舊排序
- 一部電影同一時間只會在一份清單中；加入某清單時會自動從其他清單移除
- 匯出：整份 JSON 去掉 `apiKey` 後下載為 `movie-picker-backup-YYYY-MM-DD.json`
- 匯入：驗證 `version` 與結構；清單以合併方式匯入（同 id 以匯入檔為準），預設組合以 `id` 合併；結構不符時顯示錯誤、不改動現有資料
- 讀取時若 JSON 損壞或缺欄位，以預設空狀態補齊（不讓整個 app 壞掉）

## 測試

- 使用 Node 內建 `node:test` + `node:assert`，執行 `node --test tests/`，無需安裝套件
- 測試範圍：
  - `filters.js`：各條件轉換、空值省略、`filtersKey` 對順序不敏感
  - `storage.js`：以記憶體假 backend 測試清單操作、互斥性、預設組合、匯出不含 key、匯入合併與錯誤處理、損壞資料復原
  - `picker.js`：以假 `discover` 測試：正常抽選、跨頁尋找、`no-results`、`all-excluded`、`round-exhausted`、`resetRound`、換條件重建狀態、每頁只請求一次、本輪不重複
  - `tmdb.js`：以假 `fetch` 測試參數組裝與錯誤分類
- UI：以瀏覽器實際操作驗證（手機寬度），不寫自動化 UI 測試
