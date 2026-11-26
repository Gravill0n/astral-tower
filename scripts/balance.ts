// Balance sheet → src/data/balance.json (GDD 13). Usage: node scripts/balance.ts [--check] [path.xlsx]
// --check: exit 1 if the sheet is invalid or the committed JSON is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildBalance } from "../src/data/build.ts";
import { readXlsx } from "../src/data/xlsx.ts";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const check = args.includes("--check");
const input = args.find((a) => a !== "--check");
const xlsx = input
	? resolve(input)
	: resolve(root, "balance/astral-tower-balance.xlsx");
const out = resolve(root, "src/data/balance.json");

const result = buildBalance(readXlsx(readFileSync(xlsx)));
if ("errors" in result) {
	for (const e of result.errors) console.error(e);
	process.exit(1);
}
const json = `${JSON.stringify(result.balance, null, "\t")}\n`;
if (!check) {
	writeFileSync(out, json);
} else {
	let committed = "";
	try {
		committed = readFileSync(out, "utf8");
	} catch {}
	if (committed !== json) {
		console.error("balance.json is stale: run pnpm balance");
		process.exit(1);
	}
}
