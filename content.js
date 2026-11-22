(() => {
  "use strict";

  const L = globalThis.QRHelperLogic;
  if (!L) return;

  const VERSION =
    (chrome.runtime && chrome.runtime.getManifest && chrome.runtime.getManifest().version) || "2.2.0";

  const kind = L.classifyPage({
    hostname: location.hostname,
    pathname: location.pathname,
    search: location.search,
    text: (document.body && document.body.innerText) || ""
  });

  if (kind.kind === "other") return;
  if (document.getElementById("gqsh-panel-host")) return;

  const logs = [];
  let t0 = Date.now();
  let running = false;
  let diag = "";

  function describe(e) {
    if (!e) return "Lỗi không xác định";
    if (e.name && e.message) return e.name + ": " + e.message;
    return String(e.message || e);
  }

  const CSS = `
    :host { all: initial; }
    .card {
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      font-size: 13px; color: #f8fafc; background: #1e293b; border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 12px 32px rgba(0,0,0,0.36); width: 320px; overflow: hidden;
      line-height: 1.45;
    }
    .hd {
      display:flex; align-items:center; gap:6px; padding:10px 12px;
      background: linear-gradient(135deg, #1a73e8, #1557b0);
      font-weight:700; font-size:13.5px; user-select:none; cursor:grab;
    }
    .hd:active { cursor:grabbing; }
    .hd .grow { flex:1; cursor:pointer; }
    .chip {
      font-size:11px; font-weight:700; padding:2px 8px; border-radius:999px;
      border:none; cursor:pointer;
    }
    .chip.on { background:#16a34a; color:#fff; }
    .chip.off { background:rgba(255,255,255,0.2); color:#fff; }
    .fold {
      background:rgba(255,255,255,0.16); border:none; color:#fff; cursor:pointer;
      font-size:13px; width:24px; height:24px; border-radius:6px; line-height:1;
    }
    .bd { padding: 10px 12px 12px; display:flex; flex-direction:column; gap:8px; }
    .bd.hidden { display:none; }
    .status {
      font-size:12px; color:#e2e8f0; word-break:break-word; min-height:32px;
      background:rgba(15,23,42,0.55); padding:8px 10px; border-radius:8px;
      border-left:3px solid #3b82f6;
    }
    .status.ok { color:#bbf7d0; border-left-color:#22c55e; }
    .status.warn { color:#fde68a; border-left-color:#f59e0b; }
    .status.err { color:#fecaca; border-left-color:#ef4444; }
    button.primary {
      background:#1a73e8; color:#fff; border:none; padding:9px 12px; border-radius:8px;
      font-weight:700; cursor:pointer; font-size:13px; transition:background .15s;
    }
    button.primary:hover:not(:disabled) { background:#1765cc; }
    button.primary:disabled { background:#334155; color:#94a3b8; cursor:default; }
    .row { display:flex; gap:6px; flex-wrap:wrap; }
    button.ghost {
      flex:1 1 auto; background:#334155; color:#e2e8f0; border:1px solid rgba(255,255,255,0.1);
      padding:6px 8px; border-radius:7px; cursor:pointer; font-size:11.5px; white-space:nowrap;
    }
    button.ghost:hover { background:#475569; }
    button.ghost.warn-btn { background:#7f1d1d; color:#fecaca; border-color:#991b1b; }
    button.ghost.warn-btn:hover { background:#991b1b; }
    label.chk {
      display:none; align-items:center; gap:6px; font-size:12px; color:#cbd5e1;
      cursor:pointer; user-select:none;
    }
    label.chk.show { display:flex; }
    input.manual {
      width:100%; box-sizing:border-box; border:1px solid #475569; border-radius:7px;
      padding:7px 9px; font-size:12px; font-family:inherit; display:none;
      background:#0f172a; color:#f8fafc;
    }
    input.manual.show { display:block; }
    pre.log {
      display:none; margin:0; max-height:150px; overflow:auto; background:#0b1120;
      border:1px solid #334155; border-radius:8px; padding:8px; font-size:11px;
      line-height:1.5; white-space:pre-wrap; word-break:break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    pre.log.show { display:block; }
    .log .err { color:#fca5a5; } .log .ok { color:#86efac; }
    .log .warn { color:#fcd34d; } .log .info { color:#93c5fd; }
  `;

  function createPanel() {
    const host = document.createElement("div");
    host.id = "gqsh-panel-host";
    host.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483647;";
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CSS;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="hd" title="Kéo để di chuyển • Bấm tiêu đề để mở/đóng nhật ký">
        <span>⚡</span>
        <span class="grow">Google QR → SMS <small style="opacity:.8">v${VERSION}</small></span>
        <button class="chip off" title="Bật/tắt giả lập iPad Mini">iPad: TẮT</button>
        <button class="fold" title="Thu gọn / Mở rộng">▾</button>
      </div>
      <div class="bd">
        <div class="status">Đang khởi tạo…</div>
        <button class="primary"></button>
        <label class="chk"><input type="checkbox" class="auto-chk" /> Tự động hạ cấp khi mở trang QR</label>
        <button class="ghost manual-toggle" style="display:none">Dán link QR / link xác minh thủ công</button>
        <input class="manual" placeholder="Dán https://g.co/verify/... hoặc devicephoneverification/begin?..." />
        <div class="row">
          <button class="ghost act-test" title="Kiểm tra kết nối tới g.co và accounts.google.com">Tự kiểm tra</button>
          <button class="ghost act-copy" title="Sao chép nhật ký chẩn đoán (đã ẩn token)">Sao chép log</button>
          <button class="ghost warn-btn act-restore" title="Tắt giả lập iPad và xóa rule DNR" style="display:none">Khôi phục máy tính</button>
        </div>
        <pre class="log"></pre>
      </div>
    `;

    shadow.append(style, card);
    (document.body || document.documentElement).appendChild(host);

    const q = (sel) => shadow.querySelector(sel);
    const hd = q(".hd");

    // Kéo thả khung nổi theo tiêu đề (bỏ qua khi bấm vào nút)
    let drag = null;
    hd.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("button")) return;
      const rect = host.getBoundingClientRect();
      drag = { dx: ev.clientX - rect.left, dy: ev.clientY - rect.top };
      hd.setPointerCapture(ev.pointerId);
    });
    hd.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const left = Math.max(8, Math.min(window.innerWidth - host.offsetWidth - 8, ev.clientX - drag.dx));
      const top = Math.max(8, Math.min(window.innerHeight - host.offsetHeight - 8, ev.clientY - drag.dy));
      host.style.left = left + "px";
      host.style.top = top + "px";
      host.style.right = "auto";
      host.style.bottom = "auto";
    });
    hd.addEventListener("pointerup", () => {
      drag = null;
    });

    q(".fold").addEventListener("click", () => {
      const bd = q(".bd");
      bd.classList.toggle("hidden");
      q(".fold").textContent = bd.classList.contains("hidden") ? "▸" : "▾";
    });

    return {
      host,
      statusEl: q(".status"),
      primary: q(".primary"),
      autoLabel: q(".chk"),
      autoChk: q(".auto-chk"),
      manual: q(".manual"),
      manualToggle: q(".manual-toggle"),
      logEl: q(".log"),
      restoreBtn: q(".act-restore"),
      spoofChip: q(".chip"),
      q
    };
  }

  const ui = createPanel();
  let currentSpoof = false;

  function setStatus(text, tone) {
    ui.statusEl.textContent = text;
    ui.statusEl.className = "status" + (tone ? " " + tone : "");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }

  function renderLog() {
    ui.logEl.innerHTML = logs
      .map((x) => `<span class="${x.level || "info"}">${String(x.at).padStart(5, " ")}ms  ${escapeHtml(x.msg)}</span>`)
      .join("\n");
    ui.logEl.scrollTop = ui.logEl.scrollHeight;
  }

  function log(level, msg) {
    logs.push({ at: Date.now() - t0, level, msg: L.redact(msg) });
    renderLog();
  }

  function renderSpoofState(enabled) {
    currentSpoof = Boolean(enabled);
    ui.spoofChip.textContent = currentSpoof ? "iPad: BẬT" : "iPad: TẮT";
    ui.spoofChip.className = "chip " + (currentSpoof ? "on" : "off");
    ui.restoreBtn.style.display = currentSpoof ? "block" : "none";
  }

  async function send(action, payload) {
    let res;
    try {
      res = await chrome.runtime.sendMessage({ action, ...(payload || {}) });
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/Extension context invalidated|Receiving end does not exist|message port closed/i.test(msg)) {
        throw new Error("Tiện ích vừa được tải lại. Hãy nhấn F5 làm mới trang này rồi thử lại.");
      }
      throw e;
    }
    if (!res) throw new Error("Service Worker chưa phản hồi.");
    return res;
  }

  async function setSpoof(enabled) {
    const r = await send("spoof:set", { enabled });
    if (!r.ok) throw new Error(r.error || "Không ghi được quy tắc giả lập");
    if (enabled && r.applied && r.applied.length < 4) {
      log("warn", "Chỉ áp dụng được " + r.applied.length + "/4 rule DNR");
    }
    renderSpoofState(r.enabled);
    return r;
  }

  async function step(label, fn, busyText) {
    if (busyText) setStatus(busyText, "info");
    const start = performance.now();
    log("info", "▶ " + label);
    try {
      const out = await fn();
      log("ok", "✓ " + label + " (" + Math.round(performance.now() - start) + "ms)");
      return out;
    } catch (e) {
      log("err", "✗ " + label + ": " + describe(e));
      throw e;
    }
  }

  function friendly(e) {
    const msg = String((e && e.message) || e);
    if (/Failed to fetch|NetworkError|Load failed|net::|Network request failed/i.test(msg)) {
      return "Kết nối mạng bị chặn (proxy / AdBlock / tên miền). Bấm «Tự kiểm tra» để xem cổng nào lỗi.";
    }
    if (/HTTP 4\d\d/.test(msg)) return "Google từ chối yêu cầu (tham số hết hạn) — hãy F5 trang QR rồi thử lại.";
    if (/HTTP 5\d\d/.test(msg)) return "Máy chủ Google đang lỗi tạm thời, thử lại sau 1 phút.";
    return msg;
  }

  // Mạng đồng nguồn trước (same-origin), chặn bởi CSP thì fallback qua background sw:fetch
  async function fetchWithTimeout(url, init, ms) {
    const ctrl = new AbortController();
    const budget = ms || 20000;
    const timer = setTimeout(() => ctrl.abort(), budget);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      if (e && e.name === "AbortError") throw new Error("Hết thời gian chờ (" + Math.round(budget / 1000) + "s)");
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  function isNetworkError(e) {
    if (!e) return false;
    const msg = String(e.message || e);
    return e instanceof TypeError || /Failed to fetch|NetworkError|Load failed|Network request failed/i.test(msg);
  }

  function fakeResponse(r) {
    return {
      ok: r.status >= 200 && r.status < 400,
      status: r.status,
      statusText: "",
      url: r.url || "",
      async text() {
        return r.text;
      }
    };
  }

  async function netFetch(url, init, ms) {
    try {
      return await fetchWithTimeout(url, init, ms);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      log("warn", "Fetch đồng nguồn lỗi (" + describe(e) + "), chuyển sang background...");
      const r = await send("sw:fetch", {
        url,
        method: (init && init.method) || "GET",
        headers: init && init.headers,
        body: init && init.body
      });
      if (!r.ok) throw new Error(describe(e) + " | Background: " + r.error);
      log("ok", "Background fetch thành công (HTTP " + r.status + ")");
      return fakeResponse(r);
    }
  }

  async function fetchBeginHtml(url) {
    const res = await netFetch(url, { credentials: "include", redirect: "follow", cache: "no-store" }, 20000);
    const html = await res.text();
    const finalUrl = res.url || url;
    log("info", "HTTP " + res.status + " · " + L.redact(finalUrl.split("?")[0]) + " · " + html.length + " bytes");

    if (res.status >= 400) throw new Error("HTTP " + res.status);
    if (/\/ServiceLogin|\/signin\/rejected|\/v3\/signin\/pwd|\/signin\/v2/i.test(finalUrl)) {
      throw new Error("Phiên đăng nhập Google đã hết hạn, vui lòng đăng nhập lại.");
    }
    if (/<title>\s*(Sign in|Đăng nhập)/i.test(html) && /identifierId/.test(html)) {
      throw new Error("Chưa đăng nhập tài khoản Google trong trình duyệt này.");
    }
    return { html, finalUrl, status: res.status };
  }

  async function callRpc(rpcid, payload, sourcePath, tl, at) {
    const url = L.buildRpcUrl({ rpcid, sourcePath, tl, hl: "en" });
    const body = L.buildRpcBody({ rpcid, payload, at });
    const res = await netFetch(
      url,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body
      },
      25000
    );
    const text = await res.text();
    if (!res.ok) throw new Error("HTTP " + res.status + ": " + text.slice(0, 120));
    return text;
  }

  async function drawSvgToCanvas(svgEl) {
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || svgEl.clientWidth || 300;
      c.height = img.naturalHeight || svgEl.clientHeight || 300;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function decodeQr() {
    if (!("BarcodeDetector" in window)) {
      log("info", "Trình duyệt không hỗ trợ BarcodeDetector, chuyển sang quét HTML");
      return null;
    }
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const els = Array.from(document.querySelectorAll("img, canvas, svg"));
      for (const el of els) {
        const w = el.naturalWidth || el.clientWidth;
        const h = el.naturalHeight || el.clientHeight;
        if (!w || !h || w < 80 || h < 80) continue;
        try {
          let c;
          if (el.tagName.toLowerCase() === "svg") {
            c = await drawSvgToCanvas(el);
          } else {
            if (el.tagName.toLowerCase() === "img" && !el.complete) {
              await el.decode().catch(() => {});
            }
            c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(el, 0, 0, w, h);
          }
          const codes = await detector.detect(c);
          if (codes && codes.length && codes[0].rawValue) {
            log("ok", "Đã giải mã hình ảnh QR");
            return codes[0].rawValue;
          }
        } catch {}
      }
    } catch (e) {
      log("warn", "BarcodeDetector lỗi: " + describe(e));
    }
    return null;
  }

  async function resolveTarget() {
    const manual = (ui.manual.value || "").trim();
    if (manual) {
      if (!/^https?:\/\//i.test(manual)) throw new Error("Link dán thủ công phải bắt đầu bằng https://");
      log("info", "Dùng link QR đã dán thủ công");
      return manual;
    }

    // Ưu tiên link begin nhúng sẵn trong HTML (đỡ 1 vòng redirect qua g.co)
    const fromQr = await decodeQr();
    if (fromQr) return fromQr;

    const begin = L.findBeginUrl(document.documentElement.innerHTML);
    if (begin) {
      log("ok", "Tìm thấy link devicephoneverification trực tiếp trong trang");
      return begin;
    }

    const short =
      L.findShortUrl((document.body && document.body.innerText) || "") ||
      L.findShortUrl(document.documentElement.innerHTML);
    if (short) {
      log("warn", "Trang chỉ có link rút gọn g.co, sẽ giải mã qua background");
      return short;
    }

    ui.manual.classList.add("show");
    ui.manualToggle.style.display = "none";
    throw new Error("Không tìm thấy mã QR trên trang. Hãy đợi ảnh QR hiện lên hoặc dán link thủ công.");
  }

  async function ensureBeginUrl(target) {
    let u;
    try {
      u = new URL(target);
    } catch {
      throw new Error("Nội dung QR không phải URL hợp lệ");
    }

    if (u.hostname === "accounts.google.com" && /\/devicephoneverification\/(begin|initiate)/.test(u.pathname)) {
      return target;
    }
    if (u.hostname === "g.co" && /\/verify\//.test(u.pathname)) {
      log("info", "Đang giải mã link g.co/verify...");
      const r = await send("short:resolve", { url: target });
      if (!r.ok) throw new Error(r.error || "Giải mã link rút gọn thất bại");
      log("ok", "Đã giải mã link ngắn (" + (r.via || "?") + ")");
      return r.url;
    }
    if (u.hostname === "accounts.google.com") {
      const samePage = u.origin === location.origin && u.pathname === location.pathname;
      const html = samePage ? document.documentElement.innerHTML : (await fetchBeginHtml(target)).html;
      const begin = L.findBeginUrl(html);
      if (begin) return begin;
      throw new Error("Trang này không chứa link devicephoneverification/begin");
    }
    throw new Error("Tên miền không được hỗ trợ: " + u.hostname);
  }

  async function tryTlCandidates(data) {
    const list = (data.tlCandidates || []).slice(0, 4);
    let last = null;

    for (let i = 0; i < list.length; i++) {
      const cand = list[i];
      log("info", `Thử tl[${i + 1}/${list.length}] từ ${cand.source} (len=${cand.value.length})`);
      try {
        const mypx = await callRpc(
          "MypxBd",
          [cand.value, data.dsh, false, null, null, false, null, null, "browser"],
          "/devicephoneverification/initiate",
          cand.value,
          data.at
        );
        log("info", "MypxBd phản hồi " + mypx.length + " bytes");

        const consentUrl = L.buildConsentUrl({ dsh: data.dsh, tl: cand.value });
        const res = await netFetch(consentUrl, { credentials: "include", redirect: "follow", cache: "no-store" }, 20000);
        const consentText = await res.text();
        const rid = L.parseUuid(consentText);
        if (!rid) throw new Error("Trang consent không có UUID (HTTP " + res.status + ")");

        const ydText = await callRpc(
          "YDtwf",
          [null, rid, data.dsh, 7, null, cand.value, false],
          "/devicephoneverification/modacintro",
          cand.value,
          data.at
        );
        const verdict = L.interpretYd(ydText);
        last = verdict;
        log("info", `YDtwf (${cand.source}): ${verdict.compact || verdict.reason || "không rõ"}`);

        if (verdict.ok) {
          log("ok", "Khớp tl từ " + cand.source);
          return { ok: true, verdict, source: cand.source };
        }
      } catch (e) {
        log("warn", `tl[${cand.source}] lỗi: ${describe(e)}`);
      }
    }
    return { ok: false, verdict: last };
  }

  async function runDowngrade() {
    if (running) return;
    running = true;
    logs.length = 0;
    t0 = Date.now();
    ui.primary.disabled = true;

    try {
      await step("Bật giả lập iPad/iPhone cho luồng hạ cấp", () => setSpoof(true));

      const target = await step("Đọc mã QR / link xác minh", resolveTarget, "① Đang quét mã QR…");
      const beginUrl = await step("Lấy điểm vào devicephoneverification", () => ensureBeginUrl(target));
      const page = await step("Tải trang xác minh thiết bị", () => fetchBeginHtml(beginUrl), "② Đang tải dữ liệu phiên…");

      const data = await step(
        "Trích xuất token (at / dsh / tl)",
        async () => {
          const d = L.parsePageData(page.html, page.finalUrl, location.search);
          diag = L.buildPageDiagnostics(page.html, page.finalUrl, location.search, d);
          if (d.missing.length) {
            throw new Error("Thiếu tham số: " + d.missing.join(", "));
          }
          log("info", `Nguồn: at←${d.sources.at} · dsh←${d.sources.dsh} · ${d.tlCandidates.length} ứng viên tl`);
          return d;
        },
        "③ Đang trích xuất tham số…"
      );

      const outcome = await step("Gửi trạng thái fallback [3,null,4]", () => tryTlCandidates(data), "④ Đang hạ cấp sang SMS…");
      if (!outcome.ok) {
        const why = outcome.verdict ? outcome.verdict.compact || outcome.verdict.reason : "Tất cả ứng viên tl đều thất bại";
        setStatus("⚠️ Chưa hạ cấp được: " + why + ". Hãy thử lại hoặc bấm «Sao chép log».", "warn");
        ui.logEl.classList.add("show");
        ui.primary.disabled = false;
        ui.primary.textContent = "Thử hạ cấp lại";
        return;
      }

      const next = L.buildSelectionUrl(location.href);
      setStatus("✅ Thành công! Đang chuyển sang trang chọn SMS…", "ok");
      log("ok", "Chuyển hướng: " + L.redact(next.split("?")[0]));
      await chrome.storage.local.set({ lastAttempt: { ts: Date.now(), targetUrl: next } }).catch(() => {});
      setTimeout(() => location.replace(next), 350);
    } catch (e) {
      setStatus("❌ " + friendly(e), "err");
      ui.logEl.classList.add("show");
      ui.primary.disabled = false;
      ui.primary.textContent = "Thử hạ cấp lại";
    } finally {
      running = false;
    }
  }

  /* ================================================================ *
   * Hỗ trợ Cloud Console & Trang chọn phương thức SĐT
   * ================================================================ */

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  function clickEl(el) {
    try {
      ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach((type) => {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 }));
      });
    } catch {}
    el.click();
  }

  function labelOf(el) {
    return [
      el.getAttribute && (el.getAttribute("aria-label") || ""),
      el.getAttribute && (el.getAttribute("title") || ""),
      el.getAttribute && (el.getAttribute("data-tooltip") || ""),
      el.textContent || ""
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function findAllClickables() {
    return Array.from(document.querySelectorAll('button, [role="button"], a, [tabindex]:not([tabindex="-1"])'));
  }

  function findCloudShellButton() {
    const selectors = [
      'button[aria-label*="Cloud Shell" i]',
      '[role="button"][aria-label*="Cloud Shell" i]',
      'button[mattooltip*="Cloud Shell" i]',
      '[aria-label*="Activate Cloud Shell" i]',
      'a[href*="cloudshell" i]',
      '[title*="Cloud Shell" i]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return findAllClickables().find((el) => isVisible(el) && /cloud\s*shell/i.test(labelOf(el))) || null;
  }

  function findVerifyButton() {
    const scopes = [
      document.querySelector('[role="dialog"]'),
      document.querySelector("mat-dialog-container"),
      document.querySelector(".cdk-overlay-container"),
      document
    ].filter(Boolean);

    for (const scope of scopes) {
      const hit = Array.from(scope.querySelectorAll('button, a, [role="button"]')).find((el) => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || "").trim();
        return /^(verify|xác minh|xác minh tài khoản|验证|验证身份|确认)$/i.test(t);
      });
      if (hit) return hit;
    }

    return (
      findAllClickables().find((el) => {
        if (!isVisible(el)) return false;
        const lbl = labelOf(el);
        return lbl && lbl.length <= 60 && /\bverify\b|xác minh|验证/i.test(lbl);
      }) || null
    );
  }

  function waitFor(getter, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      const tick = () => {
        const el = getter();
        if (el) return resolve(el);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(tick, 350);
      };
      tick();
    });
  }

  async function startCloudShellVerify() {
    ui.primary.disabled = true;
    try {
      setStatus("Đang tìm nút Cloud Shell [>_]…", "info");
      const shellBtn = await waitFor(findCloudShellButton, 8000);
      if (!shellBtn) {
        setStatus("⚠️ Không tìm thấy nút [>_]. Hãy bấm thủ công icon Cloud Shell ở góc trên phải.", "warn");
        return;
      }
      clickEl(shellBtn);
      log("ok", "Đã bấm icon Cloud Shell");

      setStatus("Đang chờ nút Verify / Xác minh ở khung dưới…", "info");
      const verifyBtn = await waitFor(findVerifyButton, 18000);
      if (!verifyBtn) {
        setStatus("⚠️ Chưa thấy nút Verify. Nếu bảng dưới hiện nút Verify/Xác minh, hãy bấm thủ công.", "warn");
        return;
      }
      clickEl(verifyBtn);
      log("ok", "Đã bấm nút Verify / Xác minh");
      setStatus("✅ Đã bấm Verify, trang mã QR sẽ mở ngay.", "ok");
    } finally {
      ui.primary.disabled = false;
    }
  }

  function findPhoneOption() {
    const nodes = Array.from(document.querySelectorAll('[role="button"], button, li, a'));
    return (
      nodes.find((el) => {
        if (!isVisible(el)) return false;
        const t = (el.textContent || "").trim();
        return (
          t.length <= 120 &&
          /verify your phone number|use your phone number|xác minh số điện thoại|dùng số điện thoại|电话号码|手机号码/i.test(t)
        );
      }) || null
    );
  }

  async function pickPhoneOption() {
    ui.primary.disabled = true;
    try {
      const el = findPhoneOption();
      if (!el) {
        setStatus("⚠️ Không tìm thấy tùy chọn SĐT, hãy bấm thủ công mục số điện thoại trên trang.", "warn");
        return;
      }
      clickEl(el);
      log("ok", "Đã chọn phương thức xác minh qua SĐT");
      setStatus("✅ Đã chọn SĐT, nhập số điện thoại để nhận mã 6 số.", "ok");
    } finally {
      ui.primary.disabled = false;
    }
  }

  /* ================================================================ *
   * Tự kiểm tra / Sao chép log / Khôi phục
   * ================================================================ */

  async function runSelfTest() {
    setStatus("Đang tự kiểm tra kết nối…", "info");
    try {
      const pageProbe = await fetchWithTimeout(
        location.origin + "/generate_204",
        { credentials: "include", cache: "no-store" },
        8000
      )
        .then((r) => "Trang → accounts: HTTP " + r.status)
        .catch((e) => "Trang → accounts: ❌ " + describe(e));
      log(/❌/.test(pageProbe) ? "err" : "ok", pageProbe);

      const r = await send("selftest");
      let hasErr = /❌/.test(pageProbe);
      (r.results || []).forEach((x) => {
        const line = `Background → ${x.name}: ${x.ok ? "HTTP " + x.status + " (" + x.ms + "ms)" : "❌ " + x.error}`;
        if (!x.ok) hasErr = true;
        log(x.ok ? "ok" : "err", line);
      });
      log("info", "DNR rule đang bật: " + ((r.rules || []).join(",") || "(trống)"));
      ui.logEl.classList.add("show");
      setStatus(hasErr ? "⚠️ Có cổng kết nối bị lỗi, xem nhật ký bên dưới." : "✅ Kết nối bình thường trên mọi cổng.", hasErr ? "warn" : "ok");
    } catch (e) {
      setStatus("❌ Tự kiểm tra lỗi: " + describe(e), "err");
    }
  }

  async function copyReport() {
    const report = [
      `Google QR → SMS v${VERSION} (Báo cáo chẩn đoán)`,
      `Thời gian: ${new Date().toISOString()}`,
      `Trang: ${location.origin}${location.pathname}`,
      `Loại trang: ${kind.kind} (${kind.reason})`,
      `UA: ${navigator.userAgent}`,
      "--- Nhật ký ---",
      ...logs.map((x) => `${String(x.at).padStart(5, " ")}ms [${x.level}] ${x.msg}`),
      "--- Chẩn đoán trang ---",
      diag || "(Chưa chạy hạ cấp)"
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
      setStatus("✅ Đã sao chép log (đã ẩn token nhạy cảm).", "ok");
    } catch {
      setStatus("⚠️ Không sao chép được tự động, xem ở khung log bên dưới.", "warn");
    }
    ui.logEl.classList.add("show");
  }

  async function restoreDesktop() {
    try {
      await setSpoof(false);
      setStatus("✅ Đã khôi phục trình duyệt máy tính bình thường.", "ok");
      log("ok", "Đã tắt giả lập iPad và xóa các rule DNR");
    } catch (e) {
      setStatus("❌ Khôi phục thất bại: " + describe(e), "err");
    }
  }

  ui.q(".act-test").addEventListener("click", runSelfTest);
  ui.q(".act-copy").addEventListener("click", copyReport);
  ui.restoreBtn.addEventListener("click", restoreDesktop);
  ui.q(".grow").addEventListener("click", () => ui.logEl.classList.toggle("show"));

  ui.spoofChip.addEventListener("click", async () => {
    try {
      await setSpoof(!currentSpoof);
    } catch (e) {
      setStatus("❌ " + describe(e), "err");
    }
  });

  if (kind.kind === "cloud-console") {
    setStatus("Bước 1: Bấm nút bên dưới để mở Cloud Shell [>_] và nhấn Verify / Xác minh.", "info");
    ui.primary.textContent = "① Tự động mở Cloud Shell & Verify";
    ui.primary.addEventListener("click", startCloudShellVerify);
  } else if (kind.kind === "qr") {
    setStatus("Đã nhận diện trang QR. Bấm nút bên dưới để chuyển sang chọn SMS 6 số.", "info");
    ui.primary.textContent = "⚡ Hạ cấp sang xác minh SMS";
    ui.autoLabel.classList.add("show");
    ui.manualToggle.style.display = "block";
    ui.manualToggle.addEventListener("click", () => {
      ui.manual.classList.add("show");
      ui.manual.focus();
      ui.manualToggle.style.display = "none";
    });
    ui.autoChk.addEventListener("change", () => {
      chrome.storage.local.set({ autoDowngrade: ui.autoChk.checked }).catch(() => {});
    });
    ui.primary.addEventListener("click", runDowngrade);
  } else if (kind.kind === "choice") {
    setStatus("Trang này đã có sẵn mục xác minh qua SĐT, bấm để chọn nhanh.", "ok");
    ui.primary.textContent = '📱 Chọn "Xác minh số điện thoại"';
    ui.primary.addEventListener("click", pickPhoneOption);
  } else if (kind.kind === "selection") {
    setStatus("Chọn Text message (SMS) → nhập SĐT → nhập mã 6 số. Xong hãy bấm Khôi phục máy tính.", "info");
    ui.primary.textContent = "Kiểm tra trạng thái giả lập";
    ui.primary.addEventListener("click", async () => {
      try {
        const r = await send("spoof:get");
        renderSpoofState(r.enabled);
        setStatus(
          r.enabled
            ? `Đang giả lập iPad Mini (tự tắt sau ${r.remainingMinutes || r.ttlMinutes} phút).`
            : "Đang ở chế độ máy tính bình thường (đã tắt giả lập).",
          r.enabled ? "ok" : "info"
        );
      } catch (e) {
        setStatus("❌ " + describe(e), "err");
      }
    });
  }

  // Khởi tạo trạng thái + phát hiện Google đẩy ngược về QR + Auto-downgrade
  send("spoof:get")
    .then(async (r) => {
      if (!r?.ok) return;
      renderSpoofState(r.enabled);
      ui.autoChk.checked = Boolean(r.autoDowngrade);

      if (kind.kind === "qr") {
        const st = await chrome.storage.local.get("lastAttempt").catch(() => ({}));
        if (st?.lastAttempt && Date.now() - st.lastAttempt.ts < 15000) {
          await chrome.storage.local.remove("lastAttempt").catch(() => {});
          setStatus(
            "⚠️ Google vừa đẩy ngược về trang QR. Hãy bấm «Khôi phục máy tính», nhấn F5 hoặc đi lại từ Cloud Shell [>_] → Verify.",
            "warn"
          );
          return;
        }
        if (r.autoDowngrade) {
          setStatus("Đang bật Tự động hạ cấp, chờ mã QR hiển thị…", "info");
          setTimeout(() => runDowngrade(), 800);
        }
      }
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.spoofEnabled) {
      renderSpoofState(changes.spoofEnabled.newValue);
    }
  });

  log("info", `Sẵn sàng · Trang=${kind.kind} · v${VERSION}`);
})();
