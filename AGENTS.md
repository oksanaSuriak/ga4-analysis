# AGENTS.md

## Project Goal

This project prepares GA4 event data for analytics in PostgreSQL and dashboarding in Grafana.

Primary goals:

- Load and maintain `events_GA4` data in PostgreSQL, currently represented by `public.ga4_events`.
- Build Grafana dashboards on top of PostgreSQL metrics.
- Configure Grafana email alerts when dashboards/data stop updating or key metrics drop.

## Current Project State

Workspace path:

```text
D:\GA4_analysis
```

Main source file:

```text
ga4_events_dataset_500_rows.csv
```

Current PostgreSQL table:

```text
public.ga4_events
```

Verified database state:

```text
rows_count: 500
min_event_date: 2026-01-01
max_event_date: 2026-05-01
transactions: 40
revenue: 9886.69
```

Existing local dashboard preview assets:

```text
ga4_acquisition_dashboard.twb
ga4_acquisition_dashboard.twbx
ga4_acquisition_dashboard_preview.svg
index.html
```

`index.html` is a simple local viewer for dashboard previews and Tableau files. Grafana dashboards still need to be created/configured.

## Tooling Stack

Core stack:

- PostgreSQL: storage for GA4 event data and analytical views.
- Grafana: dashboards, alert rules, email notifications.
- Node.js: local ETL/import scripts.
- npm package `pg`: PostgreSQL client used by `import_ga4_events.js`.
- Codex MCP `postgres_write`: database inspection and SQL execution.

Optional/legacy assets:

- Tableau `.twb` / `.twbx`: initial dashboard prototype files.
- Static HTML/SVG: local preview of dashboard layouts.

Recommended MCP servers:

- `postgres_write`: create tables/views, inspect schemas, run validation queries.
- Grafana MCP: create/update Grafana dashboards, folders, panels, datasources, alert rules.
- Filesystem access to `D:\GA4_analysis`: read CSV/scripts/assets when needed.

## Data Model

Target table:

```sql
public.ga4_events
```

Columns:

```text
event_date date
event_timestamp timestamp
user_id text
session_id text
event_name text
traffic_channel text
source text
medium text
campaign text
device_category text
platform text
browser text
country text
city text
page_location text
session_duration_sec integer
engagement_time_sec integer
transactions integer
purchase_revenue_usd numeric(12, 2)
new_user boolean
```

Current import behavior:

- `import_ga4_events.js` reads `ga4_events_dataset_500_rows.csv`.
- It reads the PostgreSQL connection string from `[mcp_servers.postgres_write]` in the Codex config.
- It creates `public.ga4_events` if missing.
- It truncates `public.ga4_events`.
- It inserts all CSV rows in one transaction.

Because the script truncates before insert, rerunning it refreshes the table without creating duplicate rows.

## Common Commands

Install dependencies:

```powershell
npm.cmd install
```

Import/refresh GA4 events:

```powershell
node .\import_ga4_events.js
```

Expected successful output:

```text
Imported 500 rows into public.ga4_events
```

Open local dashboard preview:

```powershell
start .\index.html
```

## Database Validation Queries

Use these checks after every import:

```sql
SELECT
  COUNT(*) AS rows_count,
  TO_CHAR(MIN(event_date), 'YYYY-MM-DD') AS min_event_date,
  TO_CHAR(MAX(event_date), 'YYYY-MM-DD') AS max_event_date,
  SUM(transactions) AS transactions,
  SUM(purchase_revenue_usd) AS revenue
FROM public.ga4_events;
```

Expected values for the current CSV:

```text
rows_count: 500
min_event_date: 2026-01-01
max_event_date: 2026-05-01
transactions: 40
revenue: 9886.69
```

Check channel-level metrics:

```sql
SELECT
  traffic_channel,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id) AS users,
  SUM(transactions) AS transactions,
  SUM(purchase_revenue_usd) AS revenue,
  ROUND(SUM(transactions)::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 4) AS conversion_rate,
  ROUND(SUM(purchase_revenue_usd)::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 2) AS revenue_per_session
FROM public.ga4_events
GROUP BY traffic_channel
ORDER BY revenue DESC;
```

Check data freshness:

```sql
SELECT MAX(event_timestamp) AS last_event_timestamp
FROM public.ga4_events;
```

## Recommended Analytical Views

Create views for Grafana rather than putting complex SQL directly into every panel.

Suggested views:

- `public.v_ga4_channel_performance`
- `public.v_ga4_daily_performance`
- `public.v_ga4_campaign_performance`
- `public.v_ga4_data_freshness`

Example channel performance view:

```sql
CREATE OR REPLACE VIEW public.v_ga4_channel_performance AS
SELECT
  traffic_channel,
  COUNT(*) AS events,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id) AS users,
  COUNT(DISTINCT user_id) FILTER (WHERE new_user IS TRUE) AS new_users,
  SUM(transactions) AS transactions,
  SUM(purchase_revenue_usd) AS revenue,
  ROUND(SUM(transactions)::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 4) AS conversion_rate,
  ROUND(SUM(purchase_revenue_usd)::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 2) AS revenue_per_session,
  ROUND(AVG(engagement_time_sec)::numeric, 1) AS avg_engagement_sec,
  ROUND(AVG(session_duration_sec)::numeric, 1) AS avg_session_duration_sec
FROM public.ga4_events
GROUP BY traffic_channel;
```

