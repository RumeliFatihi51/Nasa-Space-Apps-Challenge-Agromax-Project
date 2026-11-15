import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtWebEngine
import QGroundControl

Item {
    id: shell
    property bool platformVisible: true
    property string pendingPlan: ""
    property string status: ""
    property var openNative
    readonly property string platformOrigin: "https://agromax-field.vercel.app"
    function openGroundControl() {
        if (openNative()) platformVisible = false
    }
    Rectangle {
        anchors.fill: parent
        color: "#17372a"
        RowLayout {
            anchors.fill: parent
            anchors.margins: 6
            spacing: 10
            Image { source: "qrc:/res/AgroMaxLogo.svg"; sourceSize.width: 130; Layout.preferredWidth: 130; Layout.preferredHeight: 34; fillMode: Image.PreserveAspectFit }
            Button { text: "AgroMax"; checked: shell.platformVisible; onClicked: shell.platformVisible = true }
            Button { text: "QGroundControl"; checked: !shell.platformVisible; onClicked: shell.openGroundControl() }
            Label {
                readonly property var vehicle: QGroundControl.multiVehicleManager.activeVehicle
                text: vehicle ? (vehicle.armed ? "Araç kurulu" : "Araç bağlı") : "Araç bağlı değil"
                color: vehicle && vehicle.armed ? "#ffce70" : "#f6f3e4"
            }
            Label { text: shell.status; color: "#f6f3e4"; elide: Text.ElideRight; Layout.fillWidth: true }
            Button {
                text: "İndirilen planı aç"
                visible: shell.pendingPlan !== ""
                onClicked: {
                    if (mainWindow.agromaxImportPlan(shell.pendingPlan)) {
                        shell.platformVisible = false
                        shell.pendingPlan = ""
                    }
                }
            }
            Button { text: "Yenile"; visible: shell.platformVisible; onClicked: browser.reload() }
        }
    }
    // A separate persistent profile preserves AgroMax's own cookies between launches.
    WebEngineProfile {
        id: agroProfile
        storageName: "AgroMaxPlatform"
        offTheRecord: false
        onDownloadRequested: function(download) {
            const filename = download.downloadFileName.replace(/[^a-zA-Z0-9._-]/g, "_")
            download.downloadFileName = Date.now() + "-" + filename
            download.accept()
            shell.status = "Dosya indiriliyor…"
        }
        onDownloadFinished: function(download) {
            if (download.state === WebEngineDownloadRequest.DownloadCompleted) {
                shell.status = "Dosya indirildi"
                if (download.downloadFileName.toLowerCase().endsWith(".plan"))
                    shell.pendingPlan = download.downloadDirectory + "/" + download.downloadFileName
            } else {
                shell.status = "İndirme tamamlanamadı"
            }
        }
    }
    WebEngineView {
        id: browser
        objectName: "agromax_platform_web"
        parent: mainWindow.contentItem
        anchors.fill: parent
        z: 50
        visible: shell.platformVisible
        profile: agroProfile
        url: shell.platformOrigin
        onNavigationRequested: function(request) {
            const address = request.url.toString()
            if (address === "agromax-qgc://open" || address === "agromax-qgc://open/") {
                request.reject()
                shell.openGroundControl()
            } else if (request.isMainFrame && address !== "about:blank" &&
                       address !== shell.platformOrigin &&
                       !address.startsWith(shell.platformOrigin + "/")) {
                request.reject()
                shell.status = "Dış bağlantıyı normal tarayıcıda aç."
            }
        }
        onLoadingChanged: function(info) {
            if (info.status === WebEngineView.LoadFailedStatus)
                shell.status = "AgroMax bağlantısı kurulamadı. Yenile ile tekrar dene."
            else if (info.status === WebEngineView.LoadSucceededStatus)
                shell.status = ""
        }
        onCertificateError: function(error) { error.rejectCertificate() }
    }
}
