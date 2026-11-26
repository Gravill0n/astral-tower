import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { bonusesFor, lineRates, multipliers } from "./production.ts";
import { newGame } from "./state.ts";

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
	const ones = { overchannel: 1, mana: 1, apprentice: 1, apprenticeSpeed: 1 };

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
