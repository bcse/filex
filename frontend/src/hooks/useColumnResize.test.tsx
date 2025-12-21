import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useColumnResize } from "./useColumnResize";
import type { Column } from "@/components/table/columns";

const columns: Column[] = [
  {
    key: "name",
    label: "Name",
    width: "1fr",
    sortable: true,
    resizable: true,
    render: () => null,
  },
  {
    key: "size",
    label: "Size",
    width: "120px",
    sortable: true,
    resizable: true,
    render: () => null,
  },
];

describe("useColumnResize", () => {
  it("builds grid template from initial widths", () => {
    const { result } = renderHook(() => useColumnResize(columns));

    expect(result.current.getGridTemplate()).toBe("200px 120px");
    expect(result.current.getTotalWidth()).toBe(320);
  });

  it("updates width on resize and enforces minimum", () => {
    const { result } = renderHook(() => useColumnResize(columns));

    act(() => {
      result.current.handleResizeStart("name", {
        clientX: 100,
        preventDefault: () => undefined,
        stopPropagation: () => undefined,
      } as React.MouseEvent);
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: -1000 }));
    });

    expect(result.current.columnWidths.name).toBe(50);

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"));
    });
  });
});
