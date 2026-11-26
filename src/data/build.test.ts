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

const EVENTS_HEADER = [
	"Event",
	"Option",
	"Time",
	"Time of",
	"Loot",
	"Relic chance +",
	"Danger +",
	"Picked by",
];

const FAMILIARS_HEADER = [
	"Species",
	"Egg source",
	"Hatch time (min)",
	"Incubator charms",
	"Feed",
	"Feed /h",
	"Breed time (min)",
	"Job",
	"Job bonus",
	"Bonus value",
];

const LANTERN_WISP = [
	"Lantern Wisp",
	"Breeding",
	60,
	1,
	"Ember ore",
	1,
	60,
	"Light",
	"Speed",
	0.1,
];

const LIBRARY_HEADER = [
	"Constellation",
	"Kind",
	"Stars",
	"Unlock",
	"Per-star bonus",
	"Full-set reward",
	"Value",
];

const GEAR_HEADER = [
	"Kind",
	"Name",
	"Unlock",
	"Speed",
	"Safety",
	"Cargo",
	"Per level",
	"Max level",
	"Notes",
];

const STARS_HEADER = [
	"Star",
	"Phase length (min)",
	"Drill output ×",
	"Frost drill output ×",
	"Mana draw ×",
	"Surge fill ×",
	"Pulse high ×",
	"Pulse low ×",
	"Pulse length (s)",
	"Voyage time ×",
	"Relic chance ×",
	"Relic chance +",
	"Floor space",
	"Twin clock",
	"Notes",
];

const STARS = sheet("Stars", [
	STARS_HEADER,
	["First star", 10, 1, 1, 1, 1, 1, 1, undefined, 1, 1, 0, 10, "No"],
]);

const TRIALS_HEADER = ["Trial", "Kind", "Rule", "Stardust bonus", "Notes"];

const TRIALS = sheet("Trials", [
	TRIALS_HEADER,
	["One Dock", "Optional", "At most 1 Dock", 0.5],
]);

