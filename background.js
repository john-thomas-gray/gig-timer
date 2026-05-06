"use strict";
import {
  buildProjectId,
  normalizeProjectData,
  parseRawProjectId,
} from "./web-accessible-resources/normalization.js";
import { exportProjectData } from "./exporters/sheetsExporter.js";
import {
  calculateHourlyRate,
  calculateInvoiceAmount,
} from "./web-accessible-resources/normalization.js";

const storageCache = { count: 0, urls: {}, lastProjectId: "" };

const sheetsData = {
  deploymentId:
    "AKfycbzlwJIjdvhhUjHa_wUI6mVdMiv10FZKEckMjzWvlyRiUaYYPOOgJeGFKOT1Fb8bscU7Iw",
  spreadSheetId: "1q-BG4u62IEdBW1ewPEkyd8V3scm4Lsbcgl30OdtquCo",
  spreadSheetName: "Sheet2",
};

const WORKPLACE_CONTENT_FILES = ["content/workplace.js"];
const STOPWATCH_CONTENT_FILES = ["content/stopwatch.js"];
const ASSIGNMENTS_CONTENT_FILES = [
  "content/inject-bridge.js",
  "content/assignments.js",
];

let hasAddedListeners = false;

init();

async function initStorageCache() {
  const items = await chrome.storage.sync.get([
    "count",
    "urls",
    "lastProjectId",
  ]);
  Object.assign(storageCache, items);
}

async function init() {
  await initStorageCache();
  await addListeners();
}

async function addListeners() {
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

      const assignments = storageCache.urls?.assignments?.trim();
      const workplace = storageCache.urls?.workplace?.trim();

      if (!assignments || !workplace) {
        console.warn(
          "Missing required assignment and/or workplace url. Set in Options.",
        );
        return;
      }

      if (url.includes(assignments)) {
        await setUpAssignmentsPage(tabId);
        console.log("Assignments runs");
      }

      if (url.includes(workplace)) {
        const project = await getWorkplaceProject("webNavigation", tabId);
        if (project?.id) {
          chrome.storage.sync.set({ lastProjectId: project.id });
          await upsertProjects(project);
          initStopwatch(tabId);
        }
        console.log("workplace runs");
      }
    }, DEBOUNCE_MS);

    onCompleteTimers.set(tabId, timer);
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.action) return;

    if (msg.action === "store-elapsed-time") {
      console.log("store-elapsed-time runs");
      (async () => {
        try {
          const workTimeValue = msg.elapsedTime ?? 0;

          const workplaceId = await getWorkplaceId(
            "store-elapsed-time",
            sender?.tab?.id,
          );
          const project = await getProjects(workplaceId);
          const invoiceAmount = calculateInvoiceAmount(
            project?.rate,
            project?.runtime,
          );
          if (!workplaceId) {
            throw new Error("Workplace ID not found");
          }
          await upsertProjects({
            id: workplaceId,
            work_time: workTimeValue,
            invoice_amount: invoiceAmount,
            hourly_rate: calculateHourlyRate(invoiceAmount, workTimeValue),
          });
        } catch (e) {
          console.error("Failed to store elapsed time", e);
        }
      })();
      return;
    }

    if (msg.action === "get-stored-worktime") {
      console.log("get-stored-worktime runs");
      getStoredProjectValue("work_time", sender?.tab?.id).then((workTime) => {
        sendResponse(workTime);
      });
      return true;
    }

    if (msg.action === "get-stored-projects" && msg.source === "popup.js") {
      getProjects().then((projects) => {
        sendResponse(projects);
      });
      return true;
    }

    if (msg.action === "export-project-data" && msg.source === "popup.js") {
      getProjects(msg.projectId).then((projectData) => {
        exportProjectData(projectData, sheetsData);
      });
    }
  });
}
async function getProjects(id) {
  const result = await chrome.storage.sync.get("projects");
  const projects = Array.isArray(result.projects) ? result.projects : [];

  if (!id) return projects;

  const currentProject = projects.find((p) => p.id === id);
  return currentProject || undefined;
}

async function getStoredProjectValue(key, tabId) {
  try {
    if (!key) throw new Error("Key must be provided");
    console.log("getStoredProjectValue: ", key);
    const id = await getWorkplaceId("getStoredProjectValue", tabId);
    if (!id) return undefined;

    const currentProject = await getProjects(id);
    if (!currentProject) return undefined;

    return currentProject[key] ?? undefined;
  } catch (e) {
    console.error(`Failed to get project value for key "${key}":`, e);
    return undefined;
  }
}

async function getWorkplaceId(calledBy, tabIdOverride) {
  const project = await getWorkplaceProject(calledBy, tabIdOverride);
  return project?.id ?? storageCache.lastProjectId ?? undefined;
}

