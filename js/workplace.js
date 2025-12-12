function handleMessages(message, sender, sendResponse) {
  if (message.action !== "request-workplace-id") return;
  console.log("message received");
  const idSpan = document.getElementsByClassName("mse-project-title");
  sendResponse({ id: idSpan });
  return true;
}

chrome.runtime.onMessage.addListener(handleMessages);
