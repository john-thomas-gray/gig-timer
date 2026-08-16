import assert from "node:assert/strict";
import test from "node:test";

const compositionUrl =
  "https://phelix.pixelogicmedia.com/composition-editor/projects/105667?taskId=13500851&grid1=spottingCreation";
const originatorUrl =
  "https://originatorstudio.netflixstudios.com/document/dubtext:dubtext_script_authoring:7a93a492-e0fb-404f-aebe-521b3a027fb5";
const authoringUrl =
  "https://authoring.netflixstudios.com/editor?requestRef=dubtext%3Adubtext_script_authoring%3A7a93a492-e0fb-404f-aebe-521b3a027fb5";

function createDocumentMock() {
  return {
    body: { innerText: "" },
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    title: "",
  };
}

function createChromeMock({ delayStorageGet } = {}) {
  const runtimeMessages = [];
  let storageGetCount = 0;

  return {
    chrome: {
      runtime: {
        getURL(path) {
          return new URL(`../${path}`, import.meta.url).href;
        },
        async sendMessage() {
          return { stored: true };
        },
        onMessage: {
          addListener(listener) {
            runtimeMessages.push(listener);
          },
        },
      },
      storage: {
        local: {
          async get() {
            storageGetCount += 1;
            if (storageGetCount === 1 && delayStorageGet) {
              await delayStorageGet;
            }
            return { urls: {} };
          },
        },
      },
    },
    runtimeMessages,
  };
}

function createNetflixDocumentMock() {
  return {
    ...createDocumentMock(),
    title: 'The Body at the Mansion: Season 1: "Episode 2" - Originator Studio',
    querySelectorAll(selector) {
      if (selector === "[aria-label='Media Player' i]") {
        return [{ textContent: "00:00:00:00 / 00:30:00:00" }];
      }

      return [];
    },
  };
}

async function importFreshWorkplace() {
  const workplaceUrl = new URL("../content/workplace.js", import.meta.url);
  workplaceUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  await import(workplaceUrl.href);
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

test("workplace metadata listener is available before content setup finishes", async () => {
  let releaseStorage;
  const delayStorageGet = new Promise((resolve) => {
    releaseStorage = resolve;
  });
  const mock = createChromeMock({ delayStorageGet });
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  let responseCalled = false;
  let response;

  globalThis.chrome = mock.chrome;
  globalThis.document = createDocumentMock();
  globalThis.window = { location: { href: compositionUrl } };
  console.error = () => {};
  console.log = () => {};

  try {
    await importFreshWorkplace();

    assert.equal(mock.runtimeMessages.length, 1);

    mock.runtimeMessages[0](
      { action: "request-workplace-id", source: "background.js" },
      {},
      (value) => {
        responseCalled = true;
        response = value;
      },
    );

    await Promise.resolve();
    assert.equal(responseCalled, false);

    releaseStorage();

    await waitFor(() => {
      assert.equal(responseCalled, true);
      assert.equal(response.data.project_id, "105667");
      assert.equal(response.data.task_id, "13500851");
    });
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    delete globalThis.__gigTimerWorkplaceScriptLoaded;
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("Originator Studio metadata does not request editor endpoints", async () => {
  const mock = createChromeMock();
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalFetch = globalThis.fetch;
  const errors = [];
  let fetchCallCount = 0;
  let response;

  globalThis.chrome = mock.chrome;
  globalThis.document = createNetflixDocumentMock();
  globalThis.window = {
    location: {
      href: originatorUrl,
      origin: "https://originatorstudio.netflixstudios.com",
    },
  };
  globalThis.fetch = async () => {
    fetchCallCount += 1;
    throw new Error("Originator Studio should not request editor metadata");
  };
  console.error = (...args) => {
    errors.push(args);
  };
  console.log = () => {};

  try {
    await importFreshWorkplace();
    await waitFor(() => assert.equal(mock.runtimeMessages.length, 1));

    mock.runtimeMessages[0](
      { action: "request-workplace-id", source: "background.js" },
      {},
      (value) => {
        response = value;
      },
    );

    await waitFor(() => {
      assert.equal(
        response.data.request_ref,
        "dubtext:dubtext_script_authoring:7a93a492-e0fb-404f-aebe-521b3a027fb5",
      );
      assert.equal(response.data.client, "Netflix");
      assert.equal(response.data.contractor, "VSI");
    });
    assert.equal(errors.length, 0);
    assert.equal(fetchCallCount, 0);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    globalThis.fetch = originalFetch;
    delete globalThis.__gigTimerWorkplaceScriptLoaded;
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("Netflix editor HTML metadata fallback does not log errors", async () => {
  const mock = createChromeMock();
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalFetch = globalThis.fetch;
  const errors = [];
  let response;

  globalThis.chrome = mock.chrome;
  globalThis.document = createNetflixDocumentMock();
  globalThis.window = {
    location: {
      href: authoringUrl,
      origin: "https://authoring.netflixstudios.com",
    },
  };
  globalThis.fetch = async () => ({
    headers: {
      get() {
        return "text/html; charset=utf-8";
      },
    },
    ok: true,
    async json() {
      throw new SyntaxError("Unexpected token '<'");
    },
  });
  console.error = (...args) => {
    errors.push(args);
  };
  console.log = () => {};

  try {
    await importFreshWorkplace();
    await waitFor(() => assert.equal(mock.runtimeMessages.length, 1));

    mock.runtimeMessages[0](
      { action: "request-workplace-id", source: "background.js" },
      {},
      (value) => {
        response = value;
      },
    );

    await waitFor(() => {
      assert.equal(
        response.data.request_ref,
        "dubtext:dubtext_script_authoring:7a93a492-e0fb-404f-aebe-521b3a027fb5",
      );
    });
    assert.equal(errors.length, 0);
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    globalThis.fetch = originalFetch;
    delete globalThis.__gigTimerWorkplaceScriptLoaded;
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
  }
});
