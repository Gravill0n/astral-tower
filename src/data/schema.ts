// Tab definitions (GDD 13.1) and the Balance schema built from the sheet.
import { z } from "zod";
import { UnlockSchema } from "./unlock.ts";

export type TabDef = {
	tab: string;
	// Raw name column: names rows in error messages (and keys a keyed tab).
	nameColumn?: string;
	// Exact header text → row key. Every listed header must be present.
	columns: Record<string, string>;
	// Derived helper columns, dropped.
	ignore?: string[];
	// Rows become one object keyed by the name column instead of an array.
	keyed?: boolean;
	// Row key → paired [resource, qty] headers, turned into [{ resource, qty }].
	// Half a pair is an error.
	pairs?: Record<string, [string, string][]>;
	// Row key → conversion run before Zod.
	convert?: Record<string, "yesNo" | "unlock">;
};

// The 53 Globals parameters, exactly as named in the sheet.
export const GLOBALS = [
	"Constellation length",
	"Constellations",
	"Clock cycle",
	"Default cost growth",
	"Base mana generation",
	"Starting apprentices",
	"Recruit cost",
	"Recruit cost growth",
	"Recruit time",
	"Food per apprentice",
	"Hungry apprentice speed",
	"Starting floor space",
	"Favored constellation bonus",
	"Sleepy harvest yield",
	"Overchannel max",
	"Surge meter size",
	"Surge fill at max Overchannel",
	"Spark pause",
	"Switch or move downtime",
	"Bumpy chance per Danger over Safety",
	"Adrift chance per Danger over Safety + 20",
	"Cargo lost when Bumpy",
	"Extra time when Adrift",
	"Base relic study time",
	"Identification speed under The Key",
	"Lore per duplicate relic",
	"Bad-luck protection",
	"Mutation chance",
	"Bond for the 3rd trait slot",
	"Glow odds: Bright",
	"Glow odds: Radiant",
	"Glow odds: Stellar",
	"Stardust constant c",
	"Stardust mana divisor",
	"Offline cap",
	"Offline speed",
	"Trip time saved on the right current",
	"Breeding speed under own constellation",
	"Starter Starwheat",
	"Voyage event chance",
	"Voyage event chance with Mira",
	"Voyages per captain level",
	"Star-match unlock",
	"Star-match wrong-pick lock",
	"Bonus egg chance per breeding",
	"Contracts on the board",
	"Contract refresh",
	"Contract size",
	"Star charts from reputation",
	"Trial Stardust bonus",
	"Settled-star trickle",
	"Meal buff cap",
	"Max Docks",
] as const;

export const TABS = {
	resources: {
		tab: "Resources",
		nameColumn: "Resource",
		columns: {
			Resource: "resource",
			Tier: "tier",
			Module: "module",
			Source: "source",
			"Storage cap": "storageCap",
		},
	},
	recipes: {
		tab: "Recipes",
		nameColumn: "Recipe",
		columns: {
			Recipe: "recipe",
			Building: "building",
			Unlock: "unlock",
			Output: "output",
			"Out qty": "outQty",
			"Time (s)": "time",
			"Mana (/s)": "mana",
			Notes: "notes",
		},
		pairs: {
			inputs: [
				["Input 1", "Qty 1"],
				["Input 2", "Qty 2"],
			],
			byproducts: [["Byproduct", "By qty"]],
		},
		convert: { unlock: "unlock" },
		ignore: ["Out /s", "In 1 /s", "In 2 /s", "By /s", "Mana per unit"],
	},
	buildings: {
		tab: "Buildings",
		nameColumn: "Building",
		columns: {
			Building: "building",
			Module: "module",
			Unlock: "unlock",
			Space: "space",
			Apprentices: "apprentices",
			Growth: "growth",
			Provides: "provides",
			"Provides unit": "providesUnit",
			Notes: "notes",
		},
		pairs: {
			costs: [
				["Cost 1", "Qty 1"],
				["Cost 2", "Qty 2"],
			],
		},
		convert: { unlock: "unlock" },
		ignore: ["Cost 1 for #2", "Cost 1 for #5", "Cost 1 for #10"],
	},
	upgrades: {
		tab: "Upgrades",
		nameColumn: "Upgrade",
		columns: {
			Upgrade: "upgrade",
			Target: "target",
			Unlock: "unlock",
			Effect: "effect",
			"Per level": "perLevel",
			Cost: "cost",
			"Base qty": "baseQty",
			Growth: "growth",
			"Max level": "maxLevel",
		},
		convert: { unlock: "unlock" },
		ignore: ["Cost at lvl 5", "Total to max"],
	},
	crops: {
		tab: "Crops",
		nameColumn: "Crop",
		columns: {
			Crop: "crop",
			Unlock: "unlock",
			"Sow under": "sowUnder",
			"Harvest under": "harvestUnder",
			"Grow time (min)": "growTime",
			Yield: "yield",
			"Food value": "foodValue",
			Use: "use",
		},
		pairs: { seeds: [["Seed", "Seed qty"]] },
		convert: { unlock: "unlock" },
		ignore: ["Harvests per cycle", "Yield per cycle", "Food /min per bed"],
	},
	buffs: {
		tab: "Buffs",
		nameColumn: "Source",
		columns: {
			Source: "source",
			Kind: "kind",
			"Applies to": "appliesTo",
			Speed: "speed",
			Mana: "mana",
			Output: "output",
			Yield: "yield",
			"Duration (min)": "duration",
			Notes: "notes",
		},
	},
	clock: {
		tab: "Clock",
		nameColumn: "Constellation",
		columns: {
			"#": "index",
			Constellation: "constellation",
			"Starts (min)": "starts",
			"Ends (min)": "ends",
			Bonus: "bonus",
			"Applies to": "appliesTo",
			Value: "value",
			"Starlight Collector": "starlightCollector",
			"Breeds faster": "breedsFaster",
			"Current to": "currentTo",
		},
		convert: { starlightCollector: "yesNo" },
	},
	globals: {
		tab: "Globals",
		nameColumn: "Parameter",
		keyed: true,
		columns: {
			Parameter: "parameter",
			Value: "value",
			Unit: "unit",
			Notes: "notes",
		},
	},
} satisfies Record<string, TabDef>;

