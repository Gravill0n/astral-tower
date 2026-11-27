import { expect, test } from "@playwright/test";
// The raw sheet JSON: src/data/index.ts imports it without the attribute Node needs.
import balance from "../src/data/balance.json" with { type: "json" };
import { formatDuration, formatNumber, formatRate } from "../src/ui/format.ts";

const g = balance.globals;
const n = (x: number) => formatNumber(x, "short");

let errors: string[] = [];

test.beforeEach(({ page }, info) => {
	test.skip(info.project.name !== "desktop", "mobile header is Task 7");
	errors = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(err.message));
});

test.afterEach(() => {
	expect(errors).toEqual([]);
});

test("top bar shows a fresh game's figures and the clock ticks over", async ({
	page,
}) => {
	// 3 s before the first phase ends, on an hour boundary (GDD 3.5).
	const [first, second] = balance.clock;
	const t0 = Date.UTC(2026, 0, 1, 12) + first.ends * 60_000 - 3000;
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
});
