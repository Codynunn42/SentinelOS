# SentinelOS

SentinelOS is the dedicated product repository for the Sentinel control plane.

## Apps

- `apps/sentinel-dashboard`: operator-facing dashboard and demo surface
- `apps/sentinel-api`: authenticated Sentinel API and command control plane

## Packages

- `packages/shared-libs`: shared Sentinel types and logging helpers
- `packages/reporting-manifest`: reporting and delivery utilities used by Sentinel workflows

## Trigent Pilot

The first pilot surface focuses on:

- pricing validation
- pricing outlier detection
- workflow step recording
- workflow bottleneck analysis
- pilot report generation

The API landing page exposes a public demo at `GET /pilot/trigent/demo`.
