# Archived Flight Center

The full telemetry, simulation and command UI was disabled at the user's request.
The active flight page now provides map-based planning and .plan downloads.

The complete pre-change repository is preserved on branch
`archive/flight-center-2026-11-15`, starting at commit
`4ab7502e36c9d729e0e7504aeb15cefacbc5f4a2`.

FlightDeck and its UI tests are kept here as reference. Their imports refer to
their original source locations. Restore them from the archive branch when
reactivating this feature. The local MAVSDK bridge remains under
`tools/flight-bridge` and is not imported, launched or contacted by the planner.
Existing saved plans and mission records are retained.
