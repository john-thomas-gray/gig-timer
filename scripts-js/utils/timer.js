"use strict";
let timerStart = null;
let accumulatedDurationBeforeSessionMs = 0;
let hasStoredDuration = false;
let hasAttachedLifecycleListeners = false;
let hasInitializedFromStorage = false;
let hasEverBeenStarted = false;
let isTimerCurrentlyPaused = false;
let storageSyncIntervalId = null;
let lastPersistedDurationMs = 0;
let hasAttachedStorageChangeListener = false;
const STORAGE_SYNC_INTERVAL_MS = 1000;
const getStoredDuration = () =>
  new Promise((resolve) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage?.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      lastPersistedDurationMs = 0;
      resolve(0);
      return;
    }
    try {
      chrome.storage.local.get({ lastSessionDurationMs: 0 }, (result) => {
        if (chrome?.runtime?.lastError) {
          console.warn(
            "Failed to retrieve stored session duration.",
            chrome.runtime.lastError
          );
          lastPersistedDurationMs = 0;
          resolve(0);
          return;
        }
        const rawValue = result.lastSessionDurationMs;
        if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
          const sanitizedValue = Math.max(0, rawValue);
          lastPersistedDurationMs = sanitizedValue;
          resolve(sanitizedValue);
          return;
        }
        lastPersistedDurationMs = 0;
        resolve(0);
      });
    } catch (error) {
      console.warn("Unable to call chrome.storage.local.get", error);
      lastPersistedDurationMs = 0;
      resolve(0);
    }
  });
const storeDuration = (duration) => {
  const sanitizedDuration =
    typeof duration === "number" && Number.isFinite(duration)
      ? Math.max(0, Math.round(duration))
      : 0;

  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.local ||
    typeof chrome.storage.local.set !== "function"
  ) {
    return;
  }

  if (sanitizedDuration === lastPersistedDurationMs) {
    return;
  }

  try {
    chrome.storage.local.set(
      { lastSessionDurationMs: sanitizedDuration },
      () => {
        if (chrome.runtime?.lastError) {
          console.warn(
            "Failed to store session duration.",
            chrome.runtime.lastError
          );
          return;
        }
        lastPersistedDurationMs = sanitizedDuration;
      }
    );
  } catch (error) {
    console.warn("Unable to call chrome.storage.local.set", error);
  }
};

