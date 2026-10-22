import { createFileRoute } from "@tanstack/react-router";
import { Console } from "@/components/console/Console";

export const Route = createFileRoute("/audio")({
  head: () => ({
    meta: [
      { title: "VOXONE Stream Console — Live mic cleanup for OBS" },
      { name: "description", content: "A digital mixing console for streamers: noise gate, AI denoise, EQ, de-esser, compressor, reverb and limiter, routed into OBS." },
      { property: "og:title", content: "VOXONE Stream Console" },
      { property: "og:description", content: "Clean your stream mic live with a full digital console, then send it to OBS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Console,
});
