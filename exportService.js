import { csvExporter } from "./exporters/csvExporter";
import { sheetsExporter } from "./exporters/sheetsExporter";

const exporters = {
  csv: csvExporter,
  sheets: sheetsExporter,
};

export async function exportData(type, data) {
  await exporters[type].export(data);
}
