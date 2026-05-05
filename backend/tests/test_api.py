"""
Basic production smoke tests.
Run with:  cd backend && pytest tests/ -v
"""
import os
import re
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from pydantic import ValidationError

# Ensure backend/ is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Set required env vars BEFORE importing server (avoids KeyError on startup)
# ---------------------------------------------------------------------------
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "ifood2_test")
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-production")
os.environ.setdefault("ADMIN_USER", "admin")
os.environ.setdefault("ADMIN_PASS", "admin123")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")


# ---------------------------------------------------------------------------
# Model validation tests (no DB needed)
# ---------------------------------------------------------------------------

class TestOrderItemValidation:
    def test_valid_unit_item(self):
        from server import OrderItem
        item = OrderItem(name="Pizza", quantity=2, unit_price=30.0, sale_type="unit")
        assert item.name == "Pizza"
        assert item.quantity == 2

    def test_valid_kg_item(self):
        from server import OrderItem
        item = OrderItem(name="Carne", quantity=1, unit_price=50.0, sale_type="kg", weight_kg=0.5)
        assert item.weight_kg == 0.5

    def test_empty_name_rejected(self):
        from server import OrderItem
        with pytest.raises(ValidationError):
            OrderItem(name="", quantity=1, unit_price=10.0)

    def test_name_stripped(self):
        from server import OrderItem
        item = OrderItem(name="  Pizza  ", quantity=1, unit_price=10.0)
        assert item.name == "Pizza"

    def test_zero_quantity_rejected(self):
        from server import OrderItem
        with pytest.raises(ValidationError):
            OrderItem(name="Item", quantity=0, unit_price=10.0)

    def test_negative_price_rejected(self):
        from server import OrderItem
        with pytest.raises(ValidationError):
            OrderItem(name="Item", quantity=1, unit_price=-5.0)

    def test_invalid_sale_type_rejected(self):
        from server import OrderItem
        with pytest.raises(ValidationError):
            OrderItem(name="Item", quantity=1, unit_price=10.0, sale_type="piece")


class TestProductValidation:
    def test_valid_product(self):
        from server import ProductCreate
        p = ProductCreate(name="Hamburguer", sale_type="unit", cost_price=10.0, sale_price=25.0)
        assert p.name == "Hamburguer"

    def test_negative_cost_rejected(self):
        from server import ProductCreate
        with pytest.raises(ValidationError):
            ProductCreate(name="X", cost_price=-1.0, sale_price=10.0)

    def test_negative_stock_rejected(self):
        from server import ProductCreate
        with pytest.raises(ValidationError):
            ProductCreate(name="X", cost_price=1.0, sale_price=5.0, stock_qty=-1.0)

    def test_empty_name_rejected(self):
        from server import ProductCreate
        with pytest.raises(ValidationError):
            ProductCreate(name="   ", cost_price=1.0, sale_price=5.0)


class TestOrderStatusValidation:
    def test_valid_status(self):
        from server import OrderStatusUpdate
        u = OrderStatusUpdate(status="confirmed")
        assert u.status == "confirmed"

    def test_invalid_status_rejected(self):
        from server import OrderStatusUpdate
        with pytest.raises(ValidationError):
            OrderStatusUpdate(status="unknown_status")


class TestManualOrderValidation:
    def test_empty_items_rejected(self):
        from server import ManualOrderCreate
        with pytest.raises(ValidationError):
            ManualOrderCreate(items=[])

    def test_valid_order(self):
        from server import ManualOrderCreate, ManualOrderItem
        order = ManualOrderCreate(
            customer_name="João",
            items=[ManualOrderItem(product_id="abc123", quantity=2)],
        )
        assert len(order.items) == 1


class TestReplenishValidation:
    def test_zero_quantity_rejected(self):
        from server import ReplenishRequest
        with pytest.raises(ValidationError):
            ReplenishRequest(quantity=0)

    def test_negative_quantity_rejected(self):
        from server import ReplenishRequest
        with pytest.raises(ValidationError):
            ReplenishRequest(quantity=-5)

    def test_valid_replenish(self):
        from server import ReplenishRequest
        r = ReplenishRequest(quantity=10.0, reason="Compra do dia")
        assert r.quantity == 10.0


# ---------------------------------------------------------------------------
# Auth token tests
# ---------------------------------------------------------------------------

class TestAuth:
    def test_create_token_returns_string(self):
        from server import create_token
        token = create_token("admin")
        assert isinstance(token, str)
        assert len(token) > 20

    def test_token_is_valid_jwt(self):
        import jwt as pyjwt
        from server import create_token, JWT_SECRET, JWT_ALGORITHM
        token = create_token("admin")
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        assert payload["sub"] == "admin"


# ---------------------------------------------------------------------------
# Stock deduction unit tests (mocked DB)
# ---------------------------------------------------------------------------

