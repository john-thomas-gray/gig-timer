"use strict";
const manifest = chrome.runtime.getManifest();
const manifestMatches = manifest.content_scripts.matches ?? []
const OPTIONS_STORAGE_SETS_KEY_CONTENT = "savedOptionSets";

const extractMatchesFromOptionSets = (raw) => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const matches = new Set();
  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const matchValue = entry.matchesUrl;
    if (typeof matchValue === "string" && matchValue.trim().length > 0) {
      matches.add(matchValue.trim());
    }
  });
  return Array.from(matches);
};
const getStoredMatches = () =>
  new Promise((resolve) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage?.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      resolve([]);
      return;
    }
    chrome.storage.local.get(
      [OPTIONS_STORAGE_SETS_KEY_CONTENT, "matchesUrl"],
      (result) => {
        if (chrome?.runtime?.lastError) {
          console.warn(
            "Failed to retrieve stored match pattern.",
            chrome.runtime.lastError
          );
          resolve([]);
          return;
        }
        const fromOptionSets = extractMatchesFromOptionSets(
          result[OPTIONS_STORAGE_SETS_KEY_CONTENT]
        );
        if (fromOptionSets.length > 0) {
          resolve(fromOptionSets);
          return;
        }
        const legacyValue = result.matchesUrl;
        if (typeof legacyValue === "string" && legacyValue.trim().length > 0) {
          resolve([legacyValue.trim()]);
          return;
        }
        if (Array.isArray(legacyValue)) {
          resolve(
            legacyValue
              .filter(
                (value) => typeof value === "string" && value.trim().length > 0
              )
              .map((value) => value.trim())
          );
          return;
        }
        resolve([]);
      }
    );
  });
const currentUrl = window.location.href;
const evaluateMatches = (patterns) => {
  if (patterns.some((pattern) => doesUrlMatchPattern(currentUrl, pattern))) {
    window.workTimer?.startTimer?.();
  }
};
const initialize = async () => {
  const storedMatches = await getStoredMatches();
  if (storedMatches.length > 0) {
    evaluateMatches(storedMatches);
    return;
  }
  evaluateMatches(manifestMatches);
};
void initialize();
//# sourceMappingURL=content.js.map
