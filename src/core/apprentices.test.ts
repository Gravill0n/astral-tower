import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { APPRENTICE_QUARTERS, apprentices } from "./apprentices.ts";
import { MANA_JAR, manaFlow } from "./mana.ts";
import { newGame, type State } from "./state.ts";
import { tick } from "./step.ts";

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
