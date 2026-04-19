// import(chrome.runtime.getURL("web-accessible-resources/normalization.js")).then(
// );

let normalizationModule;

async function loadNormalizationModule() {
  if (!normalizationModule) {
    normalizationModule = await import(
      chrome.runtime.getURL("web-accessible-resources/normalization.js"),
    );
  }
  return normalizationModule;
}

// async function formatDisplayRatePpm() {
//   const module = await loadNormalizationModule();
//   module.formatDisplayRatePpm(someData);
// }

document.addEventListener("DOMContentLoaded", () => {
  init();
});

let existingProjects = [];
let selectedProject = undefined;
let defaultFields;

async function init() {
  existingProjects = await getStoredProjects();
  await buildUI(existingProjects);
  const exportButton = document.getElementById("exportButton");
  const updateButton = document.getElementById("updateButton");

  document
    .getElementById("projectSelect")
    .addEventListener("change", onSelectChange);

  exportButton.addEventListener("click", () => {
    exportProject();
  });

  updateButton.addEventListener("click", async () => {
    await updateProjectFromForm();
  });
}

async function getStoredProjects() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "get-stored-projects", source: "popup.js" },
      (response) => {
        if (Array.isArray(response)) resolve(response);
        else resolve([]);
      },
    );
  });
}

async function buildUI(projects) {
  defaultFields = document.getElementById("defaultFields");
  if (defaultFields.children.length > 1) return;
  buildProjectOptions(projects);
  buildFormInputs();
}

function buildProjectOptions(projects) {
  const projectSelect = document.getElementById("projectSelect");

  const optgroups = {};

  projects.forEach((project) => {
    const title = project.title || "Untitled";

    if (!optgroups[title]) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = title;
      projectSelect.appendChild(optgroup);
      optgroups[title] = optgroup;
    }

    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.episode || "Unknown";

    optgroups[title].appendChild(option);
  });
}

function buildFormInputs() {
  const defaultFields = document.getElementById("defaultFields");

  const formSchema = {
    episode: "text",
    work_time: "text",
    workplace_url: "text",
    runtime: "text",
    rate: "text",
    hourly_rate: "text",
    invoice_amount: "text",
    date_due: "text",
    date_assigned: "text",
    contractor: "text",
    client: "text",
  };

  for (const key in formSchema) {
    const wrapper = document.createElement("div");
    wrapper.className = "inputGroup";

    const label = document.createElement("label");
    label.textContent = formatFieldLabel(key);

    const input = document.createElement("input");
    input.type = formSchema[key];
    input.name = key;
    input.value = "";

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    defaultFields.appendChild(wrapper);
  }
}

function onSelectChange() {
  console.log("onSelectChange");
  const select = document.getElementById("projectSelect");
  const projectId = select.value;

  selectedProject =
    existingProjects.find((project) => project.id === projectId) ?? undefined;
  const h2 = document.getElementById("h2");
  h2.textContent = selectedProject ? selectedProject.title : "";
  console.log(selectedProject);

  setFormText();
}

