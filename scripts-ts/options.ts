type AdditionalFieldName =
  | "projectTitle"
  | "client"
  | "studio"
  | "genre"
  | "season"
  | "subtitles"
  | "runtime"
  | "rate"
  | "dateBooked";

type StoredOptions = {
  matchesUrl: string;
} & Record<AdditionalFieldName, string>;

type StorageResult = Partial<Record<keyof StoredOptions, unknown>>;

type StoredOptionsCollection = StoredOptions[];

type ProjectDurationMap = Record<string, number>;

type OptionsStorageChangeMap = Record<
  string,
  { newValue?: unknown; oldValue?: unknown }
>;

type OptionsStorageOnChanged = {
  addListener?: (
    callback: (changes: OptionsStorageChangeMap, areaName: string) => void
  ) => void;
  removeListener?: (
    callback: (changes: OptionsStorageChangeMap, areaName: string) => void
  ) => void;
};

type OptionsConfirmationModalConfig = {
  message: string;
  cancelText?: string;
  confirmText?: string;
  onConfirm: () => void;
};

type OptionsModalApi = {
  showConfirmation: (options: OptionsConfirmationModalConfig) => void;
};

const getWorkTimerModal = (): OptionsModalApi | undefined =>
  (window as typeof window & { workTimerModal?: OptionsModalApi })
    .workTimerModal;

type AdditionalFieldConfig = {
  id: string;
  label: string;
  name: AdditionalFieldName;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: any;
  getDefaultValue?: () => string;
};

const savedUrlElement = document.getElementById("saved-url");
const inputElement = document.getElementById(
  "url-input"
) as HTMLInputElement | null;
const formElement = document.getElementById("url-form");
const statusElement = document.getElementById("status");
const datasetSelectElement = document.getElementById(
  "dataset-select"
) as HTMLSelectElement | null;
const workTimeValueElement = document.getElementById("work-time-value");
const deleteButtonElement = document.getElementById(
  "delete-button"
) as HTMLButtonElement | null;

const OPTIONS_STORAGE_SETS_KEY = "savedOptionSets";
const OPTIONS_PROJECT_DURATIONS_KEY = "projectDurations";

const getCurrentMonthYear = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  return `${month}/${year}`;
};

const additionalFieldConfigs: AdditionalFieldConfig[] = [
  {
    id: "project-title-input",
    label: "Project Title",
    name: "projectTitle",
  },
  {
    id: "client-input",
    label: "Client",
    name: "client",
  },
  {
    id: "studio-input",
    label: "Studio",
    name: "studio",
  },
  {
    id: "genre-input",
    label: "Genre",
    name: "genre",
  },
  {
    id: "season-input",
    label: "Season",
    name: "season",
    required: false,
    defaultValue: undefined,
  },
  {
    id: "subtitles-input",
    label: "Subtitles?",
    name: "subtitles",
    required: false,
    defaultValue: "No",
  },
  {
    id: "runtime-input",
    label: "Runtime",
    name: "runtime",
  },

  {
    id: "rate-input",
    label: "Rate",
    name: "rate",
  },

  {
    id: "date-booked-input",
    label: "Date Booked",
    name: "dateBooked",
    required: false,
    getDefaultValue: getCurrentMonthYear,
  },
];

const storedOptionFieldNames: Array<keyof StoredOptions> = [
  "matchesUrl",
  ...additionalFieldConfigs.map((config) => config.name),
];

const additionalInputs: Partial<Record<AdditionalFieldName, HTMLInputElement>> =
  {};

let cachedOptionSets: StoredOptionsCollection = [];
let selectedProjectTitleKey: string | null = null;
let hasAttachedStorageListener = false;
let isPersistingActiveDataset = false;

const formatDurationForDisplay = (durationMs: number): string => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "00:00:00";
  }

  const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
};

const updateWorkTimeDisplay = (durationMs: number): void => {
  if (!workTimeValueElement) {
    return;
  }

  workTimeValueElement.textContent = formatDurationForDisplay(durationMs);
};

