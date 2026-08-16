import assert from "node:assert/strict";
import test from "node:test";

const compositionUrl =
  "https://phelix.pixelogicmedia.com/composition-editor/projects/105667?taskId=13500851&grid1=spottingCreation";

function createElementMock(tagName) {
  return {
    children: [],
    id: "",
    style: {},
    tagName: tagName.toUpperCase(),
    textContent: "",
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
}

function createDocumentMock() {
  return {
    body: createElementMock("body"),
    addEventListener() {},
    createElement: createElementMock,
  };
}

function createChromeMock({ delayStorageGet } = {}) {
  const runtimeMessages = [];
  const sentMessages = [];

  return {
    chrome: {
      runtime: {
        getURL(path) {
          return new URL(`../${path}`, import.meta.url).href;
        },
        onMessage: {
          addListener(listener) {
            runtimeMessages.push(listener);
          },
        },
        async sendMessage(message) {
          sentMessages.push(message);
        },
      },
      storage: {
        local: {
          async get() {
            if (delayStorageGet) await delayStorageGet;
            return { urls: {} };
          },
        },
      },
    },
    runtimeMessages,
    sentMessages,
  };
}

async function importFreshStopwatch() {
  const stopwatchUrl = new URL("../content/stopwatch.js", import.meta.url);
  stopwatchUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  await import(stopwatchUrl.href);
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

function installStopwatchGlobals(mock) {
  globalThis.chrome = mock.chrome;
  globalThis.document = createDocumentMock();
  globalThis.window = { location: { href: compositionUrl } };
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
}

function restoreStopwatchGlobals(originals) {
  console.error = originals.consoleError;
  console.log = originals.consoleLog;
  globalThis.setInterval = originals.setInterval;
  globalThis.clearInterval = originals.clearInterval;
  delete globalThis.__gigTimerStopwatchScriptLoaded;
  delete globalThis.chrome;
  delete globalThis.document;
  delete globalThis.window;
}

function captureOriginals() {
  return {
    clearInterval: globalThis.clearInterval,
    consoleError: console.error,
    consoleLog: console.log,
    setInterval: globalThis.setInterval,
  };
}

test("stopwatch starts from supplied time without requesting it again", async () => {
  let releaseStorage;
  const delayStorageGet = new Promise((resolve) => {
    releaseStorage = resolve;
  });
  const mock = createChromeMock({ delayStorageGet });
  const originals = captureOriginals();
  const errors = [];
  let initResponse;
  installStopwatchGlobals(mock);
  console.error = (...args) => {
    errors.push(args);
  };
  console.log = () => {};

  try {
    await importFreshStopwatch();
    assert.equal(mock.runtimeMessages.length, 1);

    mock.runtimeMessages[0](
      {
        action: "init-stopwatch",
        projectId: "Example project",
        source: "background.js",
        storedWorktime: 120,
      },
      {},
      (response) => {
        initResponse = response;
      },
    );

    await Promise.resolve();
    assert.equal(initResponse, undefined);
    releaseStorage();

    await waitFor(() => assert.deepEqual(initResponse, { initiated: true }));

    let timeResponse;
    mock.runtimeMessages[0](
      { action: "get-stopwatch-time" },
      {},
      (response) => {
        timeResponse = response;
      },
    );

    await waitFor(() => assert.deepEqual(timeResponse, { elapsedTime: 120 }));
    assert.deepEqual(mock.sentMessages, []);
    assert.deepEqual(errors, []);
  } finally {
    restoreStopwatchGlobals(originals);
  }
});

test("stopwatch saves elapsed time against its supplied project id", async () => {
  const mock = createChromeMock();
  const originals = captureOriginals();
  installStopwatchGlobals(mock);
  console.error = () => {};
  console.log = () => {};

  try {
    await importFreshStopwatch();
    await waitFor(() => assert.equal(mock.runtimeMessages.length, 1));

    let initResponse;
    mock.runtimeMessages[0](
      {
        action: "init-stopwatch",
        projectId: "Example project",
        source: "background.js",
        storedWorktime: 90,
      },
      {},
      (response) => {
        initResponse = response;
      },
    );
    await waitFor(() => assert.deepEqual(initResponse, { initiated: true }));

    mock.runtimeMessages[0](
      {
        action: "set-stopwatch-time",
        elapsedTime: 135,
        projectId: "Example project",
      },
      {},
      () => {},
    );

    await waitFor(() => assert.equal(mock.sentMessages.length, 1));
    assert.deepEqual(mock.sentMessages[0], {
      action: "store-elapsed-time",
      elapsedTime: 135,
      projectId: "Example project",
      url: compositionUrl,
    });
  } finally {
    restoreStopwatchGlobals(originals);
  }
});
