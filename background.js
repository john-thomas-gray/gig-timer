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
import {
  isAssignmentsUrl,
  isPixelogicCompositionProjectUrl,
  isTimerPageUrl,
  isWorkplaceUrl,
} from "./utils/pixelogic.js";

const LOG_PREFIX = "[Gig Timer]";
const NETFLIX_AUTHORING_HOST = "authoring.netflixstudios.com";
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
const COMPOSITION_METADATA_RETRY_ATTEMPTS = 6;
const COMPOSITION_METADATA_RETRY_DELAY_MS = 500;

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

  const navigationTimers = new Map();
  const DEBOUNCE_MS = 300;

  const handleTimerPageNavigation = ({ frameId, tabId, url }) => {
    if (frameId !== 0) return;

    clearTimeout(navigationTimers.get(tabId));

    const timer = setTimeout(async () => {
      navigationTimers.delete(tabId);

      const assignments = storageCache.urls?.assignments?.trim();
      const workplace = storageCache.urls?.workplace?.trim();
      const isAssignmentPage = isAssignmentsUrl(url, assignments);
      const isWorkplacePage = isWorkplaceUrl(url, workplace);
      const isCompositionProject = isPixelogicCompositionProjectUrl(url);
      const isNetflixAuthoringPage = isNetflixAuthoringUrl(url);
      const shouldShowStopwatch = isTimerPageUrl(url, { workplace });

      if (!isAssignmentPage && !isWorkplacePage && !isNetflixAuthoringPage) {
        return;
      }

      console.log(`${LOG_PREFIX} Processing timer page navigation`, {
        isAssignmentPage,
        isCompositionProject,
        isNetflixAuthoringPage,
        isWorkplacePage,
        shouldShowStopwatch,
        tabId,
        url,
      });

      if (isAssignmentPage) {
        console.log(`${LOG_PREFIX} Assignment page recognized`, { tabId, url });
        const projects = isCompositionProject
          ? await setUpCompositionProjectPage(tabId)
          : await setUpAssignmentsPage(tabId);
        if (isCompositionProject) {
          const project = projects?.find((candidate) => candidate?.id);
          if (project?.id) {
            const existingProject = await getMatchingProject(project);
            const projectId =
              getPreferredProjectId(project, existingProject) ?? project.id;
            storageCache.lastProjectId = projectId;
            await chrome.storage.sync.set({ lastProjectId: projectId });
            console.log(
              `${LOG_PREFIX} Composition project stored; starting stopwatch`,
              { projectId, tabId },
            );
            await initStopwatch(tabId);
          } else {
            console.warn(
              `${LOG_PREFIX} Composition project recognized but no project metadata was found`,
              { tabId, url },
            );
          }
        }
      }

      if (isNetflixAuthoringPage) {
        console.log(`${LOG_PREFIX} Netflix authoring page recognized`, {
          tabId,
          url,
        });
        const project = await getWorkplaceProject("webNavigation", tabId);
        if (project?.id) {
          storageCache.lastProjectId = project.id;
          await chrome.storage.sync.set({ lastProjectId: project.id });
          await upsertProjects(project);
          await initStopwatch(tabId);
        } else {
          console.warn(
            `${LOG_PREFIX} Netflix authoring page had no project metadata`,
            {
              tabId,
              url,
            },
          );
        }
      }

      if (isWorkplacePage) {
        console.log(`${LOG_PREFIX} Workplace page recognized`, { tabId, url });
        const project = await getWorkplaceProject("webNavigation", tabId);
        if (project?.id) {
          await chrome.storage.sync.set({ lastProjectId: project.id });
          await upsertProjects(project);
          if (shouldShowStopwatch) {
            console.log(
              `${LOG_PREFIX} Workplace project stored; starting stopwatch`,
              { projectId: project.id, tabId },
            );
            await initStopwatch(tabId);
          } else {
            console.log(
              `${LOG_PREFIX} Workplace project stored without starting stopwatch`,
              { projectId: project.id, tabId },
            );
          }
        } else {
          console.warn(`${LOG_PREFIX} Workplace page had no project metadata`, {
            tabId,
            url,
          });
        }
      }
    }, DEBOUNCE_MS);

    navigationTimers.set(tabId, timer);
  };

  chrome.webNavigation.onCompleted.addListener(handleTimerPageNavigation);
  chrome.webNavigation.onHistoryStateUpdated?.addListener(
    handleTimerPageNavigation,
  );

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.action) return;

    if (msg.action === "store-elapsed-time") {
      console.log(`${LOG_PREFIX} Store elapsed time requested`, {
        elapsedTime: msg.elapsedTime,
        tabId: sender?.tab?.id,
      });
      (async () => {
        try {
          const workTimeValue = msg.elapsedTime ?? 0;
          const currentProject = await getWorkplaceProject(
            "store-elapsed-time",
            sender?.tab?.id,
          );
          const existingProject = currentProject
            ? await getMatchingProject(currentProject)
            : undefined;
          const workplaceId =
            getPreferredProjectId(currentProject, existingProject) ??
            storageCache.lastProjectId;
          const project = currentProject
            ? mergeProjectData(existingProject ?? {}, {
                ...currentProject,
                id: workplaceId,
              })
            : existingProject;
          const invoiceAmount = calculateInvoiceAmount(
            project?.rate,
            project?.runtime,
          );
          if (!workplaceId) {
            throw new Error("Workplace ID not found");
          }
          storageCache.lastProjectId = workplaceId;
          await chrome.storage.sync.set({ lastProjectId: workplaceId });
          await upsertProjects({
            ...(currentProject ?? {}),
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
      console.log(`${LOG_PREFIX} Stored work time requested`, {
        tabId: sender?.tab?.id,
      });
      getStoredProjectValue("work_time", sender?.tab?.id).then((workTime) => {
        console.log(`${LOG_PREFIX} Stored work time response`, {
          tabId: sender?.tab?.id,
          workTime,
        });
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

function isNetflixAuthoringUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === NETFLIX_AUTHORING_HOST &&
      parsed.pathname.startsWith("/editor")
    );
  } catch {
    return false;
  }
}

async function getProjects(id) {
  const result = await chrome.storage.sync.get("projects");
  const projects = Array.isArray(result.projects) ? result.projects : [];

  if (!id) return projects;

  const currentProject = projects.find((p) => p.id === id);
  return currentProject || undefined;
}

async function getMatchingProject(project) {
  if (!project) return undefined;
  const projects = await getProjects();
  return projects.find((existingProject) =>
    matchesProject(existingProject, project),
  );
}

async function getStoredProjectValue(key, tabId) {
  try {
    if (!key) throw new Error("Key must be provided");
    console.log(`${LOG_PREFIX} Looking up stored project value`, { key, tabId });
    const project = await getWorkplaceProject("getStoredProjectValue", tabId);
    const matchingProject = project ? await getMatchingProject(project) : undefined;
    const id =
      getPreferredProjectId(project, matchingProject) ?? storageCache.lastProjectId;
    if (!id && !project) return undefined;

    if (project?.id && id) {
      await upsertProjects({ ...project, id });
      storageCache.lastProjectId = id;
      await chrome.storage.sync.set({ lastProjectId: id });
    }

    const currentProject =
      (id ? await getProjects(id) : undefined) ??
      (project ? await getMatchingProject(project) : undefined);
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
    console.log(`${LOG_PREFIX} Resolving workplace project`, {
      calledBy,
      tabId: targetTabId,
    });
    if (!targetTabId) return getLastProjectFallback();
    const tab = await chrome.tabs.get(targetTabId);
    const tabUrl = tab?.url;
    console.log(`${LOG_PREFIX} Requesting workplace metadata from tab`, {
      tabId: targetTabId,
      tabUrl,
    });

    const response = await sendTabMessage(
      targetTabId,
      {
        action: "request-workplace-id",
        source: "background.js",
      },
      { injectFiles: WORKPLACE_CONTENT_FILES },
    );
    console.log(`${LOG_PREFIX} Workplace metadata response received`, {
      hasData: Boolean(response?.data),
      tabId: targetTabId,
      type: typeof response?.data,
    });

    const project = await normalizeWorkplaceResponseData(response?.data, tabUrl);
    console.log(`${LOG_PREFIX} Workplace metadata normalized`, {
      projectId: project?.id,
      tabId: targetTabId,
    });
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

function getPreferredProjectId(nextProject, existingProject) {
  if (
    existingProject?.id &&
    isPixelogicFallbackProject(nextProject) &&
    !isPixelogicFallbackProject(existingProject)
  ) {
    return existingProject.id;
  }

  return nextProject?.id ?? existingProject?.id;
}

function isPixelogicFallbackProject(project) {
  if (!project) return false;

  return (
    isPixelogicFallbackProjectValue(project.id) ||
    isPixelogicFallbackProjectValue(project.title)
  );
}

function isPixelogicFallbackProjectValue(value) {
  return /^Pixelogic (?:Project|Task) \d+$/i.test(String(value ?? "").trim());
}

function mergeProjectData(existingProject, nextProject) {
  const merged = { ...existingProject };
  Object.keys(nextProject).forEach((key) => {
    if (
      key === "work_time" &&
      Number(nextProject[key]) === 0 &&
      Number(existingProject[key]) > 0
    ) {
      return;
    }

    if (
      (key === "id" || key === "title") &&
      isPixelogicFallbackProjectValue(nextProject[key]) &&
      isDefinedProjectValue(existingProject[key]) &&
      !isPixelogicFallbackProjectValue(existingProject[key])
    ) {
      return;
    }

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

    const matchingIndexes = updatedProjects.reduce(
      (indexes, existingProject, index) => {
        if (matchesProject(existingProject, project)) indexes.push(index);
        return indexes;
      },
      [],
    );

    if (matchingIndexes.length > 0) {
      const insertIndex = Math.min(...matchingIndexes);
      let mergedProject = {};
      matchingIndexes.forEach((index) => {
        mergedProject = mergeProjectData(mergedProject, updatedProjects[index]);
      });
      mergedProject = mergeProjectData(mergedProject, project);

      [...matchingIndexes]
        .sort((a, b) => b - a)
        .forEach((index) => {
          updatedProjects.splice(index, 1);
        });
      updatedProjects.splice(insertIndex, 0, mergedProject);
    } else {
      updatedProjects.push(project);
    }
  });
  console.log(`${LOG_PREFIX} Projects upserted`, {
    incomingIds: projectArray.map((project) => project?.id).filter(Boolean),
    totalProjects: updatedProjects.length,
  });

  await chrome.storage.sync.set({ projects: updatedProjects });
}

function matchesProject(existingProject, nextProject) {
  if (existingProject.id && existingProject.id === nextProject.id) return true;
  if (
    existingProject.assignment_url &&
    nextProject.assignment_url &&
    existingProject.assignment_url === nextProject.assignment_url
  ) {
    return true;
  }
  if (
    existingProject.task_id &&
    nextProject.task_id &&
    existingProject.task_id === nextProject.task_id
  ) {
    return true;
  }
  if (
    existingProject.project_id &&
    nextProject.project_id &&
    existingProject.project_id === nextProject.project_id
  ) {
    return true;
  }
  if (
    existingProject.request_ref &&
    nextProject.request_ref &&
    existingProject.request_ref === nextProject.request_ref
  ) {
    return true;
  }
  if (
    existingProject.workplace_url &&
    nextProject.workplace_url &&
    existingProject.workplace_url === nextProject.workplace_url
  ) {
    return true;
  }
  return false;
}

async function initStopwatch(tabId) {
  try {
    if (!tabId) return;
    console.log(`${LOG_PREFIX} Sending stopwatch init`, { tabId });
    await sendTabMessage(
      tabId,
      {
        action: "init-stopwatch",
        source: "background.js",
      },
      { injectFiles: STOPWATCH_CONTENT_FILES },
    );
    console.log(`${LOG_PREFIX} Stopwatch init sent`, { tabId });
  } catch (e) {
    console.error("Failed to initiate stopwatch:", e);
  }
}

// Assignments

async function setUpCompositionProjectPage(tabId) {
  let projects = [];

  for (
    let attempt = 1;
    attempt <= COMPOSITION_METADATA_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    projects = (await setUpAssignmentsPage(tabId)) ?? [];
    const project = projects.find((candidate) => candidate?.id);
    const isFallback = isPixelogicFallbackProject(project);

    console.log(`${LOG_PREFIX} Composition metadata scrape attempt`, {
      attempt,
      isFallback,
      projectId: project?.id,
      title: project?.title,
    });

    if (project?.id && !isFallback) return projects;

    if (attempt < COMPOSITION_METADATA_RETRY_ATTEMPTS) {
      await sleep(COMPOSITION_METADATA_RETRY_DELAY_MS);
    }
  }

  return projects;
}

async function setUpAssignmentsPage(tabId) {
  let response;
  try {
    if (!tabId) return;
    console.log(`${LOG_PREFIX} Requesting assignments data`, { tabId });
    response = await sendTabMessage(
      tabId,
      {
        action: "request-assignments-data",
      },
      { injectFiles: ASSIGNMENTS_CONTENT_FILES },
    );
    if (!response) {
      console.warn(`${LOG_PREFIX} No response from assignments content script`, {
        tabId,
      });
      return;
    }
    console.log(`${LOG_PREFIX} Assignments response received`, {
      tabId,
      type: response.type,
    });
    if (response.type === "W2UI_DATA_ERROR") {
      throw new Error(
        `Error getting W2UI assignments data. Reason: ${response.payload.reason}. Current state: ${response.payload.state}`,
      );
    }
    if (response.type === "PIXELLOGIC_ASSIGNMENTS_DATA_ERROR") {
      throw new Error(
        `Error getting Pixelogic assignments data. Reason: ${response.payload.reason}`,
      );
    }
    if (response.type === "RETURN_PIXELLOGIC_ASSIGNMENTS_DATA") {
      return await formatAndNormalizeAssignmentProjects(
        response.payload.projects,
      );
    }
    if (response.type === "RETURN_W2UI_DATA") {
      return await formatAndNormalizeAssignmentData(response.payload.snapshot);
    }
  } catch (e) {
    console.warn("Failed to send message:", e);
    return;
  }
}

async function formatAndNormalizeAssignmentProjects(projects) {
  try {
    if (!Array.isArray(projects)) {
      throw new Error("Invalid Pixelogic assignment data shape");
    }

    const normalizedProjects = projects.map((project) =>
      normalizeProjectData(project),
    );
    console.log(`${LOG_PREFIX} Normalized Pixelogic assignment projects`, {
      count: normalizedProjects.length,
      ids: normalizedProjects.map((project) => project.id).filter(Boolean),
    });
    await upsertProjects(normalizedProjects);
    return normalizedProjects;
  } catch (e) {
    console.error("Failed to handle Pixelogic assignment data:", e);
    return [];
  }
}

async function formatAndNormalizeAssignmentData(snapshot) {
  try {
    const newProject = parseAssignmentData(snapshot);
    const normalizedProject = newProject.map((project) =>
      normalizeProjectData(project),
    );
    await upsertProjects(normalizedProject);
    return normalizedProject;
  } catch (e) {
    console.error("Failed to handle assignment snapshot:", e);
    return [];
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
