import { describe, expect, it } from "vitest";
import { balance } from "../data/index.ts";
import { phaseAt } from "./clock.ts";
import { TICK } from "./state.ts";

const MIN = 60_000;
const cycle = balance.globals["Clock cycle"].value * MIN;
const first = balance.clock[0];
const second = balance.clock[1];
const last = balance.clock[balance.clock.length - 1];
const hour = 1_000 * cycle; // some later cycle start

describe("phaseAt", () => {
	it("follows the Clock tab boundaries in wall-clock minutes", () => {
		expect(phaseAt(hour + first.starts * MIN)).toBe(first);
		expect(phaseAt(hour + first.ends * MIN - 1)).toBe(first);
		expect(phaseAt(hour + second.starts * MIN)).toBe(second);
		expect(phaseAt(hour + last.ends * MIN - 1)).toBe(last);
		expect(phaseAt(hour + cycle)).toBe(first);
	});

	it("gives every row its own window", () => {
		for (const row of balance.clock) {
			expect(phaseAt(hour + row.starts * MIN)).toBe(row);
		}
	});

	it("puts every boundary on a whole tick", () => {
		for (const row of balance.clock) {
			expect((row.starts * MIN) % TICK).toBe(0);
			expect((row.ends * MIN) % TICK).toBe(0);
		}
		expect(cycle % TICK).toBe(0);
	});
});
