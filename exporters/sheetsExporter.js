export async function exportProjectData(projectData, sheetsData) {
  const exportPackage = {
    projectData: projectData,
    spreadSheetId: sheetsData.spreadSheetId,
    spreadSheetName: sheetsData.spreadSheetName,
  };
  try {
    const response = await fetch(
      `https://script.google.com/macros/s/${sheetsData.deploymentId}/exec`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportPackage),
        keepalive: true,
      }
    );
    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}${
          responseText.length > 0 ? `: ${responseText}` : ""
        }`
      );
    }
    if (responseText.trim().toUpperCase() !== "OK") {
      throw new Error(
        responseText.length > 0
          ? `Sheet responded with: ${responseText}`
          : "Sheet responded without OK confirmation."
      );
    }
    console.log("Popup sync success:", responseText || "OK");
    return responseText || "OK";
  } catch (error) {
    console.error("Popup sync failed:", error);
    throw error;
  }
}
