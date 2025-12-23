document.addEventListener("DOMContentLoaded", () => {
  init();
});

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

async function init() {
  const existingProjects = await getStoredProjects();
  console.log(existingProjects);
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

const overrides = {
  url: "URL",
};

function formatFieldLabel(key) {
  return key
    .split("_")
    .map(
      (word) => overrides[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
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

  const projectSelectDropdown = document.getElementById("projectSelect");
  const main = document.querySelector("main");

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

  projects.forEach((project) => {
    const option = document.createElement("option");
    const title = project.title;
    const episode = project.episode;
    const idValue = project.id ?? generateId(title, project.episode);
    option.value = idValue;
    option.textContent = title.concat(" ", episode);
    console.log(option.value, option.textContent);
    projectSelectDropdown.appendChild(option);
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
