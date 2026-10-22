# SmartDev Broadcast Suite

One app, two tools (merged from `pixel-perfect-render-07066` and `audio-console-magic`, code unchanged):

| Route | What it is |
|---|---|
| `/` | OnAir Studio, the live broadcast graphics control room |
| `/output` | Transparent program/preview output for OBS Browser Source (`?mode=preview`, `?key=green`) |
| `/audio` | VOXONE D16 digital mixing console for OBS audio (also the Electron desktop entry) |

## Development

```
bun install
bun run dev      # vite dev
bun run test
bun run build
ELECTRON_BUILD=1 bun run build   # SPA build for the desktop app
```

Built with [Lovable](https://lovable.dev).
