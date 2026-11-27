// Keyboard shortcuts (GDD 12.5): 1–9 switch screens, Esc closes a panel or goes
// back, ? lists them. M and H arrive with M4 and M5.

import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { Nav, Screen } from "../core/view.ts";
import { SCREENS, type ScreenDef, useGame } from "./Shell.tsx";

// Q10: the key's sidebar screen. A hidden one gets nothing; a locked one opens
// its placeholder.
export const shortcutScreen = (
	key: string,
	nav: Record<Screen, Nav>,
): ScreenDef | undefined => {
	const s = SCREENS.find((s) => s.key !== undefined && String(s.key) === key);
	return s && nav[s.screen].status !== "hidden" ? s : undefined;
};

const typing = (t: EventTarget | null) =>
	t instanceof HTMLElement &&
	(t.isContentEditable || t.closest("input, select, textarea") !== null);

export const Shortcuts = () => {
	const nav = useGame((s) => s.view.nav);
	const navRef = useRef(nav);
	navRef.current = nav;
	const list = useRef<HTMLDialogElement>(null);
	const router = useRouter();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
				return;
			if (typing(e.target)) return;
			// An open dialog owns the keys; Esc closes it natively (Q9).
			if (document.querySelector("dialog[open]")) return;
			if (e.key === "Escape") {
				// Q9: back through in-app history, else Overview.
				if (router.history.canGoBack()) router.history.back();
				else router.navigate({ to: "/" });
			} else if (e.key === "?") {
				list.current?.showModal(); // native: focus returns on close
			} else {
				const s = shortcutScreen(e.key, navRef.current);
				if (s) router.navigate({ to: s.path });
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [router]);

	return (
		<dialog ref={list} className="shortcuts" aria-label="Keyboard shortcuts">
			<h2>Keyboard shortcuts</h2>
			<dl>
				{SCREENS.filter(
					(s) => s.key !== undefined && nav[s.screen].status !== "hidden",
				).map((s) => (
					<div key={s.screen}>
						<dt>
							<kbd>{s.key}</kbd>
						</dt>
						<dd>{s.label}</dd>
					</div>
				))}
				<div>
					<dt>
						<kbd>Esc</kbd>
					</dt>
					<dd>Close a panel or go back</dd>
				</div>
				<div>
					<dt>
						<kbd>?</kbd>
					</dt>
					<dd>List shortcuts</dd>
				</div>
			</dl>
			<form method="dialog">
				<button type="submit">Close</button>
			</form>
		</dialog>
	);
};
