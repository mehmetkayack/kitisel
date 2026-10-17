import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  /** Sayısal sütunlar sağa hizalı ve tabular-nums */
  numeric?: boolean;
  className?: string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Ekran okuyucular için tablo başlığı */
  caption: ReactNode;
  captionHidden?: boolean;
  empty: ReactNode;
  className?: string;
}

/** Basit, erişilebilir tablo. Dar ekranda yatay kaydırılır. */
export function DataTable<Row>({ columns, rows, rowKey, caption, captionHidden = true, empty, className }: DataTableProps<Row>) {
  return (
    <div className={cn('overflow-x-auto rounded-card border border-border bg-surface', className)}>
      <table className="w-full border-collapse text-sm">
        <caption className={cn('px-4 py-3 text-left font-medium text-ink', captionHidden && 'sr-only')}>{caption}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-muted">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('px-4 py-3 text-left font-medium whitespace-nowrap text-ink-muted', c.numeric && 'text-right', c.className)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border last:border-b-0 hover:bg-surface-muted/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-3 text-ink', c.numeric && 'text-right tabular-nums', c.className)}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
