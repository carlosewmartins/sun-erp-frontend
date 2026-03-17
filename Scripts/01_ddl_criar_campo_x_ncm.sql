-- =============================================================================
-- Cria o campo x_ncm (NCM) em product.template no Odoo 17.
--
-- USO:
--   Linux/Proxmox (como usuário postgres):
--     sudo -u postgres psql odoo_wms -f criar_campo_x_ncm.sql
--
--   Ou dentro do psql interativo:
--     \c odoo_wms
--     \i /caminho/para/criar_campo_x_ncm.sql
--
--   Após executar: reinicie o serviço do Odoo
--     sudo systemctl restart odoo
-- =============================================================================

-- 1. Cria a coluna na tabela física (IF NOT EXISTS = seguro rodar mais de uma vez)
ALTER TABLE product_template
  ADD COLUMN IF NOT EXISTS x_ncm VARCHAR(10);

-- 2. Registra o campo no ORM do Odoo (só insere se ainda não existir)
INSERT INTO ir_model_fields
  (model_id, model, name, field_description, ttype, state, size, copied)
SELECT
  m.id,
  m.model,
  'x_ncm',
  '{"en_US": "NCM"}'::json,
  'char',
  'manual',
  10,
  true
FROM ir_model m
WHERE m.model = 'product.template'
  AND NOT EXISTS (
    SELECT 1 FROM ir_model_fields f
    WHERE f.model_id = m.id AND f.name = 'x_ncm'
  );

-- 3. Confirmação
SELECT
  f.id,
  f.name,
  f.model,
  f.ttype,
  f.state,
  f.size
FROM ir_model_fields f
WHERE f.name = 'x_ncm';