const getProjectTitleKey = (value: string): string =>
  value.trim().toLowerCase();

const findOptionSetByKey = (
  collection: StoredOptionsCollection,
  key: string | null
): StoredOptions | undefined => {
  if (!key) {
    return undefined;
  }

  return collection.find(
    (entry) => getProjectTitleKey(entry.projectTitle) === key
  );
};

const normalizeOptionsDurationMap = (raw: unknown): ProjectDurationMap => {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  return Object.entries(
    raw as Record<string, unknown>
  ).reduce<ProjectDurationMap>((acc, [title, durationValue]) => {
    if (
      typeof title === "string" &&
      typeof durationValue === "number" &&
      Number.isFinite(durationValue)
    ) {
      acc[title.trim()] = Math.max(0, durationValue);
    }
    return acc;
  }, {});
};

const getProjectDuration = (projectTitle: string): Promise<number> =>
  new Promise((resolve) => {
    const trimmedTitle = projectTitle.trim();

    if (
      trimmedTitle.length === 0 ||
      typeof chrome === "undefined" ||
      !chrome.storage?.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      resolve(0);
      return;
    }

    const storageLocal = chrome.storage?.local;

    if (!storageLocal || typeof storageLocal.get !== "function") {
      resolve(0);
      return;
    }

    storageLocal.get(
      [OPTIONS_PROJECT_DURATIONS_KEY],
      (result: Record<string, unknown>) => {
        if (chrome?.runtime?.lastError) {
          resolve(0);
          return;
        }

        const durations = normalizeOptionsDurationMap(
          result[OPTIONS_PROJECT_DURATIONS_KEY]
        );

        resolve(durations[trimmedTitle] ?? 0);
      }
    );
  });

const refreshWorkTimeForSelection = async (): Promise<void> => {
  if (!selectedProjectTitleKey) {
    updateWorkTimeDisplay(0);
    return;
  }

  const selectedSet = findOptionSetByKey(
    cachedOptionSets,
    selectedProjectTitleKey
  );

  if (!selectedSet) {
    updateWorkTimeDisplay(0);
    return;
  }

  const durationMs = await getProjectDuration(selectedSet.projectTitle);
  updateWorkTimeDisplay(durationMs);
};

const persistActiveDataset = async (dataset: StoredOptions): Promise<void> => {
  const storageLocal =
    typeof chrome !== "undefined" ? chrome.storage?.local : undefined;

  if (!storageLocal || typeof storageLocal.set !== "function") {
    return;
  }

  const durationMs = await getProjectDuration(dataset.projectTitle);

  isPersistingActiveDataset = true;

  storageLocal.set(
    {
      ...dataset,
      projectTitle: dataset.projectTitle,
      lastSessionDurationMs: durationMs,
    },
    () => {
      isPersistingActiveDataset = false;

      if (chrome?.runtime?.lastError) {
        reportStatus(
          chrome.runtime.lastError.message ??
            "An error occurred while updating project selection."
        );
      }
    }
  );
};

const getDefaultValueForConfig = (config: AdditionalFieldConfig): string => {
  if (typeof config.getDefaultValue === "function") {
    return config.getDefaultValue();
  }

  return config.defaultValue ?? "";
};

const createDefaultStoredOptions = (): StoredOptions => ({
  matchesUrl: "",
  projectTitle: "",
  client: "",
  studio: "",
  genre: "",
  season: "",
  subtitles: "No",
  runtime: "",
  rate: "",
  dateBooked: getCurrentMonthYear(),
});

const normalizeStoredOption = <Key extends keyof StoredOptions>(
  storageResult: StorageResult,
  key: Key,
  fallback: StoredOptions[Key]
): StoredOptions[Key] => {
  const rawValue = storageResult?.[key];

  if (typeof rawValue === "string") {
    return rawValue;
  }

  if (Array.isArray(rawValue)) {
    const firstString = rawValue.find(
      (value): value is string => typeof value === "string"
    );

    if (firstString) {
      return firstString;
    }
  }

  return fallback;
};

