"use strict";
import { projectTemplate } from "./constants.js";
import { formatDate, formatTitleAndEpisode } from "./normalization.js";

const CONTINUE_PAGE = "__CONTINUE_PAGE__";

const storageCache = { count: 0, urls: {}, projects: [] };
let currentProject = null;
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

async function initCurrentProject() {
  initStorageCache();

  if (!workplaceId) {
    workplaceId = await getWorkplaceId();
  }

  if (!workplaceId || workplaceId === CONTINUE_PAGE) {
    currentProject = null;
    return null;
  }

  currentProject = getProjectById(workplaceId || null);
  return currentProject;
}

initCurrentProject();

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

  injectBridge();
  if (assignmentsUrl && url.includes(assignmentsUrl)) {
    setUpAssignmentsPage();
  } else if (workplaceUrl && url.includes(workplaceUrl)) {
    await setUpWorkplacePage();
    initStopwatch();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "store-elapsed-time") storeWorkTime(msg.elapsedTime || 0);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "get-stored-worktime") {
    getCurrentWorktime().then(sendResponse);
  }
  if (msg.action === "get-stored-projects") {
    if (msg.source === "popup.js") {
      storageCache.projects.then(sendResponse);
    }
  }
  return true;
});

async function getCurrentWorktime() {
  console.log("getCurrentWorktime");

  if (!currentProject) {
    console.warn("Current project not found");
  }
  const currentWorktime = currentProject.work_time || 0;

  return currentWorktime;
}

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
  } catch (error) {
    console.error("Failed to set up workplace page:", error);
  }
}

function setProjectUrl(id) {
  try {
    if (currentProject.workplace_url) return;
    currentProject.workplace_url = currentUrl;

    const updatedProjects = storageCache.projects.map((project) => {
      if (project.id === id) {
        return { ...project, workplace_url: currentUrl };
      }
      return project;
    });

    chrome.storage.sync.set({ projects: updatedProjects }, () => {
      console.log(
        `Updated workplace_url for project ${currentProject.id}:`,
        workplace_url
      );
      storageCache.projects = updatedProjects;
    });
  } catch (e) {
    console.error("Failed to set project URL:", e);
  }
}

function getProjectById(workplaceId) {
  console.log(workplaceId);
  const projects = storageCache.projects;
  /* Bandaid making Id checking less strict
  project.id = "Betrayal: Secrets and Lies: Season 1: Episode 1: Episode 1 (E0001)"
  workplaceId = "Betrayal: Secrets and Lies: Season 1: Episode 1: Episode 1"
  */
  const currentProject = projects.find((p) => p.id.includes(workplaceId));
  console.log(currentProject);
  if (currentProject) return currentProject;
}

function storeWorkTime(workTime) {
  try {
    const projects = storageCache.projects;

    currentProject.work_time = workTime;

    chrome.storage.sync.set({ projects }, () => {
      console.log("Work time saved:", workTime);
    });
  } catch (e) {
    console.error("Failed to set elapsed time:", e);
  }
}

function initStopwatch() {
  try {
    chrome.tabs.sendMessage(currentTabId, {
      action: "init-stopwatch",
      source: "service-worker.js",
    });
  } catch (error) {
    console.error("Failed to initiate stopwatch:", error);
  }
}
function injectBridge() {
  try {
    chrome.tabs.sendMessage(currentTabId, {
      action: "inject-bridge",
      source: "service-worker.js",
    });
  } catch (error) {
    console.error("Failed to inject bridge:", error);
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

/* Add the inject-bridge calls here. Need to be able to check that we are on the right dynamic url */
