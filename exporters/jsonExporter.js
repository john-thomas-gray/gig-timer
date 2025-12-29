export function exportProjectData(projectId) {
  const projectData = getProjectById(projectId);
  const result = JSON.stringify(projectData);
  const filename = (projectData.id += "project.json");
  console.log(url);

  const url = "data:application/json;base64," + btoa(result);
  chrome.downloads.download({
    url,
    filename: filename,
  });
}
