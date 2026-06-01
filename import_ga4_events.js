const fs = require("fs");
const path = require("path");
const os = require("os");
const { Client } = require("pg");

const csvPath = path.join(__dirname, "ga4_events_dataset_500_rows.csv");
const configPath = path.join(os.homedir(), ".codex", "config.toml");

function getConnectionString() {
  const config = fs.readFileSync(configPath, "utf8");
  const sectionMatch = config.match(/\[mcp_servers\.postgres_write\][\s\S]*?(?=\n\[|$)/);
  if (!sectionMatch) {
    throw new Error("Could not find [mcp_servers.postgres_write] in Codex config.");
  }

  const urlMatch = sectionMatch[0].match(/"postgresql:\/\/[^"]+"/);
  if (!urlMatch) {
    throw new Error("Could not find PostgreSQL connection string in postgres_write config.");
  }

  return urlMatch[0].slice(1, -1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? null])),
  );
}

const createTableSql = `
CREATE TABLE IF NOT EXISTS public.ga4_events (
  event_date date,
  event_timestamp timestamp,
  user_id text,
  session_id text,
  event_name text,
  traffic_channel text,
  source text,
  medium text,
  campaign text,
  device_category text,
  platform text,
  browser text,
  country text,
  city text,
  page_location text,
  session_duration_sec integer,
  engagement_time_sec integer,
  transactions integer,
  purchase_revenue_usd numeric(12, 2),
  new_user boolean
);`;

const columns = [
  "event_date",
  "event_timestamp",
  "user_id",
  "session_id",
  "event_name",
  "traffic_channel",
  "source",
  "medium",
  "campaign",
  "device_category",
  "platform",
  "browser",
  "country",
  "city",
  "page_location",
  "session_duration_sec",
  "engagement_time_sec",
  "transactions",
  "purchase_revenue_usd",
  "new_user",
];

function toValue(row, column) {
  const value = row[column];
  if (value === null || value === undefined || value === "") return null;

  if (
    column === "session_duration_sec" ||
    column === "engagement_time_sec" ||
    column === "transactions"
  ) {
    return Number.parseInt(value, 10);
  }

  if (column === "purchase_revenue_usd") return Number.parseFloat(value);
  if (column === "new_user") return value.toLowerCase() === "true";
  return value;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const client = new Client({ connectionString: getConnectionString() });

  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(createTableSql);
    await client.query("TRUNCATE TABLE public.ga4_events");

    const placeholders = [];
    const values = [];
    rows.forEach((row, rowIndex) => {
      const offset = rowIndex * columns.length;
      placeholders.push(
        `(${columns.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`,
      );
      columns.forEach((column) => values.push(toValue(row, column)));
    });

    await client.query(
      `INSERT INTO public.ga4_events (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values,
    );
    await client.query("COMMIT");
    console.log(`Imported ${rows.length} rows into public.ga4_events`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
