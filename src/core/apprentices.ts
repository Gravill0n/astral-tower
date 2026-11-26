// Apprentices (GDD 3.4): one shared pool, automatic assignment, shortage factor.
import { balance } from "../data/index.ts";
import { atLeast } from "./cost.ts";
import type { State } from "./state.ts";

// Named in code; a test asserts it exists in the Buildings tab.
export const APPRENTICE_QUARTERS = "Apprentice quarters";
const quartersRow = balance.buildings.find(
	(b) => b.building === APPRENTICE_QUARTERS,
);
if (!quartersRow?.provides)
	throw new Error(`Buildings: ${APPRENTICE_QUARTERS} has no provides`);
const perQuarters = quartersRow.provides; // seam: Bunk beds (M4)
const start = balance.globals["Starting apprentices"].value;
const need = new Map(balance.buildings.map((b) => [b.building, b.apprentices]));

// count = Starting + recruited; room = Starting + quarters × provides;
// needed = Σ apprentices of non-Idle buildings; free = count (seam: crews in
// flight, M6). factor = free ÷ needed capped at 1, for buildings needing any.
export const apprentices = (state: State) => {
	const { buildings, recruited } = state.run;
	const count = start + recruited;
	let quarters = 0;
	let needed = 0;
	for (const b of buildings) {
		if (b.type === APPRENTICE_QUARTERS) quarters++;
		if (b.recipe !== null) needed += need.get(b.type) ?? 0;
	}
	const free = count;
	return {
		count,
		room: start + quarters * perQuarters,
		needed,
		free,
		factor: atLeast(free, needed) ? 1 : free / needed,
	};
};
