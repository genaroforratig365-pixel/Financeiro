let loadingPromise: Promise<any> | null = null;

const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';

declare global {
  interface Window {
    XLSX?: any;
  }
}

export async function loadSheetJS(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('loadSheetJS só pode ser chamado no navegador.');
  }

  if (window.XLSX) {
    return window.XLSX;
  }

  if (!loadingPromise) {
    loadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SHEETJS_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => {
        if (window.XLSX) {
          resolve(window.XLSX);
        } else {
          reject(new Error('SheetJS carregado, mas objeto XLSX não encontrado.'));
        }
      };
      script.onerror = () => {
        reject(new Error('Não foi possível carregar a biblioteca SheetJS.')); 
      };
      document.body.appendChild(script);
    });
  }

  return loadingPromise;
}
