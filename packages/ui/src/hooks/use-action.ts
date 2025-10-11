import { useState } from "react";

export const useAsyncAction = () => {
  const [isPending, setIsPending] = useState(false);

  const asyncAction = async <T>(action: () => Promise<T>) => {
    setIsPending(true);
    return await action().finally(() => {
      setIsPending(false);
    });
  };

  return [isPending, asyncAction] as const;
};
