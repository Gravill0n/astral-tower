import { describe, expect, expectTypeOf, it } from "vitest";
import raw from "./balance.json";
import { balance, type Unlock } from "./index.ts";
import { BalanceSchema } from "./schema.ts";

describe("balance.json", () => {
	it("matches the schema (catches hand edits)", () => {
		BalanceSchema.parse(raw);
	});

	it("has the 23 sheet sections", () => {
		expect(Object.keys(balance)).toHaveLength(23);
	});

	it("types unlocks as a discriminated union", () => {
		const unlock = balance.recipes[0].unlock;
		expectTypeOf(unlock).toEqualTypeOf<Unlock>();
		if (unlock.kind === "own") {
			expectTypeOf(unlock.building).toEqualTypeOf<string>();
		}
	});
});
