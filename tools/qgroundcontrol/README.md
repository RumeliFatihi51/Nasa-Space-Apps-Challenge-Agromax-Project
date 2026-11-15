# AgroMax QGroundControl for Windows

The Windows build uses the complete upstream QGroundControl **5.1.5** GUI and packaged components. The build applies AgroMax artwork, Windows icon and light/dark surface colors to a reviewed upstream commit. Map symbols and alert colors keep their upstream meanings. The AgroMax application and organization names give the build its own settings.

## Build and install

1. Open **Releases** in the AgroMax GitHub repository and find **AgroMax QGroundControl 5.1.5 for Windows**.
2. Run `AgroMax-QGroundControl-Windows-x64.exe`. Keep the installer in a separate directory from the stock QGroundControl installation.
3. In AgroMax, open **Uçuş planı → Masaüstünde aç**. Confirm the browser's app-opening prompt. Download the plan from the parcel and import it through **Plan → File → Open** in the desktop application.

The installer registers the URI handler for a fixed executable and removes it on uninstall. It passes zero URI arguments. For a portable build, register the same handler under your Windows account:

   ```powershell
   .\Register-AgroMaxGroundControl.ps1 -Executable "C:\Program Files\AgroMax-QGroundControl\bin\AgroMax-QGroundControl.exe"
   ```

Remove the portable handler by removing only `HKCU:\Software\Classes\agromax-qgc`.

For local source development, use an upstream git checkout at the pin in `brand.mjs` and the matching Qt/Windows dependencies. Run `node tools/qgroundcontrol/brand.mjs <checkout>`, then configure a fresh upstream CMake build with `-DQGC_APP_NAME=AgroMax-QGroundControl -DQGC_ORG_NAME=AgroMax -DQGC_ENABLE_GST_VIDEOSTREAMING=ON`. Upstream source and its Apache 2.0/GPLv3 license notices remain in the [pinned QGroundControl source](https://github.com/mavlink/qgroundcontrol/tree/3a67d31f0c36bf3fe38ec52970d250a89d0aaf67).
