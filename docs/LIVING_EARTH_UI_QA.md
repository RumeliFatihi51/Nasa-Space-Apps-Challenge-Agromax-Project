# Living Earth interface refresh — 2026-11-15

Scope: persistent navigation, pointer-local light, contextual navigation descriptions, secondary tabs, welcome page composition, loading scene, 200–260 ms route curtain, task-progress ring, parcel crop-count distribution, shared decision chart surfaces and research hero contrast. Existing routes, provider adapters, authorization and saved records are unchanged.

Motion: native pointer retained; decorative light is local to navigation, ignored for touch/reduced motion. Route curtain is non-interactive and cancelled on navigation cleanup. Existing scene media retain poster fallbacks, visibility and reduced-motion checks. No additional video downloads introduced. Manrope retained.

Data: task ring uses completed/all recorded tasks; crop bars use parcel counts (not acreage or health). Empty states display no invented scores. Tables remain semantic and existing exports/forms retain their handlers.

Verification:
- Typecheck passed; 100 server tests passed.
- Standard and isolated commercial builds passed.
- Local isolated SQLite app: welcome/navigation/weather at 1440, 768, 390 px without horizontal document overflow or JS exceptions.
- Populated isolated fields/tasks: 14 route smoke checks at 1440 and 390 px, reduced-motion curtain disabled, no JS exceptions or document overflow. Routes: fields, satellite, temporal, history, weather, twin, scenarios, economics, flight, tasks, assistant, integrations, plant-studio, overview.
- Screenshots and QA scripts in ignored data/living-* files. Live provider requests were not used to certify scientific output. Production proxy requests experienced intermittent network timeouts; isolated checks used genuine local endpoints and explicitly created test records.

Rollback: revert this UI commit; no database migrations or environment changes.
