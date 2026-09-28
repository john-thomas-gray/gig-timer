import assert from "node:assert/strict";
import test from "node:test";

const compositionUrl =
  "https://phelix.pixelogicmedia.com/composition-editor/projects/105667?taskId=13500851&grid1=spottingCreation";
const compositionWorkplaceUrl =
  "https://phelix.pixelogicmedia.com/composition-editor/projects/188823?taskId=15591854&grid1=spottingCreation";
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
  const originalSetTimeout = globalThis.setTimeout;
  let responseCalled = false;
  let response;

  globalThis.chrome = mock.chrome;
  globalThis.document = createDocumentMock();
  globalThis.window = { location: { href: compositionUrl } };
  globalThis.setTimeout = (callback, ms) => {
    if (ms === 250) {
      queueMicrotask(callback);
      return 1;
    }

    return originalSetTimeout(callback, ms);
  };
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
    globalThis.setTimeout = originalSetTimeout;
    delete globalThis.__gigTimerWorkplaceScriptLoaded;
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
  }
});

test("Pixelogic workplace metadata waits for composition title instead of URL fallback", async () => {
  const mock = createChromeMock();
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const originalSetTimeout = globalThis.setTimeout;
  const doc = createDocumentMock();
  let response;
  let sleepCount = 0;

  doc.body.innerText = "Composition Editor\nLoading";

  globalThis.chrome = mock.chrome;
  globalThis.document = doc;
  globalThis.window = { location: { href: compositionWorkplaceUrl } };
  console.error = () => {};
  console.log = () => {};

  try {
    await importFreshWorkplace();
    await waitFor(() => assert.equal(mock.runtimeMessages.length, 1));

    globalThis.setTimeout = (callback, ms) => {
      if (ms === 250) {
        sleepCount += 1;
      }
      if (sleepCount === 1 && ms === 250) {
        doc.body.innerText = `
Composition Editor
Devil You Know, The: Killer in the Family_Season 1_E001_Episode 1_Broadcast_Original
[ OM-1234567 / 7654321 ]
00:00:00:00
00:42:10:00
23.976
Audio Description English (US)
`;
      }
      queueMicrotask(callback);
      return sleepCount;
    };

    mock.runtimeMessages[0](
      { action: "request-workplace-id", source: "background.js" },
      {},
      (value) => {
        response = value;
      },
    );

    await waitFor(() => {
      assert.equal(
        response.data.title,
        "Devil You Know, The: Killer in the Family",
      );
      assert.equal(response.data.project_id, "188823");
      assert.equal(response.data.task_id, "15591854");
      assert.equal(response.data.season, "1");
      assert.equal(response.data.episode, "1");
    });
  } finally {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
    globalThis.setTimeout = originalSetTimeout;
    delete globalThis.__gigTimerWorkplaceScriptLoaded;
    delete globalThis.chrome;
    delete globalThis.document;
    delete globalThis.window;
  }
});

for (const isComposition of [false, true]) {
  test(`Pixelogic waits for delayed ${isComposition ? "media duration" : "client instructions"}`, async () => {
    const mock = createChromeMock();
    const doc = createDocumentMock();
    const media = { duration: NaN };
    doc.body.innerText = isComposition
      ? "Mavis_Season 1_101_Episode 101\n01:07:30:13\n01:31:54:23\n23.976"
      : "Mavis: Season 1: Episode 1: Episode 101 (101)\nTask Instructions\nLoading";
    doc.querySelectorAll = (selector) => selector === "video, audio" ? [media] : [];
    const originalSetTimeout = globalThis.setTimeout;
    const originalConsoleLog = console.log;
    let polls = 0;
    let response;
    globalThis.chrome = mock.chrome;
    globalThis.document = doc;
    globalThis.window = { location: { href: isComposition
      ? "https://phelix.pixelogicmedia.com/composition-editor/projects/224195?taskId=17761368"
      : "https://phelix.pixelogicmedia.com/operations-manager/tasks/17761368" } };
    console.log = () => {};
    globalThis.setTimeout = (callback, ms) => {
      if (ms !== 250) return originalSetTimeout(callback, ms);
      polls += 1;
      if (polls === 2) {
        if (isComposition) media.duration = 1917.916;
        else doc.body.innerText = doc.body.innerText.replace("Loading", "ALULA \u2014 AUDIO - AUDIO DESCRIPTION -- AD SCRIPT WRITING");
      }
      queueMicrotask(callback);
      return polls;
    };
    try {
      await importFreshWorkplace();
      mock.runtimeMessages[0](
        { action: "request-workplace-id", source: "background.js" }, {},
        (value) => { response = value; },
      );
      await waitFor(() => assert.ok(response?.data));
      assert.equal(polls, 2);
      assert.equal(response.data.task_id, "17761368");
      if (isComposition) assert.equal(response.data.runtime, 1918);
      else assert.equal(response.data.client, "Alula");
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      console.log = originalConsoleLog;
      delete globalThis.__gigTimerWorkplaceScriptLoaded;
      delete globalThis.chrome;
      delete globalThis.document;
      delete globalThis.window;
    }
  });
}

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

for (const [name, initialUrl, targetUrl, expectedTitle] of [
  ["Pixelogic", "https://phelix.pixelogicmedia.com/operations-manager/tasks", compositionUrl, "Welcome to Wrexham"],
  ["Netflix", "https://originatorstudio.netflixstudios.com/", originatorUrl, "The Body at the Mansion"],
]) {
  test(`${name} workplace detection refreshes after navigation without a reload`, async () => {
    const mock = createChromeMock();
    const originalLog = console.log;
    const originalError = console.error;
    globalThis.chrome = mock.chrome;
    globalThis.document = createNetflixDocumentMock();
    globalThis.document.body.innerText = "Composition Editor\nWelcome to Wrexham_Season 5_E0054_Episode 5_Broadcast_Original";
    globalThis.window = { location: { href: initialUrl } };
    console.log = () => {};
    console.error = () => {};
    const request = () => new Promise((resolve) => mock.runtimeMessages[0](
      { action: "request-workplace-id", source: "background.js" }, {}, resolve,
    ));
    try {
      await importFreshWorkplace();
      assert.equal((await request()).data, undefined);
      globalThis.window.location.href = targetUrl;
      const response = await request();
      assert.equal(response.data?.title, expectedTitle);
      globalThis.window.location.href = initialUrl;
      assert.equal((await request()).data, undefined);
    } finally {
      console.log = originalLog;
      console.error = originalError;
      delete globalThis.__gigTimerWorkplaceScriptLoaded;
      delete globalThis.chrome;
      delete globalThis.document;
      delete globalThis.window;
    }
  });
}
