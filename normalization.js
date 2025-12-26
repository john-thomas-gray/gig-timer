function formatTitleAndEpisode(title) {
  const parts = title.split(":").map((part) => part.trim());

  let titleParts = [];
  let season = null;
  let episode = null;

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
  const episodeFormatted = season && episode ? `S${season}_E${episode}` : null;

  return { title: formattedTitle, episode: episodeFormatted };
}

function displayFormatDate(dateString) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayFormatUSD(dollars) {
  if (dollars == null || isNaN(dollars)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(dollars));
}

function roundTo(num, precision) {
  const factor = Math.pow(10, precision);
  return Math.round(num * factor + Number.EPSILON) / factor;
}

function displayFormatHourlyRate(invoiceAmount, workTime) {
  const hourlyRate = roundTo(invoiceAmount / Number(workTime) / 3600, 2);
  const hrRateUSD = displayFormatUSD(hourlyRate);
  return `${hourlyRate}/hr`;
}

function displayFormatInvoiceAmount(rate, runtime) {
  const runtimeM = Math.round(Number(runtime) / 60);
  const invoiceAmount = Number(rate) * runtimeM;
  return displayFormatUSD(invoiceAmount);
}

function displayFormatRatePpm(rate) {
  let formatted = displayFormatUSD(rate);
  return `${formatted} ppm`;
}

function displayFormatTime(seconds) {
  const hrs = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, "0");
  const mins = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${hrs}:${mins}:${secs}`;
}

function setId(title, episodeCode) {
  const match = /^S(\d+)_E(\d+)$/.exec(episodeCode);
  if (!match) {
    throw new Error(`Invalid episode format: ${episodeCode}`);
  }

  const season = Number(match[1]);
  const episode = Number(match[2]);

  const paddedEpisode = `E${String(episode).padStart(4, "0")}`;

  return `${title}: Season ${season}: Episode ${episode}: Episode ${episode} (${paddedEpisode})`;
}

export function formatProjectData(project) {
  const formattedProject = {};

  const rate = project.rate?.raw ?? project.rate ?? 0;
  const runtime = project.runtime?.raw ?? project.runtime ?? 0;
  const workTime = project.work_time?.raw ?? project.work_time ?? 0;
  const invoiceAmount =
    project.invoice_amount?.raw ?? project.invoice_amount ?? 0;
  const title = formatTitleAndEpisode(project.title).title;
  const episode = formatTitleAndEpisode(project.title).episode;

  Object.keys(project).forEach((key) => {
    const value = project[key];
    const rawValue = value?.raw ?? value;

    let displayValue = rawValue;

    switch (key) {
      case "work_time":
      case "runtime":
        displayValue = displayFormatTime(rawValue);
        break;

      case "rate":
        displayValue = displayFormatRatePpm(rawValue);
        break;

      case "hourly_rate":
        displayValue = displayFormatHourlyRate(invoiceAmount, workTime);
        break;

      case "invoice_amount":
        displayValue = displayFormatInvoiceAmount(rate, runtime);
        break;

      case "date_due":
      case "date_assigned":
        displayValue = displayFormatDate(rawValue);
        break;

      case "title":
        displayValue = formatTitleAndEpisode(project.title).title;
        formattedProject[key] = { raw: project.title, display: displayValue };

      case "episode":
        displayValue = formatTitleAndEpisode(project.title).episode;
        formattedProject[key] = {
          raw: displayValue,
          display: displayValue,
        };

      case "id":
        displayValue = setId(title, episode);
        formattedProject[key] = {
          raw: displayValue,
          display: displayValue,
        };
      default:
        displayValue = rawValue;
    }

    formattedProject[key] = { raw: rawValue, display: displayValue };
  });

  return formattedProject;
}
