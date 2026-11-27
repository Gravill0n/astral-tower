// Game loop (GDD 11.1, 11.3): the only module touching the wall clock, timers
// and localStorage. Owns the single State, steps it on fixed ticks and publishes
// plain view snapshots to a TanStack Store for React.
import { Store } from "@tanstack/react-store";
import { loadSave, saveToString } from "./core/save.ts";
import { newGame } from "./core/state.ts";
import { step } from "./core/step.ts";
import { type ShellView, shellView } from "./core/view.ts";

export const SAVE_KEY = "astral-tower:save";
export const BROKEN_KEY = "astral-tower:save:broken";
const LOOP_MS = 250; // well under a tick, so a tick shows within 250 ms
const AUTOSAVE_MS = 30_000; // GDD 11.3, not a balance value

export type Env = {
	storage: Pick<Storage, "getItem" | "setItem"> | null;
	now: () => number;
	doc: EventTarget & { readonly visibilityState: DocumentVisibilityState };
	win: EventTarget;
};

// Grows with UI prefs (number format) in Task 9.
export type Snapshot = { view: ShellView };

export type Game = {
	store: Store<Snapshot>;
	save: () => void;
	stop: () => void;
};

// localStorage itself can throw (storage disabled, sandboxed frame).
const browserStorage = (): Env["storage"] => {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
};

const browserEnv = (): Env => ({
	storage: browserStorage(),
	now: Date.now,
	doc: document,
	win: window,
});

const read = (storage: Env["storage"]): string | null => {
	try {
		return storage?.getItem(SAVE_KEY) ?? null;
	} catch {
		return null;
	}
};

// Never throws: quota, private mode or a bad state must not stop the loop.
const write = (storage: Env["storage"], key: string, text: () => string) => {
	try {
		storage?.setItem(key, text());
		return true;
	} catch {
		return false;
	}
};

export const startGame = (env: Env = browserEnv()): Game => {
	const { storage, now, doc, win } = env;
	const raw = read(storage);
	const loaded = raw === null ? null : loadSave(raw);
	// An unreadable save is copied aside first; if that fails, never overwrite it.
	const canSave =
		loaded === null ||
		loaded.ok ||
		write(storage, BROKEN_KEY, () => raw as string);
	const state = loaded?.ok ? loaded.state : newGame(now());
	step(state, now()); // offline catch-up: the same ticks as an open tab

	const store = new Store<Snapshot>({ view: shellView(state) });
	const save = () => {
		if (canSave) write(storage, SAVE_KEY, () => saveToString(state));
	};
	const loop = setInterval(() => {
		// Nothing to publish when no tick ran (also a clock moved backwards).
		if (step(state, now()).simulated > 0)
			store.setState((s) => ({ ...s, view: shellView(state) }));
	}, LOOP_MS);
	const autosave = setInterval(save, AUTOSAVE_MS);
	const onVisibility = () => {
		if (doc.visibilityState === "hidden") save();
	};
	doc.addEventListener("visibilitychange", onVisibility);
	win.addEventListener("pagehide", save);

	const stop = () => {
		clearInterval(loop);
		clearInterval(autosave);
		doc.removeEventListener("visibilitychange", onVisibility);
		win.removeEventListener("pagehide", save);
	};
	return { store, save, stop };
};
