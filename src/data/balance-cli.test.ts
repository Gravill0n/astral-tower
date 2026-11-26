import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { afterEach, expect, it } from "vitest";

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
const SCRIPT = fileURLToPath(
	new URL("../../scripts/balance.ts", import.meta.url),
);
const balance = (...args: string[]) =>
	spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

const dirs: string[] = [];
afterEach(() => {
	for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

it("balance --check exits 0 on the committed workbook and JSON", () => {
	const run = balance("--check");
	expect(run.stderr).toBe("");
	expect(run.status).toBe(0);
});

it("balance --check exits 1 on a bad workbook, naming the cell", () => {
	const dir = mkdtempSync(join(tmpdir(), "balance-"));
	dirs.push(dir);
	const file = join(dir, "bad.xlsx");
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
	const run = balance("--check", file);
	expect(run.status).toBe(1);
	expect(run.stderr).toContain('Resources!A1: unknown header "Bogus"');
});
