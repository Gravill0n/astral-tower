// Tab definitions (GDD 13.1) and the Balance schema built from the sheet.
import { z } from "zod";

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

const Global = z.object({
	value: z.number(),
	unit: z.string().optional(),
	notes: z.string().optional(),
});

// Keys match TABS. A Globals record keyed by an enum is exhaustive in Zod 4:
// a missing or unknown parameter fails.
export const BalanceSchema = z.object({
	resources: z.array(Resource),
	globals: z.record(z.enum(GLOBALS), Global),
});

export type Balance = z.infer<typeof BalanceSchema>;
