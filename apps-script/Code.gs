const CONFIG = {
  // Open Gig Timer spreadsheet:
  // https://docs.google.com/spreadsheets/d/1q-BG4u62IEdBW1ewPEkyd8V3scm4Lsbcgl30OdtquCo/edit
  spreadsheetId: "1q-BG4u62IEdBW1ewPEkyd8V3scm4Lsbcgl30OdtquCo",
  defaultSheetName: "Sheet2",
  colorMapPropertyKey: "GIG_TIMER_SHOW_COLOR_MAP_V1",
};

const COLUMNS = [
  { key: "date_assigned", header: "Date Assigned", type: "date" },
  { key: "title", header: "Title", type: "text" },
  { key: "season", header: "Season", type: "integer" },
  { key: "episode", header: "Episode", type: "integer" },
  { key: "client", header: "Client", type: "text" },
  { key: "contractor", header: "Contractor", type: "text" },
  { key: "runtime", header: "Runtime", type: "duration" },
  { key: "rate", header: "Rate", type: "currency" },
  { key: "invoice_amount", header: "Invoice Amount", type: "currency" },
  { key: "work_time", header: "Work Time", type: "duration" },
  { key: "hourly_rate", header: "Hourly Rate", type: "currency" },
];

const DROPPED_COLUMN_KEYS = new Set([
  "date_booked",
  "date_due",
  "id",
  "request_ref",
  "season_episode",
  "updated_at",
  "workplace_url",
]);

const HEADER_ALIASES = {
  client: ["client"],
  contractor: ["contractor"],
  date_booked: ["date booked", "date_booked", "booked"],
  date_assigned: ["date assigned", "date_assigned", "assigned", "assigned date"],
  date_due: ["date due", "date_due", "due", "due date"],
  episode: ["episode", "episode number", "episode_number"],
  hourly_rate: ["hourly rate", "hourly_rate"],
  id: ["project id", "id"],
  invoice_amount: ["invoice amount", "invoice_amount", "invoice", "amount", "total"],
  rate: ["rate", "rate/min", "rate per minute"],
  request_ref: ["request ref", "request_ref"],
  runtime: ["runtime", "run time", "duration"],
  season: ["season", "season number", "season_number"],
  season_episode: ["season/episode", "season episode", "season_episode", "s/e"],
  title: ["title", "show", "show title", "project", "project title"],
  updated_at: ["updated at", "updated_at"],
  workplace_url: ["workplace url", "workplace_url", "url"],
  work_time: ["work time", "work_time", "worktime", "time worked"],
};

const SHOW_COLORS = [
  ["#fce8e6", "#f4c7c3"],
  ["#fef7e0", "#feefc3"],
  ["#fff8c5", "#fff2a8"],
  ["#e6f4ea", "#ceead6"],
  ["#e0f2f1", "#b2dfdb"],
  ["#e8f0fe", "#d2e3fc"],
  ["#e8eaf6", "#c5cae9"],
  ["#f3e8fd", "#e9d2fd"],
  ["#fce4ec", "#f8bbd0"],
  ["#f1f3f4", "#e8eaed"],
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const payload = parsePayload_(e);
    const project = normalizeProject_(payload.projectData || payload, {
      stampUpdatedAt: true,
    });
    const sheet = getTargetSheet_(payload);
    const table = getTable_(sheet);
    const rows = getExistingProjectsFromTable_(table);
    upsertProject_(rows, project);
    rows.sort(compareProjects_);
    writeProjects_(sheet, rows, table);
    return ok_();
  } catch (error) {
    console.error(error);
    return ContentService.createTextOutput(`ERROR: ${error.message}`);
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput("Gig Timer endpoint is live.");
}

function parsePayload_(e) {
  const raw = e && e.postData && e.postData.contents;
  if (raw) return JSON.parse(raw);
  return (e && e.parameter) || {};
}

