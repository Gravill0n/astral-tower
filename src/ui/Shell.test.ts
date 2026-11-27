import { describe, expect, it } from "vitest";
import { newGame } from "../core/state.ts";
import { shellView } from "../core/view.ts";
import { SCREENS } from "./Shell.tsx";

describe("SCREENS registry (gdd 12.1, 12.2)", () => {
	it("lists every screen once, in GDD 12.1 sidebar order", () => {
		expect(SCREENS.map((s) => s.screen)).toEqual(
			Object.keys(shellView(newGame(0)).nav),
		);
	});

	it("has unique paths and keys 1–9 in sidebar order, Settings unnumbered", () => {
		expect(new Set(SCREENS.map((s) => s.path)).size).toBe(SCREENS.length);
		expect(SCREENS.map((s) => s.key)).toEqual([
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9,
			undefined,
		]);
	});

	it("keeps Overview, Buildings, Foundry and Gardens as the mobile tabs", () => {
		expect(
			SCREENS.filter((s) => s.mobile === "tab").map((s) => s.screen),
		).toEqual(["overview", "buildings", "foundry", "gardens"]);
	});
});
