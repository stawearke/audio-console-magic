# MK VISION Broadcast Suite

One app, three tools (all code unchanged from the originals):

| Route | Tool |
|---|---|
| `/` `/cam` `/graphics` `/playout` `/prompter` `/rundown` `/settings` `/sounds` | MK VISION live switcher for OBS (incl. Playout, News Desk, Graphics Studio, pre-listen) |
| `/onair` | OnAir Studio, broadcast graphics control room |
| `/output` | Transparent OnAir output for an OBS Browser Source (`?mode=preview`, `?key=green`) |
| `/audio` | VOXONE D16 digital mixing console (also the Electron desktop entry) |

The pre-listen helper scripts and MediaMTX config are in `audio-bridge/`.

```
npm install --legacy-peer-deps
npm run dev
npm run build
npm test          # bun test tests (MK engine) + vitest (web/audio)
```

Built with [Lovable](https://lovable.dev).
