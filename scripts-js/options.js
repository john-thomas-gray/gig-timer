"use strict";
const savedUrlElement = document.getElementById("saved-url");
const inputElement = document.getElementById("url-input");
const formElement = document.getElementById("url-form");
const statusElement = document.getElementById("status");
const getCurrentMonthYear = () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = String(now.getFullYear()).slice(-2);
    return `${month}/${year}`;
};
const additionalFieldConfigs = [
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
const additionalInputs = {};
const getDefaultValueForConfig = (config) => {
    if (typeof config.getDefaultValue === "function") {
        return config.getDefaultValue();
    }
    return config.defaultValue ?? "";
};
const createDefaultStoredOptions = () => ({
    matchesUrl: "",
    projectTitle: "",
    client: "",
    studio: "",
    genre: "",
    subtitles: "No",
    runtime: "",
    rate: "",
    dateBooked: getCurrentMonthYear(),
});
const normalizeStoredOption = (storageResult, key, fallback) => {
    const rawValue = storageResult?.[key];
    if (typeof rawValue === "string") {
        return rawValue;
    }
    if (Array.isArray(rawValue)) {
        const firstString = rawValue.find((value) => typeof value === "string");
        if (firstString) {
            return firstString;
        }
    }
    return fallback;
};
const displaySavedUrl = (storedValues) => {
    if (!savedUrlElement) {
        return;
    }
    const container = savedUrlElement;
    container.replaceChildren();
    const entries = [];
    const matchesUrl = storedValues.matchesUrl;
    if (typeof matchesUrl === "string" && matchesUrl.trim().length > 0) {
        entries.push(["Matches URL", matchesUrl]);
    }
    additionalFieldConfigs.forEach((config) => {
        const value = storedValues[config.name];
        if (typeof value === "string" && value.trim().length > 0) {
            entries.push([config.label, value]);
        }
    });
    if (entries.length === 0) {
        container.textContent = "No data saved yet.";
        return;
    }
    entries.forEach(([label, value]) => {
        const line = document.createElement("div");
        line.textContent = `${label}: ${value}`;
        container.appendChild(line);
    });
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
const fillFormFields = (storedValues) => {
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
const loadSavedOptions = () => {
    const defaultOptions = createDefaultStoredOptions();
    if (typeof chrome === "undefined" ||
        !chrome.storage?.local ||
        typeof chrome.storage.local.get !== "function") {
        displaySavedUrl(defaultOptions);
        fillFormFields(defaultOptions);
        return;
    }
    chrome.storage.local.get(defaultOptions, (result) => {
        const storageResult = result;
        if (chrome?.runtime?.lastError) {
            reportStatus(chrome.runtime.lastError.message ?? "An error occurred while loading.");
            displaySavedUrl(defaultOptions);
            fillFormFields(defaultOptions);
            return;
        }
        const storedValues = {
            matchesUrl: normalizeStoredOption(storageResult, "matchesUrl", defaultOptions.matchesUrl),
            projectTitle: normalizeStoredOption(storageResult, "projectTitle", defaultOptions.projectTitle),
            client: normalizeStoredOption(storageResult, "client", defaultOptions.client),
            studio: normalizeStoredOption(storageResult, "studio", defaultOptions.studio),
            genre: normalizeStoredOption(storageResult, "genre", defaultOptions.genre),
            subtitles: normalizeStoredOption(storageResult, "subtitles", defaultOptions.subtitles),
            runtime: normalizeStoredOption(storageResult, "runtime", defaultOptions.runtime),
            rate: normalizeStoredOption(storageResult, "rate", defaultOptions.rate),
            dateBooked: normalizeStoredOption(storageResult, "dateBooked", defaultOptions.dateBooked),
        };
        fillFormFields(storedValues);
        displaySavedUrl(storedValues);
        clearStatus();
    });
};
const collectFormValues = () => {
    const defaults = createDefaultStoredOptions();
    const matchesUrl = inputElement?.value.trim() ?? "";
    const collected = {
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
const saveOptions = (values) => {
    if (typeof chrome === "undefined" ||
        !chrome.storage?.local ||
        typeof chrome.storage.local.set !== "function") {
        displaySavedUrl(values);
        reportStatus("Saved.");
        return;
    }
    chrome.storage.local.set(values, () => {
        if (chrome?.runtime?.lastError) {
            reportStatus(chrome.runtime.lastError.message ?? "An error occurred while saving.");
            return;
        }
        displaySavedUrl(values);
        reportStatus("Saved.");
    });
};
if (formElement instanceof HTMLFormElement) {
    if (inputElement) {
        inputElement.required = true;
    }
    const submitButton = formElement.querySelector('button[type="submit"]');
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
        }
        else {
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
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadSavedOptions);
}
else {
    loadSavedOptions();
}
//# sourceMappingURL=options.js.map