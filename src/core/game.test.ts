// End-to-end (GDD 3, 11.1, 11.3): plays from a new game with core actions only,
// then checks that offline catch-up equals the same span played online.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { balance, type Unlock } from "../data/index.ts";
import { apprentices, recruit } from "./apprentices.ts";
import { phaseAt } from "./clock.ts";
import { atLeast, buyBuilding } from "./cost.ts";
import { manaFlow } from "./mana.ts";
import { mineByHand } from "./production.ts";
import { exportSave, loadSave, saveToString } from "./save.ts";
import { newGame, type State, TICK } from "./state.ts";
import { step } from "./step.ts";

const H = 3_600_000;
const start = Date.UTC(2026, 10, 26, 12); // a whole hour: The Lantern
const cap = balance.globals["Offline cap"].value * H;

const unlockOf = <K extends Unlock["kind"]>(building: string, kind: K) => {
	const u = balance.buildings.find((b) => b.building === building)?.unlock;
	if (u?.kind !== kind)
		throw new Error(`Buildings: ${building} is not ${kind}`);
	return u as Extract<Unlock, { kind: K }>;
};

const has = (state: State, key: string) => state.unlocked.includes(key);
const owned = (state: State, type: string) =>
	state.run.buildings.filter((b) => b.type === type).length;
const shortages = (state: State) => ({
	mana: manaFlow(state, phaseAt(state.time)).factor,
	apprentice: apprentices(state).factor,
});

const expectNoNegative = (state: State) => {
	for (const v of Object.values(state.run.stock))
		expect(v).toBeGreaterThanOrEqual(0);
	expect(state.run.jarMana).toBeGreaterThanOrEqual(0);
};

// Online play: one-second steps, buying `wants` (priority order, up to a count
// each) whenever affordable, until `done`.
const play = (state: State, wants: [string, number][], done: () => boolean) => {
	const end = state.time + 4 * H;
	while (!done()) {
		expect(state.time).toBeLessThan(end);
		step(state, state.time + TICK);
		expectNoNegative(state);
		for (const [type, max] of wants)
			while (owned(state, type) < max && buyBuilding(state, type, 1));
	}
};

const DRILL = "Star Drill";
const CRUCIBLE = "Crucible";
const BENCH = "Runewright's Bench";

// From a new game to a busy state short of both mana and apprentices.
const playToMidGame = () => {
	const state = newGame(start);
	const byHand = unlockOf(DRILL, "mineByHand");
	let clicks = 0;
	while (!has(state, `buildings/${DRILL}`)) {
		mineByHand(state);
		clicks++;
	}
	expect(clicks).toBe(byHand.count / balance.globals["Hand mining"].value);

	const crucible = unlockOf(CRUCIBLE, "own");
	while (!has(state, `buildings/${CRUCIBLE}`))
		if (!buyBuilding(state, DRILL, 1)) step(state, state.time + TICK);
	expect(owned(state, crucible.building)).toBe(crucible.count);

	const bench = unlockOf(BENCH, "produce");
	play(
		state,
		[
			[CRUCIBLE, 3],
			[DRILL, 99],
		],
		() => has(state, `buildings/${BENCH}`),
	);
	expect(atLeast(state.run.produced[bench.resource] ?? 0, bench.count)).toBe(
		true,
	);

	play(
		state,
		[
			[BENCH, 6],
			["Glassblower", 3],
			["Attuner", 2],
			[CRUCIBLE, 10],
			[DRILL, 99],
		],
		() => {
			const s = shortages(state);
			return s.mana < 1 && s.apprentice < 1;
		},
	);
	return state;
};

const midGame = (): State => {
	const result = loadSave(
		readFileSync(new URL("./saves/v1-mid-game.json", import.meta.url), "utf8"),
	);
	if (!result.ok) throw new Error(result.error);
	return result.state;
};

