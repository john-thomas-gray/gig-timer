// injectBridge();

const pending = new Map();

const runtimeMessageListener = (msg, sender, sendResponse) => {
  if (msg.action !== "request-assignments-data") return;

  const id = crypto.randomUUID();
  pending.set(id, sendResponse);

  window.postMessage(
    { source: "assignments.js", type: "REQUEST_W2UI_DATA", id },
    "*"
  );

  return true;
};

const bridgeMessageListener = (event) => {
  if (event.data.source !== "bridge.js") return;

  const sendResponse = pending.get(event.data.id);
  if (!sendResponse) return;

  sendResponse({
    type: event.data.type,
    payload: event.data.payload,
  });

  pending.delete(event.data.id);
};
