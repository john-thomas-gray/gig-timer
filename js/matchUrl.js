"use strict";
const manifest = chrome.runtime.getManifest();
const manifestMatches = manifest.content_scripts.matches ?? []

const currentUrl = window.location.href;
const evaluateMatches = (workspaceUrls) => {
  if (workspaceUrls.some((workspaceUrl) => doesUrlMatchPattern(currentUrl, workspaceUrl))) {
    window.workTimer?.startTimer?.();
  }
};
const initialize = async () => {
  const workspaceUrls = await getStoredWorkspaceUrls();
  if (workspaceUrls.length > 0) {
    evaluateMatches(workspaceUrls);
    console.log("Stored workspace urls retrieved successfully.")
    return;
  }
  evaluateMatches(manifestMatches);
};
void initialize();
