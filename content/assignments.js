(() => {
if (globalThis.__gigTimerAssignmentsScriptLoaded) return;
globalThis.__gigTimerAssignmentsScriptLoaded = true;

const pending = new Map();
let pixelogicModulePromise;
const LOG_PREFIX = "[Gig Timer]";

function loadPixelogicModule() {
  pixelogicModulePromise ??= import(chrome.runtime.getURL("utils/pixelogic.js"));
  return pixelogicModulePromise;
}

const assignmentsContextReady = loadAssignmentsContext();
chrome.runtime.onMessage.addListener(assignmentsListener);
window.addEventListener("message", handleBridgeMessage);
assignmentsContextReady
  .then(({ isAssignmentsPage }) => {
    if (!isAssignmentsPage) return;

    console.log(`${LOG_PREFIX} Assignments content script active`, {
      url: window.location.href,
    });
  })
  .catch((error) => {
    console.error(`${LOG_PREFIX} Assignments content script setup failed`, error);
  });

async function loadAssignmentsContext() {
  const pixelogic = await loadPixelogicModule();
  const { urls = {} } = await chrome.storage.local.get("urls");
  const assignments = urls.assignments?.trim();
  const isAssignmentsPage = pixelogic.isAssignmentsUrl(
    window.location.href,
    assignments,
  );

  return { isAssignmentsPage, pixelogic };
}

function assignmentsListener(msg, sender, sendResponse) {
  if (msg.action !== "request-assignments-data") return;

  (async () => {
    const { isAssignmentsPage, pixelogic } = await assignmentsContextReady;
    if (!isAssignmentsPage) {
      sendResponse(undefined);
      return;
    }
    console.log(`${LOG_PREFIX} Assignments data requested`, {
      url: window.location.href,
    });

    if (pixelogic.isPixelogicCompositionEditorUrl(window.location.href)) {
      try {
        const projects = pixelogic.scrapePixelogicCompositionAssignmentsDocument(
          document,
          window.location.href,
        );
        console.log(`${LOG_PREFIX} Pixelogic assignments scraped`, {
          count: projects.length,
          projectIds: projects
            .map((project) => project.project_id)
            .filter(Boolean),
          taskIds: projects.map((project) => project.task_id).filter(Boolean),
        });
        sendResponse({
          type: "RETURN_PIXELLOGIC_ASSIGNMENTS_DATA",
          payload: { projects },
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} Pixelogic assignment scrape failed`, error);
        sendResponse({
          type: "PIXELLOGIC_ASSIGNMENTS_DATA_ERROR",
          payload: { reason: error.message },
        });
      }
      return;
    }

    const id = crypto.randomUUID();

    pending.set(id, sendResponse);
    console.log(`${LOG_PREFIX} Requesting legacy assignment bridge data`, { id });

    window.postMessage(
      { source: "assignments.js", type: "REQUEST_W2UI_DATA", id },
      "*",
    );
  })().catch((error) => {
    console.error(`${LOG_PREFIX} Assignment data request failed`, error);
    sendResponse({
      type: "PIXELLOGIC_ASSIGNMENTS_DATA_ERROR",
      payload: { reason: error.message },
    });
  });

  return true;
}

function handleBridgeMessage(event) {
  if (event.data?.source !== "bridge.js") return;

  const { id, type, payload } = event.data;
  if (!id) {
    console.warn("Bridge response missing id:", event.data);
    return;
  }

  const sendResponse = pending.get(id);
  if (!sendResponse) {
    console.warn("No pending request for id:", id);
    return;
  }

  sendResponse({ type, payload });
  console.log(`${LOG_PREFIX} Legacy assignment bridge response received`, {
    id,
    type,
  });
  pending.delete(id);
}
})();
