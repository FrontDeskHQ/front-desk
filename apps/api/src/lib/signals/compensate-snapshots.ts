import type { ExecutionContext } from "./types";

const SNAPSHOTS_KEY = Symbol("compensateSnapshots");

type ContextWithSnapshots = ExecutionContext & {
  [SNAPSHOTS_KEY]?: Map<string, unknown>;
};

const getSnapshots = (ctx: ExecutionContext): Map<string, unknown> => {
  const extended = ctx as ContextWithSnapshots;
  let snapshots = extended[SNAPSHOTS_KEY];
  if (!snapshots) {
    snapshots = new Map();
    extended[SNAPSHOTS_KEY] = snapshots;
  }
  return snapshots;
};

export const setCompensateSnapshot = (
  ctx: ExecutionContext,
  key: string,
  value: unknown
): void => {
  getSnapshots(ctx).set(key, value);
};

export const getCompensateSnapshot = <T>(
  ctx: ExecutionContext,
  key: string
): T | undefined => getSnapshots(ctx).get(key) as T | undefined;

export const clearCompensateSnapshot = (
  ctx: ExecutionContext,
  key: string
): void => {
  getSnapshots(ctx).delete(key);
};
