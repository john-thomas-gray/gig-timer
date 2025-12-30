export async function exportProjectData(projectData, sheetsData) {
  const exportPackage = {
    projectData: projectData,
    spreadSheetId: sheetsData.spreadSheetId,
    spreadSheetName: sheetsData.spreadSheetName,
  };

  const jsonExport = JSON.stringify(exportPackage);
  const res = await fetch(
    `https://script.google.com/macros/s/AKfycbwNE3AI4vRI_bZ8BKn0OybBszWZThodNqYNtrfqp69aXR4SWA3CMqindTnWACWHMaZX/exec`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonExport,
    }
  );

  console.log("sent", jsonExport, sheetsData.deploymentId, res.status);
}
