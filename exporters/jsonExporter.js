export function exportProjectData(projectData) {
  function safeFilename(value) {
    return String(value)
      .trim()
      .replace(/[\/\\?%*:|"<>]/g, "_");
  }
  console.log(projectData);
  const result = JSON.stringify(projectData);
  const filename = `${safeFilename(projectData.title)}_${safeFilename(
    projectData.episode
  )}`;
  console.log("snapshot:", JSON.parse(JSON.stringify(projectData)));

  const url = "data:application/json;base64," + btoa(result);

  chrome.downloads.download({
    url,
    filename: filename,
  });
}
