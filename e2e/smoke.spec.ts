import { expect, type Page, test } from "@playwright/test";
import balance from "../src/data/balance.json" with { type: "json" };

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
	// Every asset is self-hosted: no request leaves the app origin.
	const urls: string[] = [];
	context.on("request", (r) => urls.push(r.url()));
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
	// The starfield and every font face are precached: they load with no network.
	expect(
		await page.evaluate(async () => (await fetch("/sky/grimoire.png")).ok),
	).toBe(true);
	const faces = await page.evaluate(async () => {
		const all = [...document.fonts];
		await Promise.allSettled(all.map((f) => f.load()));
		return all.map((f) => `${f.family.replaceAll('"', "")} ${f.status}`);
	});
	expect(faces).toEqual(
		expect.arrayContaining(["Cinzel loaded", "Spectral loaded"]),
	);
	expect(faces.filter((f) => !f.endsWith(" loaded"))).toEqual([]);

	const origin = new URL(page.url()).origin;
	expect(urls.length).toBeGreaterThan(0);
	expect(urls.filter((u) => new URL(u).origin !== origin)).toEqual([]);
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
	// Locked: greyed, announced as locked, with its unlock condition (Task 5).
	const gate = balance.buildings.find((b) => b.module === "Gardens")?.unlock;
	if (!gate) throw new Error("Buildings: need a Gardens row");
	const gardens = nav.locator(".nav-item[data-locked]");
	await expect(gardens).toHaveText(`Gardens (locked)${gate.text}`);
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
	await expect(page.getByRole("main")).toContainText(`Locked. ${gate.text}.`);
	await page.goto("/#/nope");
	await expect(
		page.getByRole("main").getByRole("heading", { name: "Lost in the void" }),
	).toBeVisible();
});
