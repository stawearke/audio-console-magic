# Digital mixer upgrade
- [x] Add real voice, music, shared desktop audio, and sample mixer channels.
- [x] Add mixer surface, mute/solo/pan, master recording, and file-based scene recall.
- [x] Preserve the voice processing rack and clarify OBS routing.
- [x] Verify live microphone/music audio, audible master recording, solo/scene recall, and desktop/mobile layout. Desktop sharing requires the user's browser selection and was not exercised here.

# Hardware console appearance
- [x] Restyle the working desk to match the supplied metallic digital-mixer references.
- [x] Verify channel controls, voice processing, and narrow-screen layout. Existing tests pass; bundled renderer opens without runtime errors and mute updates. The narrow view retains horizontal scrolling.

# Updated Windows app delivery
- [x] Bundle the current mixer into the Windows desktop app and verify its screen and mute control.
- [x] Provide smaller download parts with an automatic join-and-open launcher. Native Windows launch and hardware audio remain unverified because this environment is Linux.

# Speaker placement planner
- [ ] Add a scaled, drawable floor plan, speaker types, and editable placement.
- [ ] Add estimated coverage and per-speaker level, aiming, and delay recommendations with file-based plan saving.
- [ ] Test placement calculations and verify drawing, recommendations, and narrow-screen controls.