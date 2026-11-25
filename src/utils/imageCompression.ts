export interface CompressedImageResult {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  estimatedKB: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível decodificar a imagem selecionada.'));
    img.src = src;
  });
}

/**
 * Comprime e redimensiona a foto do cupom fiscal no navegador via Canvas
 * (máximo 1600px no maior lado, formato JPEG) para acelerar o envio no celular
 * e respeitar confortavelmente o limite de payload (4,5 MB) da Vercel.
 */
export async function compressReceiptImage(
  file: File,
  maxDimension: number = 1600,
  quality: number = 0.82
): Promise<CompressedImageResult> {
  const originalDataUrl = await readFileAsDataUrl(file);

  if (typeof document === 'undefined') {
    return {
      dataUrl: originalDataUrl,
      mimeType: file.type || 'image/jpeg',
      width: 0,
      height: 0,
      estimatedKB: Math.round((originalDataUrl.length * 3) / 4 / 1024),
    };
  }

  try {
    const img = await loadImage(originalDataUrl);
    const { naturalWidth, naturalHeight } = img;
    let targetW = naturalWidth;
    let targetH = naturalHeight;

    if (Math.max(naturalWidth, naturalHeight) > maxDimension) {
      const scale = maxDimension / Math.max(naturalWidth, naturalHeight);
      targetW = Math.max(1, Math.round(naturalWidth * scale));
      targetH = Math.max(1, Math.round(naturalHeight * scale));
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        dataUrl: originalDataUrl,
        mimeType: file.type || 'image/jpeg',
        width: naturalWidth,
        height: naturalHeight,
        estimatedKB: Math.round((originalDataUrl.length * 3) / 4 / 1024),
      };
    }

    // Fundo branco evita transparência preta ao converter PNG para JPEG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    let compressed = canvas.toDataURL('image/jpeg', quality);

    // Se ainda ficar acima de ~3 MB (base64 ~4 MB), reduz qualidade progressivamente
    if (compressed.length > 3_600_000) {
      compressed = canvas.toDataURL('image/jpeg', 0.65);
    }

    return {
      dataUrl: compressed,
      mimeType: 'image/jpeg',
      width: targetW,
      height: targetH,
      estimatedKB: Math.round((compressed.length * 3) / 4 / 1024),
    };
  } catch {
    return {
      dataUrl: originalDataUrl,
      mimeType: file.type || 'image/jpeg',
      width: 0,
      height: 0,
      estimatedKB: Math.round((originalDataUrl.length * 3) / 4 / 1024),
    };
  }
}
