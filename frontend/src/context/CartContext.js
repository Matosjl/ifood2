// ─────────────────────────────────────────────────────────────────────────────
// CartContext — carrinho global com persistência em localStorage.
// Detecta troca de restaurante e oferece confirmação para limpar o carrinho.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback } from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "zapfome_cart_cliente";

export function CartProvider({ children }) {
  const [restauranteId, setRestauranteId] = useState(null);
  const [restauranteNome, setRestauranteNome] = useState("");
  const [itens, setItens] = useState([]);

  // ── Hidrata do localStorage ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setRestauranteId(parsed.restauranteId || null);
      setRestauranteNome(parsed.restauranteNome || "");
      setItens(parsed.itens || []);
    } catch { /* localStorage corrompido — ignora */ }
  }, []);

  // ── Persiste a cada mudança ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ restauranteId, restauranteNome, itens }));
    } catch { /* quota cheia ou navegador privado — ignora */ }
  }, [restauranteId, restauranteNome, itens]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const totalItens = itens.reduce((s, i) => s + i.qtd, 0);
  const totalValor = itens.reduce((s, i) => s + i.precoVenda * i.qtd, 0);

  const adicionar = useCallback((produto, restId, restNome) => {
    // Se está em outro restaurante, troca o carrinho inteiro
    if (restauranteId && restauranteId !== restId && itens.length > 0) {
      const ok = window.confirm(
        `Seu carrinho tem itens de "${restauranteNome}". Trocar para "${restNome}" vai esvaziar o carrinho. Continuar?`
      );
      if (!ok) return false;
      setItens([{ ...produto, qtd: 1 }]);
      setRestauranteId(restId);
      setRestauranteNome(restNome);
      return true;
    }
    setRestauranteId(restId);
    setRestauranteNome(restNome);
    setItens((prev) => {
      const ex = prev.find((i) => i.id === produto.id);
      if (ex) return prev.map((i) => (i.id === produto.id ? { ...i, qtd: i.qtd + 1 } : i));
      return [...prev, { ...produto, qtd: 1 }];
    });
    return true;
  }, [restauranteId, restauranteNome, itens]);

  const decrementar = useCallback((produtoId) => {
    setItens((prev) => {
      const ex = prev.find((i) => i.id === produtoId);
      if (!ex) return prev;
      if (ex.qtd === 1) return prev.filter((i) => i.id !== produtoId);
      return prev.map((i) => (i.id === produtoId ? { ...i, qtd: i.qtd - 1 } : i));
    });
  }, []);

  const remover = useCallback((produtoId) => {
    setItens((prev) => prev.filter((i) => i.id !== produtoId));
  }, []);

  const limpar = useCallback(() => {
    setItens([]);
    setRestauranteId(null);
    setRestauranteNome("");
  }, []);

  const qtdDoItem = useCallback((produtoId) => {
    return itens.find((i) => i.id === produtoId)?.qtd || 0;
  }, [itens]);

  return (
    <CartContext.Provider value={{
      restauranteId,
      restauranteNome,
      itens,
      totalItens,
      totalValor,
      adicionar,
      decrementar,
      remover,
      limpar,
      qtdDoItem,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de <CartProvider>");
  return ctx;
}
