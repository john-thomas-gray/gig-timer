document.addEventListener("DOMContentLoaded", async () => {
  const assignmentsInput = document.getElementById("assignmentsInput");
  const assignmentsDisplay = document.getElementById("displayAssignments");
  const workplaceInput = document.getElementById("workplaceInput");
  const workplaceDisplay = document.getElementById("displayWorkplace");
  const submitUrls = document.getElementById("submitURLs");

  const { urls = {} } = await chrome.storage.sync.get("urls");
  // TODO: Replace with a proper backup url in production
  const devAssignmentsUrl =
    "https://localization.pixelogicmedia.com/individuals/8587/new_dashboard?english_services=true";
  const devWorkplaceUrl =
    "https://localization.pixelogicmedia.com/script_editor/individual/8587/assignments/";

  assignmentsInput.value = urls.assignments ?? devAssignmentsUrl;

  assignmentsDisplay.textContent = assignmentsInput.value;

  workplaceInput.value = urls.workplace ?? devWorkplaceUrl;
  workplaceDisplay.textContent = workplaceInput.value;

  submitUrls.addEventListener("click", async () => {
    const assignments = assignmentsInput?.value;
    const workplace = workplaceInput?.value;

    const data = { assignments, workplace };

    try {
      await chrome.storage.sync.set({ urls: data });
      console.log("Saved URLs:", data);
    } catch (error) {
      console.error("Error saving URLs:", error);
    }
  });

  const sheetsDeploymentId = document.getElementById("sheetsDeploymentId");
  const sheetsSpreadSheetId = document.getElementById("sheetsSpreadSheetId");
  const sheetsSpreadSheetName = document.getElementById("sheetsSpreadSheetName");
  const submitSheets = document.getElementById("submitSheets");

  const { sheetsData = {} } = await chrome.storage.sync.get("sheetsData");
  sheetsDeploymentId.value = sheetsData.deploymentId ?? "";
  sheetsSpreadSheetId.value = sheetsData.spreadSheetId ?? "";
  sheetsSpreadSheetName.value = sheetsData.spreadSheetName ?? "";

  submitSheets.addEventListener("click", async () => {
    const deploymentId = sheetsDeploymentId?.value?.trim() ?? "";
    const spreadSheetId = sheetsSpreadSheetId?.value?.trim() ?? "";
    const spreadSheetName = sheetsSpreadSheetName?.value?.trim() ?? "";
    const next = { deploymentId, spreadSheetId, spreadSheetName };
    try {
      await chrome.storage.sync.set({ sheetsData: next });
      console.log("Saved Google Sheets settings");
    } catch (error) {
      console.error("Error saving Google Sheets settings:", error);
    }
  });

  const projectTemplate = {
    id: undefined,
    client: undefined,
    contractor: "Pixelogic Media",
    dateAssigned: undefined,
    dateDue: undefined,
    episode: undefined,
    hourlyRate: undefined,
    invoice_amount: undefined,
    rate: 6,
    runtime: undefined,
    title: undefined,
    work_time: 0,
  };

  const submitNewProject = document.getElementById("submitNewProject");
  const titleInput = document.getElementById("titleInput");
  const runtimeInput = document.getElementById("runtimeInput");
  const rateInput = document.getElementById("rateInput");
  const contractorInput = document.getElementById("contractorInput");
  const clientInput = document.getElementById("clientInput");
  const workplaceUrlInput = document.getElementById("workplaceUrlInput");
  const dateAssignedInput = document.getElementById("dateAssignedInput");
  if (!dateAssignedInput.value) {
    const today = new Date();
    const yyyy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    dateAssignedInput.value = `${yyyy}-${mm}-${dd}`;
  }

  submitNewProject.addEventListener("click", async () => {
    console.log("submit");
    const { projects = [] } = await chrome.storage.sync.get("projects");
    const workplaceUrl = workplaceUrlInput?.value ?? null;
    const existingProject = projects.find(
      (p) => p.workplaceUrl === workplaceUrl,
    );

    const title = titleInput?.value ?? existingProject?.title ?? null;
    const runtime = runtimeInput?.value
      ? Math.round(+runtimeInput.value)
      : (existingProject?.runtime ?? null);
    const rate = rateInput?.value
      ? +rateInput.value
      : (existingProject?.rate ?? null);
    const contractor =
      contractorInput?.value ?? existingProject?.contractor ?? null;
    const client = clientInput?.value ?? existingProject?.client ?? null;
    const date_assigned =
      dateAssignedInput?.value ?? existingProject?.dateAssigned ?? null;
    const invoice_amount =
      runtime != null && rate != null
        ? runtime * rate
        : (existingProject?.invoice_amount ?? null);
    const work_time = existingProject?.work_time ?? 0;
    const hourlyRate =
      invoice_amount != null && work_time != null
        ? +((invoice_amount / Math.round(+work_time)) * 60).toFixed(2)
        : null;

    const data = {
      title,
      runtime,
      rate,
      contractor,
      client,
      workplace_url: workplaceUrl,
      date_assigned: dateAssigned,
      invoice_amount: invoice_amount,
      work_time: work_time,
      hourly_rate: hourlyRate,
    };

    if (existingProject) {
      Object.assign(existingProject, data);
    } else {
      projects.push(data);
    }

    try {
      await chrome.storage.sync.set({ projects: projects });
    } catch (error) {
      console.error("Error saving project:", error);
    }
  });
});
