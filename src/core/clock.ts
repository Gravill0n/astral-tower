// Constellation clock (GDD 3.5): phases from UTC wall-clock minutes, so every
// player sees the same sky and offline time replays the same phases.
import { balance } from "../data/index.ts";

export type Phase = (typeof balance.clock)[number];

const cycle = balance.globals["Clock cycle"].value;

export const phaseAt = (now: number): Phase => {
	const minute = (((now / 60_000) % cycle) + cycle) % cycle;
	const phase = balance.clock.find(
		(p) => minute >= p.starts && minute < p.ends,
	);
	if (!phase) throw new Error(`No Clock phase at minute ${minute}`);
	return phase;
};
