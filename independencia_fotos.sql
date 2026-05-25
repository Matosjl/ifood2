-- Fotos para todos os produtos da Independencia Express
-- Usando imagens do Unsplash (CDN estável)

UPDATE products SET image_url = CASE id

  -- ── HOT DOGS PADRÃO ──────────────────────────────────────────────
  WHEN 'd277ebe3-5d31-4b33-bd41-0865797294ea'::uuid -- Hot Dog Simples
    THEN 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=500&q=80'
  WHEN '7fb212d5-2ad8-4810-8f49-594104ee0978'::uuid -- Hot Dog Completo
    THEN 'https://images.unsplash.com/photo-1612031887937-e0e96e8ba900?auto=format&fit=crop&w=500&q=80'
  WHEN '327707d7-73c1-4433-8898-1528f7f8d699'::uuid -- Hot Dog Bacon
    THEN 'https://images.unsplash.com/photo-1559622214-f8a9850965bb?auto=format&fit=crop&w=500&q=80'
  WHEN '2745bb25-9486-4118-9e58-f16796c227a2'::uuid -- Hot Dog Calabresa
    THEN 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=500&q=80'
  WHEN '91fb5bd9-54de-455f-8e5e-7b5e449b8a2b'::uuid -- Hot Dog Frango
    THEN 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=500&q=80'
  WHEN 'ecc879d1-17a9-43cc-a701-468cb507b712'::uuid -- Hot Dog Salada
    THEN 'https://images.unsplash.com/photo-1612031887937-e0e96e8ba900?auto=format&fit=crop&w=500&q=80'
  WHEN '369335bd-91b8-45bf-8959-b5498c78b16e'::uuid -- Hot Dog Misto
    THEN 'https://images.unsplash.com/photo-1559622214-f8a9850965bb?auto=format&fit=crop&w=500&q=80'
  WHEN 'ee77931e-1d46-4d14-a5a4-2a34aa561f46'::uuid -- Hot Dog Cheddar
    THEN 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=500&q=80'
  WHEN 'd18f0749-8dba-4708-9e74-3680985e462f'::uuid -- Hot Dog Catupiry
    THEN 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=500&q=80'
  WHEN '26c9cb20-d78a-445b-bd65-93fea2e006bc'::uuid -- Hot Dog Tudo
    THEN 'https://images.unsplash.com/photo-1612031887937-e0e96e8ba900?auto=format&fit=crop&w=500&q=80'
  WHEN '0af25c60-36ea-4224-8ddb-4bb8769bbeb8'::uuid -- Hot Paulista
    THEN 'https://images.unsplash.com/photo-1559622214-f8a9850965bb?auto=format&fit=crop&w=500&q=80'

  -- ── HOT DOGS PREMIUM ─────────────────────────────────────────────
  WHEN 'b4bc0c24-8d5f-4c3f-9d74-13c1cdc1fdc0'::uuid -- Hot Dog Gourmet Artesanal
    THEN 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=500&q=80'
  WHEN 'cf14e040-7e8e-4e27-8d28-e1d63239983f'::uuid -- Hot Dog Costela BBQ
    THEN 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=500&q=80'
  WHEN 'f6f47208-db33-4d44-998a-a4fdaf6982ea'::uuid -- Hot Dog 4 Queijos
    THEN 'https://images.unsplash.com/photo-1612031887937-e0e96e8ba900?auto=format&fit=crop&w=500&q=80'
  WHEN 'd4b9efbe-c9ea-4024-8c4a-847beb756b22'::uuid -- Hot Dog Camarão
    THEN 'https://images.unsplash.com/photo-1559622214-f8a9850965bb?auto=format&fit=crop&w=500&q=80'
  WHEN '8e74c968-5381-480f-9873-8457eb40ecb2'::uuid -- Hot Dog Picanha
    THEN 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=500&q=80'
  WHEN 'c16caee7-69ed-46a5-a4a2-a9d43430061c'::uuid -- Hot Dog Mexicano
    THEN 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=500&q=80'
  WHEN '6bfe94a4-233e-4990-b4b9-82eab97faec3'::uuid -- Hot Dog Pulled Pork
    THEN 'https://images.unsplash.com/photo-1612031887937-e0e96e8ba900?auto=format&fit=crop&w=500&q=80'
  WHEN '65434698-9833-4551-9096-b7f29af6b66c'::uuid -- Hot Dog Burrata
    THEN 'https://images.unsplash.com/photo-1559622214-f8a9850965bb?auto=format&fit=crop&w=500&q=80'
  WHEN '43be306d-31aa-43ba-8b5b-bcbcf4156774'::uuid -- Hot Dog Bacon Cheddar Premium
    THEN 'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?auto=format&fit=crop&w=500&q=80'
  WHEN 'a8c7c682-7324-434f-b5a3-e9c2c1b74a0c'::uuid -- Hot Dog da Casa
    THEN 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=500&q=80'

  -- ── XIS PADRÃO ───────────────────────────────────────────────────
  WHEN '7d57ea4d-ab0e-40da-84ce-ddd54ae401b5'::uuid -- Xis Salada
    THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80'
  WHEN '719316b0-ed06-4abc-add7-e10bc78d02df'::uuid -- Xis Burger
    THEN 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=80'
  WHEN '70f9e08f-7bce-45df-9f4a-fe6617fa9b2e'::uuid -- Xis Bacon
    THEN 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=500&q=80'
  WHEN '21f473c1-dcb6-49a3-8f23-01b1e8a432fc'::uuid -- Xis Egg
    THEN 'https://images.unsplash.com/photo-1554520735-0a6b8b6ce8b7?auto=format&fit=crop&w=500&q=80'
  WHEN '4504cdc0-97d6-4d3e-8b75-3bbcd999266f'::uuid -- Xis Calabresa
    THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80'
  WHEN '1c672199-b6ee-463c-b034-b9e83857fdca'::uuid -- Xis Frango
    THEN 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=80'
  WHEN 'bb57b308-6abe-4220-b170-c14016af237e'::uuid -- Xis Coração
    THEN 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=500&q=80'
  WHEN 'fa312cb9-dbe7-4e56-9d36-800d23daceac'::uuid -- Xis Completo
    THEN 'https://images.unsplash.com/photo-1554520735-0a6b8b6ce8b7?auto=format&fit=crop&w=500&q=80'
  WHEN '434366fe-8599-443e-ac62-eea4c407bde6'::uuid -- Xis Catupiry
    THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80'
  WHEN '79e686d7-d071-4204-b26d-3b70fe406574'::uuid -- Xis Tudo
    THEN 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=80'

  -- ── XIS PREMIUM ──────────────────────────────────────────────────
  WHEN 'f855a456-75e1-4ad3-9f8e-7eb5a88c5172'::uuid -- Xis Gourmet da Casa
    THEN 'https://images.unsplash.com/photo-1551782450-17144efb9c50?auto=format&fit=crop&w=500&q=80'
  WHEN 'bd41b124-269d-48ac-9b26-1b2e5659bbc6'::uuid -- Xis Picanha
    THEN 'https://images.unsplash.com/photo-1544025162-d76538b8e9b4?auto=format&fit=crop&w=500&q=80'
  WHEN '2eedb9ac-82d6-494a-b365-92667d92b67b'::uuid -- Xis 4 Queijos Premium
    THEN 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=500&q=80'
  WHEN '17892ede-be22-4b86-89e1-df57bc794d21'::uuid -- Xis BBQ Pulled
    THEN 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=500&q=80'
  WHEN '5e07b42f-81fc-4123-8574-1a95bd3d9537'::uuid -- Xis Costela
    THEN 'https://images.unsplash.com/photo-1551782450-17144efb9c50?auto=format&fit=crop&w=500&q=80'
  WHEN '70ecd447-777d-4918-bacd-83f3f89d275a'::uuid -- Xis Camarão Premium
    THEN 'https://images.unsplash.com/photo-1565680018093-ebb6b9ba4b89?auto=format&fit=crop&w=500&q=80'
  WHEN 'd9de5c96-9325-416b-88d9-d433d49f9bae'::uuid -- Xis Australiano
    THEN 'https://images.unsplash.com/photo-1554520735-0a6b8b6ce8b7?auto=format&fit=crop&w=500&q=80'
  WHEN 'cd9c4188-518b-42bc-a391-b4bdbc6f2500'::uuid -- Xis Veggie Gourmet
    THEN 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=500&q=80'
  WHEN '5cff0ae7-7615-4462-ba83-254fed03eab9'::uuid -- Xis Burrata
    THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80'
  WHEN '2e206601-0e1a-4274-ae7c-c82c799f0789'::uuid -- Xis Smash Duplo
    THEN 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=500&q=80'

  -- ── COMBOS ───────────────────────────────────────────────────────
  WHEN 'afefacb4-8f95-4288-b795-32427a455053'::uuid -- Combo Padrão
    THEN 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?auto=format&fit=crop&w=500&q=80'
  WHEN '2bbfabd6-47de-488b-b977-3f594c08a489'::uuid -- Combo Premium
    THEN 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=500&q=80'
  WHEN 'e534d4af-741f-4975-bd2f-05abd6a18665'::uuid -- Combo Família
    THEN 'https://images.unsplash.com/photo-1504674900347-14ad1a3b8f6c?auto=format&fit=crop&w=500&q=80'

  -- ── ADICIONAIS — CARNES ──────────────────────────────────────────
  WHEN 'e42424b2-9fcd-4478-b247-f57e17197003'::uuid -- Adicional: Hambúrguer extra
    THEN 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=500&q=80'
  WHEN '549c3fe7-dc07-4f91-9748-98f8e70495a3'::uuid -- Adicional: Salsicha extra
    THEN 'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?auto=format&fit=crop&w=500&q=80'
  WHEN 'd9b42942-f1bf-4499-a648-0320479cf7fc'::uuid -- Adicional: Bacon
    THEN 'https://images.unsplash.com/photo-1528750117652-74ca6e4a13f3?auto=format&fit=crop&w=500&q=80'
  WHEN 'e60c7890-8547-455e-be3c-442fe87edcd0'::uuid -- Adicional: Calabresa
    THEN 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?auto=format&fit=crop&w=500&q=80'
  WHEN '297b20d6-c8a3-4140-ad4a-1034f2862001'::uuid -- Adicional: Frango desfiado
    THEN 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=500&q=80'
  WHEN '641ad9ab-9bef-458c-9184-e480b450755d'::uuid -- Adicional: Coração de frango
    THEN 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?auto=format&fit=crop&w=500&q=80'
  WHEN '243d5639-0a10-4a73-ba3b-f05cea29636f'::uuid -- Adicional: Picanha em tiras
    THEN 'https://images.unsplash.com/photo-1544025162-d76538b8e9b4?auto=format&fit=crop&w=500&q=80'
  WHEN '68df8063-f421-4a71-a06e-84ce8a2d7993'::uuid -- Adicional: Costela desfiada
    THEN 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=500&q=80'
  WHEN '2e4d12ce-8802-4d83-8409-0f050a84b0e6'::uuid -- Adicional: Pulled pork
    THEN 'https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=500&q=80'
  WHEN '625da67d-5105-4720-ab58-dcfbbc56ed97'::uuid -- Adicional: Camarões
    THEN 'https://images.unsplash.com/photo-1565680018093-ebb6b9ba4b89?auto=format&fit=crop&w=500&q=80'

  -- ── ADICIONAIS — QUEIJOS ─────────────────────────────────────────
  WHEN 'fe7c05ac-05da-48a2-b9de-6539c7a24589'::uuid -- Adicional: Queijo padrão
    THEN 'https://images.unsplash.com/photo-1552767929-4a1ea048ed95?auto=format&fit=crop&w=500&q=80'
  WHEN '4a3e71a0-a981-488b-8673-3511db165fe8'::uuid -- Adicional: Catupiry
    THEN 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=500&q=80'
  WHEN '2386b203-2890-41a1-b429-09c66c73c6b4'::uuid -- Adicional: Cheddar cremoso
    THEN 'https://images.unsplash.com/photo-1552767929-4a1ea048ed95?auto=format&fit=crop&w=500&q=80'
  WHEN '3c8e118b-60ff-4c1c-a41e-19b29dd72ae7'::uuid -- Adicional: Provolone
    THEN 'https://images.unsplash.com/photo-1552767929-4a1ea048ed95?auto=format&fit=crop&w=500&q=80'
  WHEN 'a83777ae-8c05-4360-9f3f-660cf230766d'::uuid -- Adicional: Gorgonzola
    THEN 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=500&q=80'
  WHEN 'cdb21cc3-c721-4703-970a-44a4203114b9'::uuid -- Adicional: Brie
    THEN 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=500&q=80'
  WHEN '4f2c5c56-e09c-4c51-a221-863fdad4c7d1'::uuid -- Adicional: Coalho
    THEN 'https://images.unsplash.com/photo-1552767929-4a1ea048ed95?auto=format&fit=crop&w=500&q=80'
  WHEN 'd94fdfab-a641-4c5c-a1c4-0b45b28d961d'::uuid -- Adicional: Burrata
    THEN 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=500&q=80'

  -- ── ADICIONAIS — OUTROS ──────────────────────────────────────────
  WHEN 'a98cf79a-6fe6-48c6-a1af-528a06c51008'::uuid -- Adicional: Ovo
    THEN 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?auto=format&fit=crop&w=500&q=80'
  WHEN '0cd13911-1f53-46b9-8926-fe81395ca569'::uuid -- Adicional: Milho/Ervilha
    THEN 'https://images.unsplash.com/photo-1551754655-cd27e38d2076?auto=format&fit=crop&w=500&q=80'
  WHEN '5a27f207-bb61-4858-94e4-64c5003df5f1'::uuid -- Adicional: Champignon
    THEN 'https://images.unsplash.com/photo-1504545102780-26774c1bb073?auto=format&fit=crop&w=500&q=80'
  WHEN '3b26028b-9833-4807-be18-1fbbcc0a3465'::uuid -- Adicional: Cebola caramelizada
    THEN 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=500&q=80'
  WHEN '258ed9ea-d980-4e55-8269-2f92db768eff'::uuid -- Adicional: Tomate seco
    THEN 'https://images.unsplash.com/photo-1471927975706-62d64a0de487?auto=format&fit=crop&w=500&q=80'
  WHEN 'bd0d700a-5f45-4368-a0c9-d79906e34b0d'::uuid -- Adicional: Rúcula
    THEN 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=500&q=80'

  ELSE image_url
END
WHERE tenant_id = 'e3da3ef9-4d5c-4a67-98c1-701b00bf6961';

-- Verificação
SELECT COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS com_foto,
       COUNT(*) FILTER (WHERE image_url IS NULL)     AS sem_foto
FROM products
WHERE tenant_id = 'e3da3ef9-4d5c-4a67-98c1-701b00bf6961';
