// import(chrome.runtime.getURL("web-accessible-resources/normalization.js")).then(
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
  submitButton.addEventListener("click", () => {
    submitProject();
  });
});
const submitButton = document.getElementById("submitButton");

document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "submitButton") {
    submitProject();
  }
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
    existingProjects.find((project) => project.id === projectId) ?? null;
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
  console.log("selectedProject".selectedProject);

  for (const inputGroup of defaultFields.children) {
    const input = inputGroup.querySelector("input");
    if (!input) continue;

    if (!selectedProject) {
      input.value = "";
      continue;
    }
    const key = input.name;
    let value = selectedProject[key];

    value = value;
    console.log(value);
    input.value = value ?? "";
  }
}

function submitProject() {
  console.log("sending...", selectedProject);
  if (!selectedProject.id) {
    console.warn("Project doesn't have an id");
    return;
  }

  chrome.runtime.sendMessage({
    action: "submit-project",
    projectId: selectedProject.id,
    source: "popup.js",
  });
}
