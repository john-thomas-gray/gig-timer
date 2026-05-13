import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import {
  collectPixelogicDocumentText,
  getPipelineUrlDefaults,
  isAssignmentsUrl,
  isProjectMetadataPageUrl,
  isTimerPageUrl,
  isWorkplaceUrl,
  parsePixelogicCompositionAssignmentsText,
  parsePixelogicOperationsManagerTaskText,
  scrapePixelogicTimerDocument,
  shouldInjectLegacyAssignmentsBridge,
} from "../utils/pixelogic.js";
import { normalizeProjectData } from "../web-accessible-resources/normalization.js";

const compositionUrl =
  "https://phelix.pixelogicmedia.com/composition-editor/projects/105667?taskId=13500851&grid1=spottingCreation";

const operationsManagerUrl =
  "https://phelix.pixelogicmedia.com/operations-manager/tasks/13500851";

const repoRoot = new URL("..", import.meta.url);

test("default Pixelogic URLs match the new composition-editor and task routes", () => {
  assert.equal(
    getPipelineUrlDefaults().assignments,
    "https://phelix.pixelogicmedia.com/composition-editor",
  );
  assert.equal(
    getPipelineUrlDefaults().workplace,
    "https://phelix.pixelogicmedia.com/operations-manager/tasks",
  );
  assert.equal(isAssignmentsUrl(compositionUrl), true);
  assert.equal(isWorkplaceUrl(operationsManagerUrl), true);
  assert.equal(
    isAssignmentsUrl("https://phelix.pixelogicmedia.com/operations-manager/tasks/13500851"),
    false,
  );
});

test("legacy bridge injection is skipped for new Pixelogic routes", () => {
  assert.equal(shouldInjectLegacyAssignmentsBridge(compositionUrl), false);
  assert.equal(shouldInjectLegacyAssignmentsBridge(operationsManagerUrl), false);
  assert.equal(
    shouldInjectLegacyAssignmentsBridge(
      "https://phelix.pixelogicmedia.com/legacy-assignments",
      "https://phelix.pixelogicmedia.com/legacy-assignments",
    ),
    true,
  );
});

test("composition-editor project URLs are recognized as timer pages", () => {
  assert.equal(isTimerPageUrl(compositionUrl), true);
  assert.equal(isTimerPageUrl(operationsManagerUrl), false);
  assert.equal(
    isTimerPageUrl("https://phelix.pixelogicmedia.com/composition-editor"),
    false,
  );
});

test("operations-manager task URLs are metadata pages but not timer display pages", () => {
  assert.equal(isProjectMetadataPageUrl(compositionUrl), true);
  assert.equal(isProjectMetadataPageUrl(operationsManagerUrl), true);
  assert.equal(
    isProjectMetadataPageUrl("https://phelix.pixelogicmedia.com/composition-editor"),
    false,
  );
});

test("timer page scraping returns composition-editor project metadata", () => {
  const doc = {
    body: {
      innerText: `
Composition Editor
Welcome to Wrexham_Season 5_E0054_Episode 5_Broadcast_Original
[ OM-9508691 / 10810824 ]
00:00:00:00
00:40:26:15
23.976
Audio Description English (US)
`,
    },
    querySelectorAll: () => [],
  };

  const project = scrapePixelogicTimerDocument(doc, compositionUrl);
  const normalized = normalizeProjectData(project);

  assert.equal(project.task_id, "13500851");
  assert.equal(project.project_id, "105667");
  assert.equal(project.title, "Welcome to Wrexham");
  assert.equal(project.season, "5");
  assert.equal(project.episode, "54");
  assert.equal(normalized.id, "Welcome to Wrexham: Season 5: Episode 54");
});

test("composition-editor document scraping uses accessible video duration", () => {
  const doc = {
    body: {
      innerText: `
Composition Editor
Welcome to Wrexham_Season 5_E0054_Episode 5_Broadcast_Original
[ OM-9508691 / 10810824 ]
23.976
Audio Description English (US)
`,
    },
    querySelectorAll: (selector) =>
      selector === "video, audio" ? [{ duration: 2426.7 }] : [],
  };

  const project = scrapePixelogicTimerDocument(doc, compositionUrl);

  assert.equal(project.runtime, 2427);
});

