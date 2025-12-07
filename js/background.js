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
