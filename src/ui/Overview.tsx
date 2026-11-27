// Overview (GDD 12.3): the clock strip (3.5), Needs you, the module cards and,
// in the right panel (below on mobile), Coming up.

import { Link } from "@tanstack/react-router";
import type { Phase } from "../core/clock.ts";
import type { Screen } from "../core/view.ts";
import { balance } from "../data/index.ts";
import {
	formatDuration,
	formatNumber,
	formatRate,
	type NumberFormat,
} from "./format.ts";
import { SCREENS, useGame } from "./Shell.tsx";

// The phase effect from its Clock-tab row, e.g. "Bigger harvests: … +50%".
const effect = (p: Phase, format: NumberFormat) =>
	`${p.bonus}: ${p.appliesTo} +${formatNumber(p.value * 100, format)}%`;

// "The " is hidden on mobile, so the strip shows short labels (GDD 12.1 mobile).
const Name = ({ p }: { p: Phase }) => {
	const short = p.constellation.replace(/^The /, "");
	return (
		<strong>
			{short !== p.constellation && <span className="long">The </span>}
			{short}
		</strong>
	);
};

// Module cards (GDD 12.3 table): two key numbers each. Only the Foundry's are
// live in M3; the rest show "—" until their module's milestone fills them.
const KEYS: Partial<Record<Screen, [string, string]>> = {
	foundry: ["Mana net", "Bottleneck"],
	gardens: ["Food net", "Ripe beds"],
	guild: ["Next ship back", "Ships docked"],
	library: ["Study left", "Relics ready"],
	bestiary: ["Familiars", "Next egg"],
	supernova: ["Stardust if you go now", "Toward the Galaxy map"],
};

const ModuleCards = () => {
	const { nav, mana } = useGame((s) => s.view);
	const format = useGame((s) => s.prefs.numberFormat);
	const n = (x: number) => formatNumber(x, format);
	const live: Partial<Record<Screen, { values: string[]; line: string }>> = {
		foundry: {
			values: [formatRate(mana.net, format, "s"), "—"],
			line: `${n(mana.made)} made · ${n(mana.drawn)} drawn`,
		},
	};
	return (
		<ul className="modules" aria-label="Modules at a glance">
			{SCREENS.map((s) => {
				const keys = KEYS[s.screen];
				if (!keys || nav[s.screen].status !== "open") return null;
				const card = live[s.screen];
				return (
					<li key={s.screen}>
						<Link to={s.path} className="card module">
							<h3>{s.title} ›</h3>
							<dl>
								{keys.map((k, i) => (
									<div key={k}>
										<dt>{k}</dt>
										<dd>{card?.values[i] ?? "—"}</dd>
									</div>
								))}
							</dl>
							{card && <small>{card.line}</small>}
						</Link>
					</li>
				);
			})}
		</ul>
	);
};

export const Overview = () => {
	const { clock, comingUp } = useGame((s) => s.view);
	const format = useGame((s) => s.prefs.numberFormat);
	return (
		<div className="overview">
			<div className="overview-main">
				<h1>Overview</h1>
				<section className="card strip" aria-label="Constellation clock">
					<p className="strip-now">
						{clock.phase.constellation} · {formatDuration(clock.leftS)} left
					</p>
					<p>{effect(clock.phase, format)}</p>
					<p>Next: {clock.next.constellation}</p>
					<ol className="phases">
						{balance.clock.map((p) => (
							<li
								key={p.constellation}
								aria-current={p === clock.phase || undefined}
							>
								<Name p={p} />
								<small>{p.bonus}</small>
							</li>
						))}
					</ol>
				</section>
				{/* M3 produces none of the GDD 12.3 item types, so the list is always
				    empty; the mobile cap of 4 and "See all" come with the first item. */}
				<section className="card needs" aria-labelledby="needs-you">
					<h2 id="needs-you">
						Needs you <small>0 things</small>
					</h2>
					<p>Nothing needs you right now. The tower runs on its own.</p>
				</section>
				<ModuleCards />
			</div>
			<aside className="card panel" aria-labelledby="coming-up">
				<h2 id="coming-up">Coming up</h2>
				<ol className="coming-up">
					{comingUp.map((u) => (
						<li key={u.phase.constellation}>
							<span className="when">{formatDuration(u.inS)}</span>
							<span>
								{u.phase.constellation}
								<small>{effect(u.phase, format)}</small>
							</span>
						</li>
					))}
				</ol>
			</aside>
		</div>
	);
};