Example daily performance view:

```sql
CREATE OR REPLACE VIEW public.v_ga4_daily_performance AS
SELECT
  event_date,
  COUNT(*) AS events,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id) AS users,
  SUM(transactions) AS transactions,
  SUM(purchase_revenue_usd) AS revenue,
  ROUND(SUM(transactions)::numeric / NULLIF(COUNT(DISTINCT session_id), 0), 4) AS conversion_rate
FROM public.ga4_events
GROUP BY event_date;
```

Example freshness view:

```sql
CREATE OR REPLACE VIEW public.v_ga4_data_freshness AS
SELECT
  MAX(event_timestamp) AS last_event_timestamp,
  NOW() - MAX(event_timestamp) AS data_lag
FROM public.ga4_events;
```

## Grafana Dashboard Plan

Recommended datasource:

- PostgreSQL datasource connected to the same database/schema that contains `public.ga4_events`.

Recommended dashboard:

```text
GA4 Acquisition Performance
```

Recommended panels:

- KPI: Total revenue.
- KPI: Transactions.
- KPI: Sessions.
- KPI: Conversion rate.
- Bar chart: Revenue by traffic channel.
- Bar chart: Conversion rate by traffic channel.
- Time series: Daily sessions, transactions, revenue.
- Table: Campaign performance.
- Table or stat: Data freshness / last event timestamp.

Prefer querying views:

```text
public.v_ga4_channel_performance
public.v_ga4_daily_performance
public.v_ga4_campaign_performance
public.v_ga4_data_freshness
```

## Grafana Alerts

Alert goal:

- Notify by email when data stops updating.
- Notify by email when core metrics drop below acceptable levels.

Required Grafana setup:

- SMTP configured in Grafana.
- Email contact point configured.
- Notification policy routes alerts to the email contact point.
- PostgreSQL datasource available to alert rules.

Recommended alert rules:

1. Data freshness alert

```sql
SELECT EXTRACT(EPOCH FROM (NOW() - MAX(event_timestamp))) / 3600 AS hours_since_last_event
FROM public.ga4_events;
```

Trigger when:

```text
hours_since_last_event > expected_refresh_hours
```

For the current static CSV, do not enable this alert as a production rule until an automated refresh cadence exists.

2. Sessions drop alert

```sql
WITH daily AS (
  SELECT event_date, COUNT(DISTINCT session_id) AS sessions
  FROM public.ga4_events
  GROUP BY event_date
),
baseline AS (
  SELECT AVG(sessions) AS avg_sessions
  FROM daily
  WHERE event_date < (SELECT MAX(event_date) FROM daily)
)
SELECT
  latest.sessions AS latest_sessions,
  baseline.avg_sessions,
  latest.sessions / NULLIF(baseline.avg_sessions, 0) AS ratio
FROM daily latest
CROSS JOIN baseline
WHERE latest.event_date = (SELECT MAX(event_date) FROM daily);
```

Trigger when:

```text
ratio < 0.7
```

3. Revenue drop alert

Use the same baseline pattern as sessions, replacing sessions with `SUM(purchase_revenue_usd)`.

## Testing Strategy

Minimum tests/checks after data changes:

- CSV row count matches PostgreSQL row count.
- Date range in PostgreSQL matches expected CSV date range.
- Sum of `transactions` matches expected value.
- Sum of `purchase_revenue_usd` matches expected value.
- Channel-level aggregation returns expected channels.
- Grafana panels load without query errors.
- Grafana alerts evaluate successfully in preview mode before enabling notifications.

Recommended future automated tests:

- Add a Node-based validation script, for example `validate_ga4_events.js`.
- Fail if row count, required columns, date range, revenue, or transaction totals are wrong.
- Add dashboard JSON validation once Grafana dashboards are exported into the repo.
- Add SQL view tests that check required fields exist and views return non-empty data.

## Development Guidelines

- Keep raw input data in CSV unless the user asks to replace it.
- Do not commit database credentials or tokens into project files.
- Prefer PostgreSQL views for reusable Grafana metrics.
- Keep Grafana panel SQL simple; move repeated logic into views.
- Do not silently drop or overwrite production tables.
- Use `numeric` for revenue fields and integer types for counts/durations.
- Treat `event_timestamp` as `timestamp without time zone` unless the source system starts providing explicit timezone data.
- For major schema changes, update this file and the import script together.

## Known Gaps / Next Steps

- Grafana MCP is not yet documented as active in this workspace.
- Grafana datasource, dashboard JSON, and alert rules still need to be created.
- SMTP/email alerting must be configured in Grafana before email notifications can work.
- `package.json` currently only declares dependencies; useful scripts such as `npm run import` and `npm run validate` can be added later.
- Credentials are currently read from Codex MCP config by `import_ga4_events.js`; a dedicated `.env` approach would be cleaner for long-term use.
