(() => {
if (globalThis.__gigTimerStopwatchScriptLoaded) return;
globalThis.__gigTimerStopwatchScriptLoaded = true;

/* Initialize self. Request existing workTime, await response. Start stopwatch. */
let initiated = false;
let stopwatchElement = undefined;
let stopwatchDisplay = undefined;
let stopwatchOverlay = undefined;
let stopwatchOverlayTime = undefined;
let stopwatchOverlayButton = undefined;
let stopwatchToggleButton = undefined;
let stopwatchInterval = undefined;
let elapsedTime = 0;
let stopwatchRunning = false;
let lastStartCallAt = 0;
let lastAutoSaveSecond = -1;
let idleSeconds = 0;
let isIdle = false;
let isManualPause = false;
let activeProjectId;
let pixelogicModulePromise;
let netflixModulePromise;

const LOG_PREFIX = "[Gig Timer]";
const IDLE_THRESHOLD_SECONDS = 3 * 60;
let lastActionAt = Date.now();

const formatTimestamp = (ms) => new Date(ms).toLocaleTimeString();

function loadPixelogicModule() {
  pixelogicModulePromise ??= import(chrome.runtime.getURL("utils/pixelogic.js"));
  return pixelogicModulePromise;
}

function loadNetflixModule() {
  netflixModulePromise ??= import(chrome.runtime.getURL("utils/netflix.js"));
  return netflixModulePromise;
}

const stopwatchContextReady = loadStopwatchContext();
chrome.runtime.onMessage.addListener(stopwatchListener);
stopwatchContextReady
  .then(({ isTimerPage }) => {
    if (!isTimerPage) return;

    console.log(`${LOG_PREFIX} Stopwatch content script active`, {
      url: window.location.href,
    });

    document.addEventListener("pointermove", monitorUserActions);
    document.addEventListener("keydown", monitorUserActions);
  })
  .catch((error) => {
    console.error(`${LOG_PREFIX} Stopwatch content script setup failed`, error);
  });

async function loadStopwatchContext() {
  const [pixelogic, netflix] = await Promise.all([
    loadPixelogicModule(),
    loadNetflixModule(),
  ]);
  const { urls = {} } = await chrome.storage.local.get("urls");
  const workplace = urls.workplace?.trim();
  const isTimerPage =
    pixelogic.isTimerPageUrl(window.location.href, { workplace }) ||
    netflix.isNetflixAuthoringUrl(window.location.href);

  return { isTimerPage };
}

function stopwatchListener(msg, sender, sendResponse) {
  if (msg.source === "background.js" && msg.action === "init-stopwatch") {
    (async () => {
      const { isTimerPage } = await stopwatchContextReady;
      if (!isTimerPage) {
        sendResponse({ initiated: false });
        return;
      }
      console.log(`${LOG_PREFIX} Stopwatch init message received`, {
        projectId: msg.projectId,
        url: window.location.href,
      });
      activeProjectId = msg.projectId;
      await initStopwatch(msg.storedWorktime);
      sendResponse({ initiated: true });
    })().catch((error) => {
      console.error(`${LOG_PREFIX} Stopwatch init failed`, error);
      sendResponse({ initiated: false });
    });
    return true;
  }

  if (msg.action === "set-stopwatch-time") {
    (async () => {
      const { isTimerPage } = await stopwatchContextReady;
      if (!isTimerPage) return;
      activeProjectId = msg.projectId ?? activeProjectId;
      syncStopwatchTime(msg.elapsedTime);
    })().catch((error) => {
      console.error(`${LOG_PREFIX} Stopwatch time sync failed`, error);
    });
    return;
  }

  if (msg.action === "get-stopwatch-time") {
    (async () => {
      const { isTimerPage } = await stopwatchContextReady;
      if (!isTimerPage) {
        sendResponse(undefined);
        return;
      }
      sendResponse({ elapsedTime });
    })().catch((error) => {
      console.error(`${LOG_PREFIX} Stopwatch time lookup failed`, error);
      sendResponse(undefined);
    });
    return true;
  }
}

async function initStopwatch(storedWorktime) {
  await start(storedWorktime);
  initiated = true;
  console.log(`${LOG_PREFIX} Stopwatch initiated`, {
    at: formatTimestamp(Date.now()),
    elapsedTime,
    url: window.location.href,
  });
}

function createStopwatchElement() {
  if (!stopwatchElement) {
    stopwatchElement = document.createElement("div");
    stopwatchElement.id = "stopwatch";
    stopwatchElement.style.position = "fixed";
    stopwatchElement.style.display = "flex";
    stopwatchElement.style.alignItems = "center";
    stopwatchElement.style.gap = "10px";
    stopwatchElement.style.bottom = "20px";
    stopwatchElement.style.right = "20px";
    stopwatchElement.style.background = "rgba(0,0,0,0.7)";
    stopwatchElement.style.color = "white";
    stopwatchElement.style.padding = "10px 15px";
    stopwatchElement.style.borderRadius = "8px";
    stopwatchElement.style.fontSize = "16px";
    stopwatchElement.style.zIndex = 9999;
    stopwatchElement.style.overflow = "hidden";
    stopwatchElement.style.minWidth = "220px";
    stopwatchElement.style.flexDirection = "row";

    stopwatchDisplay = document.createElement("span");
    stopwatchDisplay.id = "stopwatch-display";
    stopwatchDisplay.textContent = `Time elapsed: ${formatTime(0)}`;
    stopwatchElement.appendChild(stopwatchDisplay);

    stopwatchToggleButton = document.createElement("button");
    stopwatchToggleButton.type = "button";
    stopwatchToggleButton.textContent = "Pause";
    stopwatchToggleButton.style.cursor = "pointer";
    stopwatchToggleButton.style.border = "1px solid rgba(255,255,255,0.6)";
    stopwatchToggleButton.style.borderRadius = "4px";
    stopwatchToggleButton.style.padding = "4px 8px";
    stopwatchToggleButton.style.background = "rgba(255,255,255,0.15)";
    stopwatchToggleButton.style.color = "white";
    stopwatchToggleButton.style.fontSize = "14px";
    stopwatchToggleButton.style.lineHeight = "1";
    stopwatchToggleButton.style.height = "24px";
    stopwatchToggleButton.style.minWidth = "60px";
    stopwatchToggleButton.style.display = "inline-flex";
    stopwatchToggleButton.style.alignItems = "center";
    stopwatchToggleButton.style.justifyContent = "center";
    stopwatchToggleButton.addEventListener("click", handleManualPauseToggle);
    stopwatchElement.appendChild(stopwatchToggleButton);

    stopwatchOverlay = document.createElement("div");
    stopwatchOverlay.id = "stopwatch-paused-overlay";
    stopwatchOverlay.style.position = "fixed";
    stopwatchOverlay.style.inset = "0";
    stopwatchOverlay.style.display = "none";
    stopwatchOverlay.style.alignItems = "center";
    stopwatchOverlay.style.justifyContent = "center";
    stopwatchOverlay.style.flexDirection = "column";
    stopwatchOverlay.style.gap = "12px";
    stopwatchOverlay.style.background = "rgba(0, 0, 0, 0.35)";
    stopwatchOverlay.style.zIndex = "10000";
    stopwatchOverlay.style.pointerEvents = "auto";

    stopwatchOverlayTime = document.createElement("div");
    stopwatchOverlayTime.textContent = formatTime(0);
    stopwatchOverlayTime.style.fontSize = "52px";
    stopwatchOverlayTime.style.lineHeight = "1";
    stopwatchOverlayTime.style.color = "white";
    stopwatchOverlayTime.style.fontWeight = "bold";
    stopwatchOverlay.appendChild(stopwatchOverlayTime);

    stopwatchOverlayButton = document.createElement("button");
    stopwatchOverlayButton.type = "button";
    stopwatchOverlayButton.textContent = "Play";
    stopwatchOverlayButton.style.cursor = "pointer";
    stopwatchOverlayButton.style.padding = "10px 18px";
    stopwatchOverlayButton.style.fontSize = "16px";
    stopwatchOverlayButton.style.borderRadius = "6px";
    stopwatchOverlayButton.style.border = "1px solid rgba(255,255,255,0.8)";
    stopwatchOverlayButton.style.background = "rgba(255,255,255,0.2)";
    stopwatchOverlayButton.style.color = "white";
    stopwatchOverlayButton.style.pointerEvents = "auto";
    stopwatchOverlayButton.addEventListener("click", handleManualPauseToggle);
    stopwatchOverlay.appendChild(stopwatchOverlayButton);

    document.body.appendChild(stopwatchOverlay);

    document.body.appendChild(stopwatchElement);
  }
  return stopwatchElement;
}

function updateDisplay(time) {
  const el = createStopwatchElement();
  stopwatchDisplay.textContent = `Time elapsed: ${formatTime(time)}`;
  if (stopwatchOverlayTime) {
    stopwatchOverlayTime.textContent = formatTime(time);
  }
  updatePausedOverlay();
}

function handleManualPauseToggle() {
  if (isManualPause || isIdle) {
    toggleManualPause(false);
    return;
  }

  toggleManualPause(true);
}

function toggleManualPause(enable) {
  if (enable) {
    isManualPause = true;
    pause();
  } else {
    isManualPause = false;
    isIdle = false;
    lastActionAt = Date.now();
    start();
  }

  updatePausedOverlay();
}

function updatePausedOverlay() {
  createStopwatchElement();
  stopwatchToggleButton.textContent = isManualPause ? "Play" : "Pause";
  if (isManualPause || (isIdle && !isManualPause)) {
    stopwatchOverlay.style.display = "flex";
    stopwatchOverlay.style.pointerEvents = "auto";
    stopwatchToggleButton.style.display = "none";
    return;
  }

  stopwatchOverlay.style.display = "none";
  stopwatchOverlay.style.pointerEvents = "none";
  stopwatchToggleButton.style.display = "inline-flex";
}

async function start(initialStoredWorktime) {
  const THROTTLE_MS = 1000;
  const now = Date.now();
  if (isManualPause) {
    return;
  }

  if (now - lastStartCallAt < THROTTLE_MS) {
    console.log(`${LOG_PREFIX} Stopwatch start skipped by throttle`, {
      elapsedTime,
    });
    return;
  }

  lastStartCallAt = now;
  stopwatchRunning = true;
  isIdle = false;
  console.log(`${LOG_PREFIX} Stopwatch start requested`, {
    url: window.location.href,
  });

  const numericStoredWorktime = Number(initialStoredWorktime);
  if (Number.isFinite(numericStoredWorktime) && numericStoredWorktime >= 0) {
    console.log(`${LOG_PREFIX} Stored work time loaded`, {
      formatted: formatTime(numericStoredWorktime),
      projectId: activeProjectId,
      seconds: numericStoredWorktime,
    });
    elapsedTime = Math.max(elapsedTime, numericStoredWorktime);
  } else if (!Number.isFinite(elapsedTime) || elapsedTime < 0) {
    elapsedTime = 0;
  }
  lastAutoSaveSecond = Math.floor(elapsedTime);

  clearInterval(stopwatchInterval);
  console.log(`${LOG_PREFIX} Stopwatch interval running`, {
    elapsedTime,
  });
  updatePausedOverlay();

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
  const elapsedWholeSeconds = Math.floor(elapsedTime);
  if (elapsedWholeSeconds === lastAutoSaveSecond) return;

  lastAutoSaveSecond = elapsedWholeSeconds;

  if (elapsedWholeSeconds % 30 !== 0) {
    return;
  }

  storeElapsedTime(elapsedTime);
}

function checkIdle() {
  if (isIdle) return;

  const secondsSinceAction = Math.floor((Date.now() - lastActionAt) / 1000);
  if (secondsSinceAction <= IDLE_THRESHOLD_SECONDS) return;

  isIdle = true;
  elapsedTime = Math.max(elapsedTime - idleSeconds, 0);
  lastAutoSaveSecond = -1;
  pause();
}

function storeElapsedTime(nextElapsedTime) {
  console.log(`${LOG_PREFIX} Storing elapsed time`, {
    formatted: formatTime(nextElapsedTime),
    seconds: nextElapsedTime,
    url: window.location.href,
  });
  chrome.runtime.sendMessage({
    action: "store-elapsed-time",
    elapsedTime: nextElapsedTime,
    projectId: activeProjectId,
    url: window.location.href,
  });
}

function syncStopwatchTime(nextElapsedTime) {
  const numericValue = Number(nextElapsedTime);
  if (!Number.isFinite(numericValue)) return;

  elapsedTime = Math.max(0, numericValue);
  lastAutoSaveSecond = Math.floor(elapsedTime);
  idleSeconds = 0;
  isIdle = false;
  lastActionAt = Date.now();
  updateDisplay(elapsedTime);

  storeElapsedTime(elapsedTime);
  updatePausedOverlay();
}

function monitorUserActions() {
  if (!initiated) return;

  lastActionAt = Date.now();
  idleSeconds = 0;

  if (isIdle) {
    console.log(`${LOG_PREFIX} User activity resumed stopwatch`, {
      formatted: formatTime(elapsedTime),
      seconds: elapsedTime,
    });
    isIdle = false;
    start();
  }

  if (isManualPause) {
    updatePausedOverlay();
    return;
  }
}

function pause() {
  stopwatchRunning = false;
  console.log(`${LOG_PREFIX} Stopwatch paused for idle time`, {
    formatted: formatTime(elapsedTime),
    seconds: elapsedTime,
  });
  clearInterval(stopwatchInterval);
  storeElapsedTime(elapsedTime);
  updatePausedOverlay();
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "00:00:00:00";
  const totalCentiseconds = Math.max(0, Math.floor(seconds * 100));
  const hrs = Math.floor(totalCentiseconds / 360000)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((totalCentiseconds % 360000) / 6000)
    .toString()
    .padStart(2, "0");
  const secs = Math.floor((totalCentiseconds % 6000) / 100)
    .toString()
    .padStart(2, "0");
  const ff = (totalCentiseconds % 100).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}:${ff}`;
}
})();
