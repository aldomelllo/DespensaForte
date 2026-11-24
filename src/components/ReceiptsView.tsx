import { useState } from 'react';
import { Camera, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { ReceiptRecord } from '../types/inventory';
import { formatBRL, formatDateBR } from '../utils/analytics';

interface ReceiptsViewProps {
  receipts: ReceiptRecord[];
  onOpenScanner: () => void;
}

export function ReceiptsView({ receipts, onOpenScanner }: ReceiptsViewProps) {
  const [expandedId, setExpandedId] = useState<string | null>(receipts[0]?.id ?? null);

  const sortedReceipts = [...receipts].sort((a, b) =>
    b.purchaseDate.localeCompare(a.purchaseDate)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Cupons Fiscais Importados
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Histórico de notas analisadas e economia apurada em cada compra.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenScanner}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Camera className="w-4 h-4" aria-hidden="true" />
          <span>Escanear Novo Cupom</span>
        </button>
      </div>

      {sortedReceipts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <FileText className="w-8 h-8 text-slate-400 mx-auto" aria-hidden="true" />
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Nenhum cupom fiscal registrado
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Envie a foto de um cupom fiscal ou cole o texto da NFC-e para catalogar seus itens.
          </p>
          <button
            type="button"
            onClick={onOpenScanner}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
          >
            Escanear Primeiro Cupom
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedReceipts.map((receipt) => {
            const isExpanded = expandedId === receipt.id;
            const isPositive = receipt.netSavings >= 0;

            return (
              <section
                key={receipt.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : receipt.id)}
                  aria-expanded={isExpanded}
                  className="w-full px-6 py-4 text-left flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-700"
                >
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {receipt.storeName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {formatDateBR(receipt.purchaseDate)} · {receipt.itemCount} itens ·{' '}
                      {receipt.source === 'ocr_photo'
                        ? 'Leitura por foto'
                        : receipt.source === 'local_text'
                          ? 'Texto local'
                          : 'Registro inicial'}
                    </p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right font-mono tabular-nums">
                      <p className="text-sm font-semibold text-slate-900">
                        Pago {formatBRL(receipt.totalPaid)}
                      </p>
                      <p
                        className={`text-xs font-medium ${
                          isPositive ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {isPositive ? 'Economia +' : 'Acima '}
                        {formatBRL(Math.abs(receipt.netSavings))}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-xs font-medium text-slate-500">
                          <th className="py-2.5 px-6">Item</th>
                          <th className="py-2.5 px-4">Categoria</th>
                          <th className="py-2.5 px-4 text-right">Qtd</th>
                          <th className="py-2.5 px-4 text-right">Unit. Pago</th>
                          <th className="py-2.5 px-4 text-right">Ref.</th>
                          <th className="py-2.5 px-6 text-right">Validade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {receipt.items.map((item, idx) => (
                          <tr key={`${receipt.id}-${idx}`}>
                            <td className="py-2.5 px-6 font-medium text-slate-900">
                              {item.name}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-slate-600">
                              {item.category}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                              {formatBRL(item.unitPrice)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500">
                              {formatBRL(item.referencePrice)}
                            </td>
                            <td className="py-2.5 px-6 text-right font-mono tabular-nums text-xs text-slate-600">
                              {formatDateBR(item.expiryDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
