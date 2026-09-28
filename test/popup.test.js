import assert from "node:assert/strict";
import test from "node:test";

const activeProjectId = "Example Series: Season 1: Episode 1";

class MockElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.className = "";
    this.id = "";
    this.label = "";
    this.listeners = {};
    this.name = "";
    this.parentElement = undefined;
    this.placeholder = "";
    this.textContent = "";
    this.type = "";
    this.value = "";
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(type, listener) {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  async dispatch(type, event = {}) {
    const listeners = this.listeners[type] ?? [];
    for (const listener of listeners) {
      await listener(event);
    }
  }

  querySelector(selector) {
    if (selector !== "input") return undefined;
    return findDescendant(this, (element) => element.tagName === "INPUT");
  }

  get options() {
    return findDescendants(this, (element) => element.tagName === "OPTION");
  }
}

function findDescendant(element, predicate) {
  for (const child of element.children) {
    if (predicate(child)) return child;
    const nested = findDescendant(child, predicate);
    if (nested) return nested;
  }

  return undefined;
}

function findDescendants(element, predicate, results = []) {
  for (const child of element.children) {
    if (predicate(child)) results.push(child);
    findDescendants(child, predicate, results);
  }

  return results;
}

function createDocumentMock() {
  const elements = {
    defaultFields: new MockElement("div"),
    exportButton: new MockElement("button"),
    h2: new MockElement("h2"),
    projectSelect: new MockElement("select"),
    updateButton: new MockElement("button"),
  };
  Object.entries(elements).forEach(([id, element]) => {
    element.id = id;
  });
  const buttons = new MockElement("div");
  buttons.appendChild(elements.exportButton);
  buttons.appendChild(elements.updateButton);
  const titleGroup = new MockElement("div");
  const titleInput = new MockElement("input");
  titleInput.name = "title";
  titleGroup.appendChild(titleInput);
  elements.defaultFields.appendChild(titleGroup);

  const listeners = {};
  const document = {
    activeElement: undefined,
    addEventListener(type, listener) {
      listeners[type] ??= [];
      listeners[type].push(listener);
    },
    createElement(tagName) {
      return new MockElement(tagName);
    },
    async dispatch(type) {
      const eventListeners = listeners[type] ?? [];
      for (const listener of eventListeners) {
        await listener();
      }
    },
    getElementById(id) {
      return elements[id] ?? null;
    },
    listeners,
  };

  return { document, elements };
}

function createChromeMock({
  projects,
  stopwatchElapsed,
  exportResponse = { success: true },
  latestProjectId = activeProjectId,
}) {
  const storage = {
    projects: projects ?? [
      {
        contractor: "VSI",
        episode: "1",
        id: activeProjectId,
        rate: 7,
        runtime: 1800,
        season: "1",
        title: "Example Series",
        work_time: 90,
        workplace_url: "https://authoring.netflixstudios.com/editor?requestRef=example",
      },
    ],
  };
  const tabMessages = [];
  const exports = [];

  return {
    chrome: {
      runtime: {
        getURL(path) {
          return new URL(`../${path}`, import.meta.url).href;
        },
        lastError: undefined,
        sendMessage(message, callback) {
          if (message.action === "get-stored-projects") {
            callback(storage.projects);
            return;
          }

          if (message.action === "get-latest-workspace-project-id") {
            callback({ projectId: latestProjectId });
            return;
          }

          if (message.action === "export-project-data") {
            exports.push(structuredClone(
              storage.projects.find((project) => project.id === message.projectId),
            ));
            callback(exportResponse);
            return;
          }

          callback(undefined);
        },
      },
      storage: {
        local: {
          async get(key) {
            if (key === "projects") return { projects: structuredClone(storage.projects) };
            return {};
          },
          async set(items) {
            Object.assign(storage, items);
          },
        },
      },
      tabs: {
        query(query, callback) {
          callback([{ id: 44 }]);
        },
        sendMessage(tabId, message, callback) {
          tabMessages.push({ tabId, ...message });

          if (message.action === "get-stopwatch-time") {
            callback({ elapsedTime: stopwatchElapsed.value });
            return;
          }

          if (message.action === "set-stopwatch-time") {
            stopwatchElapsed.value = message.elapsedTime;
            callback({});
            return;
          }

          callback(undefined);
        },
      },
    },
    storage,
    tabMessages,
    exports,
  };
}

