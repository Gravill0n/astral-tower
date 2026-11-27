import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newGame, newRun, TICK } from "./state.ts";

describe("newGame", () => {
	it("floors the time to a whole tick", () => {
		expect(newGame(5 * TICK + 1).time).toBe(5 * TICK);
		expect(newGame(5 * TICK).time).toBe(5 * TICK);
	});

	it("starts with nothing owned, nothing counted and no unlocks", () => {
		const state = newGame(0);
		expect(state.unlocked).toEqual([]);
		expect(state.run).toEqual({
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
	});

	it("is plain JSON", () => {
		const state = newGame(0);
		expect(JSON.parse(JSON.stringify(state))).toEqual(state);
	});
});

describe("newRun", () => {
	it("resets the run and keeps every unlock", () => {
		const state = newGame(0);
		state.unlocked.push("buildings/Star Drill");
		state.run.stock["Ember ore"] = 5;
		state.run.buildings.push({ type: "Star Drill", recipe: null });
		state.run.recruited = 3;

		const next = newRun(state);

		expect(next.run).toEqual(newGame(0).run);
		expect(next.unlocked).toEqual(["buildings/Star Drill"]);
		expect(next.unlocked).not.toBe(state.unlocked);
		expect(next.time).toBe(state.time);
	});
});

describe("src/core purity", () => {
	const dir = new URL("./", import.meta.url);
	const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
		(f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
	);
	const banned =
		/Date\.now|new Date\(|performance\.now|\bwindow\b|\bdocument\b|localStorage|Math\.random|from\s+["']react/;

	it("has source files to check", () => {
		expect(files).toContain("state.ts");
	});

	it.each(files)("%s uses no clock, DOM, randomness or React", (file) => {
		expect(readFileSync(new URL(file, dir), "utf8")).not.toMatch(banned);
	});
});
