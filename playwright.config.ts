import { defineConfig, devices } from "@playwright/test";

// 4321, not 4173: keeps e2e off whatever `vite preview` a dev may already run.
const baseURL = "http://localhost:4321/";

export default defineConfig({
	testDir: "e2e",
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	use: { baseURL },
	projects: [
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "mobile",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 390, height: 844 },
				isMobile: true,
				hasTouch: true,
			},
		},
	],
	webServer: {
		command: "pnpm build && pnpm preview --port 4321 --strictPort",
		url: baseURL,
		reuseExistingServer: !process.env.CI,
	},
});
