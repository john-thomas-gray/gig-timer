// import(chrome.runtime.getURL("web-accessible-resources/normalization.js")).then(
//   (m) => console.log(m.formatDisplayRatePpm(6))
// );

// let normalizationModule;

// async function loadNormalizationModule() {
//   if (!normalizationModule) {
//     normalizationModule = await import(
//       chrome.runtime.getURL("web-accessible-resources/normalization.js")
//     );
//   }
//   return normalizationModule;
// }

// async function formatDisplayRatePpm() {
//   const module = await loadNormalizationModule();
//   module.formatDisplayRatePpm(someData);
// }

document.addEventListener("DOMContentLoaded", () => {
  init();
});

// console.log("display", formatDisplayRatePpm(5));
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
    option.value = project.id ?? setId(project.title, project.episode);
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
  const select = document.getElementById("projectSelect");
  const projectId = select.value;

  selectedProject =
    existingProjects.find((project) => project.id === projectId) ?? null;

  const h2 = document.getElementById("h2");
  h2.textContent = selectedProject ? selectedProject.title : "";

  setFormText();
}

// Found in normalization.js
function setId(title, episodeCode) {
  if (!title || !episodeCode) return null;
  const match = /^S(\d+)_E(\d+)$/.exec(episodeCode);
  if (!match) {
    throw new Error(`Invalid episode format: ${episodeCode}`);
  }

  const seasonNum = Number(match[1]);
  const episodeNum = Number(match[2]);

  const paddedEpisode = `E${String(episodeNum).padStart(4, "0")}`;

  return `${title}: Season ${seasonNum}: Episode ${episodeNum}: Episode ${episodeNum} (${paddedEpisode})`;
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

// Should be a util
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
    console.log(value);
    input.value = value ?? "";
  }
}

function formatDisplayOptions(key, value) {
  let formattedValue = "";

  switch (key) {
    case "work_time":
      formattedValue = formatDisplayTime(value);
      break;
    case "runtime":
      formattedValue = formatDisplayTime(value);
      break;
    case "rate":
      formattedValue = formatDisplayRatePpm(value);
      break;
    case "hourly_rate":
      formattedValue = formatDisplayHourlyRate(value);
      console.log("hr", formattedValue);
      break;
    case "invoice_amount":
      formattedValue = formatDisplayInvoiceAmount(value);
      break;
    case "date_due":
      formattedValue = formatDisplayDate(value);
      break;
    case "date_assigned":
      formattedValue = formatDisplayDate(value);
      break;
    default:
      formattedValue = value;
  }
  console.log(key);
  return formattedValue;
}

function formatDisplayTime(seconds) {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function formatDisplayUSD(dollars) {
  if (dollars == null || isNaN(dollars)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(dollars));
}

function formatDisplayDate(dateString) {
  return Date(dateString);
}

function formatDisplayHourlyRate(hourlyRate) {
  const hrRateUSD = formatDisplayUSD(hourlyRate);
  return `${hrRateUSD}/hr`;
}

function formatDisplayInvoiceAmount(amount) {
  return formatDisplayUSD(amount);
}

function formatDisplayRatePpm(rate) {
  let formatted = formatDisplayUSD(rate);
  return `${formatted} ppm`;
}
