# NASA Space Apps Challenge — AgroMax Project
## Geospatial Intelligence, Earth Observation & Precision Agriculture Platform

AgroMax is an advanced digital agriculture and geospatial intelligence platform integrating Copernicus Sentinel-2 and NASA Landsat earth observations with precision farming workflows, spectral vegetation analysis, and parcel microclimate intelligence.

---

### Project Overview
Developed for the **NASA Space Apps Challenge**, AgroMax bridges orbital satellite data and practical field decision-making for farmers, agronomists, and land stewards.

- **Frontend & Visualization:** React 19, TypeScript, Vite, Tailwind CSS v4, Three.js / React Three Fiber.
- **Geospatial & Satellite Pipelines:** Copernicus Sentinel-2 L2A & NASA/USGS Landsat thermal/optical band processing.
- **Microclimate & Weather:** MET Norway open meteorological forecast models with parcel-level risk windows.
- **Decision Engine:** 14-capability modular agricultural architecture (Observation, Action, Verification).

---

### Phase 1 / Step 1: Project Scaffold & Environment Setup
- Modern Vite + React 19 + TypeScript build pipeline.
- Fast linting via Oxlint.
- Tailwind CSS v4 and Three.js ecosystem integration.
- Strict type-checking and environment configuration.

### Phase 1 / Step 2: Local SQLite Database Layer & Schemas
- SQLite persistence engine with WAL mode and concurrent transaction serialization (`server/database.js`).
- Dual adapter compatibility supporting both local SQLite and Neon PostgreSQL.
- Physical schema definitions: `users`, `sessions`, `records` (parcels/GeoJSON), `analyses`, `auth_limits`.
- Concurrency isolation test suite verifying transaction rollback safety (`server/database.test.js`).

### Phase 1 / Step 3: Map Engine & Parcel Polygon Editor
- Precise parcel boundary validation and GeoJSON Polygon/MultiPolygon schema validation (`shared/geometry.js`).
- Topological validation rejecting self-intersecting lines (kinks), unclosed rings, and non-finite coords.
- Geodesic WGS84 area calculation in decares (`area / 1000`) and bounding box span evaluation.
- High-resolution Esri World Imagery and OpenStreetMap basemap layers (`src/features/fields/basemaps.js`).
- Field entity preparation and geometry normalization test coverage (`server/geometry.test.js`).

### Phase 1 / Step 4: Copernicus Sentinel-2 L2A Satellite API Client
- Copernicus Data Space Ecosystem (CDSE) & Sentinel Hub OAuth2 client credentials authentication (`server/satellite.js`).
- Comprehensive spectral metric definitions and 23 agricultural vegetation index declarations (`shared/metrics.js`).
- Dynamic Evalscript V3 generation requesting S2 L2A optical bands (B02, B03, B04, B08, B8A, B11, B12, SCL, CLD).
- Automatic provider request budget splitting (`server/statistics-request.js`) and usage telemetry metering (`server/provider-meter.js`).
- Rigorous unit test suite verifying zero-data filtering, calendar period splits, and PNG mask validation (`server/satellite.test.js`).

### Phase 1 / Step 5: Vegetation Index Calculators (NDVI, NDRE, EVI)
- Asynchronous analysis job manager and state machine (`server/analysis-jobs.js`) managing `queued`, `running`, `completed`, and `failed` lifecycles.
- Persistent analysis cache and immutable spectral history storage linked to geometry hashes.
- Concurrency control, user ownership enforcement, and notification dispatches (`analysis_jobs`, `notifications`, `audit_events`).
- Resilient recovery of interrupted jobs and cross-instance lease handling (`server/analysis-jobs.test.js`).

### Phase 2 / Step 6: Vercel Serverless Function Router (api/index.js)
- Edge-compatible serverless request router (`api/index.js` & `server/vercel-entry.js`) utilizing `@vercel/functions` and `waitUntil`.
- Central HTTP multiplexer (`server/application.js`) handling CORS security, scrypt password hashing, rate limiting, and session cookies.
- Single-function destination routing via `__agromax_route` rewriting for all `/api/*` endpoints.
- Production `vercel.json` configuration targeted for Frankfurt (`fra1`) with 300-second execution window and SPA fallback.

### Phase 2 / Step 7: Neon PostgreSQL Migration Scripts & Store
- Transaction-safe, lossless database migration script (`scripts/migrate-to-postgres.mjs`) transferring local SQLite records to cloud Neon PostgreSQL.
- Pre-flight validation ensuring no active background analysis jobs are interrupted.
- Target overwrite prevention and row-by-row canonical hash comparison guaranteeing zero data corruption.
- NASA Open APIs and Earthdata HLS integration verification service (`server/nasa.js`) with SHA-256 credential fingerprinting.

### Phase 2 / Step 8: MET Norway Weather Forecasting Integration
- Keyless MET Norway Locationforecast 2.0 complete API client (`server/weather.js`).
- Dynamic geographic centroid calculation from parcel geometry bounding box (`weatherPoint`).
- Rigorous data normalization with CC BY 4.0 attribution, strict SI units validation (`celsius`, `m/s`, `mm`), and 1/6/12-hour period aggregations.
- Resilient local persistence cache (`weather_cache`) with conditional `If-Modified-Since` (HTTP 304), lease locking, and rate-limit backoff.
- Comprehensive test suite preventing stale weather leakage and concurrent in-flight duplication (`server/weather.test.js`).

### Phase 2 / Step 9: Agricultural Frost & Spray Weather Risk Windows
- Interactive meteorological dashboard (`src/features/weather/WeatherDashboard.jsx`) providing parcel microclimate forecasts.
- 24-hour SVG temperature trendline generator (`TemperatureChart` in `WeatherWidgets.jsx`) with dynamic spline segments and min/max bounds.
- Spraying wind risk metrics (instant wind speed, gust velocities, wind directions) and frost risk detection.
- Atmospheric humidity, dew point temperature, and precipitation probabilities formatted with localized Turkish agronomical terminology (`weather-format.js`).

### Phase 2 / Step 10: Deployment Verification & Smoke Test Harness
- Comprehensive live production verification suite (`scripts/verify-deployment.mjs`) automatically testing authentication, parcel CRUD, Sentinel analysis queueing, and NDMI raster extraction.
- Ephemeral test account lifecycle: creates unique verification accounts and completely purges them in `finally` blocks ensuring zero production pollution.
- Local HTTP smoke test harness (`server/smoke-test.js`) verifying auth limits, place search geocoding (`server/places.js`), and soft-delete/restore workflows.

### Phase 3 / Step 11: GitHub Actions CI Pipeline Workflow
- Continuous integration automation (`.github/workflows/ci.yml`) triggered on pushes and pull requests to `main`.
- Node.js 24 runtime validation with npm dependency caching.
- Automated code linting (`oxlint`), production Vite build verification, and native Node test runner (`node --test`).

### Phase 3 / Step 12: Commercial Engine Durability & Telemetry Tests
- Boundary resilience and upstream failure isolation test suite (`server/provider-boundary.test.js`).
- Strict credential and bearer token redaction in upstream provider error dumps.
- Upstream rate-limit (HTTP 429) backoff retention, empty dataset protection against zero-injection, and malformed payload guardrails.
- Rigorous ISO calendar date and leap day validation test suite (`server/dates.test.js`).

---

### Getting Started

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Start local development server
npm run dev
```
