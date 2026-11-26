import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { advanceRecruits, apprentices } from "./apprentices.ts";
import { type Phase, phaseAt } from "./clock.ts";
import { atLeast } from "./cost.ts";
import { baseMana, chargeJars, MANA_JAR, manaFlow } from "./mana.ts";
import {
	MANA,
	runLines,
	STARLIGHT_COLLECTOR,
	cap as storageCap,
} from "./production.ts";
import { loadSave, saveToString } from "./save.ts";
import { newGame, type State, TICK } from "./state.ts";
import { step, TICK_S, tick } from "./step.ts";
import { updateUnlocks } from "./unlocks.ts";

const H = 3_600_000;
const start = 1_000 * H; // some whole hour, far from 0
const cap = balance.globals["Offline cap"].value * H;

describe("step", () => {
	it("gives the same state whatever the call pattern", () => {
		const once = newGame(start);
		step(once, start + 2 * H);

		const perSecond = newGame(start);
		for (let t = start + TICK; t <= start + 2 * H; t += TICK) {
			step(perSecond, t);
		}

		const random = newGame(start);
		let seed = 42;
		let t = start;
		while (t < start + 2 * H) {
			seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
			t = Math.min(start + 2 * H, t + (seed % (90 * TICK)) + 1);
			step(random, t);
		}

		expect(once.run.elapsed).toBe((2 * H) / TICK);
		expect(perSecond).toEqual(once);
		expect(random).toEqual(once);
	});

	it("carries a partial tick to the next call", () => {
		const state = newGame(start);
		expect(step(state, start + 1.5 * TICK)).toEqual({
			simulated: TICK,
			skipped: 0,
		});
		expect(state.time).toBe(start + TICK);
		expect(step(state, start + 2 * TICK)).toEqual({
			simulated: TICK,
			skipped: 0,
		});
		expect(state.run.elapsed).toBe(2);
	});

	it("simulates at most the Offline cap and skips the rest", () => {
		const state = newGame(start);
		expect(step(state, start + 30 * H)).toEqual({
			simulated: cap,
			skipped: 30 * H - cap,
		});
		expect(state.time).toBe(start + 30 * H);
		expect(state.run.elapsed).toBe(cap / TICK);
	});

	it("relies on Offline speed staying 1 (offline = online)", () => {
		expect(balance.globals["Offline speed"].value).toBe(1);
	});

	it("pauses while the clock is behind, then resumes", () => {
		const state = newGame(start);
		step(state, start + 10 * TICK);
		const before = structuredClone(state);

		expect(step(state, start - H)).toEqual({ simulated: 0, skipped: 0 });
		expect(state).toEqual(before);
		expect(step(state, start + 10 * TICK)).toEqual({
			simulated: 0,
			skipped: 0,
		});
		expect(state).toEqual(before);

		step(state, start + 11 * TICK);
		expect(state.run.elapsed).toBe(11);
	});
});

describe("tick", () => {
	it("advances exactly one TICK_S", () => {
		const state = newGame(start);
		tick(state, phaseAt(state.time));
		expect(state.run.elapsed).toBe(TICK_S);
	});
});

describe("step rejects a non-finite or unsafe now", () => {
	for (const now of [
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		1e300,
		Number.MAX_SAFE_INTEGER + 2,
	]) {
		it(`leaves state unchanged at ${now}`, () => {
			const state = newGame(start);
			step(state, start + 10 * TICK);
			const before = structuredClone(state);
			expect(step(state, now)).toEqual({ simulated: 0, skipped: 0 });
			expect(state).toEqual(before);
			expect(loadSave(saveToString(state)).ok).toBe(true);
		});
	}
});

describe("each tick gets the phase at its start", () => {
	const collect = balance.recipes.find(
		(r) => r.building === STARLIGHT_COLLECTOR,
	);
	if (!collect) throw new Error("Recipes: no Starlight Collector line");
	// First phase whose end flips the Collectors (lit to dark or dark to lit).
	const i = balance.clock.findIndex(
		(p, k) =>
			p.starlightCollector !==
			balance.clock[(k + 1) % balance.clock.length].starlightCollector,
	);
	const before = balance.clock[i];
	const after = balance.clock[(i + 1) % balance.clock.length];
	const n = 3;
	// Mana made in one tick: base plus Collectors when the phase is lit.
	const made = (p: Phase) =>
		(baseMana +
			(p.starlightCollector ? (n * collect.outQty) / collect.time : 0)) *
		TICK_S;

	it("uses the earlier phase for the tick ending on the boundary", () => {
		const boundary = start + before.ends * 60_000;
		const state = newGame(boundary - TICK);
		for (let k = 0; k < n; k++)
			state.run.buildings.push({
				type: STARLIGHT_COLLECTOR,
				recipe: collect.recipe,
			});
		expect(phaseAt(state.time)).toBe(before);
		expect(phaseAt(boundary)).toBe(after);
		step(state, boundary);
		expect(state.run.produced[MANA]).toBeCloseTo(made(before));
		step(state, boundary + TICK);
		expect(state.run.produced[MANA]).toBeCloseTo(made(before) + made(after));
	});
});

// tick's full-mana path keeps the dry run's scratch copy. This replays the
// slow path (runLines on the real state, mana factor 1) with the same jar,
// produced, recruit and unlock bookkeeping, to prove the two are equal.
const slowTick = (state: State, phase: Phase) => {
	const run = state.run;
	const grid = manaFlow(state, phase);
	expect(grid.factor).toBe(1);
	chargeJars(state, grid);
	const lines = runLines(state, TICK_S, {
		overchannel: run.overchannel,
		mana: 1,
		apprentice: apprentices(state).factor,
		apprenticeSpeed: 1,
		starlight: phase.starlightCollector,
	});
	run.produced[MANA] =
		(run.produced[MANA] ?? 0) + baseMana * TICK_S + lines.made;
	advanceRecruits(state, TICK_S);
	run.elapsed += TICK_S;
	if (atLeast(run.elapsed, balance.globals["Clock cycle"].value * 60))
		run.milestones.clockCycle = true;
	updateUnlocks(state);
};

const fixture = (name: string): State => {
	const r = loadSave(
		readFileSync(new URL(`./saves/${name}.json`, import.meta.url), "utf8"),
	);
	if (!r.ok) throw new Error(r.error);
	return r.state;
};

describe("full-mana tick equals the slow path", () => {
	const jarSize =
		balance.buildings.find((b) => b.building === MANA_JAR)?.provides ?? 0;
	const states = {
		"v1-first-hour": fixture("v1-first-hour"),
		// Frost ore just under its cap, so a line sets fillAnyStorage.
		"v1-first-hour near a cap": (() => {
			const s = fixture("v1-first-hour");
			delete s.run.milestones.fillAnyStorage;
			s.run.stock["Frost ore"] = storageCap(s, "Frost ore") - 0.1;
			return s;
		})(),
		// Short of mana as saved: a full jar covers the deficit.
		"v1-mid-game": (() => {
			const s = fixture("v1-mid-game");
			s.run.buildings.push({ type: MANA_JAR, recipe: null });
			s.run.jarMana = jarSize;
			return s;
		})(),
	};
	for (const [name, state] of Object.entries(states))
		for (const phase of balance.clock)
			it(`${name} in ${phase.constellation}`, () => {
				const fast = structuredClone(state);
				const slow = structuredClone(state);
				for (let k = 0; k < 60; k++) {
					tick(fast, phase);
					slowTick(slow, phase);
					expect(fast).toEqual(slow);
				}
			});
});
