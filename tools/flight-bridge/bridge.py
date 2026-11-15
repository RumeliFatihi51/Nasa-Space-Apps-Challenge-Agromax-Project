"""Run next to the operator's telemetry radio. Bind exclusively to loopback."""
import argparse
import asyncio
import contextlib
import hmac
import json
import os
import secrets
from pathlib import Path

from aiohttp import web
from native_sdk import NativeDrone, MissionItem

from control import Controller, Rejected


async def run(args):
    token = secrets.token_urlsafe(32)
    drone = NativeDrone()
    log = Path(args.journal).open("a", encoding="utf-8")
    def journal(event):
        log.write(json.dumps(event) + "\n")
        log.flush()
        os.fsync(log.fileno())
    controller = Controller(drone, mode=args.mode, commands=args.enable_sitl_commands, journal=journal)

    @web.middleware
    async def boundary(request, handler):
        origin = request.headers.get("Origin")
        if origin != args.origin:
            return web.json_response({"error": "Origin reddedildi."}, status=403)
        headers = {
            "Access-Control-Allow-Origin": args.origin, "Vary": "Origin",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Private-Network": "true", "Cache-Control": "no-store",
        }
        if request.method == "OPTIONS":
            return web.Response(headers=headers)
        if not hmac.compare_digest(request.headers.get("Authorization", ""), "Bearer " + token):
            return web.json_response({"error": "Eşleştirme anahtarı geçersiz."}, status=401, headers=headers)
        try:
            response = await handler(request)
        except Rejected as error:
            response = web.json_response({"error": str(error)}, status=409)
        except (ValueError, TypeError, KeyError):
            response = web.json_response({"error": "Geçersiz istek."}, status=400)
        response.headers.update(headers)
        return response

    app = web.Application(middlewares=[boundary], client_max_size=262144)
    async def status(request):
        return web.json_response(controller.snapshot())
    async def command(request):
        return web.json_response(await controller.execute(await request.json(), MissionItem))
    app.router.add_get("/status", status)
    app.router.add_post("/command", command)
    app.router.add_route("OPTIONS", "/{path:.*}", status)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", args.port).start()
    print(f"AgroMax Flight Bridge · {args.mode} · http://127.0.0.1:{args.port}", flush=True)
    print(f"Eşleştirme anahtarı: {token}", flush=True)

    task = asyncio.create_task(drone.run(controller, args.address))
    try:
        await task
    finally:
        controller.connection(False)
        await runner.cleanup()
        drone.close()
        log.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--address", required=True, help="MAVSDK serial:// or udpin:// connection")
    parser.add_argument("--origin", required=True, help="Exact AgroMax origin, e.g. https://agromax-field.vercel.app")
    parser.add_argument("--port", type=int, default=5189)
    parser.add_argument("--mode", choices=["live", "sitl"], default="live")
    parser.add_argument("--enable-sitl-commands", action="store_true")
    parser.add_argument("--journal", default="flight-journal.jsonl")
    options = parser.parse_args()
    if options.enable_sitl_commands and (options.mode != "sitl" or options.address != "udpin://127.0.0.1:14540"):
        parser.error("Komut modu yalnızca yerel SITL adresiyle açılır.")
    with contextlib.suppress(KeyboardInterrupt):
        asyncio.run(run(options))
