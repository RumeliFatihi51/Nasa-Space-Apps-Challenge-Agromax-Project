# AgroMax Flight Bridge

This release adds a local MAVSDK bridge, a dedicated Flight Center, and an operator-confirmed mission workflow. Live hardware mode supports telemetry. Mission upload, read-back verification, start, pause and RTL are enabled only in an explicitly selected local SITL session. Hardware qualification and a full autopilot SITL flight remain pending.

## Installation

Use Python 3.11 or later. From this directory run the following on Windows.

```powershell
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
```

MAVSDK 4.2.0 is pinned to its native Python API. No gRPC command server is started. Native SDK operations use one worker to preserve ordering even if an HTTP caller times out.

Start a local PX4 SITL instance configured to send MAVLink to loopback port 14540, then run the bridge.

```powershell
.venv/Scripts/python bridge.py --address udpin://127.0.0.1:14540 --mode sitl --enable-sitl-commands --origin https://agromax-field.vercel.app
```

For hardware telemetry, use the device's actual serial port and baud rate.

```powershell
.venv/Scripts/python bridge.py --address serial://COM5:57600 --mode live --origin https://agromax-field.vercel.app
```

For a local AgroMax server, use its exact origin instead. The bridge listens only on 127.0.0.1 port 5189. Enter its printed one-time pairing token in Flight Center. The browser may request local network access. Tokens remain in React memory and rotate when the bridge restarts. Avoid sharing the bridge console.

## Operator workflow

1. Select the parcel in Flight Center.
2. Open the map's .plan panel, supply measured home coordinates and AMSL height, generate and save a plan.
3. Pair the bridge and select that saved plan. Its parcel geometry revision must match the current parcel.
4. In local SITL mode with motors off, upload. The bridge downloads the mission and compares all mission coordinates, altitude frames, commands, parameters and order.
5. Review GPS/home/calibration and battery status. Arm the simulator using the ground station.
6. Confirm start. The bridge downloads the mission again and checks connection epoch, health, motor state and battery before sending start.
7. Observe mission progress and telemetry. Pause and RTL each require an explicit operator confirmation.

The bridge never arms or automatically retries commands. A command acknowledgement means the autopilot accepted the request. Completion must be observed from vehicle telemetry. If a request times out or the outcome is uncertain, inspect the vehicle and reconcile while disarmed before starting again. Autopilot-managed link-loss behavior must be configured and verified in the actual flight stack.

## Integrity and recovery

- A single asynchronous lock serializes all mission mutations.
- Repeated request IDs return their original result. Reusing an ID with another payload is rejected.
- Position freshness is limited to five seconds. Battery is also freshness checked.
- Discrete MAVSDK state callbacks are valid only within their connection epoch. Reconnect clears them.
- Before start, the current mission must match the downloaded baseline, including order, units and altitude reference.
- Start also requires a landed state, position within 30 m of the planned takeoff reference, and AMSL within 20 m. These are conservative SITL checks, not calibrated operational tolerances. Takeoff and landing coordinates must match the plan's home reference.
- The journal is flushed and fsynced before sending each command. A journal failure prevents dispatch.
- After process restart, pairing token and verified mission are reset. A new upload is required.
- Every new browser confirmation uses a new ID. A lost HTTP response clears browser verification. Operator reconciliation is required.
- Only takeoff, waypoint, speed and land commands in the existing AgroMax plan format are accepted.
- This bridge provides no obstacle avoidance, terrain-following certification, spraying actuation or device-specific flight qualification.
- Command state and journal are local to the operator computer. Existing saved plans remain in AgroMax's authorized storage.

## Verification

```powershell
python -m unittest discover -s . -p test_control.py
.venv/Scripts/python -m unittest discover -s . -p test_native_wire.py
```

Control tests use explicit SDK doubles to exercise lost ACKs, reconnects, stale data, mission mismatch, duplicate and concurrent requests, low battery, invalid commands, and journal failure. These tests do not certify aircraft behavior.

The native wire test feeds explicitly synthetic MAVLink packets from the existing repository fixture through UDP into the actual native MAVSDK. It checks coordinates and connection expiry after transmission stops. It requires Node.js and the bridge dependencies. It performs no vehicle commands.

Before enabling real command support, complete an actual PX4/ArduPilot SITL flight, a hardware-specific bench test, coordinate/AMSL checks, link-loss and low-battery failsafe tests, flight log review and controlled field verification. The current command gate is an implementation boundary until that work is completed.

## Architecture and licensing

The existing React GIS and mission planner remain the UI. The bridge uses MAVSDK-Python, an independent local process. MAVSDK upstream is BSD-3-Clause. Preserve dependency notices when packaging a distributable.

Upstream references

- https://github.com/mavlink/MAVSDK
- https://mavsdk.mavlink.io/main/en/python/
- https://docs.px4.io/main/en/sim_gazebo_gz/
- https://ardupilot.org/dev/docs/sitl-simulator-software-in-the-loop.html

Fields2Cover optimization, MediaMTX video, multi-battery resume and OpenDroneMap processing are future integrations. They are not included in this bridge.
