(() => {
const CONTINUE_PAGE_TEXT =
  "We detected that you recently had an open session for this assignment.";
let pixelogicModulePromise;
let netflixModulePromise;
const LOG_PREFIX = "[Gig Timer]";

function loadPixelogicModule() {
  pixelogicModulePromise ??= import(chrome.runtime.getURL("utils/pixelogic.js"));
  return pixelogicModulePromise;
}

function loadNetflixModule() {
  netflixModulePromise ??= import(chrome.runtime.getURL("utils/netflix.js"));
  return netflixModulePromise;
}

const NETFLIX_CONTRACTOR_DEFAULTS = {
  client: "Netflix",
  contractor: "VSI",
  rate: 7,
};
const PIXELOGIC_CONTRACTOR_DEFAULT = "Pixelogic";
const NETFLIX_AUTHORING_HOST = "netflixstudios.com";
const NETFLIX_TITLE_POLL_INTERVAL_MS = 250;
const NETFLIX_TITLE_WAIT_TIMEOUT_MS = 3000;
const NETFLIX_MEDIA_POLL_INTERVAL_MS = 250;
const NETFLIX_MEDIA_WAIT_TIMEOUT_MS = 12000;
const NETFLIX_RUNTIME_STORAGE_WAIT_TIMEOUT_MS = 120000;
const NETFLIX_RUNTIME_STORAGE_RETRY_ATTEMPTS = 5;
const NETFLIX_RUNTIME_STORAGE_RETRY_DELAY_MS = 1000;

const workplaceListener = (msg, sender, sendResponse) => {
  if (msg.source !== "background.js" || msg.action !== "request-workplace-id") {
    return;
  }

  (async () => {
    try {
      console.log(`${LOG_PREFIX} Workplace metadata requested`, {
        url: window.location.href,
      });
      const data = await getWorkplaceData();
      console.log(`${LOG_PREFIX} Workplace metadata response ready`, {
        id: data?.id,
        taskId: data?.task_id,
        type: typeof data,
      });
      sendResponse({ data });
    } catch (e) {
      console.error("Cannot retrieve workplace metadata:", e);
      sendResponse({ data: getLegacyProjectData() });
    }
  })();

  return true;
};

async function getWorkplaceData() {
  if (isContinuePage()) {
    console.log(`${LOG_PREFIX} Continue page detected`);
    return "__CONTINUE_PAGE__";
  }
  const pixelogic = await loadPixelogicModule();
  const pixelogicProject = pixelogic.scrapePixelogicTimerDocument(
    document,
    window.location.href,
  );
  if (
    pixelogic.isPixelogicCompositionProjectUrl(window.location.href) ||
    pixelogic.isPixelogicOperationsManagerTaskUrl(window.location.href)
  ) {
    console.log(`${LOG_PREFIX} Pixelogic timer metadata scraped`, {
      id: pixelogicProject?.id,
      projectId: pixelogicProject?.project_id,
      taskId: pixelogicProject?.task_id,
      title: pixelogicProject?.title,
    });
    return pixelogicProject;
  }
  if (pixelogicProject) {
    console.log(`${LOG_PREFIX} Pixelogic metadata scraped from document`, {
      id: pixelogicProject?.id,
      taskId: pixelogicProject?.task_id,
    });
    return pixelogicProject;
  }

  const netflix = await loadNetflixModule();
  if (netflix.isNetflixAuthoringUrl(window.location.href)) {
    console.log(`${LOG_PREFIX} Netflix authoring page detected`);
    return getNetflixProjectData();
  }
  console.log(`${LOG_PREFIX} Falling back to legacy project metadata`);
  return getLegacyProjectData();
}

function isContinuePage() {
  return document.body?.innerText?.includes(CONTINUE_PAGE_TEXT) ?? false;
}

function getLegacyProjectData() {
  const title = document.getElementById("header-full-title")?.textContent?.trim();
  return {
    ...getLegacyProjectDefaultsForUrl(window.location.href),
    id: title || window.location.href,
    title: title || document.title || window.location.href,
    workplace_url: window.location.href,
  };
}

async function getNetflixProjectData() {
  const netflix = await loadNetflixModule();
  const requestRef = netflix.getNetflixRequestRefFromUrl(window.location.href);
  const responses = requestRef ? await fetchNetflixMetadata(requestRef) : {};
  const mediaRuntimeSeconds = await waitForNetflixMediaRuntime();
  const info = responses.info ?? responses.projectInfo ?? {};
  const projectInfo = responses.projectInfo ?? {};
  const documentPayload = responses.document?.document ?? responses.document ?? {};
  const documentMeta = documentPayload.meta ?? {};
  const mediaMetadata = responses.mediaMetadata ?? {};
  const runtimeSource = await resolveNetflixRuntimeSource(
    requestRef,
    responses,
    () => findVisibleRuntime(),
  );
  const titleSource = await waitForNetflixProgramTitle(() => {
    const candidates = [
      info.internalTitle,
      projectInfo.internalTitle,
      documentMeta.title,
      documentPayload.title,
      document.title,
    ];
    return (
      firstValue(
        candidates.filter((title) => !isNetflixTitlePlaceholder(title)),
      ) ?? firstValue(candidates)
    );
  });
  const parsedTitle = parseNetflixTitle(titleSource);
  const visibleDueDate = findVisibleDate([
    "due date",
    "date due",
    "deadline",
  ]);

  return {
    ...NETFLIX_CONTRACTOR_DEFAULTS,
    id: requestRef,
    request_ref: requestRef,
    title: parsedTitle.title || titleSource,
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
    runtime: resolveNetflixRuntime(mediaRuntimeSeconds, runtimeSource),
    date_due: firstValue(
      findByKey([info, projectInfo, documentMeta], DUE_DATE_KEYS),
      visibleDueDate,
    ),
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

function getNetflixRuntimeCandidate(responses = {}, visibleRuntime = undefined) {
  const fromResponses = findByKey(
    [
      responses.document,
      responses.document?.document,
      responses.info,
      responses.projectInfo,
      responses.document?.meta,
      responses.document?.document?.meta,
      responses.mediaMetadata,
    ],
    RUNTIME_KEYS,
  );
  return firstValue(
    fromResponses,
    findNetflixRuntimeFromScripts(),
    findNetflixRuntimeFromWindowState(),
    visibleRuntime,
  );
}

async function resolveNetflixRuntimeSource(
  requestRef,
  initialResponses = {},
  getVisibleRuntime = () => undefined,
) {
  const immediateRuntime = getNetflixRuntimeCandidate(
    initialResponses,
    getVisibleRuntime(),
  );
  if (immediateRuntime !== undefined) return immediateRuntime;
  if (!requestRef) return undefined;

  const timeoutAt = Date.now() + NETFLIX_MEDIA_WAIT_TIMEOUT_MS;
  while (Date.now() < timeoutAt) {
    await sleep(NETFLIX_MEDIA_POLL_INTERVAL_MS);
    const freshResponses = await fetchNetflixMetadata(requestRef);
    const nextRuntime = getNetflixRuntimeCandidate(
      freshResponses,
      getVisibleRuntime(),
    );
    if (nextRuntime !== undefined) return nextRuntime;
  }

  return undefined;
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
  "runTimeSeconds",
  "runtimeSeconds",
  "durationSeconds",
  "duration_seconds",
  "programRuntimeSeconds",
  "program_runtime_seconds",
  "trt",
  "mediaRuntime",
  "media_runtime",
  "runtimeInSeconds",
  "runtimeInMinutes",
  "durationInSeconds",
  "durationInMinutes",
  "durationMs",
  "durationMS",
  "lengthInSeconds",
  "lengthInMinutes",
  "mediaLength",
  "mediaLengthInSeconds",
  "programRuntimeInMinutes",
  "runtimeMs",
  "runtimeMS",
  "runtimeMilliseconds",
  "mediaRuntimeMilliseconds",
  "mediaDuration",
  "duration_ms",
  "duration_msec",
  "duration_milliseconds",
  "runtime_ms",
  "runtime_msec",
  "runtime_milliseconds",
];
const DUE_DATE_KEYS = ["dueDate", "dateDue", "deadline", "dueAt", "due_at"];

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
    .replace(/\s+-\s*Originator\s+Studio\s*$/i, "")
    .trim();
  if (!source) return {};

  const segments = source
    .split(":")
    .map((part) => part.trim().replace(/^["']+|["']+$/g, ""))
    .filter(Boolean);

  for (let i = 0; i + 2 < segments.length; i++) {
    const seasonMatch = segments[i + 1]?.match(/^Season\s*0*(\d+)$/i);
    const episodeMatch = segments[i + 2]?.match(/^"?Episode\s*0*(\d+)"/i);
    const episodeMatchLoose = segments[i + 2]?.match(/^"?Episode\s*0*(\d+)$/i);

    if (seasonMatch && (episodeMatch || episodeMatchLoose)) {
      return {
        title: segments.slice(0, i + 1).join(": "),
        season: String(Number(seasonMatch[1])),
        episode: String(
          Number((episodeMatch || episodeMatchLoose)?.[1] ?? ""),
        ),
      };
    }
  }

  const match = source.match(
    /\bS(?:eason)?\s*0*(\d+)\b.*?\bE(?:p(?:isode)?)?\s*0*(\d+)\b/i,
  );
  if (!match) return { title: source };

  return {
    title: source.replace(match[0], "").replace(/[:\s-]+$/, "").trim(),
    season: match[1] ? String(Number(match[1])) : undefined,
    episode: match[2] ? String(Number(match[2])) : undefined,
  };
}

async function waitForNetflixMediaRuntime() {
  const immediate = getNetflixMediaRuntime();
  if (immediate !== undefined) return immediate;

  const timeoutAt = Date.now() + NETFLIX_MEDIA_WAIT_TIMEOUT_MS;
  while (Date.now() < timeoutAt) {
    await sleep(NETFLIX_MEDIA_POLL_INTERVAL_MS);
    const mediaRuntimeSeconds = getNetflixMediaRuntime();
    if (mediaRuntimeSeconds !== undefined) return mediaRuntimeSeconds;
  }

  return undefined;
}

function getNetflixMediaRuntime() {
  const playerRuntime = getNetflixRuntimeFromPlayer(document);
  if (playerRuntime !== undefined) return playerRuntime;

  const directRuntime = getNetflixMediaRuntimeFromDocument(document);
  if (directRuntime !== undefined) return directRuntime;

  return getNetflixMediaRuntimeFromIframes(document);
}

function getNetflixRuntimeFromPlayer(doc) {
  const playerRegions = getElementsIncludingShadowRoot(
    doc,
    "[aria-label='Media Player' i]",
  );
  for (const player of playerRegions) {
    const runtime = parseNetflixPlayerTimecodes(player.textContent);
    if (runtime !== undefined) return runtime;
  }

  const durationLabels = getElementsIncludingShadowRoot(
    doc,
    "[aria-label*='Video length' i]",
  );

  for (const element of durationLabels) {
    const runtime = parseNetflixSpokenRuntime(
      element.getAttribute?.("aria-label"),
    );
    if (runtime !== undefined) return runtime;
  }

  return undefined;
}

function parseNetflixSpokenRuntime(value) {
  const source = String(value ?? "");
  const markerIndex = source.toLowerCase().indexOf("video length");
  if (markerIndex < 0) return undefined;

  const durationText = source.slice(markerIndex + "video length".length);
  const hours = Number(durationText.match(/(\d+(?:\.\d+)?)\s*hours?/i)?.[1] ?? 0);
  const minutes = Number(
    durationText.match(/(\d+(?:\.\d+)?)\s*minutes?/i)?.[1] ?? 0,
  );
  const seconds = Number(
    durationText.match(/(\d+(?:\.\d+)?)\s*seconds?/i)?.[1] ?? 0,
  );
  const hasDuration = /\d+(?:\.\d+)?\s*(?:hours?|minutes?|seconds?)/i.test(
    durationText,
  );

  if (!hasDuration) return undefined;

  const runtime = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(runtime) && runtime > 0 ? runtime : undefined;
}

function parseNetflixPlayerTimecodes(value) {
  const source = String(value ?? "");
  const endTimecodeMatch = source.match(
    /\/\s*(\d{1,2}):([0-5]\d):([0-5]\d):(\d{2})(?!\d)/,
  );
  const endRuntime = parseNetflixTimecodeMatch(endTimecodeMatch);
  if (endRuntime !== undefined) return endRuntime;

  const timecodePattern =
    /(?:^|[^A-Za-z0-9])(\d{1,2}):([0-5]\d):([0-5]\d):(\d{2})(?!\d)/g;
  const runtimes = [];

  for (const match of source.matchAll(timecodePattern)) {
    const runtime = parseNetflixTimecodeMatch(match);
    if (runtime !== undefined) runtimes.push(runtime);
  }

  return runtimes.length ? Math.max(...runtimes) : undefined;
}

function parseNetflixTimecodeMatch(match) {
  if (!match) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const frames = Number(match[4]);
  if (hours >= 24 || frames >= 24) return undefined;

  const runtime = hours * 3600 + minutes * 60 + seconds + frames / 24;
  return Number.isFinite(runtime) && runtime > 0 ? runtime : undefined;
}

async function syncNetflixRuntimeToStorage(netflix) {
  try {
    const runtime = await waitForNetflixPlayerRuntime();
    if (runtime === undefined) {
      console.warn(`${LOG_PREFIX} Netflix player runtime was not found`);
      return;
    }

    const requestRef = netflix.getNetflixRequestRefFromUrl(window.location.href);
    for (
      let attempt = 1;
      attempt <= NETFLIX_RUNTIME_STORAGE_RETRY_ATTEMPTS;
      attempt += 1
    ) {
      const response = await chrome.runtime.sendMessage({
        action: "store-netflix-runtime",
        requestRef,
        runtime,
        source: "workplace.js",
        workplaceUrl: window.location.href,
      });

      if (response?.stored) {
        console.log(`${LOG_PREFIX} Netflix runtime storage confirmed`, {
          runtime,
        });
        return;
      }

      if (attempt < NETFLIX_RUNTIME_STORAGE_RETRY_ATTEMPTS) {
        await sleep(NETFLIX_RUNTIME_STORAGE_RETRY_DELAY_MS);
      }
    }

    console.warn(`${LOG_PREFIX} Netflix runtime could not be stored`, {
      runtime,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Netflix runtime storage failed`, error);
  }
}

async function waitForNetflixPlayerRuntime() {
  const immediate = getNetflixRuntimeFromPlayer(document);
  if (immediate !== undefined) return immediate;

  const timeoutAt = Date.now() + NETFLIX_RUNTIME_STORAGE_WAIT_TIMEOUT_MS;
  while (Date.now() < timeoutAt) {
    await sleep(NETFLIX_MEDIA_POLL_INTERVAL_MS);
    const runtime = getNetflixRuntimeFromPlayer(document);
    if (runtime !== undefined) return runtime;
  }

  return undefined;
}

function getNetflixMediaRuntimeFromDocument(doc) {
  const mediaElements = getElementsIncludingShadowRoot(doc, "video, audio");
  for (const media of mediaElements) {
    const candidates = [
      { value: media.duration, unit: "seconds" },
      { value: media.getAttribute?.("duration"), unit: "seconds" },
      { value: media.getAttribute?.("data-duration"), unit: "seconds" },
      { value: media.getAttribute?.("data-duration-ms"), unit: "milliseconds" },
      { value: media.getAttribute?.("data-media-duration"), unit: "milliseconds" },
      { value: media.getAttribute?.("data-runtime"), unit: "seconds" },
      { value: media.getAttribute?.("data-video-duration"), unit: "seconds" },
      { value: media.dataset?.duration, unit: "seconds" },
      { value: media.dataset?.durationMs, unit: "milliseconds" },
    ];

    for (const candidate of candidates) {
      const normalized = normalizeMediaDurationToSeconds(candidate.value, candidate.unit);
      if (normalized !== undefined) return normalized;
    }
  }

  const dataRuntimeElements = getElementsIncludingShadowRoot(
    doc,
    "[duration], [data-duration], [data-duration-ms], [data-media-duration], [data-runtime], [data-video-duration]",
  );

  for (const element of dataRuntimeElements) {
    const candidates = [
      { value: element.getAttribute?.("duration"), unit: "seconds" },
      { value: element.getAttribute?.("data-duration"), unit: "seconds" },
      { value: element.getAttribute?.("data-duration-ms"), unit: "milliseconds" },
      { value: element.getAttribute?.("data-media-duration"), unit: "seconds" },
      { value: element.getAttribute?.("data-runtime"), unit: "seconds" },
      { value: element.getAttribute?.("data-video-duration"), unit: "seconds" },
      { value: element.textContent?.trim(), unit: "seconds" },
    ];

    for (const candidate of candidates) {
      const normalized = normalizeMediaDurationToSeconds(candidate.value, candidate.unit);
      if (normalized !== undefined) return normalized;
    }
  }

  return undefined;
}

function getElementsIncludingShadowRoot(root, selector, depth = 0) {
  if (!root || !root.querySelectorAll) return [];
  const maxDepth = 2;
  const elements = Array.from(root.querySelectorAll(selector));

  if (depth >= maxDepth) return elements;

  const shadowRoots = Array.from(root.querySelectorAll("*")).filter(
    (node) => !!node.shadowRoot,
  );
  for (const node of shadowRoots) {
    elements.push(...getElementsIncludingShadowRoot(node.shadowRoot, selector, depth + 1));
  }

  return elements;
}

function getNetflixMediaRuntimeFromIframes(doc, depth = 0) {
  if (depth > 1) return undefined;

  const iframes = doc.querySelectorAll?.("iframe") ?? [];
  for (const iframe of iframes) {
    try {
      const frameDoc = iframe.contentDocument;
      if (!frameDoc) continue;

      const runtime = getNetflixMediaRuntimeFromDocument(frameDoc);
      if (runtime !== undefined) return runtime;

      const nestedRuntime = getNetflixMediaRuntimeFromIframes(frameDoc, depth + 1);
      if (nestedRuntime !== undefined) return nestedRuntime;
    } catch {
      continue;
    }
  }

  return undefined;
}

function findNetflixRuntimeFromScripts() {
  const scripts =
    document.querySelectorAll?.(
      "script[type='application/ld+json'], script[type='application/json'], script:not([type])",
    ) ?? [];
  for (const script of scripts) {
    const body = script.textContent?.trim();
    if (!body) continue;

    try {
      const parsed = JSON.parse(body);
      const scriptValue = findByKey([parsed], RUNTIME_KEYS);
      if (scriptValue !== undefined) return scriptValue;
    } catch {
      continue;
    }
  }

  return undefined;
}

function findNetflixRuntimeFromWindowState() {
  const candidates = [
    window.__NEXT_DATA__?.props?.pageProps,
    window.__NEXT_DATA__,
    window.__NUXT__?.state,
    window.__NUXT__,
    window.__INITIAL_STATE__,
    window.__APOLLO_STATE__,
    window.__PRELOADED_STATE__,
    window.__REDUX_STATE__,
    window.__INITIAL_DATA__,
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
  ];

  for (const candidate of candidates) {
    const runtime = findRuntimeInObject(candidate);
    if (runtime !== undefined) return runtime;
  }

  return undefined;
}

function findRuntimeInObject(source, depth = 0) {
  if (!source || depth > 8) return undefined;

  if (Array.isArray(source)) {
    for (const item of source) {
      const value = findRuntimeInObject(item, depth + 1);
      if (value !== undefined) return value;
    }

    return undefined;
  }

  if (typeof source !== "object") return undefined;

  for (const [key, value] of Object.entries(source)) {
    if (typeof key !== "string") continue;
    if (!isRuntimeLikeKey(key)) continue;
    const runtimeValue = parseRuntimeValue(value);
    if (runtimeValue !== undefined) return runtimeValue;
  }

  for (const value of Object.values(source)) {
    const nested = findRuntimeInObject(value, depth + 1);
    if (nested !== undefined) return nested;
  }

  return undefined;
}

function isRuntimeLikeKey(rawKey) {
  const key = rawKey.toLowerCase();
  return (
    key.includes("runtime") ||
    key.includes("duration") ||
    key === "trt" ||
    key.includes("length") ||
    key.includes("mediaruntime") ||
    key.includes("medialength")
  );
}

async function waitForNetflixProgramTitle(resolveTitle) {
  const initialTitle = resolveTitle();
  if (!isNetflixTitlePlaceholder(initialTitle)) {
    return initialTitle;
  }

  const timeoutAt = Date.now() + NETFLIX_TITLE_WAIT_TIMEOUT_MS;
  while (Date.now() < timeoutAt) {
    await sleep(NETFLIX_TITLE_POLL_INTERVAL_MS);
    const title = resolveTitle();
    if (!isNetflixTitlePlaceholder(title)) {
      return title;
    }
  }

  return initialTitle;
}

function isNetflixTitlePlaceholder(title) {
  const normalized = String(title ?? "")
    .replace(/\s+-\s+Authoring\s*$/i, "")
    .replace(/\s+-\s*Originator\s+Studio\s*$/i, "")
    .trim()
    .toLowerCase();
  return !normalized || normalized === "untitled";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveNetflixRuntime(mediaRuntimeSeconds, fallbackRuntime) {
  const mediaSeconds = normalizeMediaDurationToSeconds(mediaRuntimeSeconds);
  if (mediaSeconds !== undefined) return mediaSeconds;
  return parseRuntimeValue(fallbackRuntime);
}

function normalizeMediaDurationToSeconds(value, unitHint = "auto") {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "object") {
    const nested = parseRuntimeValue(value);
    if (nested !== undefined) return normalizeMediaDurationToSeconds(nested, unitHint);
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    if (unitHint === "milliseconds") return Math.round(value / 1000);
    return Math.round(value);
  }

  const parsed = parseRuntimeStringToSeconds(value, unitHint);
  if (parsed !== undefined) return parsed;

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  if (unitHint === "milliseconds") return Math.round(numeric / 1000);
  if (unitHint === "minutes") return Math.round(numeric * 60);
  return numeric > 86400 ? Math.round(numeric / 1000) : Math.round(numeric);
}

function parseRuntimeStringToSeconds(value, unitHint = "auto") {
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  const asLower = trimmed.toLowerCase();
  const isoMatch = asLower.match(
    /^pt(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/i,
  );
  if (isoMatch) {
    const hours = Number(isoMatch[1] ?? 0);
    const minutes = Number(isoMatch[2] ?? 0);
    const seconds = Number(isoMatch[3] ?? 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
      return undefined;
    }

    return Math.round(hours * 3600 + minutes * 60 + seconds);
  }

  const timeMatch = asLower.match(
    /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,3}))?\s*$/,
  );
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const seconds = Number(timeMatch[3] ?? 0);
    if (timeMatch[3] !== undefined) {
      return Math.max(0, hours * 3600 + minutes * 60 + seconds);
    }
    if (hours >= 0 && minutes >= 0) return Math.max(0, hours * 60 + minutes);
  }

  const unitMatch = asLower.match(
    /^(\d+(?:\.\d+)?)\s*(ms|msec|milliseconds|s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s*$/i,
  );
  if (unitMatch) {
    const amount = Number(unitMatch[1]);
    if (!Number.isFinite(amount) || amount <= 0) return undefined;
    const unit = unitMatch[2].toLowerCase();
    if (unit.startsWith("h")) return Math.round(amount * 3600);
    if (unit.startsWith("msec") || unit === "ms" || unit.startsWith("ms")) {
      return Math.round(amount / 1000);
    }
    if (unit.startsWith("m")) return Math.round(amount * 60);
    return Math.round(amount);
  }

  const pureNumberMatch = asLower.match(/^\d+(?:\.\d+)?$/);
  if (!pureNumberMatch) return undefined;

  const parsed = Number(pureNumberMatch[0]);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  if (unitHint === "milliseconds") return Math.round(parsed / 1000);
  if (unitHint === "minutes") return Math.round(parsed * 60);
  return parsed > 86400 ? Math.round(parsed / 1000) : Math.round(parsed);
}

function getLegacyProjectDefaultsForUrl(url) {
  const normalized = String(url ?? "").toLowerCase();

  if (normalized.includes(NETFLIX_AUTHORING_HOST)) {
    return NETFLIX_CONTRACTOR_DEFAULTS;
  }
  if (normalized.includes("pixelogic")) {
    return { contractor: PIXELOGIC_CONTRACTOR_DEFAULT };
  }
  return {};
}

function parseRuntimeValue(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object") {
    const objectValue = parseRuntimeValue(
      value.runtime ??
        value.duration ??
        value.seconds ??
        value.runtimeSeconds ??
        value.durationSeconds ??
        value.runtimeInSeconds ??
        value.durationInSeconds ??
        value.runtimeInMinutes ??
        value.durationInMinutes ??
        value.lengthInSeconds ??
        value.runtimeMs ??
        value.durationMs ??
        value.lengthMs ??
        value.mediaRuntime ??
        value.media_length ??
        value.mediaLength ??
        value.value,
    );
    if (objectValue !== undefined) return objectValue;
    return undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return normalizeNumericRuntime(value);
  }

  const cleaned = String(value).trim();
  if (!cleaned) return undefined;

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return normalizeNumericRuntime(Number(cleaned));
  }

  const durationValue = parseRuntimeStringToSeconds(cleaned);
  if (durationValue !== undefined) return durationValue;

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

async function initWorkplaceListener() {
  const [pixelogic, netflix] = await Promise.all([
    loadPixelogicModule(),
    loadNetflixModule(),
  ]);
  const { urls = {} } = await chrome.storage.local.get("urls");
  const workplace = urls.workplace?.trim();
  if (
    !pixelogic.isProjectMetadataPageUrl(window.location.href, { workplace }) &&
    !netflix.isNetflixAuthoringUrl(window.location.href)
  ) {
    return;
  }
  console.log(`${LOG_PREFIX} Workplace content script active`, {
    url: window.location.href,
  });
  chrome.runtime.onMessage.addListener(workplaceListener);
  if (netflix.isNetflixAuthoringUrl(window.location.href)) {
    void syncNetflixRuntimeToStorage(netflix);
  }
}

initWorkplaceListener();
})();
