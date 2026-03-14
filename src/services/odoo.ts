import { ODOO_CONFIG, PICKING_TYPES } from "../constants/odoo";
import { LOCATIONS } from "../constants/locations";
import { Produto, SaldoLocalização, ResultadoMovimentacao, TipoVenda } from "../types";

// ─── Cliente XML-RPC via HTTP ────────────────────────────────────────────────

let _uid: number | null = null;

async function xmlrpc(endpoint: string, method: string, params: unknown[]) {
  const body = {
    jsonrpc: "2.0",
    method: "call",
    params: {
      service: endpoint,
      method,
      args:    params,
    },
  };

  const response = await fetch(`${ODOO_CONFIG.URL}/jsonrpc`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.data?.message || data.error.message);
  }

  return data.result;
}

// ─── Autenticação ────────────────────────────────────────────────────────────

export async function autenticar(): Promise<number> {
  if (_uid) return _uid;

  _uid = await xmlrpc("common", "authenticate", [
    ODOO_CONFIG.DB,
    ODOO_CONFIG.USERNAME,
    ODOO_CONFIG.PASSWORD,
    {},
  ]);

  if (!_uid) throw new Error("Falha na autenticação com o Odoo");
  return _uid;
}

export async function execute(model: string, method: string, args: unknown[], kwargs = {}) {
  const uid = await autenticar();
  return xmlrpc("object", "execute_kw", [
    ODOO_CONFIG.DB,
    uid,
    ODOO_CONFIG.PASSWORD,
    model,
    method,
    args,
    kwargs,
  ]);
}

// ─── Produtos ────────────────────────────────────────────────────────────────

export async function buscarPorBarcode(barcode: string): Promise<Produto | null> {
  const resultado = await execute(
    "product.product",
    "search_read",
    [[["barcode", "=", barcode]]],
    { fields: ["id", "name", "barcode", "default_code", "qty_available", "list_price"], limit: 1 }
  );
  
  return resultado.length > 0 ? resultado[0] : null;
}

export async function buscarSaldoPorLocal(productId: number): Promise<SaldoLocalização[]> {
  return execute(
    "stock.quant",
    "search_read",
    [[
      ["product_id", "=", productId],
      ["location_id.usage", "=", "internal"],
    ]],
    { fields: ["location_id", "quantity", "reserved_quantity"] }
  );
}

// ─── Movimentações ───────────────────────────────────────────────────────────

async function criarPicking(
  pickingTypeId: number,
  locationId: number,
  locationDestId: number,
  productId: number,
  quantidade: number,
  descricao: string
): Promise<number> {
  return execute(
    "stock.picking",
    "create",
    [{
      picking_type_id:  pickingTypeId,
      location_id:      locationId,
      location_dest_id: locationDestId,
      move_ids: [[0, 0, {
        name:             descricao,
        product_id:       productId,
        product_uom_qty:  quantidade,
        product_uom:      1,
        location_id:      locationId,
        location_dest_id: locationDestId,
      }]],
    }]
  );
}

async function confirmarEValidarPicking(pickingId: number, quantidade: number) {
  // Confirma
  await execute("stock.picking", "action_confirm", [[pickingId]]);

  // Busca move lines
  const moves = await execute(
    "stock.move",
    "search_read",
    [[["picking_id", "=", pickingId]]],
    { fields: ["id", "move_line_ids", "location_id", "location_dest_id", "product_id", "product_uom"] }
  );

  for (const move of moves) {
    if (move.move_line_ids.length > 0) {
      // Move lines já existem — apenas atualiza quantidade
      await execute(
        "stock.move.line",
        "write",
        [move.move_line_ids, { quantity: quantidade }]
      );
    } else {
      // Produto sem saldo — cria move line manualmente
      await execute(
        "stock.move.line",
        "create",
        [{
          move_id:          move.id,
          picking_id:       pickingId,
          product_id:       move.product_id[0],
          product_uom_id:   move.product_uom[0],
          quantity:         quantidade,
          location_id:      move.location_id[0],
          location_dest_id: move.location_dest_id[0],
        }]
      );
    }
  }

  // Valida
  await execute("stock.picking", "button_validate", [[pickingId]]);
}

