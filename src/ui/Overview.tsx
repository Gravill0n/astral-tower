// Overview (GDD 12.3): the clock strip (3.5) and, in the right panel (below on
// mobile), Coming up. Needs you and the module cards arrive with Task 11.

import type { Phase } from "../core/clock.ts";
import { balance } from "../data/index.ts";
import { formatDuration, formatNumber, type NumberFormat } from "./format.ts";
import { useGame } from "./Shell.tsx";

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
