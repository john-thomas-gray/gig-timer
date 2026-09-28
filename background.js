"use strict";
import {
  buildProjectId,
  normalizeProjectData,
  parseTitleAndEpisode,
  parseRawProjectId,
} from "./web-accessible-resources/normalization.js";
import { exportProjectData } from "./exporters/sheetsExporter.js";
import {
  calculateHourlyRate,
  calculateInvoiceAmount,
} from "./web-accessible-resources/normalization.js";
import {
  getPixelogicProjectIdentity,
  isPixelogicCompositionProjectUrl,
  isPixelogicOperationsManagerTaskUrl,
  parsePixelogicCompositionAssignmentsText,
} from "./utils/pixelogic.js";
import { getNetflixRequestRefFromUrl } from "./utils/netflix.js";
import { detectWorkplacePage } from "./utils/workplace.js";

const LOG_PREFIX = "[Gig Timer]";
const storageCache = { count: 0, urls: {}, lastProjectId: "" };

const sheetsData = {
  deploymentId:
    "AKfycbzzeOJrRpEXNX91J593MUmkcaXPwwT_fmLbnSf7AGj2foMoc8Phq3VVeGe0gjuMcnPbkw",
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

let projectWriteQueue = Promise.resolve();
let hasAddedListeners = false;
const storageCacheReady = initStorageCache().catch((error) => {
  console.error(`${LOG_PREFIX} Failed to initialize storage cache:`, error);
});

init();

async function initStorageCache() {
  const items = await chrome.storage.local.get([
    "count",
    "urls",
    "lastProjectId",
  ]);
  Object.assign(storageCache, items);
}

function init() {
  addListeners();
}

function addListeners() {
  if (hasAddedListeners) return;
  hasAddedListeners = true;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
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

      await storageCacheReady;
      try {
        const page = detectWorkplacePage(url, storageCache.urls);
        if (!page.isAssignmentsPage && !page.isProjectMetadataPage) return;

        console.log(`${LOG_PREFIX} Processing timer page navigation`, {
          ...page, tabId, url,
        });
        if (page.isAssignmentsPage) {
          console.log(`${LOG_PREFIX} Assignment page recognized`, { tabId, url });
        }
        if (!page.isProjectMetadataPage) {
          await setUpAssignmentsPage(tabId);
          return;
        }

        console.log(
          `${LOG_PREFIX} ${page.site === "netflix" ? "Netflix authoring" : "Workplace"} page recognized`,
          { tabId, url },
        );
        const project = page.metadataSource === "composition"
          ? (await setUpCompositionProjectPage(tabId, url))?.find((candidate) => candidate?.id)
          : await getWorkplaceProject("webNavigation", tabId);
        if (!project?.id) return;

        // A metadata request can finish after the user has left this page.
        if ((await chrome.tabs.get(tabId))?.url !== url) return;
        const savedProject = await saveActiveProject(project);
        if (page.isTimerPage && savedProject) {
          console.log(
            `${LOG_PREFIX} ${page.metadataSource === "composition" ? "Composition" : "Workplace"} project stored; starting stopwatch`,
            { projectId: savedProject.id, tabId },
          );
          await initStopwatch(tabId, savedProject.id);
        } else if (savedProject) {
          console.log(`${LOG_PREFIX} Workplace project stored without starting stopwatch`, {
            projectId: savedProject.id, tabId,
          });
        }
      } catch (error) {
        console.error(`${LOG_PREFIX} Timer page setup failed`, error);
      }
    }, DEBOUNCE_MS);

    navigationTimers.set(tabId, timer);
  };

  chrome.webNavigation.onCompleted.addListener(handleTimerPageNavigation);
  chrome.webNavigation.onHistoryStateUpdated?.addListener(
    handleTimerPageNavigation,
  );
  chrome.webNavigation.onReferenceFragmentUpdated?.addListener(
    handleTimerPageNavigation,
  );

  recoverOpenTimerPageTabs(handleTimerPageNavigation);

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg?.action) return;

    if (
      msg.action === "store-netflix-runtime" &&
      msg.source === "workplace.js"
    ) {
      withStorageCacheReady(() => persistNetflixRuntime(msg, sender?.tab?.id))
        .then(sendResponse)
        .catch((error) => {
          console.error("Failed to store Netflix runtime", error);
          sendResponse({ stored: false });
        });
      return true;
    }

    if (msg.action === "store-elapsed-time") {
      console.log(`${LOG_PREFIX} Store elapsed time requested`, {
        elapsedTime: msg.elapsedTime,
        projectId: msg.projectId,
        tabId: sender?.tab?.id,
      });
      (async () => {
        try {
          await storageCacheReady;
          const workTimeValue = msg.elapsedTime ?? 0;
          const requestedProject = msg.projectId
            ? await getProjects(msg.projectId)
            : undefined;
          const currentProject =
            requestedProject ??
            (await getWorkplaceProject(
              "store-elapsed-time",
              sender?.tab?.id,
            ));
          const existingProject =
            requestedProject ??
            (currentProject
              ? await getMatchingProject(currentProject)
              : undefined);
          const workplaceId =
            requestedProject?.id ??
            getPreferredProjectId(currentProject, existingProject) ??
            storageCache.lastProjectId;
          if (!workplaceId) {
            throw new Error("Workplace ID not found");
          }
          await saveActiveProject({
            ...(requestedProject ? {} : currentProject ?? {}),
            id: workplaceId,
            work_time: workTimeValue,
          });
        } catch (e) {
          console.error("Failed to store elapsed time", e);
        }
      })();
      return;
    }

    if (msg.action === "get-stored-worktime") {
      console.log(`${LOG_PREFIX} Stored work time requested`, {
        projectId: msg.projectId,
        tabId: sender?.tab?.id,
      });
      withStorageCacheReady(() =>
        msg.projectId
          ? getProjects(msg.projectId).then((project) => project?.work_time)
          : getStoredProjectValue("work_time", sender?.tab?.id),
      )
        .then((workTime) => {
          console.log(`${LOG_PREFIX} Stored work time response`, {
            projectId: msg.projectId,
            tabId: sender?.tab?.id,
            workTime,
          });
          sendResponse(workTime);
        })
        .catch((error) => {
          console.error(`${LOG_PREFIX} Failed to load stored work time`, error);
          sendResponse(undefined);
        });
      return true;
    }

    if (msg.action === "get-stored-projects" && msg.source === "popup.js") {
      getProjects().then((projects) => {
        sendResponse(projects);
      });
      return true;
    }

    if (
      msg.action === "get-latest-workspace-project-id" &&
      msg.source === "popup.js"
    ) {
      withStorageCacheReady(() =>
        getLatestWorkspaceProjectId(msg.tabId),
      ).then((projectId) => {
        sendResponse({ projectId });
      });
      return true;
    }

    if (msg.action === "export-project-data" && msg.source === "popup.js") {
      (async () => {
        const projectData = await getProjects(msg.projectId);
        if (!projectData) throw new Error("Project not found. Select a saved project and try again.");

        const completedProject = normalizeProjectData({
          ...projectData,
          date_completed: todayIsoDate(),
        });
        delete completedProject.date_assigned;

        const savedProjects = await upsertProjects(completedProject);
        const savedProject = savedProjects.find((project) =>
          matchesProject(project, completedProject),
        );
        if (!savedProject) throw new Error("Project could not be saved for export.");
        await exportProjectData(savedProject, sheetsData);
        sendResponse({ success: true });
      })().catch((error) => {
        console.error(`${LOG_PREFIX} Failed to export project:`, error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
  });
}

async function recoverOpenTimerPageTabs(handleTimerPageNavigation) {
  if (typeof chrome.tabs?.query !== "function") return;

  try {
    await storageCacheReady;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs ?? []) {
      if (!tab?.id || !tab.url) continue;
      const page = detectWorkplacePage(tab.url, storageCache.urls);
      if (!page.isAssignmentsPage && !page.isProjectMetadataPage) continue;

      handleTimerPageNavigation({
        frameId: 0,
        tabId: tab.id,
        url: tab.url,
      });
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to recover open timer pages`, error);
  }
}

async function withStorageCacheReady(callback) {
  await storageCacheReady;
  return callback();
}

async function getProjects(id) {
  const result = await chrome.storage.local.get("projects");
  const projects = Array.isArray(result.projects) ? result.projects : [];

  if (!id) return projects;

  const currentProject = projects.find((p) => p.id === id);
  return currentProject || undefined;
}

async function persistNetflixRuntime(message, tabId) {
  const runtime = Number(message.runtime);
  if (!Number.isFinite(runtime) || runtime <= 0) {
    return { stored: false };
  }

  const tab = tabId ? await chrome.tabs.get(tabId) : undefined;
  const workplaceUrl = message.workplaceUrl ?? tab?.url;
  const requestRef =
    message.requestRef ?? getNetflixRequestRefFromUrl(workplaceUrl);
  const projects = await getProjects();
  let existingProject = projects.find(
    (project) =>
      (requestRef && project.request_ref === requestRef) ||
      (workplaceUrl && project.workplace_url === workplaceUrl),
  );
  let currentProject;

  if (!existingProject && tabId) {
    currentProject = await getWorkplaceProject("store-netflix-runtime", tabId);
    existingProject = currentProject
      ? await getMatchingProject(currentProject)
      : undefined;
  }

  const projectId =
    getPreferredProjectId(currentProject, existingProject) ??
    currentProject?.id ??
    existingProject?.id;
  if (!projectId) return { stored: false };

  const project = {
    ...(currentProject ?? {}),
    id: projectId,
    request_ref: requestRef,
    runtime,
    workplace_url: workplaceUrl,
  };

  const savedProject = await saveActiveProject(project);
  console.log(`${LOG_PREFIX} Netflix runtime stored`, {
    projectId,
    runtime,
  });

  return { projectId: savedProject.id, runtime, stored: true };
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
      const savedProject = await saveActiveProject({ ...project, id });
      return savedProject?.[key];
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

async function getLatestWorkspaceProjectId(tabId) {
  const currentWorkspaceProjectId =
    await getCurrentWorkspaceProjectId(tabId);
  return currentWorkspaceProjectId ?? storageCache.lastProjectId ?? undefined;
}

async function getCurrentWorkspaceProjectId(tabId) {
  if (!tabId) return undefined;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isCurrentWorkspaceUrl(tab?.url)) return undefined;

    const project = await getWorkplaceProject(
      "getCurrentWorkspaceProjectId",
      tabId,
    );
    if (!project?.id) return undefined;
    return (await saveActiveProject(project))?.id;
  } catch (e) {
    console.error("Failed to resolve current workspace project:", e);
    return undefined;
  }
}

function isCurrentWorkspaceUrl(url) {
  return detectWorkplacePage(url, storageCache.urls).isProjectMetadataPage;
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
    return project;
  } catch (e) {
    console.error(`${calledBy ?? "We"} failed to get workplace project:`, e);
    if (tabIdOverride) {
      try {
        const tab = await chrome.tabs.get(tabIdOverride);
        const requestRef = getNetflixRequestRefFromUrl(tab?.url);
        return (await getProjects()).find((project) =>
          (requestRef && project.request_ref === requestRef) ||
          (tab?.url && project.workplace_url === tab.url),
        );
      } catch (tabError) {
        console.error("Fallback tab URL lookup failed:", tabError);
      }
    }
    return tabIdOverride ? undefined : getLastProjectFallback();
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
  return project;
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

function cleanText(value) {
  if (value === undefined || value === null) return undefined;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

const PIXELOGIC_DEFAULT_RATE = 6;
const MANUAL_PROJECT_FIELDS_KEY = "_manual_fields";
const PROJECT_CODENAME_KEY = "codename";
const PROJECT_IDENTITY_FIELDS = new Set(["title", "season", "episode"]);

function numericRate(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number =
    typeof value === "number"
      ? value
      : Number(String(value).replace(/[^0-9.-]/g, ""));

  return Number.isFinite(number) ? number : undefined;
}

function isPixelogicDefaultRate(value) {
  return numericRate(value) === PIXELOGIC_DEFAULT_RATE;
}

function getManualProjectFields(project) {
  const fields = project?.[MANUAL_PROJECT_FIELDS_KEY];
  if (!Array.isArray(fields)) return new Set();

  return new Set(
    fields
      .map((field) => cleanText(field))
      .filter(Boolean),
  );
}

function mergeManualProjectFields(existingProject, nextProject) {
  const merged = new Set([
    ...getManualProjectFields(existingProject),
    ...getManualProjectFields(nextProject),
  ]);

  return [...merged].sort();
}

function hasManualProjectField(project, key) {
  return getManualProjectFields(project).has(key);
}

function hasManualProjectIdentity(project) {
  const manualFields = getManualProjectFields(project);
  return [...PROJECT_IDENTITY_FIELDS].some((key) => manualFields.has(key));
}

function getSeriesDefaultValue(project, key) {
  if (key === "rate") {
    return isDefinedProjectValue(project?.rate) ? project.rate : undefined;
  }

  return cleanText(project?.[key]);
}

function getSeriesKey(project) {
  const parsedTitle = parseTitleAndEpisode(project?.title);
  const parsedId = parseTitleAndEpisode(project?.id);
  const title =
    parsedTitle.title ??
    cleanText(project?.title) ??
    parsedId.title ??
    cleanText(project?.id);

  return title?.toLowerCase() ?? "";
}

function getSeasonKey(project) {
  const season =
    cleanText(project?.season) ??
    parseTitleAndEpisode(project?.id).season ??
    parseTitleAndEpisode(project?.title).season;

  if (!season) return "";
  const match = season.match(/\d+/);
  return match ? String(Number(match[0])) : "";
}

function getEpisodeNumber(project) {
  const episode =
    cleanText(project?.episode) ??
    parseTitleAndEpisode(project?.id).episode ??
    parseTitleAndEpisode(project?.title).episode;
  const match = episode?.match(/\d+/);
  if (!match) return undefined;

  const number = Number(match[0]);
  return Number.isFinite(number) ? number : undefined;
}

function getSeriesSeasonKey(project) {
  const seriesKey = getSeriesKey(project);
  const seasonKey = getSeasonKey(project);
  return seriesKey && seasonKey ? `${seriesKey}::${seasonKey}` : "";
}

function getSeriesDefaults(projects) {
  const defaultsBySeries = new Map();

  projects.forEach((project) => {
    const seriesKey = getSeriesKey(project);
    if (seriesKey) {
      const existingDefaults = defaultsBySeries.get(seriesKey) ?? {};
      const nextDefaults = { ...existingDefaults };

      ["client", "genre"].forEach((key) => {
        if (isDefinedProjectValue(nextDefaults[key])) return;

        const value = getSeriesDefaultValue(project, key);
        if (isDefinedProjectValue(value)) nextDefaults[key] = value;
      });

      if (Object.keys(nextDefaults).length > 0) {
        defaultsBySeries.set(seriesKey, nextDefaults);
      }
    }
  });

  return { defaultsBySeries, rateReferenceProjects: projects };
}

function getReferenceRateForProject(project, referenceProjects) {
  const seriesSeasonKey = getSeriesSeasonKey(project);
  if (!seriesSeasonKey) return undefined;

  const projectEpisode = getEpisodeNumber(project);
  const candidates = referenceProjects
    .filter((candidate) => {
      if (candidate === project) return false;
      if (candidate.id && project.id && candidate.id === project.id) return false;
      if (getSeriesSeasonKey(candidate) !== seriesSeasonKey) return false;

      const rate = getSeriesDefaultValue(candidate, "rate");
      return isDefinedProjectValue(rate) && !isPixelogicDefaultRate(rate);
    })
    .map((candidate) => ({
      episode: getEpisodeNumber(candidate),
      rate: getSeriesDefaultValue(candidate, "rate"),
    }));

  if (!candidates.length) return undefined;

  const previousCandidates = Number.isFinite(projectEpisode)
    ? candidates.filter((candidate) =>
        Number.isFinite(candidate.episode) && candidate.episode < projectEpisode,
      )
    : [];
  const sourceCandidates = previousCandidates.length
    ? previousCandidates
    : candidates;

  sourceCandidates.sort((a, b) => {
    const aEpisode = Number.isFinite(a.episode)
      ? a.episode
      : Number.NEGATIVE_INFINITY;
    const bEpisode = Number.isFinite(b.episode)
      ? b.episode
      : Number.NEGATIVE_INFINITY;
    return bEpisode - aEpisode;
  });

  return sourceCandidates[0].rate;
}

function applySeriesDefaultsToProject(
  project,
  seriesDefaults,
) {
  const { defaultsBySeries, rateReferenceProjects } = seriesDefaults;
  const defaults = defaultsBySeries.get(getSeriesKey(project));
  let updatedProject = project;
  if (defaults) {
    Object.keys(defaults).forEach((key) => {
      if (hasManualProjectField(updatedProject, key)) return;

      if (isDefinedProjectValue(getSeriesDefaultValue(updatedProject, key))) {
        return;
      }

      if (!isDefinedProjectValue(defaults[key])) return;

      if (updatedProject === project) updatedProject = { ...project };
      updatedProject[key] = defaults[key];
    });
  }

  const rate = getReferenceRateForProject(
    updatedProject,
    rateReferenceProjects,
  );
  if (
    isDefinedProjectValue(rate) &&
    !hasManualProjectField(updatedProject, "rate") &&
    (!isDefinedProjectValue(updatedProject.rate) ||
      isPixelogicDefaultRate(updatedProject.rate))
  ) {
    if (updatedProject === project) updatedProject = { ...project };
    updatedProject.rate = rate;
  }

  if (updatedProject.rate !== project.rate) {
    const invoiceAmount = calculateInvoiceAmount(
      updatedProject.rate,
      updatedProject.runtime,
    );
    if (invoiceAmount !== undefined) {
      updatedProject.invoice_amount = invoiceAmount;

      const hourlyRate = calculateHourlyRate(
        invoiceAmount,
        updatedProject.work_time,
      );
      if (hourlyRate !== undefined) updatedProject.hourly_rate = hourlyRate;
    }
  }

  return updatedProject;
}

function applyStoredSeriesDefaults(projects) {
  const seriesDefaults = getSeriesDefaults(projects);
  return projects.map((project) =>
    applySeriesDefaultsToProject(project, seriesDefaults),
  );
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

function isNetflixAuthoringProject(project = {}) {
  const workplaceUrl = project?.workplace_url;
  return String(workplaceUrl ?? "").toLowerCase().includes("netflixstudios.com");
}

function rememberCodename(merged, nextProject) {
  const incomingTitle = cleanText(nextProject?.title);
  const currentTitle = cleanText(merged?.title);
  if (
    !incomingTitle ||
    !currentTitle ||
    incomingTitle === currentTitle ||
    isPixelogicFallbackProjectValue(incomingTitle)
  ) {
    return;
  }

  merged[PROJECT_CODENAME_KEY] = incomingTitle;
}

function mergeProjectData(existingProject, nextProject) {
  const merged = { ...existingProject };
  const enforceNetflixDefaults = isNetflixAuthoringProject(nextProject);
  const manualFields = getManualProjectFields(existingProject);
  const manualFieldList = mergeManualProjectFields(existingProject, nextProject);
  if (manualFieldList.length) {
    merged[MANUAL_PROJECT_FIELDS_KEY] = manualFieldList;
  }

  Object.keys(nextProject).forEach((key) => {
    if (key === "date_assigned") return;
    if (key === MANUAL_PROJECT_FIELDS_KEY) return;

    if (key === PROJECT_CODENAME_KEY) {
      if (isDefinedProjectValue(nextProject[key])) {
        merged[key] = nextProject[key];
      }
      return;
    }

    if (
      manualFields.has(key) &&
      isDefinedProjectValue(nextProject[key])
    ) {
      if (key === "title") rememberCodename(merged, nextProject);
      return;
    }

    if (
      key === "id" &&
      hasManualProjectIdentity(existingProject) &&
      isDefinedProjectValue(existingProject.id) &&
      isDefinedProjectValue(nextProject.id)
    ) {
      rememberCodename(merged, nextProject);
      return;
    }

    if (
      enforceNetflixDefaults &&
      (key === "client" || key === "contractor" || key === "rate")
    ) {
      if (isDefinedProjectValue(nextProject[key])) {
        merged[key] = nextProject[key];
      }
      return;
    }

    if (
      key === "rate" &&
      isDefinedProjectValue(existingProject[key]) &&
      isDefinedProjectValue(nextProject[key])
    ) {
      return;
    }

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
      if (key === "date_completed") delete merged.date_assigned;
    }
  });

  if (hasManualProjectIdentity(merged)) {
    merged.id = buildProjectId(merged) ?? merged.id;
  }

  const invoiceAmount = calculateInvoiceAmount(merged.rate, merged.runtime);
  if (invoiceAmount !== undefined) {
    merged.invoice_amount = invoiceAmount;

    const hourlyRate = calculateHourlyRate(invoiceAmount, merged.work_time);
    if (hourlyRate !== undefined) {
      merged.hourly_rate = hourlyRate;
    }
  }

  return merged;
}

function todayIsoDate() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function upsertProjects(projects, options = {}) {
  const write = projectWriteQueue.then(() => writeProjects(projects, options));
  projectWriteQueue = write.catch(() => {});
  return write;
}

async function saveActiveProject(project) {
  project = await enrichPixelogicCompositionProject(project);
  const savedProjects = await upsertProjects(project, { activeProject: project });
  return savedProjects.find((saved) => matchesProject(saved, project));
}

async function enrichPixelogicCompositionProject(project) {
  if (
    project.client ||
    !isPixelogicCompositionProjectUrl(project.assignment_url) ||
    typeof chrome.tabs?.query !== "function"
  ) return project;

  const { taskId } = getPixelogicProjectIdentity(project);
  if (!taskId) return project;

  try {
    const tabs = await chrome.tabs.query({});
    const taskTab = tabs.find((tab) =>
      isPixelogicOperationsManagerTaskUrl(tab.url) &&
      getPixelogicProjectIdentity({ workplace_url: tab.url }).taskId === taskId,
    );
    if (!taskTab) return project;

    const metadata = await getWorkplaceProject("composition-task-metadata", taskTab.id);
    if (getPixelogicProjectIdentity(metadata).taskId !== taskId) return project;

    const enriched = { ...project };
    for (const key of ["client", "date_due", "task_type"]) {
      if (!isDefinedProjectValue(enriched[key]) && isDefinedProjectValue(metadata[key])) {
        enriched[key] = metadata[key];
      }
    }
    return enriched;
  } catch (error) {
    console.warn(`${LOG_PREFIX} Could not read composition task metadata`, error);
    return project;
  }
}

function applyStoredCodename(project, storedProjects) {
  const title = cleanText(project.title)?.toLowerCase();
  if (!title || hasManualProjectField(project, "title")) return project;

  const aliases = storedProjects.filter((stored) =>
    stored.contractor === project.contractor &&
    cleanText(stored.codename)?.toLowerCase() === title &&
    hasManualProjectField(stored, "title") &&
    isDefinedProjectValue(stored.title),
  );
  const titles = new Set(aliases.map((stored) => stored.title));
  if (titles.size !== 1) return project;

  const mapped = {
    ...project,
    title: aliases[0].title,
    codename: project.title,
    [MANUAL_PROJECT_FIELDS_KEY]: [...new Set([...getManualProjectFields(project), "title"])],
  };
  mapped.id = buildProjectId(mapped);
  return mapped;
}

function distinguishPixelogicProjectId(project, projects) {
  if (!projects.some((stored) => stored.id === project.id)) return project;
  const { taskId, projectId } = getPixelogicProjectIdentity(project);
  const qualifier = taskId ? `Task ${taskId}` : projectId ? `Project ${projectId}` : undefined;
  return qualifier ? { ...project, id: `${project.id} [Pixelogic ${qualifier}]` } : project;
}

async function writeProjects(projects, { activeProject } = {}) {
  const isSingle = !Array.isArray(projects);
  const projectArray = isSingle ? [projects] : projects;

  const currentProjects = (await getProjects()) || [];
  const updatedProjects = [...currentProjects];
  const currentSeriesDefaults = getSeriesDefaults(currentProjects);

  projectArray.forEach((rawProject) => {
    let project = applyStoredCodename(rawProject, updatedProjects);
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
      updatedProjects.splice(
        insertIndex, 0, distinguishPixelogicProjectId(mergedProject, updatedProjects),
      );
    } else {
      project = applySeriesDefaultsToProject(project, currentSeriesDefaults);
      updatedProjects.push(distinguishPixelogicProjectId(project, updatedProjects));
    }
  });
  const projectsToSave = applyStoredSeriesDefaults(updatedProjects);
  console.log(`${LOG_PREFIX} Projects upserted`, {
    incomingIds: projectArray.map((project) => project?.id).filter(Boolean),
    totalProjects: projectsToSave.length,
  });

  const previousActiveProject = currentProjects.find(
    (project) => project.id === storageCache.lastProjectId,
  );
  const activeCandidate = activeProject ?? previousActiveProject;
  const savedActiveProject = activeCandidate && projectsToSave.find(
    (project) => matchesProject(project, activeCandidate),
  );
  const changes = { projects: projectsToSave };
  if (savedActiveProject) changes.lastProjectId = savedActiveProject.id;
  await chrome.storage.local.set(changes);
  if (savedActiveProject) storageCache.lastProjectId = savedActiveProject.id;
  return projectsToSave;
}

function matchesProject(existingProject, nextProject) {
  const existingIdentity = getPixelogicProjectIdentity(existingProject);
  const nextIdentity = getPixelogicProjectIdentity(nextProject);
  for (const key of ["taskId", "projectId"]) {
    if (
      existingIdentity[key] && nextIdentity[key] &&
      existingIdentity[key] !== nextIdentity[key]
    ) return false;
  }
  for (const key of ["taskId", "projectId"]) {
    if (existingIdentity[key] && existingIdentity[key] === nextIdentity[key]) return true;
  }
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
  if (matchesStoredCodename(existingProject, nextProject)) return true;
  return false;
}

function matchesStoredCodename(existingProject, nextProject) {
  const codename = cleanText(existingProject?.[PROJECT_CODENAME_KEY]);
  const nextTitle =
    cleanText(nextProject?.title) ??
    parseTitleAndEpisode(nextProject?.id).title;
  if (!codename || !nextTitle || codename.toLowerCase() !== nextTitle.toLowerCase()) {
    return false;
  }

  const existingSeason = getSeasonKey(existingProject);
  const nextSeason = getSeasonKey(nextProject);
  if (existingSeason && nextSeason && existingSeason !== nextSeason) {
    return false;
  }

  const existingEpisode = getEpisodeNumber(existingProject);
  const nextEpisode = getEpisodeNumber(nextProject);
  if (
    Number.isFinite(existingEpisode) &&
    Number.isFinite(nextEpisode) &&
    existingEpisode !== nextEpisode
  ) {
    return false;
  }

  return Number.isFinite(existingEpisode) && Number.isFinite(nextEpisode);
}

async function initStopwatch(tabId, projectId) {
  try {
    if (!tabId || !projectId) return;

    const project = await getProjects(projectId);
    if (!project) {
      throw new Error(`Project not found while starting stopwatch: ${projectId}`);
    }

    const numericStoredWorktime = Number(project.work_time);
    const storedWorktime =
      Number.isFinite(numericStoredWorktime) && numericStoredWorktime >= 0
        ? numericStoredWorktime
        : 0;
    console.log(`${LOG_PREFIX} Sending stopwatch init`, {
      projectId,
      storedWorktime,
      tabId,
    });
    await sendTabMessage(
      tabId,
      {
        action: "init-stopwatch",
        projectId,
        source: "background.js",
        storedWorktime,
      },
      { injectFiles: STOPWATCH_CONTENT_FILES },
    );
    console.log(`${LOG_PREFIX} Stopwatch init sent`, { tabId });
  } catch (e) {
    console.error("Failed to initiate stopwatch:", e);
  }
}

// Assignments

async function setUpCompositionProjectPage(tabId, url) {
  let projects = [];

  for (
    let attempt = 1;
    attempt <= COMPOSITION_METADATA_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    projects = (await setUpAssignmentsPage(tabId, { persist: false })) ?? [];
    const project = projects.find((candidate) => candidate?.id);
    const isFallback = isPixelogicFallbackProject(project);

    console.log(`${LOG_PREFIX} Composition metadata scrape attempt`, {
      attempt,
      isFallback,
      projectId: project?.id,
      title: project?.title,
    });

    if (project?.id && !isFallback && project.runtime !== undefined) return projects;

    if (attempt < COMPOSITION_METADATA_RETRY_ATTEMPTS) {
      await sleep(COMPOSITION_METADATA_RETRY_DELAY_MS);
    }
  }

  const project = projects.find((candidate) => candidate?.id);
  if (project?.id) return projects;

  const fallbackProjects = await setUpCompositionProjectUrlFallback(url);
  return fallbackProjects.length > 0 ? fallbackProjects : projects;
}

async function setUpCompositionProjectUrlFallback(url) {
  const fallbackProjects = parsePixelogicCompositionAssignmentsText("", url);
  if (!fallbackProjects.length) return [];

  console.warn(`${LOG_PREFIX} Using composition project URL fallback metadata`, {
    url,
  });
  return formatAndNormalizeAssignmentProjects(fallbackProjects, { persist: false });
}

async function setUpAssignmentsPage(tabId, options) {
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
        response.payload.projects, options,
      );
    }
    if (response.type === "RETURN_W2UI_DATA") {
      return await formatAndNormalizeAssignmentData(response.payload.snapshot, options);
    }
  } catch (e) {
    console.warn("Failed to send message:", e);
    return;
  }
}

async function formatAndNormalizeAssignmentProjects(projects, { persist = true } = {}) {
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
    if (persist) await upsertProjects(normalizedProjects);
    return normalizedProjects;
  } catch (e) {
    console.error("Failed to handle Pixelogic assignment data:", e);
    return [];
  }
}

async function formatAndNormalizeAssignmentData(snapshot, { persist = true } = {}) {
  try {
    const newProject = parseAssignmentData(snapshot);
    const normalizedProject = newProject.map((project) =>
      normalizeProjectData(project),
    );
    if (persist) await upsertProjects(normalizedProject);
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
      (object.alpha_source_materials?.[0]?.program_runtime || 0) * 60,
    );
    return projectWithConvertedKeys;
  });
}
