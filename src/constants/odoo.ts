export const ODOO_CONFIG = {
  URL:      "", // vazio — usa proxy do Vite
  DB:       "odoo_wms",
  USERNAME: "tekaxis.dev@gmail.com",
  PASSWORD: "Tper2012@1",
} as const;

export const PICKING_TYPES = {
  ENTRADA:       1, // Recebimento
  SAIDA:         2, // Pedidos de entrega
  TRANSFERENCIA: 5, // Transferências internas
} as const;