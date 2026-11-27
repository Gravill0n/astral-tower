// Game loop (GDD 11.1, 11.3): load, catch up, step on the wall clock, autosave.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSave, saveToString } from "./core/save.ts";
import { newGame, TICK } from "./core/state.ts";
import {
	BROKEN_KEY,
	type Env,
	PREFS_KEY,
	SAVE_KEY,
	startGame,
} from "./game.ts";

const start = Date.UTC(2026, 10, 26, 12); // a whole hour

const memoryStorage = (init: Record<string, string> = {}) => {
	const data = new Map(Object.entries(init));
	return {
		data,
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => {
			data.set(k, v);
		},
	};
};

const page = () => {
	const doc = Object.assign(new EventTarget(), {
		visibilityState: "visible" as DocumentVisibilityState,
	});
	return { doc, win: new EventTarget() };
};

const env = (storage: Env["storage"]) => ({
	storage,
	now: () => Date.now(),
	...page(),
});

const savedTime = (storage: { getItem: (k: string) => string | null }) => {
	const r = loadSave(storage.getItem(SAVE_KEY) ?? "");
	if (!r.ok) throw new Error(r.error);
	return r.state.time;
};

let stop = () => {};
beforeEach(() => {
	vi.useFakeTimers({ now: start });
});
afterEach(() => {
	stop();
	vi.useRealTimers();
});

describe("startGame: load", () => {
	it("loads a valid save and catches up to now", () => {
		const storage = memoryStorage({
			[SAVE_KEY]: saveToString(newGame(start - 60 * TICK)),
		});
		const game = startGame(env(storage));
		stop = game.stop;
		game.save();
		expect(savedTime(storage)).toBe(start);
		expect(game.store.state.view.clock.phase).toBeDefined();
	});

	it("starts a new game when there is no save", () => {
		const storage = memoryStorage();
		const game = startGame(env(storage));
		stop = game.stop;
		game.save();
		expect(savedTime(storage)).toBe(start);
		expect(storage.data.has(BROKEN_KEY)).toBe(false);
	});

	it("keeps an unreadable save under the backup key and starts fresh", () => {
		const storage = memoryStorage({ [SAVE_KEY]: "not a save" });
		const game = startGame(env(storage));
		stop = game.stop;
		expect(storage.data.get(BROKEN_KEY)).toBe("not a save");
		vi.advanceTimersByTime(60_000); // autosaves
		expect(storage.data.get(BROKEN_KEY)).toBe("not a save");
		expect(savedTime(storage)).toBeGreaterThanOrEqual(start + 60_000 - TICK);
	});

	it("never overwrites an unreadable save it could not back up", () => {
		const storage = {
			...memoryStorage({ [SAVE_KEY]: "not a save" }),
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		};
		const game = startGame(env(storage));
		stop = game.stop;
		const setItem = vi.spyOn(storage, "setItem");
		vi.advanceTimersByTime(60_000);
		game.save();
		expect(setItem).not.toHaveBeenCalled();
		expect(storage.data.get(SAVE_KEY)).toBe("not a save");
	});

	it("runs in memory when storage throws on read", () => {
		const storage = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {},
		};
		const game = startGame(env(storage));
		stop = game.stop;
		vi.advanceTimersByTime(2_000);
		expect(game.store.state.view).toBeDefined();
	});

	it("runs in memory with no storage at all", () => {
		const game = startGame(env(null));
		stop = game.stop;
		vi.advanceTimersByTime(31_000);
		expect(game.store.state.view).toBeDefined();
	});
});

describe("startGame: loop and store", () => {
	it("publishes one snapshot per simulated tick", () => {
		const game = startGame(env(memoryStorage()));
		stop = game.stop;
		const seen = vi.fn();
		game.store.subscribe(seen);
		vi.advanceTimersByTime(5 * TICK);
		expect(seen).toHaveBeenCalledTimes(5);
	});

	it("publishes nothing while the clock is behind the save", () => {
		const storage = memoryStorage({
			[SAVE_KEY]: saveToString(newGame(start + 10 * TICK)),
		});
		const game = startGame(env(storage));
		stop = game.stop;
		const seen = vi.fn();
		game.store.subscribe(seen);
		vi.advanceTimersByTime(5 * TICK);
		expect(seen).not.toHaveBeenCalled();
	});

	it("publishes fresh objects, never the state the core mutates", () => {
		const game = startGame(env(memoryStorage()));
		stop = game.stop;
		const before = game.store.state.view;
		vi.advanceTimersByTime(TICK);
		expect(game.store.state.view).not.toBe(before);
	});

	it("stop ends the loop", () => {
		const game = startGame(env(memoryStorage()));
		game.stop();
		const seen = vi.fn();
		game.store.subscribe(seen);
		vi.advanceTimersByTime(5 * TICK);
		expect(seen).not.toHaveBeenCalled();
	});
});

