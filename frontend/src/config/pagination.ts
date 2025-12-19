type EnvLike = { [key: string]: string | undefined };
const env: EnvLike =
  (typeof import.meta !== "undefined" &&
    (import.meta as { env?: EnvLike }).env) ||
  {};

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const DEFAULT_PAGE_SIZE_FALLBACK = 1000;
// Number of page buttons to display in the pager.
export const PAGE_WINDOW = 9;

export const DEFAULT_PAGE_SIZE = parseNumber(
  env.VITE_DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_FALLBACK,
);

// Threshold for showing pagination controls; defaults to page size
export const PAGINATION_THRESHOLD = DEFAULT_PAGE_SIZE;
