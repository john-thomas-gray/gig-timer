import { projectTemplate } from "./constants.js";

const CONTINUE_PAGE = "__CONTINUE_PAGE__";

let stopwatchRunning = false;

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

  currentTabId = tabId;
  currentUrl = url;

  if (assignmentsUrl && url.includes(assignmentsUrl)) {
    setUpAssignmentsPage();
  } else if (workplaceUrl && url.includes(workplaceUrl)) {
    await setUpWorkplacePage();
  }
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
  try {
    workplaceId = await getWorkplaceId();

    if (workplaceId === CONTINUE_PAGE) {
      console.log("Skipping setup for continue page");
      return;
    }

    setProjectUrl(workplaceId);
    initStopwatch();
    startStopwatch();
  } catch (error) {
    console.error("Failed to set up workplace page:", error);
  }
}

function setProjectUrl(id) {
  try {
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
      console.log(`Updated workplace_url for project ${p.id}:`, workplace_url);
      storageCache.projects = updatedProjects;
    });
  } catch (e) {
    console.error("Failed to set project URL:", e);
  }
}

function getProjectById(workplaceId) {
  const projects = storageCache.projects;
  /* Bandaid making Id checking less strict
  project.id = "Betrayal: Secrets and Lies: Season 1: Episode 1: Episode 1 (E0001)"
  workplaceId = "Betrayal: Secrets and Lies: Season 1: Episode 1: Episode 1"
  */
  const currentProject = projects.find((p) => p.id.includes(workplaceId));
  if (currentProject) return currentProject;
}

function createStopwatchElement() {
  clearInterval(stopwatchInterval);
  chrome.tabs.sendMessage(currentTabId, { action: "create-stopwatch-element" });
}

function initStopwatch(tabId = null, url = null) {
  if (tabId) currentTabId = tabId;
  const currentProject = getProjectById(workplaceId);
  if (!currentProject) {
    console.warn("Current project not found");
    elapsedTime = 0;
    return;
  }
  elapsedTime = currentProject.work_time || 0;
  createStopwatchElement();
  updateDisplay();
}

function updateDisplay() {
  if (!currentTabId) return;
  try {
    checkIdle();
    chrome.tabs.sendMessage(currentTabId, {
      action: "update-display",
      elapsedTime,
    });
  } catch (error) {
    console.error("Failed to update display:", error);
  }
}

function startStopwatch() {
  clearInterval(stopwatchInterval);
  stopwatchInterval = setInterval(() => {
    elapsedTime++;
    updateDisplay();
  }, 1000);

  stopwatchRunning = true;
}

function pauseStopwatch() {
  try {
    if (!stopwatchRunning) return;

    const projects = storageCache.projects;

    const currentProject = getProjectById(workplaceId);

    clearInterval(stopwatchInterval);
    stopwatchInterval = null;
    stopwatchRunning = false;

    currentProject.work_time = elapsedTime;

    chrome.storage.sync.set({ projects }, () => {
      console.log("Work time saved:", elapsedTime);
    });

    updateDisplay();
  } catch (error) {
    console.error("Failed to pause stopwatch:", error);
  }
}

function setElapsedTime(seconds) {
  try {
    const projects = storageCache.projects;
    const currentProject = getProjectById(workplaceId);
    if (!currentProject) return;
    elapsedTime = seconds;

    currentProject.work_time = elapsedTime;

    chrome.storage.sync.set({ projects }, () => {
      console.log("Work time saved:", elapsedTime);
    });
  } catch (e) {
    console.error("Failed to set elapsed time:", e);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "unpause-stopwatch") unpauseStopwatch();
});

let timeSinceLastAction = 0;
let isIdle = false;

function unpauseStopwatch() {
  timeSinceLastAction = 0;
  if (isIdle) {
    isIdle = false;
    startStopwatch();
  }
}

function setIdle() {
  if (!isIdle) {
    isIdle = true;
    const adjustedElapsed = Math.max(elapsedTime - timeSinceLastAction, 0);
    elapsedTime = adjustedElapsed;

    pauseStopwatch();

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
  const idleThreshold = 5;
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
    if (!response) {
      console.warn("No response from content script");
      return;
    }
    if (response.type === "W2UI_DATA_ERROR") {
      throw new Error(
        `Error getting W2UI assignments data. Reason: ${response.payload.reason}. Current state: ${response.payload.state}`
      );
    }
    if (response.type === "RETURN_W2UI_DATA") {
      handleAssignmentSnapshot(response.payload.snapshot);
    }
  } catch (e) {
    console.warn("Failed to send message:", e);
    return;
  }
}

async function handleAssignmentSnapshot(snapshot) {
  try {
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
  } catch (e) {
    console.error("Failed to handle assignment snapshot:", error);
  }
}

// W2UI Data Parsing

async function parseW2uiData(w2uiArray) {
  return w2uiArray.map(getProjectData);
}

const w2ToProjectMap = {
  alpha_clients: "client",
  created_at: "date_assigned",
  due_date: "date_due",
  title: "title",
};

function getProjectData(object) {
  const newProjectData = {};

  Object.keys(object).forEach((key) => {
    if (key in w2ToProjectMap) {
      const formattedKey = w2ToProjectMap[key];
      let value = object[key];

      if (formattedKey === "date_due" || formattedKey === "date_assigned") {
        try {
          value = formatDate(value);
        } catch (e) {
          console.error("Failed to format date:", e);
        }
      } else if (formattedKey === "title") {
        try {
          const values = formatTitleAndEpisode(value);
          value = values.title;
          newProjectData["episode"] = values.episode;
          newProjectData["id"] = object["title"];
        } catch (e) {
          console.error("Failed to format title or episode:", e);
        }
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

/* Add the inject-bridge calls here. Need to be able to check that we are on the right dynamic url */
