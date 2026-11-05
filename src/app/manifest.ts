import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Butterbox Systems",
    short_name: "Butterbox",
    description: "Less admin, more good days for hospitality teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#18282B",
    icons: [
      { src: "/brand/icons/butterbox-app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icons/butterbox-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icons/butterbox-app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/brand/butterbox-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