// ─── Validação de Saldo ──────────────────────────────────────────────────────

export async function validarSaldo(
  productId: number,
  locationId: number,
  quantidade: number
): Promise<{ suficiente: boolean; saldoAtual: number }> {
  const quants = await execute(
    "stock.quant",
    "search_read",
    [[
      ["product_id", "=", productId],
      ["location_id", "=", locationId],
    ]],
    { fields: ["quantity"], limit: 1 }
  );

  const saldoAtual = quants.length > 0 ? quants[0].quantity : 0;
  return { suficiente: saldoAtual >= quantidade, saldoAtual };
}

// ─── Operações de Negócio ────────────────────────────────────────────────────

export async function entradaMercadoria(
  productId: number,
  quantidade: number,
  locationDestId: number
): Promise<ResultadoMovimentacao> {
  try {
    // Entrada no estoque fiscal
    const pickingFiscal = await criarPicking(
      PICKING_TYPES.ENTRADA,
      LOCATIONS.FORNECEDOR.id,
      LOCATIONS.FISCAL.id,
      productId,
      quantidade,
      "Entrada NF-e → Estoque Fiscal"
    );
    await confirmarEValidarPicking(pickingFiscal, quantidade);

    // Entrada no estoque real (galpão escolhido)
    const pickingReal = await criarPicking(
      PICKING_TYPES.ENTRADA,
      LOCATIONS.FORNECEDOR.id,
      locationDestId,
      productId,
      quantidade,
      "Entrada NF-e → Estoque Real"
    );
    await confirmarEValidarPicking(pickingReal, quantidade);

    return { sucesso: true, picking_id: pickingReal };
  } catch (error: unknown) {
    return { sucesso: false, erro: (error as Error).message };
  }
}

export async function registrarVenda(
  productId: number,
  quantidade: number,
  tipoVenda: TipoVenda
): Promise<ResultadoMovimentacao> {
  try {
    // Baixa no estoque real (WH/Estoque — sempre)
    const pickingReal = await criarPicking(
      PICKING_TYPES.SAIDA,
      LOCATIONS.WH_ESTOQUE.id,
      LOCATIONS.CLIENTE.id,
      productId,
      quantidade,
      `Venda ${tipoVenda.toUpperCase()} → WH/Estoque`
    );
    await confirmarEValidarPicking(pickingReal, quantidade);

    // Baixa no estoque fiscal (apenas NFC-e)
    if (tipoVenda === "nfce") {
      const pickingFiscal = await criarPicking(
        PICKING_TYPES.SAIDA,
        LOCATIONS.FISCAL.id,
        LOCATIONS.CLIENTE.id,
        productId,
        quantidade,
        "Venda NFC-e → Estoque Fiscal"
      );
      await confirmarEValidarPicking(pickingFiscal, quantidade);
    }

    return { sucesso: true, picking_id: pickingReal };
  } catch (error: unknown) {
    return { sucesso: false, erro: (error as Error).message };
  }
}

export async function transferirEntreGalpoes(
  productId: number,
  quantidade: number,
  locationOrigemId: number,
  locationDestinoId: number
): Promise<ResultadoMovimentacao> {
  try {
    const { suficiente, saldoAtual } = await validarSaldo(
      productId,
      locationOrigemId,
      quantidade
    );

    if (!suficiente) {
      return {
        sucesso: false,
        erro: `Saldo insuficiente na origem: ${saldoAtual} un disponíveis`,
      };
    }

    const pickingId = await criarPicking(
      PICKING_TYPES.TRANSFERENCIA,
      locationOrigemId,
      locationDestinoId,
      productId,
      quantidade,
      "Transferência entre galpões"
    );
    await confirmarEValidarPicking(pickingId, quantidade);

    return { sucesso: true, picking_id: pickingId };
  } catch (error: unknown) {
    return { sucesso: false, erro: (error as Error).message };
  }
}

