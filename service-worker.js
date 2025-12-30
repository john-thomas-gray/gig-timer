"use strict";
import { projectTemplate } from "./utils/constants.js";
import { normalizeProjectData } from "./web-accessible-resources/normalization.js";
import { exportProjectData } from "./exporters/jsonExporter.js";
import { calculateHourlyRate } from "./web-accessible-resources/normalization.js";

const storageCache = { count: 0, urls: {}, projects: [] };
let currentProject = null;
let currentTabId = null;
let currentUrl = null;
let hasAddedListeners = false;

async function initStorageCache() {
  const items = await chrome.storage.sync.get([
    "count",
    "urls",
    "projects",
    "lastProjectId",
  ]);
  Object.assign(storageCache, items);
}

async function initCurrentProject() {
  await initStorageCache();

  const activeId = storageCache.lastProjectId;
  if (!activeId) return null;
  currentProject = getProjectById(activeId);

  return currentProject;
}

initCurrentProject();
addListeners();

function addListeners() {
  if (hasAddedListeners) return;
  hasAddedListeners = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync") {
      for (const key in changes) {
        if (storageCache.hasOwnProperty(key)) {
          storageCache[key] = changes[key].newValue;
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
        console.log("id:", id);
        const project = getProjectById(id, url);
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
      const projectData = getProjectById(msg.projectId);
      exportProjectData(projectData);
    }
  });
}

function getCurrentWorktime() {
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
    storeProjects(updatedProjects);
  } catch (e) {
    console.error("Failed to set project URL:", e);
  }
}

function getProjectById(id, url) {
  const projects = storageCache.projects;
  if (url && !projects && id !== "__CONTINUE_PAGE__") {
    storeProjects({
      id: id,
      contractor: "Pixelogic Media",
      workplace_url: url,
    });
    return;
  }
  const project = projects.find((p) => p.id === id);

  if (project) return project;
}

function storeWorkTime(workTime) {
  try {
    if (!currentProject) return;

    const invoiceAmount = Number(currentProject.invoice_amount);
    const seconds = Number(workTime);

    if (
      Number.isFinite(invoiceAmount) &&
      Number.isFinite(seconds) &&
      seconds > 0
    ) {
      currentProject.hourly_rate = calculateHourlyRate(invoiceAmount, seconds);
    }

    currentProject.work_time = seconds;
    storeProjects(currentProject);
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

// Assignments

async function setUpAssignmentsPage() {
  let response;
  try {
    response = await chrome.tabs.sendMessage(currentTabId, {
      action: "request-assignments-data",
    });
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
    const normalizedProject = newProject.map((project) =>
      normalizeProjectData(project)
    );
    const mergedProjects = mergeProjects(
      storageCache.projects || [],
      normalizedProject
    );
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
  chrome.storage.sync.get(["projects"], (result) => {
    let updatedProjects = [];

    if (Array.isArray(projects)) {
      updatedProjects = projects;
    } else {
      const existingProjects = result.projects || [];

      updatedProjects = existingProjects.map((p) =>
        p.id === projects.id ? projects : p
      );

      if (!updatedProjects.some((p) => p.id === projects.id)) {
        updatedProjects.push(projects);
      }
    }

    storageCache.projects = updatedProjects;

    chrome.storage.sync.set({ projects: updatedProjects }, () => {
      if (callback) callback();
    });
  });
}