function getTargetSheet_(payload) {
  const spreadsheetId = CONFIG.spreadsheetId || payload.spreadSheetId;
  const spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("No target spreadsheet found.");

  const sheetName =
    payload.spreadSheetName || CONFIG.defaultSheetName || spreadsheet.getSheets()[0].getName();
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function getTable_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getValues();
  const displayValues = range.getDisplayValues();
  if (values.length === 0 || values[0].length === 0) {
    return { displayValues: [], headers: [], values: [] };
  }

  const headers = values[0].map((header, index) => {
    const cleaned = cleanText_(header);
    if (cleaned) return cleaned;

    const hasColumnData = values
      .slice(1)
      .some((row) => row[index] !== "" && row[index] !== null);
    return hasColumnData ? `Column ${index + 1}` : "";
  });

  return { displayValues, headers, values };
}

function getExistingProjectsFromTable_(table) {
  const values = table.values;
  const displayValues = table.displayValues || [];
  if (values.length < 2) return [];

  const headerMap = buildHeaderMap_(table.headers);
  return values
    .slice(1)
    .map((row, index) => ({
      displayRow: displayValues[index + 1] || [],
      row,
    }))
    .filter(({ row }) => row.some((value) => value !== "" && value !== null))
    .map(({ displayRow, row }) =>
      normalizeProject_(projectFromRow_(row, displayRow, headerMap), {
        stampUpdatedAt: false,
      }),
    );
}

function buildHeaderMap_(headerRow) {
  const map = {};

  headerRow.forEach((header, index) => {
    const key = resolveKeyForHeader_(header);
    if (key && map[key] === undefined) map[key] = index;
  });

  return map;
}

function projectFromRow_(row, displayRow, headerMap) {
  const project = {
    __cells: row.slice(),
    __displayByKey: {},
  };

  Object.keys(headerMap).forEach((key) => {
    const index = headerMap[key];
    project[key] = row[index];
    project.__displayByKey[key] = displayRow[index] || "";
  });

  return project;
}

function upsertProject_(rows, project) {
  if (!project.id) project.id = buildProjectId_(project);
  if (!project.id) throw new Error("Project must have a title or id.");

  const existingIndex = rows.findIndex((row) => row.id === project.id);
  if (existingIndex >= 0) {
    rows[existingIndex] = mergeProject_(rows[existingIndex], project);
  } else {
    rows.push(project);
  }
}

function mergeProject_(existing, incoming) {
  const merged = Object.assign({}, existing);
  COLUMNS.forEach((column) => {
    const value = incoming[column.key];
    if (value !== undefined && value !== null && value !== "") {
      merged[column.key] = value;
    }
  });
  return merged;
}

function normalizeProject_(rawProject, options) {
  const project = Object.assign({}, rawProject || {});
  const stampUpdatedAt = !options || options.stampUpdatedAt !== false;
  const parsedTitle = parseTitleSeasonEpisode_(project.title || project.id);
  const parsedSeasonEpisode = parseSeasonEpisode_(
    project.season_episode || project.episode || project.id || project.title,
  );
  const parsedEpisode = parseSeasonEpisode_(project.episode);

  project.title = cleanText_(parsedTitle.title || project.title);
  project.season = normalizeInteger_(
    project.season ||
      parsedSeasonEpisode.season ||
      parsedEpisode.season ||
      parsedTitle.season,
  );
  project.episode = normalizeEpisodeForSeason_(
    parsedSeasonEpisode.episode ||
      parsedEpisode.episode ||
      project.episode ||
      parsedTitle.episode,
    project.season,
  );
  project.date_assigned = normalizeDate_(project.date_assigned || project.date_booked);
  project.runtime = normalizeSeconds_(
    project.runtime,
    project.__displayByKey && project.__displayByKey.runtime,
  );
  project.work_time = normalizeSeconds_(
    project.work_time,
    project.__displayByKey && project.__displayByKey.work_time,
  );
  project.rate = normalizeMoney_(project.rate);
  project.invoice_amount =
    normalizeMoney_(project.invoice_amount) || calculateInvoiceAmount_(project.rate, project.runtime);
  project.hourly_rate =
    normalizeMoney_(project.hourly_rate) || calculateHourlyRate_(project.invoice_amount, project.work_time);
  project.client = cleanText_(project.client);
  project.contractor = cleanText_(project.contractor);
  project.workplace_url = cleanText_(project.workplace_url);
  project.request_ref = cleanText_(project.request_ref);
  project.id = cleanText_(project.id) || buildProjectId_(project);
  if (stampUpdatedAt) project.updated_at = new Date();

  return project;
}

