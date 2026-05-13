(() => {
let pixelogicModulePromise;

function loadPixelogicModule() {
  pixelogicModulePromise ??= import(chrome.runtime.getURL("utils/pixelogic.js"));
  return pixelogicModulePromise;
}

function injectOverlay() {
  if (!window.__overlayInitialized) {
    window.__overlayInitialized = true;

    const overlay = document.createElement("div");
    overlay.id = "my-extension-overlay";
    // Opacity
    document.documentElement.appendChild(overlay);
    console.log("overlay inserted");
  }
}

async function initOverlayInjection() {
  const pixelogic = await loadPixelogicModule();
  const { urls = {} } = await chrome.storage.sync.get("urls");
  const assignments = urls.assignments?.trim();
  const workplace = urls.workplace?.trim();
  const currentUrl = window.location.href;
  const shouldRun =
    pixelogic.isAssignmentsUrl(currentUrl, assignments) ||
    pixelogic.isWorkplaceUrl(currentUrl, workplace);

  if (!shouldRun) return;
  injectOverlay();
}

initOverlayInjection();
})();
