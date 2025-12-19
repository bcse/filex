import React, { useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useColumnResize } from '@/hooks/useColumnResize';
import type { Column } from '@/components/table/columns';
import type { FileEntry, SortConfig, SortField } from '@/types/file';

type RowProps = React.HTMLAttributes<HTMLDivElement>;

interface FileTableViewProps {
  columns: Column[];
  entries: FileEntry[];
  sortConfig?: SortConfig;
  onSort?: (field: SortField) => void;
  estimateSize?: number;
  selectedPaths?: Set<string>;
  getRowKey?: (entry: FileEntry) => string;
  getRowClassName?: (entry: FileEntry, isSelected: boolean) => string | undefined;
  getRowProps?: (entry: FileEntry) => RowProps | undefined;
  onRowClick?: (entry: FileEntry, event: React.MouseEvent) => void;
  onRowDoubleClick?: (entry: FileEntry) => void;
  wrapRow?: (entry: FileEntry, row: React.ReactNode) => React.ReactNode;
  afterRows?: React.ReactNode;
  scrollToKey?: string | null;
  onScrolledToKey?: (key: string) => void;
}

interface FileTableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  entry: FileEntry;
  columns: Column[];
  gridTemplate: string;
  totalWidth: number;
  isSelected: boolean;
  rowClassName?: string;
  rowHeight: number;
  rowStart: number;
  getRowProps?: (entry: FileEntry) => RowProps | undefined;
  onRowClick?: (entry: FileEntry, event: React.MouseEvent) => void;
  onRowDoubleClick?: (entry: FileEntry) => void;
}

function areRowPropsEqual(prev: FileTableRowProps, next: FileTableRowProps) {
  return (
    prev.entry === next.entry &&
    prev.columns === next.columns &&
    prev.gridTemplate === next.gridTemplate &&
    prev.totalWidth === next.totalWidth &&
    prev.isSelected === next.isSelected &&
    prev.rowClassName === next.rowClassName &&
    prev.rowHeight === next.rowHeight &&
    prev.rowStart === next.rowStart &&
    prev.getRowProps === next.getRowProps &&
    prev.onRowClick === next.onRowClick &&
    prev.onRowDoubleClick === next.onRowDoubleClick &&
    prev.className === next.className &&
    prev.style === next.style &&
    prev.onClick === next.onClick &&
    prev.onDoubleClick === next.onDoubleClick &&
    prev.onContextMenu === next.onContextMenu &&
    prev.onPointerDown === next.onPointerDown &&
    prev.onKeyDown === next.onKeyDown &&
    prev.role === next.role &&
    prev.tabIndex === next.tabIndex
  );
}

const FileTableRow = React.memo(React.forwardRef<HTMLDivElement, FileTableRowProps>(function FileTableRow({
  entry,
  columns,
  gridTemplate,
  totalWidth,
  isSelected,
  rowClassName,
  rowHeight,
  rowStart,
  getRowProps,
  onRowClick,
  onRowDoubleClick,
  className: triggerClassName,
  style: triggerStyle,
  onClick: triggerOnClick,
  onDoubleClick: triggerOnDoubleClick,
  onContextMenu: triggerOnContextMenu,
  onPointerDown: triggerOnPointerDown,
  onKeyDown: triggerOnKeyDown,
  ...restTriggerProps
}, ref) {
  const rowProps = getRowProps?.(entry);
  const {
    className: rowExtraClassName,
    style: rowExtraStyle,
    onClick: rowExtraOnClick,
    onDoubleClick: rowExtraOnDoubleClick,
    onContextMenu: rowExtraOnContextMenu,
    onPointerDown: rowExtraOnPointerDown,
    onKeyDown: rowExtraOnKeyDown,
    ...restRowProps
  } = rowProps ?? {};

  return (
    <div
      {...restRowProps}
      {...restTriggerProps}
      ref={ref}
      className={cn(
        'grid px-2 items-center text-sm border-b border-transparent hover:bg-accent cursor-pointer absolute top-0 left-0',
        isSelected && 'bg-accent',
        rowClassName,
        rowExtraClassName,
        triggerClassName
      )}
      style={{
        gridTemplateColumns: gridTemplate,
        height: `${rowHeight}px`,
        transform: `translateY(${rowStart}px)`,
        minWidth: totalWidth,
        ...rowExtraStyle,
        ...triggerStyle,
      }}
      onClick={(event) => {
        rowExtraOnClick?.(event);
        triggerOnClick?.(event);
        onRowClick?.(entry, event);
      }}
      onDoubleClick={(event) => {
        rowExtraOnDoubleClick?.(event);
        triggerOnDoubleClick?.(event);
        onRowDoubleClick?.(entry);
      }}
      onContextMenu={(event) => {
        rowExtraOnContextMenu?.(event);
        triggerOnContextMenu?.(event);
      }}
      onPointerDown={(event) => {
        rowExtraOnPointerDown?.(event);
        triggerOnPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        rowExtraOnKeyDown?.(event);
        triggerOnKeyDown?.(event);
      }}
    >
      {columns.map((column) => (
        <div key={column.key} className="truncate">
          {column.render(entry)}
        </div>
      ))}
    </div>
  );
}), areRowPropsEqual);

