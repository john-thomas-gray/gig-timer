/* Initialize self. Request existing workTime, await response. Start stopwatch. */
let initiated = false;
let stopwatchElement = undefined;
let stopwatchInterval = undefined;
let elapsedTime = 0;
let stopwatchRunning = false;
let lastStartCallAt = 0;
let idleSeconds = 0;
let isIdle = false;

const IDLE_THRESHOLD_SECONDS = 31;
let lastActionAt = Date.now();

const formatTimestamp = (ms) => new Date(ms).toLocaleTimeString();

async function initStopwatchScript() {
  const { urls = {} } = await chrome.storage.sync.get("urls");
  const workplace = urls.workplace?.trim();
  if (!workplace || !window.location.href.includes(workplace)) {
    return;
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.source === "background.js" && msg.action === "init-stopwatch") {
      initStopwatch();
    }
  });

  document.addEventListener("pointermove", monitorUserActions);
  document.addEventListener("keydown", monitorUserActions);
}

initStopwatchScript();

async function initStopwatch() {
  await start();
  initiated = true;
  console.log("Stopwatch initiated at", formatTimestamp(Date.now()));
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

function updateDisplay(time) {
  const el = createStopwatchElement();
  el.textContent = `Time elapsed: ${formatTime(time)}`;
}

async function start() {
  const THROTTLE_MS = 1000;
  const now = Date.now();
  if (now - lastStartCallAt < THROTTLE_MS) {
    return;
  }

  lastStartCallAt = now;
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
    elapsedTime = Math.max(elapsedTime, numericStoredWorktime);
  } else if (!Number.isFinite(elapsedTime) || elapsedTime < 0) {
    elapsedTime = 0;
  }

  clearInterval(stopwatchInterval);
  stopwatchInterval = setInterval(() => {
    if (!stopwatchRunning) return;

    checkIdle();
    if (!stopwatchRunning) return;

    elapsedTime += 1;
    idleSeconds += 1;

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

  const secondsSinceAction = Math.floor((Date.now() - lastActionAt) / 1000);
  if (secondsSinceAction <= IDLE_THRESHOLD_SECONDS) return;

  isIdle = true;
  elapsedTime = Math.max(elapsedTime - idleSeconds, 0);
  pause();
}

function storeElapsedTime(nextElapsedTime) {
  chrome.runtime.sendMessage({
    action: "store-elapsed-time",
    elapsedTime: nextElapsedTime,
    url: window.location.href,
  });
}

function monitorUserActions() {
  if (!initiated) return;

  lastActionAt = Date.now();
  idleSeconds = 0;

  if (isIdle) {
    console.log("unpaused at:", formatTime(elapsedTime));
    isIdle = false;
    start();
  }
}

function pause() {
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
