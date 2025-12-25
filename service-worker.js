"use strict";
import { projectTemplate } from "./constants.js";
import { formatDate, formatTitleAndEpisode } from "./normalization.js";

const CONTINUE_PAGE = "__CONTINUE_PAGE__";

const storageCache = { count: 0, urls: {}, projects: [] };
let currentProject = null;
let currentTabId = null;
let currentUrl = null;

async function initStorageCache() {
  const items = await chrome.storage.sync.get(["count", "urls", "projects"]);
  Object.assign(storageCache, items);
}

async function initCurrentProject() {
  await initStorageCache();
  addListeners();

  const activeId = storageCache.lastProjectId;
  if (!activeId) return null;

  currentProject = getProjectById(activeId);

  return currentProject;
}

initCurrentProject();

function addListeners() {
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

  const onCompleteTimers = new Map();
  const DEBOUNCE_MS = 300;

  chrome.webNavigation.onCompleted.addListener(({ frameId, tabId, url }) => {
    if (frameId !== 0) return;

    clearTimeout(onCompleteTimers.get(tabId));

    const timer = setTimeout(async () => {
      onCompleteTimers.delete(tabId);

      currentTabId = tabId;
      currentUrl = url;

      const { assignments, workplace } = storageCache.urls;

      if (assignments && url.includes(assignments)) {
        await setUpAssignmentsPage();
      }

      if (workplace && url.includes(workplace)) {
        const id = await getWorkplaceId();
        const project = getProjectById(id);

        if (project) {
          currentProject = project;
          chrome.storage.sync.set({ lastProjectId: project.id });
          await setUpWorkplacePage(project.id);
          initStopwatch();
        }
      }
    }, DEBOUNCE_MS);

    onCompleteTimers.set(tabId, timer);
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "store-elapsed-time") {
      storeWorkTime(msg.elapsedTime || 0);
      return;
    }

    if (msg.action === "get-stored-worktime") {
      sendResponse(getCurrentWorktime());
      return;
    }

    if (msg.action === "get-stored-projects" && msg.source === "popup.js") {
      sendResponse(storageCache.projects);
      return;
    }

    runtimeMessageListener(msg, sender, sendResponse);
  });
}

function getCurrentWorktime() {
  console.log("getCurrentWorktime");

  if (!currentProject) {
    console.warn("Current project not found");
  }
  return currentProject?.work_time ?? 0;
}

async function getWorkplaceId() {
  try {
    if (!currentTabId) return null;
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

async function setUpWorkplacePage(id) {
  if (!id || id === CONTINUE_PAGE) return;
  setProjectUrl(id);
}

function setProjectUrl(id) {
  try {
    if (!currentProject || currentProject.workplace_url) return;

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
        currentProject.workplace_url
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
  const project = projects.find((p) => p.id.includes(workplaceId));
  console.log(project);
  if (project) return project;
}

function storeWorkTime(workTime) {
  try {
    const projects = storageCache.projects;

    if (!currentProject) return;
    currentProject.work_time = workTime;

    chrome.storage.sync.set({ projects }, () => {
      console.log("Work time saved:", workTime);
    });
  } catch (e) {
    console.error("Failed to set elapsed time:", e);
  }
}

function initStopwatch() {
  console.log("initstopwatch");
  try {
    chrome.tabs.sendMessage(currentTabId, {
      action: "init-stopwatch",
      source: "service-worker.js",
    });
  } catch (error) {
    console.error("Failed to initiate stopwatch:", error);
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

function handleAssignmentSnapshot(snapshot) {
  try {
    const w2uiData = snapshot.records;

    if (!Array.isArray(w2uiData)) {
      throw new Error("Invalid data shape");
    }

    const existingProjects = storageCache.projects || [];

    const newProjectArray = parseW2uiData(w2uiData);

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
  } catch (error) {
    console.error("Failed to handle assignment snapshot:", error);
  }
}

// W2UI Data Parsing

function parseW2uiData(w2uiArray) {
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
