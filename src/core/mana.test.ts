import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { manaFlow } from "./mana.ts";
import { STARLIGHT_COLLECTOR } from "./production.ts";
import { newGame, type State } from "./state.ts";
import { tick } from "./step.ts";

const recipe = (name: string) => {
	const row = balance.recipes.find((r) => r.recipe === name);
	if (!row) throw new Error(`Recipes: no ${name}`);
	return row;
};
const add = (s: State, r: ReturnType<typeof recipe>, n: number) => {
	for (let i = 0; i < n; i++)
		s.run.buildings.push({ type: r.building, recipe: r.recipe });
};
const base = balance.globals["Base mana generation"].value;
const mine = recipe("Mine Ember ore");
const attune = recipe("Attune crystals");
const [crystal] = attune.inputs;
const collect = balance.recipes.find((r) => r.building === STARLIGHT_COLLECTOR);
if (!collect) throw new Error("Recipes: no Starlight Collector line");
const lit = balance.clock.find((p) => p.starlightCollector);
const dark = balance.clock.find((p) => !p.starlightCollector);
if (!lit || !dark) throw new Error("Clock: need lit and dark phases");

// Drills drawing exactly `times` × the base supply.
const drills = (times: number) => (times * base) / mine.mana;

describe("manaFlow (gdd 3.3)", () => {
	it("names a building from the Buildings tab", () => {
		expect(balance.buildings.map((b) => b.building)).toContain(
			STARLIGHT_COLLECTOR,
		);
	});

	it("supplies the base with no lines and wastes it without jars", () => {
		const f = manaFlow(newGame(0), dark);
		expect(f).toEqual({
			made: base,
			drawn: 0,
			demand: 0,
			factor: 1,
			wasted: base,
		});
	});

	it("factor is supply ÷ demand when demand exceeds supply", () => {
		const s = newGame(0);
		add(s, mine, drills(2));
		const f = manaFlow(s, dark);
		expect(f.demand).toBeCloseTo(2 * base);
		expect(f.factor).toBeCloseTo(0.5);
		expect(f.drawn).toBeCloseTo(base);
		expect(f.wasted).toBe(0);
	});

	it("does not change the state", () => {
		const s = newGame(0);
		add(s, mine, drills(2));
		add(s, attune, 1);
		s.run.stock[crystal.resource] = 5;
		const before = structuredClone(s);
		manaFlow(s, lit);
		expect(s).toEqual(before);
	});

	it("adds Attuner output, input-limited", () => {
		const s = newGame(0);
		add(s, attune, 1);
		expect(manaFlow(s, dark).made).toBeCloseTo(base); // no crystals: stalls
		s.run.stock[crystal.resource] = 100;
		expect(manaFlow(s, dark).made).toBeCloseTo(
			base + attune.outQty / attune.time,
		);
	});

	it("adds Collector output only under phases flagged in the Clock tab", () => {
		const s = newGame(0);
		add(s, collect, 2);
		const out = (2 * collect.outQty) / collect.time;
		for (const p of balance.clock)
			expect(manaFlow(s, p).made).toBeCloseTo(
				base + (p.starlightCollector ? out : 0),
			);
	});
});

describe("tick with the mana grid (gdd 3.3)", () => {
	it("runs every drill at supply ÷ demand and sets manaShortage", () => {
		const s = newGame(0);
		add(s, mine, drills(2));
		tick(s, 1, dark);
		expect(s.run.stock[mine.output]).toBeCloseTo(
			(drills(2) * mine.outQty * 0.5) / mine.time,
		);
		expect(s.run.milestones.manaShortage).toBe(true);
	});

	it("leaves lines with no mana draw at full speed", () => {
		const s = newGame(0);
		add(s, mine, drills(4));
		add(s, attune, 1);
		s.run.stock[crystal.resource] = 100;
		tick(s, 1, dark);
		expect(s.run.stock[crystal.resource]).toBeCloseTo(
			100 - crystal.qty / attune.time,
		);
	});

	it("does not set manaShortage while supply covers demand", () => {
		const s = newGame(0);
		add(s, mine, drills(1));
		tick(s, 1, dark);
		expect(s.run.stock[mine.output]).toBeCloseTo(
			(drills(1) * mine.outQty) / mine.time,
		);
		expect(s.run.milestones.manaShortage).toBeUndefined();
	});

	it("counts base, Attuner and Collector mana in produced", () => {
		const s = newGame(0);
		add(s, attune, 1);
		add(s, collect, 1);
		s.run.stock[crystal.resource] = 100;
		tick(s, 1, lit);
		const perTick =
			base + attune.outQty / attune.time + collect.outQty / collect.time;
		expect(s.run.produced.Mana).toBeCloseTo(perTick);
		tick(s, 1, dark);
		expect(s.run.produced.Mana).toBeCloseTo(
			2 * perTick - collect.outQty / collect.time,
		);
	});
});
