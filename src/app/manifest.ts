import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cube — speedcubing timer",
    short_name: "Cube",
    description: "A fast, aesthetic WCA-legal 3x3 speedcubing timer with session stats and solve hints.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0b0f",
    theme_color: "#0a0b0f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
