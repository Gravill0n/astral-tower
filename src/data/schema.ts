// Tab definitions (GDD 13.1) and the Balance schema built from the sheet.
import { z } from "zod";
import { UnlockSchema } from "./unlock.ts";

export type TabDef = {
	tab: string;
	// Raw name column: names rows in error messages (and keys a keyed tab).
	// Two columns (Events) name a row "A / B"; addresses use the first.
	nameColumn?: string | [string, string];
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
	convert?: Record<string, "yesNo" | "unlock" | "perLevel" | "numberList">;
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
	voyages: {
		tab: "Voyages",
		nameColumn: "Nebula",
		columns: {
			Nebula: "nebula",
			Unlock: "unlock",
			"Base time (min)": "baseTime",
			Danger: "danger",
			Provisions: "provisions",
			"Aether charge (mana)": "aetherCharge",
			"Relic chance": "relicChance",
			"Egg chance": "eggChance",
			Notes: "notes",
		},
		pairs: {
			loot: [
				["Loot 1", "Qty 1"],
				["Loot 2", "Qty 2"],
			],
		},
		convert: { unlock: "unlock" },
		ignore: ["Loot 1 /h", "Loot 2 /h", "Time on current (min)"],
	},
	ships: {
		tab: "Ships",
		nameColumn: "Ship",
		columns: {
			Ship: "ship",
			Unlock: "unlock",
			Speed: "speed",
			Safety: "safety",
			"Cargo ×": "cargo",
			"Gear slots": "gearSlots",
			Crew: "crew",
		},
		pairs: {
			costs: [
				["Cost 1", "Qty 1"],
				["Cost 2", "Qty 2"],
			],
		},
		convert: { unlock: "unlock" },
	},
	gear: {
		tab: "Gear",
		nameColumn: "Name",
		columns: {
			Kind: "kind",
			Name: "name",
			Unlock: "unlock",
			Speed: "speed",
			Safety: "safety",
			Cargo: "cargo",
			"Per level": "perLevel",
			"Max level": "maxLevel",
			Notes: "notes",
		},
		convert: { unlock: "unlock", perLevel: "perLevel" },
	},
	pace: {
		tab: "Pace",
		nameColumn: "Pace",
		columns: {
			Pace: "pace",
			"Time ×": "time",
			"Danger ×": "danger",
			"Provisions ×": "provisions",
			Notes: "notes",
		},
	},
	library: {
		tab: "Library",
		nameColumn: "Constellation",
		columns: {
			Constellation: "constellation",
			Kind: "kind",
			Stars: "stars",
			Unlock: "unlock",
			"Per-star bonus": "perStarBonus",
			"Full-set reward": "fullSetReward",
			Value: "value",
		},
		convert: { unlock: "unlock" },
	},
	familiars: {
		tab: "Familiars",
		nameColumn: "Species",
		columns: {
			Species: "species",
			"Egg source": "eggSource",
			"Hatch time (min)": "hatchTime",
			"Incubator charms": "incubatorCharms",
			Feed: "feed",
			"Feed /h": "feedPerHour",
			"Breed time (min)": "breedTime",
			Job: "job",
			"Job bonus": "jobBonus",
			"Bonus value": "bonusValue",
		},
	},
	traits: {
		tab: "Traits",
		nameColumn: "Trait",
		columns: {
			Trait: "trait",
			Effect: "effect",
			Common: "common",
			Bright: "bright",
			Radiant: "radiant",
			Stellar: "stellar",
		},
	},
	events: {
		tab: "Events",
		nameColumn: ["Event", "Option"],
		columns: {
			Event: "event",
			Option: "option",
			Time: "time",
			"Time of": "timeOf",
			Loot: "loot",
			"Relic chance +": "relicChance",
			"Danger +": "danger",
			"Picked by": "pickedBy",
		},
	},
	contracts: {
		tab: "Contracts",
		columns: {
			Unlock: "unlock",
			"Good asked": "goodAsked",
			Reward: "reward",
			"Reward qty": "rewardQty",
			Reputation: "reputation",
		},
		convert: { unlock: "unlock" },
	},
	stardustTree: {
		tab: "Stardust tree",
		nameColumn: "Node",
		columns: {
			Node: "node",
			Branch: "branch",
			Effect: "effect",
			"Per level": "perLevel",
			Cost: "cost",
			Growth: "growth",
			"Max level": "maxLevel",
		},
		ignore: ["Total to max"],
	},
	stardustGain: {
		tab: "Stardust gain",
		columns: {
			"Mana produced this run": "mana",
			Stardust: "stardust",
		},
	},
	research: {
		tab: "Research",
		nameColumn: "Research",
		columns: {
			Research: "research",
			Effect: "effect",
			"Per level": "perLevel",
			"Cost (Lore)": "cost",
			Growth: "growth",
			"Max level": "maxLevel",
		},
		ignore: ["Total to max"],
	},
	stars: {
		tab: "Stars",
		nameColumn: "Star",
		columns: {
			Star: "star",
			"Phase length (min)": "phaseLength",
			"Drill output ×": "drillOutput",
			"Frost drill output ×": "frostDrillOutput",
			"Mana draw ×": "manaDraw",
			"Surge fill ×": "surgeFill",
			"Pulse high ×": "pulseHigh",
			"Pulse low ×": "pulseLow",
			"Pulse length (s)": "pulseLength",
			"Voyage time ×": "voyageTime",
			"Relic chance ×": "relicChance",
			"Relic chance +": "relicChanceBonus",
			"Floor space": "floorSpace",
			"Twin clock": "twinClock",
			Notes: "notes",
		},
		convert: { twinClock: "yesNo" },
	},
	trials: {
		tab: "Trials",
		nameColumn: "Trial",
		columns: {
			Trial: "trial",
			Kind: "kind",
			Rule: "rule",
			"Stardust bonus": "stardustBonus",
			Notes: "notes",
		},
	},
	galaxy: {
		tab: "Galaxy",
		nameColumn: "Star",
		columns: {
			Star: "star",
			Type: "type",
			Dim: "dim",
			"Links to": "linksTo",
			Trial: "trial",
			Notes: "notes",
		},
		convert: { dim: "yesNo", linksTo: "numberList" },
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

const Voyage = z.object({
	nebula: z.string(),
	unlock: UnlockSchema,
	baseTime: z.number(),
	danger: z.number(),
	provisions: z.number(),
	aetherCharge: z.number(),
	loot: pairs,
	relicChance: z.number(),
	eggChance: z.number(),
	notes,
});

const Ship = z.object({
	ship: z.string(),
	unlock: UnlockSchema,
	costs: pairs,
	speed: z.number(),
	safety: z.number(),
	cargo: z.number(),
	gearSlots: z.number(),
	crew: z.number(),
});

const Gear = z.object({
	kind: z.enum(["Gear", "Captain", "Companion"]),
	name: z.string(),
	unlock: UnlockSchema,
	speed: z.number().optional(),
	safety: z.number().optional(),
	cargo: z.number().optional(),
	// "+2 Safety" → { safety, 2 }; "+2% speed" → { speed, 0.02 }
	perLevel: z
		.object({ stat: z.enum(["safety", "speed"]), value: z.number() })
		.optional(),
	maxLevel: z.number().optional(),
	notes,
});

const Pace = z.object({
	pace: z.string(),
	time: z.number(),
	danger: z.number(),
	provisions: z.number(),
	notes,
});

const LibraryConstellation = z.object({
	constellation: z.string(),
	kind: z.enum(["Clock", "Craft", "God"]),
	stars: z.number(),
	unlock: UnlockSchema,
	perStarBonus: z.string().optional(),
	fullSetReward: z.string(),
	value: z.number().optional(),
});

const Familiar = z.object({
	species: z.string(),
	eggSource: z.string(),
	hatchTime: z.number(),
	incubatorCharms: z.number(),
	feed: z.string(),
	feedPerHour: z.number(),
	breedTime: z.number(),
	job: z.string(),
	jobBonus: z.string(),
	bonusValue: z.number(),
});

const Trait = z.object({
	trait: z.string(),
	effect: z.string(),
	common: z.number(),
	bright: z.number(),
	radiant: z.number(),
	stellar: z.number(),
});

const VoyageEvent = z.object({
	event: z.string(),
	option: z.string(),
	time: z.number().optional(),
	timeOf: z.enum(["remaining", "trip"]).optional(),
	loot: z.number().optional(),
	relicChance: z.number().optional(),
	danger: z.number().optional(),
	pickedBy: z.string(), // captain first names or "third captain" (checked in T8)
});

const Contract = z.object({
	unlock: UnlockSchema,
	goodAsked: z.string(),
	reward: z.string(),
	rewardQty: z.number(),
	reputation: z.number(),
});

const StardustNode = z.object({
	node: z.string(),
	branch: z.enum([
		"Foundry",
		"Gardens",
		"Guild",
		"Library",
		"Bestiary",
		"Comfort",
	]),
	effect: z.string(),
	perLevel: z.number(),
	cost: z.number(),
	growth: z.number(),
	maxLevel: z.number(),
});

// Check rows for the Stardust formula (Globals c and divisor).
const StardustGain = z.object({ mana: z.number(), stardust: z.number() });

const Research = z.object({
	research: z.string(),
	effect: z.string(),
	perLevel: z.number(),
	cost: z.number(), // Lore
	growth: z.number(),
	maxLevel: z.number(),
});

const Star = z.object({
	star: z.string(),
	phaseLength: z.number(),
	drillOutput: z.number(),
	frostDrillOutput: z.number(),
	manaDraw: z.number(),
	surgeFill: z.number(),
	pulseHigh: z.number(),
	pulseLow: z.number(),
	pulseLength: z.number().optional(),
	voyageTime: z.number(),
	relicChance: z.number(),
	relicChanceBonus: z.number(),
	floorSpace: z.number(),
	twinClock: z.boolean(),
	notes,
});

const Trial = z.object({
	trial: z.string(),
	kind: z.enum(["Optional", "Dim star"]),
	rule: z.string(), // Dim star: "<trial> and <trial>" (checked in T8)
	stardustBonus: z.number(),
	notes,
});

const GalaxyStar = z.object({
	star: z.number(),
	type: z.string(), // a Stars name or "Dim" (checked in T8)
	dim: z.boolean(),
	linksTo: z.array(z.number()),
	trial: z.string().optional(),
	notes,
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
	voyages: z.array(Voyage),
	ships: z.array(Ship),
	gear: z.array(Gear),
	pace: z.array(Pace),
	library: z.array(LibraryConstellation),
	familiars: z.array(Familiar),
	traits: z.array(Trait),
	events: z.array(VoyageEvent),
	contracts: z.array(Contract),
	stardustTree: z.array(StardustNode),
	stardustGain: z.array(StardustGain),
	research: z.array(Research),
	stars: z.array(Star),
	trials: z.array(Trial),
	galaxy: z.array(GalaxyStar),
	globals: z.record(z.enum(GLOBALS), Global),
});

export type Balance = z.infer<typeof BalanceSchema>;
