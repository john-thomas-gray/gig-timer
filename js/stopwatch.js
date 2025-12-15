injectBridge();

let stopwatchElement = null;

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

function updateDisplay(time) {
  const el = createStopwatchElement();
  el.textContent = `Time elapsed: ${formatTime(time)}`;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "update-display") {
    updateDisplay(msg.elapsedTime);
  }
  if (msg.action === "create-stopwatch-element") {
    createStopwatchElement();
  }
  if (msg.action === "remove-stopwatch-element") {
    removeStopwatchElement();
  }
});

// Prevent these from firing unless paused
document.addEventListener("pointermove", unpauseStopwatch);
document.addEventListener("keypress", unpauseStopwatch);

let lastSent = 0;
const THROTTLE_MS = 1000;

function unpauseStopwatch() {
  const now = Date.now();
  if (now - lastSent < THROTTLE_MS) return;

  lastSent = now;
  chrome.runtime.sendMessage({
    action: "unpause-stopwatch",
    url: window.location.href,
  });
}
