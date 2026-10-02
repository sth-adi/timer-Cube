import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cube — speedcubing timer",
    short_name: "Cube",
    description: "A fast, aesthetic WCA-legal 3x3 speedcubing timer with session stats and solve hints.",
    id: "/",
    start_url: "/",
    scope: "/",
    orientation: "any",
    display: "standalone",
    background_color: "#0a0b0f",
    theme_color: "#0a0b0f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
