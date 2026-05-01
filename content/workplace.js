const workplaceListener = (msg, sender, sendResponse) => {
  try {
    if (
      msg.source === "background.js" &&
      msg.action === "request-workplace-id"
    ) {
      const allElements = document.querySelectorAll("*");
      const continueText =
        "We detected that you recently had an open session for this assignment.";
      const continueElement = Array.from(allElements).find(
        (el) => el.textContent && el.textContent.includes(continueText),
      );

      if (continueElement) {
        sendResponse({ data: "__CONTINUE_PAGE__" });
        return;
      }

      const idSpan = document.getElementById("header-full-title");
      const id = idSpan?.textContent?.trim() || window.location.href;
      // console.log("ADD A CACHE TO BACKGROUND.JS", id);
      sendResponse({ data: id });

      return true;
    }
  } catch (e) {
    console.error("Cannot retreive workplaceId:", e);
  }
};

async function initWorkplaceListener() {
  const { urls = {} } = await chrome.storage.sync.get("urls");
  const workplace = urls.workplace?.trim();
  if (!workplace || !window.location.href.includes(workplace)) {
    return;
  }
  chrome.runtime.onMessage.addListener(workplaceListener);
}

initWorkplaceListener();
