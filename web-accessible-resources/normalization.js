function cleanString(value) {
  if (value === undefined || value === null) return undefined;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function stripWrappingQuotes(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return undefined;
  return cleaned.replace(/^["']+|["']+$/g, "").trim() || undefined;
}

function normalizeNumberToken(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return undefined;
  const match = cleaned.match(/\d+/);
  if (!match) return undefined;
  const number = Number(match[0]);
  return Number.isFinite(number) ? String(number) : undefined;
}

export function parseSeasonEpisodeInput(value) {
  const cleaned = stripWrappingQuotes(value);
  if (!cleaned) return {};

  const compactMatch = cleaned.match(
    /^S(?:eason)?\s*0*(\d+)[\s_-]*E(?:p(?:isode)?)?\s*0*(\d+)$/i,
  );
  if (compactMatch) {
    return {
      season: String(Number(compactMatch[1])),
      episode: String(Number(compactMatch[2])),
    };
  }

  const seasonMatch = cleaned.match(/^S(?:eason)?\s*0*(\d+)$/i);
  if (seasonMatch) {
    return { season: String(Number(seasonMatch[1])) };
  }

  const episodeMatch = cleaned.match(/^E(?:p(?:isode)?)?\s*0*(\d+)$/i);
  if (episodeMatch) {
    return { episode: String(Number(episodeMatch[1])) };
  }

  if (/^\d+$/.test(cleaned)) {
    return { episode: String(Number(cleaned)) };
  }

  return {};
}

function parseSeasonPart(value) {
  return parseSeasonEpisodeInput(value).season;
}

function parseEpisodePart(value) {
  return parseSeasonEpisodeInput(value).episode;
}

export function parseTitleAndEpisode(rawTitle) {
  try {
    const source = cleanString(rawTitle);
    if (!source || /^https?:\/\//i.test(source)) {
      return { title: undefined, season: undefined, episode: undefined };
    }

    const withoutAppSuffix = source.replace(/\s+-\s+Authoring\s*$/i, "");
    const parts = withoutAppSuffix
      .split(":")
      .map((part) => stripWrappingQuotes(part))
      .filter(Boolean);

    let titleParts = [];
    let season;
    let episode;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const combined = parseSeasonEpisodeInput(part);

      if (combined.season && combined.episode) {
        season = combined.season;
        episode = combined.episode;
        break;
      }

      const seasonFromPart = parseSeasonPart(part);
      if (seasonFromPart) {
        season = seasonFromPart;
        if (i + 1 < parts.length) {
          episode = parseEpisodePart(parts[i + 1]);
        }
        break;
      }

      const episodeFromPart = parseEpisodePart(part);
      if (episodeFromPart) {
        episode = episodeFromPart;
        break;
      }

      titleParts.push(part);
    }

    if (!season || !episode) {
      const inlineMatch = withoutAppSuffix.match(
        /\bS(?:eason)?\s*0*(\d+)\b.*?\bE(?:p(?:isode)?)?\s*0*(\d+)\b/i,
      );
      if (inlineMatch) {
        season = season ?? String(Number(inlineMatch[1]));
        episode = episode ?? String(Number(inlineMatch[2]));
      }
    }

    const title = cleanString(titleParts.join(": ")) || cleanString(source);
    return { title, season, episode };
  } catch (e) {
    console.log("parseTitleAndEpisode failed", e);
    return { title: undefined, season: undefined, episode: undefined };
  }
}

function normalizeDate(dateString) {
  const cleaned = cleanString(dateString);
  if (!cleaned) return undefined;

  const date = new Date(cleaned);
  if (Number.isNaN(date.getTime())) return undefined;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function roundTo(num, precision) {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor + Number.EPSILON) / factor;
}

export function calculateHourlyRate(invoiceAmount, seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  if (!Number.isFinite(invoiceAmount)) return undefined;

  return roundTo((invoiceAmount / seconds) * 3600, 2) ?? undefined;
}

export function calculateInvoiceAmount(rate, runtime) {
  const numericRate = Number(rate);
  const numericRuntime = Number(runtime);
  if (!Number.isFinite(numericRate) || !Number.isFinite(numericRuntime)) {
    return undefined;
  }

  const runtimeRounded = Math.round(numericRuntime / 60);
  return roundTo(numericRate * runtimeRounded, 2);
}

export function normalizeDurationInput(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed));
  }

  const parts = trimmed.split(":");
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return undefined;
  }

  const [days, hours, minutes, seconds] = parts.map((part) => Number(part));
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function normalizeMoneyInput(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;

  const numericString = trimmed.replace(/[^0-9.-]/g, "");
  if (!numericString) return undefined;

  const parsed = Number(numericString);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeRatePerMinuteInput(value) {
  return normalizeMoneyInput(value);
}

export function normalizeHourlyRateInput(value) {
  return normalizeMoneyInput(value);
}

export function normalizeDateInput(value) {
  return normalizeDate(value);
}

export function normalizeSeasonInput(value) {
  return parseSeasonEpisodeInput(value).season ?? normalizeNumberToken(value);
}

export function normalizeEpisodeInput(value) {
  return parseSeasonEpisodeInput(value).episode ?? normalizeNumberToken(value);
}

export function normalizeEpisodeForSeason(episode, season) {
  const normalizedEpisode = normalizeEpisodeInput(episode);
  const normalizedSeason = normalizeSeasonInput(season);
  if (!normalizedEpisode || !normalizedSeason) return normalizedEpisode;

  const episodeNum = Number(normalizedEpisode);
  const seasonNum = Number(normalizedSeason);
  const episodeLooksSeasonPrefixed =
    episodeNum >= 100 && Math.trunc(episodeNum / 100) === seasonNum;

  if (!episodeLooksSeasonPrefixed) return normalizedEpisode;
  return String(episodeNum % 100 || episodeNum);
}

export function buildProjectIdFromTitleSeasonEpisode(title, season, episode) {
  const normalizedTitle = cleanString(title);
  if (!normalizedTitle) return undefined;

  const normalizedSeason = normalizeSeasonInput(season);
  const normalizedEpisode = normalizeEpisodeForSeason(episode, normalizedSeason);

  if (normalizedSeason && normalizedEpisode) {
    return `${normalizedTitle}: Season ${normalizedSeason}: Episode ${normalizedEpisode}`;
  }

  if (normalizedEpisode) {
    return `${normalizedTitle}: Episode ${normalizedEpisode}`;
  }

  return normalizedTitle;
}

export function buildProjectId(project) {
  if (!project || typeof project !== "object") return undefined;

  const parsedTitle = parseTitleAndEpisode(project.title);
  const parsedId = parseTitleAndEpisode(project.id);
  const parsedEpisode = parseSeasonEpisodeInput(project.episode);

  const title =
    parsedTitle.title ??
    cleanString(project.title) ??
    parsedId.title ??
    cleanString(project.name);
  const season =
    normalizeSeasonInput(project.season) ??
    parsedEpisode.season ??
    parsedTitle.season ??
    parsedId.season;
  const episode =
    normalizeEpisodeInput(project.episode) ??
    parsedTitle.episode ??
    parsedId.episode;

  return (
    buildProjectIdFromTitleSeasonEpisode(title, season, episode) ??
    cleanString(project.request_ref) ??
    cleanString(project.workplace_url) ??
    cleanString(project.id)
  );
}

export function buildProjectIdFromTitleAndEpisode(
  title,
  episodeCode,
  seasonCode,
) {
  const parsedEpisode = parseSeasonEpisodeInput(episodeCode);
  return buildProjectIdFromTitleSeasonEpisode(
    title,
    seasonCode ?? parsedEpisode.season,
    parsedEpisode.episode ?? episodeCode,
  );
}

export function parseRawProjectId(rawId) {
  if (!rawId) return undefined;
  const { title, season, episode } = parseTitleAndEpisode(rawId);
  return buildProjectIdFromTitleSeasonEpisode(title, season, episode);
}

const projectTemplate = {
  id: undefined,
  client: undefined,
  contractor: undefined,
  date_assigned: undefined,
  date_due: undefined,
  episode: undefined,
  hourly_rate: undefined,
  invoice_amount: undefined,
  rate: undefined,
  runtime: undefined,
  season: undefined,
  title: undefined,
  work_time: 0,
  workplace_url: undefined,
};

export function normalizeProjectData(project) {
  try {
    const normalizedProject = {
      ...projectTemplate,
      ...project,
    };
    const parsedTitle = parseTitleAndEpisode(normalizedProject.title);
    const parsedId = parseTitleAndEpisode(normalizedProject.id);
    const parsedEpisode = parseSeasonEpisodeInput(normalizedProject.episode);
    const workTime = normalizedProject.work_time ?? projectTemplate.work_time;
    const rate = normalizedProject.rate;
    const runtime = normalizedProject.runtime;
    const season =
      normalizeSeasonInput(normalizedProject.season) ??
      parsedEpisode.season ??
      parsedTitle.season ??
      parsedId.season;
    const rawEpisode =
      normalizeEpisodeInput(normalizedProject.episode) ??
      parsedTitle.episode ??
      parsedId.episode;
    const episode = normalizeEpisodeForSeason(rawEpisode, season);
    const title =
      parsedTitle.title ??
      cleanString(normalizedProject.title) ??
      parsedId.title;

    const invoiceAmount = calculateInvoiceAmount(rate, runtime) ?? undefined;

    Object.keys(projectTemplate).forEach((key) => {
      let value = normalizedProject[key];

      switch (key) {
        case "id":
          value = buildProjectId({
            ...normalizedProject,
            title,
            season,
            episode,
          });
          break;

        case "date_assigned":
        case "date_due":
          value = normalizeDate(value);
          break;

        case "episode":
          value = episode;
          break;

        case "hourly_rate":
          value =
            calculateHourlyRate(invoiceAmount, workTime) ??
            projectTemplate.hourly_rate;
          break;

        case "invoice_amount":
          value = invoiceAmount ?? projectTemplate.invoice_amount;
          break;

        case "rate":
          value = rate ?? projectTemplate.rate;
          break;

        case "runtime":
          value = runtime ?? projectTemplate.runtime;
          break;

        case "season":
          value = season;
          break;

        case "title":
          value = title;
          break;

        case "work_time":
          value = workTime;
          break;
      }

      normalizedProject[key] = value;
    });

    return normalizedProject;
  } catch (error) {
    console.log("Failed to normalize project data:", error);
    return { ...projectTemplate };
  }
}
