function injectBridge() {
  if (!window.__workTimerBridgeInitialized) {
    window.__workTimerBridgeInitialized = true;

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("web-accessible-resources/bridge.js");
    script.onload = () => {};
    document.documentElement.appendChild(script);
    console.log("bridge injected");
  }
}

async function initBridgeInjection() {
  const { urls = {} } = await chrome.storage.sync.get("urls");
  const assignments = urls.assignments?.trim();
  const workplace = urls.workplace?.trim();
  const currentUrl = window.location.href;
  const shouldRun =
    (assignments && currentUrl.includes(assignments)) ||
    (workplace && currentUrl.includes(workplace));

  if (!shouldRun) return;
  injectBridge();
}

initBridgeInjection();
