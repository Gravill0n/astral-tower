// Game state (GDD 3, 10.2, 11.3): plain JSON, mutated in place by core functions.
// `unlocked` is permanent; `run` is what a Supernova resets.
import type { Unlock } from "../data/index.ts";

// Engine constants, not balance values.
export const TICK = 1000; // ms per simulated tick
export const SAVE_VERSION = 1;
// Cap on owned buildings so a save or a ×max buy cannot grow without bound.
// ponytail: flat cap; revisit in M4 when floors land (space may bound it instead).
export const MAX_BUILDINGS = 2000;

export type Milestone = Extract<Unlock, { kind: "milestone" }>["milestone"];

// Keyed by sheet names; a missing key means 0.
export type Counts = Record<string, number>;

export type Building = {
	type: string;
	recipe: string | null; // null = Idle
};

export type Run = {
	elapsed: number; // s simulated this run
	stock: Counts;
	buildings: Building[];
	upgrades: Counts; // levels
	produced: Counts; // units made this run, plus "Mana"
	handMined: Counts;
	milestones: Partial<Record<Milestone, true>>;
	jarMana: number;
	overchannel: number;
	// Apprentice count = Starting apprentices (Globals) + recruited.
	recruited: number;
	recruitQueue: number;
	recruitProgress: number; // s towards the next recruit
};

export type State = {
	version: number;
	time: number; // wall-clock ms of the last simulated tick, a multiple of TICK
	unlocked: string[]; // "<tab>/<name>"
	run: Run;
};

const freshRun = (): Run => ({
	elapsed: 0,
	stock: {},
	buildings: [],
	upgrades: {},
	produced: {},
	handMined: {},
	milestones: {},
	jarMana: 0,
	overchannel: 1,
	recruited: 0,
	recruitQueue: 0,
	recruitProgress: 0,
});

export const newGame = (now: number): State => ({
	version: SAVE_VERSION,
	time: Math.floor(now / TICK) * TICK,
	unlocked: [],
	run: freshRun(),
});

export const newRun = (state: State): State => ({
	...state,
	unlocked: [...state.unlocked],
	run: freshRun(),
});
