/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
    GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useSystemConfig } from "@/hooks/use-system-config";
import { DEFAULT_SYSTEM_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

import AeroShards from "./AeroShards";
import { AeroShardsFallback } from "./AeroShardsFallback";

interface AerisLandingProps {
    className?: string;
}

const SHARD_PROPS = {
    backgroundColor: "#0d0a12",
    shardColor: "#629de8",
    accentColor: "#96beff",
    placement: "full" as const,
    flow: "stream" as const,
    material: "pearl" as const,
    detail: "balanced" as const,
    effect: "none" as const,
    scale: 1,
    spread: 1,
    depth: 1,
    speed: 1,
    spin: 1,
    interaction: "repel" as const,
    density: 1.5,
    shardSize: 1.1,
    stretch: 1,
    turbulence: 1,
    glow: 1,
    edgeSoftness: 2,
    bloom: 0.5,
    grain: 0.05,
    chromaticAberration: 0.0075,
    transitionDuration: 1,
    interactionRadius: 1.5,
    interactionStrength: 0.5,
    rippleIntensity: 1,
    holdToGather: true,
    paused: false,
};

export function AerisLanding(props: AerisLandingProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { systemName } = useSystemConfig();
    const title = systemName || DEFAULT_SYSTEM_NAME;
    const tagline = t("Simplicity is the way. Create the future.");
    const subtitle = t("One studio for frontier image, video, and voice—from idea to finished work.");
    const [useGpu, setUseGpu] = useState(
        () => typeof navigator !== "undefined" && Boolean((navigator as Navigator & { gpu?: unknown }).gpu)
    );

    return (
        <main className={cn("aeris-landing", props.className)}>
            <div className="aeris-media" aria-hidden="true">
                {useGpu ? (
                    <AeroShards
                        className="aeris-shards"
                        {...SHARD_PROPS}
                        onError={() => setUseGpu(false)}
                    />
                ) : (
                    <AeroShardsFallback
                        className="aeris-shards"
                        backgroundColor={SHARD_PROPS.backgroundColor}
                        shardColor={SHARD_PROPS.shardColor}
                        accentColor={SHARD_PROPS.accentColor}
                    />
                )}
                <div className="aeris-veil" />
            </div>
            <div className="aeris-copy">
                <h1>{title}</h1>
                <p className="aeris-tagline">{tagline}</p>
                <p className="aeris-subtitle">{subtitle}</p>
                <div className="aeris-actions">
                    <button className="aeris-enter" type="button" onClick={() => navigate("/canvas")}>
                        {t("Start Creating")}
                    </button>
                </div>
            </div>
        </main>
    );
}