test("programmatically injected content scripts do not use static imports", () => {
  const contentScriptFiles = [
    "content/assignments.js",
    "content/inject-bridge.js",
    "content/overlay.js",
    "content/stopwatch.js",
    "content/workplace.js",
  ];

  for (const file of contentScriptFiles) {
    const source = fs.readFileSync(new URL(file, repoRoot), "utf8");
    assert.equal(
      /^\s*import\s/m.test(source),
      false,
      `${file} must avoid static imports so chrome.scripting.executeScript can inject it`,
    );
  }

  const manifest = JSON.parse(
    fs.readFileSync(new URL("manifest.json", repoRoot), "utf8"),
  );
  const webAccessibleResources = manifest.web_accessible_resources.flatMap(
    (entry) => entry.resources,
  );
  assert.ok(webAccessibleResources.includes("utils/pixelogic.js"));
});

test("manifest content scripts can share one isolated world", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("manifest.json", repoRoot), "utf8"),
  );
  const contentScriptFiles = manifest.content_scripts.flatMap(
    (entry) => entry.js,
  );
  const combinedSource = contentScriptFiles
    .map((file) => fs.readFileSync(new URL(file, repoRoot), "utf8"))
    .join("\n;\n");

  assert.doesNotThrow(
    () => new vm.Script(combinedSource),
    "content scripts must not use duplicate top-level lexical declarations",
  );
});

test("timer content scripts register on composition-editor project pages", () => {
  const stopwatchSource = fs.readFileSync(
    new URL("content/stopwatch.js", repoRoot),
    "utf8",
  );
  const workplaceSource = fs.readFileSync(
    new URL("content/workplace.js", repoRoot),
    "utf8",
  );

  assert.match(stopwatchSource, /isTimerPageUrl/);
  assert.match(workplaceSource, /isProjectMetadataPageUrl/);
});

test("composition-editor parsing falls back to URL project metadata", () => {
  const projects = parsePixelogicCompositionAssignmentsText(
    "Composition Editor\nLoading",
    compositionUrl,
  );

  assert.equal(projects.length, 1);
  assert.equal(projects[0].task_id, "13500851");
  assert.equal(projects[0].project_id, "105667");
  assert.equal(projects[0].assignment_url, compositionUrl);
  assert.equal(projects[0].workplace_url, operationsManagerUrl);
});

test("composition-editor assignments data is scraped into project metadata", () => {
  const text = `
Composition Editor
Video Track Sync Event Bulk Actions Report Settings Import Export Asset Help
Welcome to Wrexham_Season 5_E0054_Episode 5_Broadcast_Original
[ OM-9508691 / 10810824 ]
00:00:00:00
00:40:26:15
23.976
x1.0
Timeline
Video
audio1
Audio Description English (US)
Audio Description English (US) [ OM-9508697 ] - 0
`;

  const projects = parsePixelogicCompositionAssignmentsText(
    text,
    compositionUrl,
  );

  assert.equal(projects.length, 1);
  assert.deepEqual(projects[0], {
    assignment_url: compositionUrl,
    asset_id: "OM-9508691",
    asset_version_id: "10810824",
    contractor: "Pixelogic Media",
    episode: "54",
    frame_rate: "23.976",
    language: "English (US)",
    project_id: "105667",
    rate: 6,
    runtime: 2427,
    season: "5",
    task_id: "13500851",
    title: "Welcome to Wrexham",
    workplace_url: operationsManagerUrl,
  });

  const normalized = normalizeProjectData(projects[0]);
  assert.equal(normalized.id, "Welcome to Wrexham: Season 5: Episode 54");
  assert.equal(normalized.invoice_amount, 240);
});

test("operations-manager task data is scraped into workplace metadata", () => {
  const text = `
Tasks/Task View
AD Template Origination -- Create AD Script from Scratch -- Edited Template Script (AD) -- English (US)Welcome to Wrexham: Season 5: Episode 5: Episode 5 (E0054)
Broadcast_Original
VIP
English AD Origination
Task 2/7
#13500851
Task Type:
Dubbing / Audio Description / Scripting / Writing
Task Configuration(s):
AD Script
Status:
In Progress
Task Language
English (US)
Due Date:
2026-05-16 01:44
Start Date:
2026-05-12 16:24
Project Managers:
Christopher Pitchford
Task Instructions

DISNEY - MASTERING US - AUDIO - AUDIO DESCRIPTION -- AD SCRIPT WRITING -- CE6

Additional Details:
Localization Library
Metadata Portal
Open Ce Creation Assignment
Input Requirements:
Welcome to Wrexham: Season 5: Episode 5: Episode 5 (E0054)
: Broadcast_Original
[OM-9508691 / 10876414]
P2P | [Version 2]
`;

  const project = parsePixelogicOperationsManagerTaskText(
    text,
    operationsManagerUrl,
  );

  assert.deepEqual(project, {
    asset_id: "OM-9508691",
    asset_version_id: "10876414",
    client: "Disney",
    contractor: "Pixelogic Media",
    date_assigned: "2026-05-12 16:24",
    date_due: "2026-05-16 01:44",
    episode: "5",
    language: "English (US)",
    rate: 6,
    season: "5",
    task_id: "13500851",
    task_type: "Dubbing / Audio Description / Scripting / Writing",
    title: "Welcome to Wrexham",
    workplace_url: operationsManagerUrl,
  });

  const normalized = normalizeProjectData(project);
  assert.equal(normalized.id, "Welcome to Wrexham: Season 5: Episode 5");
  assert.equal(normalized.date_due, "2026-05-16");
  assert.equal(normalized.date_assigned, "2026-05-12");
});

