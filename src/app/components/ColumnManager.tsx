"use client";

import {
  ArrowDown,
  ArrowUp,
  Columns3,
  RotateCcw,
} from "lucide-react";
import { useEffect, useState } from "react";

export interface ConfigurableColumn<Key extends string> {
  key: Key;
  label: string;
}

export function useColumnManager<Key extends string>(
  storageKey: string,
  columns: readonly ConfigurableColumn<Key>[]
) {
  const defaultOrder = columns.map((column) => column.key);
  const [order, setOrder] = useState<Key[]>(defaultOrder);
  const [hidden, setHidden] = useState<Key[]>([]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) return;
      const preferences = JSON.parse(stored) as {
        order?: Key[];
        hidden?: Key[];
      };
      const validKeys = new Set(defaultOrder);
      const storedOrder = (preferences.order || []).filter((key) =>
        validKeys.has(key)
      );

      setOrder([
        ...storedOrder,
        ...defaultOrder.filter((key) => !storedOrder.includes(key)),
      ]);
      setHidden(
        (preferences.hidden || []).filter((key) => validKeys.has(key))
      );
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  // Column definitions are intentionally stable constants.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  function persist(nextOrder: Key[], nextHidden: Key[]) {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ order: nextOrder, hidden: nextHidden })
    );
  }

  function move(key: Key, direction: -1 | 1) {
    setOrder((current) => {
      const index = current.indexOf(key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      persist(next, hidden);
      return next;
    });
  }

  function toggle(key: Key) {
    setHidden((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      persist(order, next);
      return next;
    });
  }

  function reset() {
    setOrder(defaultOrder);
    setHidden([]);
    window.localStorage.removeItem(storageKey);
  }

  return {
    order,
    hidden,
    visibleOrder: order.filter((key) => !hidden.includes(key)),
    move,
    toggle,
    reset,
  };
}

export function ColumnManager<Key extends string>({
  columns,
  order,
  hidden,
  onMove,
  onToggle,
  onReset,
}: {
  columns: readonly ConfigurableColumn<Key>[];
  order: Key[];
  hidden: Key[];
  onMove: (key: Key, direction: -1 | 1) => void;
  onToggle: (key: Key) => void;
  onReset: () => void;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 hover:bg-gray-50 [&::-webkit-details-marker]:hidden">
        <Columns3 size={16} />
        Columns
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="font-black">Arrange Columns</span>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-gray-500 hover:bg-gray-100"
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>
        <ol className="max-h-96 space-y-1 overflow-y-auto">
          {order.map((key, index) => {
            const column = columns.find((entry) => entry.key === key);
            if (!column) return null;
            return (
              <li
                key={key}
                className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={!hidden.includes(key)}
                  onChange={() => onToggle(key)}
                  aria-label={`Show ${column.label}`}
                  className="h-4 w-4"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {column.label}
                </span>
                <button
                  type="button"
                  onClick={() => onMove(key, -1)}
                  disabled={index === 0}
                  className="rounded-lg p-1.5 hover:bg-white disabled:opacity-25"
                  aria-label={`Move ${column.label} left`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => onMove(key, 1)}
                  disabled={index === order.length - 1}
                  className="rounded-lg p-1.5 hover:bg-white disabled:opacity-25"
                  aria-label={`Move ${column.label} right`}
                >
                  <ArrowDown size={14} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </details>
  );
}
