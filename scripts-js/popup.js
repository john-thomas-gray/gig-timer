"use strict";
const POPUP_GOOGLE_APPS_SCRIPT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwKRKegGwQLUNs0ANSTfz7_L-944XcWJgtJxIUTUSnLV9liUD1AXxGPVmdHCVWqNs2A/exec";
const popupStatusElement = document.getElementById("status");
const popupSubmitButton = document.getElementById("submit-button");
const popupResetButton = document.getElementById("reset-button");
const popupProjectTitleElement = document.getElementById("project-title");
const popupWorkTimeElement = document.getElementById("work-time");
let currentSummary = { projectTitle: null, durationMs: 0 };
let hasAttachedStorageChangeListener = false;
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
    if (typeof chrome === "undefined" ||
        !chrome.storage?.local ||
        typeof chrome.storage.local.get !== "function") {
        resolve({ projectTitle: null, durationMs: 0 });
        return;
    }
    chrome.storage.local.get(["projectTitle", "lastSessionDurationMs"], (items) => {
        if (chrome?.runtime?.lastError) {
            console.warn("Failed to retrieve stored values for popup summary.", chrome.runtime.lastError);
            resolve({ projectTitle: null, durationMs: 0 });
            return;
        }
        const rawTitle = items.projectTitle;
        const rawDuration = items.lastSessionDurationMs;
        const projectTitle = typeof rawTitle === "string" && rawTitle.trim().length > 0
            ? rawTitle.trim()
            : null;
        const durationMs = typeof rawDuration === "number" && Number.isFinite(rawDuration)
            ? Math.max(0, rawDuration)
            : 0;
        resolve({ projectTitle, durationMs });
    });
});
const resetStoredDuration = () => new Promise((resolve, reject) => {
    if (typeof chrome === "undefined" ||
        !chrome.storage?.local ||
        typeof chrome.storage.local.set !== "function") {
        resolve();
        return;
    }
    chrome.storage.local.set({ lastSessionDurationMs: 0 }, () => {
        if (chrome?.runtime?.lastError) {
            reject(chrome.runtime.lastError);
            return;
        }
        resolve();
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
    };
    if (popupProjectTitleElement) {
        popupProjectTitleElement.textContent = summary.projectTitle ?? "—";
    }
    if (popupWorkTimeElement) {
        popupWorkTimeElement.textContent = formatDurationForSheetValue(summary.durationMs);
    }
};
const handleStorageChange = (changes, areaName) => {
    if (areaName !== "local") {
        return;
    }
    let shouldUpdate = false;
    let nextSummary = Object.assign({}, currentSummary);
    if (Object.prototype.hasOwnProperty.call(changes, "lastSessionDurationMs")) {
        const durationChange = changes.lastSessionDurationMs;
        const rawDuration = durationChange?.newValue;
        if (typeof rawDuration === "number" && Number.isFinite(rawDuration)) {
            nextSummary = Object.assign(Object.assign({}, nextSummary), { durationMs: Math.max(0, rawDuration) });
            shouldUpdate = true;
        }
    }
    if (Object.prototype.hasOwnProperty.call(changes, "projectTitle")) {
        const titleChange = changes.projectTitle;
        const rawTitle = titleChange?.newValue;
        const sanitizedTitle = typeof rawTitle === "string" && rawTitle.trim().length > 0
            ? rawTitle.trim()
            : null;
        nextSummary = Object.assign(Object.assign({}, nextSummary), { projectTitle: sanitizedTitle });
        shouldUpdate = true;
    }
    if (shouldUpdate) {
        updatePreview(nextSummary);
    }
};
const detachStorageChangeListener = () => {
    if (!hasAttachedStorageChangeListener ||
        typeof chrome === "undefined" ||
        !chrome.storage?.onChanged ||
        typeof chrome.storage.onChanged.removeListener !== "function") {
        return;
    }
    chrome.storage.onChanged.removeListener(handleStorageChange);
    hasAttachedStorageChangeListener = false;
};
const attachStorageChangeListener = () => {
    if (hasAttachedStorageChangeListener ||
        typeof chrome === "undefined" ||
        !chrome.storage?.onChanged ||
        typeof chrome.storage.onChanged.addListener !== "function") {
        return;
    }
    chrome.storage.onChanged.addListener(handleStorageChange);
    hasAttachedStorageChangeListener = true;
    window.addEventListener("unload", detachStorageChangeListener, { once: true });
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
