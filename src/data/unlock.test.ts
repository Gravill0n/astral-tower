import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { unlockNames } from "./build.ts";
import { parseUnlock, type UnlockNames, UnlockSchema } from "./unlock.ts";
import { readXlsx } from "./xlsx.ts";

const names: UnlockNames = {
	buildings: new Set(["Widget", "Gizmo Bench", "Bunk quarters", "Pier"]),
	resources: new Set(["Cogplate", "Lens", "Slag dust", "Spark ore", "Gauge"]),
	crops: new Set(["Moonbean", "Fizzberries", "Glow moss"]),
	voyages: new Set(["Foo Nebula", "Bar Shoals", "Tomb of Stars"]),
	ships: new Set(["Sloop"]),
	library: new Set(["The Kettle", "The Hammer"]),
	familiars: new Set(["Moon Moth"]),
};

describe("parseUnlock", () => {
	it.each([
		["Own 3 Widgets", { kind: "own", building: "Widget", count: 3 }],
		["Own 2 Gizmo Benches", { kind: "own", building: "Gizmo Bench", count: 2 }],
		[
			"Own 4 Bunk quarters",
			{ kind: "own", building: "Bunk quarters", count: 4 },
		],
		["Build the first Pier", { kind: "own", building: "Pier", count: 1 }],
		["Own a Sloop", { kind: "ownShip", ship: "Sloop" }],
		["Build floor 3", { kind: "floor", floor: 3 }],
		["Use all of floor 1's space", { kind: "floorFull", floor: 1 }],
		["Comes with the Pier", { kind: "comesWith", building: "Pier" }],
		["Comes with the first Widget", { kind: "comesWith", building: "Widget" }],
		[
			"Produce 50 Cogplates",
			{ kind: "produce", resource: "Cogplate", count: 50 },
		],
		["Produce 20 Lenses", { kind: "produce", resource: "Lens", count: 20 }],
		["Craft the first Gauge", { kind: "produce", resource: "Gauge", count: 1 }],
		["Have 100 Slag dust", { kind: "have", resource: "Slag dust", count: 100 }],
		[
			"Mine 10 Spark ore by hand",
			{ kind: "mineByHand", resource: "Spark ore", count: 10 },
		],
		[
			"Harvest 200 Moonbeans",
			{ kind: "harvest", crop: "Moonbean", count: 200 },
		],
		[
			"Harvest Fizzberries once",
			{ kind: "harvest", crop: "Fizzberries", count: 1 },
		],
		[
			"Harvest the first Glow moss",
			{ kind: "harvest", crop: "Glow moss", count: 1 },
		],
		[
			"Harvest under 3 different constellations",
			{ kind: "harvestUnder", count: 3 },
		],
		["Harvest under all 6 constellations", { kind: "harvestUnder", count: 6 }],
		["Complete 3 voyages", { kind: "voyages", count: 3 }],
		[
			"Complete 3 voyages to Bar Shoals",
			{ kind: "voyages", count: 3, destination: "Bar Shoals" },
		],
		[
			"Return from Foo Nebula",
			{ kind: "returnFrom", destination: "Foo Nebula" },
		],
		["Seeds from Bar Shoals", { kind: "seedsFrom", destination: "Bar Shoals" }],
		["Complete 5 contracts", { kind: "contracts", count: 5 }],
		[
			"Complete The Hammer (Library)",
			{ kind: "libraryComplete", constellation: "The Hammer" },
		],
		[
			"Complete The Kettle",
			{ kind: "libraryComplete", constellation: "The Kettle" },
		],
		[
			"Complete 1 clock constellation",
			{ kind: "clockConstellations", count: 1 },
		],
		[
			"Complete 2 clock constellations",
			{ kind: "clockConstellations", count: 2 },
		],
		[
			"Bring back a god relic (Tomb of Stars)",
			{ kind: "godRelic", destination: "Tomb of Stars" },
		],
		["Hatch 3 eggs", { kind: "hatch", count: 3 }],
		["Hatch a Moon Moth", { kind: "hatch", count: 1, species: "Moon Moth" }],
		["Identify 5 relics", { kind: "identify", count: 5 }],
		["Get 10 Overchannel sparks", { kind: "sparks", count: 10 }],
		["The Library opens", { kind: "milestone", milestone: "libraryOpens" }],
		[
			"Bring back the first relic",
			{ kind: "milestone", milestone: "firstRelic" },
		],
		[
			"Find the first egg in the Hollow",
			{ kind: "milestone", milestone: "firstEgg" },
		],
		[
			"Have a voyage end Bumpy",
			{ kind: "milestone", milestone: "voyageBumpy" },
		],
		["Fill a Mana Jar", { kind: "milestone", milestone: "fillManaJar" }],
		[
			"Fill any storage to its cap",
			{ kind: "milestone", milestone: "fillAnyStorage" },
		],
		[
			"Mana demand exceeds supply once",
			{ kind: "milestone", milestone: "manaShortage" },
		],
		[
			"See a full constellation cycle",
			{ kind: "milestone", milestone: "clockCycle" },
		],
	])("%s", (text, expected) => {
		const result = parseUnlock(text, names);
		expect(result).toEqual({ text, ...expected });
		expect(UnlockSchema.parse(result)).toEqual(result);
	});

	it("rejects an unknown phrasing", () => {
		expect(parseUnlock("Produce fifty Cogplates", names)).toEqual({
			error: 'unknown unlock phrasing "Produce fifty Cogplates"',
		});
	});

	it("rejects an unknown name", () => {
		expect(parseUnlock("Own 3 Widgetz", names)).toEqual({
			error: '"Widgetz" is not a Building',
		});
		expect(parseUnlock("Complete The Spoon", names)).toEqual({
			error: '"The Spoon" is not a Library constellation',
		});
	});

	it("rejects a plural that matches two names", () => {
		const both = { ...names, resources: new Set(["Lens", "Lense"]) };
		expect(parseUnlock("Produce 20 Lenses", both)).toEqual({
			error: '"Lenses" is ambiguous: Lense or Lens (Resource)',
		});
	});

	it("prefers an exact name over a plural", () => {
		const both = { ...names, resources: new Set(["Lens", "Lenses"]) };
		expect(parseUnlock("Produce 20 Lenses", both)).toMatchObject({
			resource: "Lenses",
		});
	});

	it("parses every non-empty Unlock cell in the real workbook", () => {
		const sheets = readXlsx(
			readFileSync(
				new URL("../../balance/astral-tower-balance.xlsx", import.meta.url),
			),
		);
		const column = (tab: string, header: string) => {
			const sheet = sheets.find((s) => s.name === tab);
			const col = sheet?.rows[0].cells.find((c) => c.value === header)?.col;
			if (!sheet || !col) throw new Error(`no ${tab}.${header}`);
			return sheet.rows
				.slice(1)
				.map((r) => r.cells.find((c) => c.col === col)?.value);
		};
		const real = unlockNames(sheets);
		const unlocks = [
			"Recipes",
			"Buildings",
			"Upgrades",
			"Crops",
			"Voyages",
			"Ships",
			"Gear",
			"Library",
			"Contracts",
		].flatMap((tab) =>
			column(tab, "Unlock")
				.filter((v) => v !== undefined)
				.map(String),
		);
		expect(unlocks).not.toHaveLength(0);
		const errors = unlocks
			.map((text) => parseUnlock(text, real))
			.filter((r) => "error" in r);
		expect(errors).toEqual([]);
	});
});