const createStoredOptionsFromResult = (
  storageResult: StorageResult | undefined,
  defaults: StoredOptions
): StoredOptions => {
  const source = storageResult ?? {};
  const normalized: StoredOptions = { ...defaults };

  storedOptionFieldNames.forEach((field) => {
    const value = normalizeStoredOption(source, field, defaults[field]);
    normalized[field] = value.trim();
  });

  return normalized;
};

const sanitizeStoredOptionsInput = (
  input: StoredOptions,
  defaults: StoredOptions
): StoredOptions => {
  const sanitized: StoredOptions = { ...defaults };

  storedOptionFieldNames.forEach((field) => {
    const rawValue = input[field];

    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      sanitized[field] = rawValue.trim();
    }
  });

  return sanitized;
};

const hasStoredOptionsData = (options: StoredOptions): boolean =>
  options.matchesUrl.trim().length > 0 &&
  options.projectTitle.trim().length > 0;

const upsertOptionSet = (
  collection: StoredOptionsCollection,
  entry: StoredOptions
): StoredOptionsCollection => {
  const projectKey = getProjectTitleKey(entry.projectTitle);

  if (projectKey.length === 0) {
    return collection.slice();
  }

  const withoutDuplicate = collection.filter(
    (existing) => getProjectTitleKey(existing.projectTitle) !== projectKey
  );

  return [...withoutDuplicate, entry];
};

const normalizeStoredOptionCollection = (
  rawCollection: unknown,
  defaults: StoredOptions
): StoredOptionsCollection => {
  if (!Array.isArray(rawCollection)) {
    return [];
  }

  return rawCollection.reduce<StoredOptionsCollection>((acc, entry) => {
    if (!entry || typeof entry !== "object") {
      return acc;
    }

    const sanitized = createStoredOptionsFromResult(
      entry as StorageResult,
      defaults
    );

    if (!hasStoredOptionsData(sanitized)) {
      return acc;
    }

    return upsertOptionSet(acc, sanitized);
  }, []);
};

const buildDisplayEntries = (
  storedValues: StoredOptions
): Array<[string, string]> => {
  const entries: Array<[string, string]> = [];

  const matchesUrl = storedValues.matchesUrl.trim();

  if (matchesUrl.length > 0) {
    entries.push(["Matches URL", matchesUrl]);
  }

  additionalFieldConfigs.forEach((config) => {
    const value = storedValues[config.name];

    if (typeof value === "string" && value.trim().length > 0) {
      entries.push([config.label, value]);
    }
  });

  return entries;
};

const displaySelectedOptionSet = (optionSet?: StoredOptions): void => {
  if (!savedUrlElement) {
    return;
  }

  const container = savedUrlElement;
  container.replaceChildren();

  if (!optionSet) {
    container.textContent = "No dataset selected.";
    return;
  }

  buildDisplayEntries(optionSet).forEach(([label, value]) => {
    const line = document.createElement("div");
    line.textContent = `${label}: ${value}`;
    container.appendChild(line);
  });
};

const populateDatasetSelect = (
  optionSets: StoredOptionsCollection,
  selectedKey: string | null
): void => {
  if (!datasetSelectElement) {
    return;
  }

  datasetSelectElement.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a project";
  datasetSelectElement.appendChild(placeholder);

  optionSets.forEach((optionSet) => {
    const projectTitle = optionSet.projectTitle.trim();
    const option = document.createElement("option");
    option.value = getProjectTitleKey(projectTitle);
    option.textContent = projectTitle || "(Untitled Project)";
    datasetSelectElement.appendChild(option);
  });

  const valueToSelect = selectedKey ?? "";
  datasetSelectElement.value = valueToSelect;
};

