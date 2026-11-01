import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Butterbox Systems",
    short_name: "Butterbox",
    description: "Less admin, more good days for hospitality teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF9F6",
    theme_color: "#123F4A",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
