document.addEventListener("DOMContentLoaded", () => {
  init();
});

let existingProjects = [];
let selectedProject = null;
let defaultFields;

async function init() {
  existingProjects = await getStoredProjects();
  await buildUI(existingProjects);
  document
    .getElementById("projectSelect")
    .addEventListener("change", onSelectChange);
}

async function getStoredProjects() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "get-stored-projects", source: "popup.js" },
      (response) => {
        if (Array.isArray(response)) resolve(response);
        else resolve([]);
      }
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

  let currentOptgroup = null;
  let lastTitle = "";

  projects.forEach((project) => {
    if (project.title !== lastTitle) {
      currentOptgroup = document.createElement("optgroup");
      currentOptgroup.label = project.title;
      projectSelect.appendChild(currentOptgroup);
      lastTitle = project.title;
    }

    const option = document.createElement("option");
    option.value = project.id ?? generateId(project.title, project.episode);
    option.textContent = project.episode;

    currentOptgroup.appendChild(option);
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
  const select = document.getElementById("projectSelect");
  const projectId = select.value;

  selectedProject =
    existingProjects.find((project) => project.id === projectId) ?? null;

  const h2 = document.getElementById("h2");
  h2.textContent = selectedProject ? selectedProject.title : "";

  setFormText();
}

function generateId(title, episode) {
  const match = episode.match(/S(\d+)_E(\d+)/i);
  if (!match) {
    throw new Error("Episode format is invalid");
  }

  const seasonNum = parseInt(match[1], 10);
  const episodeNum = parseInt(match[2], 10);

  const paddedEpisode = String(episodeNum).padStart(4, "0");

  const id = `${title}: Season ${seasonNum}: Episode ${episodeNum}: Episode ${episodeNum} (E${paddedEpisode})`;

  return id;
}

function formatFieldLabel(key) {
  const overrides = { url: "URL" };

  return key
    .split("_")
    .map(
      (word) => overrides[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function roundTo(num, precision) {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor + Number.EPSILON) / factor;
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

    value = formatDisplayOptions(key, value);

    input.value = value ?? "";
  }
}

function formatDisplayOptions(key, value) {
  let formattedValue = "";
  const rate = selectedProject["rate"];
  const runtime = selectedProject["runtime"];
  const workTime = selectedProject["work_time"];

  switch (key) {
    case "work_time":
      formattedValue = displayFormatTime(value);
      break;
    case "runtime":
      formattedValue = displayFormatTime(value);
      break;
    case "rate":
      formattedValue = selectedProject["rate"];
      break;
    case "hourly_rate":
      formattedValue = displayFormatHourlyRate(value, workTime);
      break;
    case "invoice_amount":
      formattedValue = displayFormatInvoiceAmount(rate, runtime);
      break;
    case "date_due":
      formattedValue = displayFormatDate(value);
      break;
    case "date_assigned":
      formattedValue = displayFormatDate(value);
      break;
    default:
      formattedValue = value;
  }

  return formattedValue;
}

function displayFormatTime(seconds) {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function displayFormatUSD(dollars) {
  if (dollars == null || isNaN(dollars)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(dollars));
}

function displayFormatDate(dateString) {
  return Date(dateString);
}

function displayFormatHourlyRate(invoiceAmount, workTime) {
  const hourlyRate = roundTo(invoiceAmount / Number(workTime) / 3600, 2);
  const hrRateUSD = displayFormatUSD(hourlyRate);
  return `${hourlyRate}/hr`;
}

function displayFormatInvoiceAmount(rate, runtime) {
  const runtimeM = Math.round(Number(selectedProject["runtime"]) / 60);
  const invoiceAmount = Number(rate) * runtimeM;
  return displayFormatUSD(invoiceAmount);
}
