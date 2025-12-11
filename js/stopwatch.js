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
  if (msg.action === "updateDisplay") {
    updateDisplay(msg.elapsedTime);
  }
  if (msg.action === "createStopwatchElement") {
    createStopwatchElement();
  }
});

document.addEventListener("pointermove", resetTimeSinceLastAction);
document.addEventListener("keypress", resetTimeSinceLastAction);

let lastSent = 0;
const THROTTLE_MS = 1000;

function resetTimeSinceLastAction() {
  const now = Date.now();
  if (now - lastSent < THROTTLE_MS) return;

  lastSent = now;

  chrome.runtime.sendMessage({
    action: "resetTimeSinceLastAction",
    url: window.location.href,
  });
}
