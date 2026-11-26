// Unlocks (GDD 3.2, 13): every row with an Unlock column gets a permanent
// "<tab>/<name>" key once its condition is met. Keys are never removed, and
// newRun keeps them (they survive Supernovas).
import { balance, type Unlock } from "../data/index.ts";
import { atLeast } from "./cost.ts";
import type { State } from "./state.ts";

type Row = { key: string; unlock: Unlock };

const b = balance;
const ROWS: Row[] = [
	...b.buildings.map((r) => ({ key: `buildings/${r.building}`, ...r })),
	...b.recipes.map((r) => ({ key: `recipes/${r.recipe}`, ...r })),
	...b.upgrades.map((r) => ({ key: `upgrades/${r.upgrade}`, ...r })),
	...b.crops.map((r) => ({ key: `crops/${r.crop}`, ...r })),
	...b.voyages.map((r) => ({ key: `voyages/${r.nebula}`, ...r })),
	...b.ships.map((r) => ({ key: `ships/${r.ship}`, ...r })),
	...b.gear.map((r) => ({ key: `gear/${r.name}`, ...r })),
	...b.library.map((r) => ({ key: `library/${r.constellation}`, ...r })),
	...b.contracts.map((r, i) => ({ key: `contracts/${i}`, ...r })),
].map(({ key, unlock }) => ({ key, unlock }));

export const UNLOCK_KEYS = ROWS.map((r) => r.key);

const owned = (state: State, type: string) => {
	let n = 0;
	for (const x of state.run.buildings) if (x.type === type) n++;
	return n;
};

export const isMet = (u: Unlock, state: State): boolean => {
	const run = state.run;
	switch (u.kind) {
		case "own":
			return atLeast(owned(state, u.building), u.count);
		case "comesWith":
			return atLeast(owned(state, u.building), 1);
		case "produce":
			return atLeast(run.produced[u.resource] ?? 0, u.count);
		case "have":
			return atLeast(run.stock[u.resource] ?? 0, u.count);
		case "mineByHand":
			return atLeast(run.handMined[u.resource] ?? 0, u.count);
		case "floor": // M4 floors
		case "floorFull": // M4 floors
		case "sparks": // M4 Overchannel
		case "harvest": // M5 Garden
		case "harvestUnder": // M5 Garden
		case "ownShip": // M6 Guild
		case "voyages": // M6 Guild
		case "returnFrom": // M6 Guild
		case "seedsFrom": // M6 Guild
		case "godRelic": // M6 Guild
		case "contracts": // M6 contracts
		case "identify": // M7 Library
		case "libraryComplete": // M7 Library
		case "clockConstellations": // M7 Library
		case "hatch": // M9 Bestiary
			return false;
		// Last, so a new milestone falls off the end and fails tsc.
		case "milestone":
			switch (u.milestone) {
				case "manaShortage":
				case "fillAnyStorage":
				case "fillManaJar":
				case "clockCycle":
					return run.milestones[u.milestone] === true;
				case "libraryOpens": // M7 Library
				case "firstRelic": // M6 Guild
				case "firstEgg": // M9 Bestiary
				case "voyageBumpy": // M6 Guild
					return false;
			}
	}
};

// Rows not yet unlocked, rebuilt when `unlocked` changes outside this module
// (load, newRun, tests), so a tick only scans what is still locked.
const pendingCache = new WeakMap<string[], { seen: number; rows: Row[] }>();
const pending = (unlocked: string[]) => {
	let c = pendingCache.get(unlocked);
	if (!c || c.seen !== unlocked.length) {
		const done = new Set(unlocked);
		c = { seen: unlocked.length, rows: ROWS.filter((r) => !done.has(r.key)) };
		pendingCache.set(unlocked, c);
	}
	return c;
};

// Adds the key of every newly met row and returns the new keys.
export const updateUnlocks = (state: State): string[] => {
	const c = pending(state.unlocked);
	const added: string[] = [];
	for (const r of c.rows) if (isMet(r.unlock, state)) added.push(r.key);
	if (added.length) {
		state.unlocked.push(...added);
		c.rows = c.rows.filter((r) => !added.includes(r.key));
		c.seen = state.unlocked.length;
	}
	return added;
};
