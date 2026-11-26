import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

it("balance --check exits 1 on a bad workbook, naming the cell", () => {
	const file = join(mkdtempSync(join(tmpdir(), "balance-")), "bad.xlsx");
	writeFileSync(
		file,
		zipSync({
			"xl/workbook.xml": strToU8(
				`<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Resources" sheetId="1" r:id="rId1"/></sheets></workbook>`,
			),
			"xl/_rels/workbook.xml.rels": strToU8(
				'<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
			),
			"xl/worksheets/sheet1.xml": strToU8(
				`<worksheet ${NS}><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Bogus</t></is></c></row></sheetData></worksheet>`,
			),
		}),
	);
	const run = spawnSync(
		process.execPath,
		[
			new URL("../../scripts/balance.ts", import.meta.url).pathname,
			"--check",
			file,
		],
		{ encoding: "utf8" },
	);
	expect(run.status).toBe(1);
	expect(run.stderr).toContain('Resources!A1: unknown header "Bogus"');
});
