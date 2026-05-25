import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { uploadReceipt } from '../api/receipts';

export default function ReceiptUploadModal({ onClose, onUploaded }) {
  const [file,       setFile]       = useState(null);
  const [preview,    setPreview]    = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [err,        setErr]        = useState('');
  const inputRef = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setErr('Envie apenas imagens (JPG, PNG, WEBP).');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setErr('Arquivo muito grande. Máximo 10 MB.');
      return;
    }
    setErr('');
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const { data } = await uploadReceipt(file);
      onUploaded(data.data);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Erro ao processar imagem. Tente novamente.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -12 }}
        animate={{ opacity: 1, scale: 1,    y: 0    }}
        exit={{    opacity: 0, scale: 0.97, y: -12  }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-md shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white">📷 Enviar Nota Fiscal</h2>
            <p className="text-xs text-gray-400 mt-0.5">IA irá extrair os dados automaticamente</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
              preview
                ? 'border-green-500/40 bg-green-500/5'
                : 'border-white/15 bg-gray-800/50 hover:border-white/30 hover:bg-gray-800'
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files[0])}
            />

            {preview ? (
              <div className="p-3 text-center">
                <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                <p className="text-xs text-green-400 mt-2 font-medium">✓ {file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(0)} KB · clique para trocar</p>
              </div>
            ) : (
              <div className="py-10 text-center px-4">
                <div className="text-4xl mb-3">📄</div>
                <p className="text-sm text-gray-400 font-medium">Arraste a foto ou clique para selecionar</p>
                <p className="text-xs text-gray-600 mt-1">JPG, PNG, WEBP · até 10 MB</p>
              </div>
            )}
          </div>

          {/* Dica WhatsApp */}
          <div className="flex gap-2 items-start bg-blue-500/8 border border-blue-500/20 rounded-xl p-3">
            <span className="shrink-0 mt-0.5">💬</span>
            <p className="text-xs text-blue-300">
              Você também pode enviar a foto da nota diretamente pelo WhatsApp — a IA processa automaticamente.
            </p>
          </div>

          {err && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
              {err}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button onClick={onClose} className="btn-ghost px-4 py-2 text-sm">
              Cancelar
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="btn-blue px-5 py-2 text-sm disabled:opacity-50"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Processando IA…
                </span>
              ) : '🔍 Processar com IA'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
