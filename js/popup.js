document
  .getElementById("projectSelect")
  .addEventListener("change", onSelectChange);

document.addEventListener("DOMContentLoaded", () => {
  init();
});

let existingProjects = [];
let selectedProject = {};

async function init() {
  existingProjects = await getStoredProjects();
  await theRest(existingProjects);
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

async function theRest(projects) {
  const formFields = {
    episode: undefined,
    work_time: 0,
    workplace_url: "",
    runtime: undefined,
    rate: undefined,
    hourly_rate: undefined,
    invoice_amount: undefined,
    date_due: undefined,
    date_assigned: undefined,
    contractor: "Pixelogic Media",
    client: undefined,
  };

  const main = document.querySelector("main");

  const projectSelectDropdown = document.getElementById("projectSelect");

  const projectForm = () => {
    const form = document.createElement("form");
    form.id = "projectForm";
    form.className = "projectForm";

    const fields = document.createElement("div");
    fields.id = "defaultFields";
    fields.className = "defaultFields";

    form.appendChild(fields);

    return form;
  };

  main.appendChild(projectForm());

  let currentOptgroup = null;
  let lastTitle = "";

  projects.forEach((project) => {
    if (project.title !== lastTitle) {
      currentOptgroup = document.createElement("optgroup");
      currentOptgroup.label = project.title;
      projectSelectDropdown.appendChild(currentOptgroup);
      lastTitle = project.title;
    }

    const option = document.createElement("option");
    option.value = project.id ?? generateId(project.title, project.episode);
    option.textContent = project.episode;

    currentOptgroup.appendChild(option);
  });

  const defaultFields = document.getElementById("defaultFields");

  for (const key in formFields) {
    const wrapper = document.createElement("div");
    wrapper.className = "inputGroup";

    const label = document.createElement("label");
    label.textContent = formatFieldLabel(key);

    const input = document.createElement("input");
    input.type = "text";
    input.name = key;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    defaultFields.appendChild(wrapper);
  }
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
  const overrides = {
    url: "URL",
  };
  return key
    .split("_")
    .map(
      (word) => overrides[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

function onSelectChange() {
  if (!Array.isArray(existingProjects)) {
    throw new Error("existingProjects is not defined or not an array");
  }

  const select = document.getElementById("projectSelect");
  const projectId = select.value;

  const project = existingProjects.find((project) => project.id === projectId);

  if (project) {
    selectedProject = project;
    const h2 = document.getElementById("h2");
    h2.textContent = selectedProject.title;
  } else {
    selectedProject = null;
  }
}
