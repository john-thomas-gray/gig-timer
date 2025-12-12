import { projectTemplate } from "./constants.js";
import { formatProjectId } from "./utils.js";

const storageCache = { count: 0, urls: {}, projects: [] };
let currentTabId = null;
let currentUrl = null;

async function initStorageCache() {
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

  if (url.includes(assignmentsUrl)) {
    chrome.tabs.sendMessage(currentTabId, {
      action: "REQUEST_ASSIGNMENTS_DATA",
    });
    console.log("on assignments page");
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
    action: "update-display",
    elapsedTime,
  });
}

function startStopwatch() {
  clearInterval(stopwatchInterval);
  chrome.tabs.sendMessage(currentTabId, { action: "create-stopwatch-element" });
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
  if (msg.action === "start-stopwatch") startStopwatch();
  if (msg.action === "reset-time-since-last-action") resetTimeSinceLastAction();

  if (msg.type === "RETURN_W2UI_DATA") {
    handleAssignmentSnapshot(msg.payload.snapshot);
    console.log("SW received return w2ui");
  }

  if (msg.type === "W2UI_DATA_ERROR") {
    console.warn("Failed to get assignment data:", msg.payload);
  }
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
    isIdle = true;
    pauseStopwatch();

    const adjustedElapsed = Math.max(elapsedTime - timeSinceLastAction, 0);
    elapsedTime = adjustedElapsed;

    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, {
        action: "update-display",
        elapsedTime: elapsedTime,
      });
    }

    setElapsedTime(adjustedElapsed);
  }
}

function checkIdle() {
  timeSinceLastAction++;
  const idleThreshold = 30;
  if (!isIdle && timeSinceLastAction > idleThreshold) {
    setIdle();
  }
}

// Assignments

async function handleAssignmentSnapshot(snapshot) {
  const w2uiData = snapshot.records;

  if (!Array.isArray(w2uiData)) return;

  const existingProjects = storageCache.projects || [];

  const newProjectArray = await parseW2uiData(w2uiData);

  const projectMap = new Map();
  existingProjects.forEach((p) => {
    const id = p.id || crypto.randomUUID();
    projectMap.set(id, p);
  });

  newProjectArray.forEach((p) => {
    const existing = projectMap.get(p.id) || {};
    const merged = {};

    Object.keys(projectTemplate).forEach((key) => {
      if (key in p) merged[key] = p[key];
      else if (key in existing) merged[key] = existing[key];
      else merged[key] = null;
    });

    merged.id = p.id;
    projectMap.set(p.id, merged);
  });

  const mergedProjects = Array.from(projectMap.values());
  storageCache.projects = mergedProjects;

  chrome.storage.sync.set({ projects: mergedProjects }, () => {
    console.log("Projects saved:", mergedProjects);
  });
}

// W2UI Data Parsing

async function parseW2uiData(w2uiArray) {
  return w2uiArray.map(getRelevantData);
}

const w2ToProjectMap = {
  alpha_clients: "client",
  created_at: "date_assigned",
  due_date: "date_due",
  title: "title",
};

function getRelevantData(object) {
  const newProjectData = {};

  Object.keys(object).forEach((key) => {
    if (key in w2ToProjectMap) {
      const formattedKey = w2ToProjectMap[key];
      let value = object[key];

      if (formattedKey === "date_due" || formattedKey === "date_assigned") {
        value = formatDate(value);
      } else if (formattedKey === "title") {
        const values = formatTitleAndEpisode(value);
        value = values.title;
        newProjectData["episode"] = values.episode;
      }

      newProjectData[formattedKey] = value;
    }
  });

  newProjectData["runtime"] = Math.round(
    object.alpha_source_materials?.[0]?.program_runtime || 0
  );
  newProjectData["id"] = formatProjectId(
    newProjectData.title,
    newProjectData.episode
  );

  return newProjectData;
}
// const formatProjectId = (title, episode) => {
//   const id = title + "_" + episode;
//   return id;
// };

function formatTitleAndEpisode(title) {
  const parts = title.split(":").map((part) => part.trim());

  let titleParts = [];
  let season = null;
  let episode = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const seasonMatch = part.match(/^Season (\d+)$/);
    if (seasonMatch) {
      season = seasonMatch[1];

      if (i + 1 < parts.length) {
        const episodeMatch = parts[i + 1].match(/^Episode (\d+)/);
        if (episodeMatch) episode = episodeMatch[1];
      }
      break;
    }
    titleParts.push(part);
  }

  const formattedTitle = titleParts.join(": ");
  const episodeFormatted = season && episode ? `S${season}_E${episode}` : null;

  return { title: formattedTitle, episode: episodeFormatted };
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
