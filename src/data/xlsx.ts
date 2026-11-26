// Minimal .xlsx reader: cached cell values only, never recalculates.
// Unzip via fflate (https://github.com/101arrowz/fflate#usage); the XML is
// simple and generated, so regexes are enough.
import { strFromU8, unzipSync } from "fflate";

export type CellValue = string | number | boolean | undefined;
export type Cell = { ref: string; col: string; value: CellValue };
export type Row = { r: number; cells: Cell[] };
export type Sheet = { name: string; rows: Row[] };

const ENTITIES: Record<string, string> = {
	lt: "<",
	gt: ">",
	amp: "&",
	quot: '"',
	apos: "'",
};

function decode(text: string): string {
	return text.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e: string) => {
		if (e[0] !== "#") return ENTITIES[e] ?? m;
		return String.fromCodePoint(
			e[1] === "x" ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1)),
		);
	});
}

function attr(tag: string, name: string): string | undefined {
	const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
	return m ? decode(m[1]) : undefined;
}

// Text of a <si> or <is>: every <t> joined (rich-text runs), phonetic runs dropped.
function text(xml: string): string {
	return [
		...xml
			.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "")
			.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g),
	]
		.map((m) => decode(m[1] ?? ""))
		.join("");
}

export function readXlsx(bytes: Uint8Array): Sheet[] {
	const files = unzipSync(bytes);
	const read = (path: string): string => {
		const file = files[path];
		if (!file) throw new Error(`xlsx: missing ${path}`);
		return strFromU8(file);
	};

	const targets = new Map<string, string>();
	let sharedPath: string | undefined;
	for (const [tag] of read("xl/_rels/workbook.xml.rels").matchAll(
		/<Relationship\b[^>]*>/g,
	)) {
		const target = attr(tag, "Target") ?? "";
		const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
		targets.set(attr(tag, "Id") ?? "", path);
		if (attr(tag, "Type")?.endsWith("/sharedStrings")) sharedPath = path;
	}

	const shared = sharedPath
		? [
				...read(sharedPath).matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g),
			].map((m) => text(m[1] ?? ""))
		: [];

	return [...read("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map(
		([tag]) => {
			const name = attr(tag, "name") ?? "";
			const path = targets.get(attr(tag, "r:id") ?? "");
			if (!path) throw new Error(`xlsx: no worksheet for tab ${name}`);
			const rows: Row[] = [];
			for (const [, rowAttrs, rowXml = ""] of read(path).matchAll(
				/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g,
			)) {
				const cells: Cell[] = [];
				for (const [, cellAttrs, xml = ""] of rowXml.matchAll(
					/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
				)) {
					const ref = attr(cellAttrs, "r") ?? "";
					const col = ref.match(/^[A-Z]+/)?.[0];
					if (!col)
						throw new Error(`${name}: cell without a valid ref "${ref}"`);
					cells.push({
						ref,
						col,
						value: cellValue(`${name}!${ref}`, cellAttrs, xml, shared),
					});
				}
				rows.push({ r: Number(attr(rowAttrs, "r")), cells });
			}
			return { name, rows };
		},
	);
}

function cellValue(
	where: string,
	attrs: string,
	xml: string,
	shared: string[],
): CellValue {
	const type = attr(attrs, "t") ?? "n";
	if (type === "inlineStr") {
		return (
			text(xml.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? "") || undefined
		);
	}
	const v = xml.match(/<v\b[^>]*?(?:\/>|>([\s\S]*?)<\/v>)/);
	if (!v) {
		if (/<f\b/.test(xml))
			throw new Error(`${where}: formula has no cached value`);
		return undefined;
	}
	const raw = decode(v[1] ?? "");
	if (raw === "") return undefined;
	switch (type) {
		case "s": {
			const s = shared[Number(raw)];
			if (s === undefined)
				throw new Error(`${where}: unknown shared string ${raw}`);
			return s || undefined;
		}
		case "str":
			return raw;
		case "b":
			return raw === "1";
		case "n":
			return Number(raw);
		default:
			throw new Error(`${where}: unsupported cell type "${type}"`);
	}
}
