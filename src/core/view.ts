// Shell view model (GDD 2 Modules, 3.3–3.5, 12.1): the plain figures the top
// bar, sidebar and clock strip show. Pure: reads State and balance only, and
// returns new objects, so the UI never holds the state the core mutates.
import { balance } from "../data/index.ts";
import { apprentices } from "./apprentices.ts";
import { type Phase, phaseAt } from "./clock.ts";
import { manaFlow } from "./mana.ts";
import type { State } from "./state.ts";

export type Screen =
	| "overview"
	| "buildings"
	| "foundry"
	| "gardens"
	| "guild"
	| "library"
	| "bestiary"
	| "supernova"
	| "stats"
	| "settings";

export type Nav =
	| { status: "open" }
	| { status: "locked"; condition: string }
	| { status: "hidden" };

// Modules in unlock order, each opened by its building's unlock (GDD 2). Named
// in code; a test asserts each exists in the Buildings tab.
export const GATES = {
	gardens: "Garden bed",
	guild: "Dock",
	library: "Library shelf",
	bestiary: "Hollow chamber",
} as const;

const gates = Object.entries(GATES).map(([module, building]) => {
	const row = balance.buildings.find((b) => b.building === building);
	if (!row) throw new Error(`Buildings: no ${building}`);
	return {
		module: module as keyof typeof GATES,
		key: `buildings/${building}`,
		text: row.unlock.text,
	};
});
const space = new Map(balance.buildings.map((b) => [b.building, b.space]));
const startSpace = balance.globals["Starting floor space"].value;
const cycleMs = balance.globals["Clock cycle"].value * 60_000;

// Unlocked modules are open, the first locked one shows its condition, later
// ones stay hidden. Supernova opens with the Library (GDD 2).
const nav = (state: State): Record<Screen, Nav> => {
	const done = new Set(state.unlocked);
	const open: Nav = { status: "open" };
	const out: Record<Screen, Nav> = {
		overview: open,
		buildings: open,
		foundry: open,
		gardens: open,
		guild: open,
		library: open,
		bestiary: open,
		supernova: open,
		stats: open,
		settings: open,
	};
	let next = true;
	for (const g of gates) {
		if (done.has(g.key)) continue;
		out[g.module] = next
			? { status: "locked", condition: g.text }
			: { status: "hidden" };
		next = false;
	}
	if (out.library.status !== "open") out.supernova = { status: "hidden" };
	return out;
};

// Seconds from `time` to the end of its phase.
const leftS = (time: number, phase: Phase) => {
	const pos = ((time % cycleMs) + cycleMs) % cycleMs;
	return (phase.ends * 60_000 - pos) / 1000;
};

export const shellView = (state: State) => {
	const phase = phaseAt(state.time);
	const grid = manaFlow(state, phase);
	const crew = apprentices(state);
	const left = leftS(state.time, phase);
	let used = 0;
	for (const b of state.run.buildings) used += space.get(b.type) ?? 0;
	return {
		mana: {
			made: grid.made,
			drawn: grid.drawn,
			net: grid.made - grid.drawn,
			short: grid.factor < 1,
		},
		apprentices: { free: crew.free, needed: crew.needed },
		// ponytail: one floor until M4 floors.
		space: { used, total: startSpace, floors: 1 },
		clock: { phase, leftS: left, next: phaseAt(state.time + left * 1000) },
		nav: nav(state),
	};
};

export type ShellView = ReturnType<typeof shellView>;

// The next n phase changes after state.time, with their wall-clock start (ms).
export const upcoming = (
	state: State,
	n: number,
): { phase: Phase; at: number }[] => {
	const out: { phase: Phase; at: number }[] = [];
	let at = state.time + leftS(state.time, phaseAt(state.time)) * 1000;
	for (let i = 0; i < n; i++) {
		const phase = phaseAt(at);
		out.push({ phase, at });
		at += (phase.ends - phase.starts) * 60_000;
	}
	return out;
};
