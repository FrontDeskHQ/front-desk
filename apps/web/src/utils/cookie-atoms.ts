import { atomWithStorage, createJSONStorage } from "jotai/utils";
import Cookies from "js-cookie";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const COOKIE_PREFIX = "frontdesk_";

const cookieStorage = <T>() =>
  createJSONStorage<T>(() =>
    typeof window === "undefined" // This prevents hydration errors
      ? {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        }
      : {
          getItem: (key) => Cookies.get(`${COOKIE_PREFIX}${key}`) ?? null,
          setItem: (key, value) =>
            Cookies.set(`${COOKIE_PREFIX}${key}`, value, {
              sameSite: "strict",
              "max-age": COOKIE_MAX_AGE.toString(),
            }),
          removeItem: (key) => Cookies.remove(`${COOKIE_PREFIX}${key}`),
          subscribe: (key, callback) => {
            function handler(event: CookieChangeEvent) {
              const cookie = event.changed.find(
                (c) => c.name === `${COOKIE_PREFIX}${key}`
              );

              if (cookie?.value) {
                callback(cookie.value);
              }
            }

            cookieStore.addEventListener(
              "cookiechange",
              handler as EventListener
            );
            return () =>
              cookieStore.removeEventListener(
                "cookiechange",
                handler as EventListener
              );
          },
        }
  );

export function atomWithCookie<T>(key: string, initialValue: T) {
  const defaultValue = Cookies.get(key);

  if (!defaultValue && initialValue) {
    Cookies.set(key, JSON.stringify(initialValue));
  }

  return atomWithStorage<T>(
    key,
    (defaultValue || initialValue) as T,
    cookieStorage(),
    {
      getOnInit: true,
    }
  );
}
