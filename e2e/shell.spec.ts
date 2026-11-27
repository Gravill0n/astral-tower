import { expect, type Page, test } from "@playwright/test";
import newGame from "../src/core/saves/v1-new-game.json" with { type: "json" };
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

test("keyboard shortcuts switch screens, list themselves and go back", async ({
	page,
}, info) => {
	test.skip(info.project.name !== "desktop", "desktop shortcuts");
	await page.goto("/");
	await expect(page.getByRole("banner")).toBeVisible(); // app mounted
	const key = page.keyboard;

	await key.press("2");
	await expect(page).toHaveURL(/#\/buildings$/);
	await key.press("3");
	await expect(page).toHaveURL(/#\/foundry$/);
	await key.press("9");
	await expect(page).toHaveURL(/#\/stats$/);
	await key.press("5"); // Guild is hidden in a fresh game
	await expect(page).toHaveURL(/#\/stats$/);
	await key.press("Control+2");
	await expect(page).toHaveURL(/#\/stats$/);
	await key.press("1");
	await expect(page).toHaveURL(/#\/$/);

	// Exactly the shortcuts that work: visible screens, Esc and ?.
	const stats = page
		.getByRole("navigation", { name: "Modules" })
		.getByRole("link", { name: "Stats" });
	await stats.focus();
	const list = page.getByRole("dialog", { name: "Keyboard shortcuts" });
	await key.press("?");
	await expect(list).toBeVisible();
	await expect(list.locator("dd")).toHaveText([
		"Overview",
		"Buildings",
		"Foundry",
		"Gardens",
		"Stats",
		"Close a panel or go back",
		"List shortcuts",
	]);
	await key.press("3"); // the open dialog owns the keys
	await expect(page).toHaveURL(/#\/$/);
	await key.press("Escape");
	await expect(list).toBeHidden();
	await expect(page).toHaveURL(/#\/$/); // closing did not also go back
	await expect(stats).toBeFocused();

	// Q9: Esc goes to the previous in-app screen.
	await page.locator("main").click();
	await key.press("3");
	await expect(page).toHaveURL(/#\/foundry$/);
	await key.press("Escape");
	await expect(page).toHaveURL(/#\/$/);

	// No shortcut fires while typing.
	await page.evaluate(() => {
		const input = document.createElement("input");
		document.body.append(input);
		input.focus();
	});
	await key.press("2");
	await expect(page).toHaveURL(/#\/$/);
});

test("Esc with no in-app history goes to Overview", async ({ page }, info) => {
	test.skip(info.project.name !== "desktop", "desktop shortcuts");
	await page.goto("/#/stats");
	await expect(page.getByRole("banner")).toBeVisible(); // app mounted
	await page.keyboard.press("Escape");
	await expect(page).toHaveURL(/#\/$/);
});

// GDD 12.5 Number format: a crew in the quadrillions shows every format apart.
test("number format updates the preview and top bar live and persists", async ({
	page,
}, info) => {
	const crew = 1.234e15;
	const save = JSON.stringify({
		...newGame,
		time: t0,
		run: { ...newGame.run, recruited: crew - g["Starting apprentices"].value },
	});
	await page.clock.install({ time: t0 });
	// Seed once: later reloads keep whatever the game saved.
	await page.addInitScript((s) => {
		if (!localStorage.getItem("astral-tower:save"))
			localStorage.setItem("astral-tower:save", s);
	}, save);
	await page.goto("/#/settings");

	const select = page.getByLabel("Show large numbers as");
	const preview = page.getByRole("status", { name: "Preview" });
	const crewFig = page.getByRole("banner").getByRole("group", {
		name: "Apprentices",
	});
	await expect(select).toHaveValue("short");
	for (const [label, f] of [
		["Scientific", "scientific"],
		["Engineering", "engineering"],
		["Letters", "letters"],
		["K / M / B", "short"],
		["Letters", "letters"],
	] as const) {
		await select.selectOption({ label });
		await expect(preview).toContainText(formatNumber(7.89e15, f));
		await expect(crewFig).toContainText(formatNumber(crew, f));
	}

	await page.reload();
	await expect(select).toHaveValue("letters");
	await expect(crewFig).toContainText(formatNumber(crew, "letters"));

	// Shortcut keys belong to the select while it has focus (Task 8).
	if (info.project.name === "desktop") {
		await select.focus();
		await page.keyboard.press("2");
		await expect(page).toHaveURL(/#\/settings$/);
	}

	// Tampered prefs fall back to K/M/B; the save is left alone.
	await page.evaluate(() =>
		localStorage.setItem("astral-tower:prefs", '{"numberFormat":"<b>x"}'),
	);
	await page.reload();
	await expect(select).toHaveValue("short");
	await expect(crewFig).toContainText(formatNumber(crew, "short"));
	expect(
		await page.evaluate(() => localStorage.getItem("astral-tower:save:broken")),
	).toBeNull();
});

test("settings credits the assets", async ({ page }) => {
	await page.goto("/#/settings");
	const credits = page.getByRole("region", { name: "Credits" });
	await expect(credits).toContainText("Lorc and Delapouite");
	await expect(
		credits.getByRole("link", { name: "game-icons.net" }),
	).toHaveAttribute("href", "https://game-icons.net/");
	await expect(credits).toContainText("CC BY 3.0");
	await expect(credits).toContainText("Kenney");
	await expect(credits).toContainText("CC0");
	await expect(credits).toContainText("Cinzel and Spectral");
	await expect(credits).toContainText("SIL Open Font License 1.1");
	await noSideScroll(page);
});

// GDD 12.3 Clock strip and Coming up, 3.5: from the sheet's Clock rows.
test("overview clock strip and coming up follow the clock", async ({
	page,
}, info) => {
	const desktop = info.project.name === "desktop";
	const effect = (p: (typeof balance.clock)[number]) =>
		`${p.bonus}: ${p.appliesTo} +${n(p.value * 100)}%`;
	const [, , third, fourth] = balance.clock;
	await page.clock.install({ time: t0 });
	await page.goto("/");

	const strip = page.getByRole("region", { name: "Constellation clock" });
	const phases = strip.getByRole("listitem");
	await expect(phases).toHaveCount(balance.clock.length);
	await expect(phases).toContainText(
		balance.clock.map((p) =>
			desktop ? p.constellation : p.constellation.replace(/^The /, ""),
		),
	);
	const now = strip.locator('li[aria-current="true"]');
	await expect(now).toHaveCount(1);
	await expect(now).toContainText(first.constellation.replace(/^The /, ""));
	await expect(strip).toContainText(`${first.constellation} · 0:03 left`);
	await expect(strip).toContainText(effect(first));
	await expect(strip).toContainText(`Next: ${second.constellation}`);
	// The top bar shows the same phase and time left.
	const bar = page
		.getByRole("banner")
		.getByRole("group", { name: "Constellation" })
		.filter({ visible: true });
	await expect(bar).toContainText(first.constellation);
	await expect(bar).toContainText("0:03");

	const panel = page.getByRole("complementary", { name: "Coming up" });
	const events = panel.getByRole("listitem");
	await expect(events).toHaveCount(3);
	await expect(events).toContainText([
		`0:03${second.constellation}${effect(second)}`,
		third.constellation,
		fourth.constellation,
	]);
	const len = (second.ends - second.starts) * 60;
	await expect(events.nth(1)).toContainText(formatDuration(len + 3));

	await page.clock.runFor(2000);
	await expect(events.first()).toContainText("0:01");
	await page.clock.runFor(2000);
	await expect(now).toContainText(second.constellation.replace(/^The /, ""));
	await expect(events.first()).toContainText(
		`${formatDuration(len - 1)}${third.constellation}`,
	);

	// Right panel beside the main column at desktop, below it on mobile.
	const main = await strip.boundingBox();
	const side = await panel.boundingBox();
	if (!main || !side) throw new Error("no layout");
	if (desktop) expect(side.x).toBeGreaterThanOrEqual(main.x + main.width);
	else expect(side.y).toBeGreaterThanOrEqual(main.y + main.height);
	await noSideScroll(page);
});

// GDD 12.3 Needs you and module cards.
test("overview needs you and the module cards", async ({ page }) => {
	await page.goto("/");
	const needs = page.getByRole("region", { name: /Needs you/ });
	await expect(needs).toContainText("0 things");
	await expect(needs).toContainText("Nothing needs you right now.");
	await expect(needs.getByRole("listitem")).toHaveCount(0);

	const cards = page.getByRole("list", { name: "Modules at a glance" });
	const card = cards.getByRole("link");
	await expect(card).toHaveCount(1);
	await expect(card).toContainText("Arcane Foundry");
	await expect(card).toContainText("Bottleneck—");
	const base = g["Base mana generation"].value;
	const bar = page
		.getByRole("banner")
		.getByRole("group", { name: "Mana" })
		.filter({ visible: true });
	const net = formatRate(base, "short", "s");
	await expect(bar).toContainText(net);
	await expect(card).toContainText(`Mana net${net}`);
	await noSideScroll(page);

	await card.click();
	await expect(page).toHaveURL(/#\/foundry$/);

	// The card follows the chosen number format, like the top bar.
	await page.goto("/#/settings");
	await page
		.getByLabel("Show large numbers as")
		.selectOption({ label: "Scientific" });
	await page.goto("/");
	await expect(card).toContainText(formatRate(base, "scientific", "s"));
	await expect(bar).toContainText(formatRate(base, "scientific", "s"));

	await noSideScroll(page);
});

// The cards come from the nav statuses: opening the Gardens adds its card.
test("an open module adds its card", async ({ page }) => {
	const save = JSON.stringify({
		...newGame,
		time: Math.floor(Date.now() / 1000) * 1000, // saves hold whole ticks
		unlocked: ["buildings/Garden bed"],
	});
	await page.addInitScript((s) => {
		if (!localStorage.getItem("astral-tower:save"))
			localStorage.setItem("astral-tower:save", s);
	}, save);
	await page.goto("/");
	const card = page
		.getByRole("list", { name: "Modules at a glance" })
		.getByRole("link");
	await expect(card).toHaveCount(2);
	await expect(card.nth(0)).toContainText("Arcane Foundry");
	await expect(card.nth(1)).toContainText("Starlight Gardens");
	await expect(card.nth(1)).toContainText("Food net—");
	await expect(card.nth(1)).toContainText("Ripe beds—");
	await noSideScroll(page);
	await card.nth(1).click();
	await expect(page).toHaveURL(/#\/gardens$/);
});
