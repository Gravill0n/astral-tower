// Sheets → Balance, or every error found, each addressed as `Tab!Cell (row name)`.
import { type Balance, BalanceSchema, TABS, type TabDef } from "./schema";
import type { UnlockNames } from "./unlock";
import type { CellValue, Sheet } from "./xlsx";

// Raw values under a header, data rows only (no type checks: used before Zod).
function column(sheet: Sheet | undefined, header: string): CellValue[] {
	const col = sheet?.rows[0]?.cells.find((c) => c.value === header)?.col;
	if (!sheet || !col) return [];
	return sheet.rows
		.slice(1)
		.map((r) => r.cells.find((c) => c.col === col)?.value)
		.filter((v) => v !== undefined);
}

// Name sets for the unlock parser (GDD 13), from each tab's raw name column.
export function unlockNames(sheets: Sheet[]): UnlockNames {
	const tab = (name: string) => sheets.find((s) => s.name === name);
	const set = (name: string, header: string) =>
		new Set(column(tab(name), header).map(String));
	const resources = tab("Resources");
	const tiers = column(resources, "Tier");
	return {
		buildings: set("Buildings", "Building"),
		resources: set("Resources", "Resource"),
		crops: new Set(
			column(resources, "Resource")
				.filter((_, i) => tiers[i] === "Crop")
				.map(String),
		),
		voyages: set("Voyages", "Nebula"),
		ships: set("Ships", "Ship"),
		library: set("Library", "Constellation"),
		familiars: set("Familiars", "Species"),
	};
}

type Mapped = {
	def: TabDef;
	colOf: Record<string, string>; // row key → column letter
	rows: { r: number; name?: string }[]; // in sheet order
};

export function buildBalance(
	sheets: Sheet[],
): { balance: Balance } | { errors: string[] } {
	const errors: string[] = [];
	const raw: Record<string, unknown> = {};
	const mapped: Record<string, Mapped> = {};

	for (const [key, def] of Object.entries(TABS) as [string, TabDef][]) {
		const sheet = sheets.find((s) => s.name === def.tab);
		if (!sheet) {
			errors.push(`missing tab "${def.tab}"`);
			continue;
		}
		const [header, ...body] = sheet.rows;
		const colOf: Record<string, string> = {};
		const keyOf: Record<string, string> = {}; // column letter → row key
		const before = errors.length;
		for (const c of header?.cells ?? []) {
			if (c.value === undefined) continue;
			const k = def.columns[String(c.value)];
			if (k) {
				colOf[k] = c.col;
				keyOf[c.col] = k;
			} else if (!def.ignore?.includes(String(c.value))) {
				errors.push(`${def.tab}!${c.ref}: unknown header "${c.value}"`);
			}
		}
		for (const [h, k] of Object.entries(def.columns)) {
			if (!colOf[k]) errors.push(`${def.tab}: missing header "${h}"`);
		}
		if (errors.length > before) continue;

		const nameKey = def.nameColumn && def.columns[def.nameColumn];
		const objects = body
			.filter((r) => r.cells.some((c) => c.value !== undefined))
			.map((r) => ({
				r: r.r,
				obj: Object.fromEntries(
					r.cells
						.filter((c) => keyOf[c.col] && c.value !== undefined)
						.map((c) => [keyOf[c.col], c.value]),
				),
			}));
		const rows = objects.map(({ r, obj }) => ({
			r,
			name:
				nameKey && obj[nameKey] !== undefined
					? String(obj[nameKey])
					: undefined,
		}));
		mapped[key] = { def, colOf, rows };
		raw[key] = def.keyed
			? Object.fromEntries(
					objects.map(({ obj }) => {
						const { [nameKey as string]: name, ...rest } = obj;
						return [name, rest];
					}),
				)
			: objects.map(({ obj }) => obj);
	}

	const parsed = BalanceSchema.safeParse(raw);
	for (const issue of parsed.error?.issues ?? []) {
		const m = mapped[String(issue.path[0])];
		if (!m) continue; // tab already failed on its headers or is missing
		const { def, colOf, rows } = m;
		const nameCol = def.nameColumn && colOf[def.columns[def.nameColumn]];
		const at = (row: { r: number; name?: string }, col?: string) =>
			`${def.tab}!${col ?? nameCol}${row.r}${row.name ? ` (${row.name})` : ""}`;
		if (issue.code === "unrecognized_keys") {
			for (const k of issue.keys) {
				const row = rows.find((r) => r.name === k);
				if (row) errors.push(`${at(row)}: unknown name "${k}"`);
			}
			continue;
		}
		const [, id, field] = issue.path;
		const row =
			typeof id === "number" ? rows[id] : rows.find((r) => r.name === id);
		if (!row) {
			errors.push(`${def.tab}: missing "${String(id)}"`);
			continue;
		}
		errors.push(`${at(row, colOf[String(field)])}: ${issue.message}`);
	}

	if (errors.length || !parsed.success) return { errors };
	return { balance: parsed.data };
}
