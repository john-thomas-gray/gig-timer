import assert from "node:assert/strict";
import test from "node:test";

const compositionUrl =
  "https://phelix.pixelogicmedia.com/composition-editor/projects/105667?taskId=13500851&grid1=spottingCreation";
const operationsManagerUrl =
  "https://phelix.pixelogicmedia.com/operations-manager/tasks/13500851";
const netflixAuthoringUrl =
  "https://authoring.netflixstudios.com/editor?requestRef=dubtext%3Adubtext_script_authoring%3A28fbbe84-bb57-4cf8-b97c-f9e666d6e63d";
const netflixRequestRef =
  "dubtext:dubtext_script_authoring:28fbbe84-bb57-4cf8-b97c-f9e666d6e63d";

function createChromeMock({
  assignmentResponses,
  legacyAssignmentSnapshot,
  lastProjectId = "",
  projects = [],
  tabUrl = compositionUrl,
  urls = {},
  workplaceData,
} = {}) {
  const listeners = {
    completed: [],
    historyStateUpdated: [],
    runtimeMessages: [],
    storageChanges: [],
  };
  const sentMessages = [];
  const storage = { lastProjectId, projects, urls };
  let assignmentRequestCount = 0;
  const defaultAssignmentProjects = [
    {
      assignment_url: compositionUrl,
      contractor: "Pixelogic Media",
      episode: "5",
      project_id: "105667",
      rate: 6,
      runtime: 2427,
      season: "5",
      task_id: "13500851",
      title: "Welcome to Wrexham",
      workplace_url:
        "https://phelix.pixelogicmedia.com/operations-manager/tasks/13500851",
    },
  ];

  const getStorageValues = (keys) => {
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.map((key) => [key, storage[key]]));
    }
    if (typeof keys === "string") {
      return { [keys]: storage[keys] };
    }
    return { ...storage };
  };

  return {
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.runtimeMessages.push(listener);
          },
        },
      },
      scripting: {
        async executeScript() {
          return [];
        },
      },
      storage: {
        onChanged: {
          addListener(listener) {
            listeners.storageChanges.push(listener);
          },
        },
        local: {
          async get(keys) {
            return getStorageValues(keys);
          },
          async set(items) {
            Object.assign(storage, items);
          },
        },
      },
      tabs: {
        async get(tabId) {
          return { id: tabId, url: tabUrl };
        },
        async sendMessage(tabId, message) {
          sentMessages.push({ tabId, ...message });

          if (message.action === "request-assignments-data") {
            if (legacyAssignmentSnapshot) {
              return {
                type: "RETURN_W2UI_DATA",
                payload: {
                  snapshot: legacyAssignmentSnapshot,
                },
              };
            }

            const responseIndex = Math.min(
              assignmentRequestCount,
              (assignmentResponses?.length ?? 1) - 1,
            );
            assignmentRequestCount += 1;
            return {
              type: "RETURN_PIXELLOGIC_ASSIGNMENTS_DATA",
              payload: {
                projects: assignmentResponses?.[responseIndex] ?? defaultAssignmentProjects,
              },
            };
          }

          if (message.action === "init-stopwatch") {
            return {};
          }

          if (message.action === "request-workplace-id") {
            return {
              data: workplaceData ?? {
                contractor: "Pixelogic Media",
                episode: "5",
                rate: 6,
                runtime: 2427,
                season: "5",
                task_id: "13500851",
                title: "Welcome to Wrexham",
                workplace_url: operationsManagerUrl,
              },
            };
          }

          return undefined;
        },
      },
      webNavigation: {
        onCompleted: {
          addListener(listener) {
            listeners.completed.push(listener);
          },
        },
        onHistoryStateUpdated: {
          addListener(listener) {
            listeners.historyStateUpdated.push(listener);
          },
        },
      },
    },
    listeners,
    sentMessages,
    storage,
  };
}

const pixelogicFallbackProject = {
  assignment_url: compositionUrl,
  contractor: "Pixelogic Media",
  id: "Pixelogic Project 105667",
  project_id: "105667",
  rate: 6,
  task_id: "13500851",
  title: "Pixelogic Project 105667",
  work_time: 0,
  workplace_url: operationsManagerUrl,
};

const richPixelogicProject = {
  assignment_url: compositionUrl,
  contractor: "Pixelogic Media",
  episode: "54",
  project_id: "105667",
  rate: 6,
  runtime: 2427,
  season: "5",
  task_id: "13500851",
  title: "Welcome to Wrexham",
  workplace_url: operationsManagerUrl,
};

