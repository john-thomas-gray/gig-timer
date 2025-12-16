function requestWorkplaceUrl(e) {
  function handleResponse(url) {
    return url;
  }
  function handleError(error) {
    return;
  }

  const sending = browser.runtime.sendMessage({
    action: "getWorkplaceUrl",
  });
  sending.then(handleResponse(response.url), handleError);
}

function injectBridge() {
  if (!window.__workTimerBridgeInitialized) {
    window.__workTimerBridgeInitialized = true;
    const currentUrl = window.location.href;

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
