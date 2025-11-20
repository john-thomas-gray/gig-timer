"use strict";

const OPTIONS_STORAGE_SETS_KEY = "savedProjects";
const LEGACY_MATCHES_STORAGE_KEY = "workspaceUrl";

const getChromeLocalStorage = () => {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  const storage = chrome.storage?.local;
  return storage && typeof storage === "object" ? storage : undefined;
};

const getChromeStorage = () => {
  if (typeof chrome === "undefined") {
    return undefined;
  }
  const storage = chrome.storage;
  return storage && typeof storage === "object" ? storage : undefined;
};

const hasChromeLocalStorageMethod = (
  methodName,
  storageLocal = getChromeLocalStorage()
) => {
  if (!storageLocal || typeof methodName !== "string") {
    return false;
  }
  const method = storageLocal[methodName];
  return typeof method === "function";
};

const getChromeStorageOnChanged = () => {
  const storage = getChromeStorage();
  if (!storage) {
    return undefined;
  }
  return storage.onChanged ?? undefined;
};

const addChromeStorageChangeListener = (listener) => {
  if (typeof listener !== "function") {
    return null;
  }
  const storageOnChanged = getChromeStorageOnChanged();
  if (!storageOnChanged || typeof storageOnChanged.addListener !== "function") {
    return null;
  }
  storageOnChanged.addListener(listener);
  const removeListener = () => {
    if (
      storageOnChanged &&
      typeof storageOnChanged.removeListener === "function"
    ) {
      storageOnChanged.removeListener(listener);
    }
  };
  return removeListener;
};

const sanitizeToNonEmptyString = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
};

const formatDurationAsClock = (durationMs) => {
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

const normalizeDurationMap = (raw) => {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return Object.entries(raw).reduce((acc, [key, value]) => {
    if (typeof key !== "string") {
      return acc;
    }
    const trimmedKey = key.trim();
    if (
      trimmedKey.length === 0 ||
      typeof value !== "number" ||
      !Number.isFinite(value)
    ) {
      return acc;
    }
    acc[trimmedKey] = Math.max(0, value);
    return acc;
  }, {});
};

const extractNonEmptyTrimmedStrings = (raw) => {
  if (typeof raw === "string") {
    const sanitized = sanitizeToNonEmptyString(raw);
    return sanitized ? [sanitized] : [];
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((value) => typeof value === "string")
      .map((value) => sanitizeToNonEmptyString(value))
      .filter((value) => value.length > 0);
  }
  return [];
};

const getFirstStringFromRawValue = (raw, fallback = "") => {
  if (typeof raw === "string") {
    return raw;
  }
  if (Array.isArray(raw)) {
    const firstString = raw.find((value) => typeof value === "string");
    if (typeof firstString === "string") {
      return firstString;
    }
  }
  return fallback;
};

const retrieveValuesFromStoredProjects = (raw) => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const matches = new Set();
  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    extractNonEmptyTrimmedStrings(entry.workspaceUrl).forEach((value) => {
      matches.add(value);
    });
  });
  return Array.from(matches);
};

export {
  OPTIONS_STORAGE_SETS_KEY,
  LEGACY_MATCHES_STORAGE_KEY,
  getChromeLocalStorage,
  hasChromeLocalStorageMethod,
  extractNonEmptyTrimmedStrings,
  getFirstStringFromRawValue,
  retrieveValuesFromStoredProjects,
  sanitizeToNonEmptyString,
  formatDurationAsClock,
  normalizeDurationMap,
  getChromeStorageOnChanged,
  addChromeStorageChangeListener,
};
