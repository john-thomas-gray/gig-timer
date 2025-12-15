function injectBridge() {
  if (!window.__workTimerBridgeInitialized) {
    window.__workTimerBridgeInitialized = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("js/bridge.js");
    script.onload = () => {
      console.log("Bridge injected and loaded");
    };
    document.documentElement.appendChild(script);
  }
}

function removeBridge() {}

window.injectBridge = injectBridge;
