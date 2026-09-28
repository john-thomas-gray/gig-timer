const PIXELOGIC_HOST = "phelix.pixelogicmedia.com";

const DEFAULT_PIPELINE_URLS = Object.freeze({
  assignments: `https://${PIXELOGIC_HOST}/composition-editor`,
  workplace: `https://${PIXELOGIC_HOST}/operations-manager/tasks`,
});
const OPERATIONS_MANAGER_TASK_PATH_PATTERN =
  /^\/operations-manager\/tasks\/(\d+)$/;

const PIXELOGIC_PROJECT_DEFAULTS = Object.freeze({
  contractor: "Pixelogic",
  rate: 6,
});

const KNOWN_LABEL_TEXTS = [
  "Assignee(s)",
  "Completion Date",
  "Due Date",
  "Estimated Delivery Date",
  "Estimated Workability Date",
  "Input Requirements",
  "Job Configuration(s)",
  "Output Requirements",
  "Partner/Office",
  "Priority",
  "Project Managers",
  "Start Date",
  "Status",
  "Task Configuration(s)",
  "Task Language",
  "Task Tags",
  "Task Type",
  "Task Workability Date",
];

const KNOWN_LABELS = new Set(KNOWN_LABEL_TEXTS.map(normalizeLabel));

const LANGUAGE_NAMES = [
  "Arabic",
  "Chinese",
  "Czech",
  "Danish",
  "Dutch",
  "English",
  "Finnish",
  "French",
  "German",
  "Greek",
  "Hebrew",
  "Hindi",
  "Hungarian",
  "Indonesian",
  "Italian",
  "Japanese",
  "Korean",
  "Malay",
  "Norwegian",
  "Polish",
  "Portuguese",
  "Romanian",
  "Russian",
  "Spanish",
  "Swedish",
  "Thai",
  "Turkish",
  "Ukrainian",
  "Vietnamese",
].join("|");
const LOCALE_PATTERN = new RegExp(
  `\\b(?:${LANGUAGE_NAMES})(?:\\s+[A-Z][A-Za-z]+)?\\s*\\([^)]+\\)`,
);

export function getPipelineUrlDefaults() {
  return { ...DEFAULT_PIPELINE_URLS };
}

export function detectPixelogicPage(url, configuredUrls = {}) {
  if (parseUrl(url)?.hostname !== PIXELOGIC_HOST) return undefined;
  const isCompositionProject = isPixelogicCompositionProjectUrl(url);
  const isCompositionEditor = isPixelogicCompositionEditorUrl(url);
  const isTask = isPixelogicOperationsManagerTaskUrl(url);
  const isLegacyWorkplace =
    !isCompositionEditor && isWorkplaceUrl(url, configuredUrls.workplace?.trim());
  return {
    site: "pixelogic",
    isAssignmentsPage: isAssignmentsUrl(url, configuredUrls.assignments?.trim()),
    isProjectMetadataPage: isCompositionProject || isTask || isLegacyWorkplace,
    isTimerPage: isCompositionProject || (!isTask && isLegacyWorkplace),
    metadataSource: isCompositionProject ? "composition" : "workplace",
  };
}

export function isAssignmentsUrl(url, configuredUrl) {
  return matchesPipelineUrl(url, configuredUrl, DEFAULT_PIPELINE_URLS.assignments);
}

export function isWorkplaceUrl(url, configuredUrl) {
  const parsed = parseUrl(url);
  if (
    parsed?.hostname === PIXELOGIC_HOST &&
    parsed.pathname.startsWith("/operations-manager/tasks")
  ) {
    return isPixelogicOperationsManagerTaskUrl(url);
  }

  return matchesPipelineUrl(url, configuredUrl, DEFAULT_PIPELINE_URLS.workplace);
}

export function isPixelogicCompositionEditorUrl(url) {
  const parsed = parseUrl(url);
  return (
    parsed?.hostname === PIXELOGIC_HOST &&
    parsed.pathname.startsWith("/composition-editor")
  );
}

export function isPixelogicCompositionProjectUrl(url) {
  const parsed = parseUrl(url);
  const hashRoute = getHashRouteUrl(parsed);

  return (
    parsed?.hostname === PIXELOGIC_HOST &&
    (isCompositionProjectPath(parsed.pathname) ||
      (parsed.pathname.startsWith("/composition-editor") &&
        isHashCompositionProjectPath(hashRoute?.pathname)))
  );
}

