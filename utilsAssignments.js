const setAssignmentsInputValue = (value) => {
  if (!assignmentsInputElement) {
    return;
  }
  assignmentsInputElement.value = value;
};

const loadAssignmentsUrl = () => {
  const applyValue = (value) => {
    const sanitized =
      typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : assignmentsPageUrl;
    cachedAssignmentsUrl = sanitized ?? "";
    setAssignmentsInputValue(cachedAssignmentsUrl);
  };
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.local ||
    typeof chrome.storage.local.get !== "function"
  ) {
    applyValue(cachedAssignmentsUrl);
    return;
  }
  chrome.storage.local.get([assignmentsPageUrl], (result) => {
    if (chrome?.runtime?.lastError) {
      applyValue(cachedAssignmentsUrl);
      return;
    }
    const storedValue = sanitizeValue(result?.[assignmentsPageUrl]);
    applyValue(storedValue);
  });
};

const saveAssignmentsUrl = (rawValue) => {
  const trimmedValue = rawValue.trim();
  if (
    typeof chrome === "undefined" ||
    !chrome.storage?.local ||
    typeof chrome.storage.local.set !== "function"
  ) {
    cachedAssignmentsUrl = trimmedValue;
    setAssignmentsInputValue(trimmedValue);
    reportStatus("Assignments page saved.");
    return;
  }
  chrome.storage.local.set({ [assignmentsPageUrl]: trimmedValue }, () => {
    if (chrome?.runtime?.lastError) {
      reportStatus(
        chrome.runtime.lastError.message ??
          "Failed to save assignments page URL."
      );
      return;
    }
    cachedAssignmentsUrl = trimmedValue;
    setAssignmentsInputValue(trimmedValue);
    reportStatus("Assignments page saved.");
  });
};

const getAssignmentsPageUrl = () => {
  let url = undefined;
  const fallbackUrl =
    "https://localization.pixelogicmedia.com/individuals/8587/new_dashboard?english_services=true";

  chrome.storage.local.get("assignmentsPageUrl").then((r) => {
    if (r.assignmentsPageUrl) {
      url = r.assignmentsPageUrl;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.assignmentsPageUrl) {
      url = changes.assignmentsPageUrl.newValue;
    }
  });
  console.log("assignmentsPageUrl", url);
  return url ?? fallbackUrl;
};
