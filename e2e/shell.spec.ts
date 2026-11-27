import { expect, type Page, test } from "@playwright/test";
// The raw sheet JSON: src/data/index.ts imports it without the attribute Node needs.
import balance from "../src/data/balance.json" with { type: "json" };
import { formatDuration, formatNumber, formatRate } from "../src/ui/format.ts";

const g = balance.globals;
const n = (x: number) => formatNumber(x, "short");

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

// 3 s before the first phase ends, on an hour boundary (GDD 3.5).
const [first, second] = balance.clock;
const t0 = Date.UTC(2026, 0, 1, 12) + first.ends * 60_000 - 3000;

test("top bar shows a fresh game's figures and the clock ticks over", async ({
	page,
}, info) => {
	test.skip(info.project.name !== "desktop", "desktop top bar");
	await page.clock.install({ time: t0 });
	await page.goto("/");

	const bar = page.getByRole("banner");
	const chip = (name: string) => bar.getByRole("group", { name });
	await expect(bar).toContainText("Astral Tower");
	const base = g["Base mana generation"].value;
	await expect(chip("Mana")).toContainText(formatRate(base, "short", "s"));
	await expect(chip("Mana")).toContainText(`${n(base)} made · 0 drawn`);
	await expect(chip("Mana")).not.toContainText("short");
	await expect(chip("Apprentices")).toContainText(
		`${n(g["Starting apprentices"].value)} of 0 needed`,
	);
	await expect(chip("Floor space")).toContainText(
		`0 / ${n(g["Starting floor space"].value)} 1 floor`,
	);
	const clock = chip("Constellation");
	await expect(clock).toContainText(first.constellation);
	await expect(clock).toContainText(`0:03 left · ${second.constellation} next`);

	await page.clock.runFor(2000);
	await expect(clock).toContainText("0:01 left");

	await page.clock.runFor(2000);
	await expect(clock).toContainText(second.constellation);
	const len = (second.ends - second.starts) * 60;
	await expect(clock).toContainText(`${formatDuration(len - 1)} left`);

	// The bar sits in the Shell, so it stays across screens.
	await page
		.getByRole("navigation", { name: "Modules" })
		.getByRole("link", { name: "Foundry" })
		.click();
	await expect(page).toHaveURL(/#\/foundry$/);
	await expect(chip("Constellation")).toContainText(second.constellation);
	await expect(page.getByRole("button", { name: "More" })).toBeHidden();
});

const noSideScroll = async (page: Page) =>
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);

test("compact header shows the same figures, short form", async ({
	page,
}, info) => {
	test.skip(info.project.name !== "mobile", "mobile header");
	await page.clock.install({ time: t0 });
	await page.goto("/");

	const bar = page.getByRole("banner");
	const fig = (name: string) => bar.getByRole("group", { name });
	await expect(fig("Mana")).toHaveText(
		formatRate(g["Base mana generation"].value, "short", "s"),
	);
	await expect(fig("Apprentices")).toHaveText(
		`${n(g["Starting apprentices"].value)}/0`,
	);
	await expect(fig("Floor space")).toHaveText(
		`0/${n(g["Starting floor space"].value)}`,
	);
	const clock = fig("Constellation");
	await expect(clock).toHaveText(`${first.constellation} · 0:03`);
	await page.clock.runFor(2000);
	await expect(clock).toHaveText(`${first.constellation} · 0:01`);
	await expect(page.locator(".sidebar")).toBeHidden();
	await noSideScroll(page);
});

test("bottom tabs and the More sheet", async ({ page }, info) => {
	test.skip(info.project.name !== "mobile", "mobile tabs");
	await page.goto("/");
	const tabs = page.getByRole("navigation", { name: "Modules" });
	await expect(tabs.getByRole("link")).toHaveText([
		"Overview",
		"Buildings",
		"Foundry",
		"Gardens (locked)",
	]);
	const more = tabs.getByRole("button", { name: "More" });
	for (const t of [...(await tabs.getByRole("link").all()), more]) {
		expect((await t.boundingBox())?.height).toBeGreaterThanOrEqual(44);
	}

	await tabs.getByRole("link", { name: "Buildings" }).click();
	await expect(page).toHaveURL(/#\/buildings$/);
	await expect(tabs.getByRole("link", { name: "Buildings" })).toHaveAttribute(
		"aria-current",
		"page",
	);

	// Only open and locked More items; Gardens is the locked one, and it is a tab.
	const sheet = page.getByRole("dialog", { name: "More" });
	await more.click();
	await expect(sheet.getByRole("link")).toHaveText(["Stats", "Settings"]);
	await expect(sheet).not.toContainText("Guild");
	await expect(sheet).not.toContainText("Supernova");
	await noSideScroll(page);
	await sheet.getByRole("link", { name: "Stats" }).click();
	await expect(sheet).toBeHidden();
	await expect(page).toHaveURL(/#\/stats$/);
	await expect(more).toBeFocused();

	await more.click();
	await expect(sheet).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(sheet).toBeHidden();
	await expect(more).toBeFocused();

	await more.click();
	await page.mouse.click(195, 40); // the backdrop, above the sheet
	await expect(sheet).toBeHidden();
	await expect(more).toBeFocused();

	// Q7: the locked Gardens tab opens its unlock condition.
	await tabs.getByRole("link", { name: "Gardens" }).click();
	await expect(page.getByRole("main")).toContainText("Locked.");
	await noSideScroll(page);
});
