// Costs and bulk buying (GDD 3.2). One cost shape for Buildings, Upgrades and
// recruiting. `atLeast` is the only affordability and threshold test in the core.
import { type Balance, balance } from "../data/index.ts";
import type { Counts, State } from "./state.ts";

// Engine constant, not a balance value: relative tolerance for float drift.
export const EPSILON = 1e-9;

export const atLeast = (a: number, b: number): boolean =>
	a >= b - EPSILON * Math.max(1, Math.abs(b));

type Pair = { resource: string; qty: number };
export type Cost = { costs: Pair[]; growth: number };

export const buildingCost = (row: Balance["buildings"][number]): Cost => ({
	costs: row.costs,
	growth: row.growth,
});

export const upgradeCost = (row: Balance["upgrades"][number]): Cost => ({
	costs: [{ resource: row.cost, qty: row.baseQty }],
	growth: row.growth,
});

const g = balance.globals;
const recruitUnit = g["Recruit cost"].unit;
if (!recruitUnit) throw new Error("Globals: Recruit cost has no unit");
export const recruitCost: Cost = {
	costs: [{ resource: recruitUnit, qty: g["Recruit cost"].value }],
	growth: g["Recruit cost growth"].value,
};

export const nextCost = (item: Cost, owned: number): Pair[] =>
	item.costs.map((c) => ({
		resource: c.resource,
		qty: Math.round(c.qty * item.growth ** owned),
	}));

export const bulkCost = (item: Cost, owned: number, n: number): Pair[] =>
	item.costs.map((c) => {
		let qty = 0;
		for (let i = 0; i < n; i++)
			qty += Math.round(c.qty * item.growth ** (owned + i));
		return { resource: c.resource, qty };
	});

export const affordable = (stock: Counts, costs: Pair[]): boolean =>
	costs.every((c) => atLeast(stock[c.resource] ?? 0, c.qty));

// Stocks never end below 0, even when float drift let `atLeast` pass.
export const spend = (stock: Counts, costs: Pair[]): void => {
	for (const c of costs)
		stock[c.resource] = Math.max(0, (stock[c.resource] ?? 0) - c.qty);
};

// Largest n (≤ limit) whose bulk cost fits in `stock`. For upgrades the caller
// passes maxLevel − level as the limit.
export const maxAffordable = (
	item: Cost,
	owned: number,
	stock: Counts,
	limit = Number.POSITIVE_INFINITY,
): number => {
	const left = { ...stock };
	// ponytail: loops forever on an all-zero cost with no limit; no sheet row has one today.
	let n = 0;
	while (n < limit) {
		const unit = nextCost(item, owned + n);
		if (!affordable(left, unit)) break;
		spend(left, unit);
		n++;
	}
	return n;
};

const validCount = (n: number) => Number.isInteger(n) && n > 0;

// All-or-nothing: false and state untouched when locked or unaffordable.
export const buyBuilding = (state: State, type: string, n: number): boolean => {
	const row = balance.buildings.find((b) => b.building === type);
	if (!row || !validCount(n) || !state.unlocked.includes(`buildings/${type}`))
		return false;
	const owned = state.run.buildings.filter((b) => b.type === type).length;
	const costs = bulkCost(buildingCost(row), owned, n);
	if (!affordable(state.run.stock, costs)) return false;
	spend(state.run.stock, costs);
	for (let i = 0; i < n; i++) state.run.buildings.push({ type, recipe: null });
	return true;
};

export const buyUpgrade = (state: State, name: string, n: number): boolean => {
	const row = balance.upgrades.find((u) => u.upgrade === name);
	if (!row || !validCount(n) || !state.unlocked.includes(`upgrades/${name}`))
		return false;
	const level = state.run.upgrades[name] ?? 0;
	if (level + n > row.maxLevel) return false;
	const costs = bulkCost(upgradeCost(row), level, n);
	if (!affordable(state.run.stock, costs)) return false;
	spend(state.run.stock, costs);
	state.run.upgrades[name] = level + n;
	return true;
};
