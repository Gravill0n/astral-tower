import { describe, expect, it } from "vitest";
import {
	formatDuration,
	formatNumber,
	formatRate,
	type NumberFormat,
} from "./format.ts";

const MODES: NumberFormat[] = ["short", "scientific", "engineering", "letters"];

// value → [short, scientific, engineering, letters]
const TABLE: [number, string, string, string, string][] = [
	[0, "0", "0", "0", "0"],
	[0.67, "0.67", "0.67", "0.67", "0.67"],
	[4.5, "4.5", "4.5", "4.5", "4.5"],
	[999, "999", "999", "999", "999"],
	[1_000, "1K", "1e3", "1e3", "1K"],
	[12_345, "12.3K", "1.23e4", "12.3e3", "12.3K"],
	[1.5e6, "1.5M", "1.5e6", "1.5e6", "1.5M"],
	[2.5e9, "2.5B", "2.5e9", "2.5e9", "2.5B"],
	[1e12, "1T", "1e12", "1e12", "1T"],
	[1e15, "1Qa", "1e15", "1e15", "1aa"],
	[4.2e18, "4.2Qi", "4.2e18", "4.2e18", "4.2ab"],
	[1e30, "1No", "1e30", "1e30", "1af"],
	[1e33, "1Dc", "1e33", "1e33", "1ag"],
	[1e36, "1e36", "1e36", "1e36", "1ah"],
	[1e93, "1e93", "1e93", "1e93", "1ba"],
	[-12_345, "-12.3K", "-1.23e4", "-12.3e3", "-12.3K"],
	[-0.67, "-0.67", "-0.67", "-0.67", "-0.67"],
];

describe("formatNumber", () => {
	it.each(TABLE)("formats %d in every mode", (n, ...expected) => {
		expect(MODES.map((m) => formatNumber(n, m))).toEqual(expected);
	});

	it("rolls a value that rounds up into the next suffix", () => {
		expect(formatNumber(999.95, "short")).toBe("1K");
		expect(formatNumber(999.95, "scientific")).toBe("1e3");
		expect(formatNumber(999_950, "short")).toBe("1M");
		expect(formatNumber(999_950, "engineering")).toBe("1e6");
		expect(formatNumber(9.995e14, "letters")).toBe("1aa");
	});

	it("keeps 3 significant digits on small values", () => {
		expect(formatNumber(0.004, "short")).toBe("0.004");
		expect(formatNumber(0.012345, "short")).toBe("0.0123");
		expect(formatNumber(32, "short")).toBe("32");
	});

	it("never shows -0", () => {
		for (const m of MODES) expect(formatNumber(-0, m)).toBe("0");
	});

	it("returns — for non-finite values and never throws", () => {
		for (const m of MODES) {
			expect(formatNumber(Number.NaN, m)).toBe("—");
			expect(formatNumber(Number.POSITIVE_INFINITY, m)).toBe("—");
			expect(formatNumber(Number.NEGATIVE_INFINITY, m)).toBe("—");
		}
	});

	it("handles the largest finite number", () => {
		expect(formatNumber(Number.MAX_VALUE, "short")).toBe("1.8e308");
		expect(formatNumber(Number.MAX_VALUE, "letters")).toBe("180dt");
	});
});

describe("formatRate", () => {
	it("always shows a sign", () => {
		expect(formatRate(4.5, "short", "s")).toBe("+4.5/s");
		expect(formatRate(-1_200, "short", "min")).toBe("-1.2K/min");
		expect(formatRate(0, "short", "s")).toBe("+0/s");
		expect(formatRate(-0, "short", "s")).toBe("+0/s");
	});

	it("shows — for non-finite rates", () => {
		expect(formatRate(Number.NaN, "short", "s")).toBe("—/s");
	});
});

describe("formatDuration", () => {
	it("uses m:ss under an hour and h:mm:ss from one hour", () => {
		expect(formatDuration(519)).toBe("8:39");
		expect(formatDuration(59.9)).toBe("0:59");
		expect(formatDuration(3_600)).toBe("1:00:00");
		expect(formatDuration(3_725)).toBe("1:02:05");
	});

	it("clamps negative and non-finite input to 0:00", () => {
		expect(formatDuration(-5)).toBe("0:00");
		expect(formatDuration(Number.NaN)).toBe("0:00");
	});
});
