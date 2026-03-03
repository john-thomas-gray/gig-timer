/* Initialize self. Request existing workTime, await response. Start stopwatch. */
let initiated = false;
let stopwatchElement = undefined;
let stopwatchInterval = undefined;
let timeSinceLastAction = -1;
let isIdle = false;
let elapsedTime = 0;
let stopwatchRunning = true;
let lastStartCall = 0;

let workplaceUrl;
let settings;
const formatTimestamp = (ms) => new Date(ms).toLocaleTimeString();
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.source === "background.js" && msg.action === "init-stopwatch") {
    initStopwatch();
  }
});

async function getStorage() {
  workplaceUrl = await getWorkplaceUrl();
  // settings = await getSettings();
}

async function initStopwatch() {
  getStorage();
  start();

  console.log("Stopwatch initiated at", formatTimestamp(Date.now()));
  initiated = true;
}

async function getWorkplaceUrl() {
  try {
    const urls = await chrome.storage.sync.get(["urls"]);
    const workplaceUrl = urls.workplace;

    return workplaceUrl;
  } catch (e) {
    console.error("Failed to get workplace url.", e);
  }
}

// async function getSettings() {
//   const defaultSettings = {
//     idle_threshold: 30,
//   };
//   try {
//     const settings = await chrome.storage.sync.get(["settings"]);
//     if (!settings) {
//       settings = defaultSettings;
//       console.warn("Failed to get stopwatch settings. Applied defaults.");
//     }
//     return settings;
//   } catch (e) {
//     console.error("Failed to get stopwatch settings.", e);
//   }
// }

function createStopwatchElement() {
  if (!stopwatchElement) {
    stopwatchElement = document.createElement("div");
    stopwatchElement.id = "stopwatch";
    stopwatchElement.style.position = "fixed";
    stopwatchElement.style.bottom = "20px";
    stopwatchElement.style.right = "20px";
    stopwatchElement.style.background = "rgba(0,0,0,0.7)";
    stopwatchElement.style.color = "white";
    stopwatchElement.style.padding = "10px 15px";
    stopwatchElement.style.borderRadius = "8px";
    stopwatchElement.style.fontSize = "16px";
    stopwatchElement.style.zIndex = 9999;
    document.body.appendChild(stopwatchElement);
  }
  return stopwatchElement;
}

function removeStopwatchElement() {
  if (stopwatchElement) {
    stopwatchElement.remove();
  }
}

function updateDisplay(time) {
  const el = createStopwatchElement();
  el.textContent = `Time elapsed: ${formatTime(time)}`;
}

async function start() {
  const THROTTLE_MS = 1000;
  const now = Date.now();
  if (now - lastStartCall < THROTTLE_MS) {
    return;
  }
  lastStartCall = now;
  stopwatchRunning = true;
  let storedWorktime = -1;
  try {
    storedWorktime = await chrome.runtime.sendMessage({
      action: "get-stored-worktime",
      url: window.location.href,
    });
    console.log("storedWorkTime: ", formatTime(storedWorktime));
  } catch (e) {
    console.error("Unable to get stored workTime", e);

    storedWorktime = elapsedTime;
  }

  const numericStoredWorktime = Number(storedWorktime);
  if (Number.isFinite(numericStoredWorktime) && numericStoredWorktime >= 0) {
    // Storage writes are async; on resume prefer whichever value is newer.
    elapsedTime = Math.max(elapsedTime, numericStoredWorktime);
  } else if (!Number.isFinite(elapsedTime) || elapsedTime < 0) {
    elapsedTime = 0;
  }

  clearInterval(stopwatchInterval);
  stopwatchInterval = setInterval(() => {
    if (!stopwatchRunning) return;
    checkIdle();
    if (!stopwatchRunning) return;

    elapsedTime++;
    autoSave();

    updateDisplay(elapsedTime);
  }, 1000);
}

function autoSave() {
  if (elapsedTime % 30 === 0) {
    storeElapsedTime(elapsedTime);
  }
}

function checkIdle() {
  if (isIdle) return;
  timeSinceLastAction++;
  // const idleThreshold = settings?.idle_threshold;
  const idleThreshold = 31;
  if (timeSinceLastAction > idleThreshold) {
    isIdle = true;
    const secondsSinceLastAction = Math.max(timeSinceLastAction, 0);
    elapsedTime = Math.max(elapsedTime - secondsSinceLastAction, 0);
    pause();
  }
}

function storeElapsedTime(elapsedTime) {
  chrome.runtime.sendMessage({
    action: "store-elapsed-time",
    elapsedTime,
    url: window.location.href,
  });
}

document.addEventListener("pointermove", monitorUserActions);
document.addEventListener("keydown", monitorUserActions);

function monitorUserActions() {
  console.log("initiated", initiated);
  if (!initiated) return;
  const idleThreshold = settings?.idleThreshold ?? 60000;
  const THROTTLE_MS = idleThreshold * 0.9;
  const now = Date.now();
  if (now - timeSinceLastAction < THROTTLE_MS) {
    console.log("early stop");
    return;
  }

  timeSinceLastAction = -1;
  if (isIdle) {
    console.log("unpaused at:", formatTime(elapsedTime));
    isIdle = false;
    start();
  }
}

async function pause() {
  stopwatchRunning = false;
  console.log("paused at:", formatTime(elapsedTime));
  clearInterval(stopwatchInterval);
  storeElapsedTime(elapsedTime);
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}
