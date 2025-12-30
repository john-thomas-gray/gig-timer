/* Initialize self. Request existing workTime, await response. Start stopwatch. */
let initiated = false;
let stopwatchElement = null;
let stopwatchInterval = null;
let timeSinceLastAction = -1;
let isIdle = false;
let elapsedTime = 0;
let stopwatchRunning = true;
let lastStartCall = 0;

let workplaceUrl;
let settings;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.source === "service-worker.js" && msg.action === "init-stopwatch") {
    console.log("bing!");
    initStopwatch();
  }
});

async function getStorage() {
  workplaceUrl = await getWorkplaceUrl();
  settings = await getSettings();
}

async function initStopwatch() {
  getStorage();
  start();
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

async function getSettings() {
  const defaultSettings = {
    idle_threshold: 30,
  };
  try {
    const settings = await chrome.storage.sync.get(["settings"]);
    if (!settings) {
      settings = defaultSettings;
      console.warn("Failed to get stopwatch settings. Applied defaults.");
    }
    return settings;
  } catch (e) {
    console.error("Failed to get stopwatch settings.", e);
  }
}

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
  let storedWorktime = 0;

  try {
    storedWorktime = await chrome.runtime.sendMessage({
      action: "get-stored-worktime",
      url: window.location.href,
    });
  } catch (e) {
    console.error("Unable to get stored workTime", e);
  }

  elapsedTime = storedWorktime;

  clearInterval(stopwatchInterval);
  stopwatchInterval = setInterval(() => {
    if (!stopwatchRunning) return;
    checkIdle();

    elapsedTime++;
    console.log(elapsedTime);
    updateDisplay(elapsedTime);
  }, 1000);
}

function checkIdle() {
  if (isIdle) return;
  console.log("check idle");
  timeSinceLastAction++;
  // const idleThreshold = settings?.idle_threshold;
  const idleThreshold = 5;
  if (timeSinceLastAction > idleThreshold) {
    isIdle = true;
    const adjustedElapsed = Math.max(elapsedTime - timeSinceLastAction, 0);
    elapsedTime = adjustedElapsed;

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
document.addEventListener("keypress", monitorUserActions);

function monitorUserActions() {
  if (!initiated) return;
  const idleThreshold = settings?.idleThreshold ?? 3000;
  const THROTTLE_MS = idleThreshold * 0.9;
  const now = Date.now();
  if (now - timeSinceLastAction < THROTTLE_MS) {
    return;
  }
  console.log("monitoring");

  timeSinceLastAction = -1;
  if (isIdle) {
    console.log("start");
    isIdle = false;
    start();
  }
}

async function pause(seconds) {
  console.log("paws");
  stopwatchRunning = false;

  clearInterval(stopwatchInterval);
  await storeElapsedTime(elapsedTime);
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
