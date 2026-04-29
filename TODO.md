# TODO - iFood2 Enhancements
Status: [12/13] Core features complete

## Backend (3 steps)
- [ ] 1. Add `/estoque/deduzir` endpoint (deduct sold qty)
- [ ] 2. Add `/cardapio/pdf-upload` (extract itens/cats from PDF)
- [x] 3. Enhance pedido create: kg/gram calc for porKg items (frontend)

## Frontend - Estoque.jsx (0 steps)
✅ Complete

## Frontend - NovoPedido.jsx (5 steps)
- [x] 6. Call deduct stock on finalize
 - [x] 7. Edit/add product modal (form like Estoque)
- [ ] 8. Kg items: grams input + price calc
- [ ] 9. Print buttons 58mm/80mm
- [ ] 10. PDF cardapio upload section

## Frontend - PainelPedidosRestaurante.jsx (2 steps)
- [x] 11. Improve item readability (text-sm, line-height)
- [x] 12. 15min delay alert per pendente order + reprint btn

## Polish (1 step)
- [ ] 13. DigitalMenu: PDF preview/upload integration

**Next:** Backend endpoints
**Test:** docker-compose restart backend, yarn dev

