import React, { useRef, useState, useEffect, useMemo } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BreadcrumbProps {
  segments: string[];
  onNavigate: (path: string) => void;
}

export function Breadcrumb({ segments, onNavigate }: BreadcrumbProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [segmentWidths, setSegmentWidths] = useState<number[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);

  // Measure segment widths on mount and when segments change
  useEffect(() => {
    if (measureRef.current) {
      const spans = measureRef.current.querySelectorAll("[data-segment]");
      const widths = Array.from(spans).map(
        (el) => el.getBoundingClientRect().width,
      );
      setSegmentWidths(widths);
    }
  }, [segments]);

  // Track container width with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Calculate visible/hidden segments based on available width
  const { visibleSegments, hiddenSegments } = useMemo(() => {
    const CHEVRON_WIDTH = 24; // approx width of chevron icon + gaps
    const ELLIPSIS_WIDTH = 40; // approx width of "..." button + chevron

    // Default: show all segments until we have measurements
    if (
      segmentWidths.length === 0 ||
      containerWidth === 0 ||
      segments.length === 0
    ) {
      return {
        visibleSegments: segments.map((s, i) => ({ segment: s, index: i })),
        hiddenSegments: [] as Array<{ segment: string; index: number }>,
      };
    }

    // If only one segment, always show it
    if (segments.length === 1) {
      return {
        visibleSegments: [{ segment: segments[0], index: 0 }],
        hiddenSegments: [] as Array<{ segment: string; index: number }>,
      };
    }

    // Always show first segment
    const firstSegmentWidth = segmentWidths[0] + CHEVRON_WIDTH;

    // Build tail segments with their widths (excluding first segment)
    const tailSegments: Array<{
      segment: string;
      index: number;
      width: number;
    }> = [];
    for (let i = 1; i < segments.length; i++) {
      tailSegments.push({
        segment: segments[i],
        index: i,
        width: segmentWidths[i] || 0,
      });
    }

    // Try to fit segments from the end
    let tailWidth = 0;
    let fitCount = 0;

    for (let i = tailSegments.length - 1; i >= 0; i--) {
      const segmentWidth = tailSegments[i].width + CHEVRON_WIDTH;
      const hasHiddenSegments = i > 0;
      const projectedWidth =
        firstSegmentWidth +
        tailWidth +
        segmentWidth +
        (hasHiddenSegments ? ELLIPSIS_WIDTH : 0);

      if (projectedWidth <= containerWidth) {
        tailWidth += segmentWidth;
        fitCount++;
      } else {
        break;
      }
    }

    // Ensure we show at least the last segment
    if (fitCount === 0 && tailSegments.length > 0) {
      fitCount = 1;
    }

    // Split into visible tail and hidden
    const visibleTail = tailSegments.slice(-fitCount);
    const hiddenMiddle = tailSegments.slice(0, tailSegments.length - fitCount);

    return {
      visibleSegments: [{ segment: segments[0], index: 0 }, ...visibleTail],
      hiddenSegments: hiddenMiddle,
    };
  }, [segments, segmentWidths, containerWidth]);

  const handleNavigate = (index: number) => {
    const path = "/" + segments.slice(0, index + 1).join("/");
    onNavigate(path);
  };

  return (
    <>
      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        className="absolute invisible whitespace-nowrap"
        aria-hidden="true"
      >
        {segments.map((segment, index) => (
          <span key={index} data-segment className="text-sm">
            {segment}
          </span>
        ))}
      </div>

      {/* Visible breadcrumb */}
      <div
        ref={containerRef}
        className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden"
      >
        {visibleSegments.map(({ segment, index }, arrayIndex) => {
          const isFirst = arrayIndex === 0;
          const isLast = index === segments.length - 1;
          const showEllipsis = isFirst && hiddenSegments.length > 0;

          return (
            <React.Fragment key={index}>
              <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              {isLast ? (
                <span className="font-medium truncate min-w-0 flex-1">
                  {segment}
                </span>
              ) : (
                <button
                  className="hover:underline text-muted-foreground hover:text-foreground truncate"
                  onClick={() => handleNavigate(index)}
                >
                  {segment}
                </button>
              )}

              {/* Ellipsis dropdown after first segment if there are hidden segments */}
              {showEllipsis && (
                <>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="hover:bg-accent px-1 rounded text-muted-foreground hover:text-foreground flex-shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {hiddenSegments.map(({ segment, index }) => (
                        <DropdownMenuItem
                          key={index}
                          onClick={() => handleNavigate(index)}
                          className="cursor-pointer"
                        >
                          {segment}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
