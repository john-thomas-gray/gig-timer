"use strict";
const POPUP_GOOGLE_APPS_SCRIPT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwKRKegGwQLUNs0ANSTfz7_L-944XcWJgtJxIUTUSnLV9liUD1AXxGPVmdHCVWqNs2A/exec";
const POPUP_PROJECT_DURATIONS_KEY = "projectDurations";
const POPUP_DATASET_FIELD_NAMES = [
    "matchesUrl",
    "client",
    "studio",
    "genre",
    "season",
    "subtitles",
    "runtime",
    "rate",
    "dateBooked",
];
const datasetFieldElements = {
    matchesUrl: document.getElementById("summary-matches-url"),
    client: document.getElementById("summary-client"),
    studio: document.getElementById("summary-studio"),
    genre: document.getElementById("summary-genre"),
    season: document.getElementById("summary-season"),
    subtitles: document.getElementById("summary-subtitles"),
    runtime: document.getElementById("summary-runtime"),
    rate: document.getElementById("summary-rate"),
    dateBooked: document.getElementById("summary-dateBooked"),
};
const popupStatusElement = document.getElementById("status");
const popupSubmitButton = document.getElementById("submit-button");
const popupResetButton = document.getElementById("reset-button");
const popupProjectTitleElement = document.getElementById("project-title");
const popupWorkTimeElement = document.getElementById("work-time");
let currentSummary = {
    projectTitle: null,
    durationMs: 0,
    fields: {},
};
let hasAttachedStorageChangeListener = false;
const normalizePopupDurationMap = (raw) => {
    if (!raw || typeof raw !== "object") {
        return {};
    }
    return Object.entries(raw).reduce((acc, [title, value]) => {
        if (typeof title === "string" && typeof value === "number") {
            acc[title] = Number.isFinite(value) ? Math.max(0, value) : 0;
        }
        return acc;
    }, {});
};
const sanitizePopupFieldValue = (value) => {
    if (typeof value !== "string") {
        return "";
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "";
};
const formatDurationForSheetValue = (durationMs) => {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return "00:00:00";
    }
    const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};
