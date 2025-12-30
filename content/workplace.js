const workplaceListener = (msg, sender, sendResponse) => {
  try {
    if (
      msg.source === "service-worker.js" &&
      msg.action === "request-workplace-id"
    ) {
      console.log("working");
      const allElements = document.querySelectorAll("*");
      const continueText =
        "We detected that you recently had an open session for this assignment.";
      const continueElement = Array.from(allElements).find(
        (el) => el.textContent && el.textContent.includes(continueText)
      );

      if (continueElement) {
        sendResponse({ data: "__CONTINUE_PAGE__" });
        return;
      }

      const idSpan = document.getElementById("header-full-title");
      const id = idSpan.textContent.trim();
      console.log("span", id);
      sendResponse({ data: id });

      return true;
    }
  } catch (e) {
    console.error("Cannot retreive workplaceId:", e);
  }
};
chrome.runtime.onMessage.addListener(workplaceListener);