async function importFreshPopup() {
  const popupUrl = new URL("../content/popup.js", import.meta.url);
  popupUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  await import(popupUrl.href);
}

async function waitFor(assertion, timeoutMs = 1000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

function getFormInput(elements, name) {
  for (const group of elements.defaultFields.children) {
    const input = group.querySelector("input");
    if (input?.name === name) return input;
  }

  return undefined;
}

test("popup work time continues following the stopwatch after a manual update", async () => {
  const { document, elements } = createDocumentMock();
  const stopwatchElapsed = { value: 100 };
  const mock = createChromeMock({ stopwatchElapsed });
  const originalChrome = globalThis.chrome;
  const originalClearInterval = globalThis.clearInterval;
  const originalConsoleLog = console.log;
  const originalDocument = globalThis.document;
  const originalSetInterval = globalThis.setInterval;
  const intervals = [];

  globalThis.chrome = mock.chrome;
  globalThis.document = document;
  globalThis.clearInterval = () => {};
  globalThis.setInterval = (callback, intervalMs) => {
    intervals.push({ callback, intervalMs });
    return intervals.length;
  };
  console.log = () => {};

  try {
    await importFreshPopup();
    await document.dispatch("DOMContentLoaded");

    await waitFor(() => {
      assert.ok(getFormInput(elements, "work_time"));
      assert.equal(intervals.length, 1);
    });

    const workTimeInput = getFormInput(elements, "work_time");
    await waitFor(() => assert.equal(workTimeInput.value, "00:01:40:00"));

    document.activeElement = workTimeInput;
    workTimeInput.value = "00:02:00:00";
    await workTimeInput.dispatch("input");
    document.activeElement = undefined;

    await elements.updateButton.dispatch("click");

    await waitFor(() => {
      assert.equal(
        mock.tabMessages.some(
          (message) =>
            message.action === "set-stopwatch-time" &&
            message.elapsedTime === 120,
        ),
        true,
      );
    });

    stopwatchElapsed.value = 121;
    await intervals[0].callback();

    await waitFor(() => assert.equal(workTimeInput.value, "00:02:01:00"));
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.clearInterval = originalClearInterval;
    globalThis.document = originalDocument;
    globalThis.setInterval = originalSetInterval;
    console.log = originalConsoleLog;
  }
});

test("popup marks manually edited project fields", async () => {
  const { document, elements } = createDocumentMock();
  const stopwatchElapsed = { value: 100 };
  const projectId = "Project Blue: Season 1: Episode 4";
  const mock = createChromeMock({
    latestProjectId: projectId,
    stopwatchElapsed,
    projects: [
      {
        client: "Original Client",
        contractor: "Pixelogic",
        episode: "4",
        id: projectId,
        rate: 6,
        runtime: 1800,
        season: "1",
        task_id: "17761368",
        title: "Project Blue",
        work_time: 90,
        workplace_url:
          "https://phelix.pixelogicmedia.com/operations-manager/tasks/17761368",
      },
    ],
  });
  const originalChrome = globalThis.chrome;
  const originalClearInterval = globalThis.clearInterval;
  const originalConsoleLog = console.log;
  const originalDocument = globalThis.document;
  const originalSetInterval = globalThis.setInterval;

  globalThis.chrome = mock.chrome;
  globalThis.document = document;
  globalThis.clearInterval = () => {};
  globalThis.setInterval = () => 1;
  console.log = () => {};

  try {
    await importFreshPopup();
    await document.dispatch("DOMContentLoaded");

    await waitFor(() => assert.ok(getFormInput(elements, "client")));

    getFormInput(elements, "title").value = "Real Series";
    getFormInput(elements, "client").value = "Alula";
    await elements.updateButton.dispatch("click");

    await waitFor(() => {
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(
        mock.storage.projects[0].id,
        "Real Series: Season 1: Episode 4",
      );
      assert.equal(mock.storage.projects[0].title, "Real Series");
      assert.equal(mock.storage.projects[0].codename, "Project Blue");
      assert.deepEqual(
        mock.storage.projects[0]._manual_fields,
        ["client", "title"],
      );
      assert.equal(mock.storage.projects[0].client, "Apple+");
      assert.equal(mock.storage.projects[0].task_id, "17761368");
    });
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.clearInterval = originalClearInterval;
    globalThis.document = originalDocument;
    globalThis.setInterval = originalSetInterval;
    console.log = originalConsoleLog;
  }
});

async function withExportPopup(options, check) {
  const { document, elements } = createDocumentMock();
  const mock = createChromeMock({ stopwatchElapsed: { value: 90 }, ...options });
  const originalChrome = globalThis.chrome;
  const originalDocument = globalThis.document;
  const originalSetInterval = globalThis.setInterval;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  globalThis.chrome = mock.chrome;
  globalThis.document = document;
  globalThis.setInterval = () => 1;
  console.log = () => {};
  console.error = () => {};
  try {
    await importFreshPopup();
    await document.dispatch("DOMContentLoaded");
    await waitFor(() => assert.ok(elements.exportButton.listeners.click));
    const status = elements.exportButton.parentElement.children.find(
      (element) => element.id === "exportStatus",
    );
    await check({ elements, mock, status });
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.document = originalDocument;
    globalThis.setInterval = originalSetInterval;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
}

test("Export saves newly typed genre before sending the project", async () => {
  await withExportPopup({}, async ({ elements, mock, status }) => {
    let finishSave;
    mock.chrome.storage.local.set = async (items) => {
      await new Promise((resolve) => { finishSave = resolve; });
      Object.assign(mock.storage, items);
    };
    getFormInput(elements, "genre").value = "  Documentary  ";
    const exporting = elements.exportButton.dispatch("click");
    await waitFor(() => assert.equal(typeof finishSave, "function"));
    assert.equal(mock.exports.length, 0);
    assert.equal(elements.exportButton.disabled, true);
    finishSave();
    await exporting;

    assert.equal(mock.exports.length, 1);
    assert.equal(mock.exports[0].genre, "Documentary");
    assert.equal(mock.exports[0].title, "Example Series");
    assert.equal(status.role, "status");
    assert.equal(status.textContent, "Exported to spreadsheet.");
    assert.equal(elements.exportButton.disabled, false);
  });
});

test("Export does not send stale data when saving the form fails", async () => {
  await withExportPopup({}, async ({ elements, mock, status }) => {
    mock.chrome.storage.local.set = async () => {
      throw new Error("Storage unavailable");
    };
    getFormInput(elements, "genre").value = "Documentary";
    await elements.exportButton.dispatch("click");

    assert.equal(mock.exports.length, 0);
    assert.equal(mock.storage.projects[0].genre, undefined);
    assert.equal(status.textContent, "Could not save project. Export canceled.");
    assert.equal(elements.exportButton.disabled, false);
  });
});

test("Export displays a spreadsheet write failure instead of success", async () => {
  await withExportPopup(
    { exportResponse: { success: false, error: "Spreadsheet write failed." } },
    async ({ elements, mock, status }) => {
      getFormInput(elements, "genre").value = "Drama";
      await elements.exportButton.dispatch("click");

      assert.equal(mock.exports.length, 1);
      assert.equal(status.textContent, "Spreadsheet write failed.");
      assert.equal(elements.exportButton.disabled, false);
    },
  );
});

test("popup saves series defaults and applies them to stored episodes in the same series", async () => {
  const { document, elements } = createDocumentMock();
  const stopwatchElapsed = { value: 90 };
  const mock = createChromeMock({
    stopwatchElapsed,
    projects: [
      {
        contractor: "VSI",
        episode: "1",
        id: activeProjectId,
        rate: 7,
        runtime: 1800,
        season: "1",
        title: "Example Series",
        work_time: 90,
      },
      {
        episode: "2",
        id: "Example Series: Season 1: Episode 2",
        rate: 6,
        season: "1",
        title: "Example Series",
        work_time: 0,
      },
      {
        client: "Existing Client",
        episode: "3",
        genre: "Anthology",
        id: "Example Series: Season 1: Episode 3",
        rate: 20,
        season: "1",
        title: "Example Series",
        work_time: 0,
      },
      {
        episode: "1",
        id: "Example Series: Season 2: Episode 1",
        rate: 6,
        season: "2",
        title: "Example Series",
        work_time: 0,
      },
    ],
  });
  const originalChrome = globalThis.chrome;
  const originalClearInterval = globalThis.clearInterval;
  const originalConsoleLog = console.log;
  const originalDocument = globalThis.document;
  const originalSetInterval = globalThis.setInterval;

  globalThis.chrome = mock.chrome;
  globalThis.document = document;
  globalThis.clearInterval = () => {};
  globalThis.setInterval = () => 1;
  console.log = () => {};

  try {
    await importFreshPopup();
    await document.dispatch("DOMContentLoaded");

    await waitFor(() => assert.ok(getFormInput(elements, "genre")));

    const genreInput = getFormInput(elements, "genre");
    const clientInput = getFormInput(elements, "client");
    const rateInput = getFormInput(elements, "rate");
    genreInput.value = "Docuseries";
    clientInput.value = "FX";
    rateInput.value = "12";
    await elements.updateButton.dispatch("click");

    await waitFor(() => {
      assert.equal(mock.storage.projects[0].client, "FX");
      assert.equal(mock.storage.projects[0].genre, "Docuseries");
      assert.equal(mock.storage.projects[0].rate, 12);
      assert.equal(mock.storage.projects[1].client, "FX");
      assert.equal(mock.storage.projects[1].genre, "Docuseries");
      assert.equal(mock.storage.projects[1].rate, 12);
      assert.equal(mock.storage.projects[2].client, "Existing Client");
      assert.equal(mock.storage.projects[2].genre, "Anthology");
      assert.equal(mock.storage.projects[2].rate, 20);
      assert.equal(mock.storage.projects[3].rate, 6);
    });
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.clearInterval = originalClearInterval;
    globalThis.document = originalDocument;
    globalThis.setInterval = originalSetInterval;
    console.log = originalConsoleLog;
  }
});

test("popup applies series defaults across raw Pixelogic composition titles", async () => {
  const { document, elements } = createDocumentMock();
  const stopwatchElapsed = { value: 90 };
  const pixelogicProjectId =
    "Welcome to Wrexham_Season 5_E0054_Episode 54_Broadcast_Original";
  const mock = createChromeMock({
    latestProjectId: pixelogicProjectId,
    stopwatchElapsed,
    projects: [
      {
        contractor: "Pixelogic",
        id: pixelogicProjectId,
        rate: 6,
        title: pixelogicProjectId,
        work_time: 90,
      },
      {
        contractor: "Pixelogic",
        id: "Welcome to Wrexham_Season 5_E0055_Episode 55_Broadcast_Original",
        rate: 6,
        title: "Welcome to Wrexham_Season 5_E0055_Episode 55_Broadcast_Original",
        work_time: 0,
      },
    ],
  });
  const originalChrome = globalThis.chrome;
  const originalClearInterval = globalThis.clearInterval;
  const originalConsoleLog = console.log;
  const originalDocument = globalThis.document;
  const originalSetInterval = globalThis.setInterval;

  globalThis.chrome = mock.chrome;
  globalThis.document = document;
  globalThis.clearInterval = () => {};
  globalThis.setInterval = () => 1;
  console.log = () => {};

  try {
    await importFreshPopup();
    await document.dispatch("DOMContentLoaded");

    await waitFor(() => assert.ok(getFormInput(elements, "genre")));
    assert.equal(
      elements.projectSelect.children[0].label,
      "Welcome to Wrexham",
    );

    getFormInput(elements, "genre").value = "Docuseries";
    getFormInput(elements, "client").value = "FX";
    getFormInput(elements, "rate").value = "12";
    await elements.updateButton.dispatch("click");

    await waitFor(() => {
      const savedActive = mock.storage.projects.find(
        (project) => project.id === "Welcome to Wrexham: Season 5: Episode 54",
      );
      const sibling = mock.storage.projects.find(
        (project) =>
          project.id ===
          "Welcome to Wrexham_Season 5_E0055_Episode 55_Broadcast_Original",
      );

      assert.equal(savedActive.title, "Welcome to Wrexham");
      assert.equal(savedActive.genre, "Docuseries");
      assert.equal(savedActive.client, "FX");
      assert.equal(savedActive.rate, 12);
      assert.equal(sibling.genre, "Docuseries");
      assert.equal(sibling.client, "FX");
      assert.equal(sibling.rate, 12);
    });
  } finally {
    globalThis.chrome = originalChrome;
    globalThis.clearInterval = originalClearInterval;
    globalThis.document = originalDocument;
    globalThis.setInterval = originalSetInterval;
    console.log = originalConsoleLog;
  }
});
