import { useState, useEffect, useMemo } from "react";
import { Loader2, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function NewOrderModal({ onClose, onCreated }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("ifood2_token");
    fetch(`${BACKEND_URL}/api/products`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product_id === product.id
            ? { ...c, quantity: c.sale_type === "kg" ? c.quantity : c.quantity + 1 }
            : c
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          sale_type: product.sale_type,
          sale_price: product.sale_price,
          quantity: 1,
          weight_kg: product.sale_type === "kg" ? "" : undefined,
        },
      ];
    });
  }

  function updateCartItem(product_id, field, value) {
    setCart((prev) =>
      prev.map((c) => (c.product_id === product_id ? { ...c, [field]: value } : c))
    );
  }

  function removeFromCart(product_id) {
    setCart((prev) => prev.filter((c) => c.product_id !== product_id));
  }

  const total = useMemo(() =>
    cart.reduce((sum, c) => {
      if (c.sale_type === "kg") {
        const kg = parseFloat(c.weight_kg) || 0;
        return sum + c.sale_price * kg;
      }
      return sum + c.sale_price * c.quantity;
    }, 0),
    [cart]
  );

  async function handleSubmit() {
    if (cart.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const token = localStorage.getItem("ifood2_token");
      const body = {
        customer_name: customerName || undefined,
        customer_phone: customerPhone || "manual",
        address: address || undefined,
        items: cart.map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
          weight_kg: c.sale_type === "kg" ? parseFloat(c.weight_kg) || 0 : undefined,
        })),
      };
      const res = await fetch(`${BACKEND_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msgs = err?.detail?.errors || [err?.detail || "Erro ao criar pedido"];
        setError(msgs.join("\n"));
        return;
      }
      const order = await res.json();
      onCreated?.(order);
      onClose();
    } catch (e) {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-primary" />
            <h2 className="font-black text-base tracking-wide">NOVO PEDIDO</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-card/80 text-muted-foreground hover:text-foreground transition-all">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: product search */}
          <div className="flex flex-col w-1/2 border-r border-border">
            <div className="px-4 pt-4 pb-2 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar produto…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1.5">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 text-center py-8">Nenhum produto</p>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg
                               bg-background border border-border hover:border-primary/60
                               hover:bg-primary/5 text-left transition-all group"
                  >
                    <div>
                      <p className="text-sm font-semibold leading-tight">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        R$ {p.sale_price.toFixed(2)}{p.sale_type === "kg" ? "/kg" : ""}
                        {p.sale_type === "kg" && (
                          <span className="ml-1.5 text-blue-400 font-bold">KG</span>
                        )}
                      </p>
                    </div>
                    <Plus size={14} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: cart + customer */}
          <div className="flex flex-col w-1/2">
            {/* Cart items */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 space-y-2">
              {cart.length === 0 ? (
                <p className="text-xs text-muted-foreground/40 text-center py-8">
                  Adicione itens do catálogo
                </p>
              ) : (
                cart.map((c) => (
                  <div key={c.product_id} className="flex items-start gap-2 bg-background border border-border rounded-lg px-2.5 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{c.name}</p>
                      {c.sale_type === "kg" ? (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            placeholder="kg"
                            value={c.weight_kg}
                            onChange={(e) => updateCartItem(c.product_id, "weight_kg", e.target.value)}
                            className="w-16 px-1.5 py-0.5 rounded bg-card border border-border text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <span className="text-xs text-muted-foreground">kg</span>
                          <span className="ml-auto text-xs font-bold text-foreground/80">
                            R$ {(c.sale_price * (parseFloat(c.weight_kg) || 0)).toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={() => c.quantity > 1
                              ? updateCartItem(c.product_id, "quantity", c.quantity - 1)
                              : removeFromCart(c.product_id)}
                            className="w-5 h-5 rounded bg-card border border-border text-xs hover:bg-red-500/20 hover:border-red-500/50 transition-all flex items-center justify-center"
                          >−</button>
                          <span className="text-xs font-bold w-5 text-center">{c.quantity}</span>
                          <button
                            onClick={() => updateCartItem(c.product_id, "quantity", c.quantity + 1)}
                            className="w-5 h-5 rounded bg-card border border-border text-xs hover:bg-primary/20 hover:border-primary/50 transition-all flex items-center justify-center"
                          >+</button>
                          <span className="ml-auto text-xs font-bold text-foreground/80">
                            R$ {(c.sale_price * c.quantity).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(c.product_id)}
                      className="text-muted-foreground hover:text-red-400 transition-colors shrink-0 mt-0.5"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {cart.length > 0 && (
              <div className="px-4 pt-1 pb-2 border-t border-border shrink-0">
                <div className="flex justify-between text-xs font-black py-1.5">
                  <span>TOTAL</span>
                  <span className="text-green-400">R$ {total.toFixed(2)}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Customer info */}
            <div className="px-4 py-3 space-y-2 shrink-0">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Cliente</p>
              <input
                type="text"
                placeholder="Nome (opcional)"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                placeholder="Telefone (opcional)"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                type="text"
                placeholder="Endereço (opcional)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 whitespace-pre-line">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-card/80 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={cart.length === 0 || submitting}
              className="flex-1 py-2.5 rounded-xl bg-green-500 text-white font-black text-sm
                         hover:bg-green-400 active:scale-[0.98] disabled:opacity-40
                         disabled:cursor-not-allowed transition-all shadow-lg shadow-green-500/20
                         flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 size={15} className="animate-spin" /> Criando…</>
                : <><ShoppingCart size={15} /> Criar Pedido</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