function parseTitleSeasonEpisode_(value) {
  const text = cleanText_(value);
  if (!text || /^https?:\/\//i.test(text)) return {};

  const cleaned = text.replace(/\s+-\s+Authoring\s*$/i, "");
  const match = cleaned.match(
    /^(.*?)(?::\s*Season\s*0*(\d+))?(?::\s*"?Episode\s*0*(\d+)"?)\b/i,
  );

  if (!match) return { title: cleaned };
  return {
    title: cleanText_(match[1]),
    season: match[2],
    episode: match[3],
  };
}

function parseSeasonEpisode_(value) {
  const text = cleanText_(value);
  if (!text) return {};

  const seasonEpisodeMatch = text.match(
    /(?:^|\b)S(?:eason)?\s*0*(\d+)[\s/_-]*E(?:p(?:isode)?)?\s*0*(\d+)(?:\b|$)/i,
  );
  if (seasonEpisodeMatch) {
    return { season: seasonEpisodeMatch[1], episode: seasonEpisodeMatch[2] };
  }

  const wordsMatch = text.match(
    /Season\s*0*(\d+).*?Episode\s*0*(\d+)/i,
  );
  if (wordsMatch) return { season: wordsMatch[1], episode: wordsMatch[2] };

  const match = text.match(
    /^S(?:eason)?\s*0*(\d+)[\s_-]*E(?:p(?:isode)?)?\s*0*(\d+)$/i,
  );
  if (match) return { season: match[1], episode: match[2] };

  const episodeMatch = text.match(/^E(?:p(?:isode)?)?\s*0*(\d+)$/i);
  if (episodeMatch) return { episode: episodeMatch[1] };

  return /^\d+$/.test(text) ? { episode: text } : {};
}

function normalizeEpisodeForSeason_(episode, season) {
  const normalizedEpisode = normalizeInteger_(episode);
  const normalizedSeason = normalizeInteger_(season);
  if (!normalizedEpisode || !normalizedSeason) return normalizedEpisode;

  const episodeNumber = Number(normalizedEpisode);
  const seasonNumber = Number(normalizedSeason);
  const seasonPrefixed =
    episodeNumber >= 100 && Math.trunc(episodeNumber / 100) === seasonNumber;

  return seasonPrefixed ? String(episodeNumber % 100 || episodeNumber) : normalizedEpisode;
}

function buildProjectId_(project) {
  const title = cleanText_(project.title);
  if (!title) return cleanText_(project.request_ref || project.workplace_url || project.id);

  if (project.season && project.episode) {
    return `${title}: Season ${project.season}: Episode ${project.episode}`;
  }

  if (project.episode) return `${title}: Episode ${project.episode}`;
  return title;
}

function compareProjects_(a, b) {
  return (
    compareDates_(a.date_assigned, b.date_assigned) ||
    String(a.title || "").localeCompare(String(b.title || "")) ||
    compareNumbers_(a.season, b.season) ||
    compareNumbers_(a.episode, b.episode)
  );
}

function writeProjects_(sheet, rows, table) {
  const headers = mergeHeaders_(table.headers);
  const values = rows.map((project) =>
    rowToValues_(project, headers, table.headers),
  );

  ensureSheetSize_(sheet, rows.length + 1, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(values);
  }
  deleteTrailingColumns_(sheet, headers.length);

  formatSheet_(sheet, rows, headers);
}

function mergeHeaders_(existingHeaders) {
  const headers = [];

  existingHeaders.map(cleanText_).forEach((header) => {
    if (!header) return;

    const key = resolveKeyForHeader_(header);
    if (key === "date_booked") {
      pushHeaderOnce_(headers, "Date Assigned");
      return;
    }

    if (key === "season_episode") {
      pushHeaderOnce_(headers, "Season");
      pushHeaderOnce_(headers, "Episode");
      return;
    }

    if (DROPPED_COLUMN_KEYS.has(key)) return;
    pushHeaderOnce_(headers, header);
  });

  COLUMNS.forEach((column) => {
    if (headers.some((header) => resolveKeyForHeader_(header) === column.key)) {
      return;
    }

    if (column.key === "season") {
      const episodeIndex = headers.findIndex(
        (header) => resolveKeyForHeader_(header) === "episode",
      );
      if (episodeIndex >= 0) {
        headers.splice(episodeIndex, 0, column.header);
        return;
      }
    }

    headers.push(column.header);
  });

  return headers.length > 0 ? headers : COLUMNS.map((column) => column.header);
}

function pushHeaderOnce_(headers, header) {
  const key = resolveKeyForHeader_(header);
  const alreadyPresent = key
    ? headers.some((existing) => resolveKeyForHeader_(existing) === key)
    : headers.some((existing) => normalizeHeader_(existing) === normalizeHeader_(header));

  if (!alreadyPresent) headers.push(header);
}

function rowToValues_(project, headers, originalHeaders) {
  return headers.map((header) => {
    const key = resolveKeyForHeader_(header);
    if (key) return formatProjectValueForCell_(project, key);

    const originalIndex = originalHeaders.findIndex(
      (originalHeader) => normalizeHeader_(originalHeader) === normalizeHeader_(header),
    );
    return originalIndex >= 0 ? project.__cells?.[originalIndex] ?? "" : "";
  });
}

function formatProjectValueForCell_(project, key) {
  const column = COLUMNS.find((candidate) => candidate.key === key);
  const value = project[key];
  if (!column || value === undefined || value === null || value === "") return "";
  if (column.type === "duration") return value / 86400;
  return value;
}

function ensureSheetSize_(sheet, rowCount, columnCount) {
  if (sheet.getMaxRows() < rowCount) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < columnCount) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      columnCount - sheet.getMaxColumns(),
    );
  }
}