export function isPixelogicOperationsManagerTaskUrl(url) {
  const parsed = parseUrl(url);
  return (
    parsed?.hostname === PIXELOGIC_HOST &&
    OPERATIONS_MANAGER_TASK_PATH_PATTERN.test(parsed.pathname)
  );
}

export function isTimerPageUrl(url, configuredUrls = {}) {
  if (isPixelogicOperationsManagerTaskUrl(url)) return false;

  return (
    isWorkplaceUrl(url, configuredUrls?.workplace) ||
    isPixelogicCompositionProjectUrl(url)
  );
}

export function isProjectMetadataPageUrl(url, configuredUrls = {}) {
  return (
    isTimerPageUrl(url, configuredUrls) ||
    isPixelogicOperationsManagerTaskUrl(url)
  );
}

export function shouldInjectLegacyAssignmentsBridge(url, configuredAssignmentsUrl) {
  return (
    isAssignmentsUrl(url, configuredAssignmentsUrl) &&
    !isPixelogicCompositionEditorUrl(url)
  );
}

export function collectPixelogicDocumentText(doc = document) {
  const chunks = [doc.body?.innerText];

  doc
    .querySelectorAll?.("input, textarea, [contenteditable='true']")
    ?.forEach((element) => {
      const value = getElementValue(element);
      if (!value) return;

      const label = findNearbyFieldLabel(element);
      chunks.push([label, value].filter(Boolean).join("\n"));
    });

  return chunks.filter(Boolean).join("\n");
}

function getElementValue(element) {
  const candidates = [
    element.value,
    element.getAttribute?.("value"),
    element.getAttribute?.("aria-valuetext"),
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title"),
    element.textContent,
  ];

  for (const candidate of candidates) {
    const value = cleanString(candidate);
    if (!value || /^select date$/i.test(value)) continue;
    return value;
  }

  return undefined;
}

export function parsePixelogicCompositionAssignmentsText(text, url) {
  const lines = toLines(text);
  const titleParts = findCompositionTitle(lines);

  if (!titleParts?.title) {
    const fallbackProject = buildCompositionProjectFromUrl(url);
    return fallbackProject ? [fallbackProject] : [];
  }

  const { frameRate, runtime } = findCompositionTiming(lines);
  const taskId = getTaskIdFromUrl(url);
  const projectId = getProjectIdFromCompositionUrl(url);
  const asset = findFirstAssetReference(text);
  const language = findLanguage(lines);
  const project = compactObject({
    ...PIXELOGIC_PROJECT_DEFAULTS,
    assignment_url: url,
    asset_id: asset?.assetId,
    asset_version_id: asset?.versionId,
    client: findClient(text),
    episode: titleParts.episode,
    frame_rate: frameRate,
    language,
    project_id: projectId,
    runtime,
    season: titleParts.season,
    task_id: taskId,
    title: titleParts.title,
    workplace_url: buildWorkplaceUrlFromTaskId(taskId),
  });

  return [project];
}

function buildCompositionProjectFromUrl(url) {
  const taskId = getTaskIdFromUrl(url);
  const projectId = getProjectIdFromCompositionUrl(url);
  if (!taskId && !projectId) return undefined;

  const fallbackTitle = projectId
    ? `Pixelogic Project ${projectId}`
    : `Pixelogic Task ${taskId}`;

  return compactObject({
    ...PIXELOGIC_PROJECT_DEFAULTS,
    assignment_url: url,
    project_id: projectId,
    task_id: taskId,
    title: fallbackTitle,
    workplace_url: buildWorkplaceUrlFromTaskId(taskId),
  });
}

export function parsePixelogicOperationsManagerTaskText(text, url) {
  const lines = toLines(text);
  const titleParts = findWorkplaceTitle(lines);
  const taskId = getTaskIdFromUrl(url) ?? findTaskId(text);
  const asset = findFirstAssetReference(text);

  return compactObject({
    ...PIXELOGIC_PROJECT_DEFAULTS,
    asset_id: asset?.assetId,
    asset_version_id: asset?.versionId,
    client: findClient(text),
    date_due:
      findLabelValue(lines, "Due Date") ??
      findLabelValue(lines, "Estimated Delivery Date"),
    episode: titleParts?.episode,
    language: findLabelValue(lines, "Task Language") ?? findLanguage(lines),
    season: titleParts?.season,
    task_id: taskId,
    task_type: findLabelValue(lines, "Task Type"),
    title: titleParts?.title,
    workplace_url: url ?? buildWorkplaceUrlFromTaskId(taskId),
  });
}

