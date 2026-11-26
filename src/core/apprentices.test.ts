import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { APPRENTICE_QUARTERS, apprentices, recruit } from "./apprentices.ts";
import { bulkCost, recruitCost } from "./cost.ts";
import { MANA_JAR, manaFlow } from "./mana.ts";
import { loadSave, saveToString } from "./save.ts";
import { newGame, type State } from "./state.ts";
import { step, tick } from "./step.ts";

const start = balance.globals["Starting apprentices"].value;
const row = (name: string) => {
	const r = balance.buildings.find((b) => b.building === name);
	if (!r) throw new Error(`Buildings: no ${name}`);
	return r;
};
const recipe = (name: string) => {
	const r = balance.recipes.find((x) => x.recipe === name);
	if (!r) throw new Error(`Recipes: no ${name}`);
	return r;
};
const brass = recipe("Emberbrass");
const mine = recipe("Mine Ember ore");
const crucible = row(brass.building);
const quarters = row(APPRENTICE_QUARTERS);
const add = (s: State, type: string, r: string | null, n: number) => {
	for (let i = 0; i < n; i++) s.run.buildings.push({ type, recipe: r });
};
// Crucibles needing `extra` apprentices more than the starting pool.
const short = (extra: number) => (start + extra) / crucible.apprentices;
const dark = balance.clock.find((p) => !p.starlightCollector);
if (!dark) throw new Error("Clock: need a dark phase");

describe("apprentices (gdd 3.4)", () => {
	it("names a building from the Buildings tab", () => {
		expect(balance.buildings.map((b) => b.building)).toContain(
			APPRENTICE_QUARTERS,
		);
	});

	it("starts with Starting apprentices, all free, none needed", () => {
		expect(apprentices(newGame(0))).toEqual({
			count: start,
			room: start,
			needed: 0,
			free: start,
			factor: 1,
		});
	});

	it("counts recruits; quarters raise room but not count", () => {
		const s = newGame(0);
		s.run.recruited = 3;
		add(s, APPRENTICE_QUARTERS, null, 2);
		const a = apprentices(s);
		expect(a.count).toBe(start + 3);
		expect(a.room).toBe(start + 2 * (quarters.provides ?? 0));
	});

	it("needed sums non-Idle buildings only", () => {
		const s = newGame(0);
		add(s, crucible.building, brass.recipe, 3);
		add(s, crucible.building, null, 5);
		expect(apprentices(s).needed).toBe(3 * crucible.apprentices);
	});

	it("factor is free ÷ needed when short, else 1", () => {
		const s = newGame(0);
		add(s, crucible.building, brass.recipe, short(2));
		const a = apprentices(s);
		expect(a.needed).toBe(start + 2);
		expect(a.factor).toBeCloseTo(start / (start + 2));
		s.run.recruited = 2;
		expect(apprentices(s).factor).toBe(1);
	});
});

describe("apprentice shortage in tick (gdd 3.4)", () => {
	it("slows Crucibles to free ÷ needed, Star Drills unaffected", () => {
		const n = short(2);
		const s = newGame(0);
		add(s, crucible.building, brass.recipe, n);
		add(s, mine.building, mine.recipe, 1);
		s.run.stock[brass.inputs[0].resource] = 100; // under the cap
		// A full Mana Jar covers the deficit, so only apprentices limit speed.
		add(s, MANA_JAR, null, 1);
		s.run.jarMana = 1000;
		expect(manaFlow(s, dark).factor).toBe(1);
		tick(s, 1, dark);
		const f = start / (start + 2);
		expect(s.run.produced[brass.output]).toBeCloseTo(
			(n * f * brass.outQty) / brass.time,
		);
		expect(s.run.produced[mine.output]).toBeCloseTo(mine.outQty / mine.time);
	});

	it("mana demand uses apprentice-limited uptime", () => {
		// Ore for exactly 1 s of the slowed lines: full uptime, full draw.
		const n = short(2);
		const f = start / (start + 2);
		const [ore] = brass.inputs;
		const s = newGame(0);
		add(s, crucible.building, brass.recipe, n);
		s.run.stock[ore.resource] = (ore.qty * n * f) / brass.time;
		expect(manaFlow(s, dark).demand).toBeCloseTo(n * brass.mana);
	});
});