export function FileTableView({
  columns,
  entries,
  sortConfig,
  onSort,
  estimateSize = 36,
  selectedPaths,
  getRowKey,
  getRowClassName,
  getRowProps,
  onRowClick,
  onRowDoubleClick,
  wrapRow,
  afterRows,
  scrollToKey,
  onScrolledToKey,
}: FileTableViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { handleResizeStart, getGridTemplate, getTotalWidth } = useColumnResize(columns);
  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 10,
  });

  const gridTemplate = getGridTemplate();
  const totalWidth = getTotalWidth();
  const resolveKey = useMemo(
    () => getRowKey ?? ((entry: FileEntry) => entry.path),
    [getRowKey]
  );

  useEffect(() => {
    if (!scrollToKey) return;
    const index = entries.findIndex((entry) => resolveKey(entry) === scrollToKey);
    if (index === -1) return;
    rowVirtualizer.scrollToIndex(index, { align: 'center' });
    onScrolledToKey?.(scrollToKey);
  }, [entries, onScrolledToKey, resolveKey, rowVirtualizer, scrollToKey]);

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalWidth }}>
          <div
            className="grid px-2 py-2 border-b bg-muted/60 backdrop-blur text-sm font-medium sticky top-0 z-10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((column, index) => {
              const isSortable = Boolean(onSort) && column.sortable && column.key !== 'icon';
              const isActive = sortConfig?.field === column.key;
              return (
                <div key={column.key} className="relative flex items-center">
                  <div
                    className={cn(
                      'flex items-center gap-1 flex-1 truncate',
                      isSortable && 'cursor-pointer hover:text-foreground'
                    )}
                    onClick={() => isSortable && onSort?.(column.key as SortField)}
                  >
                    <span>{column.label}</span>
                    {isSortable && isActive && (
                      sortConfig?.order === 'asc' ? (
                        <ArrowUp className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <ArrowDown className="w-3 h-3 flex-shrink-0" />
                      )
                    )}
                  </div>
                  {index < columns.length - 1 && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/50 group"
                      onMouseDown={(e) => handleResizeStart(column.key, e)}
                    >
                      <div className="absolute right-0 top-1 bottom-1 w-px bg-border group-hover:bg-primary" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const entry = entries[virtualRow.index];
                const key = resolveKey(entry);
                const isSelected = selectedPaths?.has(key) ?? false;
                const rowClassName = getRowClassName?.(entry, isSelected);
                const row = (
                  <FileTableRow
                    entry={entry}
                    columns={columns}
                    gridTemplate={gridTemplate}
                    totalWidth={totalWidth}
                    isSelected={isSelected}
                    rowClassName={rowClassName}
                    rowHeight={virtualRow.size}
                    rowStart={virtualRow.start}
                    getRowProps={getRowProps}
                    onRowClick={onRowClick}
                    onRowDoubleClick={onRowDoubleClick}
                  />
                );

                const wrappedRow = wrapRow ? wrapRow(entry, row) : row;
                return <React.Fragment key={key}>{wrappedRow}</React.Fragment>;
              })}
            </div>
            {afterRows}
          </div>
        </div>
      </div>
    </div>
  );
}
