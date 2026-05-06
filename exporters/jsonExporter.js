export function exportProjectData(projectData) {
  function safeFilename(value) {
    return String(value)
      .trim()
      .replace(/[\/\\?%*:|"<>]/g, "_");
  }

  const jsonExport = JSON.stringify(projectData);
  const episodeLabel =
    projectData.season && projectData.episode
      ? `S${projectData.season}E${projectData.episode}`
      : projectData.episode;
  const filename = `${safeFilename(projectData.title)}_${safeFilename(
    episodeLabel
  )}`;

  const url = "data:application/json;base64," + btoa(jsonExport);

  chrome.downloads.download({
    url,
    filename: filename,
  });
}