const Resource = z.object({
	resource: z.string(),
	tier: z.enum([
		"Raw",
		"Refined",
		"Byproduct",
		"Part",
		"Enchanted",
		"Ship gear",
		"Rune",
		"Rare",
		"Seed",
		"Crop",
		"Meal",
		"Supply",
	]),
	module: z.enum(["Foundry", "Guild", "Gardens"]),
	source: z.string(),
	storageCap: z.number(),
});

const notes = z.string().optional();
const pairs = z.array(z.object({ resource: z.string(), qty: z.number() }));

const Recipe = z.object({
	recipe: z.string(),
	building: z.string(),
	unlock: UnlockSchema,
	output: z.string(), // a Resource or "Mana" (checked in T8)
	outQty: z.number(),
	inputs: pairs,
	time: z.number(),
	mana: z.number(),
	byproducts: pairs,
	notes,
});

const Building = z.object({
	building: z.string(),
	module: z.enum([
		"Foundry",
		"Tower",
		"Shared",
		"Gardens",
		"Guild",
		"Library",
		"Bestiary",
	]),
	unlock: UnlockSchema,
	space: z.number(),
	apprentices: z.number(),
	costs: pairs,
	growth: z.number(),
	provides: z.number().optional(),
	providesUnit: z.string().optional(),
	notes,
});

const Upgrade = z.object({
	upgrade: z.string(),
	target: z.string(),
	unlock: UnlockSchema,
	effect: z.string(),
	perLevel: z.number(),
	cost: z.string(),
	baseQty: z.number(),
	growth: z.number(),
	maxLevel: z.number(),
});

const Crop = z.object({
	crop: z.string(),
	unlock: UnlockSchema,
	sowUnder: z.string(), // "Any" or a Clock constellation (checked in T8)
	harvestUnder: z.string(),
	growTime: z.number(),
	yield: z.number(),
	seeds: pairs,
	foodValue: z.number(),
	use: z.string(),
});

const Buff = z.object({
	source: z.string(),
	kind: z.enum(["Meal", "Rune", "Mana grid", "Gardens", "Familiar", "Library"]),
	appliesTo: z.string(),
	speed: z.number().optional(),
	mana: z.number().optional(),
	output: z.number().optional(),
	yield: z.number().optional(),
	duration: z.number().optional(),
	notes,
});

const ClockPhase = z.object({
	index: z.number(),
	constellation: z.string(),
	starts: z.number(),
	ends: z.number(),
	bonus: z.string(),
	appliesTo: z.string(),
	value: z.number(),
	starlightCollector: z.boolean(),
	breedsFaster: z.string(),
	currentTo: z.string().optional(),
});

const Global = z.object({
	value: z.number(),
	unit: z.string().optional(),
	notes: z.string().optional(),
});

// Keys match TABS. A Globals record keyed by an enum is exhaustive in Zod 4:
// a missing or unknown parameter fails.
export const BalanceSchema = z.object({
	resources: z.array(Resource),
	recipes: z.array(Recipe),
	buildings: z.array(Building),
	upgrades: z.array(Upgrade),
	crops: z.array(Crop),
	buffs: z.array(Buff),
	clock: z.array(ClockPhase),
	globals: z.record(z.enum(GLOBALS), Global),
});

export type Balance = z.infer<typeof BalanceSchema>;
