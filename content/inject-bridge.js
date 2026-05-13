(() => {
let pixelogicModulePromise;

function loadPixelogicModule() {
  pixelogicModulePromise ??= import(chrome.runtime.getURL("utils/pixelogic.js"));
  return pixelogicModulePromise;
}

function injectBridge() {
  if (!window.__workTimerBridgeInitialized) {
    window.__workTimerBridgeInitialized = true;

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("web-accessible-resources/bridge.js");
    script.onload = () => {};
    document.documentElement.appendChild(script);
    console.log("bridge injected");
  }
}

async function initBridgeInjection() {
  const pixelogic = await loadPixelogicModule();
  const { urls = {} } = await chrome.storage.sync.get("urls");
  const assignments = urls.assignments?.trim();
  const currentUrl = window.location.href;
  const shouldRun = pixelogic.shouldInjectLegacyAssignmentsBridge(
    currentUrl,
    assignments,
  );

  if (!shouldRun) return;
  injectBridge();
}

initBridgeInjection();
})();