const GALAXY_HEADER = ["Star", "Type", "Dim", "Links to", "Trial", "Notes"];

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
			`Globals!A${GLOBALS.length + 1} (Warp factor): unknown name "Warp factor"`,
		]);
	});

	it("reports a Globals row with a Value but no Parameter", () => {
		const g = sheet("Globals", [
			["Parameter", "Value", "Unit", "Notes"],
			...GLOBALS.map((n) => [n, 1, n === "Offline cap" ? "h" : undefined]),
			[undefined, 1],
		]);
		expect(errors([sheet("Resources", [RESOURCES_HEADER]), g])).toEqual([
			`Globals!A${GLOBALS.length + 2}: missing "Parameter"`,
		]);
	});

	it("keeps crops aligned when a Resources Tier is empty", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", undefined, "Foundry", "Star Drill", 500],
					["Starwheat", "Crop", "Gardens", "Garden bed", 500],
				]),
				globals(),
				sheet("Buildings", [
					BUILDINGS_HEADER,
					DRILL.map((v, i) => (i === 2 ? "Harvest the first Starwheat" : v)),
				]),
			]),
		).toEqual([expect.stringMatching(/^Resources!B2 \(Ember ore\): /)]);
	});

	it("reports a missing tab", () => {
		const result = buildBalance(
			withTabs([globals()]).filter((s) => s.name !== "Resources"),
		);
		expect("errors" in result && result.errors).toEqual([
			'missing tab "Resources"',
		]);
	});

	it("reports an unknown extra tab", () => {
		expect(
			errors([RESOURCES, globals(), sheet("Notes for designers", [["Any"]])]),
		).toEqual(['unknown tab "Notes for designers"']);
	});

	it("turns pairs into arrays, Yes/No into booleans and parses unlocks", () => {
		const result = buildBalance(
			withTabs([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", "Foundry", "Star Drill", 500],
					["Emberbrass", "Refined", "Foundry", "Crucible", 500],
				]),
				globals(),
				sheet("Familiars", [FAMILIARS_HEADER, LANTERN_WISP]),
				sheet("Library", [
					LIBRARY_HEADER,
					["The Lantern", "Clock", 5, "The Library opens", undefined, "x"],
				]),
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

	it("parses Gear Per level and reports another form at its cell", () => {
		const header = [
			"Kind",
			"Name",
			"Unlock",
			"Speed",
			"Safety",
			"Cargo",
			"Per level",
			"Max level",
			"Notes",
		];
		const captain = (perLevel: string, name = "Pell the Cautious") => [
			"Captain",
			name,
			"The Library opens",
			-0.15,
			10,
			undefined,
			perLevel,
			10,
		];
		const ok = buildBalance(
			withTabs([
				RESOURCES,
				globals(),
				sheet("Gear", [
					header,
					captain("+2 Safety"),
					captain("+2% speed", "Mira Quickwind"),
				]),
			]),
		);
		if (!("balance" in ok)) throw new Error(ok.errors.join("\n"));
		expect(ok.balance.gear.map((g) => g.perLevel)).toEqual([
			{ stat: "safety", value: 2 },
			{ stat: "speed", value: 0.02 },
		]);
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Gear", [header, captain("+2 Luck")]),
			]),
		).toEqual([
			'Gear!G2 (Pell the Cautious): unknown Per level "+2 Luck" (expected "+N Safety" or "+N% speed")',
		]);
	});

	it("reports a non-number trait value", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Traits", [
					["Trait", "Effect", "Common", "Bright", "Radiant", "Stellar"],
					["Swift", "Job speed", 0.05, "lots", 0.15, 0.25],
				]),
			]),
		).toEqual([
			"Traits!D2 (Swift): Invalid input: expected number, received string",
		]);
	});

	it("reports an unknown Library Kind", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Library", [
					[
						"Constellation",
						"Kind",
						"Stars",
						"Unlock",
						"Per-star bonus",
						"Full-set reward",
						"Value",
					],
					[
						"The Anvil",
						"Forge",
						5,
						"The Library opens",
						undefined,
						"Blueprint",
					],
				]),
			]),
		).toEqual([
			expect.stringMatching(/^Library!B2 \(The Anvil\): Invalid option/),
		]);
	});

	it("names an Events row by Event and Option", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Events", [
					[
						"Event",
						"Option",
						"Time",
						"Time of",
						"Loot",
						"Relic chance +",
						"Danger +",
						"Picked by",
					],
					[
						"Drifting cargo",
						"Haul it in",
						0.1,
						"forever",
						0.25,
						undefined,
						undefined,
						"Mira",
					],
				]),
			]),
		).toEqual([
			expect.stringMatching(
				/^Events!D2 \(Drifting cargo \/ Haul it in\): Invalid option/,
			),
		]);
	});

	it("turns Galaxy Links to into numbers and reports a bad list at its cell", () => {
		const galaxy = (links: string) =>
			sheet("Galaxy", [
				["Star", "Type", "Dim", "Links to", "Trial", "Notes"],
				[1, "First star", "No", links],
				[2, "First star", "No", "1"],
				[10, "First star", "No", "1"],
			]);
		const result = buildBalance(
			withTabs([RESOURCES, globals(), STARS, galaxy("2, 10")]),
		);
		if (!("balance" in result)) throw new Error(result.errors.join("\n"));
		expect(result.balance.galaxy[0]).toEqual({
			star: 1,
			type: "First star",
			dim: false,
			linksTo: [2, 10],
		});
		expect(errors([RESOURCES, globals(), galaxy("2, ten")])).toEqual([
			'Galaxy!D2 (1): bad Links to "2, ten" (expected "n, n, …")',
		]);
	});

	it("addresses a row on a tab with no name column", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Stardust gain", [
					["Mana produced this run", "Stardust"],
					[100000, "lots"],
				]),
			]),
		).toEqual([
			"Stardust gain!B2: Invalid input: expected number, received string",
		]);
	});

	it("reports a duplicate name in a tab, keyed Globals and Events pairs", () => {
		const event = (option: string) => [
			"Drifting cargo",
			option,
			undefined,
			undefined,
			0.25,
			undefined,
			undefined,
			"Mira",
		];
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", "Foundry", "Star Drill", 500],
					["Ember ore", "Raw", "Foundry", "Star Drill", 500],
				]),
				globals(undefined, "Offline cap"),
				sheet("Events", [
					EVENTS_HEADER,
					event("Haul it in"),
					event("Leave it"),
					event("Haul it in"),
				]),
			]),
		).toEqual([
			"Resources!A3 (Ember ore): duplicate name (first on row 2)",
			"Events!A4 (Drifting cargo / Haul it in): duplicate name (first on row 2)",
			`Globals!A${GLOBALS.length + 2} (Offline cap): duplicate name (first on row ${GLOBALS.indexOf("Offline cap") + 2})`,
		]);
	});

	it("reports a cost naming a missing resource", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Buildings", [
					BUILDINGS_HEADER,
					DRILL.map((v, i) => (i === 5 ? "Moon ore" : v)),
				]),
			]),
		).toEqual(['Buildings!F2 (Star Drill): unknown resource "Moon ore"']);
	});

	it("reports an unlock naming a missing building", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Buildings", [
					BUILDINGS_HEADER,
					DRILL.map((v, i) => (i === 2 ? "Own 2 Crucibles" : v)),
				]),
			]),
		).toEqual([
			expect.stringMatching(/^Buildings!C2 \(Star Drill\): .*Crucible/),
		]);
	});

	// One valid row per tab; each case swaps one resource or constellation
	// reference for "Moon ore" and expects exactly the cross-reference error.
	const unlock = "Mine 10 Ember ore by hand";
	const ROWS: Record<string, Record<string, string | number>> = {
		Recipes: {
			Recipe: "Smelt",
			Building: "Star Drill",
			Unlock: unlock,
			Output: "Ember ore",
			"Out qty": 1,
			"Input 1": "Ember ore",
			"Qty 1": 1,
			Byproduct: "Ember ore",
			"By qty": 1,
			"Time (s)": 1,
			"Mana (/s)": 0,
		},
		Upgrades: {
			Upgrade: "Sharper bits",
			Target: "Star Drill",
			Unlock: unlock,
			Effect: "Speed",
			"Per level": 0.1,
			Cost: "Ember ore",
			"Base qty": 10,
			Growth: 1.5,
			"Max level": 5,
		},
		Ships: {
			Ship: "Skiff",
			Unlock: unlock,
			Speed: 1,
			Safety: 1,
			"Cargo ×": 1,
			"Gear slots": 1,
			Crew: 1,
			"Cost 1": "Ember ore",
			"Qty 1": 1,
		},
		Voyages: {
			Nebula: "Near Drift",
			Unlock: unlock,
			"Base time (min)": 10,
			Danger: 0,
			Provisions: 1,
			"Aether charge (mana)": 1,
			"Relic chance": 0,
			"Egg chance": 0,
			"Loot 1": "Ember ore",
			"Qty 1": 1,
		},
		Crops: {
			Crop: "Starwheat",
			Unlock: unlock,
			"Sow under": "Any",
			"Harvest under": "Any",
			"Grow time (min)": 5,
			Yield: 3,
			"Food value": 1,
			Use: "Food",
			Seed: "Ember ore",
			"Seed qty": 1,
		},
		Familiars: Object.fromEntries(
			FAMILIARS_HEADER.map((h, i) => [h, LANTERN_WISP[i]]),
		),
		Contracts: {
			Unlock: unlock,
			"Good asked": "Ember ore",
			Reward: "Ember ore",
			"Reward qty": 1,
			Reputation: 1,
		},
	};
	it.each([
		["Recipes", "Input 1", "resource"],
		["Recipes", "Byproduct", "resource"],
		["Upgrades", "Cost", "resource"],
		["Ships", "Cost 1", "resource"],
		["Voyages", "Loot 1", "resource"],
		["Crops", "Seed", "resource"],
		["Crops", "Crop", "resource"],
		["Crops", "Harvest under", "constellation"],
		["Familiars", "Feed", "resource"],
		["Contracts", "Good asked", "resource"],
		["Contracts", "Reward", "resource"],
	])("reports an unknown %s %s", (tab, bad, what) => {
		const def = Object.values(TABS as Record<string, TabDef>).find(
			(d) => d.tab === tab,
		) as TabDef;
		const header = [
			...Object.keys(def.columns),
			...Object.values(def.pairs ?? {}).flat(2),
		];
		const row = { ...ROWS[tab], [bad]: "Moon ore" };
		const col = String.fromCharCode(65 + header.indexOf(bad));
		const name = def.nameColumn ? ` (${row[def.nameColumn as string]})` : "";
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", "Foundry", "Star Drill", 500],
					["Starwheat", "Crop", "Gardens", "Garden bed", 500],
				]),
				globals(),
				sheet("Buildings", [BUILDINGS_HEADER, DRILL]),
				sheet(tab, [header, header.map((h) => row[h])]),
			]),
		).toEqual([`${tab}!${col}2${name}: unknown ${what} "Moon ore"`]);
	});

	it("reports a recipe on an unknown building, allows Mana output", () => {
		const recipe = (name: string, building: string, output: string) => [
			name,
			building,
			"Mine 10 Ember ore by hand",
			output,
			1,
			"Ember ore",
			1,
			undefined,
			undefined,
			1,
			0,
		];
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Buildings", [BUILDINGS_HEADER, DRILL]),
				sheet("Recipes", [
					RECIPES_HEADER,
					recipe("Attune", "Star Drill", "Mana"),
					recipe("Dust", "Attuner", "Stardust"),
				]),
			]),
		).toEqual([
			'Recipes!B3 (Dust): unknown building "Attuner"',
			'Recipes!D3 (Dust): unknown resource "Stardust"',
		]);
	});

	it("reports Library Clock names that differ from the Clock tab", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Clock", [
					CLOCK_HEADER,
					[1, "The Lantern", 0, 10, "b", "a", 0.25, "No", "Lantern Wisp"],
				]),
				sheet("Familiars", [FAMILIARS_HEADER, LANTERN_WISP]),
				sheet("Library", [
					LIBRARY_HEADER,
					["The Lamp", "Clock", 5, "The Library opens", undefined, "x"],
				]),
			]),
		).toEqual([
			"Clock!B2 (The Lantern): missing from the Library Clock constellations",
			"Library!A2 (The Lamp): Clock constellation not on the Clock tab",
		]);
	});

	it("reports unknown Clock, Familiar and captain references", () => {
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
						"b",
						"a",
						0.25,
						"No",
						"Moon Hare",
						"Nowhere",
					],
				]),
				sheet("Library", [
					LIBRARY_HEADER,
					["The Lantern", "Clock", 5, "The Library opens", undefined, "x"],
				]),
				sheet("Gear", [
					GEAR_HEADER,
					["Captain", "Pell the Cautious", "The Library opens"],
					["Companion", "Moon Hare", "The Library opens"],
					["Gear", "Star-sail", "The Library opens"],
				]),
				sheet("Events", [
					EVENTS_HEADER,
					["Drifting cargo", "Leave it", ...Array(5), "Pell, Mira"],
					["Drifting cargo", "Haul it in", ...Array(5), "third captain"],
				]),
			]),
		).toEqual([
			'Clock!I2 (The Lantern): unknown familiar "Moon Hare"',
			'Clock!J2 (The Lantern): unknown voyage "Nowhere"',
			'Gear!B3 (Moon Hare): unknown familiar "Moon Hare"',
			'Gear!B4 (Star-sail): unknown resource "Star-sail"',
			'Events!H2 (Drifting cargo / Leave it): unknown captain "Mira"',
		]);
	});

	it("reports a crop sown under an unknown constellation", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Starwheat", "Crop", "Gardens", "Garden bed", 500],
				]),
				globals(),
				sheet("Crops", [
					[
						"Crop",
						"Unlock",
						"Sow under",
						"Harvest under",
						"Grow time (min)",
						"Yield",
						"Seed",
						"Seed qty",
						"Food value",
						"Use",
					],
					[
						"Starwheat",
						"The Library opens",
						"Any",
						"The Moon",
						5,
						3,
						undefined,
						undefined,
						1,
						"Food",
					],
				]),
			]),
		).toEqual(['Crops!D2 (Starwheat): unknown constellation "The Moon"']);
	});

	it("reports an asymmetric or unknown galaxy link and a bad type or trial", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				STARS,
				TRIALS,
				sheet("Galaxy", [
					GALAXY_HEADER,
					[1, "First star", "No", "2, 3"],
					[2, "First star", "No", "9"],
					[3, "Red Dwarf", "No", "1, 4", "No meals"],
					[4, "Dim", "Yes", "3", "One Dock"],
				]),
			]),
		).toEqual([
			"Galaxy!D2 (1): links to 2, which does not link back",
			"Galaxy!D3 (2): links to 9, which is not a star",
			'Galaxy!B4 (3): unknown star type "Red Dwarf"',
			'Galaxy!E4 (3): unknown trial "No meals"',
			'Galaxy!E5 (4): a Dim star needs a Dim star trial, not "One Dock"',
		]);
	});

	it("reports a Dim star rule naming an unknown trial", () => {
		expect(
			errors([
				RESOURCES,
				globals(),
				sheet("Trials", [
					TRIALS_HEADER,
					["One Dock", "Optional", "At most 1 Dock", 0.5],
					["The Quiet Ember", "Dim star", "One Dock and No meals", 0.5],
				]),
			]),
		).toEqual([
			'Trials!C3 (The Quiet Ember): Dim star rule "One Dock and No meals" is not "<Optional trial> and <Optional trial>"',
		]);
	});

	it("builds every defined tab from the real workbook, dropping no row", () => {
		const sheets = readXlsx(
			readFileSync(
				new URL("../../balance/astral-tower-balance.xlsx", import.meta.url),
			),
		);
		const result = buildBalance(sheets);
		if (!("balance" in result)) throw new Error(result.errors.join("\n"));
		const b = result.balance;
		expect(Object.keys(b)).toEqual(Object.keys(TABS));
		const tabs = Object.entries(TABS as Record<string, TabDef>);
		// Built rows (array items or keyed entries) vs non-blank sheet data rows.
		expect(
			tabs.map(([key]) => Object.keys(b[key as keyof typeof b]).length),
		).toEqual(
			tabs.map(
				([, def]) =>
					sheets
						.find((s) => s.name === def.tab)
						?.rows.slice(1)
						.filter((r) => r.cells.some((c) => c.value !== undefined)).length,
			),
		);
	});
});
