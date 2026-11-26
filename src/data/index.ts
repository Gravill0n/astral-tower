// Typed balance data for the app. Validated by index.test.ts, not at runtime.
import raw from "./balance.json";
import type { Balance } from "./schema.ts";

export type { Balance } from "./schema.ts";
export type { Unlock } from "./unlock.ts";

export const balance = raw as unknown as Balance;
