import { useState, useRef, useEffect } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;
const PAYMENT_METHODS = ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "PIX", "Vale Refeição"];
const TAXA_ENTREGA = 5.0;
const CATEGORIAS_COM_VARIACOES = ["esfihas", "esfihã", "esfiha"];

const temVariacao = (category) =>
  CATEGORIAS_COM_VARIACOES.includes((category || "").toLowerCase().trim());

const MOCK_CARDAPIO = [
  { id: 1, name: "X-Burguer Especial", description: "Pão brioche, 180g de carne, queijo cheddar", category: "Lanches", salePrice: 28.9 },
  { id: 2, name: "X-Bacon Duplo", description: "Dois hambúrgueres, bacon crocante, molho especial", category: "Lanches", salePrice: 34.9 },
  { id: 3, name: "Pizza Margherita", description: "Molho de tomate, mussarela e manjericão", category: "Pizzas", salePrice: 49.9 },
  { id: 4, name: "Pizza Calabresa", description: "Calabresa fatiada, cebola e azeitona", category: "Pizzas", salePrice: 47.9 },
  { id: 5, name: "Coca-Cola 350ml", description: "Lata gelada", category: "Bebidas", salePrice: 6.9 },
  { id: 6, name: "Suco de Laranja", description: "Natural, 500ml", category: "Bebidas", salePrice: 9.9 },
  { id: 7, name: "Água Mineral", description: "500ml sem gás", category: "Bebidas", salePrice: 3.5 },
  { id: 8, name: "Pudim", description: "Pudim de leite condensado", category: "Sobremesas", salePrice: 12.9 },
];

const emptyAddress = { rua: "", cep: "", numero: "", referencia: "", foto: null };
const emptyOrder = {
  cliente: "", telefone: "", tipo: "retirada",
  pagamento: "", pago: false, agendado: false,
  horarioAgendado: "", observacao: "", tempo: 30,
};

// ── Minutos Restantes ─────────────────────────────────────────────────────────
const MinutosRestantes = ({ horario }) => {
  const [minutos, setMinutos] = useState(0);

  useEffect(() => {
    const calc = () => {
      const diff = new Date(horario) - Date.now();
      setMinutos(Math.ceil(diff / 60000));
    };
    calc();
    const t = setInterval(calc, 30000);
    return () => clearInterval(t);
  }, [horario]);

  if (minutos <= 0) return <span className="font-mono text-xs text-[#FF4444] font-bold">⚠ ATRASADO</span>;

  const color = minutos < 5 ? "#FF4444" : minutos < 15 ? "#FFB800" : "#00E559";
  return (
    <span className="font-mono text-xs font-bold" style={{ color }}>
      ⏱ {minutos} min restante{minutos !== 1 ? "s" : ""}
    </span>
  );
};

