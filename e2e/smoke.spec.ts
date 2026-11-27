import { expect, type Page, test } from "@playwright/test";

let errors: string[] = [];

test.beforeEach(({ page }) => {
	errors = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(err.message));
});

test.afterEach(() => {
	expect(errors).toEqual([]);
});

const overview = (page: Page) =>
	expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

test("home shows the Overview and the Modules navigation", async ({ page }) => {
	await page.goto("/");
	await overview(page);
	await expect(page.getByRole("navigation", { name: "Modules" })).toBeVisible();
	// Deployed at the domain root; vite preview would redirect "/" to a wrong base.
	expect(new URL(page.url()).pathname).toBe("/");
});

test("unknown route shows not-found and links back home", async ({ page }) => {
	await page.goto("/#/nope");
	await expect(
		page.getByRole("heading", { name: "Lost in the void" }),
	).toBeVisible();
	await page.getByRole("link", { name: "Back to the tower" }).click();
	await overview(page);
});

test("is installable and works offline", async ({ page, context }) => {
	await page.goto("/");

	const href = await page.locator('link[rel="manifest"]').getAttribute("href");
	expect(href).toBeTruthy();
	const res = await page.request.get(new URL(href ?? "", page.url()).href);
	expect(res.ok()).toBe(true);
	const manifest = await res.json();
	expect(manifest.name).toBe("Astral Tower");
	expect(manifest.display).toBe("standalone");
	const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
	expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));

	// ready resolves once a worker is active (it may still be "activating").
	const hasActiveWorker = await page.evaluate(
		async () => !!(await navigator.serviceWorker.ready).active,
	);
	expect(hasActiveWorker).toBe(true);

	await context.setOffline(true);
	await page.reload();
	await overview(page);
	// Fonts are precached: still usable with no network.
	expect(
		await page.evaluate(async () => {
			await document.fonts.ready;
			return document.fonts.check("600 16px Cinzel");
		}),
	).toBe(true);
});

test("sidebar shows open modules, the next locked one, and navigates", async ({
	page,
}, info) => {
	test.skip(info.project.name !== "desktop", "sidebar is the desktop frame");
	await page.goto("/");
	const nav = page.getByRole("navigation", { name: "Modules" });
	await expect(nav.getByRole("link")).toHaveText([
		"Overview",
		"Buildings",
		"Foundry",
		"Stats",
		"Settings",
	]);
	const gardens = nav.locator('[aria-disabled="true"]');
	await expect(gardens).toHaveText(/^Gardens/);
	await expect(nav).not.toContainText("Guild");
	await expect(nav).not.toContainText("Supernova");

	await nav.getByRole("link", { name: "Foundry" }).click();
	await expect(page).toHaveURL(/#\/foundry$/);
	await expect(nav.getByRole("link", { name: "Foundry" })).toHaveAttribute(
		"aria-current",
		"page",
	);
	await expect(
		page.getByRole("heading", { name: "Arcane Foundry" }),
	).toBeVisible();
	await expect(
		page.getByText("This deck is still being fitted."),
	).toBeVisible();

	await page.goto("/#/guild");
	await expect(
		page.getByText("This deck is not on the charts yet."),
	).toBeVisible();
	await page.goto("/#/gardens");
	await expect(page.getByRole("main")).toContainText("Locked.");
	await page.goto("/#/nope");
	await expect(page.getByRole("main")).toHaveCount(1);
});
