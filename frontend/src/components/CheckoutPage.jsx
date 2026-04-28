import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { subscribePush } from "@/lib/pushNotifications";

const API = `${process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"}/api`;

const MOCK_ITEMS = [
  { id: "item-1", name: "X-Burguer Especial", description: "Pão brioche, 180g de carne, queijo cheddar, alface e tomate", category: "Lanches", salePrice: 28.9, photo: null },
  { id: "item-2", name: "X-Bacon Duplo", description: "Dois hambúrgueres, bacon crocante, queijo prato e molho especial", category: "Lanches", salePrice: 34.9, photo: null },
  { id: "item-3", name: "Pizza Margherita", description: "Molho de tomate, mussarela e manjericão fresco", category: "Pizzas", salePrice: 49.9, photo: null },
  { id: "item-4", name: "Coca-Cola 350ml", description: "Lata gelada", category: "Bebidas", salePrice: 6.9, photo: null },
  { id: "item-5", name: "Suco de Laranja", description: "Natural, 500ml", category: "Bebidas", salePrice: 9.9, photo: null },
];

const CARRINHO_KEY = "ifood2_carrinho";
const CLIENTE_KEY = "ifood2_cliente";

export function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const restauranteId = searchParams.get("restaurante") || "teste";

  const [carrinho, setCarrinho] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CARRINHO_KEY)) || [];
    } catch {
      return [];
    }
  });

  const [cliente, setCliente] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CLIENTE_KEY)) || { nome: "", telefone: "" };
    } catch {
      return { nome: "", telefone: "" };
    }
  });

  const [endereco, setEndereco] = useState({
    rua: "",
    numero: "",
    bairro: "",
    cidade: "",
    complemento: "",
    referencia: "",
  });

  const [tipo, setTipo] = useState("entrega");
  const [pagamento, setPagamento] = useState("pix");
  const [trocoPara, setTrocoPara] = useState("");
  const [observacao, setObservacao] = useState("");
  const [etapa, setEtapa] = useState("cardapio"); // cardapio | carrinho | checkout | sucesso
  const [enviando, setEnviando] = useState(false);
  const [pedidoCriado, setPedidoCriado] = useState(null);
  const [erro, setErro] = useState("");

  // Persiste carrinho
  useEffect(() => {
    localStorage.setItem(CARRINHO_KEY, JSON.stringify(carrinho));
  }, [carrinho]);

  // Persiste cliente
  useEffect(() => {
    localStorage.setItem(CLIENTE_KEY, JSON.stringify(cliente));
  }, [cliente]);

  const addItem = (item) => {
    setCarrinho((prev) => {
      const existente = prev.find((i) => i.id === item.id);
      if (existente) {
        return prev.map((i) => (i.id === item.id ? { ...i, qtd: i.qtd + 1 } : i));
      }
      return [...prev, { ...item, qtd: 1, precoUnitario: item.salePrice }];
    });
  };

  const removeItem = (id) => {
    setCarrinho((prev) => prev.filter((i) => i.id !== id));
  };

  const updateQtd = (id, qtd) => {
    if (qtd <= 0) {
      removeItem(id);
      return;
    }
    setCarrinho((prev) => prev.map((i) => (i.id === id ? { ...i, qtd } : i)));
  };

  const subtotal = carrinho.reduce((s, i) => s + i.qtd * i.precoUnitario, 0);
  const taxaEntrega = tipo === "entrega" ? 5.0 : 0;
  const total = subtotal + taxaEntrega;

  const groupedMenu = MOCK_ITEMS.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  const handleFinalizar = async () => {
    setErro("");
    if (!cliente.nome.trim() || !cliente.telefone.trim()) {
      setErro("Preencha nome e telefone.");
      return;
    }
    if (tipo === "entrega" && (!endereco.rua.trim() || !endereco.numero.trim() || !endereco.bairro.trim())) {
      setErro("Preencha o endereço completo.");
      return;
    }
    if (carrinho.length === 0) {
      setErro("Carrinho vazio.");
      return;
    }

    setEnviando(true);
    try {
      const payload = {
        restauranteId,
        clienteNome: cliente.nome,
        clienteTelefone: cliente.telefone,
        tipo,
        itens: carrinho.map((i) => ({
          nome: i.name,
          qtd: i.qtd,
          precoUnitario: i.precoUnitario,
          observacao: i.observacao || "",
        })),
        endereco: tipo === "entrega" ? endereco : null,
        pagamento,
        trocoPara: pagamento === "dinheiro" ? parseFloat(trocoPara) || null : null,
        taxaEntrega,
        desconto: 0,
        observacao,
      };

      const res = await axios.post(`${API}/pedidos`, payload);
      setPedidoCriado(res.data);
      setEtapa("sucesso");
      setCarrinho([]);
      // Inscreve para notificações push do pedido
      subscribePush("cliente", cliente.telefone, null);
    } catch (err) {
      setErro(`Erro ao enviar pedido: ${err.message}`);
    } finally {
      setEnviando(false);
    }
  };

  // ─── Etapa: Cardápio ───
  if (etapa === "cardapio") {
    return (
      <div className="min-h-screen bg-black text-[#EDEDED]">
        <div className="h-14 bg-[#0A0A0A] border-b border-[#27272A] flex items-center justify-between px-4">
          <button onClick={() => navigate("/")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">
            ← VOLTAR
          </button>
          <span className="font-mono text-sm text-[#00E559] tracking-widest">🍔 CARDÁPIO</span>
          <button onClick={() => setEtapa("carrinho")} className="font-mono text-xs text-[#00E559]">
            🛒 {carrinho.reduce((s, i) => s + i.qtd, 0)} ITENS
          </button>
        </div>

        <div className="max-w-2xl mx-auto p-4 flex flex-col gap-6">
          {Object.entries(groupedMenu).map(([category, items]) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-xs text-[#FFB800] tracking-widest">{category.toUpperCase()}</span>
                <div className="flex-1 h-px bg-[#27272A]" />
              </div>
              <div className="flex flex-col gap-2">
                {items.map((item) => {
                  const noCarrinho = carrinho.find((i) => i.id === item.id);
                  return (
                    <div key={item.id} className="bg-[#0A0A0A] border border-[#27272A] p-3 flex justify-between items-center">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-sm text-[#EDEDED]">{item.name}</span>
                        <span className="font-mono text-xs text-[#71717A]">{item.description}</span>
                        <span className="font-mono text-sm text-[#00E559]">R$ {item.salePrice.toFixed(2)}</span>
                      </div>
                      {noCarrinho ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => updateQtd(item.id, noCarrinho.qtd - 1)} className="w-8 h-8 border border-[#27272A] text-[#EDEDED] font-mono">−</button>
                          <span className="font-mono text-sm w-6 text-center">{noCarrinho.qtd}</span>
                          <button onClick={() => addItem(item)} className="w-8 h-8 border border-[#27272A] text-[#00E559] font-mono">+</button>
                        </div>
                      ) : (
                        <button onClick={() => addItem(item)} className="px-3 py-1.5 bg-[#00E559] text-black font-mono text-xs font-bold">ADICIONAR</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {carrinho.length > 0 && (
            <button onClick={() => setEtapa("carrinho")} className="sticky bottom-4 bg-[#00E559] text-black font-mono text-sm font-bold py-3 hover:bg-[#00c44d] transition-colors">
              VER CARRINHO — R$ {total.toFixed(2)}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Etapa: Carrinho ───
  if (etapa === "carrinho") {
    return (
      <div className="min-h-screen bg-black text-[#EDEDED]">
        <div className="h-14 bg-[#0A0A0A] border-b border-[#27272A] flex items-center justify-between px-4">
          <button onClick={() => setEtapa("cardapio")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">
            ← CARDÁPIO
          </button>
          <span className="font-mono text-sm text-[#00E559] tracking-widest">🛒 CARRINHO</span>
          <button onClick={() => { setCarrinho([]); }} className="font-mono text-xs text-[#FF4444]">LIMPAR</button>
        </div>

        <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
          {carrinho.length === 0 ? (
            <div className="text-center py-12 font-mono text-xs text-[#71717A]">CARRINHO VAZIO</div>
          ) : (
            <>
              {carrinho.map((item) => (
                <div key={item.id} className="bg-[#0A0A0A] border border-[#27272A] p-3 flex justify-between items-center">
                  <div>
                    <div className="font-mono text-sm text-[#EDEDED]">{item.name}</div>
                    <div className="font-mono text-xs text-[#71717A]">R$ {item.precoUnitario.toFixed(2)} cada</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQtd(item.id, item.qtd - 1)} className="w-7 h-7 border border-[#27272A] text-[#EDEDED]">−</button>
                      <span className="font-mono text-sm w-4 text-center">{item.qtd}</span>
                      <button onClick={() => addItem(item)} className="w-7 h-7 border border-[#27272A] text-[#00E559]">+</button>
                    </div>
                    <span className="font-mono text-sm text-[#00E559] w-16 text-right">R$ {(item.qtd * item.precoUnitario).toFixed(2)}</span>
                  </div>
                </div>
              ))}

              <div className="border-t border-[#27272A] pt-3 flex flex-col gap-1">
                <div className="flex justify-between font-mono text-xs text-[#71717A]">
                  <span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-mono text-xs text-[#71717A]">
                  <span>Taxa de entrega</span><span>R$ {taxaEntrega.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-mono text-sm font-bold text-[#00E559]">
                  <span>TOTAL</span><span>R$ {total.toFixed(2)}</span>
                </div>
              </div>

              <button onClick={() => setEtapa("checkout")} className="bg-[#00E559] text-black font-mono text-sm font-bold py-3 hover:bg-[#00c44d]">
                CONTINUAR →
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── Etapa: Checkout ───
  if (etapa === "checkout") {
    return (
      <div className="min-h-screen bg-black text-[#EDEDED]">
        <div className="h-14 bg-[#0A0A0A] border-b border-[#27272A] flex items-center justify-between px-4">
          <button onClick={() => setEtapa("carrinho")} className="font-mono text-xs text-[#71717A] hover:text-[#EDEDED]">
            ← CARRINHO
          </button>
          <span className="font-mono text-sm text-[#00E559] tracking-widest">💳 CHECKOUT</span>
          <span />
        </div>

        <div className="max-w-lg mx-auto p-4 flex flex-col gap-4">
          {erro && (
            <div className="font-mono text-xs text-[#FF4444] border border-[#FF4444]/30 bg-[#FF4444]/5 px-3 py-2">{erro}</div>
          )}

          {/* Dados pessoais */}
          <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
            <span className="font-mono text-xs text-[#71717A] tracking-widest">SEUS DADOS</span>
            <input value={cliente.nome} onChange={(e) => setCliente((c) => ({ ...c, nome: e.target.value }))}
              placeholder="Nome completo *" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
            <input value={cliente.telefone} onChange={(e) => setCliente((c) => ({ ...c, telefone: e.target.value }))}
              placeholder="Telefone * (00) 00000-0000" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
          </div>

          {/* Tipo de entrega */}
          <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
            <span className="font-mono text-xs text-[#71717A] tracking-widest">TIPO DE ENTREGA</span>
            <div className="flex gap-2">
              <button onClick={() => setTipo("entrega")}
                className={`flex-1 font-mono text-xs py-2 border ${tipo === "entrega" ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10" : "border-[#27272A] text-[#71717A]"}`}>
                🛵 ENTREGA (R$ 5,00)
              </button>
              <button onClick={() => setTipo("retirada")}
                className={`flex-1 font-mono text-xs py-2 border ${tipo === "retirada" ? "border-[#00E559] text-[#00E559] bg-[#00E559]/10" : "border-[#27272A] text-[#71717A]"}`}>
                🏪 RETIRADA (GRÁTIS)
              </button>
            </div>
          </div>

          {/* Endereço */}
          {tipo === "entrega" && (
            <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
              <span className="font-mono text-xs text-[#71717A] tracking-widest">ENDEREÇO DE ENTREGA</span>
              <input value={endereco.rua} onChange={(e) => setEndereco((prev) => ({ ...prev, rua: e.target.value }))}
                placeholder="Rua / Avenida *" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
              <div className="flex gap-2">
                <input value={endereco.numero} onChange={(e) => setEndereco((prev) => ({ ...prev, numero: e.target.value }))}
                  placeholder="Número *" className="flex-1 bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
                <input value={endereco.bairro} onChange={(e) => setEndereco((prev) => ({ ...prev, bairro: e.target.value }))}
                  placeholder="Bairro *" className="flex-1 bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
              </div>
              <input value={endereco.cidade} onChange={(e) => setEndereco((prev) => ({ ...prev, cidade: e.target.value }))}
                placeholder="Cidade" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
              <input value={endereco.complemento} onChange={(e) => setEndereco((prev) => ({ ...prev, complemento: e.target.value }))}
                placeholder="Complemento (opcional)" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
              <input value={endereco.referencia} onChange={(e) => setEndereco((prev) => ({ ...prev, referencia: e.target.value }))}
                placeholder="Ponto de referência" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
            </div>
          )}

          {/* Pagamento */}
          <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
            <span className="font-mono text-xs text-[#71717A] tracking-widest">PAGAMENTO</span>
            <select value={pagamento} onChange={(e) => setPagamento(e.target.value)}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]">
              <option value="pix">💠 PIX</option>
              <option value="cartao_credito">💳 Cartão de Crédito</option>
              <option value="cartao_debito">💳 Cartão de Débito</option>
              <option value="dinheiro">💵 Dinheiro</option>
            </select>
            {pagamento === "dinheiro" && (
              <input value={trocoPara} onChange={(e) => setTrocoPara(e.target.value)}
                type="number" placeholder="Troco para quanto?" className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559]" />
            )}
          </div>

          {/* Observação */}
          <div className="bg-[#0A0A0A] border border-[#27272A] p-4 flex flex-col gap-3">
            <span className="font-mono text-xs text-[#71717A] tracking-widest">OBSERVAÇÃO</span>
            <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)}
              placeholder="Alguma observação para o restaurante?" rows={2}
              className="bg-black border border-[#27272A] text-[#EDEDED] font-mono text-sm px-3 py-2 focus:outline-none focus:border-[#00E559] resize-none" />
          </div>

          {/* Resumo */}
          <div className="border-t border-[#27272A] pt-3 flex flex-col gap-1">
            <div className="flex justify-between font-mono text-xs text-[#71717A]">
              <span>{carrinho.reduce((s, i) => s + i.qtd, 0)} itens</span><span>R$ {subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-mono text-xs text-[#71717A]">
              <span>Taxa</span><span>R$ {taxaEntrega.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-mono text-lg font-bold text-[#00E559]">
              <span>TOTAL</span><span>R$ {total.toFixed(2)}</span>
            </div>
          </div>

          <button onClick={handleFinalizar} disabled={enviando}
            className="bg-[#00E559] text-black font-mono text-sm font-bold py-3 hover:bg-[#00c44d] disabled:opacity-50">
            {enviando ? "ENVIANDO..." : "FINALIZAR PEDIDO ✓"}
          </button>
        </div>
      </div>
    );
  }

  // ─── Etapa: Sucesso ───
  if (etapa === "sucesso" && pedidoCriado) {
    return (
      <div className="min-h-screen bg-black text-[#EDEDED] flex flex-col items-center justify-center gap-6 p-4">
        <div className="text-6xl">🎉</div>
        <div className="font-mono text-2xl font-bold text-[#00E559]">PEDIDO CONFIRMADO!</div>
        <div className="text-center">
          <div className="font-mono text-sm text-[#71717A]">SEU NÚMERO DE PEDIDO</div>
          <div className="font-mono text-3xl font-bold text-[#EDEDED]">#{pedidoCriado.id.slice(-8).toUpperCase()}</div>
        </div>
        <div className="font-mono text-xs text-[#A1A1AA] text-center max-w-sm">
          Você pode acompanhar seu pedido em tempo real e receberá notificações sobre cada etapa.
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate(`/pedido/${pedidoCriado.id}`)}
            className="bg-[#00E559] text-black font-mono text-xs font-bold px-6 py-3 hover:bg-[#00c44d]">
            ACOMPANHAR PEDIDO →
          </button>
          <button onClick={() => { setEtapa("cardapio"); }}
            className="border border-[#27272A] text-[#71717A] font-mono text-xs px-6 py-3 hover:border-[#3F3F46]">
            NOVO PEDIDO
          </button>
        </div>
      </div>
    );
  }

  return null;
}

