import { useState, useRef } from "react";

const PAYMENT_METHODS = ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "PIX", "Vale Refeição"];

const emptyAddress = { rua: "", cep: "", numero: "", referencia: "", foto: null };
const emptyOrder = {
  cliente: "", telefone: "", tipo: "retirada",
  pagamento: "", pago: false, agendado: false,
  horarioAgendado: "", observacao: "", tempo: 30,
};

export function NovoPedido({ onPedidoCriado, itensEstoque = [] }) {
  const [form, setForm] = useState(emptyOrder);
  const [endereco, setEndereco] = useState(emptyAddress);
  const [itensPedido, setItensPedido] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(null);
  const fileRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setEnd = (k, v) => setEndereco(e => ({ ...e, [k]: v }));

  const handleFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setFotoPreview(ev.target.result); setEnd("foto", ev.target.result); };
    reader.readAsDataURL(file);
  };

  const addItem = (item) => {
    setItensPedido(prev => {
      const ex = prev.find(i => i.id === item.id);
      if (ex) return prev.map(i => i.id === item.id ? { ...i, qtd: i.qtd + 1 } : i);
      return [...prev, { ...item, qtd: 1 }];
    });
  };

  const removeItem = (id) => setItensPedido(prev => prev.filter(i => i.id !== id));

  const total = itensPedido.reduce((s, i) => s + i.salePrice * i.qtd, 0);

  const handleFinalizar = () => {
    if (!form.cliente || itensPedido.length === 0) return;
    if (!form.pago) { setShowPayment(true); return; }
    if (form.tipo === "entrega" && (!endereco.rua || !endereco.numero)) return;

    const pedido = {
      id: Date.now(),
      ...form,
      endereco: form.tipo === "entrega" ? endereco : null,
      itens: itensPedido,
      total,
      status: form.agendado ? "agendado" : "pendente",
      criadoEm: new Date().toISOString(),
    };
    onPedidoCriado?.(pedido);
    setForm(emptyOrder);
    setEndereco(emptyAddress);
    setItensPedido([]);
    setFotoPreview(null);
    setShowPayment(false);
  };

  const confirmarPagamento = (metodo) => {
    set("pagamento", metodo);
    set("pago", true);
    setShowPayment(false);
  };

  return (
    <div className="flex flex-col gap-4 p-4 max-w-2xl mx-auto w-full">
      <h2 className="font-mono text-[#00E559] text-sm tracking-widest">NOVO PEDIDO</h2>

      {/* Cliente */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">NOME DO CLIENTE *</label>
            <input value={form.cliente} onChange={e => set("cliente", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              placeholder="Nome do cliente" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">TELEFONE</label>
            <input value={form.telefone} onChange={e => set("telefone", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
              placeholder="(00) 00000-0000" />
          </div>
        </div>

        {/* Tipo */}
        <div className="flex gap-3">
          {["retirada", "entrega"].map(t => (
            <button key={t} type="button" onClick={() => set("tipo", t)}
              className={`font-mono text-xs px-4 py-2 border transition-colors ${form.tipo === t ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10" : "border-[#27272A] text-[#71717A] hover:border-[#3F3F46]"}`}>
              {t === "retirada" ? "🏪 RETIRADA" : "🛵 ENTREGA"}
            </button>
          ))}
        </div>

        {/* Tempo estimado */}
        <div className="flex items-center gap-3">
          <label className="font-mono text-xs text-[#71717A]">TEMPO ESTIMADO (min):</label>
          <input type="number" min="5" max="180" value={form.tempo} onChange={e => set("tempo", e.target.value)}
            className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 w-20 focus:outline-none focus:border-[#00E559]" />
        </div>

        {/* Agendamento */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.agendado} onChange={e => set("agendado", e.target.checked)}
              className="accent-[#00E559]" />
            <span className="font-mono text-xs text-[#71717A]">AGENDAR HORÁRIO</span>
          </label>
          {form.agendado && (
            <input type="datetime-local" value={form.horarioAgendado} onChange={e => set("horarioAgendado", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] w-fit" />
          )}
        </div>
      </div>

      {/* Endereço de entrega */}
      {form.tipo === "entrega" && (
        <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
          <span className="font-mono text-xs text-[#FFB800] tracking-widest">ENDEREÇO DE ENTREGA</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="font-mono text-xs text-[#71717A]">RUA *</label>
              <input value={endereco.rua} onChange={e => setEnd("rua", e.target.value)}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
                placeholder="Nome da rua" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[#71717A]">CEP (opcional)</label>
              <input value={endereco.cep} onChange={e => setEnd("cep", e.target.value)}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
                placeholder="00000-000" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-xs text-[#71717A]">NÚMERO *</label>
              <input value={endereco.numero} onChange={e => setEnd("numero", e.target.value)}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
                placeholder="123" />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="font-mono text-xs text-[#71717A]">PONTO DE REFERÊNCIA</label>
              <input value={endereco.referencia} onChange={e => setEnd("referencia", e.target.value)}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]"
                placeholder="Ex: Próximo ao mercado X" />
            </div>
          </div>

          {/* Foto da casa */}
          <div className="flex flex-col gap-2">
            <label className="font-mono text-xs text-[#71717A]">FOTO DA FRENTE DA CASA (para o entregador)</label>
            <div className="flex items-center gap-3">
              {fotoPreview && (
                <img src={fotoPreview} alt="casa" className="w-16 h-16 object-cover border border-[#27272A]" />
              )}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="font-mono text-xs px-3 py-2 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors">
                📷 {fotoPreview ? "TROCAR FOTO" : "ADICIONAR FOTO"}
              </button>
              {fotoPreview && (
                <button type="button" onClick={() => { setFotoPreview(null); setEnd("foto", null); fileRef.current.value = ""; }}
                  className="font-mono text-xs text-[#FF4444] hover:text-red-300">✕ REMOVER</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
            </div>
          </div>
        </div>
      )}

      {/* Itens do pedido */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
        <span className="font-mono text-xs text-[#71717A] tracking-widest">ITENS DO PEDIDO</span>
        {itensEstoque.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {itensEstoque.map(item => (
              <button key={item.id} type="button" onClick={() => addItem(item)}
                className="font-mono text-xs px-3 py-1 border border-[#27272A] text-[#EDEDED] hover:border-[#00E559] hover:text-[#00E559] transition-colors">
                + {item.name} — R$ {Number(item.salePrice).toFixed(2)}
              </button>
            ))}
          </div>
        ) : (
          <span className="font-mono text-xs text-[#3F3F46]">Nenhum item no estoque. Adicione itens primeiro.</span>
        )}

        {itensPedido.length > 0 && (
          <div className="flex flex-col gap-1 mt-2">
            {itensPedido.map(i => (
              <div key={i.id} className="flex justify-between items-center border-b border-[#27272A] py-1">
                <span className="font-mono text-xs text-[#EDEDED]">{i.name} x{i.qtd}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[#00E559]">R$ {(i.salePrice * i.qtd).toFixed(2)}</span>
                  <button onClick={() => removeItem(i.id)} className="font-mono text-xs text-[#FF4444]">✕</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <span className="font-mono text-xs text-[#71717A]">TOTAL</span>
              <span className="font-mono text-sm text-[#00E559] font-bold">R$ {total.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Pagamento */}
      <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-[#71717A]">PAGAMENTO:</span>
          {form.pago ? (
            <span className="font-mono text-xs text-[#00E559]">✓ PAGO — {form.pagamento}</span>
          ) : (
            <span className="font-mono text-xs text-[#FF4444]">NÃO PAGO</span>
          )}
          <button type="button" onClick={() => setShowPayment(!showPayment)}
            className="font-mono text-xs px-3 py-1 border border-[#27272A] text-[#71717A] hover:border-[#FFB800] hover:text-[#FFB800] transition-colors ml-auto">
            {form.pago ? "ALTERAR" : "REGISTRAR PAGAMENTO"}
          </button>
        </div>
        {showPayment && (
          <div className="flex flex-wrap gap-2 mt-2">
            {PAYMENT_METHODS.map(m => (
              <button key={m} type="button" onClick={() => confirmarPagamento(m)}
                className="font-mono text-xs px-3 py-2 border border-[#27272A] text-[#EDEDED] hover:border-[#00E559] hover:text-[#00E559] transition-colors">
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Observação */}
      <textarea value={form.observacao} onChange={e => set("observacao", e.target.value)}
        placeholder="Observações do pedido..."
        rows={2}
        className="bg-[#0A0A0A] border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] resize-none" />

      {/* Botão finalizar */}
      <button type="button" onClick={handleFinalizar}
        disabled={!form.cliente || itensPedido.length === 0}
        className="bg-[#00E559] text-black font-mono text-xs font-bold py-3 px-6 hover:bg-[#00c44d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
        {!form.pago ? "⚠ FINALIZAR PEDIDO (PAGAMENTO PENDENTE)" : "✓ FINALIZAR PEDIDO"}
      </button>
    </div>
  );
}
