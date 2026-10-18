<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep browser audio processing and source routing in AudioEngine; console views only control it so all sources share one master output.
- Mixer scenes are explicit JSON file imports/exports; do not introduce hosted storage for device-specific mixer settings.
- Keep the selected-channel overview in ChannelOverview and drive it with Mixer channel state and shared Params so duplicated controls always operate on the same audio settings.
- Keep speaker planning in a browser-safe geometry module and a separate console view, with explicit JSON plan files; estimates must never silently change live mixer audio.
