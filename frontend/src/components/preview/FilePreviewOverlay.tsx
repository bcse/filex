import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { Maximize2, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import { api } from "@/api/client";
import { isImageFile, isTextFile, isVideoFile } from "@/lib/filePreview";
import { cn } from "@/lib/utils";
import { toSafeHttpUrl } from "@/lib/url";
import { useNavigationStore } from "@/stores/navigation";

const ZOOM_STEP = 1.2;
const MIN_SCALE = 0.1;
const MAX_TEXT_BYTES = 200000;

export function FilePreviewOverlay() {
  const { previewEntry, closePreview } = useNavigationStore();
  const [scale, setScale] = useState(1);
  const [fitScale, setFitScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [enableTransition, setEnableTransition] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const fitScaleRef = useRef(1);

  const isImage = useMemo(
    () => (previewEntry ? isImageFile(previewEntry) : false),
    [previewEntry],
  );
  const isVideo = useMemo(
    () => (previewEntry ? isVideoFile(previewEntry) : false),
    [previewEntry],
  );
  const isText = useMemo(
    () => (previewEntry ? isTextFile(previewEntry) : false),
    [previewEntry],
  );
  const previewPath = previewEntry?.path;

  useEffect(() => {
    if (!previewPath) return;
    setScale(1);
    setFitScale(1);
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
    setEnableTransition(false);
    setTextContent(null);
    setTextError(null);
    setIsLoadingText(false);
  }, [previewPath]);

  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);

  const computeFitScale = useCallback(() => {
    const container = containerRef.current;
    const img = imageRef.current;
    if (!container || !img || !img.naturalWidth || !img.naturalHeight) {
      return null;
    }

    const { width, height } = container.getBoundingClientRect();
    const nextScale = Math.min(
      width / img.naturalWidth,
      height / img.naturalHeight,
      1,
    );
    return nextScale;
  }, []);

  const handleImageLoad = useCallback(() => {
    const nextScale = computeFitScale();
    if (nextScale === null) return;
    setFitScale(nextScale);
    setScale(nextScale);
    setOffset({ x: 0, y: 0 });
    setEnableTransition(false);
    requestAnimationFrame(() => {
      setEnableTransition(true);
    });
  }, [computeFitScale]);

  useEffect(() => {
    if (!previewEntry || !isImage) return;
    const handleResize = () => {
      const nextScale = computeFitScale();
      if (nextScale === null) return;
      setFitScale(nextScale);
      setScale((current) => {
        if (Math.abs(current - fitScaleRef.current) < 0.01) {
          setOffset({ x: 0, y: 0 });
          return nextScale;
        }
        return current;
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [computeFitScale, isImage, previewEntry]);

  useEffect(() => {
    if (scale <= fitScale + 0.01) {
      setOffset({ x: 0, y: 0 });
    }
  }, [fitScale, scale]);

  useEffect(() => {
    if (!previewPath || !isText) return;
    let isActive = true;
    setIsLoadingText(true);
    setTextError(null);
    api
      .getTextContent(previewPath, MAX_TEXT_BYTES)
      .then((content) => {
        if (!isActive) return;
        setTextContent(content);
      })
      .catch(() => {
        if (!isActive) return;
        setTextError("Unable to load text preview.");
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoadingText(false);
      });

    return () => {
      isActive = false;
    };
  }, [isText, previewPath]);

  useEffect(() => {
    if (!editorRef.current) return;

    if (editorViewRef.current) {
      editorViewRef.current.destroy();
      editorViewRef.current = null;
    }

    if (textContent === null) return;

    const state = EditorState.create({
      doc: textContent,
      extensions: [
        basicSetup,
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
        EditorView.editorAttributes.of({
          style: "height: 100%",
        }),
        oneDark,
      ],
    });

    editorViewRef.current = new EditorView({
      state,
      parent: editorRef.current,
    });

    return () => {
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
    };
  }, [textContent]);

  if (!previewEntry || (!isImage && !isVideo && !isText)) {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      closePreview();
    }
  };

  const handleZoomIn = () =>
    setScale((current) => Math.max(current * ZOOM_STEP, MIN_SCALE));

  const handleZoomOut = () =>
    setScale((current) => Math.max(current / ZOOM_STEP, MIN_SCALE));

  const handleFit = () => {
    setScale(fitScale);
    setOffset({ x: 0, y: 0 });
  };

  const handleActual = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const canDrag = scale > fitScale + 0.01;

  const handleMouseDown = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!canDrag) return;
    event.preventDefault();
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    setIsDragging(true);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = event.clientX - dragStartRef.current.x;
    const dy = event.clientY - dragStartRef.current.y;
    setOffset({
      x: dragStartRef.current.offsetX + dx,
      y: dragStartRef.current.offsetY + dy,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const src =
    toSafeHttpUrl(api.getDownloadUrl(previewEntry.path)) ?? "about:blank";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/90"
      onClick={handleBackdropClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <button
        type="button"
        onClick={closePreview}
        className="absolute right-5 top-5 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 pointer-events-auto"
        aria-label="Close preview"
      >
        <X className="h-5 w-5" />
      </button>

      {isImage && (
        <>
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <img
              ref={imageRef}
              src={src}
              alt={previewEntry.name}
              onLoad={handleImageLoad}
              onMouseDown={handleMouseDown}
              draggable={false}
              className={cn(
                "absolute left-1/2 top-1/2 max-w-none max-h-none select-none",
                "pointer-events-auto",
                enableTransition &&
                  "transition-transform duration-200 ease-out",
                canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-auto",
              )}
              style={{
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            />
          </div>

          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 px-3 py-2 text-white shadow-lg pointer-events-auto">
            <button
              type="button"
              onClick={handleZoomOut}
              className="rounded-full p-2 transition hover:bg-white/10"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomIn}
              className="rounded-full p-2 transition hover:bg-white/10"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleFit}
              className="rounded-full p-2 transition hover:bg-white/10"
              aria-label="Fit to screen"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleActual}
              className="rounded-full p-2 transition hover:bg-white/10"
              aria-label="Actual size"
            >
              <Square className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {isText && (
        <div className="flex h-full w-full items-center justify-center pointer-events-none">
          <div className="flex h-[85vh] w-[92vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 shadow-2xl backdrop-blur pointer-events-auto">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 text-sm text-zinc-200">
              <span className="truncate">{previewEntry.name}</span>
            </div>
            <div className="relative flex-1 overflow-hidden">
              {isLoadingText && (
                <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                  Loading preview...
                </div>
              )}
              {!isLoadingText && textError && (
                <div className="flex h-full items-center justify-center text-sm text-rose-200">
                  {textError}
                </div>
              )}
              {!isLoadingText && !textError && (
                <div ref={editorRef} className="h-full" />
              )}
            </div>
          </div>
        </div>
      )}

      {isVideo && (
        <div className="flex h-full w-full items-center justify-center pointer-events-none">
          <video
            src={src}
            controls
            className="max-h-[85vh] max-w-[85vw] rounded-lg bg-black shadow-2xl pointer-events-auto"
          />
        </div>
      )}
    </div>
  );
}
