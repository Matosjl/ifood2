# n8n Webhook Templates — ZapFome AI Center

## Como importar

1. Abra n8n em http://zapfome.ddns.net:5678
2. Menu → Import workflow → Cole o JSON do template desejado
3. Ajuste o Evolution API URL e credenciais
4. Ative o workflow (toggle ON)

## Webhooks necessários

| Webhook path | Função | Template |
|---|---|---|
| `/webhook/zapfome/campaign` | Dispara campanha via Evolution | campaign.json |
| `/webhook/zapfome/recovery` | Recuperação de clientes inativos | recovery.json |
| `/webhook/zapfome/report` | Envia relatório no WhatsApp do dono | report.json |

## Payload recebido por cada webhook

### /webhook/zapfome/campaign
```json
{
  "tenantId": "uuid",
  "tenantName": "Restaurante X",
  "waNumber": "5551999999999",
  "ownerPhone": "5551888888888",
  "copy": "🍕 Hoje temos promoção especial...",
  "type": "whatsapp",
  "targetGroup": "all",
  "context": { "ordersToday": 15, "revenueToday": 890.50 }
}
```

### /webhook/zapfome/recovery
```json
{
  "tenantId": "uuid",
  "tenantName": "Restaurante X",
  "waNumber": "5551999999999",
  "customers": [
    { "name": "João Silva", "phone": "5551977777777", "last_order": "2026-05-10", "total_orders": 5 }
  ],
  "days": 15,
  "copy": "Oi João, saudades de você! 🍕 Volte e ganhe 10% off..."
}
```

### /webhook/zapfome/report
```json
{
  "tenantId": "uuid",
  "tenantName": "Restaurante X",
  "ownerPhone": "5551888888888",
  "period": "today",
  "stats": { "orders_today": 23, "revenue_today": 1250.00, "unique_customers": 18 }
}
```