describe("recruiting (gdd 3.4)", () => {
	const g = balance.globals;
	const unit = g["Recruit cost"].unit ?? "";
	const recruitMs = g["Recruit time"].value * 1000;
	// Σ round(Recruit cost × growth^(owned+i)), straight from the Globals.
	const price = (owned: number, k: number) => {
		let q = 0;
		for (let i = 0; i < k; i++)
			q += Math.round(
				g["Recruit cost"].value * g["Recruit cost growth"].value ** (owned + i),
			);
		return q;
	};
	// Room for `extra` recruits, `stock` Recruit cost units in hand.
	const ready = (extra: number, stock: number) => {
		const s = newGame(0);
		add(
			s,
			APPRENTICE_QUARTERS,
			null,
			Math.ceil(extra / (quarters.provides ?? 1)),
		);
		s.run.stock[unit] = stock;
		return s;
	};

	it("cost adapter matches the Globals", () => {
		expect(bulkCost(recruitCost, 2, 3)).toEqual([
			{ resource: unit, qty: price(2, 3) },
		]);
	});

	it("queues k recruits for the growing price, owned = recruited + queued", () => {
		const s = ready(4, 1e9);
		s.run.recruited = 1;
		s.run.recruitQueue = 1;
		expect(recruit(s, 2)).toBe(true);
		expect(s.run.recruitQueue).toBe(3);
		expect(s.run.stock[unit]).toBe(1e9 - price(2, 2));
	});

	it("refuses beyond room, leaving state untouched", () => {
		const s = ready(2, 1e9);
		s.run.recruitQueue = 1;
		const room = apprentices(s).room - apprentices(s).count - 1;
		const before = structuredClone(s);
		expect(recruit(s, room + 1)).toBe(false);
		expect(s).toEqual(before);
		expect(recruit(s, room)).toBe(true);
	});

	it("refuses when unaffordable or n is not a positive integer", () => {
		const s = ready(2, price(0, 2) - 1);
		const before = structuredClone(s);
		expect(recruit(s, 2)).toBe(false);
		expect(recruit(s, 0)).toBe(false);
		expect(recruit(s, 1.5)).toBe(false);
		expect(s).toEqual(before);
	});

	it("k × Recruit time of step adds k apprentices, one at a time", () => {
		const k = 3;
		const s = ready(k, price(0, k));
		expect(recruit(s, k)).toBe(true);
		step(s, recruitMs);
		expect(s.run.recruited).toBe(1);
		expect(s.run.recruitQueue).toBe(k - 1);
		step(s, k * recruitMs);
		expect(apprentices(s).count).toBe(start + k);
		expect(s.run.recruitQueue).toBe(0);
		expect(s.run.recruitProgress).toBe(0);
	});

	it("one long step equals many short ones; progress survives a save", () => {
		const k = 2;
		const a = ready(k, price(0, k));
		recruit(a, k);
		const b = structuredClone(a);
		step(a, k * recruitMs);
		for (let t = 1000; t <= k * recruitMs; t += 1000) {
			const loaded = loadSave(saveToString(b));
			if (!loaded.ok) throw new Error(loaded.error);
			Object.assign(b, loaded.state);
			step(b, t);
		}
		expect(b.run.recruited).toBe(a.run.recruited);
		expect(b.run.recruitQueue).toBe(0);
	});

	it("partial progress carries over and nothing accrues with an empty queue", () => {
		const s = ready(1, price(0, 1));
		tick(s, 5, dark);
		expect(s.run.recruitProgress).toBe(0);
		recruit(s, 1);
		tick(s, 5, dark);
		const loaded = loadSave(saveToString(s));
		if (!loaded.ok) throw new Error(loaded.error);
		expect(loaded.state.run.recruitProgress).toBe(5);
	});
});
