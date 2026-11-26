// Mana grid (GDD 3.3): supply, demand and the shortage factor.
import { balance } from "../data/index.ts";
import type { Phase } from "./clock.ts";
import { atLeast } from "./cost.ts";
import { runLines } from "./production.ts";
import { type State, TICK } from "./state.ts";

export const baseMana = balance.globals["Base mana generation"].value;
const dt = TICK / 1000;

// Mana/s at full mana: made = base + Mana lines (input-limited, Collectors only
// in starlight phases), demand = Σ draw × uptime, factor = supply ÷ demand
// capped at 1. Pure: runs the lines on a scratch copy of the run. One pass, so
// uptimes are those before the factor applies (plan, Risks).
export const manaFlow = (state: State, phase: Phase) => {
	const run = state.run;
	const scratch = {
		...state,
		run: { ...run, stock: { ...run.stock }, produced: {}, milestones: {} },
	};
	// Seams: apprentice factor (Task 13), hunger (M5).
	const lines = runLines(scratch, dt, {
		overchannel: run.overchannel,
		mana: 1,
		apprentice: 1,
		apprenticeSpeed: 1,
		starlight: phase.starlightCollector,
	});
	const made = baseMana + lines.made / dt;
	const demand = lines.drawn;
	const discharge = 0; // seam: Mana Jars (Task 12)
	const supply = made + discharge;
	const factor = atLeast(supply, demand) ? 1 : supply / demand;
	return {
		made,
		drawn: demand * factor,
		demand,
		factor,
		wasted: Math.max(0, made - demand),
	};
};
