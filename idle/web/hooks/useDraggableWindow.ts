import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

type ViewportCategory = "mobile" | "tablet" | "desktop";
type WindowPosition = { x: number; y: number; width: number };
type DragSession = { pointerId: number; handle: HTMLElement; offsetX: number; offsetY: number; width: number };
const STORAGE_PREFIX = "ragidle:window-position:v1:";
const RESET_EVENT = "ragidle:reset-window-positions";
const MARGIN = 6;
const viewportCategory = (): ViewportCategory => window.innerWidth <= 640 ? "mobile" : window.innerWidth <= 1120 ? "tablet" : "desktop";
const storageKey = (key: string, category: ViewportCategory) => `${STORAGE_PREFIX}${category}:${key}`;

function readPosition(key: string, category: ViewportCategory): WindowPosition | null {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(key, category)) ?? "null");
    return saved && [saved.x, saved.y, saved.width].every(Number.isFinite) && saved.width > 0
      ? { x: saved.x, y: saved.y, width: saved.width } : null;
  } catch { return null; }
}

function savePosition(key: string, category: ViewportCategory, position: WindowPosition) {
  try { localStorage.setItem(storageKey(key, category), JSON.stringify(position)); } catch { /* Layout still works when storage is unavailable. */ }
}

/** Restore every saved viewport layout, including panels which are currently closed. */
export function resetWindowPositions() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
    for (const key of keys) if (key?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key);
  } catch { /* The mounted windows can still be restored. */ }
  window.dispatchEvent(new Event(RESET_EVENT));
}

function clampPosition(position: WindowPosition, element: HTMLElement): WindowPosition {
  const rect = element.getBoundingClientRect();
  const width = Math.min(rect.width || position.width, window.innerWidth - MARGIN * 2);
  return {
    ...position,
    x: Math.min(Math.max(MARGIN, position.x), Math.max(MARGIN, window.innerWidth - width - MARGIN)),
    y: Math.min(Math.max(MARGIN, position.y), Math.max(MARGIN, window.innerHeight - rect.height - MARGIN)),
  };
}

/** Apply ref/style to the panel and handleProps to a title or dedicated grip. */
export function useDraggableWindow<T extends HTMLElement = HTMLDivElement>(key: string, label = "janela") {
  const [element, setElement] = useState<T | null>(null);
  const [position, setPosition] = useState<WindowPosition | null>(() => readPosition(key, viewportCategory()));
  const [isDragging, setIsDragging] = useState(false);
  const category = useRef(viewportCategory());
  const positionRef = useRef(position);
  const drag = useRef<DragSession | null>(null);
  positionRef.current = position;
  const ref = useCallback((node: T | null) => setElement(node), []);

  const move = useCallback((next: WindowPosition) => {
    if (!element) return;
    const clamped = clampPosition(next, element);
    positionRef.current = clamped;
    setPosition(previous => previous && previous.x === clamped.x && previous.y === clamped.y && previous.width === clamped.width ? previous : clamped);
  }, [element]);

  const finishDrag = useCallback(() => {
    const session = drag.current;
    drag.current = null;
    if (session?.handle.hasPointerCapture(session.pointerId)) session.handle.releasePointerCapture(session.pointerId);
    setIsDragging(false);
    if (positionRef.current) savePosition(key, category.current, positionRef.current);
  }, [key]);

  useLayoutEffect(() => {
    category.current = viewportCategory();
    const saved = readPosition(key, category.current);
    positionRef.current = saved;
    setPosition(saved);
    setIsDragging(false);
    return () => {
      const session = drag.current;
      drag.current = null;
      if (session?.handle.hasPointerCapture(session.pointerId)) session.handle.releasePointerCapture(session.pointerId);
      if (session && positionRef.current) savePosition(key, category.current, positionRef.current);
    };
  }, [key]);

  useLayoutEffect(() => {
    // Restore coordinates only after their fixed width/position has reached the DOM.
    // A viewport category can change without changing the panel's observed size.
    if (!element || !position || position !== positionRef.current) return;
    const next = clampPosition(position, element);
    if (next.x !== position.x || next.y !== position.y) move(next);
    if (!drag.current) savePosition(key, category.current, next);
  }, [element, position, key, move]);

  useLayoutEffect(() => {
    if (!element) return;
    const clamp = () => {
      if (!positionRef.current) return;
      const next = clampPosition(positionRef.current, element);
      move(next);
      if (!drag.current) savePosition(key, category.current, next);
    };
    const resize = () => {
      const nextCategory = viewportCategory();
      if (nextCategory !== category.current) {
        finishDrag();
        category.current = nextCategory;
        const saved = readPosition(key, nextCategory);
        positionRef.current = saved;
        setPosition(saved);
      } else clamp();
    };
    const reset = () => {
      finishDrag();
      // finishDrag persists its last point; remove it too when restoring during a drag.
      try { localStorage.removeItem(storageKey(key, category.current)); } catch { /* Optional persistence. */ }
      positionRef.current = null;
      setPosition(null);
    };
    const observer = new ResizeObserver(clamp);
    observer.observe(element);
    window.addEventListener("resize", resize);
    window.addEventListener("blur", finishDrag);
    window.addEventListener(RESET_EVENT, reset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", finishDrag);
      window.removeEventListener(RESET_EVENT, reset);
    };
  }, [element, key, move, finishDrag]);

  const handleProps: HTMLAttributes<HTMLElement> = {
    className: "ro-drag-handle",
    tabIndex: 0,
    role: "group",
    "aria-label": `Mover ${label}`,
    "aria-keyshortcuts": "ArrowUp ArrowDown ArrowLeft ArrowRight",
    title: `Arraste para mover ${label}; use as setas quando a alça estiver selecionada (Shift: passos maiores).`,
    onPointerDown: event => {
      if (!element || event.button !== 0 || !event.isPrimary) return;
      const target = event.target as HTMLElement;
      if (target.closest('button, a, input, select, textarea, [contenteditable="true"], [data-no-drag]')) return;
      const rect = element.getBoundingClientRect();
      drag.current = { pointerId: event.pointerId, handle: event.currentTarget, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      event.preventDefault();
      setIsDragging(true);
      move({ x: rect.left, y: rect.top, width: rect.width });
    },
    onPointerMove: event => {
      const session = drag.current;
      if (!session || session.pointerId !== event.pointerId) return;
      event.preventDefault();
      move({ x: event.clientX - session.offsetX, y: event.clientY - session.offsetY, width: session.width });
    },
    onPointerUp: event => { if (drag.current?.pointerId === event.pointerId) finishDrag(); },
    onPointerCancel: event => { if (drag.current?.pointerId === event.pointerId) finishDrag(); },
    onLostPointerCapture: event => { if (drag.current?.pointerId === event.pointerId) finishDrag(); },
    onKeyDown: event => {
      if (!element || event.target !== event.currentTarget || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const step = event.shiftKey ? 24 : 8;
      move({ x: rect.left + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0), y: rect.top + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0), width: positionRef.current?.width ?? rect.width });
      if (positionRef.current) savePosition(key, category.current, positionRef.current);
    },
  };
  const style: CSSProperties | undefined = position ? {
    position: "fixed", left: position.x, top: position.y, right: "auto", bottom: "auto",
    transform: "none", margin: 0, width: `min(${position.width}px, calc(100vw - ${MARGIN * 2}px))`,
    maxHeight: `calc(100dvh - ${MARGIN * 2}px)`, ...(isDragging ? { zIndex: 90 } : {}),
  } : undefined;
  return { ref, style, handleProps, isDragging };
}
