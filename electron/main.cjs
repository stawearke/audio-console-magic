// VOXONE Stream Console — Electron desktop shell.
// Serves the static SPA build (dist/client) from a private localhost server so
// routing and absolute asset paths work, and grants mic/screen-audio access.
const { app, BrowserWindow, session, desktopCapturer } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");

const ALLOWED_PERMISSIONS = new Set(["media", "audioCapture", "screen", "display-capture"]);
const ROOT = path.join(__dirname, "..", "dist", "client");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".txt": "text/plain" };

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/\.\//, "/");
      let file = path.normalize(path.join(ROOT, url));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, "index.html");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    title: "VOXONE Stream Console", backgroundColor: "#0b0f14", autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(`http://127.0.0.1:${port}/audio`);
}

app.whenReady().then(async () => {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(ALLOWED_PERMISSIONS.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission));
  // Auto-share the primary screen with loopback (system) audio for the DESKTOP channel (Windows).
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] })
      .then((sources) => callback({ video: sources[0], audio: "loopback" }))
      .catch(() => callback({}));
  });
  const port = await startServer();
  createWindow(port);
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(port); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
