import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { MilestoneSchema } from "../data/unlock.ts";
import names from "./names-v1.json";
import {
	exportSave,
	loadSave,
	MAX_SAVE_LENGTH,
	migrate,
	saveToString,
} from "./save.ts";
import {
	MAX_BUILDINGS,
	newGame,
	SAVE_VERSION,
	type State,
	TICK,
} from "./state.ts";
import { UNLOCK_KEYS } from "./unlocks.ts";

const recipe = balance.recipes[0];
const otherRecipe = balance.recipes.find((r) => r.building !== recipe.building);
const resource = balance.resources[0].resource;
const upgrade = balance.upgrades[0].upgrade;

const populated = (): State => {
	const state = newGame(1_700_000_000_000);
	state.unlocked.push(`buildings/${recipe.building}`);
	state.run.elapsed = 1234;
	state.run.stock[resource] = 12.5;
	state.run.buildings.push(
		{ type: recipe.building, recipe: recipe.recipe },
		{ type: recipe.building, recipe: null },
	);
	state.run.upgrades[upgrade] = 2;
	state.run.produced[resource] = 40.25;
	state.run.produced.Mana = 300;
	state.run.handMined[resource] = 7;
	state.run.milestones.manaShortage = true;
	state.run.jarMana = 10;
	state.run.recruited = 1;
	state.run.recruitQueue = 2;
	state.run.recruitProgress = 3.5;
	return state;
};

// A valid save with one edit applied to its parsed JSON.
const tampered = (edit: (raw: { run: Record<string, unknown> }) => void) => {
	const raw = JSON.parse(saveToString(populated()));
	edit(raw);
	return JSON.stringify(raw);
};

const expectRejected = (text: string) => {
	const result = loadSave(text);
	expect(result.ok).toBe(false);
	if (!result.ok) expect(result.error).toMatch(/\S/);
};

describe("save round trip", () => {
	it.each([
		["new game", () => newGame(0)],
		["populated", populated],
	])("%s survives saveToString and exportSave", (_, make) => {
		const state = make();
		expect(loadSave(saveToString(state))).toEqual({ ok: true, state });
		expect(loadSave(exportSave(state))).toEqual({ ok: true, state });
	});

	it("exports base64 of UTF-8 JSON", () => {
		const state = populated();
		const text = exportSave(state);
		expect(text).toMatch(/^[A-Za-z0-9+/]+=*$/);
		expect(Buffer.from(text, "base64").toString("utf8")).toBe(
			saveToString(state),
		);
	});

	it("accepts surrounding whitespace in a pasted string", () => {
		const state = populated();
		expect(loadSave(`  ${exportSave(state)}\n`)).toEqual({ ok: true, state });
		expect(loadSave(`\n${saveToString(state)} `)).toEqual({ ok: true, state });
	});
});

