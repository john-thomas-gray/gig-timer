injectBridge();

let pendingSendResponse = null;

const bridgeMessageListener = (event) => {
  if (event.data.source !== "bridge.js") return;
  if (!pendingSendResponse) return;

  if (event.data.type === "RETURN_W2UI_DATA") {
    pendingSendResponse({
      type: "RETURN_W2UI_DATA",
      payload: event.data.payload,
    });
    pendingSendResponse = null;
  }

  if (event.data.type === "W2UI_DATA_ERROR") {
    pendingSendResponse({
      type: "W2UI_DATA_ERROR",
      payload: event.data.payload,
    });
    pendingSendResponse = null;
  }
};

window.addEventListener("message", bridgeMessageListener);

const runtimeMessageListener = (msg, sender, sendResponse) => {
  if (msg.action !== "request-assignments-data") return;
  pendingSendResponse = sendResponse;
  window.postMessage(
    { source: "assignments.js", type: "REQUEST_W2UI_DATA" },
    "*"
  );

  return true;
};

chrome.runtime.onMessage.addListener(runtimeMessageListener);

function cleanup() {
  window.removeEventListener("message", bridgeMessageListener);
  chrome.runtime.onMessage.removeListener(runtimeMessageListener);
  pendingSendResponse = null;

  window.removeEventListener("beforeunload", cleanup);
  window.removeEventListener("pagehide", cleanup);
}

window.addEventListener("beforeunload", cleanup);
window.addEventListener("pagehide", cleanup);
