"use client";
import { useSyncExternalStore } from "react";
import { type Instrument, useApi } from "./api";
import { makeStore } from "./persist";

const store = makeStore("gp_inst", "");

/** The instrument the person is looking at, remembered between visits. Falls back to the first available one. */
export function useInstrument() {
  const { data: list, error } = useApi<Instrument[]>("instruments");
  const saved = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  const current = list?.find((i) => i.id === saved) ?? list?.[0];
  return { list: list ?? [], current, error, select: (id: string) => store.set(id) };
}