export function scrapePixelogicCompositionAssignmentsDocument(
  doc = document,
  url = window.location.href,
) {
  const projects = parsePixelogicCompositionAssignmentsText(
    collectPixelogicDocumentText(doc),
    url,
  );
  const runtime = getMediaRuntime(doc);

  if (runtime !== undefined) {
    return projects.map((project) => ({ ...project, runtime }));
  }

  return projects;
}

export function scrapePixelogicOperationsManagerTaskDocument(
  doc = document,
  url = window.location.href,
) {
  return parsePixelogicOperationsManagerTaskText(
    collectPixelogicDocumentText(doc),
    url,
  );
}

export function scrapePixelogicTimerDocument(
  doc = document,
  url = window.location.href,
) {
  if (isPixelogicCompositionProjectUrl(url)) {
    return scrapePixelogicCompositionAssignmentsDocument(doc, url)[0];
  }

  if (isPixelogicOperationsManagerTaskUrl(url)) {
    return scrapePixelogicOperationsManagerTaskDocument(doc, url);
  }

  return undefined;
}

function matchesPipelineUrl(url, configuredUrl, defaultUrl) {
  if (!url) return false;

  const patterns = [
    canonicalizePixelogicPipelineUrl(configuredUrl),
    defaultUrl,
  ].filter(Boolean);

  return patterns.some((pattern) => url.includes(pattern));
}

function canonicalizePixelogicPipelineUrl(configuredUrl) {
  const cleaned = cleanString(configuredUrl);
  if (!cleaned) return undefined;

  const parsed = parseUrl(cleaned);
  if (parsed?.hostname !== PIXELOGIC_HOST) return cleaned;

  if (parsed.pathname.startsWith("/composition-editor")) {
    return DEFAULT_PIPELINE_URLS.assignments;
  }

  if (parsed.pathname.startsWith("/operations-manager/tasks")) {
    return DEFAULT_PIPELINE_URLS.workplace;
  }

  return cleaned;
}

function findNearbyFieldLabel(element) {
  const label = cleanString(element.closest?.("label")?.textContent);
  if (label) return label;

  const nearbyLabel = findPreviousSiblingLabel(element);
  if (nearbyLabel) return nearbyLabel;

  const formItem = element.closest?.(
    "[class*='form'], [class*='Form'], [class*='field'], [class*='Field']",
  );
  const formItemLabel = formItem?.querySelector?.(
    "label, [class*='label'], [class*='Label']",
  );
  const formItemLabelText = cleanString(formItemLabel?.textContent);
  if (formItemLabelText) return formItemLabelText;

  const ariaLabel = cleanString(element.getAttribute?.("aria-label"));
  if (
    ariaLabel &&
    ariaLabel !== cleanString(element.value) &&
    !looksLikeControlValue(ariaLabel)
  ) {
    return ariaLabel;
  }

  return undefined;
}

function findPreviousSiblingLabel(element) {
  let current = element;

  for (let depth = 0; current && depth < 6; depth += 1) {
    let sibling = current.previousElementSibling;
    while (sibling) {
      const label = extractKnownLabel(sibling.textContent);
      if (label) return label;
      sibling = sibling.previousElementSibling;
    }
    current = current.parentElement;
  }

  return undefined;
}

function extractKnownLabel(text) {
  const normalizedText = normalizeLabel(text);
  if (!normalizedText) return undefined;

  return KNOWN_LABEL_TEXTS.find((label) =>
    normalizedText.includes(normalizeLabel(label)),
  );
}

function findCompositionTitle(lines) {
  for (const line of lines) {
    if (line.includes("--")) continue;
    if (isCompositionPlayerNotification(line)) continue;
    const titleParts = parsePixelogicTitle(line);
    if (titleParts?.title) return titleParts;
  }

  return undefined;
}

