// Sheets → Balance, or every error found, each addressed as `Tab!Cell (row name)`.
import { type Balance, BalanceSchema, TABS, type TabDef } from "./schema.ts";
import { parseUnlock, type UnlockNames } from "./unlock.ts";
import type { CellValue, Sheet } from "./xlsx.ts";

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

type MappedRow = {
	r: number;
	name?: string;
	cols: Record<string, string>; // issue path inside a pair ("costs.0.qty") → column letter
	failed: Set<string>; // row keys whose conversion already reported an error
};

type Mapped = {
	colOf: Record<string, string>; // row key or pair header → column letter
	rows: MappedRow[]; // in sheet order
	at: (row: MappedRow, col?: string) => string;
};

// Pairs → arrays and per-column conversions, in place, before Zod.
function convertRow(
	def: TabDef,
	obj: Record<string, unknown>,
	row: MappedRow,
	m: Mapped,
	names: UnlockNames,
	errors: string[],
) {
	for (const [key, slots] of Object.entries(def.pairs ?? {})) {
		const list: unknown[] = [];
		for (const [a, b] of slots) {
			const resource = obj[a];
			const qty = obj[b];
			delete obj[a];
			delete obj[b];
			if (resource === undefined && qty === undefined) continue;
			if (resource === undefined || qty === undefined) {
				const [set, empty] = resource === undefined ? [b, a] : [a, b];
				errors.push(
					`${m.at(row, m.colOf[empty])}: half a pair: "${set}" is set but "${empty}" is empty`,
				);
				continue;
			}
			row.cols[`${key}.${list.length}.resource`] = m.colOf[a];
			row.cols[`${key}.${list.length}.qty`] = m.colOf[b];
			list.push({ resource, qty });
		}
		obj[key] = list;
	}
	for (const [key, kind] of Object.entries(def.convert ?? {})) {
		const v = obj[key];
		if (kind === "yesNo" && (v === "Yes" || v === "No")) obj[key] = v === "Yes";
		if (kind === "unlock" && typeof v === "string") {
			const parsed = parseUnlock(v, names);
			if ("error" in parsed) {
				errors.push(`${m.at(row, m.colOf[key])}: ${parsed.error}`);
				row.failed.add(key);
			} else obj[key] = parsed;
		}
	}
}

export function buildBalance(
	sheets: Sheet[],
): { balance: Balance } | { errors: string[] } {
	const errors: string[] = [];
	const raw: Record<string, unknown> = {};
	const mapped: Record<string, Mapped> = {};
	const names = unlockNames(sheets);

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
		const pairHeaders = Object.values(def.pairs ?? {}).flat(2);
		for (const c of header?.cells ?? []) {
			if (c.value === undefined) continue;
			const h = String(c.value);
			const k = def.columns[h] ?? (pairHeaders.includes(h) ? h : undefined);
			if (k) {
				colOf[k] = c.col;
				keyOf[c.col] = k;
			} else if (!def.ignore?.includes(String(c.value))) {
				errors.push(`${def.tab}!${c.ref}: unknown header "${c.value}"`);
			}
		}
		for (const [h, k] of [
			...Object.entries(def.columns),
			...pairHeaders.map((h) => [h, h]),
		]) {
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
		const nameCol = nameKey && colOf[nameKey];
		const m: Mapped = {
			colOf,
			rows: [],
			at: (row, col) =>
				`${def.tab}!${col ?? nameCol}${row.r}${row.name ? ` (${row.name})` : ""}`,
		};
		for (const { r, obj } of objects) {
			const name =
				nameKey && obj[nameKey] !== undefined
					? String(obj[nameKey])
					: undefined;
			const row: MappedRow = { r, name, cols: {}, failed: new Set() };
			convertRow(def, obj, row, m, names, errors);
			m.rows.push(row);
		}
		mapped[key] = m;
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
		const { colOf, rows, at } = m;
		if (issue.code === "unrecognized_keys") {
			for (const k of issue.keys) {
				const row = rows.find((r) => r.name === k);
				if (row) errors.push(`${at(row)}: unknown name "${k}"`);
			}
			continue;
		}
		const [tab, id, field, ...inside] = issue.path;
		const row =
			typeof id === "number" ? rows[id] : rows.find((r) => r.name === id);
		if (!row) {
			errors.push(
				`${TABS[tab as keyof typeof TABS].tab}: missing "${String(id)}"`,
			);
			continue;
		}
		if (row.failed.has(String(field))) continue;
		const col = row.cols[[field, ...inside].join(".")] ?? colOf[String(field)];
		errors.push(`${at(row, col)}: ${issue.message}`);
	}

	if (errors.length || !parsed.success) return { errors };
	return { balance: parsed.data };
}