async function importFreshBackground() {
  const backgroundUrl = new URL("../background.js", import.meta.url);
  backgroundUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
  await import(backgroundUrl.href);
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

test("history navigation to a composition-editor project creates the project and starts the timer", async () => {
  const mock = createChromeMock();
  const originalConsoleLog = console.log;
  const logs = [];
  globalThis.chrome = mock.chrome;
  console.log = (...args) => {
    logs.push(args);
  };

  try {
    await importFreshBackground();
    await waitFor(() =>
      assert.equal(mock.listeners.historyStateUpdated.length, 1),
    );

    mock.listeners.historyStateUpdated[0]({
      frameId: 0,
      tabId: 7,
      url: compositionUrl,
    });

    await waitFor(() => {
      assert.deepEqual(
        mock.sentMessages.map((message) => message.action),
        ["request-assignments-data", "init-stopwatch"],
      );
      assert.equal(
        mock.storage.projects[0].id,
        "Welcome to Wrexham: Season 5: Episode 5",
      );
      assert.equal(
        mock.storage.lastProjectId,
        "Welcome to Wrexham: Season 5: Episode 5",
      );
      assertLogMessage(logs, "[Gig Timer] Processing timer page navigation");
      assertLogMessage(logs, "[Gig Timer] Assignment page recognized");
      assertLogMessage(logs, "[Gig Timer] Requesting assignments data");
      assertLogMessage(logs, "[Gig Timer] Assignments response received");
      assertLogMessage(
        logs,
        "[Gig Timer] Normalized Pixelogic assignment projects",
      );
      assertLogMessage(
        logs,
        "[Gig Timer] Composition project stored; starting stopwatch",
      );
      assertLogMessage(logs, "[Gig Timer] Sending stopwatch init");
      assertLogMessage(logs, "[Gig Timer] Stopwatch init sent");
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("export project stamps date completed and stores the completed field", async () => {
  const mock = createChromeMock({
    projects: [
      {
        id: "Example Series: Season 1: Episode 1",
        title: "Example Series",
        season: "1",
        episode: "1",
        contractor: "Pixelogic Media",
        date_assigned: "2026-01-02",
        runtime: 2400,
        rate: 6,
        work_time: 120,
      },
    ],
  });
  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  const now = new Date();
  const expectedToday = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  globalThis.chrome = mock.chrome;
  globalThis.fetch = async (url, options = {}) => {
    fetchCalls.push({
      url,
      body: JSON.parse(options.body),
    });
    return {
      ok: true,
      async text() {
        return "OK";
      },
    };
  };

  try {
    await importFreshBackground();
    await waitFor(() =>
      assert.equal(mock.listeners.runtimeMessages.length, 1),
    );

    mock.listeners.runtimeMessages[0](
      {
        action: "export-project-data",
        projectId: "Example Series: Season 1: Episode 1",
        source: "popup.js",
      },
      {},
      () => {},
    );

    await waitFor(() => {
      assert.equal(fetchCalls.length, 1);
      assert.equal(
        mock.storage.projects[0].id,
        "Example Series: Season 1: Episode 1",
      );
      assert.equal(mock.storage.projects[0].date_completed, expectedToday);
      assert.equal(mock.storage.projects[0].date_assigned, undefined);
      assert.equal(fetchCalls[0].body.projectData.date_completed, expectedToday);
      assert.equal(fetchCalls[0].body.projectData.date_assigned, undefined);
    });
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.chrome;
  }
});

test("composition project navigation retries URL fallback metadata until page metadata is available", async () => {
  const mock = createChromeMock({
    assignmentResponses: [[pixelogicFallbackProject], [richPixelogicProject]],
  });
  const originalConsoleLog = console.log;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() =>
      assert.equal(mock.listeners.historyStateUpdated.length, 1),
    );

    mock.listeners.historyStateUpdated[0]({
      frameId: 0,
      tabId: 13,
      url: compositionUrl,
    });

    await waitFor(() => {
      assert.equal(
        mock.sentMessages.filter(
          (message) => message.action === "request-assignments-data",
        ).length,
        2,
      );
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(
        mock.storage.projects[0].id,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(mock.storage.projects[0].title, "Welcome to Wrexham");
      assert.equal(mock.storage.projects[0].runtime, 2427);
      assert.equal(
        mock.storage.lastProjectId,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("Pixelogic URL fallback metadata does not overwrite a rich project", async () => {
  const mock = createChromeMock({
    projects: [
      {
        ...richPixelogicProject,
        id: "Welcome to Wrexham: Season 5: Episode 54",
        work_time: 90,
      },
    ],
    tabUrl: compositionUrl,
    workplaceData: pixelogicFallbackProject,
  });
  const originalConsoleLog = console.log;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() => assert.equal(mock.listeners.runtimeMessages.length, 1));

    mock.listeners.runtimeMessages[0](
      { action: "store-elapsed-time", elapsedTime: 120 },
      { tab: { id: 14 } },
      () => {},
    );

    await waitFor(() => {
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(
        mock.storage.projects[0].id,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(mock.storage.projects[0].title, "Welcome to Wrexham");
      assert.equal(mock.storage.projects[0].work_time, 120);
      assert.equal(mock.storage.projects[0].runtime, 2427);
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("operations-manager task navigation stores metadata without starting the timer", async () => {
  const mock = createChromeMock({ tabUrl: operationsManagerUrl });
  const originalConsoleLog = console.log;
  const logs = [];
  globalThis.chrome = mock.chrome;
  console.log = (...args) => {
    logs.push(args);
  };

  try {
    await importFreshBackground();
    await waitFor(() =>
      assert.equal(mock.listeners.historyStateUpdated.length, 1),
    );

    mock.listeners.historyStateUpdated[0]({
      frameId: 0,
      tabId: 8,
      url: operationsManagerUrl,
    });

    await waitFor(() => {
      assert.deepEqual(
        mock.sentMessages.map((message) => message.action),
        ["request-workplace-id"],
      );
      assert.equal(
        mock.storage.projects[0].id,
        "Welcome to Wrexham: Season 5: Episode 5",
      );
      assert.equal(
        mock.storage.lastProjectId,
        "Welcome to Wrexham: Season 5: Episode 5",
      );
      assertLogMessage(logs, "[Gig Timer] Workplace page recognized");
      assertLogMessage(
        logs,
        "[Gig Timer] Workplace project stored without starting stopwatch",
      );
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("popup project lookup selects the active workspace project", async () => {
  const mock = createChromeMock({
    tabUrl: operationsManagerUrl,
    workplaceData: richPixelogicProject,
  });
  const originalConsoleLog = console.log;
  let response;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() => assert.equal(mock.listeners.runtimeMessages.length, 1));

    mock.listeners.runtimeMessages[0](
      {
        action: "get-latest-workspace-project-id",
        source: "popup.js",
        tabId: 17,
      },
      {},
      (value) => {
        response = value;
      },
    );

    await waitFor(() => {
      assert.deepEqual(
        mock.sentMessages.map((message) => message.action),
        ["request-workplace-id"],
      );
      assert.equal(
        response.projectId,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(
        mock.storage.lastProjectId,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(mock.storage.projects.length, 1);
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("popup project lookup preserves edited billing fields during workspace refresh", async () => {
  const mock = createChromeMock({
    projects: [
      {
        ...richPixelogicProject,
        id: "Welcome to Wrexham: Season 5: Episode 54",
        invoice_amount: 360,
        rate: 12,
        runtime: 1800,
        work_time: 900,
      },
    ],
    tabUrl: operationsManagerUrl,
    workplaceData: richPixelogicProject,
  });
  const originalConsoleLog = console.log;
  let response;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() => assert.equal(mock.listeners.runtimeMessages.length, 1));

    mock.listeners.runtimeMessages[0](
      {
        action: "get-latest-workspace-project-id",
        source: "popup.js",
        tabId: 19,
      },
      {},
      (value) => {
        response = value;
      },
    );

    await waitFor(() => {
      assert.equal(
        response.projectId,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(mock.storage.projects[0].rate, 12);
      assert.equal(mock.storage.projects[0].work_time, 900);
      assert.equal(mock.storage.projects[0].invoice_amount, 480);
      assert.equal(mock.storage.projects[0].hourly_rate, 1920);
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("popup project lookup falls back to the most recently visited workspace", async () => {
  const mock = createChromeMock({
    lastProjectId: "Recent Project",
    projects: [{ id: "Recent Project", title: "Recent Project" }],
    tabUrl: "https://example.test/not-a-workspace",
  });
  let response;
  globalThis.chrome = mock.chrome;

  try {
    await importFreshBackground();
    await waitFor(() => assert.equal(mock.listeners.runtimeMessages.length, 1));

    mock.listeners.runtimeMessages[0](
      {
        action: "get-latest-workspace-project-id",
        source: "popup.js",
        tabId: 18,
      },
      {},
      (value) => {
        response = value;
      },
    );

    await waitFor(() => {
      assert.equal(response.projectId, "Recent Project");
      assert.equal(mock.sentMessages.length, 0);
    });
  } finally {
    delete globalThis.chrome;
  }
});

test("legacy assignment runtime is converted from minutes to seconds", async () => {
  const legacyAssignmentsUrl = "https://legacy.example.test/assignments";
  const mock = createChromeMock({
    legacyAssignmentSnapshot: {
      records: [
        {
          alpha_clients: "Legacy Client",
          alpha_source_materials: [{ program_runtime: 40.45 }],
          created_at: "2026-05-18",
          due_date: "2026-05-20",
          title: "Legacy Show: Season 1: Episode 2",
        },
      ],
    },
    tabUrl: legacyAssignmentsUrl,
    urls: { assignments: legacyAssignmentsUrl },
  });
  const originalConsoleLog = console.log;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() =>
      assert.equal(mock.listeners.historyStateUpdated.length, 1),
    );

    mock.listeners.historyStateUpdated[0]({
      frameId: 0,
      tabId: 16,
      url: legacyAssignmentsUrl,
    });

    await waitFor(() => {
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(mock.storage.projects[0].client, "Legacy Client");
      assert.equal(
        mock.storage.projects[0].id,
        "Legacy Show: Season 1: Episode 2",
      );
      assert.equal(mock.storage.projects[0].runtime, 2427);
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("Pixelogic elapsed time merges into the existing fallback project", async () => {
  const mock = createChromeMock({
    projects: [
      {
        assignment_url: compositionUrl,
        contractor: "Pixelogic Media",
        id: "Pixelogic Project 105667",
        project_id: "105667",
        rate: 6,
        task_id: "13500851",
        title: "Pixelogic Project 105667",
        work_time: 0,
        workplace_url: operationsManagerUrl,
      },
    ],
    tabUrl: compositionUrl,
    workplaceData: {
      assignment_url: compositionUrl,
      contractor: "Pixelogic Media",
      episode: "54",
      project_id: "105667",
      rate: 6,
      runtime: 2427,
      season: "5",
      task_id: "13500851",
      title: "Welcome to Wrexham",
      workplace_url: operationsManagerUrl,
    },
  });
  const originalConsoleLog = console.log;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() => assert.equal(mock.listeners.runtimeMessages.length, 1));

    mock.listeners.runtimeMessages[0](
      { action: "store-elapsed-time", elapsedTime: 30 },
      { tab: { id: 11 } },
      () => {},
    );

    await waitFor(() => {
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(
        mock.storage.projects[0].id,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(mock.storage.projects[0].work_time, 30);
      assert.equal(mock.storage.projects[0].runtime, 2427);
      assert.equal(mock.storage.projects[0].invoice_amount, 240);
      assert.equal(mock.storage.projects[0].project_id, "105667");
      assert.equal(mock.storage.projects[0].task_id, "13500851");
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("Pixelogic elapsed time collapses fallback and id-only duplicate projects", async () => {
  const mock = createChromeMock({
    projects: [
      {
        assignment_url: compositionUrl,
        contractor: "Pixelogic Media",
        id: "Pixelogic Project 105667",
        project_id: "105667",
        rate: 6,
        task_id: "13500851",
        title: "Pixelogic Project 105667",
        work_time: 0,
        workplace_url: operationsManagerUrl,
      },
      {
        id: "Welcome to Wrexham: Season 5: Episode 54",
        work_time: 30,
      },
    ],
    tabUrl: compositionUrl,
    workplaceData: {
      assignment_url: compositionUrl,
      contractor: "Pixelogic Media",
      episode: "54",
      project_id: "105667",
      rate: 6,
      runtime: 2427,
      season: "5",
      task_id: "13500851",
      title: "Welcome to Wrexham",
      workplace_url: operationsManagerUrl,
    },
  });
  const originalConsoleLog = console.log;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() => assert.equal(mock.listeners.runtimeMessages.length, 1));

    mock.listeners.runtimeMessages[0](
      { action: "store-elapsed-time", elapsedTime: 60 },
      { tab: { id: 12 } },
      () => {},
    );

    await waitFor(() => {
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(
        mock.storage.projects[0].id,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(mock.storage.projects[0].work_time, 60);
      assert.equal(mock.storage.projects[0].runtime, 2427);
      assert.equal(mock.storage.projects[0].invoice_amount, 240);
      assert.equal(mock.storage.projects[0].project_id, "105667");
      assert.equal(mock.storage.projects[0].task_id, "13500851");
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("stored work time lookup refreshes fallback Pixelogic metadata from the page", async () => {
  const mock = createChromeMock({
    projects: [pixelogicFallbackProject],
    tabUrl: compositionUrl,
    workplaceData: richPixelogicProject,
  });
  const originalConsoleLog = console.log;
  let storedWorkTime;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() => assert.equal(mock.listeners.runtimeMessages.length, 1));

    mock.listeners.runtimeMessages[0](
      { action: "get-stored-worktime" },
      { tab: { id: 15 } },
      (value) => {
        storedWorkTime = value;
      },
    );

    await waitFor(() => {
      assert.equal(storedWorkTime, 0);
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(
        mock.storage.projects[0].id,
        "Welcome to Wrexham: Season 5: Episode 54",
      );
      assert.equal(mock.storage.projects[0].title, "Welcome to Wrexham");
      assert.equal(mock.storage.projects[0].runtime, 2427);
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("Netflix authoring navigation creates a VSI project and starts the timer", async () => {
  const mock = createChromeMock({
    tabUrl: netflixAuthoringUrl,
    workplaceData: {
      client: "Netflix",
      contractor: "VSI",
      id: netflixRequestRef,
      request_ref: netflixRequestRef,
      rate: 7,
      runtime: 1800,
      title: "Example Series: Season 1: Episode 2",
      workplace_url: netflixAuthoringUrl,
    },
  });
  const originalConsoleLog = console.log;
  const logs = [];
  globalThis.chrome = mock.chrome;
  console.log = (...args) => {
    logs.push(args);
  };

  try {
    await importFreshBackground();
    await waitFor(() =>
      assert.equal(mock.listeners.historyStateUpdated.length, 1),
    );

    mock.listeners.historyStateUpdated[0]({
      frameId: 0,
      tabId: 9,
      url: netflixAuthoringUrl,
    });

    await waitFor(() => {
      assert.deepEqual(
        mock.sentMessages.map((message) => message.action),
        ["request-workplace-id", "init-stopwatch"],
      );
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(mock.storage.projects[0].client, "Netflix");
      assert.equal(mock.storage.projects[0].contractor, "VSI");
      assert.equal(mock.storage.projects[0].rate, 7);
      assert.equal(mock.storage.projects[0].request_ref, netflixRequestRef);
      assert.equal(
        mock.storage.projects[0].id,
        "Example Series: Season 1: Episode 2",
      );
      assert.equal(
        mock.storage.lastProjectId,
        "Example Series: Season 1: Episode 2",
      );
      assertLogMessage(logs, "[Gig Timer] Netflix authoring page recognized");
      assertLogMessage(logs, "[Gig Timer] Sending stopwatch init");
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

test("Netflix authoring navigation updates an existing project by request ref", async () => {
  const mock = createChromeMock({
    projects: [
      {
        id: "Existing Netflix Project",
        request_ref: netflixRequestRef,
        title: "Old Title",
        work_time: 120,
      },
    ],
    tabUrl: netflixAuthoringUrl,
    workplaceData: {
      client: "Netflix",
      contractor: "VSI",
      id: netflixRequestRef,
      request_ref: netflixRequestRef,
      rate: 7,
      runtime: 1800,
      title: "Example Series: Season 1: Episode 2",
      workplace_url: netflixAuthoringUrl,
    },
  });
  const originalConsoleLog = console.log;
  globalThis.chrome = mock.chrome;
  console.log = () => {};

  try {
    await importFreshBackground();
    await waitFor(() =>
      assert.equal(mock.listeners.historyStateUpdated.length, 1),
    );

    mock.listeners.historyStateUpdated[0]({
      frameId: 0,
      tabId: 10,
      url: netflixAuthoringUrl,
    });

    await waitFor(() => {
      assert.equal(mock.storage.projects.length, 1);
      assert.equal(mock.storage.projects[0].request_ref, netflixRequestRef);
      assert.equal(mock.storage.projects[0].title, "Example Series");
      assert.equal(mock.storage.projects[0].work_time, 120);
      assert.equal(mock.storage.projects[0].rate, 7);
    });
  } finally {
    console.log = originalConsoleLog;
    delete globalThis.chrome;
  }
});

function assertLogMessage(logs, message) {
  assert.ok(
    logs.some(([candidate]) => candidate === message),
    `Expected console log: ${message}`,
  );
}
