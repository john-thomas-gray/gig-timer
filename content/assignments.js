console.log("assignments");
const pending = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "request-assignments-data") return;

  const id = crypto.randomUUID();

  pending.set(id, sendResponse);

  window.postMessage(
    { source: "assignments.js", type: "REQUEST_W2UI_DATA", id },
    "*"
  );

  return true;
});

window.addEventListener("message", (event) => {
  if (event.data?.source !== "bridge.js") return;

  const { id, type, payload } = event.data;
  if (!id) {
    console.warn("Bridge response missing id:", event.data);
    return;
  }

  const sendResponse = pending.get(id);
  if (!sendResponse) {
    console.warn("No pending request for id:", id);
    return;
  }

  sendResponse({ type, payload });
  pending.delete(id);
});
