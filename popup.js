const spoofBadge = document.getElementById("spoofBadge");
const spoofSub = document.getElementById("spoofSub");
const toggleSpoofBtn = document.getElementById("toggleSpoofBtn");
const autoDowngradeChk = document.getElementById("autoDowngradeChk");
const openConsoleBtn = document.getElementById("openConsoleBtn");

let spoofEnabled = false;

function render(state) {
  spoofEnabled = Boolean(state.enabled ?? state.spoofEnabled);
  if (spoofEnabled) {
    const mins = state.remainingMinutes || state.ttlMinutes || 30;
    spoofBadge.textContent = "iPad: BẬT";
    spoofBadge.className = "badge on";
    spoofSub.textContent = `Đang bật giả lập (tự khôi phục máy tính sau ~${mins} phút).`;
    toggleSpoofBtn.textContent = "Khôi phục máy tính (Tắt Spoof)";
    toggleSpoofBtn.className = "btn-secondary";
  } else {
    spoofBadge.textContent = "iPad: TẮT";
    spoofBadge.className = "badge off";
    spoofSub.textContent = "Chỉ áp dụng cho 4 đường dẫn xác minh SMS, tự động bật khi bấm hạ cấp QR.";
    toggleSpoofBtn.textContent = "Bật giả lập iPad Mini";
    toggleSpoofBtn.className = "btn-primary";
  }
  if (typeof state.autoDowngrade === "boolean") {
    autoDowngradeChk.checked = state.autoDowngrade;
  }
}

chrome.runtime.sendMessage({ action: "spoof:get" }, (res) => {
  if (res?.ok) render(res);
});

toggleSpoofBtn.onclick = () => {
  chrome.runtime.sendMessage({ action: "spoof:set", enabled: !spoofEnabled }, (res) => {
    if (res?.ok) render({ ...res, autoDowngrade: autoDowngradeChk.checked });
  });
};

autoDowngradeChk.onchange = () => {
  chrome.storage.local.set({ autoDowngrade: autoDowngradeChk.checked });
};

openConsoleBtn.onclick = () => {
  chrome.tabs.create({ url: "https://console.cloud.google.com/" });
};