describe("a new game played with core actions only (GDD 3)", () => {
	const state = playToMidGame();

	it("unlocks the first chain in order", () => {
		const order = [
			`buildings/${DRILL}`,
			"recipes/Mine Ember ore",
			`buildings/${CRUCIBLE}`,
			"recipes/Emberbrass",
			`buildings/${BENCH}`,
			"recipes/Runeplates",
		].map((k) => state.unlocked.indexOf(k));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(owned(state, BENCH)).toBeGreaterThan(0);
		// "Mana demand exceeds supply once" (GDD 3.3)
		expect(state.run.milestones.manaShortage).toBe(true);
		expect(has(state, "buildings/Mana Jar")).toBe(true);
	});

	it("slows under both shortages but never stops or goes negative", () => {
		const s = shortages(state);
		expect(s.mana).toBeGreaterThan(0);
		expect(s.mana).toBeLessThan(1);
		expect(s.apprentice).toBeGreaterThan(0);
		expect(s.apprentice).toBeLessThan(1);
		const later = structuredClone(state);
		step(later, later.time + 60 * TICK);
		expectNoNegative(later);
		expect(later.run.produced.Emberbrass ?? 0).toBeGreaterThan(
			state.run.produced.Emberbrass ?? 0,
		);
	});

	it("refuses to recruit with no room (GDD 3.4)", () => {
		const a = apprentices(state);
		expect(a.count).toBe(a.room);
		const before = structuredClone(state);
		expect(recruit(state, 1)).toBe(false);
		expect(state).toEqual(before);
	});

	it("round-trips through both save formats and keeps playing the same", () => {
		const later = structuredClone(state);
		step(later, later.time + 10 * 60 * TICK);
		for (const text of [saveToString(state), exportSave(state)]) {
			const result = loadSave(text);
			if (!result.ok) throw new Error(result.error);
			expect(result.state).toEqual(state);
			step(result.state, result.state.time + 10 * 60 * TICK);
			expect(result.state).toEqual(later);
		}
	});
});

describe("offline equals online from the mid-game save (GDD 11.1)", () => {
	const t0 = midGame().time;

	it("gives the same 3 h, across phase changes, whatever the call pattern", () => {
		const end = t0 + 3 * H;
		const once = midGame();
		step(once, end);

		const perSecond = midGame();
		for (let t = t0 + TICK; t <= end; t += TICK) step(perSecond, t);

		const random = midGame();
		let seed = 7;
		let t = t0;
		while (t < end) {
			seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
			t = Math.min(end, t + (seed % (15 * 60 * TICK)) + 1);
			step(random, t);
		}

		expect(phaseAt(t0)).not.toBe(phaseAt(end - 30 * 60_000));
		expect(once.run.milestones.clockCycle).toBe(true);
		expectNoNegative(once);
		expect(perSecond).toEqual(once);
		expect(random).toEqual(once);
	});

	it("simulates only the Offline cap of a 30 h gap", () => {
		const away = midGame();
		expect(step(away, t0 + 30 * H)).toEqual({
			simulated: cap,
			skipped: 30 * H - cap,
		});
		const last = midGame();
		last.time += 30 * H - cap;
		step(last, t0 + 30 * H);
		expect(away).toEqual(last);
	}, 20_000); // two 24 h catch-ups

	it("pauses on a clock moved backwards, then resumes as if never moved", () => {
		const moved = midGame();
		expect(step(moved, t0 - H)).toEqual({ simulated: 0, skipped: 0 });
		expect(moved).toEqual(midGame());
		step(moved, t0 + 10 * 60 * TICK);
		const steady = midGame();
		step(steady, t0 + 10 * 60 * TICK);
		expect(moved).toEqual(steady);
	});

	it("plays the same after a buy and a save round trip as without the round trip", () => {
		const played = midGame();
		step(played, t0 + H);
		const drills = owned(played, DRILL);
		expect(buyBuilding(played, DRILL, 1)).toBe(true);
		const loaded = loadSave(saveToString(played));
		if (!loaded.ok) throw new Error(loaded.error);
		step(played, t0 + 2 * H);
		step(loaded.state, t0 + 2 * H);
		expect(owned(played, DRILL)).toBe(drills + 1);
		expect(played).toEqual(loaded.state);
	});

	it("catches up 24 h in under 2 s", () => {
		step(midGame(), t0 + H); // warm up the JIT before timing
		const state = midGame();
		const before = performance.now();
		const result = step(state, t0 + 24 * H);
		const ms = performance.now() - before;
		expect(result.simulated).toBe(24 * H);
		expect(ms).toBeLessThan(2000);
	});
});
