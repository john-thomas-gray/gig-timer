const CONTINUE_PAGE_TEXT =
  "We detected that you recently had an open session for this assignment.";

const NETFLIX_CONTRACTOR_DEFAULTS = {
  client: "Netflix",
  contractor: "VSI",
  rate: 7,
};

const workplaceListener = (msg, sender, sendResponse) => {
  if (msg.source !== "background.js" || msg.action !== "request-workplace-id") {
    return;
  }

  (async () => {
    try {
      const data = await getWorkplaceData();
      sendResponse({ data });
    } catch (e) {
      console.error("Cannot retrieve workplace metadata:", e);
      sendResponse({ data: getLegacyProjectData() });
    }
  })();

  return true;
};

async function getWorkplaceData() {
  if (isContinuePage()) return "__CONTINUE_PAGE__";
  if (isNetflixAuthoringPage()) return getNetflixProjectData();
  return getLegacyProjectData();
}

function isContinuePage() {
  return document.body?.innerText?.includes(CONTINUE_PAGE_TEXT) ?? false;
}

function isNetflixAuthoringPage() {
  return window.location.hostname === "authoring.netflixstudios.com";
}

function getLegacyProjectData() {
  const title = document.getElementById("header-full-title")?.textContent?.trim();
  return {
    id: title || window.location.href,
    title: title || document.title || window.location.href,
    workplace_url: window.location.href,
  };
}

async function getNetflixProjectData() {
  const requestRef = new URLSearchParams(window.location.search).get(
    "requestRef",
  );
  const responses = requestRef ? await fetchNetflixMetadata(requestRef) : {};
  const info = responses.info ?? responses.projectInfo ?? {};
  const projectInfo = responses.projectInfo ?? {};
  const documentPayload = responses.document?.document ?? responses.document ?? {};
  const documentMeta = documentPayload.meta ?? {};
  const mediaMetadata = responses.mediaMetadata ?? {};
  const titleSource = firstValue(
    info.internalTitle,
    projectInfo.internalTitle,
    documentMeta.title,
    documentPayload.title,
    document.title,
  );
  const parsedTitle = parseNetflixTitle(titleSource);
  const visibleDueDate = findVisibleDate([
    "due date",
    "date due",
    "deadline",
  ]);
  const visibleAssignedDate = findVisibleDate([
    "assigned",
    "date assigned",
    "created",
  ]);
  const dateAssigned =
    firstValue(
      findByKey([info, projectInfo, documentMeta], ASSIGNED_DATE_KEYS),
      visibleAssignedDate,
    ) ?? todayIsoDate();

  return {
    ...NETFLIX_CONTRACTOR_DEFAULTS,
    id: requestRef,
    request_ref: requestRef,
    title: titleSource,
    season: firstValue(
      documentMeta.seasonNumber,
      findByKey([info, projectInfo, documentMeta], SEASON_KEYS),
      parsedTitle.season,
    ),
    episode: firstValue(
      documentMeta.episodeNumber,
      findByKey([info, projectInfo, documentMeta], EPISODE_KEYS),
      parsedTitle.episode,
    ),
    runtime: parseRuntimeValue(
      firstValue(
        findByKey([info, projectInfo, documentMeta, mediaMetadata], RUNTIME_KEYS),
        findVisibleRuntime(),
      ),
    ),
    date_due: firstValue(
      findByKey([info, projectInfo, documentMeta], DUE_DATE_KEYS),
      visibleDueDate,
    ),
    date_assigned: dateAssigned,
    workplace_url: window.location.href,
  };
}

async function fetchNetflixMetadata(requestRef) {
  const [info, projectInfo, documentResponse, mediaMetadata] =
    await Promise.all([
      fetchNetflixJson(`/nqapi/editor/info/${requestRef}`),
      fetchNetflixJson(`/nqapi/editor/projectInfo/${requestRef}`),
      fetchNetflixJson(`/nqapi/editor/document/${requestRef}`),
      fetchNetflixJson(`/nqapi/editor/mediaMetadata/${requestRef}`),
    ]);

  return {
    info: info ?? (await fetchNetflixJson(`/api/editor/info/${requestRef}`)),
    projectInfo:
      projectInfo ?? (await fetchNetflixJson(`/api/editor/projectInfo/${requestRef}`)),
    document:
      documentResponse ??
      (await fetchNetflixJson(`/api/editor/document/${requestRef}`)),
    mediaMetadata:
      mediaMetadata ??
      (await fetchNetflixJson(`/api/editor/mediaMetadata/${requestRef}`)),
  };
}