const setPopupStatus = (message, isError = false) => {
    if (!popupStatusElement) {
        return;
    }
    popupStatusElement.textContent = message;
    if (isError) {
        popupStatusElement.setAttribute("data-status", "error");
        return;
    }
    popupStatusElement.setAttribute("data-status", "success");
};
const clearPopupStatus = () => {
    if (!popupStatusElement) {
        return;
    }
    popupStatusElement.textContent = "";
    popupStatusElement.removeAttribute("data-status");
};
const getStoredSummary = () => new Promise((resolve) => {
    if (typeof chrome === "undefined") {
        resolve({ projectTitle: null, durationMs: 0, fields: {} });
        return;
    }
    const storageLocal = chrome.storage?.local;
    if (!storageLocal || typeof storageLocal.get !== "function") {
        resolve({ projectTitle: null, durationMs: 0, fields: {} });
        return;
    }
    const fieldKeys = [
        "projectTitle",
        "lastSessionDurationMs",
        POPUP_PROJECT_DURATIONS_KEY,
        ...POPUP_DATASET_FIELD_NAMES,
    ];
    storageLocal.get(fieldKeys, (items) => {
        if (chrome?.runtime?.lastError) {
            console.warn("Failed to retrieve stored values for popup summary.", chrome.runtime.lastError);
            resolve({ projectTitle: null, durationMs: 0, fields: {} });
            return;
        }
        const rawTitle = items.projectTitle;
        const projectTitle = typeof rawTitle === "string" && rawTitle.trim().length > 0
            ? rawTitle.trim()
            : null;
        const fields = {};
        POPUP_DATASET_FIELD_NAMES.forEach((fieldName) => {
            fields[fieldName] = sanitizePopupFieldValue(items[fieldName]);
        });
        let durationMs = 0;
        const rawDuration = items.lastSessionDurationMs;
        if (typeof rawDuration === "number" && Number.isFinite(rawDuration)) {
            durationMs = Math.max(0, rawDuration);
        }
        const durationMap = normalizePopupDurationMap(items[POPUP_PROJECT_DURATIONS_KEY]);
        if (projectTitle &&
            Object.prototype.hasOwnProperty.call(durationMap, projectTitle)) {
            const mappedDuration = durationMap[projectTitle];
            if (typeof mappedDuration === "number") {
                durationMs = Math.max(0, mappedDuration);
            }
        }
        resolve({ projectTitle, durationMs, fields });
    });
});
const resetStoredDuration = () => new Promise((resolve, reject) => {
    if (typeof chrome === "undefined") {
        resolve();
        return;
    }
    const storageLocal = chrome.storage?.local;
    if (!storageLocal ||
        typeof storageLocal.get !== "function" ||
        typeof storageLocal.set !== "function") {
        resolve();
        return;
    }
    storageLocal.get(["projectTitle", POPUP_PROJECT_DURATIONS_KEY], (items) => {
        if (chrome?.runtime?.lastError) {
            reject(chrome.runtime.lastError);
            return;
        }
        const projectTitle = sanitizePopupFieldValue(items.projectTitle);
        const durationMap = normalizePopupDurationMap(items[POPUP_PROJECT_DURATIONS_KEY]);
        if (projectTitle.length > 0) {
            durationMap[projectTitle] = 0;
        }
        storageLocal.set({
            lastSessionDurationMs: 0,
            [POPUP_PROJECT_DURATIONS_KEY]: durationMap,
        }, () => {
            if (chrome?.runtime?.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve();
        });
    });
});
const buildWorkSummaryPayload = (summary) => {
    if (!summary.projectTitle) {
        return null;
    }
    return {
        "Project Title": summary.projectTitle,
        "Work Time": formatDurationForSheetValue(summary.durationMs),
    };
};
const sendSummaryToSheet = async (payload) => {
    try {
        const response = await fetch(POPUP_GOOGLE_APPS_SCRIPT_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(payload),
            headers: {
                "Content-Type": "application/json",
            },
            keepalive: true,
        });
        const responseText = await response.text().catch(() => "");
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}${responseText.length > 0 ? `: ${responseText}` : ""}`);
        }
        if (responseText.trim().toUpperCase() !== "OK") {
            throw new Error(responseText.length > 0
                ? `Sheet responded with: ${responseText}`
                : "Sheet responded without OK confirmation.");
        }
        console.log("Popup sync success:", responseText || "OK");
        return responseText || "OK";
    }
    catch (error) {
        console.error("Popup sync failed:", error);
        throw error;
    }
};
const updatePreview = (summary) => {
    currentSummary = {
        projectTitle: summary.projectTitle,
        durationMs: summary.durationMs,
        fields: { ...summary.fields },
    };
    if (popupProjectTitleElement) {
        popupProjectTitleElement.textContent = summary.projectTitle ?? "—";
    }
    if (popupWorkTimeElement) {
        popupWorkTimeElement.textContent = formatDurationForSheetValue(summary.durationMs);
    }
    POPUP_DATASET_FIELD_NAMES.forEach((fieldName) => {
        const element = datasetFieldElements[fieldName];
        if (!element) {
            return;
        }
        const fieldValue = summary.fields?.[fieldName] ?? "";
        element.textContent =
            fieldValue && fieldValue.trim().length > 0 ? fieldValue : "—";
    });
};
const handleStorageChange = (changes, areaName) => {
    if (areaName !== "local") {
        return;
    }
    let shouldUpdate = false;
    let nextSummary = {
        projectTitle: currentSummary.projectTitle,
        durationMs: currentSummary.durationMs,
        fields: { ...currentSummary.fields },
    };
    if (Object.prototype.hasOwnProperty.call(changes, "lastSessionDurationMs")) {
        const durationChange = changes.lastSessionDurationMs;
        const rawDuration = durationChange?.newValue;
        if (typeof rawDuration === "number" && Number.isFinite(rawDuration)) {
            nextSummary = {
                ...nextSummary,
                durationMs: Math.max(0, rawDuration),
            };
            shouldUpdate = true;
        }
    }
    if (Object.prototype.hasOwnProperty.call(changes, "projectTitle")) {
        const titleChange = changes.projectTitle;
        const rawTitle = titleChange?.newValue;
        const sanitizedTitle = typeof rawTitle === "string" && rawTitle.trim().length > 0
            ? rawTitle.trim()
            : null;
        nextSummary = {
            ...nextSummary,
            projectTitle: sanitizedTitle,
        };
        shouldUpdate = true;
    }
    const nextFields = { ...nextSummary.fields };
    let fieldsChanged = false;
    POPUP_DATASET_FIELD_NAMES.forEach((fieldName) => {
        if (Object.prototype.hasOwnProperty.call(changes, fieldName)) {
            const fieldChange = changes[fieldName];
            const sanitizedValue = sanitizePopupFieldValue(fieldChange?.newValue);
            nextFields[fieldName] = sanitizedValue;
            fieldsChanged = true;
        }
    });
    if (fieldsChanged) {
        nextSummary = {
            ...nextSummary,
            fields: nextFields,
        };
        shouldUpdate = true;
    }
    if (Object.prototype.hasOwnProperty.call(changes, POPUP_PROJECT_DURATIONS_KEY)) {
        const durationChange = changes[POPUP_PROJECT_DURATIONS_KEY];
        const durationMap = normalizePopupDurationMap(durationChange?.newValue);
        if (nextSummary.projectTitle &&
            Object.prototype.hasOwnProperty.call(durationMap, nextSummary.projectTitle)) {
            const mappedDuration = durationMap[nextSummary.projectTitle];
            if (typeof mappedDuration === "number") {
                nextSummary = {
                    ...nextSummary,
                    durationMs: Math.max(0, mappedDuration),
                };
                shouldUpdate = true;
            }
        }
    }
    if (shouldUpdate) {
        updatePreview(nextSummary);
    }
};
const getStorageOnChanged = () => {
    if (typeof chrome === "undefined") {
        return undefined;
    }
    const storage = chrome.storage;
    if (!storage) {
        return undefined;
    }
    return storage.onChanged ?? undefined;
};
const detachStorageChangeListener = () => {
    if (!hasAttachedStorageChangeListener || typeof chrome === "undefined") {
        return;
    }
    const storageOnChanged = getStorageOnChanged();
    if (!storageOnChanged ||
        typeof storageOnChanged.removeListener !== "function") {
        return;
    }
    storageOnChanged.removeListener(handleStorageChange);
    hasAttachedStorageChangeListener = false;
};
const attachStorageChangeListener = () => {
    if (hasAttachedStorageChangeListener || typeof chrome === "undefined") {
        return;
    }
    const storageOnChanged = getStorageOnChanged();
    if (!storageOnChanged || typeof storageOnChanged.addListener !== "function") {
        return;
    }
    storageOnChanged.addListener(handleStorageChange);
    hasAttachedStorageChangeListener = true;
    window.addEventListener("unload", detachStorageChangeListener, {
        once: true,
    });
};
const handleSubmit = async () => {
    if (popupSubmitButton) {
        popupSubmitButton.disabled = true;
    }
    setPopupStatus("Sending...");
    try {
        const summary = await getStoredSummary();
        updatePreview(summary);
        const payload = buildWorkSummaryPayload(summary);
        if (!payload) {
            setPopupStatus("Project Title is required.", true);
            return;
        }
        const responseText = await sendSummaryToSheet(payload);
        setPopupStatus(responseText && responseText.trim().length > 0
            ? responseText.trim()
            : "Sent to sheet.");
    }
    catch (error) {
        if (error instanceof Error && error.message.length > 0) {
            setPopupStatus(error.message, true);
        }
        else {
            setPopupStatus("Failed to send. See console for details.", true);
        }
    }
    finally {
        if (popupSubmitButton) {
            popupSubmitButton.disabled = false;
        }
    }
};
const handleReset = async () => {
    if (popupResetButton) {
        popupResetButton.disabled = true;
    }
    setPopupStatus("Resetting...");
    try {
        await resetStoredDuration();
        const summary = await getStoredSummary();
        updatePreview(summary);
        setPopupStatus("Timer reset.");
    }
    catch (error) {
        if (error instanceof Error && error.message.length > 0) {
            setPopupStatus(error.message, true);
        }
        else {
            setPopupStatus("Failed to reset. See console for details.", true);
        }
    }
    finally {
        if (popupResetButton) {
            popupResetButton.disabled = false;
        }
    }
};
const initializePopup = async () => {
    clearPopupStatus();
    const summary = await getStoredSummary();
    updatePreview(summary);
    attachStorageChangeListener();
    if (popupSubmitButton) {
        popupSubmitButton.addEventListener("click", () => {
            void handleSubmit();
        });
    }
    if (popupResetButton) {
        popupResetButton.addEventListener("click", () => {
            void handleReset();
        });
    }
};
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        void initializePopup();
    });
}
else {
    void initializePopup();
}
//# sourceMappingURL=popup.js.map