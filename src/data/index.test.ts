import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import raw from "./balance.json";
import { buildBalance } from "./build.ts";
import { balance, type Unlock } from "./index.ts";
import { BalanceSchema } from "./schema.ts";
import { readXlsx } from "./xlsx.ts";

describe("balance.json", () => {
	it("matches the schema (catches hand edits)", () => {
		BalanceSchema.parse(raw);
	});

	it("is what the committed workbook builds (catches a stale export)", () => {
		const built = buildBalance(
			readXlsx(
				readFileSync(
					new URL("../../balance/astral-tower-balance.xlsx", import.meta.url),
				),
			),
		);
		expect(built).not.toHaveProperty("errors");
		expect(raw).toEqual("balance" in built ? built.balance : undefined);
	});

	it("gives Globals units that name a resource where the core spends or earns it", () => {
		const names = new Set(balance.resources.map((r) => r.resource));
		for (const key of ["Hand mining", "Recruit cost"] as const) {
			expect(names).toContain(balance.globals[key].unit);
		}
	});

	it("types unlocks as a discriminated union", () => {
		const unlock = balance.recipes[0].unlock;
		expectTypeOf(unlock).toEqualTypeOf<Unlock>();
		if (unlock.kind === "own") {
			expectTypeOf(unlock.building).toEqualTypeOf<string>();
		}
	});
});
