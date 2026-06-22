(() => {
/* Initialize self. Request existing workTime, await response. Start stopwatch. */
let initiated = false;
let stopwatchElement = undefined;
let stopwatchInterval = undefined;
let elapsedTime = 0;
let stopwatchRunning = false;
let lastStartCallAt = 0;
let idleSeconds = 0;
let isIdle = false;
let pixelogicModulePromise;

const LOG_PREFIX = "[Gig Timer]";
const IDLE_THRESHOLD_SECONDS = 10 * 60;
let lastActionAt = Date.now();

const formatTimestamp = (ms) => new Date(ms).toLocaleTimeString();

function loadPixelogicModule() {
  pixelogicModulePromise ??= import(chrome.runtime.getURL("utils/pixelogic.js"));
  return pixelogicModulePromise;
}

async function initStopwatchScript() {
  const pixelogic = await loadPixelogicModule();
  const { urls = {} } = await chrome.storage.local.get("urls");
  const workplace = urls.workplace?.trim();
  if (
    !pixelogic.isTimerPageUrl(window.location.href, { workplace }) &&
    !isNetflixAuthoringPage()
  ) {
    return;
  }

  console.log(`${LOG_PREFIX} Stopwatch content script active`, {
    url: window.location.href,
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.source === "background.js" && msg.action === "init-stopwatch") {
      console.log(`${LOG_PREFIX} Stopwatch init message received`, {
        url: window.location.href,
      });
      initStopwatch();
    }
  });

  document.addEventListener("pointermove", monitorUserActions);
  document.addEventListener("keydown", monitorUserActions);
}

initStopwatchScript();

function isNetflixAuthoringPage() {
  return (
    window.location.hostname === "authoring.netflixstudios.com" &&
    window.location.pathname.startsWith("/editor")
  );
}

async function initStopwatch() {
  await start();
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
    console.log(`${LOG_PREFIX} Stopwatch start skipped by throttle`, {
      elapsedTime,
    });
    return;
  }

  lastStartCallAt = now;
  stopwatchRunning = true;
  console.log(`${LOG_PREFIX} Stopwatch start requested`, {
    url: window.location.href,
  });

  let storedWorktime = -1;
  try {
    storedWorktime = await chrome.runtime.sendMessage({
      action: "get-stored-worktime",
      url: window.location.href,
    });
    console.log(`${LOG_PREFIX} Stored work time loaded`, {
      formatted: formatTime(Number(storedWorktime) || 0),
      seconds: storedWorktime,
    });
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
  console.log(`${LOG_PREFIX} Stopwatch interval running`, {
    elapsedTime,
  });
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
  console.log(`${LOG_PREFIX} Storing elapsed time`, {
    formatted: formatTime(nextElapsedTime),
    seconds: nextElapsedTime,
    url: window.location.href,
  });
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
    console.log(`${LOG_PREFIX} User activity resumed stopwatch`, {
      formatted: formatTime(elapsedTime),
      seconds: elapsedTime,
    });
    isIdle = false;
    start();
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
})();
