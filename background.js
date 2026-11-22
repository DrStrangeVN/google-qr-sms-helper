const IPAD_MINI_UA =
  "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const SPOOF_TTL_MINUTES = 30;
const EXPIRE_ALARM = "gqsh-spoof-expire";
const UA_SCRIPT_ID = "gqsh-ua-spoof";
const RULE_IDS = [1, 2, 3, 4];

const CLIENT_HINT_HEADERS = [
  "Sec-CH-UA",
  "Sec-CH-UA-Mobile",
  "Sec-CH-UA-Platform",
  "Sec-CH-UA-Platform-Version",
  "Sec-CH-UA-Model",
  "Sec-CH-UA-Full-Version-List",
  "Sec-CH-UA-Arch",
  "Sec-CH-UA-Bitness"
];

function uaRule(id, priority, ua, urlFilter) {
  return {
    id,
    priority,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        { header: "User-Agent", operation: "set", value: ua },
        ...CLIENT_HINT_HEADERS.map((header) => ({ header, operation: "remove" }))
      ]
    },
    condition: {
      urlFilter,
      resourceTypes: ["main_frame", "sub_frame", "xmlhttprequest", "other"]
    }
  };
}

// Chỉ phủ đúng 4 đường dẫn của luồng hạ cấp QR -> SMS (tránh làm hỏng đăng nhập desktop / Passkey)
function buildRules() {
  return [
    uaRule(1, 1, IPAD_MINI_UA, "||accounts.google.com/uplevelingstep/*"),
    uaRule(2, 1, IPAD_MINI_UA, "||accounts.google.com/_/IdvUplevelingUi/*"),
    uaRule(4, 1, IPAD_MINI_UA, "||accounts.google.com/v3/signin/challenge/iap*idv_xdevice=1"),
    uaRule(3, 10, IPHONE_UA, "||accounts.google.com/devicephoneverification/*")
  ];
}

async function writeRules(rules) {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: RULE_IDS, addRules: rules });
    return rules.map((r) => r.id);
  } catch {
    const applied = [];
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: RULE_IDS, addRules: [] }).catch(() => {});
    for (const rule of rules) {
      try {
        await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
        applied.push(rule.id);
      } catch {}
    }
    return applied;
  }
}

async function syncUaScript(enabled) {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [UA_SCRIPT_ID] });
  if (enabled) {
    if (existing.length === 0) {
      await chrome.scripting.registerContentScripts([
        {
          id: UA_SCRIPT_ID,
          matches: [
            "https://accounts.google.com/uplevelingstep/*",
            "https://accounts.google.com/v3/signin/challenge/iap*"
          ],
          js: ["ua_spoof.js"],
          runAt: "document_start",
          world: "MAIN"
        }
      ]);
    }
  } else if (existing.length > 0) {
    await chrome.scripting.unregisterContentScripts({ ids: [UA_SCRIPT_ID] });
  }
}

async function updateBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? "ON" : "" }).catch(() => {});
  if (enabled) {
    await chrome.action.setBadgeBackgroundColor({ color: "#1a73e8" }).catch(() => {});
  }
}

async function setSpoof(enabled) {
  const on = Boolean(enabled);
  const applied = await writeRules(on ? buildRules() : []);
  await syncUaScript(on).catch(() => {});
  const since = on ? Date.now() : 0;
  await chrome.storage.local.set({ spoofEnabled: on, spoofSince: since });
  await updateBadge(on);

  if (on) {
    await chrome.alarms.create(EXPIRE_ALARM, { delayInMinutes: SPOOF_TTL_MINUTES }).catch(() => {});
  } else {
    await chrome.alarms.clear(EXPIRE_ALARM).catch(() => {});
  }
  return { enabled: on, applied, ttlMinutes: on ? SPOOF_TTL_MINUTES : 0, since };
}

async function getSpoof() {
  const { spoofEnabled, spoofSince, autoDowngrade } = await chrome.storage.local.get({
    spoofEnabled: false,
    spoofSince: 0,
    autoDowngrade: false
  });
  const since = spoofSince || 0;
  const remainingMinutes =
    spoofEnabled && since
      ? Math.max(0, Math.ceil((since + SPOOF_TTL_MINUTES * 60 * 1000 - Date.now()) / 60000))
      : 0;
  return {
    enabled: Boolean(spoofEnabled),
    since,
    ttlMinutes: SPOOF_TTL_MINUTES,
    remainingMinutes,
    autoDowngrade: Boolean(autoDowngrade)
  };
}

async function restoreSpoofState() {
  const { spoofEnabled, spoofSince } = await chrome.storage.local.get({
    spoofEnabled: false,
    spoofSince: 0
  });
  if (spoofEnabled) {
    const age = Date.now() - (spoofSince || 0);
    if (age > SPOOF_TTL_MINUTES * 60 * 1000) {
      await setSpoof(false);
      return;
    }
    await writeRules(buildRules());
    await syncUaScript(true).catch(() => {});
    await updateBadge(true);
    await chrome.alarms.create(EXPIRE_ALARM, { delayInMinutes: SPOOF_TTL_MINUTES }).catch(() => {});
  } else {
    await writeRules([]);
    await syncUaScript(false).catch(() => {});
    await updateBadge(false);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  restoreSpoofState().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  restoreSpoofState().catch(() => {});
});
restoreSpoofState().catch(() => {});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === EXPIRE_ALARM) {
    setSpoof(false).catch(() => {});
  }
});

