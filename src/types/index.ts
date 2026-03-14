export interface Produto {
  id: number;
  name: string;
  barcode: string;
  default_code: string; // SKU
  qty_available: number;
  list_price: number;
}

export interface SaldoLocalização {
  location_id: [number, string];
  quantity: number;
  reserved_quantity: number;
}

export interface ItemVenda {
  produto: Produto;
  quantidade: number;
  preco_unitario: number;
}

export interface ResultadoMovimentacao {
  sucesso: boolean;
  picking_id?: number;
  erro?: string;
}

export type TipoVenda = "recibo" | "nfce";

export type TipoOperacao = "entrada" | "saida" | "transferencia";