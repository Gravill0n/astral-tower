// Sheets → Balance, or every error found, each addressed as `Tab!Cell (row name)`.
import { type Balance, BalanceSchema, TABS, type TabDef } from "./schema.ts";
import { parseUnlock, type UnlockNames } from "./unlock.ts";
import type { CellValue, Sheet } from "./xlsx.ts";

// Raw values under a header, one per data row, empty cells kept as undefined
// (no type checks: used before Zod).
function column(sheet: Sheet | undefined, header: string): CellValue[] {
	const col = sheet?.rows[0]?.cells.find((c) => c.value === header)?.col;
	if (!sheet || !col) return [];
	return sheet.rows
		.slice(1)
		.map((r) => r.cells.find((c) => c.col === col)?.value);
}

// Name sets for the unlock parser (GDD 13), from each tab's raw name column.
export function unlockNames(sheets: Sheet[]): UnlockNames {
	const tab = (name: string) => sheets.find((s) => s.name === name);
	const set = (name: string, header: string) =>
		new Set(
			column(tab(name), header)
				.filter((v) => v !== undefined)
				.map(String),
		);
	const resources = tab("Resources");
	const tiers = column(resources, "Tier");
	return {
		buildings: set("Buildings", "Building"),
		resources: set("Resources", "Resource"),
		crops: new Set(
			column(resources, "Resource")
				.filter((v, i) => v !== undefined && tiers[i] === "Crop")
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
		if (kind === "perLevel" && v !== undefined) {
			const hit = /^\+(\d+(?:\.\d+)?)(?: (Safety)|% (speed))$/.exec(String(v));
			if (hit) {
				obj[key] = hit[2]
					? { stat: "safety", value: Number(hit[1]) }
					: { stat: "speed", value: Number(hit[1]) / 100 };
			} else {
				errors.push(
					`${m.at(row, m.colOf[key])}: unknown Per level "${v}" (expected "+N Safety" or "+N% speed")`,
				);
				row.failed.add(key);
			}
		}
		if (kind === "numberList" && v !== undefined) {
			if (/^\d+(?:, \d+)*$/.test(String(v))) {
				obj[key] = String(v).split(", ").map(Number);
			} else {
				errors.push(
					`${m.at(row, m.colOf[key])}: bad Links to "${v}" (expected "n, n, …")`,
				);
				row.failed.add(key);
			}
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
	const defined = Object.values(TABS).map((d) => d.tab as string);
	for (const s of sheets) {
		if (!defined.includes(s.name)) errors.push(`unknown tab "${s.name}"`);
	}

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

		const nameKeys = [def.nameColumn ?? []].flat().map((h) => def.columns[h]);
		const nameKey = nameKeys[0];
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
		// No name column (Contracts, Stardust gain): fall back to the first column.
		const nameCol = (nameKey && colOf[nameKey]) || header?.cells[0]?.col;
		const m: Mapped = {
			colOf,
			rows: [],
			at: (row, col) =>
				`${def.tab}!${col ?? nameCol}${row.r}${row.name ? ` (${row.name})` : ""}`,
		};
		const firstRow = new Map<string, number>(); // name → first sheet row (GDD 13)
		for (const { r, obj } of objects) {
			const parts = nameKeys.map((k) => obj[k]).filter((v) => v !== undefined);
			const name = parts.length ? parts.join(" / ") : undefined;
			const row: MappedRow = { r, name, cols: {}, failed: new Set() };
			if (def.nameColumn && name === undefined) {
				errors.push(
					`${m.at(row)}: missing "${[def.nameColumn].flat().join('" / "')}"`,
				);
				for (const k of nameKeys) row.failed.add(k);
			}
			if (def.nameColumn && name !== undefined) {
				const first = firstRow.get(name);
				if (first)
					errors.push(`${m.at(row)}: duplicate name (first on row ${first})`);
				else firstRow.set(name, r);
			}
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

	// Never fail without saying why (an issue no row could be matched to).
	if (!parsed.success && !errors.length)
		for (const i of parsed.error.issues)
			errors.push(`${i.path.join(".")}: ${i.message}`);
	if (errors.length || !parsed.success) return { errors };
	const refErrors = crossRefs(parsed.data, mapped);
	return refErrors.length ? { errors: refErrors } : { balance: parsed.data };
}

// References between tabs (GDD 2, 10.5–10.6), on parsed data whose rows line up
// with the mapped rows. `field` is the row key, or a path inside a pair.
function crossRefs(b: Balance, mapped: Record<string, Mapped>): string[] {
	const errors: string[] = [];
	const fail = (tab: keyof Balance, i: number, field: string, msg: string) => {
		const m = mapped[tab];
		const row = m.rows[i];
		errors.push(`${m.at(row, row.cols[field] ?? m.colOf[field])}: ${msg}`);
	};
	const check = (
		tab: keyof Balance,
		i: number,
		field: string,
		value: string | undefined,
		set: Set<string>,
		what: string,
	) => {
		if (value !== undefined && !set.has(value))
			fail(tab, i, field, `unknown ${what} "${value}"`);
	};
	const resources = new Set(b.resources.map((r) => r.resource));
	const pairs = (
		tab: keyof Balance,
		rows: Record<string, unknown>[],
		key: string,
	) =>
		rows.forEach((row, i) => {
			(row[key] as { resource: string }[]).forEach((p, j) => {
				check(
					tab,
					i,
					`${key}.${j}.resource`,
					p.resource,
					resources,
					"resource",
				);
			});
		});

	const buildings = new Set(b.buildings.map((x) => x.building));
	b.recipes.forEach((x, i) => {
		check("recipes", i, "building", x.building, buildings, "building");
		if (x.output !== "Mana")
			check("recipes", i, "output", x.output, resources, "resource");
	});
	pairs("recipes", b.recipes, "inputs");
	pairs("recipes", b.recipes, "byproducts");
	pairs("buildings", b.buildings, "costs");
	b.upgrades.forEach((x, i) => {
		check("upgrades", i, "cost", x.cost, resources, "resource");
	});
	pairs("ships", b.ships, "costs");
	pairs("voyages", b.voyages, "loot");
	pairs("crops", b.crops, "seeds");
	b.familiars.forEach((x, i) => {
		check("familiars", i, "feed", x.feed, resources, "resource");
	});
	b.contracts.forEach((x, i) => {
		check("contracts", i, "goodAsked", x.goodAsked, resources, "resource");
		check("contracts", i, "reward", x.reward, resources, "resource");
	});

	const clock = new Set(b.clock.map((x) => x.constellation));
	const underClock = new Set([...clock, "Any"]);
	b.crops.forEach((x, i) => {
		check("crops", i, "crop", x.crop, resources, "resource");
		check("crops", i, "sowUnder", x.sowUnder, underClock, "constellation");
		check(
			"crops",
			i,
			"harvestUnder",
			x.harvestUnder,
			underClock,
			"constellation",
		);
	});
	const familiars = new Set(b.familiars.map((x) => x.species));
	const voyages = new Set(b.voyages.map((x) => x.nebula));
	b.clock.forEach((x, i) => {
		check("clock", i, "breedsFaster", x.breedsFaster, familiars, "familiar");
		check("clock", i, "currentTo", x.currentTo, voyages, "voyage");
	});
	b.gear.forEach((x, i) => {
		if (x.kind === "Companion")
			check("gear", i, "name", x.name, familiars, "familiar");
		if (x.kind === "Gear")
			check("gear", i, "name", x.name, resources, "resource");
	});

	// The Library's Clock-kind constellations are exactly the Clock tab's.
	const libraryClock = new Set(
		b.library.filter((x) => x.kind === "Clock").map((x) => x.constellation),
	);
	b.clock.forEach((x, i) => {
		if (!libraryClock.has(x.constellation))
			fail(
				"clock",
				i,
				"constellation",
				"missing from the Library Clock constellations",
			);
	});
	b.library.forEach((x, i) => {
		if (x.kind === "Clock" && !clock.has(x.constellation))
			fail(
				"library",
				i,
				"constellation",
				"Clock constellation not on the Clock tab",
			);
	});

	// Picked by: captain first names ("Pell" from "Pell the Cautious").
	const pickers = new Set([
		...b.gear
			.filter((x) => x.kind === "Captain")
			.map((x) => x.name.split(" ")[0]),
		"third captain",
	]);
	b.events.forEach((x, i) => {
		for (const token of x.pickedBy.split(", "))
			check("events", i, "pickedBy", token, pickers, "captain");
	});

	const optional = b.trials
		.filter((x) => x.kind === "Optional")
		.map((x) => x.trial);
	b.trials.forEach((x, i) => {
		if (
			x.kind === "Dim star" &&
			!optional.some((p) => optional.some((q) => x.rule === `${p} and ${q}`))
		)
			fail(
				"trials",
				i,
				"rule",
				`Dim star rule "${x.rule}" is not "<Optional trial> and <Optional trial>"`,
			);
	});

	const types = new Set([...b.stars.map((x) => x.star), "Dim"]);
	const trials = new Map(b.trials.map((x) => [x.trial, x.kind]));
	const links = new Map(b.galaxy.map((x) => [x.star, x.linksTo]));
	b.galaxy.forEach((x, i) => {
		check("galaxy", i, "type", x.type, types, "star type");
		const kind = x.trial === undefined ? undefined : trials.get(x.trial);
		if (x.trial !== undefined && !kind)
			fail("galaxy", i, "trial", `unknown trial "${x.trial}"`);
		else if (x.dim ? kind !== "Dim star" : kind === "Dim star")
			fail(
				"galaxy",
				i,
				"trial",
				x.dim
					? `a Dim star needs a Dim star trial, not "${x.trial ?? ""}"`
					: `only a Dim star takes a Dim star trial ("${x.trial}")`,
			);
		for (const n of x.linksTo) {
			const back = links.get(n);
			if (!back)
				fail("galaxy", i, "linksTo", `links to ${n}, which is not a star`);
			else if (!back.includes(x.star))
				fail("galaxy", i, "linksTo", `links to ${n}, which does not link back`);
		}
	});
	return errors;
}
