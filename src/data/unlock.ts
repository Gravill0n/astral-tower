// Unlock text → typed condition (GDD 13: unlock text is read by the script,
// in fixed phrasings). A new phrasing means a new row in PATTERNS or MILESTONES.
import { z } from "zod";

const count = z.number().int();
const variant = <K extends string, S extends z.ZodRawShape>(
	kind: K,
	shape: S,
) => z.object({ kind: z.literal(kind), text: z.string(), ...shape });

export const MilestoneSchema = z.enum([
	"libraryOpens",
	"firstRelic",
	"firstEgg",
	"voyageBumpy",
	"fillManaJar",
	"fillAnyStorage",
	"manaShortage",
	"clockCycle",
]);

export const UnlockSchema = z.discriminatedUnion("kind", [
	variant("own", { building: z.string(), count }),
	variant("ownShip", { ship: z.string() }),
	variant("floor", { floor: count }),
	variant("floorFull", { floor: count }),
	variant("comesWith", { building: z.string() }),
	variant("produce", { resource: z.string(), count }),
	variant("have", { resource: z.string(), count }),
	variant("mineByHand", { resource: z.string(), count }),
	variant("harvest", { crop: z.string(), count }),
	variant("harvestUnder", { count }),
	variant("voyages", { count, destination: z.string().optional() }),
	variant("returnFrom", { destination: z.string() }),
	variant("seedsFrom", { destination: z.string() }),
	variant("contracts", { count }),
	variant("libraryComplete", { constellation: z.string() }),
	variant("clockConstellations", { count }),
	variant("godRelic", { destination: z.string() }),
	variant("hatch", { count, species: z.string().optional() }),
	variant("identify", { count }),
	variant("sparks", { count }),
	variant("milestone", { milestone: MilestoneSchema }),
]);

export type Unlock = z.infer<typeof UnlockSchema>;

export type UnlockNames = Record<keyof typeof LABELS, ReadonlySet<string>>;

const LABELS = {
	buildings: "Building",
	resources: "Resource",
	crops: "Crop",
	voyages: "Voyage",
	ships: "Ship",
	library: "Library constellation",
	familiars: "Familiar",
};

type Parsed = {
	[K in Unlock["kind"]]: Omit<Extract<Unlock, { kind: K }>, "text">;
}[Unlock["kind"]];
type Name = (raw: string, set: keyof UnlockNames) => string;

class NameError extends Error {}

const MILESTONES: Record<string, z.infer<typeof MilestoneSchema>> = {
	"The Library opens": "libraryOpens",
	"Bring back the first relic": "firstRelic",
	"Find the first egg in the Hollow": "firstEgg",
	"Have a voyage end Bumpy": "voyageBumpy",
	"Fill a Mana Jar": "fillManaJar",
	"Fill any storage to its cap": "fillAnyStorage",
	"Mana demand exceeds supply once": "manaShortage",
	"See a full constellation cycle": "clockCycle",
};