test("document text collection pairs Pixelogic input values with nearby labels", () => {
  const label = { textContent: "Start Date:", previousElementSibling: null };
  const control = {
    parentElement: null,
    previousElementSibling: label,
    textContent: "",
  };
  const input = {
    closest: () => null,
    getAttribute: () => undefined,
    parentElement: control,
    previousElementSibling: null,
    textContent: "",
    value: "2026-05-12 16:24",
  };
  const doc = {
    body: {
      innerText: `Start Date:
Task Workability Date:
2026-05-11 15:26`,
    },
    querySelectorAll: () => [input],
  };

  const text = collectPixelogicDocumentText(doc);
  const project = parsePixelogicOperationsManagerTaskText(
    text,
    operationsManagerUrl,
  );

  assert.equal(project.date_assigned, "2026-05-12 16:24");
});

test("nearby task date labels win over broad form container labels", () => {
  const broadFormLabel = { textContent: "Task Type:", previousElementSibling: null };
  const form = {
    querySelector: () => broadFormLabel,
  };
  const label = { textContent: "Start Date:", previousElementSibling: null };
  const control = {
    parentElement: form,
    previousElementSibling: label,
    textContent: "",
  };
  const input = {
    closest: (selector) => (selector === "label" ? null : form),
    getAttribute: () => undefined,
    parentElement: control,
    previousElementSibling: null,
    textContent: "",
    value: "2026-05-12 16:24",
  };
  const doc = {
    body: {
      innerText: `Task Type:
Dubbing / Audio Description / Scripting / Writing
Start Date:
Completion Date:`,
    },
    querySelectorAll: () => [input],
  };

  const text = collectPixelogicDocumentText(doc);
  const project = parsePixelogicOperationsManagerTaskText(
    text,
    operationsManagerUrl,
  );

  assert.equal(project.task_type, "Dubbing / Audio Description / Scripting / Writing");
  assert.equal(project.date_assigned, "2026-05-12 16:24");
});

test("document text collection reads Pixelogic date values from input attributes", () => {
  const label = { textContent: "Start Date:", previousElementSibling: null };
  const control = {
    parentElement: null,
    previousElementSibling: label,
    textContent: "",
  };
  const input = {
    closest: () => null,
    getAttribute: (name) =>
      name === "aria-label" ? "2026-05-12 16:24" : undefined,
    parentElement: control,
    previousElementSibling: null,
    textContent: "",
    value: "",
  };
  const doc = {
    body: {
      innerText: `Start Date:
Task Workability Date:
2026-05-11 15:26`,
    },
    querySelectorAll: () => [input],
  };

  const text = collectPixelogicDocumentText(doc);
  const project = parsePixelogicOperationsManagerTaskText(
    text,
    operationsManagerUrl,
  );

  assert.equal(project.date_assigned, "2026-05-12 16:24");
});

test("workplace task header prefix does not change the project id", () => {
  const text = `
Tasks/Task View
AD Template Origination -- Create AD Script from Scratch -- Edited Template Script (AD) -- English (US)Welcome to Wrexham: Season 5: Episode 5: Episode 5 (E0054)Broadcast_OriginalVIP
Task 2/7
#13500851
Due Date:
2026-05-16 01:44
Input Requirements:
Welcome to Wrexham: Season 5: Episode 5: Episode 5 (E0054)
`;

  const project = parsePixelogicOperationsManagerTaskText(
    text,
    operationsManagerUrl,
  );
  const normalized = normalizeProjectData(project);

  assert.equal(project.title, "Welcome to Wrexham");
  assert.equal(normalized.id, "Welcome to Wrexham: Season 5: Episode 5");
});
