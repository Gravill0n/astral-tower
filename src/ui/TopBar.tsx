// Top bar (GDD 12.1): the brand and four live figures, mana (3.3),
// apprentices (3.4), floor space (4.1) and the constellation clock (3.5).

import type { ReactNode } from "react";
import { formatDuration, formatNumber, formatRate } from "./format.ts";
import {
	crystalGrowth,
	Icon,
	pointyHat,
	stairs3d,
	ursaMajor,
	whiteTower,
} from "./icons.tsx";
import { useGame } from "./Shell.tsx";

// ponytail: fixed until Task 9 reads the number format from the store.
const format = "short";
const n = (x: number) => formatNumber(x, format);

const Chip = (p: {
	name: string;
	icon: string;
	tone: string;
	label: ReactNode;
	value: ReactNode;
	detail: string;
}) => (
	// biome-ignore lint/a11y/useSemanticElements: a named figure, not a form fieldset
	<div role="group" aria-label={p.name} className="chip">
		<span className={p.tone}>
			<Icon d={p.icon} />
		</span>
		<span className="chip-text">
			<span className="chip-label">{p.label}</span>
			<span className="chip-value">
				{p.value} <small>{p.detail}</small>
			</span>
		</span>
	</div>
);

// Mobile (GDD 12.1): the same figure, short form. CSS shows one set or the other.
const Mini = (p: {
	name: string;
	icon: string;
	tone: string;
	value: ReactNode;
}) => (
	// biome-ignore lint/a11y/useSemanticElements: a named figure, not a form fieldset
	<div role="group" aria-label={p.name} className="mini">
		<span className={p.tone}>
			<Icon d={p.icon} />
		</span>
		<span>{p.value}</span>
	</div>
);

export const TopBar = () => {
	const { mana, apprentices, space, clock } = useGame((s) => s.view);
	const rate = (
		<span className={mana.short ? "loss" : undefined}>
			{formatRate(mana.net, format, "s")}
		</span>
	);
	return (
		<header className="topbar">
			<span className="brand">
				<Icon d={whiteTower} />
				Astral Tower
			</span>
			<Chip
				name="Mana"
				icon={crystalGrowth}
				tone="gold"
				// Shortage: --loss plus a word, never colour alone (GDD 3.3).
				label={mana.short ? "Mana · short" : "Mana"}
				value={rate}
				detail={`${n(mana.made)} made · ${n(mana.drawn)} drawn`}
			/>
			<Chip
				name="Apprentices"
				icon={pointyHat}
				tone="coral"
				label="Apprentices"
				value={n(apprentices.free)}
				detail={`of ${n(apprentices.needed)} needed`}
			/>
			<Chip
				name="Floor space"
				icon={stairs3d}
				tone="lilac"
				label="Floor space"
				value={`${n(space.used)} / ${n(space.total)}`}
				detail={`${space.floors} ${space.floors === 1 ? "floor" : "floors"}`}
			/>
			<Chip
				name="Constellation"
				icon={ursaMajor}
				tone="teal"
				label={clock.phase.constellation}
				value={formatDuration(clock.leftS)}
				detail={`left · ${clock.next.constellation} next`}
			/>
			<Mini
				name="Constellation"
				icon={ursaMajor}
				tone="teal"
				value={`${clock.phase.constellation} · ${formatDuration(clock.leftS)}`}
			/>
			<div className="minis">
				<Mini
					name="Mana"
					icon={crystalGrowth}
					tone="gold"
					value={mana.short ? <>{rate} short</> : rate}
				/>
				<Mini
					name="Apprentices"
					icon={pointyHat}
					tone="coral"
					value={`${n(apprentices.free)}/${n(apprentices.needed)}`}
				/>
				<Mini
					name="Floor space"
					icon={stairs3d}
					tone="lilac"
					value={`${n(space.used)}/${n(space.total)}`}
				/>
			</div>
		</header>
	);
};
