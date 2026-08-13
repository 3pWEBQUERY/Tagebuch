"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

const subscribeScroll = (onChange: () => void) => {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
};

/**
 * Werte, die es nur im Browser gibt (aktuelles Datum, Anzeigemodus …).
 * Beim Prerender greift `serverValue`, nach der Hydration der echte Wert –
 * ohne setState im Effekt und ohne Hydrations-Konflikt.
 */
export function useClientValue<T extends string | number | boolean>(compute: () => T, serverValue: T): T {
  return useSyncExternalStore(noSubscribe, compute, () => serverValue);
}

/** true, sobald weiter als `threshold` gescrollt wurde. */
export function useScrolledPast(threshold: number): boolean {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > threshold,
    () => false,
  );
}