const applyOptionSetsState = (
  optionSets: StoredOptionsCollection,
  defaultOptions: StoredOptions,
  preferredKey?: string | null
): void => {
  cachedOptionSets = optionSets.map((entry) => ({ ...entry }));

  const defaultEntry =
    preferredKey !== undefined
      ? findOptionSetByKey(cachedOptionSets, preferredKey)
      : undefined;

  const fallbackEntry =
    cachedOptionSets.length > 0
      ? cachedOptionSets[cachedOptionSets.length - 1]
      : undefined;

  const activeEntry =
    defaultEntry ??
    findOptionSetByKey(cachedOptionSets, selectedProjectTitleKey) ??
    fallbackEntry;

  selectedProjectTitleKey = activeEntry
    ? getProjectTitleKey(activeEntry.projectTitle)
    : null;

  populateDatasetSelect(cachedOptionSets, selectedProjectTitleKey);

  displaySelectedOptionSet(activeEntry);
  fillFormFields(activeEntry ?? defaultOptions);

  void refreshWorkTimeForSelection();

  if (activeEntry) {
    void persistActiveDataset(activeEntry);
  }
};

const handleDatasetSelectionChange = (): void => {
  if (!datasetSelectElement) {
    return;
  }

  const selectedValue = datasetSelectElement.value.trim();
  selectedProjectTitleKey = selectedValue.length > 0 ? selectedValue : null;

  const defaultOptions = createDefaultStoredOptions();
  const selectedSet = findOptionSetByKey(
    cachedOptionSets,
    selectedProjectTitleKey
  );

  clearStatus();
  displaySelectedOptionSet(selectedSet);
  fillFormFields(selectedSet ?? defaultOptions);

  void refreshWorkTimeForSelection();

  if (selectedSet) {
    void persistActiveDataset(selectedSet);
  }
};

const handleOptionsStorageChange = (
  changes: OptionsStorageChangeMap,
  areaName: string
): void => {
  if (areaName !== "local") {
    return;
  }

  if (isPersistingActiveDataset) {
    if (
      Object.prototype.hasOwnProperty.call(
        changes,
        OPTIONS_PROJECT_DURATIONS_KEY
      ) ||
      Object.prototype.hasOwnProperty.call(changes, "lastSessionDurationMs")
    ) {
      void refreshWorkTimeForSelection();
    }

    return;
  }

  let shouldReload = false;
  let shouldRefreshWorkTime = false;
  let durationOverride: number | null = null;

  if (Object.prototype.hasOwnProperty.call(changes, OPTIONS_STORAGE_SETS_KEY)) {
    shouldReload = true;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      changes,
      OPTIONS_PROJECT_DURATIONS_KEY
    ) ||
    Object.prototype.hasOwnProperty.call(changes, "lastSessionDurationMs")
  ) {
    shouldRefreshWorkTime = true;
  }

  if (
    Object.prototype.hasOwnProperty.call(
      changes,
      OPTIONS_PROJECT_DURATIONS_KEY
    ) &&
    selectedProjectTitleKey
  ) {
    const selectedSet = findOptionSetByKey(
      cachedOptionSets,
      selectedProjectTitleKey
    );

    if (selectedSet) {
      const durationMap = normalizeOptionsDurationMap(
        changes[OPTIONS_PROJECT_DURATIONS_KEY]?.newValue
      );
      const trimmedTitle = selectedSet.projectTitle.trim();
      if (Object.prototype.hasOwnProperty.call(durationMap, trimmedTitle)) {
        durationOverride = Math.max(0, durationMap[trimmedTitle] ?? 0);
      }
    }
  }

  if (
    durationOverride === null &&
    Object.prototype.hasOwnProperty.call(changes, "lastSessionDurationMs")
  ) {
    const rawDuration = changes.lastSessionDurationMs?.newValue;
    if (typeof rawDuration === "number" && Number.isFinite(rawDuration)) {
      durationOverride = Math.max(0, rawDuration);
    }
  }

  if (Object.prototype.hasOwnProperty.call(changes, "projectTitle")) {
    const rawTitle = changes.projectTitle?.newValue;
    const titleString =
      typeof rawTitle === "string" && rawTitle.trim().length > 0
        ? rawTitle.trim()
        : "";

    if (titleString.length > 0) {
      selectedProjectTitleKey = getProjectTitleKey(titleString);
      shouldRefreshWorkTime = true;
    } else if (selectedProjectTitleKey) {
      selectedProjectTitleKey = null;
      shouldRefreshWorkTime = true;
    }
  }

  if (shouldReload) {
    loadSavedOptions();
    return;
  }

  if (durationOverride !== null) {
    updateWorkTimeDisplay(durationOverride);
    shouldRefreshWorkTime = false;
  }

  if (shouldRefreshWorkTime) {
    void refreshWorkTimeForSelection();
  }
};

