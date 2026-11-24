import { useRef, useState } from 'react';
import { Camera, FileText, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import {
  CATEGORIES,
  type CategoryId,
  type ParsedDraftItem,
  type PriceTrendAnalysis,
} from '../types/inventory';
import {
  addDaysToIso,
  calculateReceiptTotals,
  formatBRL,
  inferCategoryFromName,
  inferShelfLifeDays,
  normalizeProductKey,
  parseRawReceiptTextLocally,
} from '../utils/analytics';
import { createDemoScannedReceipt } from '../data/seedData';

interface ReceiptScannerModalProps {
  isOpen: boolean;
  priceTrends: PriceTrendAnalysis[];
  onClose: () => void;
  onConfirmReceipt: (payload: {
    storeName: string;
    purchaseDate: string;
    source: 'ocr_photo' | 'local_text' | 'demo_seed';
    items: ParsedDraftItem[];
  }) => void;
}

type ImportMode = 'photo' | 'text';

interface ApiParsedItem {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  suggestedShelfLifeDays?: number;
  estimatedMarketPrice?: number;
}

interface ApiParseResponse {
  storeName?: string;
  purchaseDate?: string;
  items?: ApiParsedItem[];
  error?: string;
}

export function ReceiptScannerModal({
  isOpen,
  priceTrends,
  onClose,
  onConfirmReceipt,
}: ReceiptScannerModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ImportMode>('photo');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);
  const [storeName, setStoreName] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayIso);
  const [sourceType, setSourceType] = useState<'ocr_photo' | 'local_text' | 'demo_seed'>('ocr_photo');
  const [draftItems, setDraftItems] = useState<ParsedDraftItem[]>([]);
  const [rawTextInput, setRawTextInput] = useState(
    'Atacadão Sul\n17/11/2026\nARROZ BRANCO 5KG 3 pct x 22,50\nFEIJAO PRETO 1KG 6 pct x 6,40\nSARDINHA LATA 125G 10 lata x 5,10'
  );

  if (!isOpen) return null;

  const trendLookup = new Map<string, PriceTrendAnalysis>();
  for (const t of priceTrends) {
    trendLookup.set(t.productKey, t);
  }

  function resolveCategory(raw: string, productName: string): CategoryId {
    if (CATEGORIES.includes(raw as CategoryId)) {
      return raw as CategoryId;
    }
    return inferCategoryFromName(productName);
  }

  function mapReferencePrice(productName: string, fallbackMarketPrice?: number, unitPrice?: number): number {
    const key = normalizeProductKey(productName);
    const existing = trendLookup.get(key);
    if (existing) return existing.averagePrice;
    if (fallbackMarketPrice && fallbackMarketPrice > 0) return fallbackMarketPrice;
    return unitPrice ?? 0;
  }

  async function handleFileSelected(file: File) {
    setErrorMsg(null);
    setIsLoading(true);
    setSourceType('ocr_photo');

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
        reader.readAsDataURL(file);
      });

      setPreviewUrl(dataUrl);

      const response = await fetch('/api/parse-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: file.type || 'image/jpeg',
          todayIso,
        }),
      });

      const data = (await response.json()) as ApiParseResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Não foi possível extrair os itens da foto.');
      }

      const detectedDate = data.purchaseDate || todayIso;
      setStoreName(data.storeName || 'Mercado');
      setPurchaseDate(detectedDate);

      const mapped: ParsedDraftItem[] = (data.items ?? []).map((item, idx) => {
        const cat = resolveCategory(item.category, item.name);
        const shelfDays = item.suggestedShelfLifeDays && item.suggestedShelfLifeDays > 0
          ? item.suggestedShelfLifeDays
          : inferShelfLifeDays(cat);
        return {
          tempId: `ocr-${idx}-${Date.now()}`,
          name: item.name,
          category: cat,
          quantity: item.quantity > 0 ? item.quantity : 1,
          unit: item.unit || 'un',
          unitPrice: item.unitPrice > 0 ? item.unitPrice : 0,
          referencePrice: mapReferencePrice(item.name, item.estimatedMarketPrice, item.unitPrice),
          expiryDate: addDaysToIso(detectedDate, shelfDays),
        };
      });

      if (mapped.length === 0) {
        setErrorMsg('Nenhum item legível foi encontrado na imagem. Tente outra foto ou adicione manualmente.');
      } else {
        setDraftItems(mapped);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado ao processar imagem.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleParseLocalText() {
    setErrorMsg(null);
    const parsed = parseRawReceiptTextLocally(rawTextInput, todayIso, priceTrends);
    if (parsed.items.length === 0) {
      setErrorMsg('Não foi possível identificar linhas com preço no texto. Use formato: "PRODUTO 2 un x 10,50".');
      return;
    }
    setSourceType('local_text');
    setStoreName(parsed.storeName);
    setPurchaseDate(parsed.purchaseDate);
    setDraftItems(parsed.items);
  }

  function handleLoadDemoReceipt() {
    setErrorMsg(null);
    const demo = createDemoScannedReceipt(todayIso);
    setSourceType('demo_seed');
    setStoreName(demo.storeName);
    setPurchaseDate(demo.purchaseDate);
    setDraftItems(
      demo.items.map((item) => ({
        ...item,
        referencePrice: mapReferencePrice(item.name, item.referencePrice, item.unitPrice),
      }))
    );
  }

  function updateDraftItem(tempId: string, patch: Partial<ParsedDraftItem>) {
    setDraftItems((prev) =>
      prev.map((item) => (item.tempId === tempId ? { ...item, ...patch } : item))
    );
  }

  function removeDraftItem(tempId: string) {
    setDraftItems((prev) => prev.filter((item) => item.tempId !== tempId));
  }

  function addBlankDraftItem() {
    setDraftItems((prev) => [
      ...prev,
      {
        tempId: `manual-${Date.now()}`,
        name: 'Novo Item',
        category: 'Outros',
        quantity: 1,
        unit: 'un',
        unitPrice: 10,
        referencePrice: 10,
        expiryDate: addDaysToIso(purchaseDate || todayIso, 180),
      },
    ]);
  }

  function handleSave() {
    if (draftItems.length === 0) {
      setErrorMsg('Adicione ou extraia pelo menos um item antes de confirmar.');
      return;
    }
    const invalid = draftItems.some((i) => !i.name.trim() || i.quantity <= 0 || i.unitPrice <= 0);
    if (invalid) {
      setErrorMsg('Verifique se todos os itens têm nome, quantidade e preço unitário maiores que zero.');
      return;
    }

    onConfirmReceipt({
      storeName: storeName.trim() || 'Mercado Local',
      purchaseDate: purchaseDate || todayIso,
      source: sourceType,
      items: draftItems,
    });
    setDraftItems([]);
    setPreviewUrl(null);
    onClose();
  }

  const totals = calculateReceiptTotals(draftItems);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 id="scanner-modal-title" className="text-lg font-bold text-slate-900">
              Leitura Automatizada de Cupom Fiscal
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Extraia produtos, quantidades e validades por foto (OCR) ou processamento 100% local por texto.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de cupom fiscal"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Import Mode Switch & Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('photo')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === 'photo'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Foto do Cupom (OCR)</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('text')}
                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  mode === 'text'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Texto Local / Offline</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleLoadDemoReceipt}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors"
            >
              Carregar Cupom Exemplo (Teste Rápido)
            </button>
          </div>

          {errorMsg && (
            <div role="alert" className="p-3.5 rounded-lg border border-red-200 bg-red-50 text-xs font-medium text-red-800">
              {errorMsg}
            </div>
          )}

          {mode === 'photo' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center border border-dashed border-slate-300 rounded-xl p-5 bg-slate-50/50">
              <div className="md:col-span-8 space-y-2">
                <p className="text-sm font-semibold text-slate-900">
                  Suba uma foto legível do cupom fiscal (NFC-e / SAT)
                </p>
                <p className="text-xs text-slate-600">
                  O leitor identifica o mercado, data, itens, quantidades, preços unitários e sugere a validade por categoria. Os dados salvos ficam apenas no seu dispositivo.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    id="receipt-photo-input"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleFileSelected(file);
                    }}
                  />
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 rounded-lg"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span>{isLoading ? 'Lendo cupom fiscal...' : 'Selecionar Foto do Cupom'}</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-4 flex justify-center">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Prévia do cupom fiscal enviado"
                    className="max-h-36 rounded-lg border border-slate-200 object-contain bg-white"
                  />
                ) : (
                  <div className="h-28 w-full rounded-lg border border-slate-200 bg-white flex flex-col items-center justify-center text-xs text-slate-400">
                    <Camera className="w-6 h-6 mb-1" aria-hidden="true" />
                    <span>Prévia da imagem</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 border border-slate-200 rounded-xl p-4 bg-slate-50/40">
              <label htmlFor="local-receipt-textarea" className="block text-xs font-medium text-slate-700">
                Cole as linhas do cupom fiscal (processado 100% no navegador, sem internet):
              </label>
              <textarea
                id="local-receipt-textarea"
                rows={5}
                value={rawTextInput}
                onChange={(e) => setRawTextInput(e.target.value)}
                className="w-full text-xs font-mono border border-slate-200 rounded-lg p-3 bg-white text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleParseLocalText}
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  Extrair Itens Localmente
                </button>
              </div>
            </div>
          )}

          {/* Review Extracted Items */}
          {draftItems.length > 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
                <div>
                  <label htmlFor="draft-store-name" className="block text-xs font-medium text-slate-700 mb-1">
                    Estabelecimento
                  </label>
                  <input
                    id="draft-store-name"
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="draft-purchase-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Data da Compra
                  </label>
                  <input
                    id="draft-purchase-date"
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full text-sm font-mono tabular-nums border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  Itens Extraídos para Revisão ({draftItems.length})
                </h3>
                <button
                  type="button"
                  onClick={addBlankDraftItem}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Adicionar linha</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                      <th className="py-2.5 px-3">Produto</th>
                      <th className="py-2.5 px-2">Categoria</th>
                      <th className="py-2.5 px-2 text-right">Qtd</th>
                      <th className="py-2.5 px-2">Un.</th>
                      <th className="py-2.5 px-2 text-right">Unit. (R$)</th>
                      <th className="py-2.5 px-2 text-right">Ref./Hist.</th>
                      <th className="py-2.5 px-2">Validade</th>
                      <th className="py-2.5 px-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {draftItems.map((item) => {
                      const diff = item.referencePrice - item.unitPrice;
                      return (
                        <tr key={item.tempId}>
                          <td className="py-2 px-3 min-w-[180px]">
                            <input
                              type="text"
                              aria-label={`Nome do produto ${item.name}`}
                              value={item.name}
                              onChange={(e) =>
                                updateDraftItem(item.tempId, { name: e.target.value })
                              }
                              className="w-full border border-slate-200 rounded px-2 py-1 text-slate-900"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <select
                              aria-label={`Categoria de ${item.name}`}
                              value={item.category}
                              onChange={(e) =>
                                updateDraftItem(item.tempId, {
                                  category: e.target.value as CategoryId,
                                })
                              }
                              className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-900"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-2 w-20">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              aria-label={`Quantidade de ${item.name}`}
                              value={item.quantity}
                              onChange={(e) =>
                                updateDraftItem(item.tempId, {
                                  quantity: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-full text-right font-mono tabular-nums border border-slate-200 rounded px-2 py-1"
                            />
                          </td>
                          <td className="py-2 px-2 w-16">
                            <input
                              type="text"
                              aria-label={`Unidade de ${item.name}`}
                              value={item.unit}
                              onChange={(e) =>
                                updateDraftItem(item.tempId, { unit: e.target.value })
                              }
                              className="w-full border border-slate-200 rounded px-2 py-1"
                            />
                          </td>
                          <td className="py-2 px-2 w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              aria-label={`Preço unitário de ${item.name}`}
                              value={item.unitPrice}
                              onChange={(e) =>
                                updateDraftItem(item.tempId, {
                                  unitPrice: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-full text-right font-mono tabular-nums border border-slate-200 rounded px-2 py-1"
                            />
                          </td>
                          <td className="py-2 px-2 w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              aria-label={`Preço de referência de ${item.name}`}
                              value={item.referencePrice}
                              onChange={(e) =>
                                updateDraftItem(item.tempId, {
                                  referencePrice: parseFloat(e.target.value) || 0,
                                })
                              }
                              className="w-full text-right font-mono tabular-nums border border-slate-200 rounded px-2 py-1"
                            />
                            {Math.abs(diff) > 0.05 && (
                              <span
                                className={`block text-[10px] text-right font-mono mt-0.5 ${
                                  diff > 0 ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {diff > 0 ? `-${formatBRL(diff)}` : `+${formatBRL(Math.abs(diff))}`}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            <input
                              type="date"
                              aria-label={`Validade de ${item.name}`}
                              value={item.expiryDate}
                              onChange={(e) =>
                                updateDraftItem(item.tempId, { expiryDate: e.target.value })
                              }
                              className="font-mono tabular-nums border border-slate-200 rounded px-2 py-1"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeDraftItem(item.tempId)}
                              aria-label={`Remover linha ${item.name}`}
                              className="p-1.5 text-slate-400 hover:text-red-700 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs font-mono tabular-nums text-slate-600">
            {draftItems.length > 0 ? (
              <span>
                Total Pago: <strong className="text-slate-900">{formatBRL(totals.totalPaid)}</strong> ·{' '}
                Economia neste cupom:{' '}
                <strong className={totals.netSavings >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                  {totals.netSavings >= 0 ? '+' : ''}
                  {formatBRL(totals.netSavings)}
                </strong>
              </span>
            ) : (
              <span>Envie uma foto, cole texto local ou carregue o cupom exemplo.</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={draftItems.length === 0 || isLoading}
              onClick={handleSave}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors"
            >
              Confirmar Entrada no Estoque
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
