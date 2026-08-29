# 7-11 超商取貨門市選擇（Checkout UI Extension）

客人在結帳頁搜尋並選擇 7-11 門市，選擇結果會寫入訂單的 note attributes
（`cvs_store_code` / `cvs_store_name` / `cvs_store_address`），店家在後台
訂單頁面就能看到，自行人工出貨。不產生任何託運單號，不呼叫任何第三方
物流 API。

## 這版的重點

1. **未選門市不能結帳** — 用 `useBuyerJourneyIntercept` 擋下「繼續」按鈕，
   直到客人選定門市為止。如果門市資料剛好載入失敗，會自動放行，
   不會把客人卡死在結帳頁。
2. **自動帶入搜尋關鍵字** — 用 `useShippingAddress` 讀運送地址的城市，
   自動填進搜尋框。
   > Checkout UI Extension 跑在 sandbox iframe 裡，官方不支援直接呼叫
   > 瀏覽器原生的 `navigator.geolocation`，所以用運送地址取代瀏覽器定位，
   > 這是目前唯一可靠、官方支援的做法。
3. **門市資料每天自動更新** — 資料來源是公開專案
   [Cojad/taiwan-7Eleven-store](https://github.com/Cojad/taiwan-7Eleven-store)，
   對方自己每天用 GitHub Action 爬蟲更新全台約 7000+ 筆門市資料。
   我們用 `scripts/update-stores.js` + `.github/workflows/update-stores.yml`
   每天把對方的資料鏡射、轉換格式後存進自己 repo 的 `data/stores.json`，
   結帳頁的 extension 只依賴你自己的 repo，不直接依賴對方。

   鏡射而不是直接接對方網址的原因：對方是別人維護的公開 repo，
   格式、路徑、甚至 repo 本身哪天說沒就沒，你的結帳頁不該直接暴露在
   這個風險下。多一層轉換也讓你能順手篩選只留有出貨的縣市，
   縮小 extension 要下載的資料量（見 `scripts/update-stores.js` 裡的
   `CITY_FILTER`）。

   使用前建議看一下對方 repo 的說明，裡面有提醒「非公開 API 請保持
   禮貌，避免造成伺服器負擔」，我們一天只抓一次，符合這個原則。

## 部署步驟

1. 確認已安裝 Shopify CLI，且已用 `shopify login` 登入你自己的店。
2. 把這個資料夾整個放進你 app 專案的 `extensions/cvs-store-picker/`
   （資料夾名稱需與 `shopify.extension.toml` 裡的 `handle` 一致）。
3. 如果還沒有 app 專案：
   ```
   shopify app init
   ```
   選 "Build a custom app"（自己店用，不用發布到 App Store）。
4. 開發預覽：
   ```
   shopify app dev
   ```
   正式部署：
   ```
   shopify app deploy
   ```
5. 到 Shopify 後台 > 設定 > 結帳 > 客製化，把這個 extension 加到結帳頁面，
   **並手動開啟它的「封鎖結帳進度」（block progress）權限** —— 開發商店
   會自動允許，但正式環境（production）一定要在結帳編輯器裡手動打開，
   不然「未選門市不能結帳」不會生效。

## 門市資料怎麼接上

1. 把這個資料夾 push 到一個 GitHub repo（建議先用 public repo，
   private repo 要另外處理 `raw.githubusercontent.com` 的授權，比較麻煩）。
2. （選用）打開 `scripts/update-stores.js`，如果只想留特定縣市，
   把縣市名稱填進 `CITY_FILTER`（例如 `["台北市", "新北市"]`），
   留空代表全台都保留。
3. GitHub Actions 排程（預設每天 UTC 18:00，台灣時間凌晨 2 點跑一次）
   會自動抓 Cojad 的資料、轉換格式、更新 `data/stores.json`、commit 回 repo。
4. 打開 `src/Checkout.jsx`，把 `STORES_ENDPOINT` 換成你自己 repo 裡
   `data/stores.json` 的 raw 網址，例如：
   ```
   https://raw.githubusercontent.com/<你的帳號>/<你的repo>/main/data/stores.json
   ```
   注意 `raw.githubusercontent.com` 有數分鐘的快取延遲，這對「每天更新
   一次」的頻率來說不是問題。
5. `src/stores.json` 只是範例格式參考，不再被 `Checkout.jsx` 直接使用，
   可以留著當文件，或直接刪除。

## 資料格式

`data/stores.json`（也是 extension 實際讀取的格式）：

```json
[
  { "code": "110817", "name": "千翔", "address": "台北市中正區許昌街17號1樓" }
]
```

`address` 已經包含完整地址（縣市/行政區/路名），搜尋直接比對
`name` + `address` 就能涵蓋客人打城市、行政區或路名的情境，
不用另外拆欄位。

## 訂單頁面怎麼看到客人選的門市

客人選定門市後，`cvs_store_code`、`cvs_store_name`、`cvs_store_address`
會出現在該筆訂單的 "Additional details / Note attributes" 區塊，
Shopify 後台訂單詳情頁面往下捲就看得到，出貨時對照這個資訊人工去
7-11 交寄即可。
