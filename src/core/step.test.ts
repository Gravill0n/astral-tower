import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { newGame, TICK } from "./state.ts";
import { step } from "./step.ts";

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