const getOptionsStorageOnChanged = (): OptionsStorageOnChanged | undefined => {
  if (typeof chrome === "undefined") {
    return undefined;
  }

  const storage = (
    chrome as { storage?: { onChanged?: OptionsStorageOnChanged } }
  ).storage;

  return storage?.onChanged ?? undefined;
};

const attachOptionsStorageChangeListener = (): void => {
  if (hasAttachedStorageListener) {
    return;
  }

  const storageOnChanged = getOptionsStorageOnChanged();

  if (!storageOnChanged || typeof storageOnChanged.addListener !== "function") {
    return;
  }

  storageOnChanged.addListener(handleOptionsStorageChange);
  hasAttachedStorageListener = true;

  window.addEventListener(
    "unload",
    () => {
      if (
        storageOnChanged &&
        typeof storageOnChanged.removeListener === "function"
      ) {
        storageOnChanged.removeListener(handleOptionsStorageChange);
      }
      hasAttachedStorageListener = false;
    },
    { once: true }
  );
};

const deleteSelectedDataset = (): void => {
  if (!selectedProjectTitleKey) {
    reportStatus("Select a project to delete.");
    return;
  }

  const targetSet = findOptionSetByKey(
    cachedOptionSets,
    selectedProjectTitleKey
  );

  if (!targetSet) {
    reportStatus("Select a project to delete.");
    return;
  }

  const defaults = createDefaultStoredOptions();
  const targetKey = getProjectTitleKey(targetSet.projectTitle);
  const fallbackCollection = cachedOptionSets.filter(
    (entry) => getProjectTitleKey(entry.projectTitle) !== targetKey
  );

  selectedProjectTitleKey = null;

  const storageLocal = chrome?.storage?.local;

  if (!storageLocal || typeof storageLocal.get !== "function") {
    applyOptionSetsState(fallbackCollection, defaults, null);
    updateWorkTimeDisplay(0);
    reportStatus("Deleted.");
    return;
  }

  const storageKeys: string[] = [
    OPTIONS_STORAGE_SETS_KEY,
    OPTIONS_PROJECT_DURATIONS_KEY,
    ...storedOptionFieldNames,
    "projectTitle",
    "lastSessionDurationMs",
  ];

  storageLocal.get(storageKeys, (result: Record<string, unknown>) => {
    if (chrome?.runtime?.lastError) {
      reportStatus(
        chrome.runtime.lastError.message ??
          "An error occurred while deleting project."
      );
      return;
    }

    const rawCollection = result[OPTIONS_STORAGE_SETS_KEY];
    let normalizedCollection = normalizeStoredOptionCollection(
      rawCollection,
      defaults
    );

    const legacyCandidate = createStoredOptionsFromResult(
      result as StorageResult,
      defaults
    );

    if (hasStoredOptionsData(legacyCandidate)) {
      normalizedCollection = upsertOptionSet(
        normalizedCollection,
        legacyCandidate
      );
    }

    const updatedCollection = normalizedCollection.filter(
      (entry) => getProjectTitleKey(entry.projectTitle) !== targetKey
    );

    const durationMap = normalizeOptionsDurationMap(
      result[OPTIONS_PROJECT_DURATIONS_KEY]
    );

    delete durationMap[targetSet.projectTitle.trim()];

    const updates: Record<string, unknown> = {
      [OPTIONS_STORAGE_SETS_KEY]: updatedCollection,
      [OPTIONS_PROJECT_DURATIONS_KEY]: durationMap,
    };

    const preferredKey: string | null = null;

    if (updatedCollection.length === 0) {
      storedOptionFieldNames.forEach((field) => {
        updates[field] = defaults[field];
      });
      updates.projectTitle = "";
      updates.lastSessionDurationMs = 0;
    }

    storageLocal.set(updates, () => {
      if (chrome?.runtime?.lastError) {
        reportStatus(
          chrome.runtime.lastError.message ??
            "An error occurred while deleting project."
        );
        return;
      }

      applyOptionSetsState(updatedCollection, defaults, preferredKey);
      updateWorkTimeDisplay(0);
      reportStatus("Deleted.");
    });
  });
};

