const script = document.createElement("script");
script.src = chrome.runtime.getURL("js/assignments-bridge.js");
document.documentElement.appendChild(script);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "REQUEST_ASSIGNMENTS_DATA") {
    console.log("content received data request");
    window.postMessage(
      {
        source: "work-timer-content",
        type: "REQUEST_W2UI_DATA",
      },
      "*"
    );
  }
  return true;
});

window.addEventListener("message", (event) => {
  if (
    event.source === window &&
    event.data.source === "work-timer-bridge" &&
    event.data.type === "RETURN_W2UI_DATA"
  ) {
    console.log("content received return request");
    chrome.runtime.sendMessage(event.data);
  }
});