//should import from format
function formatFieldLabel(key) {
  const overrides = { url: "URL" };

  return key
    .split("_")
    .map(
      (word) => overrides[word] ?? word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

function formatCurrency(value) {
  const num = Number(value);
  if (isNaN(num)) return value;
  return "$" + num.toFixed(2);
}

function formatHourlyRate(value) {
  const num = Number(value);
  if (isNaN(num)) return value;
  return "$" + num.toFixed(2) + "/hr";
}

function formatRate(value) {
  const num = Number(value);
  if (isNaN(num)) return value;
  return "$" + num.toFixed(2) + "/min";
}

function formatTime(value) {
  const totalSeconds = Number(value);
  if (isNaN(totalSeconds)) return value;

  const days = Math.floor(totalSeconds / 86400)
    .toString()
    .padStart(2, "0");
  const hours = Math.floor((totalSeconds % 86400) / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${days}:${hours}:${minutes}:${seconds}`;
}

function setFormText() {
  if (!defaultFields) return;

  if (!selectedProject) {
    for (const group of defaultFields.children) {
      const input = group.querySelector("input");
      if (input) input.value = "";
    }
    return;
  }
  
  for (const inputGroup of defaultFields.children) {
    const input = inputGroup.querySelector("input");
    if (!input) continue;

    if (!selectedProject) {
      input.value = "";
      continue;
    }
    const key = input.name;
    let value = selectedProject[key];

    if (key === "runtime") value = formatTime(value);
    if (key === "rate") value = formatRate(value);
    if (key === "hourly_rate") value = formatHourlyRate(value);
    if (key === "invoice_amount") value = formatCurrency(value);
    if (key === "work_time") value = formatTime(value);
    console.log(value);
    input.value = value ?? "";
  }
}

function collectFormValues() {
  const values = {};
  if (!defaultFields) return values;

  for (const inputGroup of defaultFields.children) {
    const input = inputGroup.querySelector("input");
    if (!input) continue;
    values[input.name] = input.value;
  }

  return values;
}

async function normalizeFormValues(rawValues) {
  const module = await loadNormalizationModule();
  const normalized = {
    title: rawValues.title?.trim() || undefined,
    contractor: rawValues.contractor?.trim() || undefined,
    client: rawValues.client?.trim() || undefined,
    workplace_url: rawValues.workplace_url?.trim() || undefined,
    episode: module.normalizeEpisodeInput(rawValues.episode),
    date_assigned: module.normalizeDateInput(rawValues.date_assigned),
    date_due: module.normalizeDateInput(rawValues.date_due),
    runtime: module.normalizeDurationInput(rawValues.runtime),
    work_time: module.normalizeDurationInput(rawValues.work_time),
    rate: module.normalizeRatePerMinuteInput(rawValues.rate),
  };

  const manualInvoiceAmount = module.normalizeMoneyInput(rawValues.invoice_amount);
  const manualHourlyRate = module.normalizeHourlyRateInput(rawValues.hourly_rate);
  const calculatedInvoiceAmount = module.calculateInvoiceAmount(
    normalized.rate,
    normalized.runtime,
  );
  const invoiceAmount = calculatedInvoiceAmount ?? manualInvoiceAmount;

  normalized.invoice_amount = invoiceAmount;
  normalized.hourly_rate =
    module.calculateHourlyRate(invoiceAmount, normalized.work_time) ??
    manualHourlyRate;

  return normalized;
}

async function updateProjectFromForm() {
  try {
    const rawValues = collectFormValues();
    const normalizedValues = await normalizeFormValues(rawValues);
    const module = await loadNormalizationModule();

    const projectToSave = {
      ...(selectedProject ?? {}),
      ...normalizedValues,
    };

    projectToSave.id =
      selectedProject?.id ??
      module.buildProjectIdFromTitleAndEpisode(
        projectToSave.title,
        projectToSave.episode,
      );

    if (!projectToSave.id) {
      console.warn(
        "Could not save project. A valid id is required (select project or provide title + S#_E#).",
      );
      return;
    }

    const result = await chrome.storage.sync.get("projects");
    const projects = Array.isArray(result.projects) ? result.projects : [];
    const existingIndex = projects.findIndex(
      (project) => project.id === projectToSave.id,
    );

    if (existingIndex >= 0) {
      projects[existingIndex] = { ...projects[existingIndex], ...projectToSave };
    } else {
      projects.push(projectToSave);
    }

    await chrome.storage.sync.set({ projects });
    existingProjects = projects;
    selectedProject = projectToSave;
    setFormText();
  } catch (error) {
    console.error("Failed to update project from popup form:", error);
  }
}

function exportProject() {
  console.log("sending...", selectedProject);
  if (!selectedProject?.id) {
    console.warn("Project doesn't have an id");
    return;
  }

  chrome.runtime.sendMessage({
    action: "export-project-data",
    projectId: selectedProject.id,
    source: "popup.js",
  });
}
