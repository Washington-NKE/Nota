import { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { formatTime } from "../player/YouTubePlayer";
import {
  getPieceComments,
  getRecordingComments,
  createCommentApi,
  deleteCommentApi,
  updateCommentApi,
} from "../../services/pieces.service";
import type { CommentItem } from "../../types";

interface CommentsSectionProps {
  pieceId: string;
  recordingId?: string;
  currentTimeSec?: number;
  currentMeasure?: number | null;
  onSeek?: (seconds: number) => void;
}

export default function CommentsSection({
  pieceId,
  recordingId,
  currentTimeSec = 0,
  currentMeasure,
  onSeek,
}: CommentsSectionProps) {
  const { user, isSignedIn } = useUser();
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [attachTimestamp, setAttachTimestamp] = useState(true);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  useEffect(() => {
    loadComments();
  }, [pieceId, recordingId]);

  async function loadComments() {
    setLoading(true);
    try {
      const data = recordingId
        ? await getRecordingComments(recordingId)
        : await getPieceComments(pieceId);
      setComments(data);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newBody.trim() || !isSignedIn) return;

    setSubmitting(true);
    try {
      await createCommentApi({
        pieceId,
        recordingId,
        body: newBody.trim(),
        timestampSec: attachTimestamp ? currentTimeSec : undefined,
        measureNumber: attachTimestamp && currentMeasure ? currentMeasure : undefined,
      });
      setNewBody("");
      await loadComments();
    } catch (err: any) {
      alert(`Could not post comment: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReplySubmit(parentId: string) {
    if (!replyBody.trim() || !isSignedIn) return;

    setSubmitting(true);
    try {
      await createCommentApi({
        pieceId,
        recordingId,
        parentId,
        body: replyBody.trim(),
      });
      setReplyBody("");
      setReplyingToId(null);
      await loadComments();
    } catch (err: any) {
      alert(`Could not post reply: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("Are you sure you want to delete this comment?")) return;
    try {
      await deleteCommentApi(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err: any) {
      alert(`Could not delete: ${err.message}`);
    }
  }

  async function handleEdit(commentId: string) {
    if (!editBody.trim()) return;
    setSubmitting(true);
    try {
      const updated = await updateCommentApi(commentId, editBody.trim());
      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? { ...comment, body: updated.body }
            : {
                ...comment,
                replies: comment.replies?.map((reply) =>
                  reply.id === commentId ? { ...reply, body: updated.body } : reply
                ),
              }
        )
      );
      setEditingId(null);
      setEditBody("");
    } catch (err: any) {
      alert(`Could not edit: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-semibold text-xl text-espresso">
          Contextual Discussion ({comments.length})
        </h2>
        <span className="font-body text-xs text-espresso/60">
          Educational dialogue on phrasing, motifs & interpretation
        </span>
      </div>

      {/* New Comment Input */}
      <form onSubmit={handleSubmitComment} className="card-surface p-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-tan/30 text-espresso font-display font-bold text-xs flex items-center justify-center shrink-0">
            {user?.firstName?.[0] || "N"}
          </div>
          <div className="flex-1">
            <textarea
              rows={2}
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder={
                isSignedIn
                  ? "Share an observation about this moment in the music…"
                  : "Sign in to participate in the musical discussion."
              }
              disabled={!isSignedIn || submitting}
              className="w-full bg-transparent outline-none font-body text-sm text-espresso placeholder:text-espresso/40 resize-none"
            />

            <div className="flex items-center justify-between pt-2 border-t border-espresso/10 mt-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-body text-espresso/70 select-none">
                <input
                  type="checkbox"
                  checked={attachTimestamp}
                  onChange={(e) => setAttachTimestamp(e.target.checked)}
                  disabled={!isSignedIn}
                  className="rounded border-espresso/30 text-tan focus:ring-0"
                />
                Tag current time ({formatTime(currentTimeSec)})
                {currentMeasure != null && ` · Bar ${currentMeasure}`}
              </label>

              <button
                type="submit"
                disabled={!isSignedIn || !newBody.trim() || submitting}
                className="font-display font-semibold text-xs rounded-pill px-5 py-2 bg-espresso text-white hover:bg-espresso/90 disabled:opacity-40 transition"
              >
                {submitting ? "Posting…" : "Post Comment"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Comments List */}
      {loading ? (
        <p className="font-body text-xs text-espresso/50">Loading discussions…</p>
      ) : comments.length === 0 ? (
        <div className="card-surface p-8 text-center text-espresso/50 font-body text-sm">
          No comments yet. Be the first to share an analysis or question about this piece!
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="card-surface p-4 border border-espresso/10">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-display font-semibold text-xs text-espresso">
                    {comment.user?.name || "Music Explorer"}
                  </span>
                  {comment.timestampSec != null && (
                    <button
                      onClick={() => onSeek?.(comment.timestampSec!)}
                      className="font-mono text-[11px] bg-cream border border-espresso/20 text-tan px-2 py-0.5 rounded-full hover:bg-tan hover:text-white transition"
                    >
                      ▶ {formatTime(comment.timestampSec)}
                      {comment.measureNumber && ` (Bar ${comment.measureNumber})`}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-body text-[11px] text-espresso/40">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                  {user && user.id === comment.userId && (
                    <>
                      <button
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditBody(comment.body);
                        }}
                        className="text-xs text-espresso/70 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(comment.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingId === comment.id ? (
                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="flex-1 bg-cream border border-espresso/15 rounded-lg px-3 py-2 font-body text-sm text-espresso"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => handleEdit(comment.id)}
                      disabled={submitting || !editBody.trim()}
                      className="px-3 py-1.5 bg-espresso text-white rounded-pill text-xs"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-xs text-espresso/60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="font-body text-sm text-espresso/90 whitespace-pre-wrap">
                  {comment.body}
                </p>
              )}

              {/* Reply Button */}
              {isSignedIn && (
                <div className="mt-2 text-right">
                  <button
                    onClick={() => setReplyingToId((id) => (id === comment.id ? null : comment.id))}
                    className="text-xs font-display font-medium text-tan hover:underline"
                  >
                    {replyingToId === comment.id ? "Cancel Reply" : "Reply"}
                  </button>
                </div>
              )}

              {/* Nested Reply Input */}
              {replyingToId === comment.id && (
                <div className="mt-3 pl-4 border-l-2 border-tan/40 flex items-center gap-2">
                  <input
                    type="text"
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply…"
                    className="flex-1 bg-cream border border-espresso/15 rounded-pill px-3 py-1.5 font-body text-xs text-espresso focus:outline-none"
                  />
                  <button
                    onClick={() => handleReplySubmit(comment.id)}
                    disabled={submitting || !replyBody.trim()}
                    className="px-3 py-1.5 bg-espresso text-white rounded-pill text-xs font-semibold hover:bg-espresso/90 disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              )}

              {/* Nested Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="mt-3 pl-4 border-l-2 border-espresso/15 space-y-2.5">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="text-xs">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-display font-semibold text-espresso">
                          {reply.user?.name || "Member"}
                        </span>
                        {user && user.id === reply.userId && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setEditingId(reply.id);
                                setEditBody(reply.body);
                              }}
                              className="text-[11px] text-espresso/70 hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(reply.id)}
                              className="text-[11px] text-red-500 hover:underline"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                      {editingId === reply.id ? (
                        <div className="flex gap-2 mt-1">
                          <input
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            className="flex-1 bg-cream border border-espresso/15 rounded-pill px-2 py-1"
                          />
                          <button
                            onClick={() => handleEdit(reply.id)}
                            disabled={submitting || !editBody.trim()}
                            className="text-tan font-semibold"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-espresso/50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <p className="font-body text-espresso/80">{reply.body}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