async function fetchNetflixJson(path) {
  try {
    const response = await fetch(new URL(path, window.location.origin), {
      credentials: "include",
    });

    if (!response.ok) return undefined;
    return response.json();
  } catch (e) {
    console.warn(`Netflix metadata request failed for ${path}:`, e);
    return undefined;
  }
}

const SEASON_KEYS = ["seasonNumber", "season", "season_number"];
const EPISODE_KEYS = ["episodeNumber", "episode", "episode_number"];
const RUNTIME_KEYS = [
  "runtime",
  "duration",
  "programRuntime",
  "program_runtime",
  "runTime",
];
const DUE_DATE_KEYS = ["dueDate", "dateDue", "deadline", "dueAt", "due_at"];
const ASSIGNED_DATE_KEYS = [
  "dateAssigned",
  "assignedDate",
  "assignedAt",
  "createdAt",
  "created_at",
];

function firstValue(...values) {
  for (const value of values.flat()) {
    if (value === undefined || value === null) continue;
    const cleaned = String(value).trim();
    if (cleaned) return value;
  }

  return undefined;
}

function findByKey(sources, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));

  for (const source of sources) {
    const value = findValueByKey(source, wanted);
    if (value !== undefined) return value;
  }

  return undefined;
}

function findValueByKey(source, wantedKeys, depth = 0) {
  if (!source || depth > 5) return undefined;

  if (Array.isArray(source)) {
    for (const item of source) {
      const value = findValueByKey(item, wantedKeys, depth + 1);
      if (value !== undefined) return value;
    }
    return undefined;
  }

  if (typeof source !== "object") return undefined;

  for (const [key, value] of Object.entries(source)) {
    if (
      wantedKeys.has(key.toLowerCase()) &&
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      return value;
    }
  }

  for (const value of Object.values(source)) {
    const found = findValueByKey(value, wantedKeys, depth + 1);
    if (found !== undefined) return found;
  }

  return undefined;
}

function parseNetflixTitle(rawTitle) {
  const source = String(rawTitle ?? "")
    .replace(/\s+-\s+Authoring\s*$/i, "")
    .trim();
  if (!source) return {};

  const match = source.match(
    /^(.*?)(?::\s*Season\s*0*(\d+))?(?::\s*"?Episode\s*0*(\d+)"?)\b/i,
  );
  if (!match) return { title: source };

  return {
    title: match[1]?.trim(),
    season: match[2] ? String(Number(match[2])) : undefined,
    episode: match[3] ? String(Number(match[3])) : undefined,
  };
}

function parseRuntimeValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeNumericRuntime(value);
  }

  const cleaned = String(value).trim();
  if (!cleaned) return undefined;

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return normalizeNumericRuntime(Number(cleaned));
  }

  const minutesMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute)/i);
  if (minutesMatch) return Math.round(Number(minutesMatch[1]) * 60);

  const parts = cleaned.match(/\d+/g)?.map(Number);
  if (!parts?.length) return undefined;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return normalizeNumericRuntime(parts[0]);

  return undefined;
}

function normalizeNumericRuntime(value) {
  if (!Number.isFinite(value)) return undefined;
  if (value > 86400) return Math.round(value / 1000);
  if (value <= 300) return Math.round(value * 60);
  return Math.round(value);
}

function findVisibleRuntime() {
  return findVisibleValue(
    ["runtime", "duration", "trt"],
    /(\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?\s*(?:m|min|minutes))/i,
  );
}

function findVisibleDate(labels) {
  return findVisibleValue(
    labels,
    /(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]{2,9}\s+\d{1,2},?\s+\d{4})/,
  );
}

function findVisibleValue(labels, valuePattern) {
  const text = document.body?.innerText;
  if (!text) return undefined;

  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && line.length < 240);

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    const next = lines[i + 1] ?? "";
    const haystack = current.toLowerCase();
    if (!normalizedLabels.some((label) => haystack.includes(label))) continue;

    const currentMatch = current.match(valuePattern);
    if (currentMatch) return currentMatch[1];

    const nextMatch = next.match(valuePattern);
    if (nextMatch) return nextMatch[1];
  }

  return undefined;
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function initWorkplaceListener() {
  const { urls = {} } = await chrome.storage.sync.get("urls");
  const workplace = urls.workplace?.trim();
  if (!workplace || !window.location.href.includes(workplace)) {
    return;
  }
  chrome.runtime.onMessage.addListener(workplaceListener);
}

initWorkplaceListener();
