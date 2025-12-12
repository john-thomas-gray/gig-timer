chrome.tabs.onUpdate.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url.includes("pixelogic")) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ["js/bridge.js"],
    });
  }
});