const reportStatus = (message: string): void => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
};

const clearStatus = (): void => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = "";
};

const fillFormFields = (storedValues: StoredOptions): void => {
  if (inputElement) {
    inputElement.value = storedValues.matchesUrl;
  }

  additionalFieldConfigs.forEach((config) => {
    const input = additionalInputs[config.name];

    if (!input) {
      return;
    }

    input.value = storedValues[config.name];
  });
};

const loadSavedOptions = (): void => {
  const defaultOptions = createDefaultStoredOptions();

  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.local ||
    typeof chrome.storage.local.get !== "function"
  ) {
    applyOptionSetsState(cachedOptionSets, defaultOptions);
    return;
  }

  const storageKeys: string[] = [
    OPTIONS_STORAGE_SETS_KEY,
    ...storedOptionFieldNames,
  ];

  chrome.storage.local.get(storageKeys, (result) => {
    if (chrome?.runtime?.lastError) {
      reportStatus(
        chrome.runtime.lastError.message ?? "An error occurred while loading."
      );
      applyOptionSetsState([], defaultOptions);
      return;
    }

    const rawCollection = (result as Record<string, unknown>)[
      OPTIONS_STORAGE_SETS_KEY
    ];

    const normalizedCollection = normalizeStoredOptionCollection(
      rawCollection,
      defaultOptions
    );

    const legacyCandidate = createStoredOptionsFromResult(
      result as StorageResult,
      defaultOptions
    );

    const preferredKey = hasStoredOptionsData(legacyCandidate)
      ? getProjectTitleKey(legacyCandidate.projectTitle)
      : null;

    const resolvedCollection = hasStoredOptionsData(legacyCandidate)
      ? upsertOptionSet(normalizedCollection, legacyCandidate)
      : normalizedCollection;

    applyOptionSetsState(resolvedCollection, defaultOptions, preferredKey);
    clearStatus();
  });
};

const collectFormValues = (): StoredOptions => {
  const defaults = createDefaultStoredOptions();

  const matchesUrl = inputElement?.value.trim() ?? "";

  const collected: StoredOptions = {
    ...defaults,
    matchesUrl,
  };

  additionalFieldConfigs.forEach((config) => {
    const input = additionalInputs[config.name];
    const trimmedValue = input?.value.trim() ?? "";

    if (trimmedValue.length > 0) {
      collected[config.name] = trimmedValue;
      return;
    }

    const defaultValue = getDefaultValueForConfig(config);

    if (defaultValue.length > 0) {
      collected[config.name] = defaultValue;
    }
  });

  return collected;
};

