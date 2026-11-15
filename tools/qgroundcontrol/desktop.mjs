import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const checkout = resolve(process.argv[2] || ".");
function edit(path, before, after) {
  const file = resolve(checkout, path);
  const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (source.split(before).length !== 2) throw new Error("Desktop source anchor changed: " + path);
  writeFileSync(file, source.replace(before, () => after));
}
const configFile = resolve(checkout, ".github/build-config.json");
const config = JSON.parse(readFileSync(configFile, "utf8"));
config.qt.modules += " qtwebengine qtwebchannel";
writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
edit("CMakeLists.txt", "        Graphs\n", "        WebEngineQuick\n        WebChannel\n        Graphs\n");
edit("CMakeLists.txt", "qgc_add_moccache_stats(${CMAKE_PROJECT_NAME})",
  "target_link_libraries(${CMAKE_PROJECT_NAME} PRIVATE Qt6::WebEngineQuick Qt6::WebChannel)\nqgc_add_moccache_stats(${CMAKE_PROJECT_NAME})");
edit("src/main.cc", '#include "Platform.h"', '#include "Platform.h"\n#include <QtWebEngineQuick/qtwebenginequickglobal.h>');
edit("src/main.cc", "    QGCApplication app(argc, argv, args);",
  "    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);\n    QtWebEngineQuick::initialize();\n    QGCApplication app(argc, argv, args);");
writeFileSync(resolve(checkout, "resources/AgroMaxDesktop.qml"),
  readFileSync(new URL("./AgroMaxDesktop.qml", import.meta.url)));
edit("qgcresources.qrc", '<file alias="AgroMaxLogo.svg">resources/AgroMaxLogo.svg</file>',
  '<file alias="AgroMaxLogo.svg">resources/AgroMaxLogo.svg</file>\n        <file alias="AgroMaxDesktop.qml">resources/AgroMaxDesktop.qml</file>');
edit("src/PlanView/PlanView.qml", "    QGCFileDialog {", `    function agromaxImportFile(filename) {
        if (_planMasterController.dirtyForSave || !mainWindow.allowViewSwitch()) {
            QGroundControl.showMessageDialog(_root, qsTr("AgroMax"), qsTr("Save or discard the current plan before importing another plan."))
            return false
        }
        if (QGroundControl.multiVehicleManager.activeVehicle && QGroundControl.multiVehicleManager.activeVehicle.armed) {
            QGroundControl.showMessageDialog(_root, qsTr("AgroMax"), qsTr("Disarm the vehicle before importing a plan."))
            return false
        }
        _planMasterController.loadFromFile(filename)
        _planMasterController.fitViewportToItems()
        _missionController.setCurrentPlanViewSeqNum(0, true)
        return true
    }

    QGCFileDialog {`);
edit("src/MainWindow/MainWindow.qml", "    //-------------------------------------------------------------------------\n    //-- Actions",
  `    header: Loader {
        id: agromaxShellLoader
        height: 56
        source: "qrc:/res/AgroMaxDesktop.qml"
        onLoaded: {
            item.width = Qt.binding(function() { return mainWindow.width })
            item.height = 56
            item.openNative = function() {
                if (!mainWindow.allowViewSwitch()) return false
                mainWindow.showPlanView()
                return true
            }
        }
    }
    function agromaxImportPlan(filename) {
        return planView.agromaxImportFile(filename)
    }

    //-------------------------------------------------------------------------
    //-- Actions`);
console.log("AgroMax platform and native QGroundControl share the same QML ApplicationWindow.");
