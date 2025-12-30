export function exportProjectData(projectData, sheetsData) {
  const exportPackage = {
    projectData: projectData,
    spreadSheetId: sheetsData.spreadSheetId,
    spreadSheetName: sheetsData.spreadSheetName,
  };

  const jsonExport = JSON.stringify(exportPackage);
  console.log(sheetsData.deploymentId);
  fetch(`https://script.google.com/macros/s/${sheetsData.deploymentId}/exec`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: jsonExport,
  });

  console.log("sent", jsonExport, sheets.deploymentId);
}
