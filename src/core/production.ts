// Production (GDD 3.6, 5.1): bonus stacking and per-line rates.
import { type Balance, balance } from "../data/index.ts";
import { atLeast, spend } from "./cost.ts";
import type { Building, State } from "./state.ts";
import { updateUnlocks } from "./unlocks.ts";

type Recipe = Balance["recipes"][number];
export type Bonus = Partial<
	Pick<Balance["buffs"][number], "speed" | "mana" | "output" | "yield">
>;
export type Multipliers = Required<{ [K in keyof Bonus]: number }>;
export type Factors = {
	overchannel: number;
	mana: number; // grid shortage factor, for mana-drawing lines only
	apprentice: number; // shortage factor, for buildings needing apprentices only
	apprenticeSpeed: number;
	starlight: boolean; // phase powers Starlight Collectors
};

// Named in code; a test asserts each exists in the Buildings tab.
export const STARLIGHT_COLLECTOR = "Starlight Collector";
export const MANA = "Mana"; // output of lines that feed the grid

// Same kind adds, kinds multiply (each kind is 1 + Σ).
export const multipliers = (bonuses: Bonus[]): Multipliers => {
	const m = { speed: 1, mana: 1, output: 1, yield: 1 };
	for (const b of bonuses) {
		m.speed += b.speed ?? 0;
		m.mana += b.mana ?? 0;
		m.output += b.output ?? 0;
		m.yield += b.yield ?? 0;
	}
	return m;
};

const NO_BONUS: Multipliers = multipliers([]);

// Seam: M4/M5 add runes, upgrades, meals and foremen.
export const bonusesFor = (_state: State, _building: Building): Bonus[] => [];

// Per building: cycles/s, mana draw (mana/s) and output per cycle. Speed bonuses
// leave draw alone (GDD 3.6); an apprentice shortage lowers it with speed. The
// grid's own shortage factor is applied to the total draw in manaFlow.
export const lineRates = (recipe: Recipe, m: Multipliers, f: Factors) => ({
	cycles:
		(m.speed *
			f.overchannel *
			(recipe.mana > 0 ? f.mana : 1) *
			f.apprentice *
			f.apprenticeSpeed) /
		recipe.time,
	mana: recipe.mana * f.overchannel * m.mana * f.apprentice,
	output: recipe.outQty * m.output,
});

const staffed = new Set(
	balance.buildings.filter((b) => b.apprentices > 0).map((b) => b.building),
);

const caps = new Map(balance.resources.map((r) => [r.resource, r.storageCap]));

// Seam: M4 adds Bigger stores. Unknown resources have no cap.
export const cap = (_state: State, resource: string): number =>
	caps.get(resource) ?? Number.POSITIVE_INFINITY;

const room = (state: State, resource: string) => {
	const c = cap(state, resource);
	const have = state.run.stock[resource] ?? 0;
	return atLeast(have, c) ? 0 : c - have;
};

// Adds up to the room left, sets fillAnyStorage at the cap, returns what was stored.
const store = (state: State, resource: string, qty: number): number => {
	const stock = state.run.stock;
	const added = Math.min(qty, room(state, resource));
	stock[resource] = (stock[resource] ?? 0) + added;
	if (atLeast(stock[resource], cap(state, resource)))
		state.run.milestones.fillAnyStorage = true;
	return added;
};

const count = (state: State, resource: string, qty: number) => {
	state.run.produced[resource] = (state.run.produced[resource] ?? 0) + qty;
};

// Runs every non-Idle building for dt s, recipes in Recipes-tab order, so a
// line sees what earlier lines made this tick. Each line runs at the share its
// inputs in stock and the room under its main output's cap allow. Lines with
// output "Mana" feed the grid: their mana is returned, not stored or counted.
// Returns mana made and mana drawn (mana/s × uptime) for the grid (Task 11).
export const runLines = (state: State, dt: number, f: Factors) => {
	const flow = { made: 0, drawn: 0 };
	const unstaffed = { ...f, apprentice: 1 };
	// One pass over buildings, grouped by recipe in instance order.
	const byRecipe = new Map<string, Building[]>();
	for (const b of state.run.buildings) {
		if (b.recipe === null) continue;
		if (b.type === STARLIGHT_COLLECTOR && !f.starlight) continue;
		const list = byRecipe.get(b.recipe);
		if (list) list.push(b);
		else byRecipe.set(b.recipe, [b]);
	}
	for (const r of balance.recipes) {
		const running = byRecipe.get(r.recipe);
		if (!running) continue;
		let cycles = 0;
		let out = 0;
		let draw = 0;
		for (const b of running) {
			const bonuses = bonusesFor(state, b);
			const rates = lineRates(
				r,
				bonuses.length ? multipliers(bonuses) : NO_BONUS,
				staffed.has(b.type) ? f : unstaffed,
			);
			cycles += rates.cycles * dt;
			out += rates.cycles * rates.output * dt;
			draw += rates.mana;
		}
		if (!(cycles > 0)) continue;
		let share = 1;
		for (const i of r.inputs)
			share = Math.min(
				share,
				(state.run.stock[i.resource] ?? 0) / (i.qty * cycles),
			);
		const mana = r.output === MANA;
		if (!mana) share = Math.min(share, room(state, r.output) / out);
		if (!(share > 0)) continue;
		spend(
			state.run.stock,
			r.inputs.map((i) => ({
				resource: i.resource,
				qty: i.qty * cycles * share,
			})),
		);
		flow.drawn += draw * share;
		if (mana) flow.made += out * share;
		else count(state, r.output, store(state, r.output, out * share));
		for (const by of r.byproducts) {
			const made = by.qty * cycles * share;
			store(state, by.resource, made); // above cap: discarded
			count(state, by.resource, made);
		}
	}
	return flow;
};

const hand = balance.globals["Hand mining"];
const handUnit = hand.unit;
if (!handUnit) throw new Error("Globals: Hand mining has no unit");

// Mine by hand: +Hand mining of its unit. At cap a click does nothing. Counts
// only in handMined, not in produced.
export const mineByHand = (state: State): void => {
	const added = store(state, handUnit, hand.value);
	if (!(added > 0)) return;
	state.run.handMined[handUnit] = (state.run.handMined[handUnit] ?? 0) + added;
	updateUnlocks(state);
};
