// Display-only number formats (GDD 12.5). About 3 significant digits,
// trailing zeros trimmed; values below 1 000 read the same in every mode.

export const NUMBER_FORMATS = [
	"short",
	"scientific",
	"engineering",
	"letters",
] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

const SHORT = [
	"",
	"K",
	"M",
	"B",
	"T",
	"Qa",
	"Qi",
	"Sx",
	"Sp",
	"Oc",
	"No",
	"Dc",
];
const LETTERS = SHORT.slice(0, 5); // K M B T, then aa (1e15), ab (1e18)…

const sig3 = (x: number) => String(Number(x.toPrecision(3)));

function letters(group: number): string {
	if (group < LETTERS.length) return LETTERS[group];
	const k = group - LETTERS.length;
	return String.fromCharCode(97 + Math.floor(k / 26), 97 + (k % 26));
}

export function formatNumber(n: number, mode: NumberFormat): string {
	if (!Number.isFinite(n)) return "—";
	// toExponential rounds first, so 999.95 becomes 1.00e+3 and rolls over.
	const [m, e] = Math.abs(n).toExponential(2).split("e");
	if (Number(m) === 0) return "0"; // also covers -0
	const sign = n < 0 ? "-" : "";
	const exp = Number(e);
	if (exp < 3) return sign + sig3(Math.abs(n));
	const mant = (shift: number) => sig3(Number(m) * 10 ** shift);
	const group = Math.floor(exp / 3);
	if (mode === "short" && group < SHORT.length)
		return sign + mant(exp % 3) + SHORT[group];
	if (mode === "letters") return sign + mant(exp % 3) + letters(group);
	if (mode === "engineering") return `${sign}${mant(exp % 3)}e${group * 3}`;
	return `${sign}${mant(0)}e${exp}`;
}

export function formatRate(
	n: number,
	mode: NumberFormat,
	unit: string,
): string {
	const s = formatNumber(n, mode);
	return `${s === "—" || s.startsWith("-") ? "" : "+"}${s}/${unit}`;
}

export function formatDuration(seconds: number): string {
	const t = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
	const h = Math.floor(t / 3600);
	const mm = Math.floor((t % 3600) / 60);
	const ss = String(t % 60).padStart(2, "0");
	return h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}
