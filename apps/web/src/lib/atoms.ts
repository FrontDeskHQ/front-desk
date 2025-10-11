import type { InferLiveObject } from "@live-state/sync";
import type { schema } from "api/schema";
import { atom } from "jotai/vanilla";
// import { atomWithCookie } from "~/utils/cookie-atoms";

export const activeUserAtom = atom<
  InferLiveObject<(typeof schema)["user"]> | undefined
>(undefined);

// export const activeOrganizationAtom = atomWithCookie<
//   InferLiveObject<(typeof schema)["organization"]> | undefined
// >("activeOrganization", undefined);

export const activeOrganizationAtom = atom<
  InferLiveObject<(typeof schema)["organization"]> | undefined
>(undefined);
