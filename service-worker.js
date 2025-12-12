import { projectTemplate } from "./constants.js";
import { formatProjectId } from "./utils.js";

const storageCache = { count: 0, urls: {}, projects: [] };
let currentTabId = null;
let currentUrl = null;
let workplaceId = null;

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

  currentTabId = tabId;
  currentUrl = url;
  /* CHECK URLS */
  if (url.includes(assignmentsUrl)) {
    setUpAssignmentsPage();
  } else if (url.includes(workplaceUrl)) {
    await setUpWorkplacePage();
  }
  /* CHECK URLS */
});

chrome.tabs.onRemoved.addListener(() => {
  pauseStopwatch();
});

let stopwatchInterval = null;
let elapsedTime = 0;

async function getWorkplaceId() {
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, {
      action: "request-workplace-id",
      source: "service-worker.js",
    });

    const id = response.data;

    return id;
  } catch (error) {
    console.error("Failed to get workplace ID:", error);
    return null;
  }
}

async function setUpWorkplacePage() {
  workplaceId = await getWorkplaceId();
  if (!workplaceId) {
    console.error("Failed to set up workpage. No workplaceId.");
    return;
  }

  setProjectUrl(workplaceId);
  initStopwatch();
  startStopwatch();
}

function setProjectUrl(id) {
  const p = getProjectById(id);

  if (p.workplace_url) return;
  p.workplace_url = currentUrl;

  const updatedProjects = storageCache.projects.map((project) => {
    if (project.id === id) {
      return { ...project, workplace_url: currentUrl };
    }
    return project;
  });

  chrome.storage.sync.set({ projects: updatedProjects }, () => {
    console.log(`Updated workplace_url for project ${p.id}:`, url);
    storageCache.projects = updatedProjects;
  });
}

function getProjectById(workplaceId) {
  const projects = storageCache.projects;
  /* Bandaid making Id checking less strict
  project.id = "Betrayal: Secrets and Lies: Season 1: Episode 1: Episode 1 (E0001)"
  workplaceId = "Betrayal: Secrets and Lies: Season 1: Episode 1: Episode 1"
  */
  const currentProject = projects.find((p) => p.id.includes(workplaceId));
  if (!currentProject) {
    console.warn("No project corresponding to id:", workplaceId);
    return;
  }
  return currentProject;
}

function initStopwatch(tabId = null, url = null) {
  if (tabId) currentTabId = tabId;
  const currentProject = getProjectById(workplaceId);
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

function pauseStopwatch() {
  const projects = storageCache.projects;

  const currentProject = getProjectById(workplaceId);

  clearInterval(stopwatchInterval);
  stopwatchInterval = null;

  if (!currentProject) return;
  currentProject.workTime = elapsedTime;

  chrome.storage.sync.set({ projects }, () => {
    console.log("Work time saved:", elapsedTime);
  });

  updateDisplay();
}

function setElapsedTime(seconds) {
  const projects = storageCache.projects;
  const currentProject = getProjectById(workplaceId);
  if (!currentProject) return;
  elapsedTime = seconds;

  currentProject.workTime = elapsedTime;

  chrome.storage.sync.set({ projects }, () => {
    console.log("Work time saved:", elapsedTime);
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "reset-time-since-last-action") resetTimeSinceLastAction();
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

async function setUpAssignmentsPage() {
  let response;
  try {
    response = await chrome.tabs.sendMessage(currentTabId, {
      action: "request-assignments-data",
    });
    console.log(response);
  } catch (e) {
    console.warn("Failed to send message:", e);
    return;
  }
  if (!response) {
    console.warn("No response from content script");
    return;
  }
  if (response.type === "W2UI_DATA_ERROR") {
    throw new Error(
      "Error getting W2UI assignments data. Reason:",
      response.payload.reason,
      "Current state:",
      response.payload.state
    );
  }
  if (response.type === "RETURN_W2UI_DATA") {
    handleAssignmentSnapshot(response.payload.snapshot);
  }
}

async function handleAssignmentSnapshot(snapshot) {
  const w2uiData = snapshot.records;

  if (!Array.isArray(w2uiData)) {
    throw new Error("Invalid data shape");
  }

  const existingProjects = storageCache.projects || [];

  const newProjectArray = await parseW2uiData(w2uiData);

  const projectMap = new Map();
  existingProjects.forEach((p) => {
    const id = p.id;
    projectMap.set(id, p);
  });

  newProjectArray.forEach((p) => {
    const existing = projectMap.get(p.id) || {};
    const merged = {};

    Object.keys(projectTemplate).forEach((key) => {
      if (key in p) {
        merged[key] = p[key];
      } else if (key in existing) merged[key] = existing[key];
      else merged[key] = projectTemplate[key];
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
        newProjectData["id"] = object["title"];
      }

      newProjectData[formattedKey] = value;
    }
  });

  newProjectData["runtime"] = Math.round(
    object.alpha_source_materials?.[0]?.program_runtime || 0
  );

  return newProjectData;
}

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
