const storageCache = { count: 0, urls: {}, projects: [] };
let currentTabId = null;
let currentUrl = null;

async function initStorageCache() {
  setElapsedTime(10);
  const items = await chrome.storage.sync.get([
    "count",
    "lastTabId",
    "urls",
    "projects",
  ]);
  Object.assign(storageCache, items);
}
initStorageCache();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    for (const key in changes) {
      if (storageCache.hasOwnProperty(key)) {
        storageCache[key] = changes[key].newValue;
        console.log(`Updated storageCache.${key}:`, storageCache[key]);
      }
    }
  }
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  const { frameId, tabId, url } = details;
  if (frameId !== 0) return;

  const { assignments: assignmentsUrl, workplace: workplaceUrl } =
    storageCache.urls;

  if (!assignmentsUrl && !workplaceUrl) return;

  currentUrl = url;
  currentTabId = tabId;

  // something more robust. normalization
  if (url.includes(assignmentsUrl)) {
    console.log("assignments");
  } else if (url.includes(workplaceUrl)) {
    await initStopwatch();
    startStopwatch();
  }
});

chrome.tabs.onRemoved.addListener(() => {
  pauseStopwatch();
});

let stopwatchInterval = null;
let elapsedTime = 0;

async function getCurrentProject() {
  const projects = storageCache.projects;
  const currentProject = projects.find((p) => p.workplaceUrl === currentUrl);
  return currentProject;
}

async function initStopwatch(tabId = null, url = null) {
  if (tabId) currentTabId = tabId;
  if (url) currentUrl = url;
  const currentProject = await getCurrentProject(currentUrl);
  if (!currentProject) {
    console.warn("Current project not found");
    elapsedTime = 0;
    return;
  }
  elapsedTime = currentProject.workTime || 0;
  updateDisplay();
}

function updateDisplay() {
  if (!currentTabId) return;
  checkIdle();
  chrome.tabs.sendMessage(currentTabId, {
    action: "updateDisplay",
    elapsedTime,
  });
}

function startStopwatch() {
  clearInterval(stopwatchInterval);
  chrome.tabs.sendMessage(currentTabId, { action: "createStopwatchElement" });
  stopwatchInterval = setInterval(() => {
    elapsedTime++;
    updateDisplay();
  }, 1000);
}

async function pauseStopwatch() {
  const projects = storageCache.projects;
  const currentProject = await getCurrentProject();
  if (!currentProject) return;

  clearInterval(stopwatchInterval);
  stopwatchInterval = null;

  currentProject.workTime = elapsedTime;

  chrome.storage.sync.set({ projects }, () => {
    console.log("Work time saved:", elapsedTime);
  });

  updateDisplay();
}

async function setElapsedTime(seconds) {
  const projects = storageCache.projects;
  const currentProject = await getCurrentProject();
  if (!currentProject) return;
  elapsedTime = seconds;

  currentProject.workTime = elapsedTime;

  chrome.storage.sync.set({ projects }, () => {
    console.log("Work time saved:", elapsedTime);
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "startStopwatch") startStopwatch();
  if (msg.action === "resetTimeSinceLastAction") resetTimeSinceLastAction();
});

let timeSinceLastAction = 0;
let isIdle = false;

function resetTimeSinceLastAction() {
  timeSinceLastAction = 0;
  if (isIdle) {
    isIdle = false;
    startStopwatch();
  }
}

function setIdle() {
  if (!isIdle) {
    pauseStopwatch();
    const timeAdjustedForIdle = elapsedTime - timeSinceLastAction;
    setElapsedTime(timeAdjustedForIdle);
    updateDisplay();
    isIdle = true;
  }
}

function checkIdle() {
  timeSinceLastAction++;
  const idleThreshold = 5;
  if (!isIdle && timeSinceLastAction > idleThreshold) {
    setIdle();
  }
}
