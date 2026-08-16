import assert from "node:assert/strict";
import test from "node:test";

const compositionUrl =
  "https://phelix.pixelogicmedia.com/composition-editor/projects/105667?taskId=13500851&grid1=spottingCreation";

function createDocumentMock() {
  const body = createElementMock("body");
  body.innerText = "";

  return {
    body,
    addEventListener() {},
    createElement: createElementMock,
  };
}

function createElementMock(tagName) {
  return {
    children: [],
    id: "",
    style: {},
    tagName: tagName.toUpperCase(),
    textContent: "",
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
  };
}

function createChromeMock({ failuresBeforeSuccess = 0, storedWorktime = 42 } = {}) {
  const runtimeMessages = [];
  let sendMessageCount = 0;

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
          if (message.action !== "get-stored-worktime") return undefined;

          sendMessageCount += 1;
          if (sendMessageCount <= failuresBeforeSuccess) {
            throw new Error("Background listener is not ready");
          }

          return storedWorktime;
        },
      },
      storage: {
        local: {
          async get() {
            return { urls: {} };
          },
        },
      },
    },
    getSendMessageCount() {
      return sendMessageCount;
    },
    runtimeMessages,
  };
}

async function importFreshStopwatch() {
  const stopwatchUrl = new URL("../content/stopwatch.js", import.meta.url);
  stopwatchUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  await import(stopwatchUrl.href);
}

async function waitFor(assertion, timeoutMs = 2000) {
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

test("stored work time load retries a transient startup failure without logging an error", async () => {
  const mock = createChromeMock({ failuresBeforeSuccess: 1, storedWorktime: 120 });
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const errors = [];

  globalThis.chrome = mock.chrome;
  globalThis.document = createDocumentMock();
  globalThis.window = { location: { href: compositionUrl } };
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  console.error = (...args) => {
    errors.push(args);
  };
  console.log = () => {};

  try {
    await importFreshStopwatch();
    await waitFor(() => assert.equal(mock.runtimeMessages.length, 1));

    mock.runtimeMessages[0](
      { action: "init-stopwatch", source: "background.js" },
      {},
      () => {},
    );

    await waitFor(() => assert.equal(mock.getSendMessageCount(), 2));
    assert.equal(errors.length, 0);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("stored work time load logs an error only after every retry fails", async () => {
  const mock = createChromeMock({ failuresBeforeSuccess: 99 });
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const errors = [];

  globalThis.chrome = mock.chrome;
  globalThis.document = createDocumentMock();
  globalThis.window = { location: { href: compositionUrl } };
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  console.error = (...args) => {
    errors.push(args);
  };
  console.log = () => {};

  try {
    await importFreshStopwatch();
    await waitFor(() => assert.equal(mock.runtimeMessages.length, 1));

    mock.runtimeMessages[0](
      { action: "init-stopwatch", source: "background.js" },
      {},
      () => {},
    );

    await waitFor(() => {
      assert.equal(mock.getSendMessageCount(), 5);
      assert.equal(errors.length, 1);
    });
    assert.equal(errors[0][0], "Unable to get stored workTime");
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
  }
});
