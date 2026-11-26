import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import {
	bonusesFor,
	cap,
	lineRates,
	mineByHand,
	multipliers,
	runLines,
} from "./production.ts";
import { newGame, type State } from "./state.ts";
import { tick } from "./step.ts";

const buff = (source: string) => {
	const row = balance.buffs.find((b) => b.source === source);
	if (!row) throw new Error(`Buffs: no ${source}`);
	return row;
};
const haste = buff("Haste rune");
const bounty = buff("Bounty rune");
const crucible = balance.recipes.find((r) => r.inputs.length > 0 && r.mana > 0);
if (!crucible) throw new Error("Recipes: no line with inputs and mana");

describe("multipliers (gdd 3.6)", () => {
	it("is 1 for every kind with no bonuses", () => {
		expect(multipliers([])).toEqual({ speed: 1, mana: 1, output: 1, yield: 1 });
	});

	it("adds same-kind bonuses", () => {
		const m = multipliers([haste, bounty]);
		expect(m.speed).toBeCloseTo(1 + (haste.speed ?? 0));
		expect(m.mana).toBeCloseTo(1 + (haste.mana ?? 0) + (bounty.mana ?? 0));
		expect(m.output).toBeCloseTo(1 + (bounty.output ?? 0));
		expect(m.yield).toBe(1);
	});
});

describe("lineRates (gdd 3.6)", () => {
	const ones = {
		overchannel: 1,
		mana: 1,
		apprentice: 1,
		apprenticeSpeed: 1,
		starlight: true,
	};

	it("runs at 1/time with no bonuses or shortages", () => {
		const r = lineRates(crucible, multipliers([]), ones);
		expect(r.cycles).toBeCloseTo(1 / crucible.time);
		expect(r.mana).toBeCloseTo(crucible.mana);
		expect(r.output).toBeCloseTo(crucible.outQty);
	});

	it("multiplies speed kinds and factors together", () => {
		const m = multipliers([haste]);
		const f = {
			overchannel: 1.5,
			mana: 0.5,
			apprentice: 0.8,
			apprenticeSpeed: 0.9,
			starlight: true,
		};
		const r = lineRates(crucible, m, f);
		expect(r.cycles).toBeCloseTo(
			(1 / crucible.time) * m.speed * 1.5 * 0.5 * 0.8 * 0.9,
		);
	});

	it("draws mana by overchannel and mana bonuses only", () => {
		const m = multipliers([haste, bounty]);
		const r = lineRates(crucible, m, { ...ones, overchannel: 1.5, mana: 0.5 });
		expect(r.mana).toBeCloseTo(crucible.mana * 1.5 * m.mana);
		expect(lineRates(crucible, multipliers([{ speed: 1 }]), ones).mana).toBe(
			crucible.mana,
		);
	});

	it("adds output per cycle without more inputs", () => {
		const m = multipliers([bounty]);
		const r = lineRates(crucible, m, ones);
		expect(r.output).toBeCloseTo(crucible.outQty * (1 + (bounty.output ?? 0)));
		expect(r.cycles).toBeCloseTo(1 / crucible.time);
	});
});

describe("bonusesFor", () => {
	it("has no sources in M2", () => {
		expect(bonusesFor(newGame(0), { type: "Crucible", recipe: null })).toEqual(
			[],
		);
	});
});

const recipe = (name: string) => {
	const row = balance.recipes.find((r) => r.recipe === name);
	if (!row) throw new Error(`Recipes: no ${name}`);
	return row;
};
const ones = {
	overchannel: 1,
	mana: 1,
	apprentice: 1,
	apprenticeSpeed: 1,
	starlight: true,
};
const withLines = (r: ReturnType<typeof recipe>, n: number): State => {
	const s = newGame(0);
	for (let i = 0; i < n; i++)
		s.run.buildings.push({ type: r.building, recipe: r.recipe });
	return s;
};
const mine = recipe("Mine Ember ore");
const ore = mine.output;
const brass = recipe("Emberbrass");
const [brassIn] = brass.inputs;
const [slag] = brass.byproducts;
const attune = recipe("Attune crystals");

