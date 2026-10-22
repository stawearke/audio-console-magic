# Build coordinated news graphics packages

## Goal
Turn the individual graphic templates into polished, ready-to-use news packages that can be added to a rundown in one action.

## What will change
- Add several coordinated package presets for breaking news, live reports, interviews, and headline bulletins.
- Give every package matching sample copy, timing, transitions, and a coherent theme.
- Add a package section above the individual template library with clear previews and an “Add package” action.
- Keep individual templates available for custom rundowns.
- Improve the rundown so package items are visibly grouped and easy to operate.
- Resolve current strict typing issues in the files touched by this work.

## Technical details
- Extend the broadcast item model with optional package metadata.
- Define package presets beside the existing templates and create package items through the existing item factory.
- Preserve local browser saving and the current preview/program playout flow.
- Verify the app compiles and test package insertion and preview behavior at desktop and mobile widths.
