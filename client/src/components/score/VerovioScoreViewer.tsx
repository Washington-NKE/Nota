import { useEffect, useRef, useState, useCallback } from "react";
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";

interface VerovioScoreViewerProps {
  xmlContent?: string | null;
  musicXmlUrl?: string | null;
  activeMeasureNumber?: number | null;
  onMeasureClick?: (measureNumber: number) => void;
  className?: string;
}

let cachedToolkit: any = null;
let toolkitPromise: Promise<any> | null = null;

async function getToolkitInstance() {
  if (cachedToolkit) return cachedToolkit;
  if (!toolkitPromise) {
    toolkitPromise = (async () => {
      const module = await createVerovioModule();
      cachedToolkit = new VerovioToolkit(module);
      return cachedToolkit;
    })();
  }
  return toolkitPromise;
}

export default function VerovioScoreViewer({
  xmlContent,
  musicXmlUrl,
  activeMeasureNumber,
  onMeasureClick,
  className = "",
}: VerovioScoreViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgWrapperRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(40);
  const [measureCount, setMeasureCount] = useState<number>(0);

  // Map of measureNumber (1-based) to { page: number, elementId: string }
  const measureMapRef = useRef<Map<number, { page: number; elementId: string }>>(new Map());

  // Load XML from URL if content not directly supplied
  const [loadedXml, setLoadedXml] = useState<string | null>(xmlContent || null);

  useEffect(() => {
    if (xmlContent) {
      setLoadedXml(xmlContent);
    } else if (musicXmlUrl) {
      setLoading(true);
      setError(null);
      fetch(musicXmlUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch score`);
          return res.text();
        })
        .then((text) => setLoadedXml(text))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [xmlContent, musicXmlUrl]);

  // Render SVG for given page
  const renderPage = useCallback(
    async (page: number, scale: number = zoomScale) => {
      if (!loadedXml || !svgWrapperRef.current) return;
      try {
        const tk = await getToolkitInstance();
        const width = containerRef.current?.clientWidth || 900;

        tk.setOptions({
          scale,
          adjustPageHeight: true,
          pageWidth: Math.max(700, Math.floor(width * (100 / scale))),
          pageHeight: 1200,
          breaks: "auto",
        });

        const svg = tk.renderToSVG(page, {});
        if (svgWrapperRef.current) {
          svgWrapperRef.current.innerHTML = svg;

          // Attach click listeners to rendered measure groups
          const measureEls = svgWrapperRef.current.querySelectorAll(".measure");
          measureEls.forEach((el, index) => {
            el.setAttribute("style", "cursor: pointer;");
            el.addEventListener("click", () => {
              const elementId = el.getAttribute("id");
              let measureNumber = index + 1;
              if (elementId) {
                for (const [number, info] of measureMapRef.current.entries()) {
                  if (info.elementId === elementId) {
                    measureNumber = number;
                    break;
                  }
                }
              }
              onMeasureClick?.(measureNumber);
            });
          });

          // Highlight active measure if on this page
          applyActiveMeasureHighlight(activeMeasureNumber);
        }
      } catch (err: any) {
        console.error("Verovio render error:", err);
      }
    },
    [loadedXml, zoomScale, onMeasureClick, activeMeasureNumber]
  );

  // Parse and build measure map on new XML
  useEffect(() => {
    if (!loadedXml) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getToolkitInstance()
      .then((tk) => {
        if (cancelled) return;
        const width = containerRef.current?.clientWidth || 900;
        tk.setOptions({
          scale: zoomScale,
          adjustPageHeight: true,
          pageWidth: Math.max(700, Math.floor(width * (100 / zoomScale))),
          pageHeight: 1200,
          breaks: "auto",
        });

        tk.loadData(loadedXml);
        const count = tk.getPageCount();
        setTotalPages(count);
        setCurrentPage(1);

        // Build measure map across all pages
        const newMap = new Map<number, { page: number; elementId: string }>();
        const primaryMeasureNumbers = extractPrimaryMeasureNumbers(loadedXml);
        let globalMeasureIndex = 0;

        for (let p = 1; p <= count; p++) {
          const pageSvg = tk.renderToSVG(p, {});
          const svgDocument = new DOMParser().parseFromString(pageSvg, "image/svg+xml");
          const measureElements = svgDocument.querySelectorAll(".measure");
          for (const measureElement of Array.from(measureElements)) {
            const elementId = measureElement.getAttribute("id");
            if (!elementId) continue;
            const measureNumber =
              primaryMeasureNumbers[globalMeasureIndex] ?? (globalMeasureIndex + 1);
            newMap.set(measureNumber, { page: p, elementId });
            globalMeasureIndex++;
          }
        }

        measureMapRef.current = newMap;
        setMeasureCount(globalMeasureIndex - 1);

        // Render first page
        renderPage(1, zoomScale);
      })
      .catch((err) => {
        if (!cancelled) setError(`Score rendering error: ${err.message}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadedXml]);

  // Re-render when page or zoom changes
  useEffect(() => {
    if (!loading && loadedXml) {
      renderPage(currentPage, zoomScale);
    }
  }, [currentPage, zoomScale]);

  function extractPrimaryMeasureNumbers(xml: string): number[] {
    try {
      const document = new DOMParser().parseFromString(xml, "application/xml");
      const firstPart = document.querySelector("score-partwise > part");
      if (!firstPart) return [];
      return Array.from(firstPart.querySelectorAll("measure"))
        .map((measure, index) => {
          const rawNumber = measure.getAttribute("number");
          const parsed = rawNumber == null ? NaN : Number.parseInt(rawNumber, 10);
          return Number.isFinite(parsed) ? parsed : index + 1;
        });
    } catch {
      return [];
    }
  }

  // Active measure highlighting and auto-page navigation
  function applyActiveMeasureHighlight(measureNum: number | null | undefined) {
    if (!svgWrapperRef.current) return;

    // Remove previous highlights
    svgWrapperRef.current.querySelectorAll(".measure-highlight").forEach((el) => {
      el.classList.remove("measure-highlight");
      el.removeAttribute("data-highlighted");
      // Remove overlay rect if added
      const overlay = el.querySelector(".active-measure-rect");
      if (overlay) overlay.remove();
    });

    if (measureNum == null) return;

    const measureInfo = measureMapRef.current.get(measureNum);
    if (!measureInfo) return;

    // If active measure is on another page, navigate to that page
    if (measureInfo.page !== currentPage) {
      setCurrentPage(measureInfo.page);
      return;
    }

    // Locate element by ID or class index
    const targetEl =
      svgWrapperRef.current.querySelector(`#${measureInfo.elementId}`) ||
      svgWrapperRef.current.querySelectorAll(".measure")[measureNum - 1];

    if (targetEl instanceof SVGGraphicsElement) {
      targetEl.classList.add("measure-highlight");
      targetEl.setAttribute("data-highlighted", "true");

      // Draw subtle warm highlight box without obscuring notation
      try {
        const bbox = targetEl.getBBox();
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("class", "active-measure-rect");
        rect.setAttribute("x", String(bbox.x - 20));
        rect.setAttribute("y", String(bbox.y - 20));
        rect.setAttribute("width", String(bbox.width + 40));
        rect.setAttribute("height", String(bbox.height + 40));
        rect.setAttribute("fill", "rgba(191, 161, 129, 0.28)");
        rect.setAttribute("stroke", "#BFA181");
        rect.setAttribute("stroke-width", "2");
        rect.setAttribute("rx", "4");
        rect.setAttribute("pointer-events", "none");
        targetEl.insertBefore(rect, targetEl.firstChild);

        // Smooth scroll measure into view if out of viewport
        targetEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      } catch {
        // Fallback for elements before layout calculation
      }
    }
  }

  useEffect(() => {
    applyActiveMeasureHighlight(activeMeasureNumber);
  }, [activeMeasureNumber, currentPage]);

  return (
    <div
      ref={containerRef}
      className={`card-surface rounded-[12px] p-4 flex flex-col bg-white border border-espresso/10 ${className}`}
    >
      {/* Top Toolbar: Navigation & Zoom */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-espresso/10">
        <div className="flex items-center gap-2">
          <span className="font-display font-semibold text-sm text-espresso">Interactive Score</span>
          {measureCount > 0 && (
            <span className="font-body text-xs text-espresso/60 bg-cream px-2 py-0.5 rounded-full">
              {activeMeasureNumber != null ? `Bar ${activeMeasureNumber} / ${measureCount}` : `${measureCount} Bars`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Zoom Controls */}
          <div className="flex items-center bg-cream rounded-pill border border-espresso/20 p-0.5 text-xs font-medium">
            <button
              onClick={() => setZoomScale((s) => Math.max(20, s - 5))}
              className="px-2 py-1 hover:text-espresso/70 transition"
              title="Zoom out"
            >
              −
            </button>
            <span className="px-2 py-1 select-none text-espresso/80">{zoomScale}%</span>
            <button
              onClick={() => setZoomScale((s) => Math.min(80, s + 5))}
              className="px-2 py-1 hover:text-espresso/70 transition"
              title="Zoom in"
            >
              +
            </button>
          </div>

          {/* Page Pagination */}
          <div className="flex items-center gap-1.5 text-xs font-display">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-3 py-1 rounded-pill border border-espresso/20 disabled:opacity-30 hover:bg-espresso hover:text-white transition"
            >
              ← Prev
            </button>
            <span className="text-espresso/70 select-none px-1">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="px-3 py-1 rounded-pill border border-espresso/20 disabled:opacity-30 hover:bg-espresso hover:text-white transition"
            >
              Next →
            </button>
          </div>
        </div>
      </div>

      {/* Score Rendering Area */}
      <div className="relative min-h-[350px] max-h-[600px] overflow-auto flex items-start justify-center bg-white rounded-lg p-2">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-tan border-t-transparent rounded-full animate-spin" />
              <p className="font-body text-xs text-espresso/70">Engraving interactive score with Verovio…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-red-600 font-body text-sm">
            <p>Score unavailable: {error}</p>
          </div>
        )}

        {!loading && !error && !loadedXml && (
          <div className="p-12 text-center text-espresso/50 font-body text-sm">
            No score loaded.
          </div>
        )}

        <div
          ref={svgWrapperRef}
          className="w-full flex justify-center verovio-score-container select-none"
        />
      </div>

      {/* Bottom Hint */}
      <div className="mt-2 text-right">
        <span className="font-body text-[11px] text-espresso/50">
          Tip: Click any measure to seek playback or view annotations
        </span>
      </div>
    </div>
  );
}
