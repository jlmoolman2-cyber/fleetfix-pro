"use client";

import { ChevronDown, ChevronUp, Columns3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type ModuleColumn<T> = { id: string; label: string; render: (row: T) => React.ReactNode; align?: "left" | "right" };

export default function ConfigurableModuleTable<T extends { id: string }>({ rows, columns, storageKey, onRowClick, headerActions }: { rows: T[]; columns: ModuleColumn<T>[]; storageKey: string; onRowClick: (row: T) => void; headerActions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(columns.map((column) => column.id));
  const [order, setOrder] = useState<string[]>(columns.map((column) => column.id));
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" }>({ key: columns[0]?.id || "", direction: "asc" });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (Array.isArray(saved?.selected)) setSelected(saved.selected);
      if (Array.isArray(saved?.order)) setOrder(saved.order);
      if (saved?.columnWidths && typeof saved.columnWidths === "object") setColumnWidths(saved.columnWidths);
    } catch { /* use defaults */ }
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => { if (loaded) localStorage.setItem(storageKey, JSON.stringify({ selected, order, columnWidths })); }, [columnWidths, loaded, order, selected, storageKey]);
  const visible = useMemo(() => order.map((id) => columns.find((column) => column.id === id)).filter((column): column is ModuleColumn<T> => Boolean(column && selected.includes(column.id))), [columns, order, selected]);
  const sortedRows = useMemo(() => [...rows].sort((left, right) => {
    const leftValue = String((left as Record<string, unknown>)[sort.key] ?? "");
    const rightValue = String((right as Record<string, unknown>)[sort.key] ?? "");
    const result = leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? result : -result;
  }), [rows, sort]);

  function move(id: string, direction: -1 | 1) {
    setOrder((current) => { const index = current.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  }

  function startColumnResize(event: React.MouseEvent, columnId: string) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidths[columnId] || 180;
    const move = (moveEvent: MouseEvent) => setColumnWidths((current) => ({ ...current, [columnId]: Math.max(90, startWidth + moveEvent.clientX - startX) }));
    const stop = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", stop); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", stop);
  }

  return <div className="module-list-panel overflow-visible rounded-3xl border border-gray-200 bg-white shadow-sm">
    <div className="relative flex items-center justify-end gap-3 border-b bg-gray-50 px-3 py-2 md:absolute md:right-6 md:top-6 md:z-[90] md:border-0 md:bg-transparent md:p-0">
      {headerActions}
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-200 text-gray-900 hover:bg-gray-300" aria-label="Select and arrange columns" title="Select and arrange columns"><Columns3 className="h-5 w-5" /></button>
      {open && <div className="absolute right-3 top-12 z-[100] max-h-[min(70vh,520px)] w-72 overflow-y-auto rounded-2xl border bg-white p-3 shadow-2xl md:right-0"><p className="sticky top-0 z-10 mb-2 bg-white pb-2 font-black">Visible columns and order</p>{order.map((id, index) => { const column = columns.find((item) => item.id === id); if (!column) return null; return <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50"><input type="checkbox" checked={selected.includes(id)} onChange={() => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])} /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{column.label}</span><button type="button" disabled={index === 0} onClick={() => move(id, -1)} className="p-1 disabled:opacity-25"><ChevronUp size={15} /></button><button type="button" disabled={index === order.length - 1} onClick={() => move(id, 1)} className="p-1 disabled:opacity-25"><ChevronDown size={15} /></button></div>; })}</div>}
    </div>
    <div className="module-list-scroll"><table className="w-full table-fixed text-xs"><colgroup>{visible.map((column) => <col key={column.id} style={{ width: columnWidths[column.id] || 180 }} />)}</colgroup><thead><tr className="border-b bg-gray-50 text-left text-[10px] uppercase tracking-wider text-gray-500">{visible.map((column) => <th key={column.id} className={`relative px-4 py-2 font-black ${column.align === "right" ? "text-right" : ""}`}><button type="button" onClick={() => setSort((current) => ({ key: column.id, direction: current.key === column.id && current.direction === "asc" ? "desc" : "asc" }))} className="inline-flex max-w-full items-center gap-1 hover:text-blue-700"><span className="truncate">{column.label}</span><span aria-hidden="true">{sort.key === column.id ? (sort.direction === "asc" ? "▲" : "▼") : "↕"}</span></button><span onMouseDown={(event) => startColumnResize(event, column.id)} className="absolute right-0 top-0 h-full w-3 cursor-col-resize border-r-2 border-transparent hover:border-blue-500" title="Drag to resize column" /></th>)}</tr></thead><tbody>{sortedRows.map((row) => <tr key={row.id} tabIndex={0} onClick={() => onRowClick(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onRowClick(row); }} className="cursor-pointer border-b border-gray-100 text-xs font-semibold text-slate-700 transition hover:bg-blue-50">{visible.map((column) => <td key={column.id} className={`truncate px-4 py-2 ${column.align === "right" ? "text-right" : ""}`}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>
  </div>;
}
