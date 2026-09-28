(() => {
// import(chrome.runtime.getURL("web-accessible-resources/normalization.js")).then(
// );

let normalizationModule;
const DEFAULT_PROJECT_OPTION_VALUE = "New Project";
const MANUAL_PROJECT_FIELDS_KEY = "_manual_fields";
const PROJECT_CODENAME_KEY = "codename";

async function loadNormalizationModule() {
  if (!normalizationModule) {
    normalizationModule = await import(
      chrome.runtime.getURL("web-accessible-resources/normalization.js"),
    );
  }
  return normalizationModule;
}

// async function formatDisplayRatePpm() {
//   const module = await loadNormalizationModule();
//   module.formatDisplayRatePpm(someData);
// }

document.addEventListener("DOMContentLoaded", () => {
  init();
});

let existingProjects = [];
let selectedProject = undefined;
let defaultFields;
let activeTabId;
let activeProjectId;
let latestStopwatchTime;
let workTimeInput;
let workTimeManuallyEdited = false;
let stopwatchRefreshInterval;

async function init() {
  defaultFields = document.getElementById("defaultFields");
  const projectSelect = document.getElementById("projectSelect");
  const exportButton = document.getElementById("exportButton");
  const updateButton = document.getElementById("updateButton");

  if (!defaultFields || !projectSelect || !exportButton || !updateButton) {
    return;
  }

  activeTabId = await getActiveTabId();
  const initialProjectId = await getInitialProjectId(activeTabId);
  activeProjectId = initialProjectId;
  existingProjects = await getStoredProjects();
  await buildUI(existingProjects);
  selectProjectById(initialProjectId);

  projectSelect.addEventListener("change", onSelectChange);

  const exportStatus = document.createElement("p");
  exportStatus.id = "exportStatus";
  exportStatus.setAttribute("role", "status");
  exportButton.parentElement.appendChild(exportStatus);

  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    exportStatus.textContent = "Saving and exporting…";
    try {
      await exportProject();
      exportStatus.textContent = "Exported to spreadsheet.";
    } catch (error) {
      exportStatus.textContent = error.message || "Export failed. Please try again.";
    } finally {
      exportButton.disabled = false;
    }
  });

  updateButton.addEventListener("click", async () => {
    await updateProjectFromForm();
  });

  await requestCurrentStopwatchTime();
  stopwatchRefreshInterval = setInterval(requestCurrentStopwatchTime, 500);
}

async function getStoredProjects() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "get-stored-projects", source: "popup.js" },
      (response) => {
        if (Array.isArray(response)) resolve(response);
        else resolve([]);
      },
    );
  });
}

async function getInitialProjectId(tabId) {

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        action: "get-latest-workspace-project-id",
        source: "popup.js",
        tabId,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve(undefined);
          return;
        }

        resolve(response?.projectId);
      },
    );
  });
}

async function getActiveTabId() {
  if (!chrome.tabs?.query) return undefined;

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(undefined);
        return;
      }

      resolve(tabs?.[0]?.id);
    });
  });
}

async function buildUI(projects) {
  defaultFields = document.getElementById("defaultFields");
  if (defaultFields.children.length > 1) return;
  buildProjectOptions(projects);
  buildFormInputs();
}

function buildProjectOptions(projects) {
  const projectSelect = document.getElementById("projectSelect");

  const optgroups = {};

  projects.forEach((project) => {
    const title = getSeriesTitle(project) || "Untitled";

    if (!optgroups[title]) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = title;
      projectSelect.appendChild(optgroup);
      optgroups[title] = optgroup;
    }

    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = formatEpisodeLabel(project);

    optgroups[title].appendChild(option);
  });
}

function formatEpisodeLabel(project) {
  const season = project.season?.toString().trim();
  const episode = project.episode?.toString().trim();
  const legacyMatch = episode?.match(
    /^S(?:eason)?\s*0*(\d+)[\s_-]*E(?:p(?:isode)?)?\s*0*(\d+)$/i,
  );

  if (season && episode && !legacyMatch) return `S${season}E${episode}`;
  if (legacyMatch) {
    return `S${Number(legacyMatch[1])}E${Number(legacyMatch[2])}`;
  }
  if (episode) return `Episode ${episode}`;
  return "Unknown";
}

function selectProjectById(projectId) {
  const select = document.getElementById("projectSelect");
  const hasMatchingProject = [...select.options].some(
    (option) => option.value === projectId,
  );

  select.value = hasMatchingProject ? projectId : DEFAULT_PROJECT_OPTION_VALUE;
  onSelectChange();
}