// Tried in order: "first"/numeric forms before the catch-all named ones.
const PATTERNS: [RegExp, (m: string[], name: Name) => Parsed][] = [
	[
		/^Own (\d+) (.+)$/,
		(m, n) => ({ kind: "own", building: n(m[2], "buildings"), count: +m[1] }),
	],
	[
		/^Build the first (.+)$/,
		(m, n) => ({ kind: "own", building: n(m[1], "buildings"), count: 1 }),
	],
	[/^Own a (.+)$/, (m, n) => ({ kind: "ownShip", ship: n(m[1], "ships") })],
	[/^Build floor (\d+)$/, (m) => ({ kind: "floor", floor: +m[1] })],
	[
		/^Use all of floor (\d+)'s space$/,
		(m) => ({ kind: "floorFull", floor: +m[1] }),
	],
	[
		/^Comes with the first (.+)$/,
		(m, n) => ({ kind: "comesWith", building: n(m[1], "buildings") }),
	],
	[
		/^Comes with the (.+)$/,
		(m, n) => ({ kind: "comesWith", building: n(m[1], "buildings") }),
	],
	[
		/^Produce (\d+) (.+)$/,
		(m, n) => ({
			kind: "produce",
			resource: n(m[2], "resources"),
			count: +m[1],
		}),
	],
	[
		/^Craft the first (.+)$/,
		(m, n) => ({ kind: "produce", resource: n(m[1], "resources"), count: 1 }),
	],
	[
		/^Have (\d+) (.+)$/,
		(m, n) => ({ kind: "have", resource: n(m[2], "resources"), count: +m[1] }),
	],
	[
		/^Mine (\d+) (.+) by hand$/,
		(m, n) => ({
			kind: "mineByHand",
			resource: n(m[2], "resources"),
			count: +m[1],
		}),
	],
	[
		/^Harvest under (\d+) different constellations$/,
		(m) => ({ kind: "harvestUnder", count: +m[1] }),
	],
	[
		/^Harvest under all (\d+) constellations$/,
		(m) => ({ kind: "harvestUnder", count: +m[1] }),
	],
	[
		/^Harvest the first (.+)$/,
		(m, n) => ({ kind: "harvest", crop: n(m[1], "crops"), count: 1 }),
	],
	[
		/^Harvest (\d+) (.+)$/,
		(m, n) => ({ kind: "harvest", crop: n(m[2], "crops"), count: +m[1] }),
	],
	[
		/^Harvest (.+) once$/,
		(m, n) => ({ kind: "harvest", crop: n(m[1], "crops"), count: 1 }),
	],
	[/^Complete (\d+) voyages$/, (m) => ({ kind: "voyages", count: +m[1] })],
	[
		/^Complete (\d+) voyages to (.+)$/,
		(m, n) => ({
			kind: "voyages",
			count: +m[1],
			destination: n(m[2], "voyages"),
		}),
	],
	[
		/^Return from (.+)$/,
		(m, n) => ({ kind: "returnFrom", destination: n(m[1], "voyages") }),
	],
	[
		/^Seeds from (.+)$/,
		(m, n) => ({ kind: "seedsFrom", destination: n(m[1], "voyages") }),
	],
	[/^Complete (\d+) contracts$/, (m) => ({ kind: "contracts", count: +m[1] })],
	[
		/^Complete (\d+) clock constellations?$/,
		(m) => ({ kind: "clockConstellations", count: +m[1] }),
	],
	[
		/^Complete (.+) \(Library\)$/,
		(m, n) => ({ kind: "libraryComplete", constellation: n(m[1], "library") }),
	],
	[
		/^Complete (.+)$/,
		(m, n) => ({ kind: "libraryComplete", constellation: n(m[1], "library") }),
	],
	[
		/^Bring back a god relic \((.+)\)$/,
		(m, n) => ({ kind: "godRelic", destination: n(m[1], "voyages") }),
	],
	[/^Hatch (\d+) eggs$/, (m) => ({ kind: "hatch", count: +m[1] })],
	[
		/^Hatch a (.+)$/,
		(m, n) => ({ kind: "hatch", count: 1, species: n(m[1], "familiars") }),
	],
	[/^Identify (\d+) relics$/, (m) => ({ kind: "identify", count: +m[1] })],
	[/^Get (\d+) Overchannel sparks$/, (m) => ({ kind: "sparks", count: +m[1] })],
];

export function parseUnlock(
	text: string,
	names: UnlockNames,
): Unlock | { error: string } {
	const milestone = MILESTONES[text];
	if (milestone) return { kind: "milestone", text, milestone };
	const name: Name = (raw, set) => {
		const known = names[set];
		if (known.has(raw)) return raw;
		// Plurals: name + "s" or name + "es".
		const found = [raw.replace(/s$/, ""), raw.replace(/es$/, "")].filter(
			(n) => n !== raw && known.has(n),
		);
		if (found.length === 1) return found[0];
		throw new NameError(
			found.length
				? `"${raw}" is ambiguous: ${found.join(" or ")} (${LABELS[set]})`
				: `"${raw}" is not a ${LABELS[set]}`,
		);
	};
	for (const [re, build] of PATTERNS) {
		const m = text.match(re);
		if (!m) continue;
		try {
			return { text, ...build(m, name) };
		} catch (e) {
			if (e instanceof NameError) return { error: e.message };
			throw e;
		}
	}
	return { error: `unknown unlock phrasing "${text}"` };
}
