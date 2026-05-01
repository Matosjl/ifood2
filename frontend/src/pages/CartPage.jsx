// Carrinho + Checkout — app cliente.
// Lista itens, permite editar quantidades, coleta dados do cliente e finaliza pedido.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { pedidosService, extractError } from "@/services/api";
import { salvarPedidoLocal } from "@/pages/MeusPedidos";
import { useToast } from "@/hooks/useToast";

const PAGAMENTOS = [
  { id: "pix",       label: "Pix",             icon: "📲" },
  { id: "dinheiro",  label: "Dinheiro",         icon: "💵" },
  { id: "credito",   label: "Cartão Crédito",   icon: "💳" },
  { id: "debito",    label: "Cartão Débito",    icon: "🏦" },
];

export default function CartPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { itens, totalItens, totalValor, restauranteId, restauranteNome, adicionar, decrementar, remover, limpar } = useCart();

  const [nome, setNome] = useState("");
  const [tel, setTel] = useState("");
  const [obs, setObs] = useState("");
  const [pagamento, setPagamento] = useState("pix");
  const [tipo, setTipo] = useState("retirada"); // retirada | delivery
  const [endereco, setEndereco] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const taxaEntrega = tipo === "delivery" ? 5.00 : 0;
  const total = totalValor + taxaEntrega;

  const handleFinalizar = async () => {
    if (enviando || totalItens === 0) return;
    if (!nome.trim()) { setErro("Informe seu nome para continuar."); return; }
    setErro("");
    setEnviando(true);
    try {
      const res = await pedidosService.criar({
        restauranteId,
        clienteNome: nome.trim(),
        clienteTelefone: tel.trim(),
        tipo,
        pagamento,
        observacao: obs.trim() || undefined,
        endereco: tipo === "delivery" ? endereco.trim() : undefined,
        itens: itens.map((i) => ({
          id: i.id,
          nome: i.nome,
          qtd: i.qtd,
          precoUnitario: i.precoVenda,
        })),
      });
      const pedidoId = res.id || res._id;
      salvarPedidoLocal(pedidoId);
      limpar();
      navigate(`/app/pedido/${pedidoId}`, { replace: true });
    } catch (err) {
      setErro(extractError(err));
      toast.error(extractError(err));
    } finally {
      setEnviando(false);
    }
  };

  // ── Carrinho vazio ──────────────────────────────────────────────────────────
  if (totalItens === 0) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-16 text-center">
        <p className="text-6xl mb-4">🛒</p>
        <h2 className="text-xl font-bold text-white mb-2">Carrinho vazio</h2>
        <p className="text-zinc-500 text-sm mb-8">Adicione itens do cardápio para fazer seu pedido.</p>
        <button onClick={() => navigate("/app")}
          className="bg-emerald-500 text-black font-bold px-8 py-3 rounded-2xl">
          Ver restaurantes
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-5 pb-8">
      {/* ── Header ── */}
      <header className="pt-8 pb-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-white">
          ←
        </button>
        <div>
          <h1 className="text-lg font-bold text-white">Seu Carrinho</h1>
          <p className="text-[11px] text-zinc-500">{restauranteNome}</p>
        </div>
      </header>

      {/* ── Itens ── */}
      <div className="flex flex-col gap-3 mb-6">
        {itens.map((item) => (
          <div key={item.id} className="flex items-center gap-3 bg-white/3 rounded-2xl p-3 border border-white/5">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-500/20 to-zinc-800 shrink-0 flex items-center justify-center">
              {item.foto
                ? <img src={item.foto} alt={item.nome} className="w-full h-full object-cover" />
                : <span className="text-2xl opacity-40">🍽</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{item.nome}</p>
              <p className="text-emerald-400 text-xs font-semibold mt-0.5">
                R$ {(item.precoVenda * item.qtd).toFixed(2).replace(".", ",")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => decrementar(item.id)}
                className="w-7 h-7 rounded-full bg-white/10 text-white font-bold flex items-center justify-center text-sm hover:bg-white/20 transition-colors">
                −
              </button>
              <span className="text-white font-bold text-sm w-4 text-center">{item.qtd}</span>
              <button onClick={() => adicionar(item, restauranteId, restauranteNome)}
                className="w-7 h-7 rounded-full bg-emerald-500 text-black font-bold flex items-center justify-center text-sm hover:bg-emerald-400 transition-colors">
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tipo de entrega ── */}
      <div className="mb-5">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Tipo</p>
        <div className="flex gap-2">
          {[
            { id: "retirada", label: "Retirada", icon: "🏃" },
            { id: "delivery", label: "Delivery",  icon: "🛵" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`flex-1 py-3 rounded-2xl text-sm font-bold transition-all ${
                tipo === t.id ? "bg-emerald-500 text-black" : "bg-white/5 text-zinc-400"
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Dados do cliente ── */}
      <div className="flex flex-col gap-3 mb-5">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Seus dados</p>

        <input
          type="text" value={nome} onChange={(e) => setNome(e.target.value)}
          placeholder="Seu nome *"
          className="w-full bg-white/5 border border-white/8 rounded-2xl text-white text-sm px-4 py-3.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
        />
        <input
          type="tel" value={tel} onChange={(e) => setTel(e.target.value)}
          placeholder="WhatsApp (opcional)"
          className="w-full bg-white/5 border border-white/8 rounded-2xl text-white text-sm px-4 py-3.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
        />
        {tipo === "delivery" && (
          <input
            type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)}
            placeholder="Endereço de entrega *"
            className="w-full bg-white/5 border border-white/8 rounded-2xl text-white text-sm px-4 py-3.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
          />
        )}
        <textarea
          value={obs} onChange={(e) => setObs(e.target.value)} rows={2}
          placeholder="Observações (sem cebola, ponto da carne…)"
          className="w-full bg-white/5 border border-white/8 rounded-2xl text-white text-sm px-4 py-3.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600 resize-none"
        />
      </div>

      {/* ── Pagamento ── */}
      <div className="mb-6">
        <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Pagamento</p>
        <div className="grid grid-cols-2 gap-2">
          {PAGAMENTOS.map((pg) => (
            <button key={pg.id} onClick={() => setPagamento(pg.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold transition-all ${
                pagamento === pg.id
                  ? "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10"
              }`}>
              <span>{pg.icon}</span>
              <span>{pg.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Resumo ── */}
      <div className="bg-white/3 rounded-2xl p-4 mb-5 border border-white/5">
        <div className="flex justify-between text-sm text-zinc-400 mb-2">
          <span>Subtotal</span>
          <span>R$ {totalValor.toFixed(2).replace(".", ",")}</span>
        </div>
        {tipo === "delivery" && (
          <div className="flex justify-between text-sm text-zinc-400 mb-2">
            <span>Taxa de entrega</span>
            <span>R$ {taxaEntrega.toFixed(2).replace(".", ",")}</span>
          </div>
        )}
        <div className="border-t border-white/8 mt-3 pt-3 flex justify-between font-bold text-white">
          <span>Total</span>
          <span className="text-emerald-400">R$ {total.toFixed(2).replace(".", ",")}</span>
        </div>
      </div>

      {/* ── Erro ── */}
      {erro && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-2xl px-4 py-3">
          <p className="text-red-400 text-sm">{erro}</p>
        </div>
      )}

      {/* ── Botão finalizar ── */}
      <button
        onClick={handleFinalizar} disabled={enviando}
        className="w-full bg-emerald-500 text-black font-black rounded-2xl py-4 text-base hover:bg-emerald-400 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-emerald-500/20">
        {enviando ? "Enviando pedido…" : `Pedir agora · R$ ${total.toFixed(2).replace(".", ",")}`}
      </button>
    </div>
  );
}
