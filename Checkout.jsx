import { useEffect, useMemo, useRef, useState } from "react";
import {
  reactExtension,
  BlockStack,
  Text,
  TextField,
  Select,
  Banner,
  Spinner,
  useApplyAttributeChange,
  useAttributeValues,
  useShippingAddress,
  useBuyerJourneyIntercept,
} from "@shopify/ui-extensions-react/checkout";

// 存放門市清單的網址：指向你自己 repo 裡的 data/stores.json，
// 由 scripts/update-stores.js + .github/workflows/update-stores.yml
// 每天自動從 Cojad/taiwan-7Eleven-store 鏡射並更新。
// 換成你自己 repo 的實際路徑。
const STORES_ENDPOINT =
  "https://raw.githubusercontent.com/<your-account>/<your-repo>/main/data/stores.json";

export default reactExtension(
  "purchase.checkout.delivery-address.render-after",
  () => <StorePicker />
);

function StorePicker() {
  const applyAttributeChange = useApplyAttributeChange();
  const [savedCode] = useAttributeValues(["cvs_store_code"]);
  const shippingAddress = useShippingAddress();

  const [stores, setStores] = useState([]);
  const [loadStatus, setLoadStatus] = useState("loading"); // loading | ready | error
  const [keyword, setKeyword] = useState("");
  const [selectedCode, setSelectedCode] = useState(savedCode ?? "");
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const prefillDone = useRef(false);

  // 讀取最新門市資料（每次結帳頁載入時抓一次，資料來源由排程定期更新）
  useEffect(() => {
    let cancelled = false;

    async function loadStores() {
      try {
        const res = await fetch(STORES_ENDPOINT, { method: "GET" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setStores(data);
          setLoadStatus("ready");
        }
      } catch (err) {
        if (!cancelled) setLoadStatus("error");
      }
    }

    loadStores();
    return () => {
      cancelled = true;
    };
  }, []);

  // 用運送地址帶入初次搜尋關鍵字，減少客人手動輸入
  // 註：Checkout UI Extension 跑在 sandbox iframe 裡，不支援瀏覽器原生
  // navigator.geolocation 定位；運送地址是官方支援、可靠的做法，所以用這個。
  useEffect(() => {
    if (prefillDone.current) return;
    const city = shippingAddress?.city;
    if (city) {
      setKeyword(city);
      prefillDone.current = true;
    }
  }, [shippingAddress]);

  const results = useMemo(() => {
    const kw = keyword.trim();
    if (kw.length < 2 || stores.length === 0) return [];
    // address 本身已包含縣市/行政區/路名，比對 name + address 就足夠涵蓋搜尋
    return stores
      .filter((s) => s.name.includes(kw) || s.address.includes(kw))
      .slice(0, 10);
  }, [keyword, stores]);

  const options = useMemo(() => {
    const placeholder = {
      value: "",
      label: results.length ? "請選擇門市" : "請先輸入關鍵字搜尋",
    };
    return [
      placeholder,
      ...results.map((s) => ({
        value: s.code,
        label: `${s.name}（${s.address}）`,
      })),
    ];
  }, [results]);

  const selectedStore = stores.find((s) => s.code === selectedCode);

  async function handleSelect(value) {
    setSelectedCode(value);
    const store = stores.find((s) => s.code === value);
    if (!store) return;

    setSaveStatus("saving");

    const outcomes = await Promise.all([
      applyAttributeChange({
        type: "updateAttribute",
        key: "cvs_store_code",
        value: store.code,
      }),
      applyAttributeChange({
        type: "updateAttribute",
        key: "cvs_store_name",
        value: store.name,
      }),
      applyAttributeChange({
        type: "updateAttribute",
        key: "cvs_store_address",
        value: store.address,
      }),
    ]);

    const failed = outcomes.some((r) => r.type === "error");
    setSaveStatus(failed ? "error" : "saved");
  }

  // 未選門市就擋下「繼續」按鈕
  // 注意 1：production 商店要在「結帳客製化」編輯器裡手動開啟這個
  //        extension 的 block_progress 權限，開發商店預設就會允許。
  // 注意 2：如果門市資料載入失敗（loadStatus === "error"），一定要放行，
  //        不然客人會被卡在結帳頁走不下去——資料來源是外部依賴，
  //        擋單的優先度必須低於「讓客人付得了錢」。
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    if (canBlockProgress && loadStatus === "ready" && !selectedCode) {
      return {
        behavior: "block",
        reason: "尚未選擇 7-11 取貨門市",
        errors: [
          {
            message: "請先選擇一間 7-11 門市，才能繼續結帳",
          },
        ],
      };
    }
    return { behavior: "allow" };
  });

  return (
    <BlockStack border="base" cornerRadius="base" padding="base" spacing="tight">
      <Text emphasis="bold">7-11 超商取貨門市</Text>

      {loadStatus === "loading" && (
        <BlockStack inlineAlignment="center">
          <Spinner size="small" />
        </BlockStack>
      )}

      {loadStatus === "error" && (
        <Banner status="critical">
          門市資料載入失敗，請重新整理頁面再試一次
        </Banner>
      )}

      {loadStatus === "ready" && (
        <>
          <TextField
            label="搜尋門市（輸入店名、路名或行政區）"
            value={keyword}
            onChange={setKeyword}
          />

          <Select
            label="選擇門市"
            options={options}
            value={selectedCode}
            onChange={handleSelect}
            disabled={results.length === 0 && !selectedCode}
          />

          {!selectedCode && (
            <Banner status="info">請選擇一間門市才能繼續結帳</Banner>
          )}

          {saveStatus === "saved" && selectedStore && (
            <Banner status="success">
              已選擇：{selectedStore.name}（{selectedStore.address}）
            </Banner>
          )}

          {saveStatus === "error" && (
            <Banner status="critical">
              門市儲存失敗，請重新選擇一次
            </Banner>
          )}
        </>
      )}
    </BlockStack>
  );
}
