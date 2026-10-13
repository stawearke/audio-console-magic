// VOXONE Stream Console — Electron desktop shell.
// Loads the static SPA build (dist/client/index.html) and grants mic access.
const { app, BrowserWindow, session, desktopCapturer } = require("electron");
const path = require("path");

const ALLOWED_PERMISSIONS = new Set(["media", "audioCapture", "screen", "display-capture"]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "VOXONE Stream Console",
    backgroundColor: "#0b0f14",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // dist/client is where the SPA build lands.
  win.loadFile(path.join(__dirname, "..", "dist", "client", "index.html"));
}

app.whenReady().then(() => {
  const ses = session.defaultSession;

  // The mixer needs microphone access and, for the DESKTOP channel, screen capture.
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));

  // Auto-share the primary screen with loopback audio when the app asks (Windows).
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }))
      .catch(() => callback({}));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
