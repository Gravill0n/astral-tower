import { describe, expect, it } from "vitest";
import { balance, type Unlock } from "../data/index.ts";
import { buyBuilding } from "./cost.ts";
import { newGame, newRun } from "./state.ts";
import { tick } from "./step.ts";
import { isMet, UNLOCK_KEYS, updateUnlocks } from "./unlocks.ts";

const unlockOf = (kind: Unlock["kind"]) => {
	for (const row of [...balance.buildings, ...balance.recipes]) {
		if (row.unlock.kind === kind) return row.unlock;
	}
	throw new Error(`no ${kind} unlock in Buildings or Recipes`);
};
const own = unlockOf("own") as Extract<Unlock, { kind: "own" }>;
const comesWith = unlockOf("comesWith") as Extract<
	Unlock,
	{ kind: "comesWith" }
>;
const produce = unlockOf("produce") as Extract<Unlock, { kind: "produce" }>;
const mine = unlockOf("mineByHand") as Extract<Unlock, { kind: "mineByHand" }>;
const have = unlockOf("have") as Extract<Unlock, { kind: "have" }>;

const drill = balance.buildings.find((b) => b.building === "Star Drill");
const drillUnlock = drill?.unlock;
if (!drill || drillUnlock?.kind !== "mineByHand")
	throw new Error("balance rows missing");
const firstDrillRecipe = balance.recipes.find(
	(r) => r.building === "Star Drill",
);
if (!firstDrillRecipe) throw new Error("no Star Drill recipe");

describe("isMet", () => {
	it("own: counts buildings of the type", () => {
		const state = newGame(0);
		for (let i = 1; i < own.count; i++)
			state.run.buildings.push({ type: own.building, recipe: null });
		expect(isMet(own, state)).toBe(false);
		state.run.buildings.push({ type: own.building, recipe: null });
		expect(isMet(own, state)).toBe(true);
	});

	it("comesWith: own at least one", () => {
		const state = newGame(0);
		expect(isMet(comesWith, state)).toBe(false);
		state.run.buildings.push({ type: comesWith.building, recipe: null });
		expect(isMet(comesWith, state)).toBe(true);
	});

	it("produce: counts this run's produced", () => {
		const state = newGame(0);
		state.run.produced[produce.resource] = produce.count - 1;
		expect(isMet(produce, state)).toBe(false);
		state.run.produced[produce.resource] = produce.count;
		expect(isMet(produce, state)).toBe(true);
	});

	it("have: compares stock with float tolerance", () => {
		const state = newGame(0);
		state.run.stock[have.resource] = have.count - 1;
		expect(isMet(have, state)).toBe(false);
		state.run.stock[have.resource] = have.count * (1 - 1e-12);
		expect(isMet(have, state)).toBe(true);
	});

	it("mineByHand: counts hand-mined units", () => {
		const state = newGame(0);
		state.run.handMined[mine.resource] = mine.count - 1;
		expect(isMet(mine, state)).toBe(false);
		state.run.handMined[mine.resource] = mine.count;
		expect(isMet(mine, state)).toBe(true);
	});

	it("M2 milestones read run.milestones; later ones stay false", () => {
		for (const m of [
			"manaShortage",
			"fillAnyStorage",
			"fillManaJar",
			"clockCycle",
		] as const) {
			const u: Unlock = { kind: "milestone", text: m, milestone: m };
			const state = newGame(0);
			expect(isMet(u, state)).toBe(false);
			state.run.milestones[m] = true;
			expect(isMet(u, state)).toBe(true);
		}
		const state = newGame(0);
		state.run.milestones.libraryOpens = true;
		expect(
			isMet({ kind: "milestone", text: "", milestone: "libraryOpens" }, state),
		).toBe(false);
	});

	it("kinds from later milestones are false", () => {
		const state = newGame(0);
		expect(isMet({ kind: "floor", text: "", floor: 0 }, state)).toBe(false);
	});
});

describe("updateUnlocks", () => {
	it("keys cover every unlock-bearing row", () => {
		expect(UNLOCK_KEYS).toContain("buildings/Star Drill");
		expect(UNLOCK_KEYS).toContain(`recipes/${firstDrillRecipe.recipe}`);
		expect(UNLOCK_KEYS).toContain(`gear/${balance.gear[0].name}`);
		expect(UNLOCK_KEYS).toContain("contracts/0");
		expect(new Set(UNLOCK_KEYS).size).toBe(UNLOCK_KEYS.length);
	});

	it("unlocks the Star Drill at the hand-mining threshold, then its first recipe on the first buy", () => {
		const state = newGame(0);
		state.run.handMined[drillUnlock.resource] = drillUnlock.count;
		expect(updateUnlocks(state)).toContain("buildings/Star Drill");
		expect(updateUnlocks(state)).toEqual([]);
		for (const c of drill.costs) state.run.stock[c.resource] = c.qty;
		expect(buyBuilding(state, "Star Drill", 1)).toBe(true);
		expect(state.unlocked).toContain(`recipes/${firstDrillRecipe.recipe}`);
		expect(state.run.buildings).toEqual([
			{ type: "Star Drill", recipe: firstDrillRecipe.recipe },
		]);
	});

	it("keeps unlocks when the condition stops holding and across newRun", () => {
		const state = newGame(0);
		state.run.stock[have.resource] = have.count;
		const added = updateUnlocks(state);
		expect(added.length).toBeGreaterThan(0);
		state.run.stock[have.resource] = 0;
		updateUnlocks(state);
		expect(state.unlocked).toEqual(added);
		const next = newRun(state);
		updateUnlocks(next);
		expect(next.unlocked).toEqual(added);
	});

	it("tick sets clockCycle after a full cycle and unlocks from it", () => {
		const cycle = balance.globals["Clock cycle"].value * 60;
		const state = newGame(0);
		state.run.elapsed = cycle - 1;
		tick(state, 0.5, balance.clock[0]);
		expect(state.run.milestones.clockCycle).toBeUndefined();
		tick(state, 0.5, balance.clock[0]);
		expect(state.run.milestones.clockCycle).toBe(true);
		const row = balance.buildings.find(
			(r) =>
				r.unlock.kind === "milestone" && r.unlock.milestone === "clockCycle",
		);
		expect(state.unlocked).toContain(`buildings/${row?.building}`);
	});
});
