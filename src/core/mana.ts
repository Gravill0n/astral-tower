// Mana grid (GDD 3.3): supply, demand and the shortage factor.
import { balance } from "../data/index.ts";
import type { Phase } from "./clock.ts";
import { atLeast } from "./cost.ts";
import { runLines } from "./production.ts";
import { type State, TICK } from "./state.ts";

export const baseMana = balance.globals["Base mana generation"].value;
const dt = TICK / 1000;

export const MANA_JAR = "Mana Jar";
const jarRow = balance.buildings.find((b) => b.building === MANA_JAR);
if (!jarRow?.provides)
	throw new Error(`Buildings: ${MANA_JAR} has no provides`);
const jarSize = jarRow.provides;
const jarRate = balance.globals["Mana Jar rate"].value;

// Jars pool their mana in run.jarMana. Seam: Bigger jars (M4) scales capacity.
const jarsOf = (state: State) => {
	const n = state.run.buildings.filter((b) => b.type === MANA_JAR).length;
	return { capacity: n * jarSize, rate: n * jarRate };
};

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
	// Jars cover a deficit or take a surplus, at most rate and what is stored
	// or room left; the rest of a surplus is wasted.
	const jars = jarsOf(state);
	const stored = run.jarMana / dt;
	const room = Math.max(0, jars.capacity - run.jarMana) / dt;
	const net = made - demand;
	const discharge = Math.min(jars.rate, stored, Math.max(0, -net));
	const charge = Math.min(jars.rate, room, Math.max(0, net));
	const supply = made + discharge;
	const factor = atLeast(supply, demand) ? 1 : supply / demand;
	return {
		made,
		drawn: demand * factor,
		demand,
		factor,
		wasted: Math.max(0, net - charge),
		charge,
		discharge,
	};
};

// Applies one tick of jar flow; sets fillManaJar when the pool is full.
export const chargeJars = (
	state: State,
	grid: ReturnType<typeof manaFlow>,
): void => {
	const run = state.run;
	run.jarMana += (grid.charge - grid.discharge) * dt;
	const { capacity } = jarsOf(state);
	if (capacity > 0 && atLeast(run.jarMana, capacity))
		run.milestones.fillManaJar = true;
};
