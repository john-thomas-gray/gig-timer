export function exportProjectData(projectData) {
  function safeFilename(value) {
    return String(value)
      .trim()
      .replace(/[\/\\?%*:|"<>]/g, "_");
  }

  const jsonExport = JSON.stringify(projectData);
  const filename = `${safeFilename(projectData.title)}_${safeFilename(
    projectData.episode
  )}`;

  const url = "data:application/json;base64," + btoa(jsonExport);

  chrome.downloads.download({
    url,
    filename: filename,
  });
}
