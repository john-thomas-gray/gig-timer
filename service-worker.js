"use strict";
import { projectTemplate, PROJECT_FIELDS } from "./utils/constants.js";
import { normalizeProjectData } from "./web-accessible-resources/normalization.js";

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
  console.log("activeId:", activeId);
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
          await setProjectUrl(project.id);
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

    if (msg.action === "export-project-data" && msg.projectId) {
      exportProjectData(msg.projectId);
    }
  });
}

function exportProjectData(projectId) {
  const projectData = getProjectById(projectId);

  function safeFilename(value) {
    return String(value)
      .trim()
      .replace(/[\/\\?%*:|"<>]/g, "_");
  }

  const result = JSON.stringify(projectData);
  const filename = `${safeFilename(projectData.title)}_${safeFilename(
    projectData.episode
  )}`;
  console.log("snapshot:", JSON.parse(JSON.stringify(projectData)));

  const url = "data:application/json;base64," + btoa(result);

  chrome.downloads.download({
    url,
    filename: filename,
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

async function setProjectUrl(id) {
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

function getProjectById(id) {
  const projects = storageCache.projects;
  const project = projects.find((p) => p.id === id);

  if (project) return project;
}

function storeWorkTime(workTime) {
  try {
    const projects = storageCache.projects;

    if (!currentProject) return;
    currentProject.work_time = workTime;

    storeProjects(projects, () => {
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
      formatAndNormalizeAssignmentData(response.payload.snapshot);
    }
  } catch (e) {
    console.warn("Failed to send message:", e);
    return;
  }
}

function formatAndNormalizeAssignmentData(snapshot) {
  try {
    const newProject = parseAssignmentData(snapshot);
    console.log("newProjecty", newProject);
    const normalizedProject = newProject.map((project) =>
      normalizeProjectData(project)
    );
    console.log("normalized", normalizedProject);
    const mergedProjects = mergeProjects(
      storageCache.projects || [],
      normalizedProject
    );
    console.log("mergey", mergedProjects);
    storeProjects(mergedProjects);
  } catch (error) {
    console.error("Failed to handle assignment snapshot:", error);
  }
}

function parseAssignmentData(snapshot) {
  const w2uiArray = snapshot.records;

  if (!Array.isArray(w2uiArray)) {
    throw new Error("Invalid data shape");
  }
  const w2ToProjectMap = {
    alpha_clients: "client",
    created_at: "date_assigned",
    due_date: "date_due",
    title: "title",
  };

  return w2uiArray.map((object) => {
    const projectWithConvertedKeys = {};

    Object.keys(object).forEach((key) => {
      if (!(key in w2ToProjectMap)) return;

      const formattedKey = w2ToProjectMap[key];
      projectWithConvertedKeys[formattedKey] = object[key];
    });

    projectWithConvertedKeys["runtime"] = Math.round(
      object.alpha_source_materials?.[0]?.program_runtime || 0
    );
    return projectWithConvertedKeys;
  });
}

function mergeProjects(existingProjects, newProjects) {
  const projectMap = new Map();

  existingProjects.forEach((p) => projectMap.set(p.id, p));

  newProjects.forEach((p) => {
    const existing = projectMap.get(p.id) || {};
    const merged = {};

    Object.keys(projectTemplate).forEach((key) => {
      if (key in p) merged[key] = p[key];
      else if (key in existing) merged[key] = existing[key];
      else merged[key] = projectTemplate[key];
    });

    merged.id = p.id;
    projectMap.set(p.id, merged);
  });

  return Array.from(projectMap.values());
}

function storeProjects(projects, callback) {
  storageCache.projects = projects;

  chrome.storage.sync.set({ projects }, () => {
    console.log("Projects saved:", projects);
    if (callback) callback();
  });
}
