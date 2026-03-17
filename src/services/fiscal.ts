// ─── Tipos ───────────────────────────────────────────────────────────────────

export type FormaPagamento = "dinheiro" | "credito" | "debito" | "pix";

export interface ItemNFCe {
  produtoId:  number;
  nome:       string;
  ncm:        string;
  barcode?:   string;
  quantidade: number;
  valorUnit:  number;
}

export interface DadosNFCe {
  itens:           ItemNFCe[];
  formaPagamento:  FormaPagamento;
  cpfCnpjCliente?: string;
  valorTotal:      number;
  desconto?:       number; // ← desconto global em R$ (opcional)
}

export interface ResultadoNFCe {
  sucesso:   boolean;
  chave?:    string;
  danfeUrl?: string;
  xml?:      string;
  erro?:     string;
  status?:   string;
}

// ─── Mapa de formas de pagamento ─────────────────────────────────────────────

const FORMA_PAGAMENTO_COD: Record<FormaPagamento, string> = {
  dinheiro: "01",
  credito:  "03",
  debito:   "04",
  pix:      "17",
};

// ─── Configurações ───────────────────────────────────────────────────────────

const FOCUS_URL   = "/focusnfe";
const FOCUS_TOKEN = import.meta.env.VITE_FOCUSNFE_TOKEN;
const FOCUS_BASE  = import.meta.env.VITE_FOCUSNFE_URL;
const CNPJ        = import.meta.env.VITE_FOCUSNFE_CNPJ;

// ─── Funções auxiliares ──────────────────────────────────────────────────────

function gerarReferencia(): string {
  return `NFCe${Date.now()}${Math.random().toString(36).substring(2, 7)}`;
}

function formatarValor(valor: number): string {
  return valor.toFixed(2);
}

function montarUrl(caminho?: string): string | undefined {
  if (!caminho) return undefined;
  return `${FOCUS_BASE}${caminho}`;
}

// ─── Distribui desconto global proporcionalmente entre os itens ───────────────
// A SEFAZ exige desconto por item — não existe desconto global na NFC-e.
// A soma dos descontos deve ser exatamente igual ao desconto total,
// por isso o resíduo de arredondamento vai para o último item.

function distribuirDesconto(
  itens: ItemNFCe[],
  descontoGlobal: number
): number[] {
  if (descontoGlobal <= 0) return itens.map(() => 0);

  const totalBruto = itens.reduce(
    (acc, i) => acc + i.quantidade * i.valorUnit, 0
  );

  // arredonda cada item para 2 casas
  const descontos = itens.map((item) => {
    const valorItem = item.quantidade * item.valorUnit;
    const peso      = valorItem / totalBruto;
    return Math.round(descontoGlobal * peso * 100) / 100;
  });

  // corrige resíduo de arredondamento no último item
  const somaDistribuida = descontos.reduce((a, b) => a + b, 0);
  const residuo = Math.round((descontoGlobal - somaDistribuida) * 100) / 100;
  descontos[descontos.length - 1] =
    Math.round((descontos[descontos.length - 1] + residuo) * 100) / 100;

  return descontos;
}

// ─── Emissão de NFC-e ────────────────────────────────────────────────────────

