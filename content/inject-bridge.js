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

injectBridge();