export async function buscarProdutos(termo: string, offset = 0, limit = 50): Promise<unknown[]> {
  const domain = termo
    ? ["|", "|",
        ["name",         "ilike", termo],
        ["barcode",      "=",     termo],
        ["default_code", "ilike", termo],
      ]
    : [];

  return execute("product.product", "search_read", [domain], {
    fields: ["id", "name", "barcode", "default_code", "list_price", "qty_available", "uom_id", "active"],
    limit,
    offset,
    order: "name asc",
  });
}

export async function contarProdutos(termo: string): Promise<number> {
  const domain = termo
    ? ["|", "|",
        ["name",         "ilike", termo],
        ["barcode",      "=",     termo],
        ["default_code", "ilike", termo],
      ]
    : [];
  return execute("product.product", "search_count", [domain]);
}

export async function criarProduto(dados: {
  name: string;
  barcode?: string;
  default_code?: string;
  list_price: number;
  type: string;
}): Promise<number> {
  return execute("product.template", "create", [{
    ...dados,
    type: "product", // ← sempre armazenável
  }]);
}

export async function atualizarProduto(id: number, dados: {
  name?: string;
  barcode?: string;
  default_code?: string;
  list_price?: number;
}): Promise<boolean> {
  return execute("product.template", "write", [[id], dados]);
}

export async function buscarSaldosProduto(productId: number): Promise<unknown[]> {
  return execute(
    "stock.quant",
    "search_read",
    [[["product_id", "=", productId], ["location_id.usage", "=", "internal"]]],
    { fields: ["location_id", "quantity", "reserved_quantity"] }
  );
}

export async function ajusteEstoque(
  productId: number,
  locationId: number,
  quantidade: number,
  tipo: "entrada" | "saida"
): Promise<ResultadoMovimentacao> {
  try {
    // Busca quant atual
    const quants = await execute(
      "stock.quant",
      "search_read",
      [[["product_id", "=", productId], ["location_id", "=", locationId]]],
      { fields: ["id", "quantity"], limit: 1 }
    );

    const saldoAtual = quants.length > 0 ? quants[0].quantity : 0;
    const novoSaldo  = tipo === "entrada"
      ? saldoAtual + quantidade
      : saldoAtual - quantidade;

    return ajusteDireto(productId, locationId, novoSaldo);
  } catch (error: unknown) {
    return { sucesso: false, erro: (error as Error).message };
  }
}

export async function ajusteDireto(
  productId: number,
  locationId: number,
  quantidadeNova: number
): Promise<ResultadoMovimentacao> {
  try {
    // Busca ou cria o quant
    const quants = await execute(
      "stock.quant",
      "search_read",
      [[["product_id", "=", productId], ["location_id", "=", locationId]]],
      { fields: ["id", "quantity"], limit: 1 }
    );

    if (quants.length > 0) {
      // Atualiza quant existente via inventário
      await execute(
        "stock.quant",
        "write",
        [[quants[0].id], { inventory_quantity: quantidadeNova }]
      );
      await execute(
        "stock.quant",
        "action_apply_inventory",
        [[quants[0].id]]
      );
    } else {
      // Cria novo quant via inventário
      const quantId = await execute(
        "stock.quant",
        "create",
        [{
          product_id:           productId,
          location_id:          locationId,
          inventory_quantity:   quantidadeNova,
        }]
      );
      await execute(
        "stock.quant",
        "action_apply_inventory",
        [[quantId]]
      );
    }

    return { sucesso: true };
  } catch (error: unknown) {
    return { sucesso: false, erro: (error as Error).message };
  }
}

export async function buscarSaldosTodos(productIds: number[]): Promise<Record<number, number>> {
  if (productIds.length === 0) return {};

  const quants = await execute(
    "stock.quant",
    "search_read",
    [[
      ["product_id", "in", productIds],
      ["location_id.usage", "=", "internal"],
      ["location_id", "!=", 17], // ← exclui Estoque Fiscal
    ]],
    { fields: ["product_id", "quantity"] }
  );

  const totais: Record<number, number> = {};
  for (const q of quants) {
    const pid = q.product_id[0];
    totais[pid] = (totais[pid] ?? 0) + q.quantity;
  }
  return totais;
}