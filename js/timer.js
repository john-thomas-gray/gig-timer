"use strict";
let timerStart = null;
let hasStoredDuration = false;
let logIntervalId = null;
let accumulatedDurationBeforeSessionMs = 0;
let activeProjectTitle = null;
const TIMER_PROJECT_DURATIONS_KEY = "projectDurations";

const getStoredDuration = () =>
  new Promise((resolve) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage?.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      resolve(0);
      return;
    }
    const storageLocal = chrome.storage?.local;
    if (!storageLocal || typeof storageLocal.get !== "function") {
      resolve(0);
      return;
    }
    storageLocal.get(
      ["lastSessionDurationMs", "projectTitle", TIMER_PROJECT_DURATIONS_KEY],
      (result) => {
        if (chrome?.runtime?.lastError) {
          console.warn(
            "Failed to retrieve stored session duration.",
            chrome.runtime.lastError
          );
          resolve(0);
          return;
        }
        const currentProject = normalizeProjectTitle(result.projectTitle);
        activeProjectTitle = currentProject;
        const durationMap = normalizeTimerDurationMap(
          result[TIMER_PROJECT_DURATIONS_KEY]
        );
        if (
          currentProject &&
          Object.prototype.hasOwnProperty.call(durationMap, currentProject)
        ) {
          resolve(Math.max(0, durationMap[currentProject] ?? 0));
          return;
        }
        const rawValue = result.lastSessionDurationMs;
        if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
          resolve(Math.max(0, rawValue));
          return;
        }
        resolve(0);
      }
    );
  });
const storeDuration = (duration) => {
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.local ||
    typeof chrome.storage.local.set !== "function"
  ) {
    return;
  }
  const storageLocal = chrome.storage?.local;
  if (
    !storageLocal ||
    typeof storageLocal.get !== "function" ||
    typeof storageLocal.set !== "function"
  ) {
    return;
  }
  storageLocal.get(["projectTitle", TIMER_PROJECT_DURATIONS_KEY], (result) => {
    if (chrome?.runtime?.lastError) {
      console.warn(
        "Failed to read session duration map.",
        chrome.runtime.lastError
      );
      return;
    }
    const storedProjectTitle = normalizeProjectTitle(result.projectTitle);
    const projectTitle = activeProjectTitle ?? storedProjectTitle;
    const durationMap = normalizeTimerDurationMap(
      result[TIMER_PROJECT_DURATIONS_KEY]
    );
    if (projectTitle) {
      durationMap[projectTitle] = Math.max(0, duration);
    }
    storageLocal.set(
      {
        lastSessionDurationMs: duration,
        [TIMER_PROJECT_DURATIONS_KEY]: durationMap,
      },
      () => {
        if (chrome?.runtime?.lastError) {
          console.warn(
            "Failed to store session duration.",
            chrome.runtime.lastError
          );
        }
      }
    );
  });
};
function handlePageClose() {
  stopTimerAndStore();
}
function stopTimerAndStore() {
  if (timerStart === null || hasStoredDuration) {
    return;
  }
  hasStoredDuration = true;
  const sessionDuration = Date.now() - timerStart;
  const totalDuration = accumulatedDurationBeforeSessionMs + sessionDuration;
  accumulatedDurationBeforeSessionMs = totalDuration;
  storeDuration(totalDuration);
  if (logIntervalId !== null) {
    window.clearInterval(logIntervalId);
    logIntervalId = null;
  }
  timerStart = null;
  window.removeEventListener("pagehide", handlePageClose);
  window.removeEventListener("beforeunload", handlePageClose);
  window.removeEventListener("unload", handlePageClose);
}
async function startTimerInternal() {
  if (timerStart !== null) {
    return;
  }
  const storedDuration = await getStoredDuration();
  if (timerStart !== null) {
    return;
  }
  accumulatedDurationBeforeSessionMs = storedDuration;
  timerStart = Date.now();
  hasStoredDuration = false;
  window.addEventListener("pagehide", handlePageClose);
  window.addEventListener("beforeunload", handlePageClose);
  window.addEventListener("unload", handlePageClose);
  if (logIntervalId !== null) {
    window.clearInterval(logIntervalId);
  }
  logIntervalId = window.setInterval(() => {
    if (timerStart === null) {
      return;
    }
    const sessionDurationMs = Date.now() - timerStart;
    const totalDurationMs =
      accumulatedDurationBeforeSessionMs + sessionDurationMs;
    storeDuration(totalDurationMs);
  }, 1_000);
}
const ensureWorkTimerApi = () => {
  const existing = window.workTimer ?? {};
  window.workTimer = {
    ...existing,
    startTimer: startTimerInternal,
    stopTimer: stopTimerAndStore,
  };
};
ensureWorkTimerApi();