function buildFormInputs() {
  const defaultFields = document.getElementById("defaultFields");

  const formSchema = {
    season: "text",
    episode: "text",
    genre: "text",
    work_time: "text",
    workplace_url: "text",
    runtime: "text",
    rate: "text",
    hourly_rate: "text",
    invoice_amount: "text",
    date_due: "text",
    date_completed: "text",
    contractor: "text",
    client: "text",
  };

  for (const key in formSchema) {
    const wrapper = document.createElement("div");
    wrapper.className = "inputGroup";

    const label = document.createElement("label");
    label.textContent = formatFieldLabel(key);

    const input = document.createElement("input");
    input.type = formSchema[key];
    input.name = key;
    input.value = "";
    if (key === "runtime") input.placeholder = "hh:mm:ss:ff";
    if (key === "work_time") {
      input.placeholder = "hh:mm:ss:ff";
      workTimeInput = input;
      input.addEventListener("beforeinput", () => {
        workTimeManuallyEdited = true;
      });
      input.addEventListener("input", () => {
        workTimeManuallyEdited = true;
      });
      input.addEventListener("blur", handleWorkTimeBlur);
    }

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    defaultFields.appendChild(wrapper);
  }
}

function onSelectChange() {
  console.log("onSelectChange");
  const select = document.getElementById("projectSelect");
  const projectId = select.value;

  workTimeManuallyEdited = false;

  selectedProject =
    existingProjects.find((project) => project.id === projectId) ?? undefined;
  const h2 = document.getElementById("h2");
  h2.textContent = selectedProject ? selectedProject.title : "";
  console.log(selectedProject);

  setFormText();
}

function handleWorkTimeBlur() {
  if (!workTimeInput) return;

  if (!workTimeInput.value.trim()) {
    workTimeManuallyEdited = false;
  }

  refreshLiveWorkTimeInput();
}

function refreshLiveWorkTimeInput() {
  if (
    !workTimeInput ||
    workTimeManuallyEdited ||
    document.activeElement === workTimeInput ||
    selectedProject?.id !== activeProjectId ||
    !Number.isFinite(latestStopwatchTime)
  ) {
    return;
  }

  workTimeInput.value = formatElapsedTime(latestStopwatchTime);
}

async function requestCurrentStopwatchTime() {
  if (!activeTabId || selectedProject?.id !== activeProjectId) return;

  chrome.tabs.sendMessage(
    activeTabId,
    { action: "get-stopwatch-time", source: "popup.js" },
    (response) => {
      if (chrome.runtime.lastError) return;

      const elapsedTime = Number(response?.elapsedTime);
      if (!Number.isFinite(elapsedTime)) return;

      latestStopwatchTime = elapsedTime;
      refreshLiveWorkTimeInput();
    },
  );
}

