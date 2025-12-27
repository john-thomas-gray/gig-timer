export function formatTitleAndEpisode(title) {
  const titleStr =
    typeof title === "object" && title !== null ? title.raw : title;

  const parts = titleStr.split(":").map((part) => part.trim());

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
  const seconds = Number(workTime);

  if (!seconds || seconds <= 0) return undefined;

  const hourlyRate = roundTo(invoiceAmount / seconds / 3600, 2);
  const hrRateUSD = displayFormatUSD(hourlyRate);

  return `${hrRateUSD}/hr`;
}

function calculateInvoiceAmount(rate, runtime) {
  const runtimeRounded = Math.round(Number(runtime) / 60);
  const invoiceAmount = Number(rate) * runtimeRounded;
  return invoiceAmount;
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
  console.log(title, episodeCode);
  const match = /^S(\d+)_E(\d+)$/.exec(episodeCode);
  if (!match) {
    throw new Error(`Invalid episode format: ${episodeCode}`);
  }

  const season = Number(match[1]);
  const episode = Number(match[2]);

  const paddedEpisode = `E${String(episode).padStart(4, "0")}`;

  return `${title}: Season ${season}: Episode ${episode}: Episode ${episode} (${paddedEpisode})`;
}

export function formatProjectDisplay(project) {
  const formattedProject = {};

  const rate = project.rate?.raw ?? project.rate ?? 0;
  const runtime = project.runtime?.raw ?? project.runtime ?? 0;
  const workTime = project.work_time?.raw ?? project.work_time ?? 0;
  const invoiceAmount =
    project.invoice_amount?.raw ?? project.invoice_amount ?? 0;
  const titleRaw =
    typeof project.title === "object" ? project.title.raw : project.title;
  const { title, episode } = formatTitleAndEpisode(titleRaw);

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
        const raw = calculateInvoiceAmount(rate, runtime);
        formattedProject[key] = {
          raw: raw,
          display: displayFormatUSD(raw),
        };

        break;

      case "date_due":
      case "date_assigned":
        displayValue = displayFormatDate(rawValue);
        break;

      case "title":
        displayValue = title;
        formattedProject[key] = { raw: project.title, display: displayValue };
        return;

      case "episode":
        displayValue = episode;
        formattedProject[key] = {
          raw: displayValue,
          display: displayValue,
        };
        return;

      case "id":
        displayValue = setId(title, episode);
        formattedProject[key] = {
          raw: displayValue,
          display: displayValue,
        };

        return;
      default:
        displayValue = rawValue;
        break;
    }

    formattedProject[key] = { raw: rawValue, display: displayValue };
  });

  return formattedProject;
}
