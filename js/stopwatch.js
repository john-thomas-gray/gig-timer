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

function updateDisplay(time) {
  const el = createStopwatchElement();
  el.textContent = `Time elapsed: ${time}`;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "updateDisplay") {
    updateDisplay(msg.elapsedTime);
  }
  if (msg.action === "createStopwatchElement") {
    createStopwatchElement();
  }
});
