import re

with open('server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add imports
old_import = 'from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect'
new_import = 'from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect, UploadFile, File, Form'
content = content.replace(old_import, new_import)

# 2. Add io and re imports
old_imports2 = 'import asyncio\nimport json'
new_imports2 = 'import asyncio\nimport json\nimport io\nimport re'
content = content.replace(old_imports2, new_imports2)

# 3. Expand EstoqueItemUpdate
old_update = '''class EstoqueItemUpdate(BaseModel):
    quantidade: Optional[float] = None
    precoCusto: Optional[float] = None
    precoVenda: Optional[float] = None'''
new_update = '''class EstoqueItemUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    quantidade: Optional[float] = None
    precoCusto: Optional[float] = None
    precoVenda: Optional[float] = None
    porKg: Optional[bool] = None
    foto: Optional[str] = None


class EstoqueDeduzirItem(BaseModel):
    itemId: str
    qtd: float


class EstoqueDeduzirRequest(BaseModel):
    restauranteId: str
    itens: List[EstoqueDeduzirItem]'''
content = content.replace(old_update, new_update)

# 4. Add deduzir endpoint after deletar_item_estoque
old_delete = '''@api_router.delete("/estoque/{item_id}")
async def deletar_item_estoque(item_id: str):
    global _estoque_store
    if await check_mongo():
        await db.estoque.delete_one({"id": item_id})
    else:
        _estoque_store = [i for i in _estoque_store if i["id"] != item_id]
    return {"ok": True}'''

new_delete = '''@api_router.delete("/estoque/{item_id}")
async def deletar_item_estoque(item_id: str):
    global _estoque_store
    if await check_mongo():
        await db.estoque.delete_one({"id": item_id})
    else:
        _estoque_store = [i for i in _estoque_store if i["id"] != item_id]
    return {"ok": True}


@api_router.post("/estoque/deduzir")
async def deduzir_estoque(body: EstoqueDeduzirRequest):
    """Deduz quantidade vendida do estoque apos cada venda."""
    if await check_mongo():
        for item in body.itens:
            await db.estoque.update_one(
                {"id": item.itemId, "restauranteId": body.restauranteId},
                {"$inc": {"quantidade": -item.qtd}}
            )
    else:
        for item in body.itens:
            for i in _estoque_store:
                if i["id"] == item.itemId and i["restauranteId"] == body.restauranteId:
                    i["quantidade"] = max(0, i["quantidade"] - item.qtd)
                    break
    return {"ok": True}'''
content = content.replace(old_delete, new_delete)

# 5. Add PDF upload endpoint after financeiro section (before IA/Celery)
old_ia = '''# ── IA / Celery ────────────────────────────────────────────────────────────'''
new_pdf = '''# ── Cardápio PDF Upload ────────────────────────────────────────────────────

@api_router.post("/cardapio/pdf-upload")
async def upload_pdf_cardapio(
    file: UploadFile = File(...),
    restauranteId: str = Form(...)
):
    """Recebe PDF do cardápio, extrai texto e retorna itens detectados."""
    try:
        from PyPDF2 import PdfReader
        contents = await file.read()
        reader = PdfReader(io.BytesIO(contents))
        text = "\\n".join(page.extract_text() or "" for page in reader.pages)
        
        # Heurística simples para detectar itens: nome + preço
        itens = []
        categorias_detectadas = set()
        
        # Regex para capturar linhas com nome e preços
        # Padrao: Nome do item ... R$ XX,XX ou R$ XX.XX
        lines = text.split('\\n')
        for line in lines:
            line = line.strip()
            # Tenta encontrar preço de venda
            match = re.search(r'R?\\$?\\s*(\\d+[,.]\\d{2})', line)
            if match and len(line) > 3:
                preco_str = match.group(1).replace(',', '.')
                preco_venda = float(preco_str)
                nome = line[:match.start()].strip().rstrip('.,- ')
                # Remove caracteres estranhos
                nome = re.sub(r'[^\\w\\s\\-]', '', nome).strip()
                if nome and len(nome) > 2:
                    itens.append({
                        "nome": nome,
                        "precoVenda": preco_venda,
                        "precoCusto": round(preco_venda * 0.6, 2),  # estimativa 60%
                        "quantidade": 0,
                        "categoria": "Geral"
                    })
                    categorias_detectadas.add("Geral")
        
        return {
            "ok": True,
            "restauranteId": restauranteId,
            "itensDetectados": itens,
            "categoriasDetectadas": list(categorias_detectadas),
            "rawPreview": text[:2000]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar PDF: {str(e)}")

# ── IA / Celery ────────────────────────────────────────────────────────────'''
content = content.replace(old_ia, new_pdf)

with open('server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('Backend updated successfully')
