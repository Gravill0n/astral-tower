// Game loop (GDD 11.1, 11.3): the only module touching the wall clock, timers
// and localStorage. Owns the single State, steps it on fixed ticks and publishes
// plain view snapshots to a TanStack Store for React, with the UI prefs.
import { Store } from "@tanstack/react-store";
import { z } from "zod";
import { loadSave, saveToString } from "./core/save.ts";
import { newGame } from "./core/state.ts";
import { step } from "./core/step.ts";
import { type ShellView, shellView } from "./core/view.ts";
import { NUMBER_FORMATS } from "./ui/format.ts";

export const SAVE_KEY = "astral-tower:save";
export const BROKEN_KEY = "astral-tower:save:broken";
// UI prefs live apart from the save: no SAVE_VERSION, no migration (plan Q3).
export const PREFS_KEY = "astral-tower:prefs";
const LOOP_MS = 250; // well under a tick, so a tick shows within 250 ms
const AUTOSAVE_MS = 30_000; // GDD 11.3, not a balance value

export type Env = {
	storage: Pick<Storage, "getItem" | "setItem"> | null;
	now: () => number;
	doc: EventTarget & { readonly visibilityState: DocumentVisibilityState };
	win: EventTarget;
};

// User-controlled input: a bad field falls back to its default, never throws.
const PrefsSchema = z
	.object({ numberFormat: z.enum(NUMBER_FORMATS).catch("short") })
	.catch({ numberFormat: "short" });
export type Prefs = z.infer<typeof PrefsSchema>;

export type Snapshot = { view: ShellView; prefs: Prefs };

export type Game = {
	store: Store<Snapshot>;
	save: () => void;
	setPrefs: (prefs: Prefs) => void;
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

const read = (storage: Env["storage"], key: string): string | null => {
	try {
		return storage?.getItem(key) ?? null;
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

const loadPrefs = (raw: string | null): Prefs => {
	try {
		return PrefsSchema.parse(raw === null ? {} : JSON.parse(raw));
	} catch {
		return PrefsSchema.parse({}); // not JSON
	}
};

export const startGame = (env: Env = browserEnv()): Game => {
	const { storage, now, doc, win } = env;
	const raw = read(storage, SAVE_KEY);
	const loaded = raw === null ? null : loadSave(raw);
	// An unreadable save is copied aside first; if that fails, never overwrite it.
	const canSave =
		loaded === null ||
		loaded.ok ||
		write(storage, BROKEN_KEY, () => raw as string);
	const state = loaded?.ok ? loaded.state : newGame(now());
	step(state, now()); // offline catch-up: the same ticks as an open tab

	const store = new Store<Snapshot>({
		view: shellView(state),
		prefs: loadPrefs(read(storage, PREFS_KEY)),
	});
	const save = () => {
		if (canSave) write(storage, SAVE_KEY, () => saveToString(state));
	};
	const setPrefs = (prefs: Prefs) => {
		store.setState((s) => ({ ...s, prefs }));
		write(storage, PREFS_KEY, () => JSON.stringify(prefs));
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
	return { store, save, setPrefs, stop };
};
