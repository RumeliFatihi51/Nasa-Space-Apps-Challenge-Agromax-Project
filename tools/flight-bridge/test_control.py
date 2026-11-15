import asyncio
import copy
import time
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from control import Controller, Rejected, validate_plan, digest

KEYS = ("seq", "frame", "command", "current", "autocontinue", "param1", "param2",
        "param3", "param4", "x", "y", "z", "mission_type")


def item(*args):
    return SimpleNamespace(**dict(zip(KEYS, args)))


def plan():
    def row(command, altitude):
        return {"type": "SimpleItem", "autoContinue": True, "command": command, "frame": 3,
                "params": [0, 0, 0, None, 38.5, 27.5, altitude]}
    return {"fileType": "Plan", "version": 1, "mission": {
        "firmwareType": 12, "vehicleType": 2, "plannedHomePosition": [38.5, 27.5, 160],
        "items": [row(22, 35), row(16, 35), row(21, 0)]}}


class ControlTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.mission = SimpleNamespace(upload_mission=AsyncMock(), download_mission=AsyncMock(),
            start_mission=AsyncMock(), pause_mission=AsyncMock())
        self.drone = SimpleNamespace(mission_raw=self.mission,
            action=SimpleNamespace(return_to_launch=AsyncMock()))
        self.controller = Controller(self.drone, commands=True, mode="sitl")
        self.controller.connection(True)
        self.controller.update("position", {"latitude": 38.5, "longitude": 27.5, "altitudeMslM": 160})
        self.controller.update("armed", False)
        self.controller.update("inAir", False)
        self.controller.update("health", {"home": True, "position": True, "gyro": True, "accelerometer": True, "magnetometer": True})
        self.controller.update("battery", {"remainingPercent": 90})
        self.controller.update("identity", {"uid": "EXPLICIT-SDK-DOUBLE", "version": "test"})
        self.mission.download_mission.return_value = validate_plan(plan(), item)
        self.counter = 0

    def request(self, action, **kwargs):
        self.counter += 1
        return {"id": str(self.counter).zfill(36), "action": action,
            "epoch": self.controller.epoch, "confirmed": True, **kwargs}

    async def upload(self):
        result = await self.controller.execute(self.request("upload", plan=plan()), item)
        self.assertTrue(result["ok"])
        return self.controller.verified["fingerprint"]

    async def test_upload_reads_back_and_start_checks_again(self):
        fingerprint = await self.upload()
        self.controller.update("armed", True)
        result = await self.controller.execute(self.request("start", fingerprint=fingerprint), item)
        self.assertTrue(result["ok"])
        self.assertEqual(self.mission.download_mission.await_count, 2)
        self.mission.start_mission.assert_awaited_once()

    async def test_mismatch_blocks_start(self):
        await self.upload()
        self.mission.download_mission.return_value[1].x += 100
        self.controller.update("armed", True)
        result = await self.controller.execute(
            self.request("start", fingerprint=self.controller.verified["fingerprint"]), item)
        self.assertFalse(result["ok"])
        self.mission.start_mission.assert_not_awaited()
        self.assertTrue(self.controller.uncertain)

    async def test_lost_ack_is_uncertain_and_never_retried(self):
        self.mission.upload_mission.side_effect = TimeoutError()
        request = self.request("upload", plan=plan())
        first = await self.controller.execute(request, item)
        second = await self.controller.execute(request, item)
        self.assertEqual(first, second)
        self.mission.upload_mission.assert_awaited_once()
        with self.assertRaises(Rejected):
            await self.controller.execute(self.request("upload", plan=plan()), item)

    async def test_reconnect_invalidates_previous_mission_and_telemetry(self):
        await self.upload()
        old = self.request("start", fingerprint=self.controller.verified["fingerprint"])
        self.controller.connection(False)
        self.controller.connection(True)
        self.assertIsNone(self.controller.verified)
        self.assertEqual(self.controller.snapshot()["telemetry"], {})
        with self.assertRaises(Rejected):
            await self.controller.execute(old, item)

    async def test_stale_position_and_low_battery_block_start(self):
        fingerprint = await self.upload()
        self.controller.update("armed", True)
        self.controller.times["position"] = time.monotonic() - 6
        with self.assertRaises(Rejected):
            await self.controller.execute(self.request("start", fingerprint=fingerprint), item)
        self.controller.update("position", {})
        self.controller.update("battery", {"remainingPercent": 5})
        with self.assertRaises(Rejected):
            await self.controller.execute(self.request("start", fingerprint=fingerprint), item)
        self.mission.start_mission.assert_not_awaited()

    async def test_live_hardware_commands_are_disabled(self):
        self.controller.mode = "live"
        controller = Controller(self.drone, commands=True, mode="live")
        self.assertFalse(controller.commands)
        with self.assertRaises(Rejected):
            await controller.execute(self.request("upload", plan=plan()), item)
        self.mission.upload_mission.assert_not_awaited()

    async def test_wrong_takeoff_location_blocks_start(self):
        fingerprint = await self.upload()
        self.controller.update("armed", True)
        self.controller.update("position", {"latitude": 39.5, "longitude": 27.5, "altitudeMslM": 160})
        with self.assertRaises(Rejected):
            await self.controller.execute(self.request("start", fingerprint=fingerprint), item)
        self.mission.start_mission.assert_not_awaited()

    async def test_unknown_battery_cannot_pass_preflight(self):
        fingerprint = await self.upload()
        self.controller.update("armed", True)
        for value in (float("nan"), None, 101):
            self.controller.update("battery", {"remainingPercent": value})
            with self.assertRaises(Rejected):
                await self.controller.execute(self.request("start", fingerprint=fingerprint), item)
        self.mission.start_mission.assert_not_awaited()

    async def test_reused_id_with_different_body_is_rejected(self):
        request = self.request("upload", plan=plan())
        await self.controller.execute(request, item)
        with self.assertRaises(Rejected):
            await self.controller.execute({**request, "action": "pause"}, item)

    async def test_concurrent_duplicate_requests_send_once(self):
        request = self.request("upload", plan=plan())
        results = await asyncio.gather(
            self.controller.execute(request, item), self.controller.execute(request, item))
        self.assertTrue(all(result["ok"] for result in results))
        self.mission.upload_mission.assert_awaited_once()

    async def test_journal_failure_prevents_command(self):
        self.controller.journal = lambda event: (_ for _ in ()).throw(OSError())
        with self.assertRaises(OSError):
            await self.controller.execute(self.request("upload", plan=plan()), item)
        self.mission.upload_mission.assert_not_awaited()

    def test_unsupported_commands_nan_and_wrong_altitude_frame(self):
        for change in [
            lambda row: row.update(command=183),
            lambda row: row.update(frame=0),
            lambda row: row["params"].__setitem__(6, float("nan")),
            lambda row: row["params"].__setitem__(4, 100),
        ]:
            value = copy.deepcopy(plan())
            change(value["mission"]["items"][1])
            with self.assertRaises(Rejected):
                validate_plan(value, item)

    def test_wire_float32_rounding_preserves_fractional_mission(self):
        import struct
        expected = validate_plan(plan(), item)
        expected[1].z = 35.123
        expected[1].param2 = 1.1
        received = copy.deepcopy(expected)
        for row in received:
            for key in ("param1", "param2", "param3", "param4", "z"):
                setattr(row, key, struct.unpack("<f", struct.pack("<f", getattr(row, key)))[0])
        self.assertEqual(digest(expected), digest(received))


if __name__ == "__main__":
    unittest.main()
