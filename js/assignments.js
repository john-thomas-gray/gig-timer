let pendingSendResponse = null;

window.addEventListener("message", (event) => {
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
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "REQUEST_ASSIGNMENTS_DATA") return;

  pendingSendResponse = sendResponse;

  window.postMessage(
    { source: "assignments.js", type: "REQUEST_W2UI_DATA" },
    "*"
  );

  return true;
});