const saveOptions = (values: StoredOptions): void => {
  const defaults = createDefaultStoredOptions();
  const sanitizedEntry = sanitizeStoredOptionsInput(values, defaults);

  if (!hasStoredOptionsData(sanitizedEntry)) {
    reportStatus("Matches URL and Project Title are required.");
    return;
  }

  const selectedKey = getProjectTitleKey(sanitizedEntry.projectTitle);

  const storageLocal =
    typeof chrome !== "undefined" ? chrome.storage?.local : undefined;

  if (
    !storageLocal ||
    typeof storageLocal.get !== "function" ||
    typeof storageLocal.set !== "function"
  ) {
    const updatedCollection = upsertOptionSet(cachedOptionSets, sanitizedEntry);
    applyOptionSetsState(updatedCollection, defaults, selectedKey);
    reportStatus("Saved.");
    return;
  }

  storageLocal.get([OPTIONS_STORAGE_SETS_KEY], (result) => {
    if (chrome?.runtime?.lastError) {
      reportStatus(
        chrome.runtime.lastError.message ?? "An error occurred while saving."
      );
      return;
    }

    const existingCollection = normalizeStoredOptionCollection(
      (result as Record<string, unknown>)[OPTIONS_STORAGE_SETS_KEY],
      defaults
    );

    const updatedCollection = upsertOptionSet(
      existingCollection,
      sanitizedEntry
    );

    storageLocal.set(
      {
        [OPTIONS_STORAGE_SETS_KEY]: updatedCollection,
        ...sanitizedEntry,
      },
      () => {
        if (chrome?.runtime?.lastError) {
          reportStatus(
            chrome.runtime.lastError.message ??
              "An error occurred while saving."
          );
          return;
        }

        applyOptionSetsState(updatedCollection, defaults, selectedKey);
        reportStatus("Saved.");
      }
    );
  });
};

const requestProjectDeletion = (): void => {
  if (!selectedProjectTitleKey) {
    reportStatus("Select a project to delete.");
    return;
  }

  const targetSet = findOptionSetByKey(
    cachedOptionSets,
    selectedProjectTitleKey
  );

  if (!targetSet) {
    reportStatus("Select a project to delete.");
    return;
  }

  const projectLabel =
    targetSet.projectTitle.trim().length > 0
      ? targetSet.projectTitle.trim()
      : "this project";

  const handleConfirm = (): void => {
    deleteSelectedDataset();
  };

  const modalApi = getWorkTimerModal();

  if (modalApi) {
    modalApi.showConfirmation({
      message: `Are you sure you want to delete "${projectLabel}"?`,
      cancelText: "No",
      confirmText: "Yes",
      onConfirm: handleConfirm,
    });
    return;
  }

  const shouldDelete = window.confirm(
    `Are you sure you want to delete "${projectLabel}"?`
  );

  if (shouldDelete) {
    handleConfirm();
  }
};

if (formElement instanceof HTMLFormElement) {
  if (inputElement) {
    inputElement.required = true;
  }

  const submitButton = formElement.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
  );

  additionalFieldConfigs.forEach((config) => {
    const label = document.createElement("label");
    label.setAttribute("for", config.id);
    label.textContent = config.label;

    const input = document.createElement("input");
    input.type = config.type ?? "text";
    input.id = config.id;
    input.name = config.name;
    input.required = config.required ?? true;
    if (config.placeholder) {
      input.placeholder = config.placeholder;
    }

    const defaultValue = getDefaultValueForConfig(config);
    if (defaultValue.length > 0) {
      input.value = defaultValue;
    }

    additionalInputs[config.name] = input;

    if (submitButton) {
      formElement.insertBefore(label, submitButton);
      formElement.insertBefore(input, submitButton);
    } else {
      formElement.appendChild(label);
      formElement.appendChild(input);
    }
  });

  formElement.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!inputElement) {
      return;
    }

    const values = collectFormValues();

    saveOptions(values);
  });
}

if (datasetSelectElement) {
  datasetSelectElement.addEventListener("change", () => {
    handleDatasetSelectionChange();
  });
}

if (deleteButtonElement) {
  deleteButtonElement.addEventListener("click", () => {
    requestProjectDeletion();
  });
}

const initializeOptionsPage = (): void => {
  attachOptionsStorageChangeListener();
  loadSavedOptions();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initializeOptionsPage();
  });
} else {
  initializeOptionsPage();
}
