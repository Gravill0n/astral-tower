// Shell A (GDD 12.1): the screen registry, the root layout with the top bar and
// module sidebar (GDD 2 Modules), and the placeholder for screens later milestones build.

import { Link, Outlet } from "@tanstack/react-router";
import type { Store } from "@tanstack/react-store";
import { useSelector } from "@tanstack/react-store";
import { createContext, use, useRef } from "react";
import type { Nav, Screen } from "../core/view.ts";
import type { Snapshot } from "../game.ts";
import {
	anvil,
	bookshelf,
	brickWall,
	cog,
	explosionRays,
	foxHead,
	galleon,
	hamburgerMenu,
	histogram,
	Icon,
	sprout,
	whiteTower,
} from "./icons.tsx";
import { Shortcuts } from "./Shortcuts.tsx";
import { TopBar } from "./TopBar.tsx";

export type ScreenDef = {
	screen: Screen;
	path: string;
	label: string; // sidebar and tab text
	title: string; // page heading
	icon: string;
	key?: number; // shortcut 1–9 (Q10)
	group: "tower" | "star" | "settings";
	mobile: "tab" | "more";
};

// One registry feeds the routes, sidebar, mobile tabs, More sheet and shortcuts.
// Order is the GDD 12.1 sidebar order.
export const SCREENS: ScreenDef[] = [
	{
		screen: "overview",
		path: "/",
		label: "Overview",
		title: "Overview",
		icon: whiteTower,
		key: 1,
		group: "tower",
		mobile: "tab",
	},
	{
		screen: "buildings",
		path: "/buildings",
		label: "Buildings",
		title: "Buildings",
		icon: brickWall,
		key: 2,
		group: "tower",
		mobile: "tab",
	},
	{
		screen: "foundry",
		path: "/foundry",
		label: "Foundry",
		title: "Arcane Foundry",
		icon: anvil,
		key: 3,
		group: "tower",
		mobile: "tab",
	},
	{
		screen: "gardens",
		path: "/gardens",
		label: "Gardens",
		title: "Starlight Gardens",
		icon: sprout,
		key: 4,
		group: "tower",
		mobile: "tab",
	},
	{
		screen: "guild",
		path: "/guild",
		label: "Guild",
		title: "Star-Sailors' Guild",
		icon: galleon,
		key: 5,
		group: "tower",
		mobile: "more",
	},
	{
		screen: "library",
		path: "/library",
		label: "Library",
		title: "Constellation Library",
		icon: bookshelf,
		key: 6,
		group: "tower",
		mobile: "more",
	},
	{
		screen: "bestiary",
		path: "/bestiary",
		label: "Bestiary",
		title: "Celestial Bestiary",
		icon: foxHead,
		key: 7,
		group: "tower",
		mobile: "more",
	},
	{
		screen: "supernova",
		path: "/supernova",
		label: "Supernova",
		title: "Supernova",
		icon: explosionRays,
		key: 8,
		group: "star",
		mobile: "more",
	},
	{
		screen: "stats",
		path: "/stats",
		label: "Stats",
		title: "Stats",
		icon: histogram,
		key: 9,
		group: "star",
		mobile: "more",
	},
	{
		screen: "settings",
		path: "/settings",
		label: "Settings",
		title: "Settings",
		icon: cog,
		group: "settings",
		mobile: "more",
	},
];

// The game store, provided once in main.tsx. A React context (not router
// context) so this module never needs the router's registered types.
export const GameStore = createContext<Store<Snapshot> | null>(null);

export const useGame = <T,>(select: (s: Snapshot) => T): T => {
	const store = use(GameStore);
	if (!store) throw new Error("GameStore not provided");
	return useSelector(store, select);
};

