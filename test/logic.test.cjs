const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

test("findBeginUrl unescapes HTML & JSON URLs", () => {
  const html = `"url":"https:\\/\\/accounts.google.com\\/devicephoneverification\\/begin?dsh=DSH123\\u0026tl=ADG-12345678&amp;hl=en"`;
  assert.equal(
    L.findBeginUrl(html),
    "https://accounts.google.com/devicephoneverification/begin?dsh=DSH123&tl=ADG-12345678&hl=en"
  );
});

test("parsePageData collects tl candidates and parses at/dsh", () => {
  const html = `{"SNlM0e":"AT_TOKEN_123456","Qzxixc":"DSH_999"}`;
  const res = L.parsePageData(
    html,
    "https://accounts.google.com/devicephoneverification/begin?dsh=DSH_URL&tl=TL_BEGIN_12345",
    "?TL=TL_PAGE_99999"
  );
  assert.equal(res.at, "AT_TOKEN_123456");
  assert.equal(res.dsh, "DSH_URL");
  assert.equal(res.tl, "TL_PAGE_99999");
  assert.equal(res.tlCandidates.length, 2);
  assert.equal(res.missing.length, 0);
});

test("interpretYd recognizes [3,null,4]", () => {
  const raw = `)]}'\n[["wrb.fr","YDtwf","[3,null,4]",null,null,null,"generic"]]`;
  const res = L.interpretYd(raw);
  assert.equal(res.ok, true);
  assert.equal(res.compact, "[3,null,4]");
});

test("buildSelectionUrl cleans authuser and duplicate idv_xdevice", () => {
  const href =
    "https://accounts.google.com/v3/signin/challenge/iap/qrcode?continue=" +
    encodeURIComponent("https://accounts.google.com/uplevelingstep/selection?TL=ABC&authuser&idv_xdevice=0");
  const next = new URL(L.buildSelectionUrl(href));
  assert.equal(next.pathname, "/uplevelingstep/selection");
  assert.equal(next.searchParams.get("authuser"), "0");
  assert.deepEqual(next.searchParams.getAll("idv_xdevice"), ["1"]);
});

test("classifyPage detects Vietnamese choice page", () => {
  const c = L.classifyPage({
    hostname: "accounts.google.com",
    pathname: "/uplevelingstep/selection",
    text: "Quét mã QR hoặc Xác minh số điện thoại của bạn"
  });
  assert.equal(c.kind, "choice");
});

test("redact masks sensitive tokens", () => {
  const out = L.redact("https://accounts.google.com/x?tl=ABCDEFGHIJK&at=1234567890");
  assert.ok(!out.includes("ABCDEFGHIJK"));
  assert.ok(!out.includes("1234567890"));
});
