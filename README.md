# 今晚看什麼（Movie Picker）

從台灣 Netflix / Disney+ 上架的電影中，依類型、年代、演員、導演、評分、語言、片長隨機抽一部來看。
可以把抽到的片標記為「看過了」「沒興趣」或加入「待看」，之後抽片會自動排除。
也可以用片名、演員或導演搜尋，查看電影在 Netflix、Disney+、Apple TV（租/買）哪個平台看得到。

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
| `js/search.js` | 搜尋：演員／導演在各平台的作品、替電影補上平台 |
| `js/app.js` | 進入點與分頁切換 |
| `js/ui/*.js` | 各分頁畫面 |

設計文件：`docs/superpowers/specs/2026-09-29-movie-picker-design.md`
