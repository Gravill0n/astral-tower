import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBalance } from "./build.ts";
import { GLOBALS } from "./schema.ts";
import { readXlsx, type Sheet } from "./xlsx.ts";

// Builds a Sheet from rows of values; row 1 is the header, columns A, B, C…
function sheet(name: string, rows: (string | number | undefined)[][]): Sheet {
	return {
		name,
		rows: rows.map((values, i) => ({
			r: i + 1,
			cells: values.map((value, j) => {
				const col = String.fromCharCode(65 + j);
				return { ref: `${col}${i + 1}`, col, value };
			}),
		})),
	};
}

const RESOURCES_HEADER = [
	"Resource",
	"Tier",
	"Module",
	"Source",
	"Storage cap",
];

function globals(drop?: string, extra?: string): Sheet {
	const names = GLOBALS.filter((n) => n !== drop);
	return sheet("Globals", [
		["Parameter", "Value", "Unit", "Notes"],
		...names.map((n) => [n, 1, n === "Offline cap" ? "h" : undefined]),
		...(extra ? [[extra, 1]] : []),
	]);
}

function errors(sheets: Sheet[]): string[] {
	const result = buildBalance(sheets);
	return "errors" in result ? result.errors : [];
}

describe("buildBalance", () => {
	it("maps Resources rows and Globals parameters to typed data", () => {
		const result = buildBalance([
			sheet("Resources", [
				RESOURCES_HEADER,
				["Ember ore", "Raw", "Foundry", "Star Drill", 500],
				[],
			]),
			globals(),
			sheet("Notes for designers", [["Anything"]]),
		]);
		if (!("balance" in result)) throw new Error(result.errors.join("\n"));
		expect(result.balance.resources).toEqual([
			{
				resource: "Ember ore",
				tier: "Raw",
				module: "Foundry",
				source: "Star Drill",
				storageCap: 500,
			},
		]);
		expect(result.balance.globals["Offline cap"]).toEqual({
			value: 1,
			unit: "h",
		});
	});

	it("reports an unknown header", () => {
		expect(
			errors([
				sheet("Resources", [[...RESOURCES_HEADER, "Colour"]]),
				globals(),
			]),
		).toEqual(['Resources!F1: unknown header "Colour"']);
	});

	it("reports a missing header", () => {
		expect(
			errors([sheet("Resources", [RESOURCES_HEADER.slice(0, 4)]), globals()]),
		).toEqual(['Resources: missing header "Storage cap"']);
	});

	it("reports a non-number in a number column", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", "Foundry", "Star Drill", "lots"],
				]),
				globals(),
			]),
		).toEqual([
			"Resources!E2 (Ember ore): Invalid input: expected number, received string",
		]);
	});

	it("reports a value outside an enum", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Shiny", "Foundry", "Star Drill", 500],
				]),
				globals(),
			]),
		).toEqual([
			expect.stringMatching(/^Resources!B2 \(Ember ore\): Invalid option/),
		]);
	});

	it("reports an empty required cell at its address", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Raw", undefined, "Star Drill", 500],
				]),
				globals(),
			]),
		).toEqual([
			'Resources!C2 (Ember ore): Invalid option: expected one of "Foundry"|"Guild"|"Gardens"',
		]);
	});

	it("reports a missing and an unknown global parameter", () => {
		expect(
			errors([
				sheet("Resources", [RESOURCES_HEADER]),
				globals("Offline cap", "Warp factor"),
			]),
		).toEqual([
			'Globals: missing "Offline cap"',
			'Globals!A54 (Warp factor): unknown name "Warp factor"',
		]);
	});

	it("reports a missing tab", () => {
		expect(errors([globals()])).toEqual(['missing tab "Resources"']);
	});

	it("reports every error together", () => {
		expect(
			errors([
				sheet("Resources", [
					RESOURCES_HEADER,
					["Ember ore", "Shiny", "Foundry", "Star Drill", "lots"],
					["Frost ore", "Raw", "Nowhere", "Star Drill", 500],
				]),
				sheet("Globals", [["Parameter", "Value", "Unit", "Notes", "Owner"]]),
			]),
		).toEqual([
			'Globals!E1: unknown header "Owner"',
			expect.stringMatching(/^Resources!B2 \(Ember ore\)/),
			expect.stringMatching(/^Resources!E2 \(Ember ore\)/),
			expect.stringMatching(/^Resources!C3 \(Frost ore\)/),
		]);
	});

	it("builds Resources and Globals from the real workbook", () => {
		const result = buildBalance(
			readXlsx(
				readFileSync(
					new URL("../../balance/astral-tower-balance.xlsx", import.meta.url),
				),
			),
		);
		if (!("balance" in result)) throw new Error(result.errors.join("\n"));
		expect(result.balance.resources).toHaveLength(39);
		expect(Object.keys(result.balance.globals)).toHaveLength(53);
		expect(result.balance.globals["Clock cycle"].value).toBe(60);
	});
});
