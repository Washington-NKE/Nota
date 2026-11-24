import { useState } from "react";
import type { AnnotationTrack } from "../../types";
import { previewTimestampImport, commitTimestampImport } from "../../services/pieces.service";

interface TimestampImportModalProps {
  recordingId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function TimestampImportModal({
  recordingId,
  isOpen,
  onClose,
}: TimestampImportModalProps) {
  const [content, setContent] = useState("");
  const [track, setTrack] = useState<AnnotationTrack>("expert");
  const [preview, setPreview] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handlePreview() {
    if (!content.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      setPreview(await previewTimestampImport(recordingId, content));
    } catch (err: any) {
      setMessage(err?.response?.data?.message || err.message || "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!content.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await commitTimestampImport(recordingId, content, track);
      setMessage(
        result.alreadyImported
          ? "This source has already been imported for this track."
          : `Imported ${result.importedCount} annotations.`
      );
    } catch (err: any) {
      setMessage(err?.response?.data?.message || err.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-[16px] border border-espresso/15 bg-cream p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-espresso/10 pb-3">
          <div>
            <h2 className="font-display text-xl font-bold text-espresso">Timestamp Analysis Import</h2>
            <p className="font-body text-xs text-espresso/60">Original wording is preserved; score positions remain unassigned.</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full text-espresso hover:bg-espresso/10">✕</button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={12}
            placeholder="Paste timestamp-analysis text here…"
            className="w-full resize-y rounded-lg border border-espresso/20 bg-white px-3 py-2 font-mono text-xs text-espresso"
          />
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block font-body text-xs text-espresso/70">Expertise track</span>
              <select
                value={track}
                onChange={(e) => setTrack(e.target.value as AnnotationTrack)}
                className="w-full rounded-lg border border-espresso/20 bg-white px-2 py-2 text-sm"
              >
                <option value="expert">Expert</option>
                <option value="layman">Layman</option>
              </select>
            </label>
            <button onClick={handlePreview} disabled={busy || !content.trim()} className="w-full rounded-pill border border-espresso/20 px-3 py-2 text-sm font-semibold text-espresso disabled:opacity-40">Preview</button>
            <button onClick={handleCommit} disabled={busy || !preview || !content.trim()} className="w-full rounded-pill bg-espresso px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">Import</button>
          </div>
        </div>

        {preview && (
          <div className="mt-4 overflow-auto rounded-lg border border-espresso/10 bg-white p-3">
            <p className="mb-2 font-body text-xs text-espresso/70">
              {preview.itemCount} items · {preview.sections.join(", ") || "No section headers"} · fingerprint {preview.fingerprint.slice(0, 12)}
            </p>
            {preview.warnings?.length > 0 && (
              <ul className="mb-2 list-disc pl-5 font-body text-xs text-amber-700">
                {preview.warnings.map((warning: string, index: number) => <li key={index}>{warning}</li>)}
              </ul>
            )}
            <div className="space-y-2">
              {preview.items.slice(0, 25).map((item: any) => (
                <div key={item.index} className="border-b border-espresso/5 pb-2 text-xs">
                  <span className="font-mono text-tan">{item.timestampRaw}</span>
                  <span className="ml-2 text-espresso/60">{item.section || "Unsectioned"}</span>
                  <p className="mt-1 font-body text-espresso">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {message && <p className="mt-3 rounded-lg border border-espresso/10 bg-white p-3 font-body text-xs text-espresso">{message}</p>}
      </div>
    </div>
  );
}
