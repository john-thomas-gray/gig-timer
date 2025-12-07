import { doesUrlMatch } from "./urlUtils";

export const storageCache = { count: 0};

const initStorageCache = chrome.storage.sync.get().then((items) => {
  Object.assign(storageCache, items);
})

chrome.action.onClicked.addListener(async (tab) => {
  try{
    await initStorageCache;
  } catch (e) {
    console.log(e);
  }

  storageCache.count++;
  storageCache.lastTabId = tab.id;
  chrome.storage.sync.set(storageCache);
})

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;

  const { urls } = await chrome.storage.sync.get("urls");
  const currentUrl = changeInfo.url;

  const onAssignmentsPage = doesUrlMatch(currentUrl, urls?.assignments);
  const onWorkplacePage = doesUrlMatch(currentUrl, urls?.workplace);

  if (onAssignmentsPage) console.log("On assignments page");
  if (onWorkplacePage) console.log("On workplace page");
});
