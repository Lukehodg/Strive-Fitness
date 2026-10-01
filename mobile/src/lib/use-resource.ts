import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";
import { request } from "./api";
import { useSession } from "./session";
export function useResource<T>(path: string, refreshInterval = 0) {
  const { token, retry } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [owner, setOwner] = useState(`${token}:${path}`);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await request<T>(path, token);
      if (version !== sequence.current) return;
      setOwner(`${token}:${path}`);
      setData(result);
    } catch (err) {
      if (version !== sequence.current) return;
      setError(
        err instanceof Error ? err.message : "Unable to load your records.",
      );
      if ((err as { status?: number }).status === 401) await retry();
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [path, token, retry]);
  useFocusEffect(
    useCallback(() => {
      void reload();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void reload();
      });
      const timer = refreshInterval ? setInterval(() => { if (AppState.currentState === "active") void reload(); }, refreshInterval) : undefined;
      return () => { sequence.current++; subscription.remove(); if (timer) clearInterval(timer); };
    }, [reload, refreshInterval]),
  );
  return { data: owner === `${token}:${path}` ? data : null, error, loading, reload };
}
