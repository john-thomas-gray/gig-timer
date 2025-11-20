"use strict";
const PROJECT_STORAGE_KEY = "savedProjects"; // Move to general area
const ASSIGNMENTS_STORAGE_KEY = "assignmentsPageUrl";
(async () => {
  const { getStoredValues, doesUrlMatch } = await import(
    chrome.runtime.getURL("js/urlUtils.js")
  );
  const { findAssignmentsData } = await import(
    chrome.runtime.getURL("js/assignments.js") // This will not work because it's called too early
  );

  const currentUrl = window.location.href;

  /* Running the functions here is out of scope. This function should do the check
  then ping function to run its function */

  const runWorkspaceFns = async () => {
    const workspaceUrls = await getStoredValues(PROJECT_STORAGE_KEY, "workspaceUrl");

    if (workspaceUrls.length > 0) {
      doesUrlMatch(currentUrl, workspaceUrls, () => window.workTimer.startTimer());
      return;
    }
  }

  const runAssignmentsFns = async () => {
    const result = await chrome.storage.local.get([ASSIGNMENTS_STORAGE_KEY]);
    const assignmentsUrl = result[ASSIGNMENTS_STORAGE_KEY];
    if(assignmentsUrl.length > 0){
      doesUrlMatch(currentUrl, assignmentsUrl, () => findAssignmentsData())
    }
    return assignmentsUrl;
  };

  runWorkspaceFns();
  runAssignmentsFns();

})();
