import { format } from "date-fns";
import type { FileEntry, SortField } from "@/types/file";
import { formatFileSize, formatDuration, formatResolutions } from "@/lib/utils";
import { FileIcon } from "./FileIcon";

export interface Column {
  key: SortField | "icon" | "path";
  label: string;
  width: string;
  sortable: boolean;
  resizable: boolean;
  render: (entry: FileEntry) => React.ReactNode;
}

const getBasedir = (path: string) => {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return path.substring(0, lastSlash);
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "yyyy-MM-dd HH:mm");
  } catch {
    return "-";
  }
};

const iconColumn: Column = {
  key: "icon",
  label: "",
  width: "32px",
  sortable: false,
  resizable: false,
  render: (entry) => <FileIcon entry={entry} />,
};

const nameColumn: Column = {
  key: "name",
  label: "Name",
  width: "1fr",
  sortable: true,
  resizable: true,
  render: (entry) => (
    <span className="truncate" title={entry.name}>
      {entry.name}
    </span>
  ),
};

const pathColumn: Column = {
  key: "path",
  label: "Path",
  width: "1fr",
  sortable: true,
  resizable: true,
  render: (entry) => {
    const basedir = getBasedir(entry.path);
    return (
      <span className="truncate text-muted-foreground" title={basedir}>
        {basedir}
      </span>
    );
  },
};

export const columns: Column[] = [
  iconColumn,
  nameColumn,
  {
    key: "size",
    label: "Size",
    width: "100px",
    sortable: true,
    resizable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {entry.is_dir ? "-" : formatFileSize(entry.size)}
      </span>
    ),
  },
  {
    key: "modified",
    label: "Modified",
    width: "150px",
    sortable: true,
    resizable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {formatDate(entry.modified)}
      </span>
    ),
  },
  {
    key: "created",
    label: "Created",
    width: "150px",
    sortable: true,
    resizable: true,
    render: (entry) => (
      <span className="text-muted-foreground">{formatDate(entry.created)}</span>
    ),
  },
  {
    key: "mime_type",
    label: "Type",
    width: "120px",
    sortable: true,
    resizable: true,
    render: (entry) => (
      <span className="text-muted-foreground truncate" title={entry.mime_type}>
        {entry.is_dir ? "Folder" : entry.mime_type?.split("/")[1] || "-"}
      </span>
    ),
  },
  {
    key: "width",
    label: "Resolution",
    width: "100px",
    sortable: true,
    resizable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {formatResolutions(entry.width, entry.height)}
      </span>
    ),
  },
  {
    key: "duration",
    label: "Duration",
    width: "80px",
    sortable: true,
    resizable: true,
    render: (entry) => (
      <span className="text-muted-foreground">
        {formatDuration(entry.duration)}
      </span>
    ),
  },
];

// Search results columns include path column after name
export const searchColumns: Column[] = [
  iconColumn,
  nameColumn,
  pathColumn,
  ...columns.slice(2),
];
