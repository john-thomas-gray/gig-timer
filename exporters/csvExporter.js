function toCsvValue(value) {
  if (value === null || value === undefined) return "";

  const stringValue = String(value);

  // Escape double quotes and wrap if needed
  if (
    stringValue.includes('"') ||
    stringValue.includes(",") ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function projectToCsv(project) {
  const header = PROJECT_FIELDS.join(",");

  const row = PROJECT_FIELDS.map((field) => toCsvValue(project[field])).join(
    ","
  );

  return `${header}\n${row}`;
}

export const csvExporter = {
  id: "csv",
  label: "Download CSV",

  async export(data) {
    const csv = projectToCsv(data);
    const filename = data.id + ".csv";

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({
      url,
      filename: filename,
    });
  },
};
