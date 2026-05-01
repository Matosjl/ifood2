"""
ai_agent.py — Agente ZapFome com LangGraph + OpenAI
====================================================
Grafo ReAct: LLM decide quais ferramentas usar → ferramentas consultam
MongoDB em tempo real → LLM monta resposta final com dados reais.

Modos:
  cliente  → ferramentas: cardápio, info do restaurante, status do pedido
  operador → tudo acima + resumo do dia, alertas de estoque
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
from typing_extensions import TypedDict

logger = logging.getLogger(__name__)

# ── Referência ao Motor DB — injetada pelo server.py no startup ──────────────
_db: Any = None


def init_agent(db: Any) -> None:
    """Injeta a referência ao banco. Chamado uma única vez no startup."""
    global _db
    _db = db


# ─────────────────────────────────────────────────────────────────────────────
# FERRAMENTAS — consultam MongoDB em tempo real
# ─────────────────────────────────────────────────────────────────────────────

@tool
async def buscar_cardapio(restaurante_id: str) -> str:
    """
    Busca itens disponíveis no cardápio de um restaurante.
    Use quando o cliente perguntar sobre pratos, preços ou opções do menu.
    """
    if _db is None:
        return "Banco de dados indisponível."
    try:
        itens = await _db.estoque.find(
            {"restauranteId": restaurante_id, "quantidade": {"$gt": 0}},
            {"_id": 0, "nome": 1, "categoria": 1, "precoVenda": 1, "descricao": 1},
        ).limit(25).to_list(25)

        if not itens:
            return "Nenhum item disponível no cardápio no momento."

        por_cat: Dict[str, List[str]] = {}
        for item in itens:
            cat = item.get("categoria", "Geral")
            desc = f" — {item['descricao'][:45]}" if item.get("descricao") else ""
            linha = f"• {item['nome']}: R$ {item.get('precoVenda', 0):.2f}{desc}"
            por_cat.setdefault(cat, []).append(linha)

        linhas: List[str] = []
        for cat, items in por_cat.items():
            linhas.append(f"[{cat}]")
            linhas.extend(items)
        return "\n".join(linhas)

    except Exception as exc:
        logger.error("buscar_cardapio: %s", exc)
        return "Erro ao buscar cardápio."


@tool
async def info_restaurante(restaurante_id: str) -> str:
    """
    Retorna informações do restaurante: nome, descrição, taxa de entrega e tempo estimado.
    Use quando o cliente perguntar sobre o restaurante, horários ou entrega.
    """
    if _db is None:
        return "Informações indisponíveis."
    try:
        r = await _db.restaurantes.find_one(
            {"id": restaurante_id},
            {"_id": 0, "nome": 1, "descricao": 1, "telefone": 1,
             "taxaEntrega": 1, "tempoEstimado": 1, "endereco": 1, "categoria": 1},
        )
        if not r:
            return "Restaurante não encontrado."
        return (
            f"Nome: {r.get('nome', '')}\n"
            f"Tipo: {r.get('categoria', '')}\n"
            f"Descrição: {r.get('descricao') or 'N/A'}\n"
            f"Taxa de entrega: R$ {float(r.get('taxaEntrega', 0)):.2f}\n"
            f"Tempo estimado: {r.get('tempoEstimado', '30-45 min')}\n"
            f"Telefone: {r.get('telefone') or 'N/A'}"
        )
    except Exception as exc:
        logger.error("info_restaurante: %s", exc)
        return "Erro ao buscar informações do restaurante."


@tool
async def consultar_pedido(pedido_id: str) -> str:
    """
    Consulta status e detalhes de um pedido pelo ID (últimos 6 caracteres são suficientes).
    Use quando o cliente quiser saber onde está o pedido.
    """
    if _db is None:
        return "Banco de dados indisponível."
    try:
        pedido = await _db.pedidos.find_one(
            {"id": pedido_id},
            {"_id": 0, "status": 1, "clienteNome": 1, "total": 1, "itens": 1, "tipo": 1},
        )
        if not pedido:
            return f"Pedido não encontrado com ID: {pedido_id}"

        STATUS_PT = {
            "pendente": "⏳ Aguardando confirmação",
            "aceito": "👨‍🍳 Em preparo",
            "confirmado": "✅ Confirmado",
            "em_preparo": "👨‍🍳 Em preparo",
            "pronto": "🔔 Pronto para retirada",
            "em_entrega": "🛵 Saiu para entrega",
            "entregue": "🎉 Entregue!",
            "cancelado": "❌ Cancelado",
        }
        itens_str = ", ".join(f"{i['qtd']}x {i['nome']}" for i in pedido.get("itens", []))
        return (
            f"Pedido #{pedido_id[-6:].upper()}\n"
            f"Status: {STATUS_PT.get(pedido['status'], pedido['status'])}\n"
            f"Itens: {itens_str}\n"
            f"Total: R$ {float(pedido.get('total', 0)):.2f}"
        )
    except Exception as exc:
        logger.error("consultar_pedido: %s", exc)
        return "Erro ao consultar pedido."


@tool
async def resumo_operacional(restaurante_id: str) -> str:
    """
    Retorna resumo do dia: contagem de pedidos por status, faturamento e alertas de estoque baixo.
    Use apenas no modo operador, quando o gerente pedir o desempenho do dia.
    """
    if _db is None:
        return "Banco de dados indisponível."
    try:
        hoje = datetime.now(timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ).isoformat()

        # Pedidos por status
        linhas: List[str] = ["📊 Pedidos hoje:"]
        total_pedidos = 0
        for status in ["pendente", "aceito", "em_preparo", "pronto", "entregue", "cancelado"]:
            n = await _db.pedidos.count_documents(
                {"restauranteId": restaurante_id, "status": status, "criadoEm": {"$gte": hoje}}
            )
            if n > 0:
                linhas.append(f"  {status}: {n}")
                total_pedidos += n
        if total_pedidos == 0:
            linhas.append("  Nenhum pedido hoje ainda")

        # Faturamento
        vendas = await _db.pedidos.find(
            {"restauranteId": restaurante_id, "status": "entregue", "criadoEm": {"$gte": hoje}},
            {"_id": 0, "total": 1},
        ).to_list(None)
        faturado = sum(float(v.get("total", 0)) for v in vendas)
        linhas.append(f"💰 Faturado: R$ {faturado:.2f}")

        # Estoque baixo
        alertas = await _db.estoque.find(
            {"restauranteId": restaurante_id,
             "$expr": {"$lte": ["$quantidade", "$estoqueMinimo"]}},
            {"_id": 0, "nome": 1, "quantidade": 1, "estoqueMinimo": 1},
        ).limit(8).to_list(8)
        if alertas:
            linhas.append("⚠️  Estoque baixo:")
            for a in alertas:
                linhas.append(f"  {a['nome']}: {a['quantidade']} (mín {a.get('estoqueMinimo', 0)})")

        return "\n".join(linhas)

    except Exception as exc:
        logger.error("resumo_operacional: %s", exc)
        return "Erro ao buscar resumo operacional."


@tool
async def listar_pedidos_ativos(restaurante_id: str) -> str:
    """
    Lista pedidos pendentes e em preparo do restaurante agora.
    Use quando o operador perguntar sobre pedidos em aberto.
    """
    if _db is None:
        return "Banco de dados indisponível."
    try:
        pedidos = await _db.pedidos.find(
            {"restauranteId": restaurante_id,
             "status": {"$in": ["pendente", "aceito", "em_preparo", "pronto"]}},
            {"_id": 0, "id": 1, "clienteNome": 1, "status": 1, "total": 1, "itens": 1},
        ).sort("criadoEm", 1).limit(15).to_list(15)

        if not pedidos:
            return "Nenhum pedido ativo no momento."

        linhas = [f"📋 {len(pedidos)} pedido(s) ativo(s):"]
        for p in pedidos:
            itens_str = ", ".join(f"{i['qtd']}x {i['nome']}" for i in p.get("itens", [])[:3])
            linhas.append(
                f"  #{p['id'][-6:].upper()} [{p['status']}] "
                f"{p.get('clienteNome', 'Cliente')} — {itens_str}"
            )
        return "\n".join(linhas)

    except Exception as exc:
        logger.error("listar_pedidos_ativos: %s", exc)
        return "Erro ao listar pedidos ativos."


# ─────────────────────────────────────────────────────────────────────────────
# ESTADO DO GRAFO
# ─────────────────────────────────────────────────────────────────────────────

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    restaurante_id: Optional[str]
    modo: str


# ─────────────────────────────────────────────────────────────────────────────
# GRAFO — compilado lazily por modo
# ─────────────────────────────────────────────────────────────────────────────

_compiled_graphs: Dict[str, Any] = {}

TOOLS_CLIENTE = [buscar_cardapio, info_restaurante, consultar_pedido]
TOOLS_OPERADOR = [buscar_cardapio, info_restaurante, consultar_pedido,
                  resumo_operacional, listar_pedidos_ativos]


def _build_graph(modo: str, model_name: str, api_key: str) -> Any:
    tools = TOOLS_OPERADOR if modo == "operador" else TOOLS_CLIENTE

    llm = ChatOpenAI(
        model=model_name,
        api_key=api_key,
        temperature=0.7,
        max_tokens=450,
    ).bind_tools(tools)

    tool_node = ToolNode(tools)

    async def agent_node(state: AgentState) -> Dict:
        response = await llm.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(AgentState)
    graph.add_node("agent", agent_node)
    graph.add_node("tools", tool_node)
    graph.set_entry_point("agent")
    graph.add_conditional_edges("agent", tools_condition)
    graph.add_edge("tools", "agent")

    return graph.compile()


def _get_graph(modo: str, model_name: str, api_key: str) -> Any:
    key = f"{modo}:{model_name}"
    if key not in _compiled_graphs:
        _compiled_graphs[key] = _build_graph(modo, model_name, api_key)
    return _compiled_graphs[key]


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT — chamado pelo endpoint /api/ai/chat
# ─────────────────────────────────────────────────────────────────────────────

async def run_agent(
    mensagem: str,
    historico: List[Dict[str, str]],
    restaurante_id: Optional[str],
    modo: str,
    openai_api_key: str,
    openai_model: str,
) -> str:
    """Executa o grafo LangGraph e retorna a resposta final em texto."""

    # System prompt por modo
    if modo == "operador":
        system = (
            "Você é AJAX, assistente operacional do ZapFome. "
            "Responda em português, seja direto e use dados reais das ferramentas. "
            "Para perguntas sobre vendas, estoque ou pedidos, SEMPRE use as ferramentas antes de responder."
        )
    else:
        system = (
            "Você é o assistente do ZapFome, app de delivery. "
            "Responda em português, seja simpático e objetivo. "
            "SEMPRE consulte o cardápio real antes de sugerir pratos ou informar preços. "
            "Nunca invente informações — use as ferramentas disponíveis."
        )

    if restaurante_id:
        system += f"\n\nRestaurante atual (use este ID nas ferramentas): {restaurante_id}"

    # Monta histórico de mensagens
    msgs: List[BaseMessage] = [SystemMessage(content=system)]
    for h in (historico or [])[-8:]:
        role = h.get("role", "")
        content = str(h.get("content", ""))[:400]
        if role == "user":
            msgs.append(HumanMessage(content=content))
        elif role == "assistant":
            msgs.append(AIMessage(content=content))

    msgs.append(HumanMessage(content=mensagem[:700]))

    # Executa o grafo
    graph = _get_graph(modo, openai_model, openai_api_key)
    result = await graph.ainvoke({
        "messages": msgs,
        "restaurante_id": restaurante_id,
        "modo": modo,
    })

    last = result["messages"][-1]
    return last.content or "Não consegui processar sua mensagem."