function deleteTrailingColumns_(sheet, columnCount) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn > columnCount) {
    sheet.deleteColumns(columnCount + 1, lastColumn - columnCount);
  }
}

function formatSheet_(sheet, rows, headers) {
  const columnCount = headers.length;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setFontWeight("bold")
    .setFontColor("#ffffff")
    .setBackground("#202124");

  if (rows.length === 0) return;

  const dataRange = sheet.getRange(2, 1, rows.length, columnCount);
  dataRange.setVerticalAlignment("middle");
  dataRange.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  applyNumberFormats_(sheet, rows.length, headers);
  applyShowColors_(sheet, rows, headers);
  sheet.autoResizeColumns(1, columnCount);
}

function applyNumberFormats_(sheet, rowCount, headers) {
  headers.forEach((header, index) => {
    const key = resolveKeyForHeader_(header);
    const column = COLUMNS.find((candidate) => candidate.key === key);
    if (!column) return;

    const range = sheet.getRange(2, index + 1, rowCount, 1);
    if (column.type === "date") range.setNumberFormat("yyyy-mm-dd");
    if (column.type === "datetime") range.setNumberFormat("yyyy-mm-dd hh:mm");
    if (column.type === "duration") range.setNumberFormat("[h]:mm:ss");
    if (column.type === "currency") range.setNumberFormat("$0.00");
    if (column.type === "integer") range.setNumberFormat("0");
  });
}

