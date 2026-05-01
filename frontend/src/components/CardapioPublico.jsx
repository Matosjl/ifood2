import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const fmt  = (n) => Number(n || 0).toFixed(2).replace(".", ",");
const fmtR = (n) => `R$ ${fmt(n)}`;

// ── Carrinho flutuante ────────────────────────────────────────────────────────
const CartDrawer = ({
  carrinho, onClose, onFinalizar, restauranteName,
  clienteNome, setClienteNome, clienteTel, setClienteTel,
  pagamento, setPagamento, enviando, erroEnvio,
}) => {
  const total = carrinho.reduce((s, i) => s + (i.salePrice || 0) * i.qtd, 0);
  const PGTOS = ["pix", "dinheiro", "cartão de crédito", "cartão de débito"];

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-auto bg-[#111] border border-white/10 rounded-t-3xl p-6 flex flex-col gap-4 shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Seu pedido</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/8 text-zinc-400 hover:bg-white/15 flex items-center justify-center transition-colors">✕</button>
        </div>

        {/* Itens */}
        <div className="flex flex-col gap-3">
          {carrinho.map(item => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{item.name || item.nome}</p>
                <p className="text-xs text-zinc-500">{fmtR(item.salePrice || 0)} × {item.qtd}</p>
              </div>
              <span className="text-sm font-semibold text-emerald-400">{fmtR((item.salePrice || 0) * item.qtd)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/10 pt-3 flex justify-between items-center">
          <span className="text-sm text-zinc-400">Total</span>
          <span className="text-xl font-bold text-emerald-400">{fmtR(total)}</span>
        </div>

        {/* Dados do cliente */}
        <div className="flex flex-col gap-2 pt-1">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Seus dados</p>
          <input
            type="text" value={clienteNome} onChange={e => setClienteNome(e.target.value)}
            placeholder="Seu nome (opcional)"
            className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
          />
          <input
            type="tel" value={clienteTel} onChange={e => setClienteTel(e.target.value)}
            placeholder="Telefone (opcional)"
            className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm px-4 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
          />
        </div>

        {/* Pagamento */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {PGTOS.map(p => (
              <button key={p} onClick={() => setPagamento(p)}
                className={`py-2 rounded-xl text-xs font-semibold capitalize transition-all border ${
                  pagamento === p
                    ? "bg-emerald-500 border-emerald-500 text-black"
                    : "bg-white/5 border-white/10 text-zinc-400 hover:border-white/25"
                }`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Erro */}
        {erroEnvio && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
            <p className="text-xs text-red-400">{erroEnvio}</p>
          </div>
        )}

        <button
          onClick={onFinalizar}
          disabled={enviando}
          className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] disabled:opacity-50 text-black text-base font-bold transition-all">
          {enviando ? "Enviando…" : "Finalizar pedido"}
        </button>
      </div>
    </div>
  );
};

// ── Item card ─────────────────────────────────────────────────────────────────
const ItemCard = ({ item, qtd, onAdd, onDec }) => {
  const esgotado = (item.quantidade ?? item.stock ?? Infinity) <= 0;
  const preco = item.salePrice || item.precoVenda || 0;

  return (
    <div className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${
      esgotado ? "border-white/5 opacity-40" : "border-white/8 hover:border-white/16 hover:bg-white/3"
    }`}>
      {/* Foto ou placeholder */}
      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 bg-white/5 flex items-center justify-center">
        {item.foto || item.photo
          ? <img src={item.foto || item.photo} alt={item.name || item.nome} className="w-full h-full object-cover" />
          : <span className="text-2xl">🍽</span>
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{item.name || item.nome}</p>
        {item.description && <p className="text-xs text-zinc-500 truncate mt-0.5">{item.description}</p>}
        <p className="text-sm font-bold text-emerald-400 mt-1">{fmtR(preco)}{item.porKg ? "/kg" : ""}</p>
      </div>

      {esgotado ? (
        <span className="text-[10px] text-red-400 border border-red-400/30 rounded-lg px-2 py-1 shrink-0">Esgotado</span>
      ) : qtd > 0 ? (
        <div className="flex items-center gap-0 border border-white/12 rounded-xl overflow-hidden shrink-0">
          <button onClick={onDec} className="w-9 h-9 flex items-center justify-center text-zinc-300 hover:bg-white/8 text-lg font-light transition-colors">−</button>
          <span className="w-8 text-center text-sm font-bold text-white">{qtd}</span>
          <button onClick={onAdd} className="w-9 h-9 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10 text-lg font-light transition-colors">+</button>
        </div>
      ) : (
        <button onClick={onAdd}
          className="h-9 px-4 rounded-xl border border-emerald-500/50 text-emerald-400 text-xs font-bold hover:bg-emerald-500 hover:text-black hover:border-emerald-500 transition-all shrink-0 active:scale-95">
          + Add
        </button>
      )}
    </div>
  );
};

// ── Página principal ──────────────────────────────────────────────────────────
export function CardapioPublico() {
  const { id } = useParams();
  const [restaurante, setRestaurante] = useState(null);
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [carrinho, setCarrinho] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [catAtiva, setCatAtiva] = useState(null);
  const [busca, setBusca] = useState("");
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(null);
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [pagamento, setPagamento] = useState("pix");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await axios.get(`${API}/restaurantes/${id}`);
        setRestaurante(r.data);
        const e = await axios.get(`${API}/estoque/${r.data.id || id}`);
        const arr = Array.isArray(e.data) ? e.data : (e.data?.itens || []);
        setItens(arr.map(i => ({ ...i, name: i.nome, salePrice: i.precoVenda, category: i.categoria })));
      } catch {
        setErro("Cardápio não encontrado.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Agrupado por categoria
  const categorias = [...new Set(itens.map(i => i.category || i.categoria || "Geral"))];
  const itensFiltrados = busca.trim()
    ? itens.filter(i => (i.name || i.nome || "").toLowerCase().includes(busca.toLowerCase()))
    : itens;
  const grouped = categorias.reduce((acc, cat) => {
    acc[cat] = itensFiltrados.filter(i => (i.category || i.categoria || "Geral") === cat);
    return acc;
  }, {});

  const qtdItem  = (itemId) => carrinho.find(i => i.id === itemId)?.qtd || 0;
  const totalQtd = carrinho.reduce((s, i) => s + i.qtd, 0);

  const addItem = useCallback((item) => {
    setCarrinho(p => {
      const ex = p.find(i => i.id === item.id);
      if (ex) return p.map(i => i.id === item.id ? { ...i, qtd: i.qtd + 1 } : i);
      return [...p, { ...item, qtd: 1 }];
    });
  }, []);

  const decItem = useCallback((item) => {
    setCarrinho(p => {
      const ex = p.find(i => i.id === item.id);
      if (!ex) return p;
      if (ex.qtd === 1) return p.filter(i => i.id !== item.id);
      return p.map(i => i.id === item.id ? { ...i, qtd: i.qtd - 1 } : i);
    });
  }, []);

  const handleFinalizar = async () => {
    if (enviando) return;
    setErroEnvio(null);
    setEnviando(true);
    try {
      await axios.post(`${API}/pedidos`, {
        restauranteId: restaurante?.id || id,
        clienteNome:     clienteNome.trim() || "Cliente Balcão",
        clienteTelefone: clienteTel.trim(),
        tipo:            "retirada",
        pagamento:       pagamento,
        itens: carrinho.map(item => ({
          id:            item.id,
          nome:          item.name || item.nome || "",
          qtd:           item.qtd,
          precoUnitario: item.salePrice || item.precoVenda || 0,
        })),
        observacao: "",
      });
      setShowCart(false);
      setPedidoEnviado(true);
      setCarrinho([]);
      setClienteNome("");
      setClienteTel("");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Erro ao enviar pedido. Tente novamente.";
      setErroEnvio(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally {
      setEnviando(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-zinc-500 text-sm font-medium">Carregando cardápio…</p>
      </div>
    </div>
  );

  if (erro) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-4">🍽</p>
        <p className="text-zinc-400 text-sm">{erro}</p>
      </div>
    </div>
  );

  if (pedidoEnviado) return (
    <div className="min-h-screen bg-[#080808] flex items-center justify-center">
      <div className="text-center flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-4xl">✓</div>
        <p className="text-xl font-bold text-white">Pedido enviado!</p>
        <p className="text-zinc-500 text-sm">Aguarde a confirmação do restaurante.</p>
        <button onClick={() => setPedidoEnviado(false)} className="mt-4 px-6 py-2.5 rounded-xl border border-white/10 text-zinc-400 text-sm hover:border-white/25 hover:text-white transition-colors">
          Pedir mais
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#080808] text-white pb-32">

      {/* ── Hero ── */}
      <div className="relative w-full h-48 sm:h-64 bg-gradient-to-b from-emerald-900/20 to-[#080808] flex items-end">
        <div className="absolute inset-0 bg-[#080808]/60" />
        <div className="relative z-10 px-5 pb-6 w-full">
          <div className="flex items-end gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center text-3xl shrink-0">
              🍽
            </div>
            <div>
              <p className="text-[11px] text-emerald-400 font-semibold uppercase tracking-widest mb-1">Cardápio Digital</p>
              <h1 className="text-xl font-bold text-white leading-tight">{restaurante?.nome || id}</h1>
              {restaurante?.tempoEstimado && (
                <p className="text-xs text-zinc-500 mt-1">⏱ {restaurante.tempoEstimado} · {restaurante?.cidade || ""}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Busca ── */}
      <div className="sticky top-0 z-30 bg-[#080808]/90 backdrop-blur-xl border-b border-white/6 px-4 py-3">
        <div className="relative max-w-lg mx-auto">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm">🔍</span>
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar no cardápio…"
            className="w-full bg-white/5 border border-white/10 rounded-xl text-white text-sm pl-9 pr-4 py-2.5 focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-600"
          />
        </div>

        {/* Pills de categoria */}
        {!busca && (
          <div className="flex gap-2 overflow-x-auto mt-3 pb-0.5 no-scrollbar max-w-lg mx-auto">
            <button
              onClick={() => setCatAtiva(null)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                !catAtiva ? "bg-emerald-500 text-black" : "bg-white/8 text-zinc-400 hover:bg-white/12"
              }`}>
              Todos
            </button>
            {categorias.map(cat => (
              <button
                key={cat}
                onClick={() => setCatAtiva(cat === catAtiva ? null : cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  catAtiva === cat ? "bg-emerald-500 text-black" : "bg-white/8 text-zinc-400 hover:bg-white/12"
                }`}>
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Conteúdo ── */}
      <div className="max-w-lg mx-auto px-4 pt-6 flex flex-col gap-8">
        {Object.entries(grouped)
          .filter(([cat]) => !catAtiva || cat === catAtiva)
          .filter(([, arr]) => arr.length > 0)
          .map(([cat, arr]) => (
            <section key={cat}>
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">{cat}</h2>
              <div className="flex flex-col gap-2">
                {arr.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    qtd={qtdItem(item.id)}
                    onAdd={() => addItem(item)}
                    onDec={() => decItem(item)}
                  />
                ))}
              </div>
            </section>
          ))}

        {itensFiltrados.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-zinc-500 text-sm">Nenhum item encontrado para "{busca}"</p>
          </div>
        )}
      </div>

      {/* ── Botão flutuante do carrinho ── */}
      {totalQtd > 0 && (
        <div className="fixed bottom-6 inset-x-4 z-40 max-w-lg mx-auto">
          <button
            onClick={() => setShowCart(true)}
            className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-black font-bold text-sm flex items-center justify-between px-5 shadow-xl shadow-emerald-500/20 transition-all">
            <span className="w-7 h-7 rounded-full bg-black/20 flex items-center justify-center text-xs font-black">{totalQtd}</span>
            <span>Ver carrinho</span>
            <span>{fmtR(carrinho.reduce((s, i) => s + (i.salePrice || 0) * i.qtd, 0))}</span>
          </button>
        </div>
      )}

      {/* ── Drawer do carrinho ── */}
      {showCart && (
        <CartDrawer
          carrinho={carrinho}
          onClose={() => { setShowCart(false); setErroEnvio(null); }}
          onFinalizar={handleFinalizar}
          restauranteName={restaurante?.nome}
          clienteNome={clienteNome}    setClienteNome={setClienteNome}
          clienteTel={clienteTel}      setClienteTel={setClienteTel}
          pagamento={pagamento}        setPagamento={setPagamento}
          enviando={enviando}
          erroEnvio={erroEnvio}
        />
      )}
    </div>
  );
}
