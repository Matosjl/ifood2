import { useState, useEffect, useRef } from "react";
import { Package, Plus, RefreshCcw, Tag, Trash2, Pencil, Upload, X, ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const MARGIN_COLOR = (m) => {
  if (m >= 50) return "text-green-400";
  if (m >= 20) return "text-yellow-400";
  return "text-red-400";
};

/* ─── Field ─────────────────────────────────────────────────────────────── */
function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Input({ ...props }) {
  return (
    <input
      {...props}
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm
                 focus:outline-none focus:ring-2 focus:ring-primary"
    />
  );
}

function Select({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm
                 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {children}
    </select>
  );
}

/* ─── ProductForm ────────────────────────────────────────────────────────── */
function ProductForm({ categories, initial, onSave, onClose }) {
  const { authFetch } = useAuth();
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    category_id: initial?.category_id ?? "",
    sale_type: initial?.sale_type ?? "unit",
    cost_price: initial?.cost_price ?? 0,
    sale_price: initial?.sale_price ?? 0,
    stock_qty: initial?.stock_qty ?? 0,
  });
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const margin = form.cost_price > 0
    ? (((form.sale_price - form.cost_price) / form.cost_price) * 100).toFixed(1)
    : "—";

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const method = initial ? "PATCH" : "POST";
      const url = initial
        ? `${BACKEND_URL}/api/products/${initial.id}`
        : `${BACKEND_URL}/api/products`;

      const res = await authFetch(url, {
        method,
        body: JSON.stringify({
          ...form,
          cost_price: parseFloat(form.cost_price),
          sale_price: parseFloat(form.sale_price),
          stock_qty: parseFloat(form.stock_qty),
        }),
      });
      const saved = await res.json();

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const token = localStorage.getItem("auth_token");
        await fetch(`${BACKEND_URL}/api/products/${saved.id}/image`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
      }
      onSave();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <Field label="Nome">
        <Input value={form.name} onChange={set("name")} required />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria">
          <Select value={form.category_id} onChange={set("category_id")}>
            <option value="">Sem categoria</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Tipo de venda">
          <Select value={form.sale_type} onChange={set("sale_type")}>
            <option value="unit">Unidade</option>
            <option value="kg">Por KG</option>
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Custo (R$)">
          <Input type="number" step="0.01" min="0" value={form.cost_price} onChange={set("cost_price")} />
        </Field>
        <Field label="Venda (R$)">
          <Input type="number" step="0.01" min="0" value={form.sale_price} onChange={set("sale_price")} />
        </Field>
        <Field label="Margem">
          <div className={`px-3 py-2 text-sm font-bold rounded-lg bg-background border border-border ${MARGIN_COLOR(parseFloat(margin))}`}>
            {margin}%
          </div>
        </Field>
      </div>

      <Field label={`Estoque (${form.sale_type === "kg" ? "kg" : "unid"})`}>
        <Input type="number" step="0.001" min="0" value={form.stock_qty} onChange={set("stock_qty")} />
      </Field>

      <Field label="Imagem do produto">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                       bg-card border border-border hover:bg-card/80 transition-all"
          >
            <Upload size={13} /> {imageFile ? imageFile.name : "Selecionar imagem"}
          </button>
          {imageFile && (
            <button type="button" onClick={() => setImageFile(null)} className="text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
      </Field>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={saving}
          className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-bold text-sm
                     hover:bg-primary/90 disabled:opacity-50 transition-all">
          {saving ? "Salvando…" : initial ? "Salvar alterações" : "Cadastrar produto"}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2 rounded-lg bg-card border border-border text-sm font-semibold
                     hover:bg-card/80 transition-all">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* ─── ProductCard ────────────────────────────────────────────────────────── */
function ProductCard({ product, onEdit, onReplenish, onDelete }) {
  const marginColor = MARGIN_COLOR(product.margin_pct);
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      {product.image_base64 ? (
        <img src={product.image_base64} alt={product.name}
          className="w-full h-32 object-cover bg-muted" />
      ) : (
        <div className="w-full h-32 bg-muted flex items-center justify-center">
          <Package size={32} className="text-muted-foreground/30" />
        </div>
      )}

      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="font-bold text-sm leading-tight">{product.name}</p>
        {product.category_name && (
          <span className="text-xs text-muted-foreground">{product.category_name}</span>
        )}

        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs px-1.5 py-0.5 rounded font-semibold border ${
            product.sale_type === "kg"
              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
              : "bg-purple-500/20 text-purple-300 border-purple-500/30"
          }`}>
            {product.sale_type === "kg" ? "POR KG" : "UNIDADE"}
          </span>
          <span className={`text-xs font-bold ${marginColor}`}>
            {product.margin_pct.toFixed(1)}% margem
          </span>
        </div>

        <Separator className="my-1.5" />

        <div className="grid grid-cols-2 gap-1 text-xs">
          <div>
            <span className="text-muted-foreground">Custo: </span>
            <span className="font-semibold">R$ {product.cost_price.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Venda: </span>
            <span className="font-semibold text-green-400">R$ {product.sale_price.toFixed(2)}</span>
          </div>
        </div>

        <div className="text-xs mt-1">
          <span className="text-muted-foreground">Estoque: </span>
          <span className={`font-bold ${product.stock_qty <= 0 ? "text-red-400" : product.stock_qty < 5 ? "text-yellow-400" : "text-foreground"}`}>
            {product.stock_qty} {product.sale_type === "kg" ? "kg" : "un"}
          </span>
        </div>
      </div>

      <div className="flex border-t border-border">
        <button onClick={() => onEdit(product)}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold
                     text-muted-foreground hover:text-foreground hover:bg-card/60 transition-all">
          <Pencil size={11} /> Editar
        </button>
        <div className="w-px bg-border" />
        <button onClick={() => onReplenish(product)}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold
                     text-blue-400 hover:bg-blue-500/10 transition-all">
          <RefreshCcw size={11} /> Repor
        </button>
        <div className="w-px bg-border" />
        <button onClick={() => onDelete(product.id)}
          className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold
                     text-red-400 hover:bg-red-500/10 transition-all">
          <Trash2 size={11} /> Excluir
        </button>
      </div>
    </div>
  );
}

/* ─── ReplenishDialog ────────────────────────────────────────────────────── */
function ReplenishDialog({ product, onClose, onDone, authFetch }) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await authFetch(`${BACKEND_URL}/api/products/${product.id}/replenish`, {
        method: "POST",
        body: JSON.stringify({ quantity: parseFloat(qty), reason: reason || undefined }),
      });
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm font-bold">{product.name}</p>
      <p className="text-xs text-muted-foreground">
        Estoque atual: <strong>{product.stock_qty} {product.sale_type === "kg" ? "kg" : "un"}</strong>
      </p>
      <Field label={`Quantidade a adicionar (${product.sale_type === "kg" ? "kg" : "un"})`}>
        <Input type="number" step="0.001" min="0.001" value={qty} onChange={(e) => setQty(e.target.value)} required />
      </Field>
      <Field label="Motivo (opcional)">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex: Compra fornecedor" />
      </Field>
      <div className="flex gap-2">
        <button type="submit" disabled={saving}
          className="flex-1 py-2 rounded-lg bg-blue-500 text-white font-bold text-sm
                     hover:bg-blue-400 disabled:opacity-50 transition-all">
          {saving ? "Salvando…" : "Confirmar reposição"}
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2 rounded-lg bg-card border border-border text-sm font-semibold hover:bg-card/80">
          Cancelar
        </button>
      </div>
    </form>
  );
}

/* ─── StockPage ──────────────────────────────────────────────────────────── */
export default function StockPage() {
  const { authFetch } = useAuth();

  const [products, setProducts]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [movements, setMovements]   = useState([]);
  const [filterCat, setFilterCat]   = useState("");

  const [showProductForm, setShowProductForm]     = useState(false);
  const [editingProduct, setEditingProduct]       = useState(null);
  const [replenishProduct, setReplenishProduct]   = useState(null);

  const [newCatName, setNewCatName] = useState("");
  const [editCat, setEditCat]       = useState(null);

  async function loadAll() {
    const [pRes, cRes, mRes] = await Promise.all([
      authFetch(`${BACKEND_URL}/api/products`),
      authFetch(`${BACKEND_URL}/api/categories`),
      authFetch(`${BACKEND_URL}/api/stock/movements`),
    ]);
    setProducts(await pRes.json());
    setCategories(await cRes.json());
    setMovements(await mRes.json());
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line

  async function deleteProduct(id) {
    if (!window.confirm("Excluir produto?")) return;
    await authFetch(`${BACKEND_URL}/api/products/${id}`, { method: "DELETE" });
    loadAll();
  }

  async function saveCategory(e) {
    e.preventDefault();
    if (editCat) {
      await authFetch(`${BACKEND_URL}/api/categories/${editCat.id}`, {
        method: "PATCH", body: JSON.stringify({ name: editCat.name }),
      });
      setEditCat(null);
    } else {
      await authFetch(`${BACKEND_URL}/api/categories`, {
        method: "POST", body: JSON.stringify({ name: newCatName }),
      });
      setNewCatName("");
    }
    loadAll();
  }

  async function deleteCategory(id) {
    if (!window.confirm("Excluir categoria?")) return;
    await authFetch(`${BACKEND_URL}/api/categories/${id}`, { method: "DELETE" });
    loadAll();
  }

  const filtered = filterCat
    ? products.filter((p) => p.category_id === filterCat)
    : products;

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-card/50 backdrop-blur shrink-0">
        <Package size={18} />
        <h1 className="text-base font-black tracking-wide">ESTOQUE</h1>
        <span className="text-xs text-muted-foreground">{products.length} produtos</span>
      </div>

      <Tabs defaultValue="products" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-5 mt-3 shrink-0">
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="movements">Movimentações</TabsTrigger>
        </TabsList>

        {/* ── Products ── */}
        <TabsContent value="products" className="flex-1 overflow-hidden flex flex-col px-5 pb-4">
          <div className="flex items-center gap-2 py-3 shrink-0">
            {/* Category filter */}
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="bg-card border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <button
              onClick={() => { setEditingProduct(null); setShowProductForm(true); }}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary
                         text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all"
            >
              <Plus size={13} /> Novo produto
            </button>
          </div>

          <ScrollArea className="flex-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">Nenhum produto cadastrado</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pb-4">
                {filtered.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onEdit={(p) => { setEditingProduct(p); setShowProductForm(true); }}
                    onReplenish={setReplenishProduct}
                    onDelete={deleteProduct}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* ── Categories ── */}
        <TabsContent value="categories" className="flex-1 overflow-hidden flex flex-col px-5 pb-4">
          <form onSubmit={saveCategory} className="flex items-center gap-2 py-3 shrink-0">
            <input
              value={editCat ? editCat.name : newCatName}
              onChange={(e) => editCat
                ? setEditCat((p) => ({ ...p, name: e.target.value }))
                : setNewCatName(e.target.value)
              }
              placeholder={editCat ? "Editar categoria" : "Nova categoria…"}
              required
              className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit"
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold
                         hover:bg-primary/90 transition-all">
              {editCat ? "Salvar" : <><Plus size={13} className="inline" /> Criar</>}
            </button>
            {editCat && (
              <button type="button" onClick={() => setEditCat(null)}
                className="px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-semibold">
                Cancelar
              </button>
            )}
          </form>

          <ScrollArea className="flex-1">
            {categories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">Nenhuma categoria</p>
            ) : (
              <div className="space-y-2 pb-4">
                {categories.map((c) => (
                  <div key={c.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border">
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-muted-foreground" />
                      <span className="text-sm font-semibold">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {products.filter((p) => p.category_id === c.id).length} produtos
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditCat(c)}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-card/60">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteCategory(c.id)}
                        className="p-1.5 rounded text-red-400 hover:bg-red-500/10">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        {/* ── Movements ── */}
        <TabsContent value="movements" className="flex-1 overflow-hidden flex flex-col px-5 pb-4">
          <ScrollArea className="flex-1 pt-3">
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-16">Nenhuma movimentação</p>
            ) : (
              <div className="space-y-2 pb-4">
                {movements.map((m) => (
                  <div key={m.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl bg-card border border-border">
                    <div>
                      <p className="text-sm font-semibold">{m.product_name}</p>
                      {m.reason && <p className="text-xs text-muted-foreground">{m.reason}</p>}
                      <p className="text-xs text-muted-foreground">
                        {m.created_at ? format(new Date(m.created_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                      </p>
                    </div>
                    <span className={`text-sm font-bold ${m.movement_type === "out" ? "text-red-400" : "text-green-400"}`}>
                      {m.movement_type === "out" ? "−" : "+"}{m.quantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Product form dialog */}
      <Dialog open={showProductForm} onOpenChange={(o) => !o && setShowProductForm(false)}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogTitle>{editingProduct ? "Editar produto" : "Novo produto"}</DialogTitle>
          <ProductForm
            categories={categories}
            initial={editingProduct}
            onSave={loadAll}
            onClose={() => setShowProductForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Replenish dialog */}
      <Dialog open={!!replenishProduct} onOpenChange={(o) => !o && setReplenishProduct(null)}>
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogTitle>Repor estoque</DialogTitle>
          {replenishProduct && (
            <ReplenishDialog
              product={replenishProduct}
              authFetch={authFetch}
              onClose={() => setReplenishProduct(null)}
              onDone={loadAll}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
