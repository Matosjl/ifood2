#!/usr/bin/env python3
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import uuid

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "ifood2"

async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Limpa dados de teste
    await db.estoque.delete_many({"restauranteId": "teste"})
    await db.pedidos.delete_many({"restauranteId": "teste"})
    
    # SEED ESTOQUE
    _now = datetime.now(timezone.utc).isoformat()
    estoque_items = [
        {"id": str(uuid.uuid4()), "restauranteId": "teste", "nome": "X-Burguer", "categoria": "Lanches", "quantidade": 15, "estoqueMinimo": 5.0, "precoCusto": 12.5, "precoVenda": 28.9, "porKg": False, "criadoEm": _now},
        {"id": str(uuid.uuid4()), "restauranteId": "teste", "nome": "Coca-Cola 350ml", "categoria": "Bebidas", "quantidade": 42, "estoqueMinimo": 10.0, "precoCusto": 2.5, "precoVenda": 6.9, "porKg": False, "criadoEm": _now},
        {"id": str(uuid.uuid4()), "restauranteId": "teste", "nome": "Pizza Margherita", "categoria": "Pizzas", "quantidade": 8, "estoqueMinimo": 2.0, "precoCusto": 22.0, "precoVenda": 49.9, "porKg": False, "criadoEm": _now},
        {"id": str(uuid.uuid4()), "restauranteId": "teste", "nome": "Batata Frita", "categoria": "Lanches", "quantidade": 3, "estoqueMinimo": 1.0, "precoCusto": 8.0, "precoVenda": 22.0, "porKg": True, "criadoEm": _now},
    ]
    await db.estoque.insert_many(estoque_items)
    
    # SEED PEDIDOS TESTE
    pedidos = [
        {
            "id": str(uuid.uuid4()),
            "restauranteId": "teste",
            "clienteNome": "João Silva",
            "clienteTelefone": "(11) 99999-1234",
            "tipo": "entrega",
            "status": "confirmado",
            "statusTimeline": [
                {"status": "pendente", "timestamp": (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(), "motivo": None},
                {"status": "confirmado", "timestamp": datetime.now(timezone.utc).isoformat(), "motivo": None},
            ],
            "itens": [{"nome": "X-Burguer", "qtd": 2, "precoUnitario": 28.9}],
            "subtotal": 57.8,
            "taxaEntrega": 5.0,
            "desconto": 0.0,
            "total": 62.8,
            "pagamento": "pix",
            "criadoEm": (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat(),
            "observacao": "Sem cebola",
        },
        {
            "id": str(uuid.uuid4()),
            "restauranteId": "teste",
            "clienteNome": "Maria Souza",
            "clienteTelefone": "(11) 98888-5678",
            "tipo": "retirada",
            "status": "pronto",
            "statusTimeline": [
                {"status": "pronto", "timestamp": datetime.now(timezone.utc).isoformat(), "motivo": None},
            ],
            "itens": [{"nome": "Coca-Cola 350ml", "qtd": 3, "precoUnitario": 6.9}],
            "subtotal": 20.7,
            "taxaEntrega": 0.0,
            "desconto": 0.0,
            "total": 20.7,
            "pagamento": "dinheiro",
            "criadoEm": (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat(),
        }
    ]
    await db.pedidos.insert_many(pedidos)
    
    # Caixa teste
    await db.caixas.insert_one({
        "id": str(uuid.uuid4()),
        "restauranteId": "teste",
        "fundo": 100.0,
        "status": "aberto",
        "abertoEm": (datetime.now(timezone.utc) - timedelta(hours=4)).isoformat()
    })
    
    print("✅ SEED DATA inserido!")
    print(f"Estoque: {len(estoque_items)} itens")
    print(f"Pedidos: {len(pedidos)} teste")
    client.close()

if __name__ == "__main__":
    asyncio.run(seed())