export async function emitirNFCe(dados: DadosNFCe): Promise<ResultadoNFCe> {
  try {
    const referencia      = gerarReferencia();
    const descontoGlobal  = dados.desconto ?? 0;
    const descontosItens  = distribuirDesconto(dados.itens, descontoGlobal);

    const itens = dados.itens.map((item, index) => {
      const valorBrutoItem    = item.quantidade * item.valorUnit;
      const descontoItem      = descontosItens[index];
      const valorLiquidoItem  = valorBrutoItem - descontoItem;

      return {
        numero_item:               String(index + 1),
        codigo_produto:            String(item.produtoId),
        codigo_barras:             item.barcode || "SEM GTIN",
        descricao:                 item.nome,
        codigo_ncm:                item.ncm || "00000000",
        cfop:                      "5102",
        unidade_comercial:         "UN",
        quantidade_comercial:      formatarValor(item.quantidade),
        valor_unitario_comercial:  formatarValor(item.valorUnit),
        valor_bruto:               formatarValor(valorBrutoItem),
        unidade_tributavel:        "UN",
        quantidade_tributavel:     formatarValor(item.quantidade),
        valor_unitario_tributavel: formatarValor(item.valorUnit),
        valor_desconto:            formatarValor(descontoItem),   // ← desconto por item
        valor_total_tributos:      formatarValor(valorLiquidoItem),

        // ICMS — Simples Nacional CSOSN 400
        icms_origem:              "0",
        icms_situacao_tributaria: "400",

        // PIS e COFINS — isentos
        pis_situacao_tributaria:    "07",
        cofins_situacao_tributaria: "07",
      };
    });

    const payload = {
      cnpj_emitente:              CNPJ,
      natureza_operacao:          "Venda de mercadoria",
      data_emissao:               new Date().toISOString(),
      modalidade_frete:           "9",
      regime_tributario_emitente: "1",
      consumidor_final:           "1",
      presenca_comprador:         "1",
      finalidade_emissao:         "1",

      ...(dados.cpfCnpjCliente && dados.cpfCnpjCliente.length === 11 && {
        cpf_destinatario: dados.cpfCnpjCliente,
      }),
      ...(dados.cpfCnpjCliente && dados.cpfCnpjCliente.length === 14 && {
        cnpj_destinatario: dados.cpfCnpjCliente,
      }),

      items: itens,

      formas_pagamento: [{
        forma_pagamento: FORMA_PAGAMENTO_COD[dados.formaPagamento],
        valor_pagamento: formatarValor(dados.valorTotal), // ← já é o valor líquido
      }],
    };

    const response = await fetch(
      `${FOCUS_URL}/v2/nfce?ref=${referencia}`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Basic ${btoa(FOCUS_TOKEN + ":")}`,
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();

    if (data.status === "autorizado") {
      return {
        sucesso:  true,
        chave:    data.chave_nfe,
        danfeUrl: data.url || montarUrl(data.caminho_danfe),
        xml:      montarUrl(data.caminho_xml_nota_fiscal),
        status:   data.status,
      };
    }

    if (data.status === "processando_autorizacao") {
      return await consultarNFCe(referencia);
    }

    return {
      sucesso: false,
      erro:    data.mensagem_sefaz || data.mensagem || "Erro desconhecido",
      status:  data.status,
    };

  } catch (error: unknown) {
    return {
      sucesso: false,
      erro:    (error as Error).message,
    };
  }
}

// ─── Consulta de NFC-e (polling) ─────────────────────────────────────────────

export async function consultarNFCe(
  referencia: string,
  tentativas = 5
): Promise<ResultadoNFCe> {
  for (let i = 0; i < tentativas; i++) {
    await new Promise(r => setTimeout(r, 2000));

    try {
      const response = await fetch(
        `${FOCUS_URL}/v2/nfce/${referencia}`,
        {
          headers: {
            "Authorization": `Basic ${btoa(FOCUS_TOKEN + ":")}`,
          },
        }
      );

      const data = await response.json();

      if (data.status === "autorizado") {
        return {
          sucesso:  true,
          chave:    data.chave_nfe,
          danfeUrl: data.url || montarUrl(data.caminho_danfe),
          xml:      montarUrl(data.caminho_xml_nota_fiscal),
          status:   data.status,
        };
      }

      if (data.status === "erro_autorizacao" || data.status === "denegado") {
        return {
          sucesso: false,
          erro:    data.mensagem_sefaz || data.mensagem,
          status:  data.status,
        };
      }

    } catch {
      continue;
    }
  }

  return {
    sucesso: false,
    erro:    "Tempo limite de autorização esgotado. Verifique o painel da Focus NFe.",
  };
}

// ─── Download autenticado do DANFE ───────────────────────────────────────────

export async function buscarDanfeHtml(url: string): Promise<string> {
  const fetchUrl = url.startsWith("http")
    ? url.replace(FOCUS_BASE!, FOCUS_URL)
    : `${FOCUS_URL}${url}`;

  const response = await fetch(fetchUrl, {
    headers: {
      "Authorization": `Basic ${btoa(FOCUS_TOKEN + ":")}`,
    },
  });

  if (!response.ok) throw new Error("Erro ao baixar DANFE");

  return await response.text();
}

// ─── Cancelamento de NFC-e ───────────────────────────────────────────────────

export async function cancelarNFCe(
  referencia: string,
  justificativa: string
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const response = await fetch(
      `${FOCUS_URL}/v2/nfce/${referencia}`,
      {
        method:  "DELETE",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Basic ${btoa(FOCUS_TOKEN + ":")}`,
        },
        body: JSON.stringify({ justificativa }),
      }
    );

    const data = await response.json();

    return {
      sucesso: data.status === "cancelado",
      erro:    data.status !== "cancelado" ? data.mensagem : undefined,
    };
  } catch (error: unknown) {
    return { sucesso: false, erro: (error as Error).message };
  }
}