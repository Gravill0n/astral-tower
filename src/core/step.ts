// Time (GDD 11.1, 11.3): fixed ticks tied to the wall clock, so an open, hidden
// or closed tab runs the identical tick sequence. Phase boundaries fall on whole
// ticks, so no tick straddles a constellation change.
import { balance } from "../data/index.ts";
import { advanceRecruits, apprentices } from "./apprentices.ts";
import { type Phase, phaseAt } from "./clock.ts";
import { atLeast } from "./cost.ts";
import { baseMana, chargeJars, manaFlowRun } from "./mana.ts";
import { MANA, runLines } from "./production.ts";
import { type State, TICK } from "./state.ts";
import { updateUnlocks } from "./unlocks.ts";

export const TICK_S = TICK / 1000;

const cycleS = balance.globals["Clock cycle"].value * 60;
const capTicks = (balance.globals["Offline cap"].value * 3_600_000) / TICK;

// One tick of dt seconds in `phase`.
export const tick = (state: State, dt: number, phase: Phase): void => {
	const run = state.run;
	const dry = manaFlowRun(state, phase);
	const grid = dry.grid;
	// Shortage = supply (base, lines and jar discharge) below demand (GDD 3.3).
	if (grid.factor < 1) run.milestones.manaShortage = true;
	chargeJars(state, grid);
	let lines = dry.lines;
	if (grid.factor === 1 && dt === TICK_S) {
		// Full mana: the dry run (one TICK) already ran these lines on copies of
		// this stock; copy back in place so state objects keep their identity.
		Object.assign(run.stock, dry.run.stock);
		Object.assign(run.produced, dry.run.produced);
		Object.assign(run.milestones, dry.run.milestones);
	} else {
		// Seam: hunger (M5).
		lines = runLines(state, dt, {
			overchannel: run.overchannel,
			mana: grid.factor,
			apprentice: apprentices(state).factor,
			apprenticeSpeed: 1,
			starlight: phase.starlightCollector,
		});
	}
	// Supplied mana: base + Attuners + Collectors (GDD 3.3).
	run.produced[MANA] = (run.produced[MANA] ?? 0) + baseMana * dt + lines.made;
	advanceRecruits(state, dt);
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
