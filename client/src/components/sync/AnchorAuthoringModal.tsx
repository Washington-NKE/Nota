import { useState, useEffect } from "react";
import type { SyncPoint } from "../../types";
import { formatTime } from "../player/YouTubePlayer";
import { createSyncPoint, deleteSyncPoint, validateSyncMapApi } from "../../services/pieces.service";

interface AnchorAuthoringModalProps {
  recordingId: string;
  scoreId: string;
  currentTimeSec: number;
  initialMeasure?: number | null;
  syncPoints: SyncPoint[];
  isOpen: boolean;
  onClose: () => void;
  onSyncPointsUpdated: (updated: SyncPoint[]) => void;
  onSeek: (seconds: number) => void;
}

export default function AnchorAuthoringModal({
  recordingId,
  scoreId,
  currentTimeSec,
  initialMeasure,
  syncPoints,
  isOpen,
  onClose,
  onSyncPointsUpdated,
  onSeek,
}: AnchorAuthoringModalProps) {
  const [measureInput, setMeasureInput] = useState<string>("");
  const [timestampInput, setTimestampInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (initialMeasure != null) {
      setMeasureInput(String(initialMeasure));
    }
  }, [initialMeasure]);

  useEffect(() => {
    if (isOpen) {
      setTimestampInput(currentTimeSec.toFixed(2));
      handleValidate();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function captureCurrentTime() {
    setTimestampInput(currentTimeSec.toFixed(2));
  }

  async function handleAddOrUpdateAnchor() {
    const measureNumber = parseInt(measureInput, 10);
    const timestampSec = parseFloat(timestampInput);

    if (Number.isNaN(measureNumber) || Number.isNaN(timestampSec)) {
      alert("Please enter valid numbers for both measure and timestamp.");
      return;
    }

    setSaving(true);
    try {
      const savedPoint = await createSyncPoint(recordingId, {
        scoreId,
        measureNumber,
        timestampSec,
      });

      // Update local list
      const updated = [...syncPoints.filter((p) => p.measureNumber !== measureNumber), savedPoint].sort(
        (a, b) => a.timestampSec - b.timestampSec
      );
      onSyncPointsUpdated(updated);
      setMeasureInput("");
      handleValidate(updated);
    } catch (err: any) {
      alert(`Error saving anchor: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pointId: string) {
    if (!confirm("Are you sure you want to delete this anchor point?")) return;
    try {
      await deleteSyncPoint(pointId);
      const updated = syncPoints.filter((p) => p.id !== pointId);
      onSyncPointsUpdated(updated);
      handleValidate(updated);
    } catch (err: any) {
      alert(`Error deleting anchor: ${err.message}`);
    }
  }

  async function handleValidate(pointsList = syncPoints) {
    try {
      const res = await validateSyncMapApi(recordingId);
      setValidationErrors(res.errors || []);
      setValidationWarnings(res.warnings || []);
    } catch {
      // Fallback local validation
      const errs: string[] = [];
      for (let i = 1; i < pointsList.length; i++) {
        if (pointsList[i].timestampSec <= pointsList[i - 1].timestampSec) {
          errs.push(`Timestamps out of order between measures ${pointsList[i - 1].measureNumber} and ${pointsList[i].measureNumber}`);
        }
      }
      setValidationErrors(errs);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-cream rounded-[16px] max-w-2xl w-full p-6 shadow-2xl border border-espresso/15 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-espresso/10">
          <div>
            <h2 className="font-display font-bold text-xl text-espresso">
              Synchronization Map Editor
            </h2>
            <p className="font-body text-xs text-espresso/70 mt-0.5">
              Human-in-the-loop anchor calibration for piece and score alignment
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-espresso/10 text-espresso text-lg flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Anchor Input Form */}
        <div className="bg-white rounded-[12px] p-4 my-4 border border-espresso/10">
          <p className="font-display font-semibold text-sm text-espresso mb-3">Add / Edit Anchor</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block font-body text-xs text-espresso/70 mb-1">
                Score Measure #
              </label>
              <input
                type="number"
                min={1}
                value={measureInput}
                onChange={(e) => setMeasureInput(e.target.value)}
                placeholder="e.g. 1"
                className="w-full bg-cream border border-espresso/20 rounded-lg px-3 py-1.5 font-body text-sm text-espresso focus:outline-none focus:border-espresso"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-body text-xs text-espresso/70">Timestamp (s)</label>
                <button
                  onClick={captureCurrentTime}
                  className="text-[11px] font-medium text-tan hover:underline"
                >
                  Capture ({formatTime(currentTimeSec)})
                </button>
              </div>
              <input
                type="number"
                step={0.1}
                min={0}
                value={timestampInput}
                onChange={(e) => setTimestampInput(e.target.value)}
                placeholder="e.g. 18.5"
                className="w-full bg-cream border border-espresso/20 rounded-lg px-3 py-1.5 font-body text-sm text-espresso focus:outline-none focus:border-espresso"
              />
            </div>

            <button
              onClick={handleAddOrUpdateAnchor}
              disabled={saving || !measureInput || !timestampInput}
              className="bg-espresso text-white rounded-pill px-4 py-2 font-display text-sm font-semibold hover:bg-espresso/90 disabled:opacity-40 transition"
            >
              {saving ? "Saving…" : "Save Anchor"}
            </button>
          </div>
        </div>

        {/* Validation Status */}
        {validationErrors.length > 0 && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <p className="font-semibold mb-1">Validation Errors:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {validationWarnings.length > 0 && validationErrors.length === 0 && (
          <div className="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <span className="font-medium">Notice:</span> {validationWarnings[0]}
          </div>
        )}

        {/* Existing Anchors Table */}
        <div className="flex-1 overflow-auto border border-espresso/10 rounded-[12px] bg-white">
          <table className="w-full text-left text-xs font-body">
            <thead className="bg-cream sticky top-0 border-b border-espresso/10 font-display font-semibold text-espresso">
              <tr>
                <th className="p-2.5">Measure</th>
                <th className="p-2.5">Timestamp</th>
                <th className="p-2.5">Formatted</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-espresso/5">
              {syncPoints.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-espresso/40">
                    No synchronization anchors yet. Add anchors to enable measure interpolation.
                  </td>
                </tr>
              ) : (
                syncPoints.map((p) => (
                  <tr key={p.id} className="hover:bg-cream/40 transition">
                    <td className="p-2.5 font-medium text-espresso">Bar {p.measureNumber}</td>
                    <td className="p-2.5 font-mono text-espresso/80">{p.timestampSec.toFixed(2)}s</td>
                    <td className="p-2.5 font-mono text-espresso/80">{formatTime(p.timestampSec)}</td>
                    <td className="p-2.5 text-right space-x-2">
                      <button
                        onClick={() => onSeek(p.timestampSec)}
                        className="text-tan hover:underline font-medium"
                      >
                        Seek
                      </button>
                      <button
                        onClick={() => {
                          setMeasureInput(String(p.measureNumber));
                          setTimestampInput(p.timestampSec.toFixed(2));
                        }}
                        className="text-espresso hover:underline font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 mt-3 border-t border-espresso/10">
          <span className="font-body text-xs text-espresso/60">
            {syncPoints.length} verified anchors in map
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-pill bg-espresso text-white font-display text-sm font-semibold hover:bg-espresso/90 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
