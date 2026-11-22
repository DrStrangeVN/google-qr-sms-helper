/*
 * logic.js — Tầng xử lý thuần (không phụ thuộc DOM / chrome.*)
 * Kết hợp các bản vá tương thích từ havenicec/google-qr-sms-helper & CyanQX/google-qr-downgrade
 */
(function (root) {
  "use strict";

  const UNESCAPE_RULES = [
    [/\\u0026/gi, "&"],
    [/\\u002F/gi, "/"],
    [/\\u003D/gi, "="],
    [/\\u003F/gi, "?"],
    [/\\x26/gi, "&"],
    [/\\x2F/gi, "/"],
    [/\\x3D/gi, "="],
    [/\\\//g, "/"],
    [/&amp;/gi, "&"],
    [/&#0*38;/g, "&"],
    [/&quot;/gi, '"'],
    [/&#0*39;/g, "'"]
  ];

  function unescapeEmbeddedUrl(raw) {
    if (!raw) return "";
    let s = String(raw);
    for (let i = 0; i < UNESCAPE_RULES.length; i++) {
      s = s.replace(UNESCAPE_RULES[i][0], UNESCAPE_RULES[i][1]);
    }
    const cut = s.search(/["'<>\s\\]/);
    if (cut >= 0) s = s.slice(0, cut);
    return s.trim();
  }

  function normalizeHtml(html) {
    if (!html) return "";
    return String(html)
      .replace(/\\\//g, "/")
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003d/gi, "=")
      .replace(/\\u003f/gi, "?")
      .replace(/&amp;/gi, "&");
  }

  const BEGIN_RE = /https:\/\/accounts\.google\.com\/devicephoneverification\/(?:begin|initiate)\?[^\s"'<>\\]+/i;
  const SHORT_RE = /\b(?:https?:\/\/)?g\.co\/verify\/[A-Za-z0-9_-]{4,}/i;

  function findBeginUrl(html) {
    if (!html) return null;
    const normalized = normalizeHtml(html);
    const m = normalized.match(BEGIN_RE);
    if (!m) return null;
    const url = unescapeEmbeddedUrl(m[0]);
    return /^https:\/\/accounts\.google\.com\/devicephoneverification\/(?:begin|initiate)\?/i.test(url) ? url : null;
  }

  function findShortUrl(text) {
    if (!text) return null;
    const m = String(text).match(SHORT_RE);
    if (!m) return null;
    return m[0].startsWith("http") ? m[0] : "https://" + m[0];
  }

  function readJsonString(html, key) {
    if (!html) return null;
    const re = new RegExp('"' + key + '"\\s*:\\s*"([^"\\\\]{1,2048})"');
    const m = String(html).match(re);
    return m ? m[1] : null;
  }

  function parseUrlParams(url) {
    const out = {};
    try {
      const u = new URL(url);
      u.searchParams.forEach((v, k) => {
        if (!(k in out)) out[k] = v;
      });
    } catch {}
    return out;
  }

  function parseUrlParamsFromQuery(query) {
    const out = {};
    const q = String(query || "").replace(/^\?/, "");
    if (!q) return out;
    try {
      new URLSearchParams(q).forEach((v, k) => {
        if (!(k in out)) out[k] = v;
      });
    } catch {}
    return out;
  }

  function describeQuery(query) {
    const names = Object.keys(parseUrlParamsFromQuery(query)).sort();
    return names.length ? names.join(",") : "(không có tham số)";
  }

  function collectTlCandidates(html, beginUrl, pageQuery) {
    const out = [];
    const seen = new Set();
    const push = (value, source) => {
      const v = typeof value === "string" ? value.trim() : "";
      if (!v || v.length < 8 || v.length > 4096) return;
      if (/:\/\//.test(v)) return;
      if (!/^[A-Za-z0-9_\-.~%+=]+$/.test(v)) return;
      if (seen.has(v)) return;
      seen.add(v);
      out.push({ value: v, source });
    };

    const pageParams = parseUrlParamsFromQuery(pageQuery);
    push(pageParams.TL || pageParams.tl, "page:TL");

    if (pageParams.continue) {
      const cont = parseUrlParams(pageParams.continue);
      push(cont.TL || cont.tl, "continue:TL");
    }

    const beginParams = parseUrlParams(beginUrl || "");
    push(beginParams.tl || beginParams.TL, "begin:tl");

    const h = String(html || "");
    const ds0 = h.match(/key:\s*['"]ds:0['"][^}]*?data:\s*\[\s*"([^"]+)"/);
    if (ds0) push(ds0[1], "html:ds:0");

    const adg = h.match(/\bADG-[A-Za-z0-9_-]{8,}/);
    if (adg) push(adg[0], "html:ADG");

    const quoted = h.match(/["']tl["']\s*:\s*["']([A-Za-z0-9_\-.]{8,})["']/i);
    if (quoted) push(quoted[1], "html:tl-key");

    return out;
  }

  function parsePageData(html, beginUrl, pageQuery) {
    const params = parseUrlParams(beginUrl || "");
    const sources = {};

    let at = readJsonString(html, "SNlM0e");
    if (at) sources.at = "html:SNlM0e";
    if (!at) {
      const m = String(html || "").match(/data-at="([^"]{8,})"/i);
      if (m) {
        at = m[1];
        sources.at = "html:data-at";
      }
    }

    let dsh = params.dsh || params.DSH || null;
    if (dsh) sources.dsh = "url:dsh";
    if (!dsh) {
      dsh = readJsonString(html, "Qzxixc");
      if (dsh) sources.dsh = "html:Qzxixc";
    }
    if (!dsh) {
      const m = String(html || "").match(/[?&]dsh=([A-Za-z0-9_\-%.]{6,})/);
      if (m) {
        dsh = decodeURIComponent(m[1]);
        sources.dsh = "html:query";
      }
    }

    const tlCandidates = collectTlCandidates(html, beginUrl, pageQuery);
    const tl = tlCandidates.length ? tlCandidates[0].value : null;
    if (tl) sources.tl = tlCandidates[0].source;

    const missing = [];
    if (!at) missing.push("at(SNlM0e)");
    if (!dsh) missing.push("dsh(Qzxixc)");
    if (!tlCandidates.length) missing.push("tl");

    return { at, dsh, tl, tlCandidates, sources, missing };
  }

  function buildRpcUrl(opts) {
    const o = opts || {};
    const path = encodeURIComponent(o.sourcePath || "/devicephoneverification/initiate");
    const params = [
      "rpcids=" + encodeURIComponent(o.rpcid),
      "source-path=" + path,
      "hl=" + encodeURIComponent(o.hl || "en"),
      "tl=" + encodeURIComponent(o.tl || ""),
      "rt=c"
    ];
    if (o.reqId) params.push("f.sid=" + encodeURIComponent(o.reqId));
    return "https://accounts.google.com/devicephoneverification/_/DevicePhoneVerificationUi/data/batchexecute?" + params.join("&");
  }

  function buildRpcBody(opts) {
    const o = opts || {};
    const inner = JSON.stringify([[o.rpcid, JSON.stringify(o.payload), null, "generic"]]);
    return new URLSearchParams({ "f.req": inner, at: o.at || "" }).toString();
  }

  function buildConsentUrl(opts) {
    const o = opts || {};
    return (
      "https://accounts.google.com/devicephoneverification/consent?flow=browser&plt&dsh=" +
      encodeURIComponent(o.dsh || "") +
      "&hl=" +
      encodeURIComponent(o.hl || "en") +
      "&tl=" +
      encodeURIComponent(o.tl || "")
    );
  }

  function extractRpcResult(text, rpcid) {
    if (!text) return null;
    const s = String(text);
    const re = new RegExp('"wrb\\.fr"\\s*,\\s*"' + rpcid + '"\\s*,\\s*"((?:[^"\\\\]|\\\\.)*)"');
    const m = s.match(re);
    if (!m) return null;
    try {
      return JSON.parse('"' + m[1] + '"');
    } catch {
      return m[1];
    }
  }

  function parseInnerArray(inner) {
    if (!inner) return null;
    try {
      const arr = JSON.parse(inner);
      return Array.isArray(arr) ? arr : null;
    } catch {
      return null;
    }
  }

  function interpretYd(text, rpcid) {
    const id = rpcid || "YDtwf";
    const raw = String(text || "");
    const inner = extractRpcResult(raw, id);
    const arr = parseInnerArray(inner);
    if (arr) {
      const compact = JSON.stringify(arr).replace(/\s+/g, "");
      return {
        ok: compact === "[3,null,4]" || (arr[0] === 3 && arr[2] === 4),
        state: arr,
        compact,
        inner,
        reason: "",
        raw
      };
    }
    let reason = "Phản hồi không chứa kết quả " + id;
    if (/<html/i.test(raw)) reason = "Máy chủ trả về HTML (phiên đăng nhập hoặc tham số đã hết hạn)";
    else if (/"er"\s*:\s*"/.test(raw)) reason = "Máy chủ trả về mã lỗi (hãy tải lại trang QR rồi thử lại)";
    return { ok: false, state: null, compact: "", inner: inner || "", reason, raw };
  }

  function parseUuid(text) {
    if (!text) return null;
    const m = String(text).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : null;
  }

  function buildSelectionUrl(pageHref) {
    const href = String(pageHref || "");
    let cont = "";
    try {
      cont = new URL(href).searchParams.get("continue") || "";
    } catch {
      cont = "";
    }

    const isUpLeveling = /^https:\/\/accounts\.google\.com\/uplevelingstep\//i.test(cont.trim());
    if (isUpLeveling) {
      try {
        const u = new URL(cont.trim());
        u.searchParams.delete("idv_xdevice");
        if (!u.searchParams.get("authuser")) u.searchParams.set("authuser", "0");
        u.searchParams.set("idv_xdevice", "1");
        return u.toString();
      } catch {}
    }

    try {
      const u = new URL(href);
      u.pathname = u.pathname.replace(/\/challenge\/iap\/qrcode\/?$/i, "/challenge/iap");
      u.searchParams.delete("idv_xdevice");
      u.searchParams.set("idv_xdevice", "1");
      return u.toString();
    } catch {
      return href.replace("/challenge/iap/qrcode", "/challenge/iap") + "&idv_xdevice=1";
    }
  }

  function classifyPage(page) {
    const p = page || {};
    const host = String(p.hostname || "");
    const path = String(p.pathname || "");
    const text = String(p.text || "");

    if (host === "console.cloud.google.com") return { kind: "cloud-console", reason: "Google Cloud Console" };
    if (/\/challenge\/iap\/qrcode/i.test(path)) return { kind: "qr", reason: "Trang mã QR xác minh" };

    const hasQr = /scan (the )?qr code|quét mã qr|quét qr|扫描二维码|扫描 QR/i.test(text);
    const hasPhone =
      /verify your phone number|use your phone number|phone number|xác minh số điện thoại|số điện thoại của bạn|电话号码|手机号码/i.test(
        text
      );

    if (/\/uplevelingstep\//i.test(path)) {
      if (hasQr && hasPhone) return { kind: "choice", reason: "Trang chọn phương thức (có sẵn SĐT)" };
      return { kind: "selection", reason: "Trang chọn/nhập SMS" };
    }

    if (hasQr && hasPhone) return { kind: "choice", reason: "Trang chọn phương thức (có sẵn SĐT)" };
    if (/\/challenge\/iap/i.test(path)) return { kind: "selection", reason: "Trang xác minh IAP" };

    return { kind: "other", reason: "Trang ngoài phạm vi" };
  }

  const SENSITIVE_KEYS = /(^|[?&\s])(at|dsh|tl|f\.sid|SNlM0e|Qzxixc|continue|sarp|scc)=([^&\s]*)/gi;

  function redact(input) {
    let s = String(input == null ? "" : input);
    s = s.replace(SENSITIVE_KEYS, function (all, lead, key, val) {
      const v = String(val);
      if (v.length <= 6) return lead + key + "=" + v;
      return lead + key + "=" + v.slice(0, 3) + "***" + v.slice(-2);
    });
    s = s.replace(/\bADG-[A-Za-z0-9_-]{8,}/g, "ADG-***");
    return s;
  }

  function snippet(h, idx, before, after) {
    const from = Math.max(0, idx - before);
    const to = Math.min(h.length, idx + after);
    return h.slice(from, to).replace(/\s+/g, " ");
  }

  function buildPageDiagnostics(html, finalUrl, pageQuery, data) {
    const h = String(html || "");
    const lines = [];
    lines.push("Tham số URL đích: " + describeQuery(String(finalUrl || "").split("?")[1] || ""));
    lines.push("Tham số trang QR: " + describeQuery(pageQuery));
    lines.push("ds:0=" + (/key:\s*['"]ds:0['"]/.test(h) ? "có" : "không") + "  ADG-=" + (/\bADG-/.test(h) ? "có" : "không"));
    lines.push("WIZ_global_data=" + (h.indexOf("WIZ_global_data") >= 0 ? "có" : "không"));

    if (data && data.tlCandidates) {
      lines.push(
        "Ứng viên tl (" +
          data.tlCandidates.length +
          "): " +
          data.tlCandidates.map((c) => c.source + "/len" + c.value.length).join(", ")
      );
    }

    const needles = ["source-path", "&tl=", "batchexecute"];
    let shown = 0;
    for (const needle of needles) {
      let idx = h.indexOf(needle);
      let count = 0;
      while (idx >= 0 && count < 2 && shown < 6) {
        lines.push("JS[" + needle + "] " + snippet(h, idx, 80, 120));
        idx = h.indexOf(needle, idx + needle.length);
        count++;
        shown++;
      }
    }
    return lines.join("\n").slice(0, 4500);
  }

  const api = {
    unescapeEmbeddedUrl,
    normalizeHtml,
    findBeginUrl,
    findShortUrl,
    readJsonString,
    parseUrlParams,
    parseUrlParamsFromQuery,
    describeQuery,
    collectTlCandidates,
    buildPageDiagnostics,
    parsePageData,
    buildRpcUrl,
    buildRpcBody,
    buildConsentUrl,
    extractRpcResult,
    parseInnerArray,
    interpretYd,
    parseUuid,
    buildSelectionUrl,
    classifyPage,
    redact
  };

  root.QRHelperLogic = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
