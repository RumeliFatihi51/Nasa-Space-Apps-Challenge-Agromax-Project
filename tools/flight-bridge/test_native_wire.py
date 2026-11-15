"""Explicit synthetic MAVLink wire integration against the real native SDK."""
import asyncio
import contextlib
import json
import socket
import subprocess
import unittest
from pathlib import Path

from control import Controller
from native_sdk import NativeDrone


class NativeWireTests(unittest.IsolatedAsyncioTestCase):
    async def test_wire_position_is_received_and_expires_after_source_loss(self):
        root = Path(__file__).resolve().parents[2]
        packets = json.loads(subprocess.check_output([
            "node", "--input-type=module", "-e",
            "import {telemetryPackets} from './server/fixtures/mavlink.mjs';"
            "console.log(JSON.stringify(telemetryPackets().map(p=>Array.from(p))));",
        ], cwd=root, text=True))
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as reserve:
            reserve.bind(("127.0.0.1", 0))
            port = reserve.getsockname()[1]
        drone = NativeDrone()
        controller = Controller(drone, mode="live")
        task = asyncio.create_task(drone.run(controller, f"udpin://127.0.0.1:{port}"))
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as source:
            try:
                for _ in range(80):
                    for packet in packets:
                        source.sendto(bytes(packet), ("127.0.0.1", port))
                    await asyncio.sleep(.2)
                    if task.done():
                        await task
                    state = controller.snapshot()
                    if state["connected"]:
                        break
                self.assertTrue(state["connected"], "Synthetic source should be discovered by native MAVSDK")
                self.assertAlmostEqual(state["telemetry"]["position"]["latitude"], 38.5005)
                self.assertAlmostEqual(state["telemetry"]["position"]["longitude"], 27.5005)
                self.assertFalse(state["commandsEnabled"])
                await asyncio.sleep(7)
                state = controller.snapshot()
                self.assertFalse(state["connected"], "Expired source must never remain connected")
                self.assertNotIn("position", state["telemetry"])
            finally:
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await task
                drone.close()


if __name__ == "__main__":
    unittest.main()
