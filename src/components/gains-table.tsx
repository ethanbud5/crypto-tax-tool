"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from "@tanstack/react-table";

interface Form8949Row {
  description: string;
  dateAcquired: string;
  dateSold: string;
  proceeds: number;
  costBasis: number;
  gainOrLoss: number;
  isLongTerm: boolean;
  holdingDays: number;
}

const columnHelper = createColumnHelper<Form8949Row>();

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtUsd(n: number): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Math.abs(n));
  return n < 0 ? `-${formatted}` : formatted;
}

const columns = [
  columnHelper.accessor("description", {
    header: "Asset",
    cell: (info) => (
      <span className="font-medium font-mono">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("dateAcquired", {
    header: "Acquired",
    cell: (info) => <span className="text-muted">{fmtDate(info.getValue())}</span>,
  }),
  columnHelper.accessor("dateSold", {
    header: "Sold",
    cell: (info) => fmtDate(info.getValue()),
  }),
  columnHelper.accessor("proceeds", {
    header: "Proceeds",
    cell: (info) => (
      <span className="font-mono">{fmtUsd(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("costBasis", {
    header: "Cost Basis",
    cell: (info) => (
      <span className="font-mono">{fmtUsd(info.getValue())}</span>
    ),
  }),
  columnHelper.accessor("gainOrLoss", {
    header: "Gain/Loss",
    cell: (info) => {
      const val = info.getValue();
      return (
        <span
          className={`font-mono font-medium ${val >= 0 ? "text-gain" : "text-loss"}`}
        >
          {val >= 0 ? "+" : ""}
          {fmtUsd(val)}
        </span>
      );
    },
  }),
  columnHelper.accessor("isLongTerm", {
    header: "Term",
    cell: (info) => (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          info.getValue()
            ? "bg-blue-500/10 text-blue-400"
            : "bg-amber-500/10 text-amber-400"
        }`}
      >
        {info.getValue() ? "Long" : "Short"}
      </span>
    ),
  }),
  columnHelper.accessor("holdingDays", {
    header: "Days Held",
    cell: (info) => (
      <span className="text-muted">{info.getValue()}</span>
    ),
  }),
];

interface GainsTableProps {
  rows: Form8949Row[];
}

export function GainsTable({ rows }: GainsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [filter, setFilter] = useState("");

  const filteredData = useMemo(() => {
    if (!filter) return rows;
    const lower = filter.toLowerCase();
    return rows.filter(
      (r) =>
        r.description.toLowerCase().includes(lower) ||
        (r.isLongTerm ? "long" : "short").includes(lower),
    );
  }, [rows, filter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Form 8949 — Capital Gains & Losses
        </h3>
        <input
          type="text"
          placeholder="Filter by asset..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border border-card-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 w-48"
        />
      </div>

      <div className="rounded-xl border border-card-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-card-border bg-card">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        {header.column.getIsSorted() === "asc" && " \u2191"}
                        {header.column.getIsSorted() === "desc" && " \u2193"}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-muted text-sm"
                  >
                    No capital gains or losses for this year
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-card-border/50 hover:bg-card/50 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > 0 && (
        <p className="text-xs text-muted text-right">
          {filteredData.length} of {rows.length} entries
        </p>
      )}
    </div>
  );
}
