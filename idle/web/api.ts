import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ApiError,
  Catalog,
  CommandRequest,
  GameCommand,
  GameSnapshot,
} from "../shared/types";

class ApiFailure extends Error {
  constructor(
    message: string,
    public snapshot?: GameSnapshot,
    public uncertain = false,
  ) {
    super(message);
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), 15000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: abort.signal,
      cache: "no-store",
    });
    const value = await response.json();
    if (!response.ok) {
      const failure = value as ApiError;
      throw new ApiFailure(
        failure.error?.message ?? "Não foi possível completar esta ação.",
        failure.snapshot,
        response.status >= 500,
      );
    }
    return value as T;
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    throw new ApiFailure(
      "A conexão com Rune-Midgard foi interrompida. Tente novamente.",
      undefined,
      true,
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export function useGame() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [retryable, setRetryable] = useState(false);
  const active = useRef(false);
  const queued = useRef(false);
  const idle = useRef<(() => void) | null>(null);
  const alive = useRef(false);
  const lastSnapshot = useRef<GameSnapshot | null>(null);
  const failedCommand = useRef<CommandRequest | null>(null);
  const catalogRef = useRef<Catalog | null>(null);
  const errorSource = useRef<"connection" | "command" | null>(null);
  const accept = useCallback((value: GameSnapshot) => {
    if (!alive.current) return;
    const old = lastSnapshot.current;
    if (
      old &&
      (value.state.revision < old.state.revision ||
        (value.state.revision === old.state.revision &&
          value.serverTime < old.serverTime))
    )
      return;
    lastSnapshot.current = value;
    setSnapshot(value);
  }, []);

  const refresh = useCallback(async () => {
    if (active.current || queued.current || !alive.current) return;
    active.current = true;
    try {
      if (!catalogRef.current) {
        const value = await request<Catalog>("/api/catalog");
        catalogRef.current = value;
        if (alive.current) setCatalog(value);
      }
      const value = await request<GameSnapshot>("/api/session", {});
      accept(value);
      if (alive.current) {
        setConnected(true);
        if (!failedCommand.current && errorSource.current === "connection") {
          setError(null);
          errorSource.current = null;
        }
      }
    } catch (err) {
      if (alive.current) {
        setConnected(false);
        setError((err as Error).message);
        errorSource.current = "connection";
      }
    } finally {
      active.current = false;
      idle.current?.();
      idle.current = null;
    }
  }, [accept]);

  const submit = useCallback(
    async (receipt: CommandRequest): Promise<boolean> => {
      if (queued.current || !alive.current) return false;
      queued.current = true;
      setBusy(true);
      setError(null);
      errorSource.current = null;
      if (active.current)
        await new Promise<void>((resolve) => {
          idle.current = resolve;
        });
      if (!alive.current) {
        queued.current = false;
        return false;
      }
      active.current = true;
      try {
        const value = await request<GameSnapshot>("/api/command", receipt);
        accept(value);
        failedCommand.current = null;
        if (alive.current) {
          setRetryable(false);
          setConnected(true);
        }
        return true;
      } catch (err) {
        const failure = err as ApiFailure;
        if (failure.snapshot) accept(failure.snapshot);
        failedCommand.current = failure.uncertain ? receipt : null;
        if (alive.current) {
          setError(failure.message);
          errorSource.current = "command";
          setRetryable(failure.uncertain);
          setConnected(!failure.uncertain);
        }
        return false;
      } finally {
        active.current = false;
        queued.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [accept],
  );

  const command = useCallback(
    (value: GameCommand) => {
      // An unknown outcome must be recovered with the same receipt, never a new purchase.
      if (failedCommand.current) return Promise.resolve(false);
      return submit({ requestId: crypto.randomUUID(), command: value });
    },
    [submit],
  );
  const retry = useCallback(() => {
    if (failedCommand.current) return submit(failedCommand.current);
    errorSource.current = "connection";
    return refresh();
  }, [submit, refresh]);

  useEffect(() => {
    alive.current = true;
    let timer: number;
    let disposed = false;
    const poll = async () => {
      if (disposed) return;
      if (!document.hidden) await refresh();
      if (!disposed) timer = window.setTimeout(poll, 850);
    };
    void poll();
    const focus = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("online", focus);
    return () => {
      disposed = true;
      alive.current = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("online", focus);
    };
  }, [refresh]);

  return {
    catalog,
    snapshot,
    busy: busy || retryable,
    sending: busy,
    error,
    connected,
    retryable,
    command,
    retry,
  };
}
