"use strict";
const savedUrlElement = document.getElementById("saved-url");
const inputElement = document.getElementById("url-input");
const formElement = document.getElementById("url-form");
const statusElement = document.getElementById("status");
const displaySavedUrl = (value) => {
    if (!savedUrlElement) {
        return;
    }
    if (value && value.trim().length > 0) {
        savedUrlElement.textContent = value;
        return;
    }
    savedUrlElement.textContent = "No URL saved yet.";
};
const reportStatus = (message) => {
    if (!statusElement) {
        return;
    }
    statusElement.textContent = message;
};
const clearStatus = () => {
    if (!statusElement) {
        return;
    }
    statusElement.textContent = "";
};
const loadSavedUrl = () => {
    if (typeof chrome === "undefined" ||
        !chrome.storage?.local ||
        typeof chrome.storage.local.get !== "function") {
        displaySavedUrl(undefined);
        return;
    }
    chrome.storage.local.get({ matchesUrl: "" }, (result) => {
        const storageResult = result;
        if (chrome?.runtime?.lastError) {
            reportStatus(chrome.runtime.lastError.message ?? "An error occurred while loading.");
            displaySavedUrl(undefined);
            return;
        }
        const value = (() => {
            const storedValue = storageResult?.matchesUrl;
            if (typeof storedValue === "string") {
                return storedValue;
            }
            if (Array.isArray(storedValue) && typeof storedValue[0] === "string") {
                return storedValue[0];
            }
            return undefined;
        })();
        displaySavedUrl(value);
        if (inputElement && typeof value === "string") {
            inputElement.value = value;
        }
        clearStatus();
    });
};
const saveUrl = (value) => {
    if (typeof chrome === "undefined" ||
        !chrome.storage?.local ||
        typeof chrome.storage.local.set !== "function") {
        displaySavedUrl(value);
        return;
    }
    chrome.storage.local.set({ matchesUrl: value }, () => {
        if (chrome?.runtime?.lastError) {
            reportStatus(chrome.runtime.lastError.message ?? "An error occurred while saving.");
            return;
        }
        displaySavedUrl(value);
        reportStatus("Saved.");
    });
};
if (formElement instanceof HTMLFormElement) {
    formElement.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!inputElement) {
            return;
        }
        const value = inputElement.value.trim();
        saveUrl(value);
    });
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSavedUrl);
}
else {
    loadSavedUrl();
}
//# sourceMappingURL=options.js.map