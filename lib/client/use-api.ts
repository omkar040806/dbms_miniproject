"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "./api";

interface ApiState<T> {
  data: T | null;
  error: string | null;
  status: number | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Fetch JSON from one of our API routes and re-fetch when `url` changes.
 * Pass `null` to skip fetching (for example until a form is submitted).
 */
export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (url === null) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starting a request is the effect's purpose
    setLoading(true);
    setError(null);
    apiFetch<T>(url)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setStatus(200);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong");
        setStatus(err instanceof ApiError ? err.status : 500);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, version]);

  return { data, error, status, loading, reload };
}
