import { describe, expect, it } from "vitest";
import { newGame } from "../core/state.ts";
import { shellView } from "../core/view.ts";
import { shortcutScreen } from "./Shortcuts.tsx";

const nav = shellView(newGame(0)).nav; // fresh game: Gardens locked, Guild on hidden

describe("shortcutScreen (gdd 12.5, Q10)", () => {
	it("maps 1–9 to the sidebar screens with that number", () => {
		expect(shortcutScreen("1", nav)?.screen).toBe("overview");
		expect(shortcutScreen("2", nav)?.screen).toBe("buildings");
		expect(shortcutScreen("3", nav)?.screen).toBe("foundry");
		expect(shortcutScreen("9", nav)?.screen).toBe("stats");
	});

	it("opens a locked screen (its placeholder shows the condition)", () => {
		expect(nav.gardens.status).toBe("locked");
		expect(shortcutScreen("4", nav)?.screen).toBe("gardens");
	});

	it("does nothing for hidden screens", () => {
		expect(nav.guild.status).toBe("hidden");
		expect(shortcutScreen("5", nav)).toBeUndefined();
		expect(shortcutScreen("8", nav)).toBeUndefined();
	});

	it("ignores other keys", () => {
		for (const k of ["0", "a", "!", "Escape", "10"]) {
			expect(shortcutScreen(k, nav)).toBeUndefined();
		}
	});
});
