"use client";

import { useEffect, useState } from "react";

/**
 * True once the component has mounted on the client.
 *
 * Gate usage of any state that differs between SSR (empty) and the first
 * client render (restored from localStorage / sessionStorage) behind this
 * hook to avoid "A tree hydrated but some attributes of the server
 * rendered HTML didn't match" warnings.
 *
 * SSR-safe: always returns false on the server, and false on the client's
 * first synchronous render, flipping true on the next tick after mount.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