function findWorkplaceTitle(lines) {
  const inputRequirementsIndex = lines.findIndex((line) =>
    /^Input Requirements:?$/i.test(line),
  );

  if (inputRequirementsIndex >= 0) {
    for (let i = inputRequirementsIndex + 1; i < lines.length; i += 1) {
      if (/^Output Requirements:?$/i.test(lines[i])) break;

      const titleParts = parsePixelogicTitle(lines[i]);
      if (titleParts?.title) return titleParts;
    }
  }

  for (const line of lines) {
    const titleParts = parsePixelogicTitle(line);
    if (titleParts?.title) return titleParts;
  }

  return undefined;
}

function parsePixelogicTitle(rawTitle) {
  const source = cleanString(rawTitle);
  if (!source) return undefined;

  const underscoreMatch = source.match(
    /^(.*?)_Season\s*0*(\d+)(?:_(?:E)?0*\d+)?(?:_Episode\s*0*(\d+))?/i,
  );
  if (underscoreMatch) {
    const episodeCode = findEpisodeCode(source);
    return compactObject({
      episode: normalizeNumber(episodeCode ?? underscoreMatch[3]),
      season: normalizeNumber(underscoreMatch[2]),
      title: cleanTitle(underscoreMatch[1].replace(/_/g, " ")),
    });
  }

  const colonMatch = source.match(
    /^(.*?):\s*Season\s*0*(\d+)\s*:\s*Episode\s*0*(\d+)/i,
  );
  if (colonMatch) {
    return compactObject({
      episode: normalizeNumber(colonMatch[3]),
      season: normalizeNumber(colonMatch[2]),
      title: cleanTitle(colonMatch[1]),
    });
  }

  return undefined;
}

function isCompositionPlayerNotification(line) {
  return /^A new version of asset\b/i.test(cleanString(line) ?? "");
}

function cleanTitle(value) {
  let cleaned = cleanString(value);
  if (!cleaned) return undefined;

  cleaned = cleaned.replace(
    /^.*\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?\s*\([A-Z]{2}\)/,
    "",
  );
  cleaned = cleaned.replace(/\bBroadcast_Original\b.*$/i, "");
  cleaned = cleaned.replace(/\bVIP\b.*$/i, "");

  if (cleaned.includes(")")) {
    cleaned = cleaned.slice(cleaned.lastIndexOf(")") + 1);
  }

  return cleanString(cleaned);
}

function findCompositionTiming(lines) {
  const frameRate = lines.find((line) => /^\d{2,3}\.\d{3}$/.test(line));
  const timecodes = lines.filter((line) => /^\d{2}:\d{2}:\d{2}:\d{2}$/.test(line));
  let runtime;
  // These counters show playback position and end, not the media's start and end.
  if (timecodes[0] === "00:00:00:00" && timecodes[1]) {
    const [hours, minutes, seconds, frames] = timecodes[1].split(":").map(Number);
    runtime = normalizeRuntimeSeconds(
      hours * 3600 + minutes * 60 + seconds + frames / (Number(frameRate) || 24),
    );
  }
  return { frameRate, runtime };
}

function getMediaRuntime(doc) {
  const mediaElements = doc.querySelectorAll?.("video, audio") ?? [];

  for (const element of mediaElements) {
    for (const value of [
      element.duration,
      element.getAttribute?.("duration"),
      element.getAttribute?.("data-duration"),
    ]) {
      const runtime = normalizeRuntimeSeconds(value);
      if (runtime !== undefined) return runtime;
    }
  }

  return undefined;
}

function normalizeRuntimeSeconds(value) {
  if (value === undefined || value === null) return undefined;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds);
}

function findFirstAssetReference(text) {
  const match = cleanString(text)?.match(/\[\s*(OM-\d+)\s*(?:\/\s*(\d+))?/);
  if (!match) return undefined;

  return {
    assetId: match[1],
    versionId: match[2],
  };
}

function findLanguage(lines) {
  for (const line of lines) {
    const match = line.match(LOCALE_PATTERN);
    if (match) return match[0];
  }

  return undefined;
}

function findLabelValue(lines, label) {
  const normalizedLabel = normalizeLabel(label);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const normalizedLine = normalizeLabel(line);
    if (
      normalizedLine !== normalizedLabel &&
      !line.toLowerCase().startsWith(`${normalizedLabel}:`)
    ) continue;

    const inlineValue = cleanString(line.replace(/^[^:]+:\s*/, ""));
    if (
      inlineValue &&
      normalizeLabel(inlineValue) !== normalizedLabel &&
      !inlineValue.endsWith(":")
    ) {
      return inlineValue;
    }

    for (let next = i + 1; next < lines.length; next += 1) {
      if (looksLikeLabel(lines[next])) break;
      const value = cleanString(lines[next]);
      if (value) return value;
    }
  }

  return undefined;
}

