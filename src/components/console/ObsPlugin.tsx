import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Download } from "lucide-react";

const URL_LIVE = "https://audio-console-magic.lovable.app";

const luaScript = (url: string) => `-- VOXONE Stream Console - OBS script
-- Tools > Scripts > + > choose this file. Then click "Add VOXONE to current scene".
obs = obslua
local url = "${url}"

function script_description()
  return "<b>VOXONE Stream Console</b><br>Adds the VOXONE mixer as a browser source with audio controlled by OBS."
end

function script_properties()
  local p = obs.obs_properties_create()
  obs.obs_properties_add_text(p, "url", "Console URL", obs.OBS_TEXT_DEFAULT)
  obs.obs_properties_add_button(p, "add", "Add VOXONE to current scene", add_source)
  return p
end

function script_defaults(s) obs.obs_data_set_default_string(s, "url", url) end
function script_update(s) url = obs.obs_data_get_string(s, "url") end

function add_source()
  local scene_src = obs.obs_frontend_get_current_scene()
  if scene_src == nil then return false end
  local scene = obs.obs_scene_from_source(scene_src)
  local s = obs.obs_data_create()
  obs.obs_data_set_string(s, "url", url)
  obs.obs_data_set_int(s, "width", 1280)
  obs.obs_data_set_int(s, "height", 800)
  obs.obs_data_set_bool(s, "reroute_audio", true)
  obs.obs_data_set_bool(s, "shutdown", false)
  local src = obs.obs_source_create("browser_source", "VOXONE Console", s, nil)
  local item = obs.obs_scene_add(scene, src)
  obs.obs_sceneitem_set_visible(item, false)
  obs.obs_source_release(src)
  obs.obs_data_release(s)
  obs.obs_source_release(scene_src)
  return false
end
`;

export function ObsPlugin() {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" && window.location.hostname !== "localhost" ? window.location.origin : URL_LIVE;
  const download = () => {
    const blob = new Blob([luaScript(url)], { type: "text/x-lua" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "voxone-obs.lua"; a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <details className="obs-help mt-4 rounded-lg p-4 text-sm" open>
      <summary className="module-title cursor-pointer text-xs font-bold uppercase tracking-[0.2em]">OBS plugin</summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={download}><Download /> Download OBS script</Button>
        <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); setCopied(true); }}>
          <Copy /> {copied ? "Copied" : "Copy dock link"}
        </Button>
      </div>
      <ol className="label-text mt-3 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
        <li><b>Dock panel:</b> in OBS open <b>Docks → Custom Browser Docks</b>, name it VOXONE, paste the dock link, Apply. The mixer now lives inside OBS.</li>
        <li><b>Audio source:</b> in OBS open <b>Tools → Scripts</b>, click <b>+</b>, pick <b>voxone-obs.lua</b>, then press <b>Add VOXONE to current scene</b>. A “VOXONE Console” source appears in the OBS audio mixer.</li>
        <li>Right-click that source → <b>Interact</b>, press Start mic once and allow microphone access. Mute your raw mic in OBS.</li>
        <li>Use either the dock or the source for audio, not both, to avoid doubled sound.</li>
      </ol>
    </details>
  );
}
