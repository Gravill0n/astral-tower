import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import {
	atLeast,
	buildingCost,
	bulkCost,
	buyBuilding,
	buyUpgrade,
	maxAffordable,
	nextCost,
	recruitCost,
	spend,
	upgradeCost,
} from "./cost.ts";
import { newGame } from "./state.ts";

const drill = balance.buildings.find((b) => b.building === "Star Drill");
const bench = balance.buildings.find(
	(b) => b.building === "Runewright's Bench",
);
const bits = balance.upgrades.find((u) => u.upgrade === "Drill bits");
if (!drill || !bench || !bits) throw new Error("balance rows missing");

// Expected values recomputed from the rows, independent of cost.ts.
const unit = (base: number, growth: number, owned: number) =>
	Math.round(base * growth ** owned);
const sum = (base: number, growth: number, owned: number, n: number) => {
	let total = 0;
	for (let i = 0; i < n; i++) total += unit(base, growth, owned + i);
	return total;
};

describe("atLeast", () => {
	it("absorbs float drift below the cost", () => {
		expect(atLeast(30 - 1e-12, 30)).toBe(true);
		expect(atLeast(30, 30)).toBe(true);
		expect(atLeast(29.99, 30)).toBe(false);
		expect(atLeast(0, 0)).toBe(true);
	});
});

describe("spend", () => {
	it("never leaves a stock below zero", () => {
		const stock = { "Ember ore": 30 - 1e-12 };
		spend(stock, [{ resource: "Ember ore", qty: 30 }]);
		expect(stock["Ember ore"]).toBe(0);
	});
});

describe("cost shapes", () => {
	it("adapts Buildings, Upgrades and the Recruit globals", () => {
		expect(buildingCost(bench)).toEqual({
			costs: bench.costs,
			growth: bench.growth,
		});
		expect(upgradeCost(bits)).toEqual({
			costs: [{ resource: bits.cost, qty: bits.baseQty }],
			growth: bits.growth,
		});
		const g = balance.globals;
		expect(recruitCost).toEqual({
			costs: [
				{ resource: g["Recruit cost"].unit, qty: g["Recruit cost"].value },
			],
			growth: g["Recruit cost growth"].value,
		});
	});
});

describe("nextCost and bulkCost", () => {
	it("rounds base × growth^owned for each of two resources", () => {
		const item = buildingCost(bench);
		expect(nextCost(item, 7)).toEqual(
			bench.costs.map((c) => ({
				resource: c.resource,
				qty: unit(c.qty, bench.growth, 7),
			})),
		);
	});

	it("sums the n rounded per-unit costs", () => {
		const item = buildingCost(bench);
		expect(bulkCost(item, 3, 10)).toEqual(
			bench.costs.map((c) => ({
				resource: c.resource,
				qty: sum(c.qty, bench.growth, 3, 10),
			})),
		);
	});
});

describe("maxAffordable", () => {
	const ore = drill.costs[0];
	if (!ore) throw new Error("drill cost missing");
	const item = buildingCost(drill);

	it("returns the largest affordable count", () => {
		const stock = { [ore.resource]: sum(ore.qty, drill.growth, 2, 7) };
		expect(maxAffordable(item, 2, stock)).toBe(7);
		stock[ore.resource] -= 1;
		expect(maxAffordable(item, 2, stock)).toBe(6);
		expect(maxAffordable(item, 2, {})).toBe(0);
	});

	it("respects the limit", () => {
		const stock = { [ore.resource]: sum(ore.qty, drill.growth, 0, 50) };
		expect(maxAffordable(item, 0, stock, 3)).toBe(3);
	});
});

describe("buyBuilding", () => {
	const ore = drill.costs[0];
	if (!ore) throw new Error("drill cost missing");
	const key = `buildings/${drill.building}`;

	it("refuses a locked building and leaves state untouched", () => {
		const state = newGame(0);
		state.run.stock[ore.resource] = 1e9;
		const before = structuredClone(state);
		expect(buyBuilding(state, drill.building, 1)).toBe(false);
		expect(state).toEqual(before);
	});

	it("refuses ×10 when fewer than 10 are affordable", () => {
		const state = newGame(0);
		state.unlocked.push(key);
		state.run.stock[ore.resource] = sum(ore.qty, drill.growth, 0, 10) - 1;
		const before = structuredClone(state);
		expect(buyBuilding(state, drill.building, 10)).toBe(false);
		expect(state).toEqual(before);
	});

	it("spends the bulk cost and adds n buildings on the first unlocked recipe", () => {
		const state = newGame(0);
		state.unlocked.push(key);
		state.run.buildings.push({ type: drill.building, recipe: null });
		const total = sum(ore.qty, drill.growth, 1, 10);
		state.run.stock[ore.resource] = total + 5;
		expect(buyBuilding(state, drill.building, 10)).toBe(true);
		expect(state.run.stock[ore.resource]).toBe(5);
		expect(state.run.buildings).toHaveLength(11);
		const first = balance.recipes.find((r) => r.building === drill.building);
		expect(state.run.buildings[0].recipe).toBeNull();
		expect(
			state.run.buildings.slice(1).every((b) => b.recipe === first?.recipe),
		).toBe(true);
	});
});

describe("buyUpgrade", () => {
	const key = `upgrades/${bits.upgrade}`;

	it("refuses a locked upgrade", () => {
		const state = newGame(0);
		state.run.stock[bits.cost] = 1e12;
		const before = structuredClone(state);
		expect(buyUpgrade(state, bits.upgrade, 1)).toBe(false);
		expect(state).toEqual(before);
	});

	it("refuses levels past max level", () => {
		const state = newGame(0);
		state.unlocked.push(key);
		state.run.stock[bits.cost] = 1e12;
		state.run.upgrades[bits.upgrade] = bits.maxLevel - 1;
		const before = structuredClone(state);
		expect(buyUpgrade(state, bits.upgrade, 2)).toBe(false);
		expect(state).toEqual(before);
		const level = bits.maxLevel - 1;
		expect(
			maxAffordable(
				upgradeCost(bits),
				level,
				state.run.stock,
				bits.maxLevel - level,
			),
		).toBe(bits.maxLevel - level);
	});

	it("spends and raises the level", () => {
		const state = newGame(0);
		state.unlocked.push(key);
		const total = sum(bits.baseQty, bits.growth, 2, 3);
		state.run.stock[bits.cost] = total;
		state.run.upgrades[bits.upgrade] = 2;
		expect(buyUpgrade(state, bits.upgrade, 3)).toBe(true);
		expect(state.run.upgrades[bits.upgrade]).toBe(5);
		expect(state.run.stock[bits.cost]).toBe(0);
	});
});