describe("runLines (gdd 5.1, 3.1)", () => {
	it("N drills for T s yield N × T × outQty / time", () => {
		const s = withLines(mine, 3);
		for (let i = 0; i < 10; i++) runLines(s, 1, ones);
		const want = (3 * 10 * mine.outQty) / mine.time;
		expect(s.run.stock[ore]).toBeCloseTo(want);
		expect(s.run.produced[ore]).toBeCloseTo(want);
	});

	it("skips Idle buildings", () => {
		const s = newGame(0);
		s.run.buildings.push({ type: mine.building, recipe: null });
		runLines(s, 10, ones);
		expect(s.run.stock).toEqual({});
	});

	it("runs a line short of inputs at the input-limited share", () => {
		const s = withLines(brass, 1);
		s.run.stock[brassIn.resource] = brassIn.qty / 2; // half of one cycle
		runLines(s, brass.time, ones);
		expect(s.run.stock[brassIn.resource]).toBe(0);
		expect(s.run.stock[brass.output]).toBeCloseTo(brass.outQty / 2);
		expect(s.run.stock[slag.resource]).toBeCloseTo(slag.qty / 2);
	});

	it("never takes a stock below 0 with no inputs", () => {
		const s = withLines(brass, 4);
		runLines(s, 10, ones);
		expect(s.run.stock[brassIn.resource] ?? 0).toBe(0);
		expect(s.run.stock[brass.output] ?? 0).toBe(0);
	});

	it("stops a line whose main output is at cap, consuming nothing", () => {
		const s = withLines(brass, 1);
		s.run.stock[brass.output] = cap(s, brass.output);
		s.run.stock[brassIn.resource] = 100;
		runLines(s, brass.time, ones);
		expect(s.run.stock[brassIn.resource]).toBe(100);
		expect(s.run.produced).toEqual({});
	});

	it("fills to the cap and sets fillAnyStorage", () => {
		const s = withLines(mine, 1);
		s.run.stock[ore] = cap(s, ore) - mine.outQty / 2;
		runLines(s, mine.time, ones);
		expect(s.run.stock[ore]).toBeCloseTo(cap(s, ore));
		expect(s.run.produced[ore]).toBeCloseTo(mine.outQty / 2);
		expect(s.run.milestones.fillAnyStorage).toBe(true);
	});

	it("discards a byproduct at cap and keeps running", () => {
		const s = withLines(brass, 1);
		s.run.stock[slag.resource] = cap(s, slag.resource);
		s.run.stock[brassIn.resource] = 100;
		runLines(s, brass.time, ones);
		expect(s.run.stock[brass.output]).toBeCloseTo(brass.outQty);
		expect(s.run.stock[slag.resource]).toBe(cap(s, slag.resource));
		expect(s.run.produced[slag.resource]).toBeCloseTo(slag.qty);
		expect(s.run.milestones.fillAnyStorage).toBe(true);
	});

	it("feeds earlier lines' output to later lines in Recipes-tab order", () => {
		const s = withLines(brass, 1);
		s.run.buildings.push({ type: mine.building, recipe: mine.recipe });
		runLines(s, 1, ones);
		expect(s.run.produced[brass.output]).toBeGreaterThan(0);
	});

	it("returns mana made by Mana lines and keeps it out of stock", () => {
		const s = withLines(attune, 2);
		const [crystal] = attune.inputs;
		s.run.stock[crystal.resource] = 100;
		const flow = runLines(s, attune.time, ones);
		expect(flow.made).toBeCloseTo(2 * attune.outQty);
		expect(s.run.stock[crystal.resource]).toBeCloseTo(100 - 2 * crystal.qty);
		expect(s.run.stock[attune.output]).toBeUndefined();
		expect(s.run.produced[attune.output]).toBeUndefined();
	});

	it("reports mana drawn × uptime", () => {
		const s = withLines(brass, 1);
		s.run.stock[brassIn.resource] = brassIn.qty / 2;
		const flow = runLines(s, brass.time, ones);
		expect(flow.drawn).toBeCloseTo(brass.mana / 2);
	});

	it("scales speed by the factors", () => {
		const s = withLines(mine, 1);
		runLines(s, mine.time, { ...ones, overchannel: 2, mana: 0.5 });
		expect(s.run.stock[ore]).toBeCloseTo(mine.outQty);
	});

	it("runs from tick with overchannel from the run", () => {
		const s = withLines(mine, 1);
		s.run.overchannel = 2;
		tick(s, mine.time, balance.clock[0]);
		expect(s.run.stock[ore]).toBeCloseTo(2 * mine.outQty);
	});
});

describe("mineByHand (gdd 4.3, 5.1)", () => {
	const hand = balance.globals["Hand mining"];

	it("adds the Hand-mining quantity and counts it", () => {
		const s = newGame(0);
		mineByHand(s);
		expect(hand.unit).toBeDefined();
		expect(s.run.stock[hand.unit ?? ""]).toBe(hand.value);
		expect(s.run.handMined[hand.unit ?? ""]).toBe(hand.value);
		expect(s.run.produced).toEqual({});
	});

	it("does nothing at cap", () => {
		const s = newGame(0);
		const unit = hand.unit ?? "";
		s.run.stock[unit] = cap(s, unit);
		mineByHand(s);
		expect(s.run.stock[unit]).toBe(cap(s, unit));
		expect(s.run.handMined[unit]).toBeUndefined();
	});

	it("unlocks the Star Drill after ten clicks", () => {
		const s = newGame(0);
		for (let i = 0; i < 9; i++) mineByHand(s);
		expect(s.unlocked).not.toContain(`buildings/${mine.building}`);
		mineByHand(s);
		expect(s.unlocked).toContain(`buildings/${mine.building}`);
	});
});
