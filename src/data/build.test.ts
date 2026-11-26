import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBalance } from "./build.ts";
import { GLOBALS, TABS, type TabDef } from "./schema.ts";
import { readXlsx, type Sheet } from "./xlsx.ts";

// Builds a Sheet from rows of values; row 1 is the header, columns A, B, C…
function sheet(name: string, rows: (string | number | undefined)[][]): Sheet {
	return {
		name,
		rows: rows.map((values, i) => ({
			r: i + 1,
			cells: values.map((value, j) => {
				const col = String.fromCharCode(65 + j);
				return { ref: `${col}${i + 1}`, col, value };
			}),
		})),
	};
}

const RESOURCES_HEADER = [
	"Resource",
	"Tier",
	"Module",
	"Source",
	"Storage cap",
];

function globals(drop?: string, extra?: string): Sheet {
	const names = GLOBALS.filter((n) => n !== drop);
	return sheet("Globals", [
		["Parameter", "Value", "Unit", "Notes"],
		...names.map((n) => [n, 1, n === "Offline cap" ? "h" : undefined]),
		...(extra ? [[extra, 1]] : []),
	]);
}

// Header-only sheets for every defined tab not given, so a test can focus on one.
function withTabs(sheets: Sheet[]): Sheet[] {
	const missing = Object.values(TABS as Record<string, TabDef>)
		.filter((def) => !sheets.some((s) => s.name === def.tab))
		.map((def) =>
			sheet(def.tab, [
				[
					...Object.keys(def.columns),
					...Object.values(def.pairs ?? {}).flat(2),
				],
			]),
		);
	return [...sheets, ...missing];
}

function errors(sheets: Sheet[]): string[] {
	const result = buildBalance(withTabs(sheets));
	return "errors" in result ? result.errors : [];
}

const RECIPES_HEADER = [
	"Recipe",
	"Building",
	"Unlock",
	"Output",
	"Out qty",
	"Input 1",
	"Qty 1",
	"Input 2",
	"Qty 2",
	"Time (s)",
	"Mana (/s)",
	"Byproduct",
	"By qty",
	"Out /s",
	"Notes",
];

const BUILDINGS_HEADER = [
	"Building",
	"Module",
	"Unlock",
	"Space",
	"Apprentices",
	"Cost 1",
	"Qty 1",
	"Cost 2",
	"Qty 2",
	"Growth",
	"Provides",
	"Provides unit",
	"Notes",
];

const DRILL = [
	"Star Drill",
	"Foundry",
	"Mine 10 Ember ore by hand",
	0,
	0,
	"Ember ore",
	10,
	undefined,
	undefined,
	1.15,
];

const CLOCK_HEADER = [
	"#",
	"Constellation",
	"Starts (min)",
	"Ends (min)",
	"Bonus",
	"Applies to",
	"Value",
	"Starlight Collector",
	"Breeds faster",
	"Current to",
];

const RESOURCES = sheet("Resources", [
	RESOURCES_HEADER,
	["Ember ore", "Raw", "Foundry", "Star Drill", 500],
]);

