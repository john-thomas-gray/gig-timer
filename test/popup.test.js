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

function createChromeMock({ stopwatchElapsed }) {
  const storage = {
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
        workplace_url: "https://authoring.netflixstudios.com/editor?requestRef=example",
      },
    ],
  };
  const tabMessages = [];

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
            callback({ projectId: activeProjectId });
            return;
          }

          callback(undefined);
        },
      },
      storage: {
        local: {
          async get(key) {
            if (key === "projects") return { projects: storage.projects };
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
