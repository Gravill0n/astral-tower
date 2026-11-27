// Shell A (GDD 12.1): the screen registry, the root layout with the top bar and
// module sidebar (GDD 2 Modules), and the placeholder for screens later milestones build.

import { Link, Outlet } from "@tanstack/react-router";
import type { Store } from "@tanstack/react-store";
import { useSelector } from "@tanstack/react-store";
import { createContext, use } from "react";
import type { Screen } from "../core/view.ts";
import type { Snapshot } from "../game.ts";
import {
	anvil,
	bookshelf,
	brickWall,
	cog,
	explosionRays,
	foxHead,
	galleon,
	histogram,
	Icon,
	sprout,
	whiteTower,
} from "./icons.tsx";
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

const Sidebar = () => {
	const nav = useGame((s) => s.view.nav);
	return (
		<nav aria-label="Modules" className="sidebar">
			<span className="sidebar-group">Tower</span>
			{SCREENS.map((s, i) => {
				const n = nav[s.screen];
				if (n.status === "hidden") return null;
				const divider = s.group === "star" && SCREENS[i - 1]?.group !== "star";
				const item =
					n.status === "locked" ? (
						<span className="nav-item" aria-disabled="true">
							<Icon d={s.icon} />
							<span>
								{s.label}
								<small>{n.condition}</small>
							</span>
						</span>
					) : (
						<Link
							to={s.path}
							className="nav-item"
							activeOptions={{ exact: true }}
						>
							<Icon d={s.icon} />
							<span>{s.label}</span>
						</Link>
					);
				return (
					<div
						key={s.screen}
						className={s.group === "settings" ? "sidebar-end" : undefined}
					>
						{divider && <hr />}
						{item}
					</div>
				);
			})}
		</nav>
	);
};

export const Shell = () => (
	<div className="shell">
		<TopBar />
		<div className="shell-body">
			<Sidebar />
			{/* ponytail: right panel arrives with the first screen that fills it */}
			<main className="screen">
				<Outlet />
			</main>
		</div>
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
