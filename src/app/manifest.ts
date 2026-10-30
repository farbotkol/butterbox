import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Butterbox",
    short_name: "Butterbox",
    description: "Simple scheduling for hospitality teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f0",
    theme_color: "#173d32",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
