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
