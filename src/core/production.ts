// Production (GDD 3.6, 5.1): bonus stacking and per-line rates.
import type { Balance } from "../data/index.ts";
import type { Building, State } from "./state.ts";

type Recipe = Balance["recipes"][number];
export type Bonus = Partial<
	Pick<Balance["buffs"][number], "speed" | "mana" | "output" | "yield">
>;
export type Multipliers = Required<{ [K in keyof Bonus]: number }>;
export type Factors = {
	overchannel: number;
	mana: number; // grid shortage factor
	apprentice: number; // apprentice shortage factor
	apprenticeSpeed: number;
};

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

// Seam: M4/M5 add runes, upgrades, meals and foremen.
export const bonusesFor = (_state: State, _building: Building): Bonus[] => [];

// Per building: cycles/s, mana draw (mana/s) and output per cycle.
export const lineRates = (recipe: Recipe, m: Multipliers, f: Factors) => ({
	cycles:
		(m.speed * f.overchannel * f.mana * f.apprentice * f.apprenticeSpeed) /
		recipe.time,
	mana: recipe.mana * f.overchannel * m.mana,
	output: recipe.outQty * m.output,
});
