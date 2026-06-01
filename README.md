# GA4 Analysis

GA4 data pipeline, PostgreSQL, Grafana dashboards and alerts.

## Goal

- Prepare GA4 event data in PostgreSQL.
- Build Grafana dashboards for acquisition, engagement, and revenue analytics.
- Configure Grafana email alerts when data is stale or key metrics drop.

## Current Data

Source CSV:

```text
ga4_events_dataset_500_rows.csv
```

PostgreSQL table:

```text
public.ga4_events
```

Validated current load:

```text
rows_count: 500
date range: 2026-01-01 to 2026-05-01
transactions: 40
revenue: 9886.69
```

## Import

Install dependencies:

```powershell
npm.cmd install
```

Refresh PostgreSQL table:

```powershell
node .\import_ga4_events.js
```

The import script creates `public.ga4_events` if needed, truncates it, and reloads all CSV rows in one transaction.

## Local Preview

Open:

```text
index.html
```

This page displays a local preview of dashboard assets.

## Project Guide

See [AGENTS.md](AGENTS.md) for the full project workflow, stack, SQL checks, Grafana dashboard plan, alert rules, and testing strategy.