// A sidebar or More sheet entry: a link when open, greyed with its unlock
// condition when locked. Callers drop hidden screens.
const NavItem = (p: { s: ScreenDef; n: Nav; onClick?: () => void }) =>
	p.n.status === "locked" ? (
		<span className="nav-item" aria-disabled="true">
			<Icon d={p.s.icon} />
			<span>
				{p.s.label}
				<small>{p.n.condition}</small>
			</span>
		</span>
	) : (
		<Link
			to={p.s.path}
			className="nav-item"
			activeOptions={{ exact: true }}
			onClick={p.onClick}
		>
			<Icon d={p.s.icon} />
			<span>{p.s.label}</span>
		</Link>
	);

const Sidebar = () => {
	const nav = useGame((s) => s.view.nav);
	return (
		<nav aria-label="Modules" className="sidebar">
			<span className="sidebar-group">Tower</span>
			{SCREENS.map((s, i) => {
				const n = nav[s.screen];
				if (n.status === "hidden") return null;
				const divider = s.group === "star" && SCREENS[i - 1]?.group !== "star";
				return (
					<div
						key={s.screen}
						className={s.group === "settings" ? "sidebar-end" : undefined}
					>
						{divider && <hr />}
						<NavItem s={s} n={n} />
					</div>
				);
			})}
		</nav>
	);
};

// Mobile (GDD 12.1): four fixed tabs plus More. Q7: a locked tab stays, greyed,
// and opens the placeholder with its unlock condition. The sidebar and these
// tabs are never visible together (one media query), so both are "Modules".
const TabBar = () => {
	const nav = useGame((s) => s.view.nav);
	const sheet = useRef<HTMLDialogElement>(null);
	const more = useRef<HTMLButtonElement>(null);
	const close = () => sheet.current?.close();
	return (
		<>
			<nav aria-label="Modules" className="tabbar">
				{SCREENS.filter((s) => s.mobile === "tab").map((s) => (
					<Link
						key={s.screen}
						to={s.path}
						className="tab"
						data-locked={nav[s.screen].status !== "open" || undefined}
						activeOptions={{ exact: true }}
					>
						<Icon d={s.icon} />
						<span>{s.label}</span>
						{nav[s.screen].status !== "open" && (
							<span className="sr-only"> (locked)</span>
						)}
					</Link>
				))}
				<button
					ref={more}
					type="button"
					className="tab"
					aria-haspopup="dialog"
					onClick={() => sheet.current?.showModal()}
				>
					<Icon d={hamburgerMenu} />
					<span>More</span>
				</button>
			</nav>
			{/* Bottom sheet (GDD 12.5): Esc closes it natively; a click on the
			    dialog itself (not its content) is a click on the backdrop. Kept
			    outside the nav: a modal under a display:none parent would leave
			    the page inert and invisible if the viewport crosses 768px. */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc is native to <dialog> */}
			<dialog
				ref={sheet}
				className="sheet"
				aria-label="More"
				onClick={(e) => e.target === e.currentTarget && close()}
				onClose={() => more.current?.focus()}
			>
				<div className="sheet-body">
					{SCREENS.filter(
						(s) => s.mobile === "more" && nav[s.screen].status !== "hidden",
					).map((s) => (
						<NavItem key={s.screen} s={s} n={nav[s.screen]} onClick={close} />
					))}
				</div>
			</dialog>
		</>
	);
};

export const Shell = () => (
	<div className="shell">
		<TopBar />
		<div className="shell-body">
			<Sidebar />
			{/* Right panels belong to their screen (see .panel in theme.css). */}
			<main className="screen">
				<Outlet />
			</main>
		</div>
		<TabBar />
		<Shortcuts />
	</div>
);

// Q8: unbuilt screens say so. A locked screen shows its unlock condition; a
// hidden one only says it is out of reach (GDD 2 keeps later modules unseen).
export const Placeholder = ({ screen }: { screen: ScreenDef }) => {
	const nav = useGame((s) => s.view.nav[screen.screen]);
	return (
		<>
			<h1>{screen.title}</h1>
			<p>
				{nav.status === "open"
					? "This deck is still being fitted."
					: nav.status === "locked"
						? `Locked. ${nav.condition}.`
						: "This deck is not on the charts yet."}
			</p>
		</>
	);
};
