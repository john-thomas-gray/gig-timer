import { doesUrlMatch } from "./js/urlUtils.js";

console.log("Service worker starting...");

const storageCache = { count: 0, urls: {} };

async function initStorageCache() {
  const items = await chrome.storage.sync.get(["count", "lastTabId", "urls"]);
  Object.assign(storageCache, items);
}
//never runs
chrome.action.onClicked.addListener(async (tab) => {
  console.log("init storage");
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
    console.log("XXXXX",changes.urls.newValue)
    storageCache.urls = changes.urls.newValue;
  }
});

chrome.webNavigation.onCompleted.addListener(
  (details) => {
    const { tabId, url } = details;
    console.log("Details object:", storageCache);
    const { assignments, workplace } = storageCache.urls;
    console.log(
      "assignments",
      assignments,
      "currentUrl",
      url,
      "equal?",
      assignments == url,
      "doesUrlMatch",
      doesUrlMatch(assignments, url)
    );
    if (doesUrlMatch(assignments, url)) {
      console.log("Get assignment details");
    } else if (doesUrlMatch(workplace, url)) {
      console.log("Start timer");
    }
  },
  { url: [{ hostContains: "google.com" }, { hostContains: "frogger.com" }] }
);
