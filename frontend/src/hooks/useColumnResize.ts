import { useState, useCallback, useRef } from "react";
import type { Column } from "@/components/table/columns";

const MIN_COLUMN_WIDTH = 50;

function parseWidth(width: string): number {
  if (width.endsWith("px")) {
    return parseInt(width, 10);
  }
  if (width === "1fr") {
    return 200; // Default width for flexible columns
  }
  return 100;
}

export function useColumnResize(columns: Column[]) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      const widths: Record<string, number> = {};
      columns.forEach((col) => {
        widths[col.key] = parseWidth(col.width);
      });
      return widths;
    },
  );

  const resizeState = useRef<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleResizeStart = useCallback(
    (key: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      resizeState.current = {
        key,
        startX: e.clientX,
        startWidth: columnWidths[key] || 100,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!resizeState.current) return;

        const delta = moveEvent.clientX - resizeState.current.startX;
        const newWidth = Math.max(
          MIN_COLUMN_WIDTH,
          resizeState.current.startWidth + delta,
        );

        setColumnWidths((prev) => ({
          ...prev,
          [resizeState.current!.key]: newWidth,
        }));
      };

      const handleMouseUp = () => {
        resizeState.current = null;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [columnWidths],
  );

  const getGridTemplate = useCallback(() => {
    return columns
      .map((col) => `${columnWidths[col.key] || parseWidth(col.width)}px`)
      .join(" ");
  }, [columns, columnWidths]);

  const getTotalWidth = useCallback(() => {
    return columns.reduce(
      (sum, col) => sum + (columnWidths[col.key] || parseWidth(col.width)),
      0,
    );
  }, [columns, columnWidths]);

  return {
    columnWidths,
    handleResizeStart,
    getGridTemplate,
    getTotalWidth,
  };
}