const getTotalDurationMs = () => {
  if (timerStart !== null) {
    return accumulatedDurationBeforeSessionMs + (Date.now() - timerStart);
  }
  return accumulatedDurationBeforeSessionMs;
};
const setTotalDurationMs = (totalMs) => {
  const sanitizedTotal = Math.max(0, totalMs);
  if (timerStart !== null) {
    accumulatedDurationBeforeSessionMs = sanitizedTotal;
    timerStart = Date.now();
    return;
  }
  accumulatedDurationBeforeSessionMs = sanitizedTotal;
};
const adjustDurationByMs = (deltaMs) => {
  if (!Number.isFinite(deltaMs) || deltaMs === 0) {
    return;
  }
  const currentTotal = getTotalDurationMs();
  setTotalDurationMs(currentTotal + deltaMs);
  storeDuration(getTotalDurationMs());
};
const startStorageSyncInterval = () => {
  if (storageSyncIntervalId !== null) {
    return;
  }
  storageSyncIntervalId = window.setInterval(() => {
    const totalDuration = getTotalDurationMs();
    storeDuration(totalDuration);
  }, STORAGE_SYNC_INTERVAL_MS);
};
const stopStorageSyncInterval = () => {
  if (storageSyncIntervalId === null) {
    return;
  }
  window.clearInterval(storageSyncIntervalId);
  storageSyncIntervalId = null;
};
const handleStoredDurationChange = (changes, areaName) => {
  if (areaName !== "local") {
    return;
  }
  const durationChange = changes?.lastSessionDurationMs;
  if (
    !durationChange ||
    typeof durationChange.newValue !== "number" ||
    !Number.isFinite(durationChange.newValue)
  ) {
    return;
  }
  const sanitizedValue = Math.max(0, durationChange.newValue);
  lastPersistedDurationMs = sanitizedValue;
  hasInitializedFromStorage = true;
  if (timerStart !== null) {
    accumulatedDurationBeforeSessionMs = sanitizedValue;
    timerStart = Date.now();
    return;
  }
  accumulatedDurationBeforeSessionMs = sanitizedValue;
};
const attachStorageChangeListener = () => {
  if (hasAttachedStorageChangeListener) {
    return;
  }
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.onChanged ||
    typeof chrome.storage.onChanged.addListener !== "function"
  ) {
    return;
  }
  chrome.storage.onChanged.addListener(handleStoredDurationChange);
  hasAttachedStorageChangeListener = true;
  window.addEventListener(
    "unload",
    () => {
      if (
        typeof chrome === "undefined" ||
        !chrome.storage?.onChanged ||
        typeof chrome.storage.onChanged.removeListener !== "function"
      ) {
        return;
      }
      chrome.storage.onChanged.removeListener(handleStoredDurationChange);
      hasAttachedStorageChangeListener = false;
    },
    { once: true }
  );
};
const attachLifecycleListeners = () => {
  if (hasAttachedLifecycleListeners) {
    return;
  }
  window.addEventListener("pagehide", handlePageClose);
  window.addEventListener("beforeunload", handlePageClose);
  window.addEventListener("unload", handlePageClose);
  hasAttachedLifecycleListeners = true;
};
const detachLifecycleListeners = () => {
  if (!hasAttachedLifecycleListeners) {
    return;
  }
  window.removeEventListener("pagehide", handlePageClose);
  window.removeEventListener("beforeunload", handlePageClose);
  window.removeEventListener("unload", handlePageClose);
  hasAttachedLifecycleListeners = false;
};
const beginRunningTimer = () => {
  if (timerStart !== null) {
    return;
  }
  attachStorageChangeListener();
  timerStart = Date.now();
  hasStoredDuration = false;
  isTimerCurrentlyPaused = false;
  hasEverBeenStarted = true;
  attachLifecycleListeners();
  startStorageSyncInterval();
};
const pauseTimerInternal = () => {
  if (timerStart === null) {
    isTimerCurrentlyPaused = true;
    return;
  }
  accumulatedDurationBeforeSessionMs += Date.now() - timerStart;
  timerStart = null;
  isTimerCurrentlyPaused = true;
  stopStorageSyncInterval();
  storeDuration(accumulatedDurationBeforeSessionMs);
};
const resumeTimerInternal = async () => {
  if (timerStart !== null) {
    return;
  }
  if (!hasInitializedFromStorage) {
    const storedDuration = await getStoredDuration();
    accumulatedDurationBeforeSessionMs = storedDuration;
    hasInitializedFromStorage = true;
    if (timerStart !== null) {
      return;
    }
  }
  beginRunningTimer();
};
const handlePageClose = () => {
  stopTimerAndStore();
};
const stopTimerAndStore = () => {
  if (!hasEverBeenStarted && timerStart === null) {
    return;
  }
  if (timerStart !== null) {
    accumulatedDurationBeforeSessionMs += Date.now() - timerStart;
    timerStart = null;
  }
  stopStorageSyncInterval();
  if (hasStoredDuration) {
    return;
  }
  hasStoredDuration = true;
  isTimerCurrentlyPaused = false;
  hasEverBeenStarted = false;
  const totalDuration = getTotalDurationMs();
  accumulatedDurationBeforeSessionMs = totalDuration;
  storeDuration(totalDuration);
  detachLifecycleListeners();
};
const startTimerInternal = async () => {
  if (timerStart !== null) {
    return;
  }
  if (!hasInitializedFromStorage) {
    const storedDuration = await getStoredDuration();
    accumulatedDurationBeforeSessionMs = storedDuration;
    hasInitializedFromStorage = true;
    if (timerStart !== null) {
      return;
    }
  }
  beginRunningTimer();
};
const pauseTimer = () => {
  pauseTimerInternal();
};
const resumeTimer = async () => {
  await resumeTimerInternal();
};
const isTimerRunning = () => timerStart !== null;
const isTimerPaused = () => isTimerCurrentlyPaused && timerStart === null;
const ensureWorkTimerApi = () => {
  const existing = window.workTimer ?? {};
  window.workTimer = {
    ...existing,
    startTimer: startTimerInternal,
    stopTimer: stopTimerAndStore,
    pauseTimer,
    resumeTimer,
    isTimerRunning,
    isTimerPaused,
    adjustDurationByMs,
    getTotalDurationMs,
  };
};
ensureWorkTimerApi();
//# sourceMappingURL=timer.js.map
