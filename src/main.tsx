import {
	createHashHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startGame } from "./game.ts";

// Code-based routes: https://tanstack.com/router/latest/docs/framework/react/routing/code-based-routing
// notFoundComponent on the root: https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors
const rootRoute = createRootRoute({
	component: Outlet,
	notFoundComponent: () => (
		<main>
			<h1>Lost in the void</h1>
			<p>Nothing is docked at this address.</p>
			<Link to="/">Back to the tower</Link>
		</main>
	),
});

const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: () => <h1>Astral Tower</h1>,
});

const routeTree = rootRoute.addChildren([indexRoute]);

// Hash history: GitHub Pages has no SPA fallback.
// https://tanstack.com/router/latest/docs/framework/react/guide/history-types
const router = createRouter({ routeTree, history: createHashHistory() });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Module level, not an effect: StrictMode's double effects cannot start two loops.
startGame(); // ponytail: Game not held yet; Task 5 passes game.store to the shell

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
