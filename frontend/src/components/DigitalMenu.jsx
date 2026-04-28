const MOCK_ITEMS = [
  { id: 1, name: "X-Burguer Especial", description: "Pão brioche, 180g de carne, queijo cheddar, alface e tomate", category: "Lanches", salePrice: 28.9 },
  { id: 2, name: "X-Bacon Duplo", description: "Dois hambúrgueres, bacon crocante, queijo prato e molho especial", category: "Lanches", salePrice: 34.9 },
  { id: 3, name: "Pizza Margherita", description: "Molho de tomate, mussarela e manjericão fresco", category: "Pizzas", salePrice: 49.9 },
  { id: 4, name: "Coca-Cola 350ml", description: "Lata gelada", category: "Bebidas", salePrice: 6.9 },
  { id: 5, name: "Suco de Laranja", description: "Natural, 500ml", category: "Bebidas", salePrice: 9.9 },
];

export function DigitalMenu({ items = MOCK_ITEMS, restaurantName = "Restaurante" }) {
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-0 max-w-2xl mx-auto w-full p-6">
      <div className="text-center mb-8">
        <h1 className="font-mono text-2xl text-[#00E559] tracking-widest">{restaurantName.toUpperCase()}</h1>
        <p className="font-mono text-xs text-[#71717A] mt-1">CARDÁPIO DIGITAL</p>
      </div>

      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs text-[#FFB800] tracking-widest">{category.toUpperCase()}</span>
            <div className="flex-1 h-px bg-[#27272A]" />
          </div>

          <div className="flex flex-col gap-3">
            {categoryItems.map((item) => (
              <div
                key={item.id}
                className="bg-[#0A0A0A] border border-[#27272A] flex hover:border-[#3F3F46] transition-colors overflow-hidden"
              >
                {/* Foto */}
                {item.photo && (
                  <img
                    src={item.photo}
                    alt={item.name}
                    className="w-20 h-20 object-cover shrink-0"
                  />
                )}
                <div className="flex justify-between items-start p-4 flex-1 min-w-0">
                  <div className="flex flex-col gap-1 flex-1 mr-4">
                    <span className="font-mono text-sm text-[#EDEDED]">{item.name}</span>
                    {item.description && (
                      <span className="font-mono text-xs text-[#71717A] leading-relaxed">{item.description}</span>
                    )}
                  </div>
                  <span className="font-mono text-sm text-[#00E559] whitespace-nowrap">
                    R$ {Number(item.salePrice).toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-16 font-mono text-xs text-[#71717A]">
          NENHUM ITEM NO CARDÁPIO
        </div>
      )}
    </div>
  );
}
