import { doesUrlMatch } from "./js/urlUtils.js";

console.log("Service worker starting...");

const storageCache = { count: 0, urls: {} };

async function initStorageCache() {
  const items = await chrome.storage.sync.get(["count", "lastTabId", "urls"]);
  Object.assign(storageCache, items);
}

chrome.action.onClicked.addListener(async (tab) => {
  await initStorageCache();
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
  ({ tabId, url }) => {
    console.log("load page", tabId);
    const { assignments, workplace } = storageCache.urls;
    if (doesUrlMatch(assignments, url)) {
      console.log("Get assignment details");
    } else if (doesUrlMatch(workplace, url)) {
      console.log("Start timer");
    }
  },
  { url: [{ hostContains: "google.com" }, { hostContains: "frogger.com" }] }
);

chrome.webNavigation.onCompleted.addListener(({ url }) => {
  console.log("nav event:", url);
});
