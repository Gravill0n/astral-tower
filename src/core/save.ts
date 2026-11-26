// Saves (GDD 11.3): the core only produces and parses strings; storage is M3.
// Loaded text is untrusted (pasted imports, edited storage) and is validated.
import { z } from "zod";
import { balance } from "../data/index.ts";
import { MilestoneSchema } from "../data/unlock.ts";
import { SAVE_VERSION, type State, TICK } from "./state.ts";

export const MAX_SAVE_LENGTH = 1024 * 1024; // characters; both formats are ~1 byte each

export type LoadResult =
	| { ok: true; state: State }
	| { ok: false; error: string };

const names = (list: string[]) => z.enum(list as [string, ...string[]]);
const Resource = names(balance.resources.map((r) => r.resource));
const BuildingType = names(balance.buildings.map((b) => b.building));
const Recipe = names(balance.recipes.map((r) => r.recipe));
const Upgrade = names(balance.upgrades.map((u) => u.upgrade));
const recipeBuilding = new Map(
	balance.recipes.map((r) => [r.recipe, r.building]),
);

const amount = z.number().nonnegative(); // z.number() also rejects NaN and ±Infinity
const count = z.number().int().nonnegative();
// Partial: a missing key means 0. A plain z.record with enum keys is exhaustive in Zod 4.
const counts = (key: z.ZodEnum, value = amount) => z.partialRecord(key, value);

const SaveSchema = z.strictObject({
	version: z.literal(SAVE_VERSION),
	time: count.multipleOf(TICK),
	unlocked: z.array(z.string()), // "<tab>/<name>" keys are checked by unlocks (T7)
	run: z.strictObject({
		elapsed: amount,
		stock: counts(Resource),
		buildings: z.array(
			z
				.strictObject({ type: BuildingType, recipe: Recipe.nullable() })
				.refine(
					(b) => b.recipe === null || recipeBuilding.get(b.recipe) === b.type,
					{
						message: "recipe does not belong to this building",
					},
				),
		),
		upgrades: counts(Upgrade, count),
		produced: counts(z.enum([...Resource.options, "Mana"])),
		handMined: counts(Resource),
		milestones: z.partialRecord(MilestoneSchema, z.literal(true)),
		jarMana: amount,
		overchannel: amount,
		recruited: count,
		recruitQueue: count,
		recruitProgress: amount,
	}),
});

export const saveToString = (state: State): string => JSON.stringify(state);

// Base64 of the UTF-8 JSON, for copy and paste.
export const exportSave = (state: State): string => {
	const bytes = new TextEncoder().encode(saveToString(state));
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
};

const decodeBase64 = (text: string): string =>
	new TextDecoder("utf-8", { fatal: true }).decode(
		Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
	);

// Accepts saveToString or exportSave output. Never throws.
export const loadSave = (text: string): LoadResult => {
	if (typeof text !== "string") return { ok: false, error: "Save is not text" };
	if (text.length > MAX_SAVE_LENGTH)
		return { ok: false, error: "Save is too large" };
	let raw: unknown;
	try {
		const trimmed = text.trim();
		const json = trimmed.startsWith("{") ? trimmed : decodeBase64(trimmed);
		raw = JSON.parse(json, (key, value) => {
			if (key === "__proto__") throw new Error("forbidden key");
			return value;
		});
	} catch {
		return { ok: false, error: "Save is not readable" };
	}
	const version = (raw as { version?: unknown } | null)?.version;
	if (typeof version === "number" && version > SAVE_VERSION) {
		return { ok: false, error: "Save is from a newer version of the game" };
	}
	// T5: the migration chain (version → SAVE_VERSION) runs here, before Zod.
	const result = SaveSchema.safeParse(raw);
	if (!result.success) {
		return {
			ok: false,
			error: `Save is invalid: ${z.prettifyError(result.error)}`,
		};
	}
	return { ok: true, state: result.data as State };
};
