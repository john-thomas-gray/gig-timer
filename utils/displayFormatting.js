function formatDisplayOptions(key, value) {
  let formattedValue = "";

  switch (key) {
    case "work_time":
      formattedValue = formatDisplayTime(value);
      break;
    case "runtime":
      formattedValue = formatDisplayTime(value);
      break;
    case "rate":
      formattedValue = formatDisplayRatePpm(value);
      break;
    case "hourly_rate":
      formattedValue = formatDisplayHourlyRate(value);
      console.log("hr", formattedValue);
      break;
    case "invoice_amount":
      formattedValue = formatDisplayInvoiceAmount(value);
      break;
    case "date_due":
      formattedValue = formatDisplayDate(value);
      break;
    case "date_assigned":
      formattedValue = formatDisplayDate(value);
      break;
    default:
      formattedValue = value;
  }
  console.log(key);
  return formattedValue;
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

function formatDisplayUSD(dollars) {
  if (dollars == null || isNaN(dollars)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(dollars));
}

function formatDisplayDate(dateString) {
  return Date(dateString);
}

function formatDisplayHourlyRate(hourlyRate) {
  const hrRateUSD = formatDisplayUSD(hourlyRate);
  return `${hrRateUSD}/hr`;
}

function formatDisplayInvoiceAmount(amount) {
  return formatDisplayUSD(amount);
}

function formatDisplayRatePpm(rate) {
  let formatted = formatDisplayUSD(rate);
  return `${formatted} ppm`;
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

function formatFieldLabel(key) {
  const overrides = { url: "URL" };

  return key
    .split("_")
    .map(
      (word) => overrides[word] ?? word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}
