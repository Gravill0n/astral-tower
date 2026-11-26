import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { readXlsx } from "./xlsx";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

function workbook(
	sheets: { name: string; data: string }[],
	sharedStrings?: string,
): Uint8Array {
	const files: Record<string, Uint8Array> = {
		"xl/workbook.xml": strToU8(
			`<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
				// Reverse rIds so order must come from workbook.xml, not file names.
				.map(
					(s, i) =>
						`<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${sheets.length - i}"/>`,
				)
				.join("")}</sheets></workbook>`,
		),
		"xl/_rels/workbook.xml.rels": strToU8(
			`<Relationships>${sheets
				.map(
					(_, i) =>
						`<Relationship Id="rId${sheets.length - i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
				)
				.join(
					"",
				)}${sharedStrings === undefined ? "" : '<Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'}</Relationships>`,
		),
	};
	sheets.forEach((s, i) => {
		files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
			`<worksheet ${NS}><cols><col min="1" max="1"/></cols><sheetData>${s.data}</sheetData></worksheet>`,
		);
	});
	if (sharedStrings !== undefined) {
		files["xl/sharedStrings.xml"] = strToU8(
			`<sst ${NS}>${sharedStrings}</sst>`,
		);
	}
	return zipSync(files);
}

function values(bytes: Uint8Array) {
	return readXlsx(bytes)[0].rows.flatMap((row) =>
		row.cells.map((c) => [c.ref, c.value]),
	);
}

describe("readXlsx", () => {
	it("returns tabs in workbook order with row numbers and columns", () => {
		const sheets = readXlsx(
			workbook([
				{ name: "Zeta", data: '<row r="1"><c r="A1"><v>1</v></c></row>' },
				{
					name: "Alpha &amp; Co",
					data: '<row r="3"><c r="AB3"><v>2.5</v></c></row>',
				},
			]),
		);
		expect(sheets.map((s) => s.name)).toEqual(["Zeta", "Alpha & Co"]);
		expect(sheets[1].rows).toEqual([
			{ r: 3, cells: [{ ref: "AB3", col: "AB", value: 2.5 }] },
		]);
	});

	it("resolves shared strings, joining rich-text runs", () => {
		const bytes = workbook(
			[
				{
					name: "S",
					data: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
				},
			],
			'<si><t>Moon ore</t></si><si><r><rPr><b/></rPr><t>Star </t></r><r><t xml:space="preserve">dust </t></r><rPh><t>x</t></rPh></si>',
		);
		expect(values(bytes)).toEqual([
			["A1", "Moon ore"],
			["B1", "Star dust "],
		]);
	});

	it("reads inline strings, formula strings and booleans", () => {
		const bytes = workbook([
			{
				name: "S",
				data:
					'<row r="1"><c r="A1" t="inlineStr"><is><t>Comet</t></is></c>' +
					'<c r="B1" t="str"><f>"Ne"&amp;"bula"</f><v>Nebula</v></c>' +
					'<c r="C1" t="b"><v>1</v></c><c r="D1" t="b"><v>0</v></c></row>',
			},
		]);
		expect(values(bytes)).toEqual([
			["A1", "Comet"],
			["B1", "Nebula"],
			["C1", true],
			["D1", false],
		]);
	});

	it("decodes named and numeric XML entities", () => {
		const bytes = workbook(
			[{ name: "S", data: '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' }],
			"<si><t>&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos; &#233; &#x2605;</t></si>",
		);
		expect(values(bytes)).toEqual([["A1", `<a> & "b" 'c' é ★`]]);
	});

	it("returns the cached value of formula cells", () => {
		const bytes = workbook([
			{
				name: "S",
				data: '<row r="2"><c r="A2"><f>1+1</f><v>2</v></c></row>',
			},
		]);
		expect(values(bytes)).toEqual([["A2", 2]]);
	});

	it("maps a cached empty string and an empty cell to undefined", () => {
		const bytes = workbook([
			{
				name: "S",
				data: '<row r="1"><c r="A1" t="str"><f>IF(1,"","x")</f><v></v></c><c r="B1" s="2"/></row>',
			},
		]);
		expect(values(bytes)).toEqual([
			["A1", undefined],
			["B1", undefined],
		]);
	});

	it("throws naming tab and cell when a formula has no cached value", () => {
		const bytes = workbook([
			{ name: "Recipes", data: '<row r="4"><c r="C4"><f>1+1</f></c></row>' },
		]);
		expect(() => readXlsx(bytes)).toThrow(
			"Recipes!C4: formula has no cached value",
		);
	});
});

describe("the committed balance workbook", () => {
	const sheets = readXlsx(
		readFileSync(
			new URL("../../balance/astral-tower-balance.xlsx", import.meta.url),
		),
	);
	const header = (name: string) =>
		sheets.find((s) => s.name === name)?.rows[0].cells.map((c) => c.value);

	it("has the 23 tabs in sheet order with the catalogued data-row counts", () => {
		expect(sheets.map((s) => [s.name, s.rows.length - 1])).toEqual([
			["Resources", 39],
			["Recipes", 32],
			["Buildings", 17],
			["Upgrades", 14],
			["Crops", 6],
			["Buffs", 13],
			["Clock", 6],
			["Voyages", 5],
			["Ships", 3],
			["Gear", 7],
			["Pace", 6],
			["Library", 13],
			["Familiars", 6],
			["Traits", 7],
			["Stardust tree", 13],
			["Stardust gain", 6],
			["Globals", 53],
			["Research", 3],
			["Stars", 7],
			["Events", 8],
			["Trials", 9],
			["Contracts", 9],
			["Galaxy", 20],
		]);
	});

	it("has header rows matching the sheet catalogue", () => {
		expect(header("Resources")).toEqual([
			"Resource",
			"Tier",
			"Module",
			"Source",
			"Storage cap",
		]);
		expect(header("Galaxy")).toEqual([
			"Star",
			"Type",
			"Dim",
			"Links to",
			"Trial",
			"Notes",
		]);
		expect(header("Stardust gain")).toEqual([
			"Mana produced this run",
			"Stardust",
		]);
	});
});