describe("loadSave rejects hostile input without throwing", () => {
	it.each([
		["empty", ""],
		["not JSON", "{nope"],
		["garbage base64", "@@@not*base64@@@"],
		["base64 of non-JSON", btoa("hello")],
		["base64 of invalid UTF-8", btoa("\xff\xfe{}")],
		["JSON null", "null"],
		["JSON array", "[]"],
		["JSON number", "42"],
	])("%s", (_, text) => expectRejected(text));

	it("rejects a non-string", () => {
		expect(loadSave(undefined as unknown as string).ok).toBe(false);
	});

	it("rejects input over the size limit before parsing", () => {
		const big = saveToString(populated()).padEnd(MAX_SAVE_LENGTH + 1, " ");
		expect(loadSave(big)).toEqual({ ok: false, error: expect.any(String) });
	});

	it("rejects a version newer than SAVE_VERSION", () => {
		const raw = JSON.parse(saveToString(newGame(0)));
		raw.version = SAVE_VERSION + 1;
		const result = loadSave(JSON.stringify(raw));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toMatch(/newer/);
	});

	it.each([
		[
			"__proto__ in a record",
			'"stock":{}',
			'"stock":{"__proto__":{"polluted":1}}',
		],
		[
			"__proto__ at the top",
			'{"version"',
			'{"__proto__":{"polluted":1},"version"',
		],
	])("rejects %s", (_, from, to) => {
		const text = saveToString(newGame(0)).replace(from, to);
		expect(text).toContain("__proto__");
		expectRejected(text);
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it.each([
		[
			"constructor key",
			(r) => Object.assign(r.run.stock as object, { constructor: 1 }),
		],
		[
			"unknown resource",
			(r) => Object.assign(r.run.stock as object, { Unobtainium: 1 }),
		],
		[
			"unknown produced key",
			(r) => Object.assign(r.run.produced as object, { Nope: 1 }),
		],
		[
			"unknown upgrade",
			(r) => Object.assign(r.run.upgrades as object, { Nope: 1 }),
		],
		[
			"unknown milestone",
			(r) => Object.assign(r.run.milestones as object, { nope: true }),
		],
		[
			"milestone not true",
			(r) => Object.assign(r.run.milestones as object, { manaShortage: false }),
		],
		[
			"unknown building",
			(r) => {
				r.run.buildings = [{ type: "Nope", recipe: null }];
			},
		],
		[
			"unknown recipe",
			(r) => {
				r.run.buildings = [{ type: recipe.building, recipe: "Nope" }];
			},
		],
		[
			"recipe of another building",
			(r) => {
				r.run.buildings = [
					{ type: recipe.building, recipe: otherRecipe?.recipe },
				];
			},
		],
		[
			"extra building field",
			(r) => {
				r.run.buildings = [{ type: recipe.building, recipe: null, x: 1 }];
			},
		],
		[
			"extra run field",
			(r) => {
				r.run.cheat = 1;
			},
		],
		[
			"missing run field",
			(r) => {
				delete r.run.stock;
			},
		],
		[
			"negative stock",
			(r) => Object.assign(r.run.stock as object, { [resource]: -1 }),
		],
		[
			"string stock",
			(r) => Object.assign(r.run.stock as object, { [resource]: "1" }),
		],
		[
			"non-integer upgrade level",
			(r) => Object.assign(r.run.upgrades as object, { [upgrade]: 1.5 }),
		],
		[
			"non-integer recruited",
			(r) => {
				r.run.recruited = 0.5;
			},
		],
		[
			"negative recruit queue",
			(r) => {
				r.run.recruitQueue = -1;
			},
		],
		[
			"null jar mana",
			(r) => {
				r.run.jarMana = null;
			},
		],
		[
			"buildings not an array",
			(r) => {
				r.run.buildings = {};
			},
		],
	] satisfies [string, (raw: { run: Record<string, unknown> }) => void][])(
		"rejects %s",
		(_, edit) => expectRejected(tampered(edit)),
	);

	it("rejects an infinite number (1e999 parses to Infinity)", () => {
		expectRejected(
			saveToString(newGame(0)).replace('"jarMana":0', '"jarMana":1e999'),
		);
	});

	it.each([
		["negative", -TICK],
		["not a whole tick", TICK + 1],
		["a string", "0"],
	])("rejects a time that is %s", (_, time) => {
		const raw = JSON.parse(saveToString(newGame(0)));
		raw.time = time;
		expectRejected(JSON.stringify(raw));
	});

	it.each([
		[
			"recruit progress over Recruit time",
			(r) => {
				r.run.recruitProgress = balance.globals["Recruit time"].value + 1;
			},
		],
		[
			"overchannel below 100%",
			(r) => {
				r.run.overchannel = 0.5;
			},
		],
		[
			"overchannel over Overchannel max",
			(r) => {
				r.run.overchannel = balance.globals["Overchannel max"].value + 0.01;
			},
		],
		[
			"more than MAX_BUILDINGS buildings",
			(r) => {
				r.run.buildings = Array.from({ length: MAX_BUILDINGS + 1 }, () => ({
					type: recipe.building,
					recipe: null,
				}));
			},
		],
	] satisfies [string, (raw: { run: Record<string, unknown> }) => void][])(
		"rejects %s",
		(_, edit) => expectRejected(tampered(edit)),
	);

	it("rejects a time past the largest valid Date", () => {
		const raw = JSON.parse(saveToString(newGame(0)));
		raw.time = 8.64e15 + TICK;
		expectRejected(JSON.stringify(raw));
		raw.time = 8.64e15;
		expect(loadSave(JSON.stringify(raw)).ok).toBe(true);
	});

	it("keeps the error short for a save with thousands of issues", () => {
		const text = tampered((r) => {
			r.run.buildings = Array.from({ length: 30_000 }, () => ({ type: "?" }));
		});
		expect(text.length).toBeLessThan(MAX_SAVE_LENGTH);
		const result = loadSave(text);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error.length).toBeLessThanOrEqual(400);
	});

	it("rejects an extra top-level field", () => {
		const raw = JSON.parse(saveToString(newGame(0)));
		raw.extra = 1;
		expectRejected(JSON.stringify(raw));
	});

	it("rejects unlocked that is not a string list", () => {
		const raw = JSON.parse(saveToString(newGame(0)));
		raw.unlocked = [1];
		expectRejected(JSON.stringify(raw));
	});

	it("rejects an unknown unlock key", () => {
		const raw = JSON.parse(saveToString(newGame(0)));
		raw.unlocked = ["buildings/Nope"];
		expectRejected(JSON.stringify(raw));
	});
});

describe("saveToString", () => {
	it.each([
		["NaN", Number.NaN],
		["Infinity", Number.POSITIVE_INFINITY],
	])("throws on %s instead of writing an unloadable save", (_, bad) => {
		const state = populated();
		state.run.jarMana = bad;
		expect(() => saveToString(state)).toThrow(/not finite/);
	});
});

// names-v1.json freezes every sheet name a v1 save can hold. A rename or
// removal in the sheet would make old saves fail to load.
describe("save-relevant names (frozen v1 snapshot)", () => {
	const fix =
		"a sheet rename/removal breaks old saves: bump SAVE_VERSION, add a migration, then update src/core/names-v1.json";
	const missing = (frozen: string[], now: string[]) =>
		frozen.filter((n) => !now.includes(n));

	it.each([
		["resources", names.resources, balance.resources.map((r) => r.resource)],
		["buildings", names.buildings, balance.buildings.map((b) => b.building)],
		["upgrades", names.upgrades, balance.upgrades.map((u) => u.upgrade)],
		["milestones", names.milestones, MilestoneSchema.options],
		["unlock keys", names.unlockKeys, UNLOCK_KEYS],
	])("still has every frozen %s", (_, frozen, now) => {
		expect(missing(frozen, now), fix).toEqual([]);
	});

	it("still has every frozen recipe on the same building", () => {
		const now = Object.fromEntries(
			balance.recipes.map((r) => [r.recipe, r.building]),
		);
		const changed = Object.entries(names.recipes).filter(
			([r, b]) => now[r] !== b,
		);
		expect(changed, fix).toEqual([]);
	});
});

describe("save versions (GDD 11.3)", () => {
	const savesDir = new URL("./saves/", import.meta.url);
	const fixtures = readdirSync(savesDir).filter((f) => f.endsWith(".json"));

	it("has fixtures, starting with the v1 new game", () => {
		expect(fixtures).toContain("v1-new-game.json");
	});

	it.each(fixtures)("loads frozen fixture %s", (file) => {
		const result = loadSave(readFileSync(new URL(file, savesDir), "utf8"));
		expect(result).toMatchObject({ ok: true });
	});

	// Synthetic v0 shape: the same save before `recruited` existed.
	const v0 = () => {
		const raw = JSON.parse(saveToString(populated()));
		raw.version = 0;
		delete raw.run.recruited;
		return raw;
	};
	const v0to1 = (raw: unknown) => {
		const r = raw as { version: number; run: Record<string, unknown> };
		return { ...r, version: 1, run: { ...r.run, recruited: 1 } };
	};

	it("migrate runs each step in version order", () => {
		const order: number[] = [];
		const steps = {
			0: (raw: unknown) => {
				order.push(0);
				return raw;
			},
		};
		migrate({ version: 0 }, steps);
		migrate({ version: SAVE_VERSION }, steps);
		expect(order).toEqual([0]);
	});

	it("loads an old save through an injected migration", () => {
		expect(loadSave(JSON.stringify(v0()), { 0: v0to1 })).toEqual({
			ok: true,
			state: populated(),
		});
	});

	it("rejects an old save with no migration for its version", () => {
		expectRejected(JSON.stringify(v0()));
	});

	it.each([
		[
			"throws",
			() => {
				throw new Error("boom");
			},
		],
		["yields invalid state", () => ({ version: 1 })],
		["forgets to bump the version", (raw: unknown) => raw],
	])("rejects when the migration %s", (_, step) => {
		const result = loadSave(JSON.stringify(v0()), { 0: step });
		expect(result.ok).toBe(false);
	});

	it.each([
		["missing", undefined],
		["not an integer", 0.5],
		["a string", "1"],
		["below 1", -1],
	])("rejects a version that is %s", (_, version) => {
		const raw = JSON.parse(saveToString(newGame(0)));
		raw.version = version;
		expectRejected(JSON.stringify(raw));
	});
});