function applyShowColors_(sheet, rows, headers) {
  const colorMap = getShowColorMap_(rows);
  const backgrounds = rows.map((row, index) => {
    const title = cleanText_(row.title) || "Untitled";
    const colorIndex = colorMap[title] % SHOW_COLORS.length;
    const color = SHOW_COLORS[colorIndex][index % 2];
    return headers.map(() => color);
  });

  sheet.getRange(2, 1, rows.length, headers.length).setBackgrounds(backgrounds);
}

function getShowColorMap_(rows) {
  const properties = PropertiesService.getScriptProperties();
  const saved = properties.getProperty(CONFIG.colorMapPropertyKey);
  const colorMap = saved ? JSON.parse(saved) : {};
  let nextColor = Object.keys(colorMap).length;

  rows.forEach((row) => {
    const title = cleanText_(row.title) || "Untitled";
    if (colorMap[title] === undefined) {
      colorMap[title] = nextColor;
      nextColor += 1;
    }
  });

  properties.setProperty(CONFIG.colorMapPropertyKey, JSON.stringify(colorMap));
  return colorMap;
}

function normalizeHeader_(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveKeyForHeader_(header) {
  const normalized = normalizeHeader_(header);
  if (!normalized) return "";

  for (const key of Object.keys(HEADER_ALIASES)) {
    const aliases = HEADER_ALIASES[key];
    if (aliases.map(normalizeHeader_).includes(normalized)) {
      return key;
    }
  }

  return "";
}

function cleanText_(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeInteger_(value) {
  const text = cleanText_(value);
  if (!text) return "";
  const match = text.match(/\d+/);
  return match ? String(Number(match[0])) : "";
}

function normalizeMoney_(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const number = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : "";
}

function normalizeSeconds_(value, displayValue) {
  if (value === undefined || value === null || value === "") return "";
  const display = cleanText_(displayValue);
  if (display && display.includes(":")) {
    const parsedDisplay = parseDurationText_(display);
    if (parsedDisplay !== "") return parsedDisplay;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 10 ? Math.round(value * 86400) : Math.round(value);
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return (
      value.getHours() * 3600 +
      value.getMinutes() * 60 +
      value.getSeconds()
    );
  }

  const text = cleanText_(value);
  if (!text) return "";
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|minute)/i);
  if (minuteMatch) return Math.round(Number(minuteMatch[1]) * 60);
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text));

  return parseDurationText_(text);
}

function parseDurationText_(text) {
  const parts = text.split(":").map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return parts[0] * 86400 + parts[1] * 3600 + parts[2] * 60 + parts[3];
  }
  if (parts.length === 3 && parts.every(Number.isFinite)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return parts[0] * 60 + parts[1];
  }

  return "";
}

function normalizeDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Number.isNaN(value.getTime()) ? "" : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date;
}

function compareDates_(a, b) {
  const aTime = a instanceof Date ? a.getTime() : Number.POSITIVE_INFINITY;
  const bTime = b instanceof Date ? b.getTime() : Number.POSITIVE_INFINITY;
  return aTime - bTime;
}

function compareNumbers_(a, b) {
  const aNumber = a === "" || a === undefined ? Number.POSITIVE_INFINITY : Number(a);
  const bNumber = b === "" || b === undefined ? Number.POSITIVE_INFINITY : Number(b);
  return aNumber - bNumber;
}

function calculateInvoiceAmount_(rate, runtimeSeconds) {
  if (!rate || !runtimeSeconds) return "";
  return roundTo_(Number(rate) * Math.round(Number(runtimeSeconds) / 60), 2);
}

function calculateHourlyRate_(invoiceAmount, workTimeSeconds) {
  if (!invoiceAmount || !workTimeSeconds) return "";
  return roundTo_((Number(invoiceAmount) / Number(workTimeSeconds)) * 3600, 2);
}

function roundTo_(number, precision) {
  const factor = Math.pow(10, precision);
  return Math.round(number * factor + Number.EPSILON) / factor;
}

function ok_() {
  return ContentService.createTextOutput("OK");
}
