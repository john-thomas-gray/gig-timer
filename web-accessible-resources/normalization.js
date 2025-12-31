export function parseTitleAndEpisode(title) {
  try {
    const parts = title.split(":").map((part) => part.trim());

    let titleParts = [];
    let season = undefined;
    let episode = undefined;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const seasonMatch = part.match(/^Season (\d+)$/);
      if (seasonMatch) {
        season = seasonMatch[1];

        if (i + 1 < parts.length) {
          const episodeMatch = parts[i + 1].match(/^Episode (\d+)/);
          if (episodeMatch) episode = episodeMatch[1];
        }
        break;
      }
      titleParts.push(part);
    }

    const formattedTitle = titleParts.join(": ");
    const episodeFormatted =
      season && episode ? `S${season}_E${episode}` : undefined;

    return { title: formattedTitle, episode: episodeFormatted };
  } catch (e) {
    console.log("formatTitle failed", e);
    return "";
  }
}

function normalizeDate(dateString) {
  const date = new Date(dateString);
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
  const runtimeRounded = Math.round(Number(runtime) / 60);
  const invoiceAmount = Number(rate) * runtimeRounded;
  return invoiceAmount ?? undefined;
}

function setId(title, episodeCode) {
  if (!title || !episodeCode) return undefined;
  const match = /^S(\d+)_E(\d+)$/.exec(episodeCode);
  if (!match) {
    throw new Error(`Invalid episode format: ${episodeCode}`);
  }

  const seasonNum = Number(match[1]);
  const episodeNum = Number(match[2]);

  return `${title}: Season ${seasonNum}: Episode ${episodeNum}`;
}

export function normalizeProjectData(project) {
  try {
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
      title: undefined,
      work_time: undefined,
      workplace_url: undefined,
    };

    const normalizedProject = { ...projectTemplate, ...project };

    const rate = normalizedProject.rate;
    const runtime = normalizedProject.runtime;
    const workTime = normalizedProject.work_time ?? 0;
    const invoiceAmount = calculateInvoiceAmount(rate, runtime) ?? undefined;
    const { title, episode } = parseTitleAndEpisode(normalizedProject.title);

    Object.keys(projectTemplate).forEach((key) => {
      let value = normalizedProject[key];

      switch (key) {
        case "id":
          value = setId(title, episode);
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