function findClient(text) {
  const lines = toLines(text);
  const labeledClient = findLabelValue(lines, "Client");
  if (labeledClient) return toDisplayName(labeledClient);

  const taskInstructions = cleanString(text.split(/Task Instructions\s*:?/i)[1]);
  const match = taskInstructions?.match(/^([A-Z][A-Z0-9 &'./+]+?)\s*[-–—]/i);
  if (!match) return undefined;

  return toDisplayName(match[1]);
}

function toDisplayName(value) {
  return cleanString(value)
    ?.toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\b(Hbo|Us|Uk|Ai|Qc|Ad)\b/g, (word) => word.toUpperCase());
}

function findTaskId(text) {
  return cleanString(text)?.match(/#\s*(\d{5,})/)?.[1];
}

function findEpisodeCode(text) {
  return cleanString(text)?.match(/(?:^|[_\s-])E0*(\d+)(?=$|[_\s-])/i)?.[1];
}

function getTaskIdFromUrl(url) {
  const parsed = parseUrl(url);
  const hashRoute = getHashRouteUrl(parsed);

  return (
    parsed?.searchParams.get("taskId") ??
    hashRoute?.searchParams.get("taskId") ??
    parsed?.pathname.match(OPERATIONS_MANAGER_TASK_PATH_PATTERN)?.[1] ??
    hashRoute?.pathname.match(OPERATIONS_MANAGER_TASK_PATH_PATTERN)?.[1]
  );
}

function getProjectIdFromCompositionUrl(url) {
  const parsed = parseUrl(url);
  return (
    getCompositionProjectIdFromPath(parsed?.pathname) ??
    getCompositionProjectIdFromPath(getHashRouteUrl(parsed)?.pathname)
  );
}

export function getPixelogicProjectIdentity(project) {
  const urls = [project?.assignment_url, project?.workplace_url].filter(
    (url) => parseUrl(url)?.hostname === PIXELOGIC_HOST,
  );
  if (!urls.length && project?.contractor !== "Pixelogic") return {};

  return {
    taskId: cleanString(project.task_id) ?? urls.map(getTaskIdFromUrl).find(Boolean),
    projectId:
      cleanString(project.project_id) ??
      urls.map(getProjectIdFromCompositionUrl).find(Boolean),
  };
}

function buildWorkplaceUrlFromTaskId(taskId) {
  if (!taskId) return undefined;
  return `${DEFAULT_PIPELINE_URLS.workplace}/${taskId}`;
}

function toLines(text) {
  return String(text ?? "")
    .split(/\n+/)
    .map((line) => cleanString(line))
    .filter(Boolean);
}

function looksLikeLabel(line) {
  return line.endsWith(":") || KNOWN_LABELS.has(normalizeLabel(line));
}

function looksLikeControlValue(value) {
  const cleaned = cleanString(value);
  return /^\d{4}-\d{2}-\d{2}/.test(cleaned ?? "");
}

function normalizeLabel(value) {
  return cleanString(value)
    ?.replace(/:$/, "")
    .toLowerCase();
}

function normalizeNumber(value) {
  const match = cleanString(value)?.match(/\d+/);
  if (!match) return undefined;
  return String(Number(match[0]));
}

function cleanString(value) {
  if (value === undefined || value === null) return undefined;
  const cleaned = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function compactObject(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  );
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function getHashRouteUrl(parsed) {
  const hash = parsed?.hash?.replace(/^#/, "").replace(/^!/, "");
  if (!hash) return undefined;

  try {
    return new URL(hash.startsWith("/") ? hash : `/${hash}`, parsed.origin);
  } catch {
    return undefined;
  }
}

function isCompositionProjectPath(pathname) {
  return /^\/composition-editor\/projects\/\d+(?:\/|$)/.test(pathname ?? "");
}

function isHashCompositionProjectPath(pathname) {
  return /^\/(?:composition-editor\/)?projects\/\d+(?:\/|$)/.test(
    pathname ?? "",
  );
}

function getCompositionProjectIdFromPath(pathname) {
  return pathname?.match(/(?:^|\/)projects\/(\d+)(?:\/|$)/)?.[1];
}