describe("startGame: autosave", () => {
	it("saves every 30 s", () => {
		const storage = memoryStorage();
		const game = startGame(env(storage));
		stop = game.stop;
		vi.advanceTimersByTime(29_999);
		expect(storage.data.has(SAVE_KEY)).toBe(false);
		vi.advanceTimersByTime(1);
		expect(savedTime(storage)).toBeGreaterThanOrEqual(start + 30_000 - TICK);
	});

	it("saves when the page is hidden, not when it is shown", () => {
		const storage = memoryStorage();
		const e = env(storage);
		const game = startGame(e);
		stop = game.stop;
		e.doc.dispatchEvent(new Event("visibilitychange"));
		expect(storage.data.has(SAVE_KEY)).toBe(false);
		e.doc.visibilityState = "hidden";
		e.doc.dispatchEvent(new Event("visibilitychange"));
		expect(storage.data.has(SAVE_KEY)).toBe(true);
	});

	it("saves on pagehide", () => {
		const storage = memoryStorage();
		const e = env(storage);
		const game = startGame(e);
		stop = game.stop;
		e.win.dispatchEvent(new Event("pagehide"));
		expect(storage.data.has(SAVE_KEY)).toBe(true);
	});

	it("keeps running when setItem throws", () => {
		const storage = {
			...memoryStorage(),
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		};
		const game = startGame(env(storage));
		stop = game.stop;
		const seen = vi.fn();
		game.store.subscribe(seen);
		vi.advanceTimersByTime(31_000);
		expect(seen).toHaveBeenCalledTimes(31);
	});
});

describe("startGame: first-load catch-up", () => {
	it("catches up a long gap on the mid-game fixture", () => {
		const text = readFileSync(
			new URL("./core/saves/v1-mid-game.json", import.meta.url),
			"utf8",
		);
		const time = JSON.parse(text).time as number;
		const gap = 24 * 3_600_000;
		vi.setSystemTime(time + gap);
		const storage = memoryStorage({ [SAVE_KEY]: text });
		const game = startGame(env(storage));
		stop = game.stop;
		game.save();
		expect(savedTime(storage)).toBe(time + gap);
	});
});

describe("startGame: prefs", () => {
	it("defaults to K/M/B with no prefs", () => {
		const game = startGame(env(memoryStorage()));
		stop = game.stop;
		expect(game.store.state.prefs).toEqual({ numberFormat: "short" });
	});

	it("loads saved prefs", () => {
		const storage = memoryStorage({
			[PREFS_KEY]: JSON.stringify({ numberFormat: "letters" }),
		});
		const game = startGame(env(storage));
		stop = game.stop;
		expect(game.store.state.prefs.numberFormat).toBe("letters");
	});

	it.each([
		"not json",
		"null",
		"[]",
		'"letters"',
		'{"numberFormat":"<img src=x>"}',
		'{"numberFormat":42}',
		'{"__proto__":{"numberFormat":"letters"}}',
	])("falls back to the default on tampered prefs %s", (raw) => {
		const save = saveToString(newGame(start));
		const storage = memoryStorage({ [PREFS_KEY]: raw, [SAVE_KEY]: save });
		const game = startGame(env(storage));
		stop = game.stop;
		expect(game.store.state.prefs).toEqual({ numberFormat: "short" });
		expect(storage.data.get(SAVE_KEY)).toBe(save);
		expect(storage.data.has(BROKEN_KEY)).toBe(false);
	});

	it("setPrefs updates the store and persists, apart from the save", () => {
		const storage = memoryStorage();
		const game = startGame(env(storage));
		stop = game.stop;
		const seen = vi.fn();
		game.store.subscribe(seen);
		game.setPrefs({ numberFormat: "engineering" });
		expect(seen).toHaveBeenCalledTimes(1);
		expect(game.store.state.prefs.numberFormat).toBe("engineering");
		expect(JSON.parse(storage.data.get(PREFS_KEY) ?? "")).toEqual({
			numberFormat: "engineering",
		});
		expect(storage.data.has(SAVE_KEY)).toBe(false);
	});

	it("keeps prefs across a restart", () => {
		const storage = memoryStorage();
		const first = startGame(env(storage));
		first.setPrefs({ numberFormat: "scientific" });
		first.stop();
		const game = startGame(env(storage));
		stop = game.stop;
		expect(game.store.state.prefs.numberFormat).toBe("scientific");
	});

	it("still updates the store when storage throws", () => {
		const storage = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		};
		const game = startGame(env(storage));
		stop = game.stop;
		expect(game.store.state.prefs.numberFormat).toBe("short");
		game.setPrefs({ numberFormat: "letters" });
		expect(game.store.state.prefs.numberFormat).toBe("letters");
	});
});
