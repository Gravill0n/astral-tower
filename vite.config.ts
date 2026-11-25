import { minimal2023Preset } from "@vite-pwa/assets-generator/config";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: "autoUpdate",
			injectRegister: "auto",
			workbox: { globPatterns: ["**/*.{js,css,html,ico,png,svg}"] },
			// icon.svg is full-bleed with the glyph already inside the maskable safe zone,
			// so drop the preset's default 30% white padding on maskable/apple icons.
			pwaAssets: {
				image: "public/icon.svg",
				preset: {
					...minimal2023Preset,
					maskable: { ...minimal2023Preset.maskable, padding: 0 },
					apple: { ...minimal2023Preset.apple, padding: 0 },
				},
			},
			manifest: {
				name: "Astral Tower",
				short_name: "Astral Tower",
				description: "A wizard's tower orbits a star and grows floor by floor.",
				display: "standalone",
				theme_color: "#0d0b1e",
				background_color: "#0d0b1e",
			},
		}),
	],
});
