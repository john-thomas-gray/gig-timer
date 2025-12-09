const storageCache = { count: 0, urls: {} };

// Doesn't go fast enough
async function initStorageCache() {
  const items = await chrome.storage.sync.get(["count", "lastTabId", "urls"]);
  Object.assign(storageCache, items);
}
initStorageCache();

//never runs because popup blocks action
chrome.action.onClicked.addListener(async (tab) => {
  storageCache.count++;
  storageCache.lastTabId = tab.id;
  chrome.storage.sync.set({
    count: storageCache.count,
    lastTabId: storageCache.lastTabId,
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.urls?.newValue) {
    storageCache.urls = changes.urls.newValue;
  }
});

chrome.webNavigation.onCompleted.addListener(
  (details) => {
    const { frameId, url } = details;
    if (frameId !== 0) return;

    const { assignments, workplace } = storageCache.urls;

    if (!assignments && !workplace) return;

    // something more robust. normalization
    if (url.includes(assignments)) {
      console.log("Get assignment details");
    } else if (url.includes(workplace)) {
      console.log("Start timer");
    }
  },
  // how can I make this dynamic
  { url: [{ hostContains: "localization.pixelogicmedia.com" }] }
);
