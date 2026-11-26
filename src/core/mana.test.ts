import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { MANA_JAR, manaFlow } from "./mana.ts";
import { STARLIGHT_COLLECTOR } from "./production.ts";
import { newGame, type State, TICK } from "./state.ts";
import { step, tick } from "./step.ts";

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
			charge: 0,
			discharge: 0,
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
		tick(s, dark);
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
		tick(s, dark);
		expect(s.run.stock[crystal.resource]).toBeCloseTo(
			100 - crystal.qty / attune.time,
		);
	});

	it("does not set manaShortage while supply covers demand", () => {
		const s = newGame(0);
		add(s, mine, drills(1));
		tick(s, dark);
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
		tick(s, lit);
		const perTick =
			base + attune.outQty / attune.time + collect.outQty / collect.time;
		expect(s.run.produced.Mana).toBeCloseTo(perTick);
		tick(s, dark);
		expect(s.run.produced.Mana).toBeCloseTo(
			2 * perTick - collect.outQty / collect.time,
		);
	});
});

const jarRow = balance.buildings.find((b) => b.building === MANA_JAR);
const jarCap = jarRow?.provides ?? 0;
const jarRate = balance.globals["Mana Jar rate"].value;
const jars = (s: State, n: number) => {
	for (let i = 0; i < n; i++)
		s.run.buildings.push({ type: MANA_JAR, recipe: null });
};

describe("Mana Jars (gdd 3.3)", () => {
	it("names a building with a capacity in the Buildings tab", () => {
		expect(jarCap).toBeGreaterThan(0);
	});

	it("charges from the surplus at most rate per jar, wasting the rest", () => {
		const s = newGame(0);
		jars(s, 1);
		add(s, collect, Math.ceil((2 * jarRate) / collect.outQty));
		const f = manaFlow(s, lit);
		expect(f.charge).toBeCloseTo(jarRate);
		expect(f.wasted).toBeCloseTo(f.made - jarRate);
		tick(s, lit);
		expect(s.run.jarMana).toBeCloseTo(jarRate);
	});

	it("stops at capacity and sets fillManaJar", () => {
		const s = newGame(0);
		jars(s, 2);
		s.run.jarMana = 2 * jarCap - 1;
		const f = manaFlow(s, dark);
		expect(f.charge).toBeCloseTo(1);
		expect(f.wasted).toBeCloseTo(base - 1);
		tick(s, dark);
		expect(s.run.jarMana).toBeCloseTo(2 * jarCap);
		expect(s.run.milestones.fillManaJar).toBe(true);
		expect(manaFlow(s, dark).charge).toBe(0);
	});

	it("does not set fillManaJar before the pool is full", () => {
		const s = newGame(0);
		jars(s, 2);
		s.run.jarMana = jarCap; // one jar's worth, of two
		tick(s, dark);
		expect(s.run.milestones.fillManaJar).toBeUndefined();
	});

	it("discharges at most rate per jar and lifts the factor", () => {
		const s = newGame(0);
		jars(s, 1);
		s.run.jarMana = jarCap;
		add(s, mine, drills(2) + (2 * jarRate) / mine.mana);
		const f = manaFlow(s, dark);
		expect(f.discharge).toBeCloseTo(jarRate);
		expect(f.factor).toBeCloseTo((base + jarRate) / f.demand);
		expect(f.drawn).toBeCloseTo(base + jarRate);
		tick(s, dark);
		expect(s.run.jarMana).toBeCloseTo(jarCap - jarRate);
	});

	it("discharges no more than is stored, and covers a small deficit fully", () => {
		const s = newGame(0);
		jars(s, 1);
		s.run.jarMana = 3;
		add(s, mine, drills(2));
		expect(manaFlow(s, dark).discharge).toBeCloseTo(3);
		s.run.jarMana = jarCap;
		const f = manaFlow(s, dark);
		expect(f.discharge).toBeCloseTo(base);
		expect(f.factor).toBe(1);
		tick(s, dark);
		expect(s.run.milestones.manaShortage).toBeUndefined();
	});

	it("does not count jar discharge in produced Mana", () => {
		const run = (n: number) => {
			const s = newGame(0);
			jars(s, n);
			s.run.jarMana = n * jarCap;
			add(s, mine, drills(2));
			tick(s, dark);
			return s.run.produced.Mana;
		};
		expect(run(1)).toBe(run(0));
	});

	it("gives the same 2 h run in one step as in one-second steps", () => {
		const H = 3_600_000;
		const start = 1_000 * H;
		const setup = () => {
			const s = newGame(start);
			jars(s, 2);
			s.run.jarMana = jarCap;
			add(s, mine, drills(2));
			add(s, collect, 4);
			return s;
		};
		const once = setup();
		step(once, start + 2 * H);
		const perSecond = setup();
		for (let t = start + TICK; t <= start + 2 * H; t += TICK)
			step(perSecond, t);
		expect(perSecond).toEqual(once);
		expect(once.run.milestones.fillManaJar).toBe(true);
	});
});
