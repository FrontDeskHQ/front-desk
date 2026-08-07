import { assertLocalhostApiUrl, getApiUrl } from "../../lib/env.js";
import { readThread, resolveThread } from "../../lib/thread.js";

export interface ThreadReadOptions {
  after?: string;
  org?: string;
  ref: string;
}

export const runThreadRead = async (
  options: ThreadReadOptions
): Promise<{ output: ReturnType<typeof readThread>; exitCode: number }> => {
  assertLocalhostApiUrl(getApiUrl());

  const resolved = await resolveThread(options.ref, options.org);
  return {
    exitCode: 0,
    output: readThread(resolved, options.after),
  };
};
