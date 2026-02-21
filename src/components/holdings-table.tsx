"use client";

interface TaxLot {
  id: string;
  asset: string;
  amount: number;
  originalAmount: number;
  costBasisPerUnit: number;
  acquisitionDate: string;
  acquisitionType: string;
  wallet: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtAmount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

interface HoldingsTableProps {
  lots: TaxLot[];
}

export function HoldingsTable({ lots }: HoldingsTableProps) {
  if (lots.length === 0) return null;

  // Group by asset for summary
  const byAsset = lots.reduce(
    (acc, lot) => {
      if (!acc[lot.asset]) acc[lot.asset] = { amount: 0, totalBasis: 0 };
      acc[lot.asset].amount += lot.amount;
      acc[lot.asset].totalBasis += lot.amount * lot.costBasisPerUnit;
      return acc;
    },
    {} as Record<string, { amount: number; totalBasis: number }>,
  );

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">
        Remaining Holdings (Unrealized)
      </h3>

      {/* Asset summary badges */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(byAsset).map(([asset, data]) => (
          <div
            key={asset}
            className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs"
          >
            <span className="font-mono font-medium">{fmtAmount(data.amount)}</span>{" "}
            <span className="text-muted">{asset}</span>
            <span className="text-muted ml-2">
              (basis: {fmtUsd(data.totalBasis)})
            </span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-card-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-card-border bg-card">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Asset
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  Remaining
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  Basis/Unit
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  Total Basis
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Acquired
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Wallet
                </th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr
                  key={lot.id}
                  className="border-b border-card-border/50 hover:bg-card/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono font-medium">
                    {lot.asset}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtAmount(lot.amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtUsd(lot.costBasisPerUnit)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    {fmtUsd(lot.amount * lot.costBasisPerUnit)}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {fmtDate(lot.acquisitionDate)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted">
                      {lot.acquisitionType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{lot.wallet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