// ── Modal de Variações ───────────────────────────────────────────────────────────────
const ModalKg = ({ item, onConfirmar, onFechar }) => {
  const [grams, setGrams] = useState(500); // default 500g
  const price = (item.precoVenda * (grams / 1000)).toFixed(2);

  const confirmar = () => {
    onConfirmar({
      ...item, 
      precoUnitario: parseFloat(price),
      grams,
      name: `${item.name} (${grams}g)`
    });
    onFechar();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-[#0A0A0A] border border-[#27272A] w-full max-w-sm flex flex-col gap-3 p-6" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <span className="font-mono text-xs text-[#00E559] tracking-widest block">VENDA POR KG</span>
          <span className="font-mono text-sm text-[#EDEDED]">{item.name}</span>
          <span className="font-mono text-xs text-[#71717A]">R$ {item.precoVenda.toFixed(2)} / kg</span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">Gramas</label>
            <input type="number" min="1" max="5000" value={grams} onChange={e => setGrams(parseInt(e.target.value) || 0)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-lg px-3 py-3 text-center focus:outline-none focus:border-[#00E559]" />
          </div>
          <div className="text-center py-2 bg-[#0A0A0A] border border-[#27272A] rounded">
            <span className="font-mono text-sm text-[#00E559] font-bold">R$ {price.replace('.', ',')}</span>
          </div>
          <button onClick={confirmar} className="w-full py-3 bg-[#00E559] text-black font-mono font-bold text-sm hover:bg-[#00c44d]">
            ➕ ADICIONAR
          </button>
        </div>
        <button onClick={onFechar} className="font-mono text-xs text-[#71717A] mt-2 hover:text-[#EDEDED]">
          Cancelar
        </button>
      </div>
    </div>
  );
};

const ModalEdit = ({ item, onUpdate, onClose }) => {
  const [changes, setChanges] = useState({nome: item.nome || '', precoVenda: item.precoVenda || 0});
  
  const save = () => {
    onUpdate(item.id, changes);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#0A0A0A] border border-[#27272A] w-full max-w-sm flex flex-col gap-3 overflow-hidden max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs text-[#A855F7] tracking-widest">EDITAR PRODUTO</span>
            <span className="font-mono text-sm text-[#EDEDED]">{item.name}</span>
          </div>
          <button onClick={onClose} className="font-mono text-xs text-[#71717A]">✕</button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">Nome</label>
            <input value={changes.nome} onChange={e => setChanges(c => ({...c, nome: e.target.value}))}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="font-mono text-xs text-[#71717A]">Preço Venda (R$)</label>
            <input type="number" step="0.01" value={changes.precoVenda} onChange={e => setChanges(c => ({...c, precoVenda: parseFloat(e.target.value) || 0}))}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={save} className="flex-1 bg-[#00E559] text-black font-mono text-xs font-bold py-2 hover:bg-[#00c44d]">
              ✓ SALVAR
            </button>
            <button onClick={onClose} className="flex-1 border border-[#27272A] text-[#71717A] font-mono text-xs py-2 hover:border-[#FF4444] hover:text-[#FF4444]">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ModalVariacoes = ({ item, onConfirmar, onFechar }) => {
  const variacoes = item.variacoes || [];
  const [selecionadas, setSelecionadas] = useState([]);
  const [obs, setObs] = useState("");

  const toggle = (v) =>
    setSelecionadas(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );

  const confirmar = () => {
    if (selecionadas.length === 0) return;
    // Gera um item de carrinho por variação selecionada
    selecionadas.forEach(v => {
      onConfirmar({
        ...item,
        id: `${item.id}_${v}`,
        name: `${item.name} — ${v}`,
        observacao: obs,
      });
    });
    onFechar();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onFechar}>
      <div className="bg-[#0A0A0A] border border-[#27272A] w-full max-w-sm flex flex-col gap-0 overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#27272A]">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs text-[#FFB800] tracking-widest">VARIAÇÕES</span>
            <span className="font-mono text-sm text-[#EDEDED]">{item.name}</span>
          </div>
          <button onClick={onFechar} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">✕</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          {variacoes.length === 0 ? (
            <span className="font-mono text-xs text-[#3F3F46]">Nenhuma variação cadastrada para este item.</span>
          ) : (
            <>
              <span className="font-mono text-[10px] text-[#71717A]">Selecione o(s) sabor(es):</span>
              <div className="flex flex-col gap-2">
                {variacoes.map(v => (
                  <button key={v} onClick={() => toggle(v)}
                    className={`flex items-center gap-2 px-3 py-2 border font-mono text-xs transition-colors text-left ${
                      selecionadas.includes(v)
                        ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10"
                        : "border-[#27272A] text-[#EDEDED] hover:border-[#3F3F46]"
                    }`}>
                    <span className={`w-3 h-3 border flex items-center justify-center shrink-0 ${
                      selecionadas.includes(v) ? "border-[#00E559] bg-[#00E559]" : "border-[#71717A]"
                    }`}>
                      {selecionadas.includes(v) && <span className="text-black text-[8px] font-bold">✓</span>}
                    </span>
                    {v}
                  </button>
                ))}
              </div>

              <textarea value={obs} onChange={e => setObs(e.target.value)}
                placeholder="Observação (opcional)..."
                rows={2}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559] resize-none" />

              <button onClick={confirmar} disabled={selecionadas.length === 0}
                className="w-full py-2 bg-[#00E559] text-black font-mono text-xs font-bold hover:bg-[#00c44d] transition-colors disabled:opacity-40">
                + ADICIONAR AO CARRINHO ({selecionadas.length})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export function NovoPedido({ onPedidoCriado, itensEstoque = [] }) {
  const cardapio = itensEstoque.length > 0 ? itensEstoque : MOCK_CARDAPIO;

  const [form, setForm] = useState(emptyOrder);
  const [endereco, setEndereco] = useState(emptyAddress);
  const [carrinho, setCarrinho] = useState([]);
  const [showPayment, setShowPayment] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [wppStatus, setWppStatus] = useState(null);
  const [modalVariacao, setModalVariacao] = useState(null); // item com variações
  const [editItem, setEditItem] = useState(null);
  const [kgItem, setKgItem] = useState(null);
  const fileRef = useRef();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setEnd = (k, v) => setEndereco(e => ({ ...e, [k]: v }));

  // Agrupa cardápio por categoria
  const grouped = cardapio.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const qtdNoCarrinho = (id) => carrinho.find(i => i.id === id)?.qtd || 0;

  const addItem = (item) => {
    // Kg pricing
    if (item.porKg) {
      setKgItem(item);
      return;
    }
    // Se categoria tem variações e o item tem variações cadastradas, abre modal
    if (temVariacao(item.category) && item.variacoes?.length > 0) {
      setModalVariacao(item);
      return;
    }
    setCarrinho(prev => {
      const ex = prev.find(i => i.id === item.id);
      if (ex) return prev.map(i => i.id === item.id ? { ...i, qtd: i.qtd + 1 } : i);
      return [...prev, { ...item, qtd: 1 }];
    });
  };

  const addItemDireto = (item) => {
    setCarrinho(prev => {
      const ex = prev.find(i => i.id === item.id);
      if (ex) return prev.map(i => i.id === item.id ? { ...i, qtd: i.qtd + 1 } : i);
      return [...prev, { ...item, qtd: 1 }];
    });
  };

  const decreaseItem = (item) => {
    setCarrinho(prev => {
      const ex = prev.find(i => i.id === item.id);
      if (!ex) return prev;
      if (ex.qtd === 1) return prev.filter(i => i.id !== item.id);
      return prev.map(i => i.id === item.id ? { ...i, qtd: i.qtd - 1 } : i);
    });
  };

  const removeItem = (id) => setCarrinho(prev => prev.filter(i => i.id !== id));

  const subtotal = carrinho.reduce((s, i) => s + i.salePrice * i.qtd, 0);
  const taxaEntrega = form.tipo === "entrega" ? TAXA_ENTREGA : 0;
  const total = subtotal + taxaEntrega;

  const handleFoto = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setFotoPreview(ev.target.result); setEnd("foto", ev.target.result); };
    reader.readAsDataURL(file);
  };

  const updateItem = async (itemId, changes) => {
    try {
      await axios.patch(`${API}/estoque/${itemId}`, changes);
      console.log("Produto atualizado", changes);
      // Refresh stock from parent
      window.dispatchEvent(new CustomEvent('stockUpdated'));
    } catch (err) {
      console.error("Erro update item", err);
    }
    setEditItem(null);
  };

  const confirmarPagamento = (metodo) => {
    set("pagamento", metodo);
    set("pago", true);
    setShowPayment(false);
  };

  const printPedido = (type) => {
    const width = type === '58' ? '58mm' : '80mm';
    const fontSize = type === '58' ? '9px' : '11px';
    const html = `
<!DOCTYPE html>
<html>
<head>
<style>
body { font-family: 'Courier New', monospace; font-size: ${fontSize}; margin: 5mm; padding: 5mm; max-width: ${width}; color: black; }
h3 { margin: 0 0 5mm 0; font-size: 1.2em; text-align: center; }
p { margin: 0 0 2mm 0; }
li { margin: 1mm 0; }
.total { font-weight: bold; font-size: 1.3em; text-align: right; margin-top: 3mm; }
</style>
</head>
<body>
<h3>Pedido Novo</h3>
<p>Cliente: ${form.cliente || 'N/A'}</p>
<p>Tel: ${form.telefone || 'N/A'} | ${form.tipo === 'entrega' ? 'Entrega' : 'Retirada'}</p>
<ul>
${carrinho.map(i => `<li>${i.qtd}x ${i.name} <span style='float: right;'>R$ ${ (i.salePrice * i.qtd).toFixed(2).replace('.', ',') }</span></li>`).join('')}
</ul>
<p>Total: <span class="total">R$ ${total.toFixed(2).replace('.', ',')}</span></p>
${form.observacao ? `<p><strong>Obs:</strong> ${form.observacao}</p>` : ''}
<script>window.onload = () => { window.print(); setTimeout(() => window.close(), 1000); };</script>
</body>
</html>`;
    const printWin = window.open('', '_blank');
    printWin.document.write(html);
    printWin.document.close();
  };

  const handleFinalizar = async () => {
    if (!form.cliente || carrinho.length === 0) return;
    if (!form.pago) { setShowPayment(true); return; }
    if (form.tipo === "entrega" && (!endereco.rua || !endereco.numero)) return;

    const pedido = {
      ...form,
      endereco: form.tipo === "entrega" ? endereco : null,
      itens: carrinho,
      total,
      status: form.agendado ? "agendado" : "pendente",
      criadoEm: new Date().toISOString(),
    };

    onPedidoCriado?.(pedido);

    // Abate do estoque
    try {
      await axios.post(`${API}/estoque/deduzir`, {
        restauranteId: "teste",
        itens: carrinho.map(i => ({itemId: i.id, qtd: i.qtd})),
      });
    } catch (err) {
      console.error("Falha no abatimento do estoque", err);
    }

    // Envia WhatsApp se tiver telefone
    if (form.telefone) {
      setWppStatus("sending");
      try {
        await axios.post(`${API}/whatsapp/send-order`, {
          phone: form.telefone,
          cliente: form.cliente,
          tipo: form.tipo,
          itens: carrinho.map(i => ({ name: i.name, qtd: i.qtd, salePrice: i.salePrice })),
          total,
          pagamento: form.pagamento,
          observacao: form.observacao,
          agendado: form.agendado,
          horarioAgendado: form.horarioAgendado,
        });
        setWppStatus("ok");
      } catch (err) {
        setWppStatus("error");
        console.error("WhatsApp error:", err.response?.data?.detail || err.message);
      }
    }

    setForm(emptyOrder);
    setEndereco(emptyAddress);
    setCarrinho([]);
    setFotoPreview(null);
    setShowPayment(false);
    setTimeout(() => setWppStatus(null), 4000);
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Coluna esquerda: Cardápio ── */}
      <div className="w-[55%] border-r border-[#27272A] overflow-y-auto p-4 flex flex-col gap-6">
        <span className="font-mono text-xs text-[#71717A] tracking-widest">CARDÁPIO</span>

        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="flex flex-col gap-2">
            {/* Categoria */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-[#FFB800] tracking-widest">{category.toUpperCase()}</span>
              <div className="flex-1 h-px bg-[#27272A]" />
            </div>

            {/* Itens */}
            {items.map(item => {
              const qtd = qtdNoCarrinho(item.id);
              return (
                <div key={item.id}
                  className="bg-[#0A0A0A] border border-[#27272A] p-3 flex items-center justify-between gap-3 hover:border-[#3F3F46] transition-colors">
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="font-mono text-sm text-[#EDEDED] truncate">{item.name}</span>
                    {item.description && (
                      <span className="font-mono text-[10px] text-[#71717A] truncate">{item.description}</span>
                    )}
                    <span className="font-mono text-xs text-[#00E559]">R$ {Number(item.salePrice).toFixed(2).replace(".", ",")}</span>
                    <button onClick={() => setEditItem(item)} className="font-mono text-[10px] text-[#A855F7] hover:text-[#C084FC] ml-1">✏️</button>
                  </div>

                  {/* Controles */}
                  <div className="flex items-center gap-1 shrink-0">
                    {qtd > 0 ? (
                      <>
                        <button onClick={() => decreaseItem(item)}
                          className="w-7 h-7 border border-[#27272A] text-[#FF4444] font-mono text-sm hover:border-[#FF4444] transition-colors flex items-center justify-center">
                          −
                        </button>
                        <span className="font-mono text-sm text-[#EDEDED] w-5 text-center">{qtd}</span>
                        <button onClick={() => addItem(item)}
                          className="w-7 h-7 border border-[#27272A] text-[#00E559] font-mono text-sm hover:border-[#00E559] transition-colors flex items-center justify-center">
                          +
                        </button>
                      </>
                    ) : (
                      <button onClick={() => addItem(item)}
                        className="font-mono text-xs px-4 py-2 border-2 border-[#00E559] text-[#00E559] bg-[#00E559]/10 hover:bg-[#00E559] hover:text-black transition-colors font-bold shadow-[0_0_8px_rgba(0,229,89,0.3)]">
                        ➕ ADICIONAR
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {cardapio.length === 0 && (
          <div className="text-center py-16 font-mono text-xs text-[#3F3F46]">
            NENHUM ITEM NO CARDÁPIO<br />
            <span className="text-[#27272A]">Adicione itens na aba "ADICIONAR ITEM"</span>
          </div>
        )}
      </div>

      {/* ── Coluna direita: Formulário + Carrinho ── */}
      <div className="w-[45%] overflow-y-auto flex flex-col">

        {/* Dados do cliente */}
        <div className="p-4 border-b border-[#27272A] flex flex-col gap-3">
          <span className="font-mono text-xs text-[#71717A] tracking-widest">DADOS DO PEDIDO</span>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] text-[#71717A]">CLIENTE *</label>
              <input value={form.cliente} onChange={e => set("cliente", e.target.value)}
                placeholder="Nome do cliente"
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559]" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-mono text-[10px] text-[#71717A]">TELEFONE</label>
              <input value={form.telefone} onChange={e => set("telefone", e.target.value)}
                placeholder="(00) 00000-0000"
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559]" />
            </div>
          </div>

          {/* Tipo */}
          <div className="flex gap-2">
            {["retirada", "entrega"].map(t => (
              <button key={t} type="button" onClick={() => set("tipo", t)}
                className={`flex-1 font-mono text-xs py-1.5 border transition-colors ${form.tipo === t ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10" : "border-[#27272A] text-[#71717A]"}`}>
                {t === "retirada" ? "🏪 RETIRADA" : "🛵 ENTREGA"}
              </button>
            ))}
          </div>

          {/* Tempo estimado */}
          <div className="flex items-center gap-2">
            <label className="font-mono text-[10px] text-[#71717A]">TEMPO (min):</label>
            <input type="number" min="5" max="180" value={form.tempo} onChange={e => set("tempo", e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 w-16 focus:outline-none focus:border-[#00E559]" />
          </div>

          {/* Agendamento */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.agendado} onChange={e => set("agendado", e.target.checked)} className="accent-[#00E559]" />
            <span className="font-mono text-[10px] text-[#71717A]">AGENDAR HORÁRIO</span>
          </label>
          {form.agendado && (
            <>
              <input type="datetime-local" value={form.horarioAgendado} onChange={e => set("horarioAgendado", e.target.value)}
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559] w-full" />
              {form.horarioAgendado && (
                <div className="bg-[#111] border border-[#27272A] px-3 py-2 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-[#71717A]">TEMPO ATÉ O AGENDAMENTO</span>
                  <MinutosRestantes horario={form.horarioAgendado} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Endereço de entrega */}
        {form.tipo === "entrega" && (
          <div className="p-4 border-b border-[#27272A] flex flex-col gap-2">
            <span className="font-mono text-[10px] text-[#FFB800] tracking-widest">ENDEREÇO DE ENTREGA</span>
            <input value={endereco.rua} onChange={e => setEnd("rua", e.target.value)}
              placeholder="Rua *"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559]" />
            <div className="grid grid-cols-2 gap-2">
              <input value={endereco.numero} onChange={e => setEnd("numero", e.target.value)}
                placeholder="Número *"
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559]" />
              <input value={endereco.cep} onChange={e => setEnd("cep", e.target.value)}
                placeholder="CEP"
                className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559]" />
            </div>
            <input value={endereco.referencia} onChange={e => setEnd("referencia", e.target.value)}
              placeholder="Ponto de referência"
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559]" />

            {/* Foto */}
            <div className="flex items-center gap-2 mt-1">
              {fotoPreview && <img src={fotoPreview} alt="casa" className="w-10 h-10 object-cover border border-[#27272A]" />}
              <button type="button" onClick={() => fileRef.current?.click()}
                className="font-mono text-[10px] px-2 py-1 border border-[#27272A] text-[#71717A] hover:border-[#00E559] hover:text-[#00E559] transition-colors">
                📷 {fotoPreview ? "TROCAR" : "FOTO DA CASA"}
              </button>
              {fotoPreview && (
                <button type="button" onClick={() => { setFotoPreview(null); setEnd("foto", null); fileRef.current.value = ""; }}
                  className="font-mono text-[10px] text-[#FF4444]">✕</button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
            </div>
          </div>
        )}

        {/* Carrinho */}
        <div className="p-4 border-b border-[#27272A] flex flex-col gap-2 flex-1">
          <span className="font-mono text-[10px] text-[#71717A] tracking-widest">
            CARRINHO {carrinho.length > 0 && `(${carrinho.reduce((s, i) => s + i.qtd, 0)} itens)`}
          </span>

          {carrinho.length === 0 ? (
            <div className="font-mono text-[10px] text-[#3F3F46] py-4 text-center">
              Nenhum item adicionado.<br />Selecione no cardápio ao lado.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {carrinho.map(i => (
                <div key={i.id} className="flex items-center gap-2 py-1.5 border-b border-[#27272A]">
                  {/* Controles inline */}
                  <button onClick={() => decreaseItem(i)}
                    className="w-5 h-5 border border-[#27272A] text-[#FF4444] font-mono text-xs hover:border-[#FF4444] flex items-center justify-center shrink-0">
                    −
                  </button>
                  <span className="font-mono text-xs text-[#EDEDED] w-4 text-center shrink-0">{i.qtd}</span>
                  <button onClick={() => addItem(i)}
                    className="w-5 h-5 border border-[#27272A] text-[#00E559] font-mono text-xs hover:border-[#00E559] flex items-center justify-center shrink-0">
                    +
                  </button>

                  <span className="font-mono text-xs text-[#EDEDED] flex-1 truncate">{i.name}</span>
                  <span className="font-mono text-xs text-[#00E559] shrink-0">R$ {(i.salePrice * i.qtd).toFixed(2).replace(".", ",")}</span>

                  {/* Remover do carrinho */}
                  <button onClick={() => removeItem(i.id)}
                    className="font-mono text-[10px] text-[#3F3F46] hover:text-[#FF4444] transition-colors shrink-0 ml-1">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalVariacao && (
          <ModalVariacoes item={modalVariacao} onConfirmar={addItemDireto} onFechar={() => setModalVariacao(null)} />
        )}
        {editItem && (
          <ModalEdit item={editItem} onUpdate={updateItem} onClose={() => setEditItem(null)} />
        )}
        {kgItem && (
          <ModalKg item={kgItem} onConfirmar={addItemDireto} onFechar={() => setKgItem(null)} />
        )}

        {/* Observação */}
        <div className="px-4 pt-3 pb-0">
          <textarea value={form.observacao} onChange={e => set("observacao", e.target.value)}
            placeholder="Observações do pedido..."
            rows={2}
            className="w-full bg-[#0A0A0A] border border-[#27272A] text-[#EDEDED] font-mono text-xs px-2 py-1.5 focus:outline-none focus:border-[#00E559] resize-none" />
        </div>

        {/* Pagamento */}
        <div className="px-4 py-3 border-t border-[#27272A] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-[#71717A] tracking-widest">PAGAMENTO</span>
            {form.pago
              ? <span className="font-mono text-xs text-[#00E559] font-bold">✓ {form.pagamento}</span>
              : <span className="font-mono text-xs text-[#FF4444] font-bold">NÃO REGISTRADO</span>}
          </div>

          {form.pago ? (
            <button type="button" onClick={() => { set("pago", false); set("pagamento", ""); setShowPayment(true); }}
              className="w-full py-2 border border-[#27272A] text-[#71717A] font-mono text-xs hover:border-[#FFB800] hover:text-[#FFB800] transition-colors">
              ↺ ALTERAR FORMA DE PAGAMENTO
            </button>
          ) : (
            <button type="button" onClick={() => setShowPayment(!showPayment)}
              className={`w-full py-2 font-mono text-xs font-bold border transition-colors ${
                showPayment
                  ? "border-[#FFB800] text-[#FFB800] bg-[#FFB800]/10"
                  : "border-[#FFB800] text-black bg-[#FFB800] hover:bg-[#e6a600]"
              }`}>
              💰 REGISTRAR PAGAMENTO
            </button>
          )}

          {showPayment && (
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map(m => (
                <button key={m} type="button" onClick={() => confirmarPagamento(m)}
                  className="py-2.5 border border-[#27272A] text-[#EDEDED] font-mono text-xs hover:border-[#00E559] hover:text-[#00E559] hover:bg-[#00E559]/5 transition-colors">
                  {m === "PIX" ? "◈ PIX" : m === "Dinheiro" ? "💵 Dinheiro" : m === "Cartão de Crédito" ? "💳 Crédito" : m === "Cartão de Débito" ? "💳 Débito" : "🎫 Vale Ref."}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Totais + Finalizar */}
        <div className="px-4 pb-4 flex flex-col gap-2 border-t border-[#27272A] pt-3">
          {/* Subtotal */}
          <div className="flex justify-between">
            <span className="font-mono text-xs text-[#71717A]">SUBTOTAL</span>
            <span className="font-mono text-xs text-[#A1A1AA]">R$ {subtotal.toFixed(2).replace(".", ",")}</span>
          </div>

          {/* Taxa de entrega */}
          {form.tipo === "entrega" && (
            <div className="flex justify-between">
              <span className="font-mono text-xs text-[#71717A]">TAXA DE ENTREGA</span>
              <span className="font-mono text-xs text-[#FFB800]">R$ {taxaEntrega.toFixed(2).replace(".", ",")}</span>
            </div>
          )}

          {/* Total */}
          <div className="flex justify-between items-center border-t border-[#27272A] pt-2 mt-1">
            <span className="font-mono text-sm text-[#EDEDED] font-bold">
              {form.tipo === "entrega" ? "TOTAL (PEDIDO + ENTREGA)" : "TOTAL (RETIRADA)"}
            </span>
            <span className="font-mono text-lg text-[#00E559] font-bold">
              R$ {total.toFixed(2).replace(".", ",")}
            </span>
          </div>

          {/* Feedback WhatsApp */}
          {wppStatus && (
            <div className={`font-mono text-xs px-3 py-2 border flex items-center gap-2 ${
              wppStatus === "sending" ? "border-[#27272A] text-[#71717A]" :
              wppStatus === "ok" ? "border-[#00E559]/40 bg-[#00E559]/5 text-[#00E559]" :
              "border-[#FF4444]/40 bg-[#FF4444]/5 text-[#FF4444]"
            }`}>
              {wppStatus === "sending" && <span className="animate-pulse">📲 Enviando WhatsApp...</span>}
              {wppStatus === "ok" && <span>✅ WhatsApp enviado para {form.telefone || "cliente"}</span>}
              {wppStatus === "error" && <span>⚠ Falha no WhatsApp — verifique a Evolution API no .env</span>}
            </div>
          )}

          <button type="button" onClick={handleFinalizar}
            disabled={!form.cliente || carrinho.length === 0}
            className="w-full py-2.5 bg-[#00E559] text-black font-mono text-xs font-bold hover:bg-[#00c44d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed mt-1">
            {!form.pago ? "⚠ FINALIZAR (PAGAMENTO PENDENTE)" : "✓ FINALIZAR PEDIDO"}
          </button>
        </div>

      </div>
    </div>
  );
}
