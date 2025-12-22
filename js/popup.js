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
  let formHeading = "New Project";

  const projectTemplate = {
    id: undefined,
    client: undefined,
    contractor: "Pixelogic Media",
    date_assigned: undefined,
    date_due: undefined,
    episode: undefined,
    hourly_rate: undefined,
    invoice_amount: undefined,
    rate: 6,
    runtime: undefined,
    title: undefined,
    work_time: 0,
    workplace_url: "",
  };

  const projectSelectDropdown = document.getElementById("projectSelect");
  const main = document.querySelector("main");

  const projectForm = () => {
    const form = document.createElement("form");
    form.id = "projectForm";
    form.class = "projectForm";

    const h2 = document.createElement("h2");
    h2.textContent = formHeading;

    const fields = document.createElement("div");
    fields.id = "defaultFields";
    fields.class = "defaultFields";

    form.appendChild(h2);
    form.appendChild(fields);

    return form;
  };

  main.appendChild(projectForm());

  projects.forEach((project) => {
    const option = document.createElement("option");
    const title = project.title;
    const idValue = project.id ?? generateId(title, project.episode);
    option.value = idValue;
    option.textContent = title;
    console.log(option.value, option.textContent);
    projectSelectDropdown.appendChild(option);
  });

  const defaultFields = document.getElementById("defaultFields");

  for (const key in projectTemplate) {
    const wrapper = document.createElement("div");
    wrapper.class = "input-group";

    const label = document.createElement("label");
    label.textContent = key;

    const input = document.createElement("input");
    input.type = "text";
    input.name = key;

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    defaultFields.appendChild(wrapper);
  }
}
