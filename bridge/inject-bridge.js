function injectBridge() {
  if (!window.__workTimerBridgeInitialized) {
    window.__workTimerBridgeInitialized = true;

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("js/bridge.js");
    script.onload = () => {};
    document.documentElement.appendChild(script);
  }
}

// window.injectBridge = injectBridge;

const injectBridgeListener = chrome.runtime.onMessage.addListener(
  (msg, sender, sendResponse) => {
    if (msg.source === "service-worker.js" && msg.action === "inject-bridge") {
      injectBridge();
    }
  }
);
