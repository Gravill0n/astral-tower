// Settings (GDD 12.5): number format and credits. Save tools arrive in M11 (11.3).

import type { Prefs } from "../game.ts";
import { formatNumber, NUMBER_FORMATS, type NumberFormat } from "./format.ts";
import { useGame } from "./Shell.tsx";

const LABELS: Record<NumberFormat, string> = {
	short: "K / M / B",
	scientific: "Scientific",
	engineering: "Engineering",
	letters: "Letters",
};

// Display samples only, not balance values.
const SAMPLES = [1_234, 1_230_000, 45_600_000_000, 7.89e15];

const isFormat = (v: string): v is NumberFormat =>
	(NUMBER_FORMATS as readonly string[]).includes(v);

export const Settings = ({
	setPrefs,
}: {
	setPrefs: (prefs: Prefs) => void;
}) => {
	const prefs = useGame((s) => s.prefs);
	const format = prefs.numberFormat;
	return (
		<>
			<h1>Settings</h1>
			<section className="card settings" aria-labelledby="format-heading">
				<h2 id="format-heading">Number format</h2>
				<label className="field">
					<span>Show large numbers as</span>
					<select
						value={format}
						onChange={(e) => {
							const v = e.target.value;
							if (isFormat(v)) setPrefs({ ...prefs, numberFormat: v });
						}}
					>
						{NUMBER_FORMATS.map((f) => (
							<option key={f} value={f}>
								{LABELS[f]}
							</option>
						))}
					</select>
				</label>
				<output aria-label="Preview" className="preview">
					{SAMPLES.map((x) => formatNumber(x, format)).join(" · ")}
				</output>
			</section>
			<section className="card settings" aria-labelledby="credits-heading">
				<h2 id="credits-heading">Credits</h2>
				<p>
					Icons by Lorc and Delapouite from{" "}
					<a href="https://game-icons.net/" target="_blank" rel="noreferrer">
						game-icons.net
					</a>
					, under{" "}
					<a
						href="https://creativecommons.org/licenses/by/3.0/"
						target="_blank"
						rel="noreferrer"
					>
						CC BY 3.0
					</a>
					.
				</p>
				<p>
					Starfield by{" "}
					<a href="https://kenney.nl/" target="_blank" rel="noreferrer">
						Kenney
					</a>
					, under CC0 1.0.
				</p>
				<p>
					Cinzel and Spectral fonts, under the{" "}
					<a
						href="https://openfontlicense.org/"
						target="_blank"
						rel="noreferrer"
					>
						SIL Open Font License 1.1
					</a>
					.
				</p>
			</section>
		</>
	);
};
