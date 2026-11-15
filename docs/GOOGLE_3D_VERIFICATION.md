# Google 3D provider verification

Date: 2026-11-15. Google Photorealistic 3D Tiles via Cesium ion asset 2275207.

## Behavior

The existing Mapbox/MapLibre scene and analysis functions remain the default. A configured `VITE_CESIUM_ION_TOKEN` enables the **Google 3D** button in the 3D Field Studio. The Google scene uses the selected field's stored geometry and real coordinates; it does not use Blender renders. Google is visual context, not a new numerical analysis provider. Existing NDVI/NDMI raster and measurement controls remain available by returning to Mapbox.

The Google camera target is sampled from the actual 3D surface before framing. Using ellipsoid height zero caused the camera to start underneath elevated land (the tested local parcel surface was approximately 896 m high). The boundary is a ground-clamped polyline; terrain-clamped polygon outlines are not supported by Cesium. Overhead and oblique presets share the field target. Credits remain visible.

The initial deadline covers provider access, height sampling, and visible tile loading, not merely successful metadata access. Missing surface coverage, provider errors or the 45-second deadline return to the original scene with a reason. Closing or Escape preserves the original map and field selection. Viewer resources and listeners are destroyed. Keyboard focus returns to the opener. Mobile uses a lower detail threshold, capped rendering scale and a 64 MB tile cache (32 MB overflow); these are cache budgets, not total GPU memory guarantees.

## Configuration and rollback

Put the authorized public ion token in ignored `.env.local` for development, or the deployment's build environment. Use an assets-read token limited to the required asset and approved application domains. Never commit the value. Restart/rebuild after changing a Vite variable. Cesium Workers, Assets, ThirdParty and Widgets are copied to `/cesium/` in both build paths.

The tested account displays **Upgrade for commercial use**. Local verification is not commercial production approval; confirm the relevant account plan and Google/Cesium usage terms before enabling that token in a commercial deployment. Do not hide the credits. No paid plan or billing change was made.

Disable by clearing `VITE_CESIUM_ION_TOKEN` and rebuilding: the Google button disappears and the original Mapbox scene remains. No database or record migration is involved. A second provider was unnecessary because real Google tiles and sampled terrain loaded successfully.

## Evidence and checks

- Actual Google service, not mocked imagery: stored local parcel near 32.0977 E, 39.2018 N. Real terrain, imagery and boundary inspected at 1440×941 and 390×844. Camera presets and Mapbox return exercised; no page exceptions or mobile horizontal overflow in isolated component check.
- Screenshots: `outputs/cesium-trial-desktop.png`, `outputs/cesium-trial-overhead.png`, `outputs/cesium-trial-mobile.png` (local evidence, not bundled).
- Typecheck passed. Standard production build passed. Commercial build passed in isolated `data/cesium-commercial/.output`; the existing root `.output` had a Windows native module lock, so it was left running and untouched.
- Opt-in application browser checks: `AGROMAX_VERIFY_GOOGLE_3D=true` with configured build token, `playwright test e2e/google-3d.spec.ts`. Real Google access and explicit 503 failure fixture are separate cases. Existing scientific fixtures remain synthetic and labeled; they do not replace Google tile requests.
- To test an isolated commercial output set `AGROMAX_BROWSER_SERVER_ENTRY=data/cesium-commercial/.output/server/index.mjs`.

Verified coverage is limited to tested locations and network conditions; it is not a worldwide completeness or physical-device performance certification. Photogrammetry dates/coverage can differ from the satellite analysis dates.

Final automated results: typecheck passed; both production builds passed (commercial output isolated because of the pre-existing Windows file lock). Google application suite: **4 passed**, including visible-texture checks at desktop/mobile and provider-failure fallback. Existing Field Studio regression: **2 passed**, covering indices, tasks and parcel navigation on desktop/mobile; **2 live Mapbox-only checks skipped** because their separate `AGROMAX_VERIFY_MAPBOX` opt-in was not enabled. This does not claim fresh external Mapbox provider certification. Test logs are local `data/cesium-inapp-visual.log` and `data/cesium-studio-regression.log`.

No Vercel token/billing setting or production deployment was changed during this verification. Enable commercial Google usage only after account rights are confirmed; the existing production Mapbox configuration is retained.
