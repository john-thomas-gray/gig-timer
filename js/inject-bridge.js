function injectBridge() {
  if (!window.__workTimerBridgeInitialized) {
    window.__workTimerBridgeInitialized = true;

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("js/bridge.js");
    script.onload = () => {};
    document.documentElement.appendChild(script);
  }
}

injectBridge();
