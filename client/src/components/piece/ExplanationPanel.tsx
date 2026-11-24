import { useLevel } from "../../context/LevelContext";
import type { Annotation } from "../../types";

interface ExplanationPanelProps {
  text?: string | null;
  loading?: boolean;
  section?: string | null;
  subsection?: string | null;
  activeMeasure?: number | null;
  annotations?: Annotation[];
  currentTimeSec?: number;
}

export default function ExplanationPanel({
  text: explicitText,
  loading = false,
  section,
  subsection,
  activeMeasure,
  annotations = [],
  currentTimeSec = 0,
}: ExplanationPanelProps) {
  const { level } = useLevel();

  // Determine active annotation if text is not passed directly
  let displayText = explicitText;
  let displaySection = section;
  let displaySubsection = subsection;

  if (displayText == null && annotations.length > 0) {
    const active = [...annotations]
      .filter((a) => (a.startTimestampSec ?? 0) <= currentTimeSec)
      .sort((a, b) => (b.startTimestampSec ?? 0) - (a.startTimestampSec ?? 0))[0];

    if (active) {
      displayText = active.text;
      displaySection = active.section ?? displaySection;
      displaySubsection = active.subsection ?? displaySubsection;
    }
  }

  return (
    <div className="card-surface p-6 min-h-[140px] flex flex-col justify-between border border-espresso/10 transition-all duration-200">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-espresso/5">
          <div className="flex items-center gap-2">
            <span className="font-display text-xs font-bold text-tan uppercase tracking-wide">
              {level === "seasoned" ? "Expert Analysis" : "Layman Guide"}
            </span>
            {displaySection && (
              <span className="font-body text-xs text-espresso/70 bg-cream px-2.5 py-0.5 rounded-full font-medium">
                {displaySection}
              </span>
            )}
            {displaySubsection && (
              <span className="font-body text-xs text-espresso/60 italic">
                {displaySubsection}
              </span>
            )}
          </div>

          {activeMeasure != null && (
            <span className="font-mono text-xs font-semibold text-espresso/70 bg-cream/70 px-2 py-0.5 rounded">
              Bar {activeMeasure}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-espresso/50">
            <div className="w-4 h-4 border-2 border-tan border-t-transparent rounded-full animate-spin" />
            <span className="font-body text-sm">Synchronizing analysis…</span>
          </div>
        ) : displayText ? (
          <p className="font-body text-lg text-espresso leading-relaxed">
            {displayText}
          </p>
        ) : (
          <div className="py-4 text-espresso/45 font-body text-base italic">
            Play the performance to follow synchronized analytical commentary in real time.
          </div>
        )}
      </div>

      <div className="mt-3 pt-2 text-right">
        <span className="font-body text-[11px] text-espresso/40">
          Switch between Beginner and Seasoned above to change musical depth without pausing
        </span>
      </div>
    </div>
  );
}
