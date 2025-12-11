document.addEventListener("DOMContentLoaded", async () => {
  const assignmentsInput = document.getElementById("assignmentsInput");
  const assignmentsDisplay = document.getElementById("displayAssignments");
  const workplaceInput = document.getElementById("workplaceInput");
  const workplaceDisplay = document.getElementById("displayWorkplace");
  const submitUrls = document.getElementById("submitURLs");

  const { urls = {} } = await chrome.storage.sync.get("urls");

  if (urls?.assignments) {
    assignmentsInput.value = urls.assignments;
    assignmentsDisplay.textContent = urls.assignments;
  } else {
    console.log("No assignments url found in storage");
  }

  if (urls?.workplace) {
    workplaceInput.value = urls.workplace;
    workplaceDisplay.textContent = urls.workplace;
  } else {
    console.log("No workplace url found in storage");
  }

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

  const submitNewProject = document.getElementById('submitNewProject');
  const titleInput = document.getElementById("titleInput");
  const runtimeInput = document.getElementById("runtimeInput");
  const rateInput = document.getElementById("rateInput");
  const contractorInput = document.getElementById("contractorInput");
  const clientInput = document.getElementById("clientInput");
  const workplaceUrlInput = document.getElementById("workplaceUrlInput");
  const dateBookedInput = document.getElementById("dateBookedInput");
  if (!dateBookedInput.value) {
    const today = new Date();
    const year = String(today.getFullYear);
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    dateBookedInput.value = `${year}-${mm}-${dd}`;
  }

  submitNewProject.addEventListener("click", async () => {
    console.log("submit")
    const { projects = [] } = await chrome.storage.sync.get("projects");
    const workplaceUrl =
      workplaceUrlInput?.value ?? null;
    const existingProject = projects.find(
      (p) => p.workplaceUrl === workplaceUrl
    );

    const title = titleInput?.value ?? existingProject?.title ?? null;
    const runtime = runtimeInput?.value
      ? Math.round(+runtimeInput.value)
      : existingProject?.runtime ?? null;
    const rate = rateInput?.value ? +rateInput.value : existingProject?.rate ?? null;
    const contractor = contractorInput?.value ?? existingProject?.contractor ?? null;
    const client = clientInput?.value ?? existingProject?.client ?? null;
    const dateBooked = dateBookedInput?.value ?? existingProject?.dateBooked ?? null;
    const invoiceAmount =
      runtime != null && rate != null
        ? runtime * rate
        : existingProject?.invoiceAmount ?? null;
    const workTime = existingProject?.workTime ?? 0;
    const hourlyRate =
      invoiceAmount != null && workTime != null
        ? +((invoiceAmount / Math.round(+workTime)) * 60).toFixed(2)
        : null;


    const data = {title, runtime, rate, contractor, client, workplaceUrl, dateBooked, invoiceAmount, workTime, hourlyRate}

    if (existingProject) {
      Object.assign(existingProject, data);
    } else {
      projects.push(data);
    }

    try {
      await chrome.storage.sync.set({projects: projects})
    } catch (error) {
      console.error("Error saving project:", error);
    }


  });
});
