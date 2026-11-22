(() => {
  // Chỉ giả lập navigator trên các trang đã chuyển hướng có ?idv_xdevice=1
  // Không thay đổi window.innerWidth / innerHeight để tránh Google Closure reset giao diện.
  if (!/[?&]idv_xdevice=1(&|$)/.test(location.search)) return;

  const IPAD_MINI_UA =
    "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";
  const IPAD_APP_VERSION =
    "5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1";

  const define = (key, value) => {
    try {
      Object.defineProperty(navigator, key, { get: () => value, configurable: true });
    } catch {}
  };

  define("userAgent", IPAD_MINI_UA);
  define("appVersion", IPAD_APP_VERSION);
  define("platform", "iPad");
  define("vendor", "Apple Computer, Inc.");
  define("maxTouchPoints", 5);
  define("userAgentData", undefined);
  define("standalone", false);
})();
