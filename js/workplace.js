chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (
    msg.source === "service-worker.js" &&
    msg.action === "request-workplace-id"
  ) {
    const idSpan = document.getElementById("header-full-title");
    const id = idSpan.textContent.trim();
    console.log("span:", id);
    sendResponse({ data: id });
    return true;
  }
});
