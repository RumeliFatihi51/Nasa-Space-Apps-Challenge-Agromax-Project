import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const upstream = "3a67d31f0c36bf3fe38ec52970d250a89d0aaf67";
if (!process.argv[2]) throw new Error("Pass the QGroundControl v5.1.5 checkout path.");
const checkout = resolve(process.argv[2]);
const brand = fileURLToPath(new URL("../../public/brand/", import.meta.url));
if (execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim() !== upstream)
  throw new Error("QGroundControl source differs from the reviewed v5.1.5 commit.");

const ui = {
  window: ["#f7f4ea", "#f7f4ea", "#142720", "#142720"],
  windowShadeLight: ["#d4dbca", "#e7eade", "#3f5449", "#354b40"],
  windowShade: ["#e6e8dc", "#e6e8dc", "#23382f", "#23382f"],
  windowShadeDark: ["#d3dacd", "#d3dacd", "#1b3027", "#1b3027"],
  text: ["#68756c", "#203e31", "#a2b4a8", "#f6f4e9"],
  button: ["#e6e8dc", "#fffdf5", "#34473d", "#3a5446"],
  buttonBorder: ["#9ca99c", "#53764f", "#687e70", "#a5bd9e"],
  buttonText: ["#68756c", "#203e31", "#a2b4a8", "#f6f4e9"],
  buttonHighlight: ["#d8dfd2", "#3b6142", "#3a4c42", "#bed690"],
  buttonHighlightText: ["#536759", "#ffffff", "#bbcabc", "#17281d"],
  primaryButton: ["#d8dfd2", "#375d42", "#3a4c42", "#d0e4a6"],
  primaryButtonText: ["#536759", "#ffffff", "#bbcabc", "#17281d"],
  textField: ["#e6e8dc", "#fffdf5", "#253a30", "#1b3027"],
  textFieldText: ["#68756c", "#203e31", "#a2b4a8", "#f6f4e9"],
};
const palette = resolve(checkout, "src/QmlControls/QGCPalette.cc");
let source = readFileSync(palette, "utf8");
for (const [role, values] of Object.entries(ui)) {
  const match = new RegExp(`(DECLARE_QGC_COLOR\\(${role},\\s*)[^\\r\\n)]+(\\))`, "g");
  if ([...source.matchAll(match)].length !== 1) throw new Error("Palette role changed upstream: " + role);
  source = source.replace(match, (_, prefix, suffix) => prefix + values.map(value => JSON.stringify(value)).join(", ") + suffix);
}

const logo = readFileSync(resolve(brand, "agromax-logo-light-v1.svg"));
const mark = readFileSync(resolve(brand, "agromax-mark-light-v1.svg"));
const files = new Map();
function edit(path, original, updated) {
  const current = files.get(path) ?? readFileSync(resolve(checkout, path), "utf8");
  if (!current.includes(original)) throw new Error("Upstream branding anchor missing: " + path);
  files.set(path, current.replace(original, () => updated));
}

edit("qgcresources.qrc", '<file alias="QGCLogoFull.svg">resources/QGCLogoFull.svg</file>',
  '<file alias="QGCLogoFull.svg">resources/QGCLogoFull.svg</file>\n        <file alias="AgroMaxLogo.svg">resources/AgroMaxLogo.svg</file>');
for (const path of ["src/Toolbar/FlyViewToolBar.qml", "src/Toolbar/PlanViewToolBar.qml", "src/MainWindow/MainWindow.qml"])
  edit(path, '"/res/QGCLogoFull.svg"', '"/res/AgroMaxLogo.svg"');

const installer = "deploy/windows/nullsoft_installer.nsi";
const installAnchor = 'WriteUninstaller "$INSTDIR\\${EXENAME}-Uninstall.exe"';
const appProtocol = String.raw`Software\Classes\agromax-qgc`;
const executable = '$INSTDIR\\bin\\${EXENAME}.exe';
edit(installer, installAnchor, [
  installAnchor,
  `WriteRegStr HKLM "${appProtocol}" "" "URL:AgroMax QGroundControl"`,
  `WriteRegStr HKLM "${appProtocol}" "URL Protocol" ""`,
  `WriteRegStr HKLM "${appProtocol}\\shell\\open\\command" "" "$\\"${executable}$\\""`,
].join("\n    "));
edit(installer, 'Section "Uninstall"', `Section "Uninstall"\n    SetRegView 64\n    DeleteRegKey HKLM "${appProtocol}"`);
const images = {
  "resources/AgroMaxLogo.svg": logo,
  "resources/QGCLogoWhite.svg": mark,
  "deploy/windows/WindowsQGC.ico": readFileSync(new URL("./agromax.ico", import.meta.url)),
};
writeFileSync(palette, source);
for (const [path, contents] of files) writeFileSync(resolve(checkout, path), contents);
for (const [path, bytes] of Object.entries(images)) writeFileSync(resolve(checkout, path), bytes);
console.log("AgroMax logo, Windows icon and GUI palette applied to QGroundControl " + upstream);