// Giải mã link rút gọn g.co/verify/...: ưu tiên fetch trực tiếp, lỗi thì mở tab ẩn cho trình duyệt tự điều hướng
const BEGIN_RE = /https:\/\/accounts\.google\.com\/devicephoneverification\/(?:begin|initiate)\?[^\s"'<>\\]+/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBeginUrlInHtml(html) {
  const normalized = String(html || "")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/&amp;/gi, "&");
  const m = normalized.match(BEGIN_RE);
  return m ? m[0].replace(/[\\"']+$/, "") : null;
}

async function resolveShortViaFetch(url) {
  const res = await fetch(url, { credentials: "include", redirect: "follow", cache: "no-store" });
  const finalUrl = res.url || url;
  if (BEGIN_RE.test(finalUrl)) return { url: finalUrl, via: "fetch-redirect" };
  const html = await res.text();
  if (/shorturl\/error/i.test(finalUrl)) {
    throw new Error("Link g.co/verify đã hết hạn (shorturl/error). Hãy tải lại trang QR rồi thử lại.");
  }
  const begin = findBeginUrlInHtml(html);
  if (begin) return { url: begin, via: "fetch-html" };
  throw new Error("Không tìm thấy đường dẫn xác minh trong phản hồi HTTP " + res.status);
}

async function resolveShortViaTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;
  try {
    const deadline = Date.now() + 20000;
    let lastUrl = tab.url || "";
    while (Date.now() < deadline) {
      await sleep(250);
      let t;
      try {
        t = await chrome.tabs.get(tabId);
      } catch {
        break;
      }
      lastUrl = t.url || t.pendingUrl || lastUrl;
      if (BEGIN_RE.test(lastUrl)) return { url: lastUrl, via: "tab-ẩn" };
      if (/shorturl\/error/i.test(lastUrl)) {
        throw new Error("Link g.co/verify đã hết hạn (shorturl/error). Hãy tải lại trang QR.");
      }
      if (t.status === "complete" && /accounts\.google\.com/.test(lastUrl) && !/devicephoneverification/.test(lastUrl)) {
        throw new Error("Link rút gọn không dẫn tới trang xác minh: " + lastUrl.split("?")[0]);
      }
    }
    throw new Error("Hết thời gian chờ mở tab ẩn (20s)");
  } finally {
    await chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function resolveShort(url) {
  if (!/^https:\/\/g\.co\/verify\//i.test(url)) {
    return { ok: false, error: "Link rút gọn không hợp lệ" };
  }
  const errors = [];
  try {
    const r = await resolveShortViaFetch(url);
    return { ok: true, url: r.url, via: r.via };
  } catch (e) {
    errors.push("Fetch trực tiếp: " + (e?.message || String(e)));
  }
  try {
    const r = await resolveShortViaTab(url);
    return { ok: true, url: r.url, via: r.via, fallback: true };
  } catch (e) {
    errors.push("Tab ẩn: " + (e?.message || String(e)));
  }
  return { ok: false, error: errors.join(" | ") };
}

const ALLOWED_HOSTS = ["accounts.google.com", "g.co"];

async function swFetch(msg) {
  const url = msg && msg.url;
  const method = ((msg && msg.method) || "GET").toUpperCase();
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return { ok: false, error: "URL không hợp lệ" };
  }
  if (!ALLOWED_HOSTS.includes(host)) return { ok: false, error: "Tên miền không được phép: " + host };

  const init = { method, credentials: "include", redirect: "follow", cache: "no-store" };
  if (msg.headers) init.headers = msg.headers;
  if (msg.body != null && method !== "GET") init.body = msg.body;

  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return { ok: true, status: res.status, url: res.url, text };
  } catch (e) {
    return { ok: false, error: (e?.name ? e.name + ": " : "") + (e?.message || String(e)) };
  }
}

async function probe(name, url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { credentials: "omit", redirect: "follow", cache: "no-store" });
    return { name, ok: true, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return {
      name,
      ok: false,
      error: (e?.name ? e.name + ": " : "") + (e?.message || String(e)),
      ms: Date.now() - t0
    };
  }
}

async function selfTest() {
  const results = [await probe("g.co", "https://g.co/"), await probe("accounts.google.com", "https://accounts.google.com/")];
  let rules = [];
  try {
    rules = await chrome.declarativeNetRequest.getDynamicRules();
  } catch {}
  return {
    ok: results.every((r) => r.ok),
    results,
    rules: rules.map((r) => r.id)
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const action = msg && msg.action;
  if (action === "spoof:set") {
    setSpoof(Boolean(msg.enabled))
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (action === "spoof:get") {
    getSpoof()
      .then((r) => sendResponse({ ok: true, ...r }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (action === "short:resolve") {
    resolveShort(msg.url)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (action === "sw:fetch") {
    swFetch(msg)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (action === "selftest") {
    selfTest()
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});