//should import from format
function formatFieldLabel(key) {
  const overrides = { url: "URL" };

  return key
    .split("_")
    .map(
      (word) => overrides[word] ?? word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function cleanText(value) {
  if (value === undefined || value === null) return undefined;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function isDefinedProjectValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

const PIXELOGIC_DEFAULT_RATE = 6;

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

function withManualProjectFields(project, fields) {
  const mergedFields = new Set([
    ...getManualProjectFields(project),
    ...fields.filter(Boolean),
  ]);

  if (!mergedFields.size) return project;

  return {
    ...project,
    [MANUAL_PROJECT_FIELDS_KEY]: [...mergedFields].sort(),
  };
}

function hasManualProjectField(project, key) {
  return getManualProjectFields(project).has(key);
}

function getSeriesDefaultValue(project, key) {
  if (key === "rate") {
    return isDefinedProjectValue(project?.rate) ? project.rate : undefined;
  }

  return cleanText(project?.[key]);
}

function parseNumberToken(value) {
  const match = cleanText(value)?.match(/\d+/);
  if (!match) return undefined;
  return String(Number(match[0]));
}

function findPixelogicEpisodeCode(value) {
  return cleanText(value)?.match(/(?:^|[_\s-])E0*(\d+)(?=$|[_\s-])/i)?.[1];
}

function parseProjectTitleParts(value) {
  const source = cleanText(value);
  if (!source) return {};

  const pixelogicMatch = source.match(
    /^(.*?)_Season\s*0*(\d+)(?:_E0*\d+)?(?:_Episode\s*0*(\d+))?/i,
  );
  if (pixelogicMatch) {
    return {
      title: cleanText(pixelogicMatch[1].replace(/_/g, " ")),
      season: String(Number(pixelogicMatch[2])),
      episode: parseNumberToken(
        findPixelogicEpisodeCode(source) ?? pixelogicMatch[3],
      ),
    };
  }

  const colonMatch = source.match(
    /^(.*?):\s*Season\s*0*(\d+)\s*:\s*Episode\s*0*(\d+)/i,
  );
  if (colonMatch) {
    return {
      title: cleanText(colonMatch[1]),
      season: String(Number(colonMatch[2])),
      episode: String(Number(colonMatch[3])),
    };
  }

  return { title: source };
}

function getSeriesTitle(project) {
  const parsedTitle = parseProjectTitleParts(project?.title);
  const parsedId = parseProjectTitleParts(project?.id);
  return (
    parsedTitle.title ??
    cleanText(project?.title) ??
    parsedId.title ??
    cleanText(project?.id)
  );
}

function getSeriesKey(project) {
  const title = getSeriesTitle(project);
  return title?.toLowerCase() ?? "";
}

function getSeasonKey(project) {
  const parsedTitle = parseProjectTitleParts(project?.title);
  const parsedId = parseProjectTitleParts(project?.id);
  const season =
    cleanText(project?.season) ??
    parsedTitle.season ??
    parsedId.season;

  if (!season) return "";
  const match = season.match(/\d+/);
  return match ? String(Number(match[0])) : "";
}

function getSeriesSeasonKey(project) {
  const seriesKey = getSeriesKey(project);
  const seasonKey = getSeasonKey(project);
  return seriesKey && seasonKey ? `${seriesKey}::${seasonKey}` : "";
}

function applySeriesDefaultsToProjects(projects, sourceProject) {
  const seriesKey = getSeriesKey(sourceProject);
  const seriesSeasonKey = getSeriesSeasonKey(sourceProject);
  if (!seriesKey) return projects;

  const defaults = {
    client: getSeriesDefaultValue(sourceProject, "client"),
    genre: getSeriesDefaultValue(sourceProject, "genre"),
  };
  const defaultKeys = Object.keys(defaults).filter((key) =>
    isDefinedProjectValue(defaults[key]),
  );
  const rateDefault = getSeriesDefaultValue(sourceProject, "rate");
  const shouldApplyRate =
    seriesSeasonKey && isDefinedProjectValue(rateDefault);
  if (!defaultKeys.length && !shouldApplyRate) return projects;

  return projects.map((project) => {
    if (getSeriesKey(project) !== seriesKey) {
      return project;
    }

    const updatedProject = { ...project };
    let didUpdate = false;
    defaultKeys.forEach((key) => {
      if (hasManualProjectField(updatedProject, key)) return;

      if (!isDefinedProjectValue(getSeriesDefaultValue(updatedProject, key))) {
        updatedProject[key] = defaults[key];
        didUpdate = true;
      }
    });

    if (
      shouldApplyRate &&
      getSeriesSeasonKey(updatedProject) === seriesSeasonKey &&
      !hasManualProjectField(updatedProject, "rate") &&
      (!isDefinedProjectValue(updatedProject.rate) ||
        isPixelogicDefaultRate(updatedProject.rate))
    ) {
      updatedProject.rate = rateDefault;
      didUpdate = true;
    }

    return didUpdate ? updatedProject : project;
  });
}

function formatCurrency(value) {
  const num = Number(value);
  if (isNaN(num)) return value;
  return "$" + num.toFixed(2);
}

function formatHourlyRate(value) {
  const num = Number(value);
  if (isNaN(num)) return value;
  return "$" + num.toFixed(2) + "/hr";
}

function formatRate(value) {
  const num = Number(value);
  if (isNaN(num)) return value;
  return "$" + num.toFixed(2) + "/min";
}

function formatElapsedTime(value) {
  const totalSeconds = Number(value);
  if (!Number.isFinite(totalSeconds)) return value;

  const totalCentiseconds = Math.floor(Math.max(0, totalSeconds) * 100);
  const hours = Math.floor(totalCentiseconds / 360000)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalCentiseconds % 360000) / 6000)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor((totalCentiseconds % 6000) / 100)
    .toString()
    .padStart(2, "0");
  const ff = (totalCentiseconds % 100).toString().padStart(2, "0");

  return `${hours}:${minutes}:${seconds}:${ff}`;
}

function formatRuntimeTimecode(value, frameRate) {
  const totalSeconds = Number(value);
  if (!Number.isFinite(totalSeconds)) return value;

  const absoluteSeconds = Math.abs(totalSeconds);
  const numericFrameRate = Number(frameRate);
  const fallbackFrameRate = 24;
  const resolvedFrameRate =
    Number.isFinite(numericFrameRate) && numericFrameRate > 0
      ? numericFrameRate
      : fallbackFrameRate;
  const frameBase = Math.max(Math.round(resolvedFrameRate), 1);

  let wholeSeconds = Math.floor(absoluteSeconds);
  let frames = Math.round((absoluteSeconds - wholeSeconds) * resolvedFrameRate);

  if (frames >= frameBase) {
    wholeSeconds += 1;
    frames = 0;
  }

  const hours = Math.floor(wholeSeconds / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((wholeSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(wholeSeconds % 60)
    .toString()
    .padStart(2, "0");
  const sign = totalSeconds < 0 ? "-" : "";

  return `${sign}${hours}:${minutes}:${seconds}:${String(frames).padStart(2, "0")}`;
}

function setFormText() {
  if (!defaultFields) return;

  if (!selectedProject) {
    for (const group of defaultFields.children) {
      const input = group.querySelector("input");
      if (input) input.value = "";
    }
    return;
  }

  for (const inputGroup of defaultFields.children) {
    const input = inputGroup.querySelector("input");
    if (!input) continue;

    if (!selectedProject) {
      input.value = "";
      continue;
    }
    const key = input.name;
    let value =
      key === "date_completed"
        ? selectedProject.date_completed ?? selectedProject.date_assigned
        : selectedProject[key];

    if (key === "runtime") {
      value = formatRuntimeTimecode(value, selectedProject?.frame_rate);
    }
    if (key === "rate") value = formatRate(value);
    if (key === "hourly_rate") value = formatHourlyRate(value);
    if (key === "invoice_amount") value = formatCurrency(value);
    if (key === "work_time") value = formatElapsedTime(value);
    console.log(value);
    input.value = value ?? "";
  }

  refreshLiveWorkTimeInput();
}

function collectFormValues() {
  const values = {};
  if (!defaultFields) return values;

  for (const inputGroup of defaultFields.children) {
    const input = inputGroup.querySelector("input");
    if (!input) continue;
    values[input.name] = input.value;
  }

  return values;
}

async function normalizeFormValues(rawValues, shouldUpdateWorkTime) {
  const module = await loadNormalizationModule();
  const parsedTitle = module.parseTitleAndEpisode(rawValues.title);
  const parsedEpisode = module.parseSeasonEpisodeInput(rawValues.episode);
  const season =
    module.normalizeSeasonInput(rawValues.season) ??
    parsedEpisode.season ??
    parsedTitle.season;
  const episode = module.normalizeEpisodeForSeason(
    module.normalizeEpisodeInput(rawValues.episode) ?? parsedTitle.episode,
    season,
  );
  const parsedWorkTime = module.normalizeDurationInput(rawValues.work_time);
  const effectiveWorkTime = shouldUpdateWorkTime
    ? parsedWorkTime
    : selectedProject?.work_time;
  const normalized = {
    title: parsedTitle.title ?? rawValues.title?.trim() ?? undefined,
    contractor: rawValues.contractor?.trim() || undefined,
    client: module.normalizeClientInput(rawValues.client),
    genre: cleanText(rawValues.genre),
    workplace_url: rawValues.workplace_url?.trim() || undefined,
    season,
    episode,
    date_completed: module.normalizeDateInput(rawValues.date_completed),
    date_due: module.normalizeDateInput(rawValues.date_due),
    runtime: module.normalizeDurationInput(
      rawValues.runtime,
      selectedProject?.frame_rate ?? 24,
    ),
    rate: module.normalizeRatePerMinuteInput(rawValues.rate),
  };

  if (shouldUpdateWorkTime) {
    normalized.work_time = parsedWorkTime;
  }

  const manualInvoiceAmount = module.normalizeMoneyInput(rawValues.invoice_amount);
  const manualHourlyRate = module.normalizeHourlyRateInput(rawValues.hourly_rate);
  const calculatedInvoiceAmount = module.calculateInvoiceAmount(
    normalized.rate,
    normalized.runtime,
  );
  const invoiceAmount = calculatedInvoiceAmount ?? manualInvoiceAmount;

  normalized.invoice_amount = invoiceAmount;
  normalized.hourly_rate =
    module.calculateHourlyRate(invoiceAmount, effectiveWorkTime) ??
    manualHourlyRate;

  return normalized;
}

function normalizeComparableValue(key, value) {
  if (value === undefined || value === null) return "";

  if (["runtime", "rate", "hourly_rate", "invoice_amount"].includes(key)) {
    const number = numericRate(value);
    return Number.isFinite(number) ? String(number) : "";
  }

  return cleanText(value) ?? "";
}

function getSelectedProjectComparableValue(key) {
  if (!selectedProject) return undefined;
  if (key === "date_completed") {
    return selectedProject.date_completed ?? selectedProject.date_assigned;
  }

  return selectedProject[key];
}

function getManuallyChangedFields(rawValues, normalizedValues) {
  return Object.keys(rawValues).filter((key) => {
    if (key === "work_time") return false;
    const currentValue = getSelectedProjectComparableValue(key);
    if (
      !isDefinedProjectValue(currentValue) &&
      !cleanText(rawValues[key])
    ) {
      return false;
    }

    return (
      normalizeComparableValue(key, normalizedValues[key]) !==
      normalizeComparableValue(key, currentValue)
    );
  });
}

function applyCodenameFromTitleEdit(project, changedFields) {
  if (
    !changedFields.includes("title") ||
    project[PROJECT_CODENAME_KEY] ||
    !cleanText(selectedProject?.title) ||
    cleanText(selectedProject.title) === cleanText(project.title)
  ) {
    return project;
  }

  return {
    ...project,
    [PROJECT_CODENAME_KEY]: selectedProject.title,
  };
}

async function updateProjectFromForm() {
  try {
    const shouldUpdateWorkTime = workTimeManuallyEdited;
    const rawValues = collectFormValues();
    const normalizedValues = await normalizeFormValues(
      rawValues,
      shouldUpdateWorkTime,
    );
    const manuallyChangedFields = getManuallyChangedFields(
      rawValues,
      normalizedValues,
    );
    const module = await loadNormalizationModule();

    let projectToSave = {
      ...(selectedProject ?? {}),
      ...normalizedValues,
    };
    projectToSave = withManualProjectFields(
      projectToSave,
      manuallyChangedFields,
    );
    projectToSave = applyCodenameFromTitleEdit(
      projectToSave,
      manuallyChangedFields,
    );

    if (!shouldUpdateWorkTime) {
      delete projectToSave.work_time;
    }

    const previousProjectId = selectedProject?.id;
    projectToSave.id = module.buildProjectId(projectToSave) ?? previousProjectId;

    if (!projectToSave.id) {
      console.warn(
        "Could not save project. Provide a title, and season/episode when applicable.",
      );
      return;
    }

    const result = await chrome.storage.local.get("projects");
    const projects = Array.isArray(result.projects) ? result.projects : [];
    const existingIndex = projects.findIndex((project) =>
      [previousProjectId, projectToSave.id].includes(project.id),
    );

    let savedProject = projectToSave;
    if (existingIndex >= 0) {
      savedProject = { ...projects[existingIndex], ...projectToSave };
      projects[existingIndex] = savedProject;
    } else {
      projects.push(savedProject);
    }

    const projectsToSave = applySeriesDefaultsToProjects(projects, savedProject);
    savedProject =
      projectsToSave.find((project) => project.id === savedProject.id) ??
      savedProject;

    await chrome.storage.local.set({ projects: projectsToSave });
    existingProjects = projectsToSave;
    if (activeProjectId === previousProjectId) {
      activeProjectId = projectToSave.id;
    }
    selectedProject = savedProject;
    if (shouldUpdateWorkTime) {
      latestStopwatchTime = Number.isFinite(selectedProject.work_time)
        ? selectedProject.work_time
        : latestStopwatchTime;
      workTimeManuallyEdited = false;
    }
    setFormText();
    if (shouldUpdateWorkTime) {
      await syncStopwatchFromPopup();
    }
    return savedProject;
  } catch (error) {
    console.error("Failed to update project from popup form:", error);
  }
}

async function syncStopwatchFromPopup() {
  if (!selectedProject?.id || !Number.isFinite(selectedProject.work_time)) return;

  try {
    const activeTabId = await getActiveTabId();
    if (!activeTabId) return;

    chrome.tabs.sendMessage(
      activeTabId,
      {
        action: "set-stopwatch-time",
        elapsedTime: selectedProject.work_time,
        projectId: selectedProject.id,
        source: "popup.js",
      },
      () => {
        if (chrome.runtime.lastError) {
          // Stopwatch script may not be active on this tab yet.
        }
      },
    );
  } catch (error) {
    console.error("Failed to sync popup work time to stopwatch:", error);
  }
}

async function exportProject() {
  const savedProject = await updateProjectFromForm();
  if (!savedProject?.id) {
    throw new Error("Could not save project. Export canceled.");
  }

  const response = await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "export-project-data",
        projectId: savedProject.id,
        source: "popup.js",
      },
      (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(result);
      },
    );
  });
  if (!response?.success) {
    throw new Error(response?.error || "Export failed. Please try again.");
  }
}
})();
