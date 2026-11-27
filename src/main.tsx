import {
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startGame } from "./game.ts";
import { Overview } from "./ui/Overview.tsx";
import { Settings } from "./ui/Settings.tsx";
import { GameStore, Placeholder, SCREENS, Shell } from "./ui/Shell.tsx";
import "./ui/theme.css";

// Code-based routes: https://tanstack.com/router/latest/docs/framework/react/routing/code-based-routing
// notFoundComponent on the root: https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors
const rootRoute = createRootRoute({
	component: Shell,
	// Rendered in the Shell's <main> (the root Outlet).
	notFoundComponent: () => (
		<>
			<h1>Lost in the void</h1>
			<p>Nothing is docked at this address.</p>
			<Link to="/">Back to the tower</Link>
		</>
	),
});

// One route per screen; each shows the placeholder until its milestone builds it.
const routeTree = rootRoute.addChildren(
	SCREENS.map((screen) =>
		createRoute({
			getParentRoute: () => rootRoute,
			path: screen.path,
			component: () =>
				screen.screen === "overview" ? (
					<Overview />
				) : screen.screen === "settings" ? (
					<Settings setPrefs={game.setPrefs} />
				) : (
					<Placeholder screen={screen} />
				),
		}),
	),
);

// Hash history: GitHub Pages has no SPA fallback.
// https://tanstack.com/router/latest/docs/framework/react/guide/history-types
const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Module level, not an effect: StrictMode's double effects cannot start two loops.
const game = startGame();

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
	<StrictMode>
		<GameStore value={game.store}>
			<RouterProvider router={router} />
		</GameStore>
	</StrictMode>,
);
