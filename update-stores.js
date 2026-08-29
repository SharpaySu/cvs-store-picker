#!/usr/bin/env node
/**
 * 定期把 Cojad/taiwan-7Eleven-store 的門市資料鏡射一份到自己的
 * data/stores.json，整理成 extension 需要的格式。
 * 用排程（見 .github/workflows/update-stores.yml）每天跑一次。
 *
 * 為什麼要鏡射而不是讓 extension 直接 fetch 對方的網址：
 * - 對方是別人維護的公開 repo，格式或路徑哪天變了、或 repo 消失，
 *   你的結帳頁會直接壞掉。多這一層轉換可以隔離上游變動。
 * - 可以順便在這裡篩選只留你有出貨到的縣市，縮小 extension 要下載的資料量
 *   （全台約 7000+ 筆，直接整包丟給結帳頁可能偏重）。
 *
 * 來源資料格式（對方 repo 的 stores.json）：
 *   { "110817": { "store": "千翔", "address": "台北市中正區許昌街17號1樓" } }
 * 來源每天自動更新，資料來自對方在 repo README 註明的公開網站爬蟲，
 * 使用前建議先看一下對方 repo 的授權/使用說明。
 */

import fs from "node:fs/promises";

const SOURCE_URL =
  "https://raw.githubusercontent.com/Cojad/taiwan-7Eleven-store/master/stores.json";
const OUTPUT_PATH = new URL("../data/stores.json", import.meta.url);

// 如果只想留特定縣市，把關鍵字填進這裡（例如 ["台北市", "新北市"]）。
// 留空陣列 [] 代表全台都保留。
const CITY_FILTER = [];

async function main() {
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`抓取門市資料失敗：HTTP ${res.status}`);
  }

  const raw = await res.json(); // { "店號": { store, address }, ... }

  let normalized = Object.entries(raw).map(([code, info]) => ({
    code,
    name: info.store,
    address: info.address,
  }));

  if (CITY_FILTER.length > 0) {
    normalized = normalized.filter((s) =>
      CITY_FILTER.some((city) => s.address.includes(city))
    );
  }

  await fs.mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(normalized, null, 2), "utf-8");
  console.log(`已更新 ${normalized.length} 筆門市資料`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