def _make_db_mock(find_one_fn, find_one_and_update_fn=None, update_one_fn=None, insert_one_fn=None):
    """Build a mock db where .products and .stock_movements have the given async methods."""
    mock_products = MagicMock()
    mock_products.find_one = find_one_fn
    mock_products.find_one_and_update = find_one_and_update_fn or AsyncMock(return_value=None)
    mock_products.update_one = update_one_fn or AsyncMock(return_value=None)

    mock_movements = MagicMock()
    mock_movements.insert_one = insert_one_fn or AsyncMock(return_value=None)

    mock_db = MagicMock()
    mock_db.products = mock_products
    mock_db.stock_movements = mock_movements
    return mock_db


@pytest.mark.asyncio
async def test_deduct_stock_insufficient():
    """find_one_and_update returns None → insufficient stock → error returned."""
    import server as srv

    product_doc = {"id": "prod-1", "name": "Pizza", "stock_qty": 1.0}
    order_doc = {
        "order_number": 42,
        "items": [{"name": "Pizza", "quantity": 3, "sale_type": "unit"}],
    }

    mock_db = _make_db_mock(
        find_one_fn=AsyncMock(return_value=product_doc),
        find_one_and_update_fn=AsyncMock(return_value=None),  # stock check fails
    )
    with patch("server.db", mock_db):
        errors = await srv.deduct_stock_for_order(order_doc)

    assert len(errors) == 1
    assert "insuficiente" in errors[0].lower()


@pytest.mark.asyncio
async def test_deduct_stock_success():
    """find_one_and_update succeeds → empty error list."""
    import server as srv

    product_doc = {"id": "prod-1", "name": "Pizza", "stock_qty": 10.0}
    order_doc = {
        "order_number": 1,
        "items": [{"name": "Pizza", "quantity": 2, "sale_type": "unit"}],
    }

    mock_db = _make_db_mock(
        find_one_fn=AsyncMock(return_value=product_doc),
        find_one_and_update_fn=AsyncMock(return_value=product_doc),
    )
    with patch("server.db", mock_db):
        errors = await srv.deduct_stock_for_order(order_doc)

    assert errors == []


@pytest.mark.asyncio
async def test_deduct_stock_rollback_on_second_item_failure():
    """Second item fails atomic deduction → first item is rolled back."""
    import server as srv

    products = {
        "frango": {"id": "prod-1", "name": "Frango", "stock_qty": 10.0},
        "batata": {"id": "prod-2", "name": "Batata", "stock_qty": 0.5},
    }
    order_doc = {
        "order_number": 2,
        "items": [
            {"name": "Frango", "quantity": 2, "sale_type": "unit"},
            {"name": "Batata", "quantity": 5, "sale_type": "unit"},
        ],
    }

    call_count = {"find_one": 0, "find_one_and_update": 0}
    update_one_calls: list = []

    async def mock_find_one(query, *args, **kwargs):
        call_count["find_one"] += 1
        pattern = query.get("name")
        for key, doc in products.items():
            if pattern and re.search(pattern.pattern, key, re.IGNORECASE):
                return doc
        return None

    async def mock_find_update(query, update, *args, **kwargs):
        call_count["find_one_and_update"] += 1
        pid = query.get("id")
        if pid == "prod-1":
            return products["frango"]
        return None  # Batata fails

    async def mock_update_one(query, update, *args, **kwargs):
        update_one_calls.append((query, update))

    mock_db = _make_db_mock(
        find_one_fn=mock_find_one,
        find_one_and_update_fn=mock_find_update,
        update_one_fn=mock_update_one,
    )
    with patch("server.db", mock_db):
        errors = await srv.deduct_stock_for_order(order_doc)

    assert len(errors) == 1, f"Expected 1 error, got: {errors}"
    assert any("prod-1" in str(c) for c in update_one_calls), "Rollback not called for Frango"


# ---------------------------------------------------------------------------
# HTTP endpoint smoke tests (mocked DB)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_endpoint():
    from httpx import AsyncClient, ASGITransport
    import server as srv

    with patch.object(srv.db, "command", new=AsyncMock(return_value={"ok": 1})):
        async with AsyncClient(transport=ASGITransport(app=srv.app), base_url="http://test") as client:
            resp = await client.get("/api/health")

    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_login_wrong_password_returns_401():
    from httpx import AsyncClient, ASGITransport
    import server as srv

    async with AsyncClient(transport=ASGITransport(app=srv.app), base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_order_without_auth_returns_403():
    from httpx import AsyncClient, ASGITransport
    import server as srv

    payload = {
        "customer_name": "Test",
        "items": [{"product_id": "abc", "quantity": 1}],
    }
    async with AsyncClient(transport=ASGITransport(app=srv.app), base_url="http://test") as client:
        resp = await client.post("/api/orders", json=payload)

    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_invalid_product_returns_422():
    from httpx import AsyncClient, ASGITransport
    import server as srv

    # Negative sale_price should be rejected
    token_resp = None
    async with AsyncClient(transport=ASGITransport(app=srv.app), base_url="http://test") as client:
        login = await client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        token = login.json().get("access_token", "")
        resp = await client.post(
            "/api/products",
            json={"name": "X", "sale_price": -10.0, "cost_price": 5.0},
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 422
