import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { phaseAt } from "./clock.ts";
import { newGame } from "./state.ts";
import { GATES, shellView, upcoming } from "./view.ts";

const MIN = 60_000;
const cycle = balance.globals["Clock cycle"].value * MIN;
const first = balance.clock[0];
const last = balance.clock[balance.clock.length - 1];
const hour = 1_000 * cycle; // some later cycle start
const g = balance.globals;
const row = (name: string) => {
	const r = balance.buildings.find((b) => b.building === name);
	if (!r) throw new Error(`Buildings: no ${name}`);
	return r;
};

describe("shellView top bar (gdd 12.1)", () => {
	it("starts a new game at base mana, starting apprentices and empty floor", () => {
		const v = shellView(newGame(hour + 3 * MIN));
		expect(v.mana).toEqual({
			made: g["Base mana generation"].value,
			drawn: 0,
			net: g["Base mana generation"].value,
			short: false,
		});
		expect(v.apprentices).toEqual({
			free: g["Starting apprentices"].value,
			needed: 0,
		});
		expect(v.space).toEqual({
			used: 0,
			total: g["Starting floor space"].value,
			floors: 1,
		});
	});

	it("sums the space of owned buildings", () => {
		const s = newGame(hour);
		const a = balance.buildings[1];
		const b = balance.buildings[2];
		s.run.buildings.push({ type: a.building, recipe: null });
		s.run.buildings.push({ type: b.building, recipe: null });
		expect(shellView(s).space.used).toBe(a.space + b.space);
	});

	it("marks a mana shortage", () => {
		const s = newGame(hour);
		const r = balance.recipes.find((x) => x.mana > 0);
		if (!r) throw new Error("Recipes: need one drawing mana");
		const n = Math.ceil((g["Base mana generation"].value * 2) / r.mana);
		for (let i = 0; i < n; i++)
			s.run.buildings.push({ type: r.building, recipe: r.recipe });
		for (const x of r.inputs) s.run.stock[x.resource] = 1e9;
		s.run.recruited = 1e6; // never short of apprentices
		const v = shellView(s);
		expect(v.mana.short).toBe(true);
		expect(v.mana.net).toBeCloseTo(v.mana.made - v.mana.drawn);
	});
});

describe("shellView clock (gdd 3.5)", () => {
	it("gives the current phase, seconds left and the next phase", () => {
		const v = shellView(newGame(hour + first.starts * MIN + 61_000));
		expect(v.clock.phase).toBe(first);
		expect(v.clock.leftS).toBe((first.ends - first.starts) * 60 - 61);
		expect(v.clock.next).toBe(balance.clock[1]);
	});

	it("wraps from the last phase to the first", () => {
		const t = hour + last.ends * MIN - 1_000;
		const v = shellView(newGame(t));
		expect(v.clock.phase).toBe(phaseAt(t));
		expect(v.clock.phase).toBe(last);
		expect(v.clock.leftS).toBe(1);
		expect(v.clock.next).toBe(first);
	});
});

describe("shellView nav (gdd 2 Modules)", () => {
	it("opens the Foundry and locks only the next module", () => {
		const { nav } = shellView(newGame(hour));
		expect(nav.foundry).toEqual({ status: "open" });
		expect(nav.gardens).toEqual({
			status: "locked",
			condition: row(GATES.gardens).unlock.text,
		});
		expect(nav.gardens).toEqual({
			status: "locked",
			condition: "Build the first Apprentice quarters",
		});
		for (const m of ["guild", "library", "bestiary", "supernova"] as const)
			expect(nav[m]).toEqual({ status: "hidden" });
	});

	it("moves the lock to the next module once a gate unlocks", () => {
		const s = newGame(hour);
		s.unlocked.push(`buildings/${GATES.gardens}`);
		const { nav } = shellView(s);
		expect(nav.gardens).toEqual({ status: "open" });
		expect(nav.guild).toEqual({
			status: "locked",
			condition: row(GATES.guild).unlock.text,
		});
		expect(nav.library).toEqual({ status: "hidden" });
	});

	it("opens Supernova with the Library", () => {
		const s = newGame(hour);
		for (const m of ["gardens", "guild", "library"] as const)
			s.unlocked.push(`buildings/${GATES[m]}`);
		const { nav } = shellView(s);
		expect(nav.library).toEqual({ status: "open" });
		expect(nav.supernova).toEqual({ status: "open" });
		expect(nav.bestiary.status).toBe("locked");
	});

	it("always opens Overview, Buildings, Stats and Settings", () => {
		const { nav } = shellView(newGame(hour));
		for (const m of ["overview", "buildings", "stats", "settings"] as const)
			expect(nav[m]).toEqual({ status: "open" });
	});

	it("names gate buildings that exist in the Buildings tab", () => {
		for (const name of Object.values(GATES)) expect(row(name)).toBeDefined();
	});
});

describe("upcoming (gdd 12.3 Coming up)", () => {
	it("lists the next phase changes in time order", () => {
		const s = newGame(hour + last.starts * MIN + 30_000);
		const { clock } = shellView(s);
		const next = upcoming(s, 3);
		expect(next).toHaveLength(3);
		expect(next[0]).toEqual({
			phase: clock.next,
			at: s.time + clock.leftS * 1000,
		});
		expect(next.map((x) => x.phase)).toEqual(balance.clock.slice(0, 3));
		for (const x of next) expect(phaseAt(x.at)).toBe(x.phase);
		expect(next[1].at - next[0].at).toBe((first.ends - first.starts) * MIN);
	});

	it("gives shellView the seconds until each, the first being the time left", () => {
		const s = newGame(hour + last.starts * MIN + 30_000);
		const v = shellView(s);
		expect(v.comingUp).toEqual(
			upcoming(s, 3).map((x) => ({
				phase: x.phase,
				inS: (x.at - s.time) / 1000,
			})),
		);
		expect(v.comingUp[0].inS).toBe(v.clock.leftS);
	});
});
