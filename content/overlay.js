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

injectOverlay();
