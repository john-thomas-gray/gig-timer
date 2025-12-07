import { storageCache } from './background.js';

export function saveData(key, value) {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.sync) {
      reject(new Error("chrome.storage.sync is not available"));
      return;
    }

    let valueToStore;
    if (!Array.isArray(value) && typeof value === "object") {
      valueToStore = { ...value };
    } else {
      valueToStore = value;
    }

    storageCache[key] = valueToStore;

    chrome.storage.sync.set({[key]: valueToStore}, () => {
      if(chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve();
      }
    })

  })
}