async function getWorkplaceProject(calledBy, tabIdOverride) {
  try {
    const targetTabId = tabIdOverride;
    console.log("targetTabId:", targetTabId);
    if (!targetTabId) return getLastProjectFallback();
    const tab = await chrome.tabs.get(targetTabId);
    const tabUrl = tab?.url;

    const response = await sendTabMessage(
      targetTabId,
      {
        action: "request-workplace-id",
        source: "background.js",
      },
      { injectFiles: WORKPLACE_CONTENT_FILES },
    );
    console.log("response", response);

    const project = await normalizeWorkplaceResponseData(response?.data, tabUrl);
    return project ?? (await getLastProjectFallback());
  } catch (e) {
    console.error(`${calledBy ?? "We"} failed to get workplace project:`, e);
    if (tabIdOverride) {
      try {
        const tab = await chrome.tabs.get(tabIdOverride);
        if (tab?.url && !tab.url.includes("authoring.netflixstudios.com")) {
          return normalizeWorkplaceResponseData(tab.url, tab.url);
        }
      } catch (tabError) {
        console.error("Fallback tab URL lookup failed:", tabError);
      }
    }
    return getLastProjectFallback();
  }
}

async function normalizeWorkplaceResponseData(data, tabUrl) {
  if (!data) return undefined;
  if (data === "__CONTINUE_PAGE__") {
    console.log("Handled Continue page.");
    return undefined;
  }

  if (typeof data === "string") {
    const parsedId = parseRawProjectId(data);
    return normalizeProjectData({
      id: parsedId ?? data,
      title: data,
      workplace_url: tabUrl,
    });
  }

  if (typeof data !== "object") return undefined;

  const projectData = {
    ...data,
    workplace_url: data.workplace_url ?? tabUrl,
  };
  projectData.id = buildProjectId(projectData);
  return normalizeProjectData(projectData);
}

async function getLastProjectFallback() {
  if (!storageCache.lastProjectId) return undefined;

  const project = await getProjects(storageCache.lastProjectId);
  return project ?? { id: storageCache.lastProjectId };
}

async function sendTabMessage(tabId, message, options = {}) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) throw error;

    const injected = await injectContentScripts(tabId, options.injectFiles);
    if (!injected) {
      console.warn("No content-script receiver for message:", message.action);
      return undefined;
    }

    await sleep(150);

    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (retryError) {
      if (isMissingReceiverError(retryError)) {
        console.warn(
          "Content-script receiver still unavailable:",
          message.action,
        );
        return undefined;
      }

      throw retryError;
    }
  }
}

async function injectContentScripts(tabId, files = []) {
  if (!files.length || !chrome.scripting?.executeScript) return false;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!canInjectIntoUrl(tab?.url)) return false;

    await chrome.scripting.executeScript({
      target: { tabId },
      files,
    });
    return true;
  } catch (error) {
    console.warn("Unable to inject content scripts:", error);
    return false;
  }
}

function isMissingReceiverError(error) {
  return /receiving end does not exist|could not establish connection/i.test(
    error?.message ?? "",
  );
}

function canInjectIntoUrl(url) {
  return /^https?:\/\//i.test(url ?? "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDefinedProjectValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function mergeProjectData(existingProject, nextProject) {
  const merged = { ...existingProject };
  Object.keys(nextProject).forEach((key) => {
    if (isDefinedProjectValue(nextProject[key])) {
      merged[key] = nextProject[key];
    }
  });

  return merged;
}

async function upsertProjects(projects) {
  const isSingle = !Array.isArray(projects);
  const projectArray = isSingle ? [projects] : projects;

  const currentProjects = (await getProjects()) || [];
  const updatedProjects = [...currentProjects];

  projectArray.forEach((project) => {
    if (!project.id) return;

    const index = updatedProjects.findIndex((p) => p.id === project.id);

    if (index >= 0) {
      updatedProjects[index] = mergeProjectData(updatedProjects[index], project);
    } else {
      updatedProjects.push(project);
    }
  });
  console.log("updatedProjects", updatedProjects);

  await chrome.storage.sync.set({ projects: updatedProjects });
}

async function initStopwatch(tabId) {
  try {
    if (!tabId) return;
    await sendTabMessage(
      tabId,
      {
        action: "init-stopwatch",
        source: "background.js",
      },
      { injectFiles: STOPWATCH_CONTENT_FILES },
    );
    console.log("sent init stopwatch");
  } catch (e) {
    console.error("Failed to initiate stopwatch:", e);
  }
}

// Assignments

async function setUpAssignmentsPage(tabId) {
  let response;
  try {
    if (!tabId) return;
    response = await sendTabMessage(
      tabId,
      {
        action: "request-assignments-data",
      },
      { injectFiles: ASSIGNMENTS_CONTENT_FILES },
    );
    if (!response) {
      console.warn("No response from content script");
      return;
    }
    if (response.type === "W2UI_DATA_ERROR") {
      throw new Error(
        `Error getting W2UI assignments data. Reason: ${response.payload.reason}. Current state: ${response.payload.state}`,
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

async function formatAndNormalizeAssignmentData(snapshot) {
  try {
    const newProject = parseAssignmentData(snapshot);
    const normalizedProject = newProject.map((project) =>
      normalizeProjectData(project),
    );
    await upsertProjects(normalizedProject);
  } catch (e) {
    console.error("Failed to handle assignment snapshot:", e);
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
      object.alpha_source_materials?.[0]?.program_runtime || 0,
    );
    return projectWithConvertedKeys;
  });
}
