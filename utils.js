export const normalizeProjectTitle = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const normalizeString = (value) => value.trim().toLowerCase();

export const normalizeDurationMap = (raw) => {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  return Object.entries(raw).reduce((acc, [key, value]) => {
    if (typeof key === "string" && typeof value === "number") {
      acc[key.trim()] = Number.isFinite(value) ? Math.max(0, value) : 0;
    }
    return acc;
  }, {});
};

export const formatDurationForDisplay = (durationMs) => {
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

export const updateWorkTimeValueDisplay = (
  durationMs,
  elementId = "work-time-value"
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with ID "${elementId}" not found`);
    return;
  }
  element.textContent = formatDurationForDisplay(durationMs);
};

export const refreshWorkTimeForSelection = async (
  selectedProjectKey,
  cachedOptionSets
) => {
  if (!selectedProjectKey) {
    updateWorkTimeValueDisplay(0);
    return;
  }
  const selectedSet = findOptionSetByKey(cachedOptionSets, selectedProjectKey);
  if (!selectedSet) {
    updateWorkTimeValueDisplay(0);
    return;
  }
  const durationMs = await getProjectDuration(selectedSet.projectTitle);
  updateWorkTimeValueDisplay(durationMs);
};

export const getCurrentMonthYear = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = String(now.getFullYear()).slice(-2);
  return `${month}/${year}`;
};

export const sanitizeValue = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeValue(entry))
      .filter((entry) => entry.length > 0)
      .join(", ");
  }
  if (typeof value === "object" && value !== null) {
    const sanitized = {};
    Object.keys(record ?? {}).forEach((key) => {
      const value = record[key];
      if (typeof value !== "function") {
        sanitized[key] = value;
      }
    });
    return sanitized;
  }
  return "";
};
