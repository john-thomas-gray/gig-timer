"use strict";
import { projectTemplate } from "./utils/constants.js";
import { normalizeProjectData } from "./web-accessible-resources/normalization.js";
import { exportProjectData } from "./exporters/sheetsExporter.js";
import {
  calculateHourlyRate,
  calculateInvoiceAmount,
} from "./web-accessible-resources/normalization.js";

const storageCache = { count: 0, urls: {}, lastProjectId: "" };
let currentTabId = undefined;
let currentUrl = undefined;
let hasAddedListeners = false;
/* WARNING: Do not save to public repo */
const sheetsData = {
  deploymentId:
    "AKfycbzYBAvjXw5Dpokzx1U2gI9zJZh8UbnBKItOI5sJ8MxS7kLzUmrqLptFuuMHUzDfUSFJTg",
  spreadSheetId: "1LcXPLmbIF7r8zC2z2got9wfbCxAMCRPPd65M4kaRBm0",
  spreadSheetName: "Sheet2",
};

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

      currentTabId = tabId;
      currentUrl = url;

      const { assignments, workplace } = storageCache.urls;

      if (assignments && url.includes(assignments)) {
        await setUpAssignmentsPage();
      }

      if (workplace && url.includes(workplace)) {
        const id = await getWorkplaceId();
        if (id) {
          chrome.storage.sync.set({ lastProjectId: id });
          await createProjectFromTemplate(id);
          await upsertProjects({ id: id, workplace_url: url });
          initStopwatch();
        }
      }
    }, DEBOUNCE_MS);

    onCompleteTimers.set(tabId, timer);
  });

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "store-elapsed-time") {
      (async () => {
        try {
          const workTimeValue = msg.elapsedTime ?? 0;

          const workplaceId = await getWorkplaceId();
          const project = await getProjects(workplaceId);
          const invoiceAmount = calculateInvoiceAmount(
            project.rate,
            project.runtime
          );
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
      getStoredProjectValue("work_time").then((workTime) => {
        sendResponse(workTime ?? 0);
      });
      return true;
    }

    if (msg.action === "get-stored-projects" && msg.source === "popup.js") {
      getProjects().then((projects) => {
        sendResponse(projects);
      });
      return true;
    }

    if (msg.action === "export-project-data" && msg.projectId) {
      getProjects(msg.projectId).then((projectData) => {
        exportProjectData(projectData, sheetsData);
      });
      return true;
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

async function createProjectFromTemplate(id) {
  try {
    const projectData = {
      ...projectTemplate,
      id,
    };
    await upsertProjects(projectData);
  } catch (e) {
    console.error("Failed to create template project", e);
  }
}

async function getStoredProjectValue(key) {
  try {
    if (!key) throw new Error("Key must be provided");

    const id = await getWorkplaceId();
    if (!id) return undefined;

    const currentProject = await getProjects(id);
    if (!currentProject) return undefined;

    return currentProject[key] ?? undefined;
  } catch (e) {
    console.error(`Failed to get project value for key "${key}":`, e);
    return undefined;
  }
}

async function getWorkplaceId() {
  try {
    if (!currentTabId) return undefined;
    const response = await chrome.tabs.sendMessage(currentTabId, {
      action: "request-workplace-id",
      source: "background.js",
    });

    const id = response.data;
    if (id === "__CONTINUE_PAGE__") {
      console.log("Handled Continue page.");
      return;
    }
    return id;
  } catch (e) {
    console.error("Failed to get workplace ID:", e);
    return undefined;
  }
}

function initStopwatch() {
  try {
    chrome.tabs.sendMessage(currentTabId, {
      action: "init-stopwatch",
      source: "background.js",
    });
  } catch (e) {
    console.error("Failed to initiate stopwatch:", e);
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

async function formatAndNormalizeAssignmentData(snapshot) {
  try {
    const newProject = parseAssignmentData(snapshot);
    const normalizedProject = newProject.map((project) =>
      normalizeProjectData(project)
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
      object.alpha_source_materials?.[0]?.program_runtime || 0
    );
    return projectWithConvertedKeys;
  });
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
      Object.keys(project).forEach((key) => {
        if (project[key] !== undefined) {
          updatedProjects[index][key] = project[key];
        }
      });
    } else {
      updatedProjects.push(project);
    }
  });

  await chrome.storage.sync.set({ projects: updatedProjects });
}