describe("buildBalance", () => {
	it("maps Resources rows and Globals parameters to typed data", () => {
		const result = buildBalance(
			withTabs([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", "Foundry", "Star Drill", 500],
					[],
				]),
				globals(),
				sheet("Notes for designers", [["Anything"]]),
			]),
		);
		if (!("balance" in result)) throw new Error(result.errors.join("\n"));
		expect(result.balance.resources).toEqual([
			{
				resource: "Ember ore",
				tier: "Raw",
				module: "Foundry",
				source: "Star Drill",
				storageCap: 500,
			},
		]);
		expect(result.balance.globals["Offline cap"]).toEqual({
			value: 1,
			unit: "h",
		});
	});

	it("reports an unknown header", () => {
		expect(
			errors([
				sheet("Resources", [[...RESOURCES_HEADER, "Colour"]]),
				globals(),
			]),
		).toEqual(['Resources!F1: unknown header "Colour"']);
	});

	it("reports a missing header", () => {
		expect(
			errors([sheet("Resources", [RESOURCES_HEADER.slice(0, 4)]), globals()]),
		).toEqual(['Resources: missing header "Storage cap"']);
	});

	it("reports a non-number in a number column", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", "Foundry", "Star Drill", "lots"],
				]),
				globals(),
			]),
		).toEqual([
			"Resources!E2 (Ember ore): Invalid input: expected number, received string",
		]);
	});

	it("reports a value outside an enum", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Shiny", "Foundry", "Star Drill", 500],
				]),
				globals(),
			]),
		).toEqual([
			expect.stringMatching(/^Resources!B2 \(Ember ore\): Invalid option/),
		]);
	});

	it("reports an empty required cell at its address", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", undefined, "Star Drill", 500],
				]),
				globals(),
			]),
		).toEqual([
			'Resources!C2 (Ember ore): Invalid option: expected one of "Foundry"|"Guild"|"Gardens"',
		]);
	});

	it("reports a missing and an unknown global parameter", () => {
		expect(
			errors([
				sheet("Resources", [RESOURCES_HEADER]),
				globals("Offline cap", "Warp factor"),
			]),
		).toEqual([
			'Globals: missing "Offline cap"',
			'Globals!A54 (Warp factor): unknown name "Warp factor"',
		]);
	});

	it("reports a missing tab", () => {
		const result = buildBalance(
			withTabs([globals()]).filter((s) => s.name !== "Resources"),
		);
		expect("errors" in result && result.errors).toEqual([
			'missing tab "Resources"',
		]);
	});

	it("turns pairs into arrays, Yes/No into booleans and parses unlocks", () => {
		const result = buildBalance(
			withTabs([
				RESOURCES,
				globals(),
				sheet("Buildings", [BUILDINGS_HEADER, DRILL]),
				sheet("Recipes", [
					RECIPES_HEADER,
					[
						"Emberbrass",
						"Star Drill",
						"Build the first Star Drill",
						"Emberbrass",
						1,
						undefined,
						undefined,
						"Ember ore",
						2,
						3,
						1,
						undefined,
						undefined,
						0.33,
					],
				]),
				sheet("Clock", [
					CLOCK_HEADER,
					[
						1,
						"The Lantern",
						0,
						10,
						"Faster growth",
						"All crops",
						0.25,
						"Yes",
						"Lantern Wisp",
					],
				]),
			]),
		);
		if (!("balance" in result)) throw new Error(result.errors.join("\n"));
		expect(result.balance.recipes[0]).toEqual({
			recipe: "Emberbrass",
			building: "Star Drill",
			unlock: {
				text: "Build the first Star Drill",
				kind: "own",
				building: "Star Drill",
				count: 1,
			},
			output: "Emberbrass",
			outQty: 1,
			inputs: [{ resource: "Ember ore", qty: 2 }],
			time: 3,
			mana: 1,
			byproducts: [],
		});
		expect(result.balance.buildings[0].costs).toEqual([
			{ resource: "Ember ore", qty: 10 },
		]);
		expect(result.balance.clock[0].starlightCollector).toBe(true);
	});

	it("reports half a cost pair at the empty cell", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Buildings", [
					BUILDINGS_HEADER,
					DRILL.map((v, i) => (i === 6 ? undefined : v)),
				]),
			]),
		).toEqual([
			'Buildings!G2 (Star Drill): half a pair: "Cost 1" is set but "Qty 1" is empty',
		]);
	});

	it("reports a bad value inside a pair at its own column", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Buildings", [
					BUILDINGS_HEADER,
					DRILL.map((v, i) => (i === 7 ? "Ember ore" : i === 8 ? "lots" : v)),
				]),
			]),
		).toEqual([
			"Buildings!I2 (Star Drill): Invalid input: expected number, received string",
		]);
	});

	it("reports an unknown unlock phrasing once", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Buildings", [
					BUILDINGS_HEADER,
					DRILL.map((v, i) => (i === 2 ? "Mine fifty Ember ore" : v)),
				]),
			]),
		).toEqual([
			'Buildings!C2 (Star Drill): unknown unlock phrasing "Mine fifty Ember ore"',
		]);
	});

	it("reports an unknown Module and an unknown Kind", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Buildings", [
					BUILDINGS_HEADER,
					DRILL.map((v, i) => (i === 1 ? "Basement" : v)),
				]),
				sheet("Buffs", [
					[
						"Source",
						"Kind",
						"Applies to",
						"Speed",
						"Mana",
						"Output",
						"Yield",
						"Duration (min)",
						"Notes",
					],
					["Starberry pie", "Snack", "Foundry lines", 0.1],
				]),
			]),
		).toEqual([
			expect.stringMatching(/^Buildings!B2 \(Star Drill\): Invalid option/),
			expect.stringMatching(/^Buffs!B2 \(Starberry pie\): Invalid option/),
		]);
	});

	it("reports a Starlight Collector that is not Yes or No", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Clock", [
					CLOCK_HEADER,
					[
						1,
						"The Lantern",
						0,
						10,
						"Faster growth",
						"All crops",
						0.25,
						"Maybe",
						"Lantern Wisp",
					],
				]),
			]),
		).toEqual([
			"Clock!H2 (The Lantern): Invalid input: expected boolean, received string",
		]);
	});

	it("reports every error together", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Shiny", "Foundry", "Star Drill", "lots"],
					["Frost ore", "Raw", "Nowhere", "Star Drill", 500],
				]),
				sheet("Globals", [["Parameter", "Value", "Unit", "Notes", "Owner"]]),
			]),
		).toEqual([
			'Globals!E1: unknown header "Owner"',
			expect.stringMatching(/^Resources!B2 \(Ember ore\)/),
			expect.stringMatching(/^Resources!E2 \(Ember ore\)/),
			expect.stringMatching(/^Resources!C3 \(Frost ore\)/),
		]);
	});

	it("builds every defined tab from the real workbook", () => {
		const result = buildBalance(
			readXlsx(
				readFileSync(
					new URL("../../balance/astral-tower-balance.xlsx", import.meta.url),
				),
			),
		);
		if (!("balance" in result)) throw new Error(result.errors.join("\n"));
		expect(result.balance.resources).toHaveLength(39);
		expect(Object.keys(result.balance.globals)).toHaveLength(53);
		expect(result.balance.globals["Clock cycle"].value).toBe(60);
		const { recipes, buildings, upgrades, crops, buffs, clock } =
			result.balance;
		expect(
			[recipes, buildings, upgrades, crops, buffs, clock].map((t) => t.length),
		).toEqual([32, 17, 14, 6, 13, 6]);
	});
});
