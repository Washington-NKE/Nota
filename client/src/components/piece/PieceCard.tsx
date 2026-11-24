import { Link } from "react-router-dom";
import type { Piece } from "../../types";

interface PieceCardProps {
  piece: Piece;
}

export default function PieceCard({ piece }: PieceCardProps) {
  const pieceId = piece.id || piece._id;
  const performer = piece.performer || piece.recordings?.[0]?.performer;
  const coverUrl = piece.coverUrl || "/assets/many-notes.jpg";

  return (
    <Link
      to={`/pieces/${pieceId}`}
      className="flex rounded-[12px] overflow-hidden bg-tan hover:opacity-95 transition shadow-sm hover:shadow-md"
    >
      <div className="w-[200px] sm:w-[240px] shrink-0 bg-espresso flex items-end p-4 relative">
        <img src={coverUrl} alt={piece.title} className="h-full w-full object-cover absolute inset-0 opacity-85" />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 p-5 sm:p-6 font-display font-medium text-white text-base sm:text-lg">
        <dt className="text-white/80">Title:</dt>
        <dd className="font-semibold">{piece.title}</dd>
        <dt className="text-white/80">Composer:</dt>
        <dd>{piece.composer}</dd>
        {piece.year && (
          <>
            <dt className="text-white/80">Year:</dt>
            <dd>{piece.year}</dd>
          </>
        )}
        {performer && (
          <>
            <dt className="text-white/80">Performer:</dt>
            <dd className="truncate text-sm sm:text-base">{performer}</dd>
          </>
        )}
      </dl>
    </Link>
  );
}
