# 今晚看什麼（Movie Picker）

從台灣 Netflix、Disney+、Apple TV 商店上架的電影中，依條件隨機抽一部來看；也可以搜尋某部片、某位演員或導演的作品在哪個平台看得到。

網站：<https://spookychen.github.io/movie_picker/>

- 純前端網頁，資料存在瀏覽器的 localStorage，不需要伺服器
- 電影資料來自 [TMDB](https://www.themoviedb.org/)，上架資訊可能有數天延遲
- This product uses the TMDB API but is not endorsed or certified by TMDB.

## 功能

### 🎲 抽片
- 條件：平台、類型、年代、演員、導演、最低評分、原始語言（含粵語）、片長上限
- 平台：Netflix、Disney+、Apple TV（租/買）。Apple TV 商店每部片要另外付費，預設不勾選
- 常用條件可以存成「預設組合」，一鍵套用
- 抽到的片可以按「再抽一次」「看過了」「沒興趣」「就看這部」（加入待看）
- 已看過、沒興趣、待看的片不會再被抽到；同一輪「再抽一次」也不會重複

### 🔍 搜尋
- 切換「片名／演員／導演」搜尋
- 片名：列出符合的電影（最多 10 部）與上架平台
- 演員／導演：只列出他在上述平台上看得到的作品（導演條件會比對所有幕後職位，可能包含擔任製片等的作品）
- 點海報或片名開啟資訊卡，可直接「加入待看」「看過了」「沒興趣」

### 🍿 待看
- 「就看這部」或從搜尋加入的片
- 點海報或片名開啟資訊卡（片長、評分、平台、簡介）
- 看完按「看完了」移到已看過

### 📋 清單
- 查看、移除「已看過」與「沒興趣」的片

### ⚙️ 設定
- TMDB API key、預設組合改名／刪除、匯出／匯入備份

## 第一次使用

1. 到 <https://www.themoviedb.org/settings/api> 註冊並申請 API（免費）
2. 打開網站，在「設定」頁貼上「API Key」或「API Read Access Token」（不是 GitHub token）
3. 手機上用瀏覽器的「加入主畫面」，就能像 App 一樣開啟

## 資料存在哪裡

清單、預設組合與 API key 只存在**目前使用的瀏覽器**，不會上傳，也不會在裝置之間同步。

- 換手機、換瀏覽器、清除網站資料前，先在「設定 → 備份」匯出 JSON，再到新環境匯入
- iPhone：從主畫面圖示開啟的 App 與 Safari 的資料是分開的，請固定使用同一個入口；Safari 超過 7 天沒開啟可能被自動清除，主畫面 App 不受此限制
- 刪除主畫面圖示會一併刪除資料，請先匯出

## 本機開發

```bash
python3 -m http.server 8000      # 打開 http://localhost:8000
npm test                         # 單元測試（Node 20 以上，無需安裝套件）
TMDB_KEY=你的TMDBkey npm run smoke # 用真實 API 測試抽片、Apple TV、演員作品與片名搜尋
```

ES modules 不能用 `file://` 直接開啟，一定要透過本機伺服器。同一個 Wi-Fi 下，手機可以用 `http://<電腦IP>:8000` 測試（`ipconfig getifaddr en0` 查 IP）。

## 部署（GitHub Pages）

repository：`https://github.com/SpookyChen/movie_picker`，Pages 設定為 `main` 分支的 `/ (root)`。修改後執行 `git push`，一兩分鐘內網站會自動更新；手機上把 App 完全關閉再開啟即可看到新版。

推送用的 Personal Access Token（fine-grained）只需要：

- Repository access：只選 `movie_picker`
- Repository permissions：**Contents: Read and write**（Metadata 會自動加上）

API key 不在原始碼中，repository 公開也不會外洩 key。

## 程式結構

| 檔案 | 說明 |
|---|---|
| `js/filters.js` | 篩選條件正規化、轉成 TMDB discover 參數、平台清單 |
| `js/storage.js` | 清單、預設組合、API key、匯出/匯入 |
| `js/tmdb.js` | TMDB API 呼叫（類型名稱轉繁體） |
| `js/picker.js` | 隨機抽片（隨機頁序、每頁只抓一次、同一輪不重複、連抽換頁） |
| `js/search.js` | 搜尋：演員／導演在各平台的作品、替電影補上平台 |
| `js/app.js` | 進入點與分頁切換 |
| `js/ui/pick.js`、`search.js`、`watchlist.js`、`lists.js`、`settings.js` | 各分頁畫面 |
| `js/ui/detail.js` | 電影資訊卡（待看、搜尋共用） |
| `js/ui/dom.js` | DOM 建構輔助（不使用 innerHTML） |
| `scripts/smoke.mjs` | 用真實 TMDB API 的冒煙測試 |

設計文件：`docs/superpowers/specs/2026-09-29-movie-picker-design.md`
