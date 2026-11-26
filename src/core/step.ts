// Time (GDD 11.1, 11.3): fixed ticks tied to the wall clock, so an open, hidden
// or closed tab runs the identical tick sequence. Phase boundaries fall on whole
// ticks, so no tick straddles a constellation change.
import { balance } from "../data/index.ts";
import { type Phase, phaseAt } from "./clock.ts";
import { atLeast } from "./cost.ts";
import { type State, TICK } from "./state.ts";
import { updateUnlocks } from "./unlocks.ts";

export const TICK_S = TICK / 1000;

const cycleS = balance.globals["Clock cycle"].value * 60;
const capTicks = (balance.globals["Offline cap"].value * 3_600_000) / TICK;

// One tick of dt seconds in `phase`. Later tasks add production, mana and apprentices.
export const tick = (state: State, dt: number, _phase: Phase): void => {
	const run = state.run;
	run.elapsed += dt;
	if (atLeast(run.elapsed, cycleS)) run.milestones.clockCycle = true;
	updateUnlocks(state);
};

// Advances `state` in place to the last whole tick before `now`. Returns ms
// simulated and ms skipped beyond the Offline cap. A clock behind `state.time`
// is a no-op: progress pauses until real time catches up.
export const step = (
	state: State,
	now: number,
): { simulated: number; skipped: number } => {
	const ticks = Math.floor((now - state.time) / TICK);
	if (!(ticks > 0)) return { simulated: 0, skipped: 0 }; // also rejects NaN
	const skipped = Math.max(0, ticks - capTicks);
	state.time += skipped * TICK;
	for (let i = skipped; i < ticks; i++) {
		tick(state, TICK_S, phaseAt(state.time));
		state.time += TICK;
	}
	return { simulated: (ticks - skipped) * TICK, skipped: skipped * TICK };
};
