export function formatTitleAndEpisode(title) {
  try {
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
    const episodeFormatted =
      season && episode ? `S${season}_E${episode}` : null;

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

function formatDisplayUSD(dollars) {
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

function calculateHourlyRate(invoiceAmount, workTime) {
  const seconds = Number(workTime);

  if (!seconds || seconds <= 0) return undefined;

  const hourlyRate = roundTo(invoiceAmount / seconds / 3600, 2);

  return hourlyRate;
}

function calculateInvoiceAmount(rate, runtime) {
  const runtimeRounded = Math.round(Number(runtime) / 60);
  const invoiceAmount = Number(rate) * runtimeRounded;
  return invoiceAmount;
}

export function formatDisplayRatePpm(rate) {
  let formatted = formatDisplayUSD(rate);
  return `${formatted} ppm`;
}

function formatDisplayTime(seconds) {
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
  if (!title || !episodeCode) return null;
  const match = /^S(\d+)_E(\d+)$/.exec(episodeCode);
  if (!match) {
    throw new Error(`Invalid episode format: ${episodeCode}`);
  }

  const seasonNum = Number(match[1]);
  const episodeNum = Number(match[2]);

  const paddedEpisode = `E${String(episodeNum).padStart(4, "0")}`;

  return `${title}: Season ${seasonNum}: Episode ${episodeNum}: Episode ${episodeNum} (${paddedEpisode})`;
}

export function normalizeProjectData(project) {
  try {
    const projectTemplate = {
      id: null,
      client: null,
      contractor: "Pixelogic Media",
      date_assigned: null,
      date_due: null,
      episode: null,
      hourly_rate: null,
      invoice_amount: null,
      rate: 6,
      runtime: null,
      title: null,
      work_time: 0,
      workplace_url: null,
    };

    const normalizedProject = { ...projectTemplate, ...project };

    const rate = normalizedProject.rate;
    const runtime = normalizedProject.runtime;
    const workTime = normalizedProject.work_time ?? 0;
    const invoiceAmount = calculateInvoiceAmount(rate, runtime) ?? undefined;
    const { title, episode } = formatTitleAndEpisode(normalizedProject.title);

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

// export function formatProjectDisplay(project) {
//   const formattedProject = {};

//   const rate = project.rate?.raw ?? project.rate ?? 0;
//   const runtime = project.runtime?.raw ?? project.runtime ?? 0;
//   const workTime = project.work_time?.raw ?? project.work_time ?? 0;
//   const invoiceAmount =
//     project.invoice_amount?.raw ?? project.invoice_amount ?? 0;
//   const titleRaw =
//     typeof project.title === "object" ? project.title.raw : project.title;
//   const { title, episode } = formatTitleAndEpisode(titleRaw);

//   Object.keys(project).forEach((key) => {
//     const value = project[key];
//     const rawValue = value?.raw ?? value;

//     let displayValue = rawValue;

//     switch (key) {
//       case "work_time":
//       case "runtime":
//         displayValue = formatDisplayTime(rawValue);
//         break;

//       case "rate":
//         displayValue = formatDisplayRatePpm(rawValue);
//         break;

//       case "hourly_rate":
//         displayValue = formatDisplayHourlyRate(invoiceAmount, workTime);
//         break;

//       case "invoice_amount":
//         const raw = calculateInvoiceAmount(rate, runtime);
//         formattedProject[key] = {
//           raw: raw,
//           display: formatDisplayUSD(raw),
//         };

//         return;

//       case "date_due":
//       case "date_assigned":
//         displayValue = formatDisplayDate(rawValue);
//         break;

//       case "title":
//         displayValue = title;
//         formattedProject[key] = { raw: project.title, display: displayValue };
//         return;

//       case "episode":
//         displayValue = episode;
//         formattedProject[key] = {
//           raw: displayValue,
//           display: displayValue,
//         };
//         return;

//       case "id":
//         displayValue = setId(title, episode);
//         formattedProject[key] = {
//           raw: displayValue,
//           display: displayValue,
//         };

//         return;
//       default:
//         displayValue = rawValue;
//         break;
//     }

//     formattedProject[key] = { raw: rawValue, display: displayValue };
//   });

//   return formattedProject;
// }
