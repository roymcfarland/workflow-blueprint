import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Workflow Blueprint",
    short_name: "Blueprint",
    description: "A blueprint-inspired task planning workspace for personal and team execution.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fbfcff",
    theme_color: "#1f50f2",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}
