import { expect, test } from "@playwright/test";

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

test("home shows the tower heading", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Astral Tower" }),
	).toBeVisible();
	// Deployed at the domain root; vite preview would redirect "/" to a wrong base.
	expect(new URL(page.url()).pathname).toBe("/");
});

test("unknown route shows not-found and links back home", async ({ page }) => {
	await page.goto("/#/nope");
	await expect(
		page.getByRole("heading", { name: "Lost in the void" }),
	).toBeVisible();
	await page.getByRole("link", { name: "Back to the tower" }).click();
	await expect(
		page.getByRole("heading", { name: "Astral Tower" }),
	).toBeVisible();
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
	await expect(
		page.getByRole("heading", { name: "Astral Tower" }),
	).toBeVisible();
});
