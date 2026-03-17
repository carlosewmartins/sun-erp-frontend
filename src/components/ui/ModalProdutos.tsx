import { useState, useEffect, useRef } from "react";
import { Button, Input, Modal, Table, Tag, Typography } from "antd";
import type { TableColumnsType } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { Produto } from "../../types";
import { execute } from "../../services/odoo";

const { Text } = Typography;

const POR_PAGINA = 50;

interface Props {
  aberto:      boolean;
  onFechar:    () => void;
  onSelecionar:(produto: Produto) => void;
}

export default function ModalProdutos({ aberto, onFechar, onSelecionar }: Props) {
  const [busca,      setBusca]      = useState("");
  const [produtos,   setProdutos]   = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [pagina,     setPagina]     = useState(1);   // antd Table usa base-1
  const [total,      setTotal]      = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Abre/reseta ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (aberto) {
      setBusca("");
      setPagina(1);
      buscarProdutos("", 1);
    }
  }, [aberto]);

  // ── Query ao Odoo (lógica 100% preservada) ───────────────────────────────
  async function buscarProdutos(termo: string, pag: number) {
    setCarregando(true);
    try {
      const domain = termo
        ? ["|", "|",
            ["name",         "ilike", termo],
            ["barcode",      "=",     termo],
            ["default_code", "ilike", termo],
          ]
        : [];

      const resultado = await execute(
        "product.product",
        "search_read",
        [domain],
        {
          fields: ["id", "name", "barcode", "default_code", "list_price", "qty_available"],
          limit:  POR_PAGINA,
          offset: (pag - 1) * POR_PAGINA,
          order:  "name asc",
        }
      );

      setProdutos(resultado ?? []);

      const count = await execute("product.product", "search_count", [domain]);
      setTotal(count ?? 0);
    } catch {
      setProdutos([]);
    } finally {
      setCarregando(false);
    }
  }

  // ── Busca com debounce ───────────────────────────────────────────────────
  function handleBusca(valor: string) {
    setBusca(valor);
    setPagina(1);
    clearTimeout(timerRef.current!);
    timerRef.current = setTimeout(() => buscarProdutos(valor, 1), 350);
  }

  function handlePagina(novaPagina: number) {
    setPagina(novaPagina);
    buscarProdutos(busca, novaPagina);
  }

  function selecionarEFechar(produto: Produto) {
    onSelecionar(produto);
    onFechar();
  }

  // ── Colunas da tabela ────────────────────────────────────────────────────
  const colunas: TableColumnsType<Produto> = [
    {
      title:     "SKU",
      dataIndex: "default_code",
      width:     110,
      render:    (v: string) => v
        ? <Text code style={{ fontSize: 12 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title:     "Nome",
      dataIndex: "name",
      ellipsis:  true,
      render:    (v: string) => <Text strong style={{ fontSize: 14 }}>{v}</Text>,
    },
    {
      title:     "Cód. Barras",
      dataIndex: "barcode",
      width:     150,
      render:    (v: string) => v
        ? <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title:     "Preço",
      dataIndex: "list_price",
      width:     100,
      align:     "right",
      render:    (v: number) => (
        <Text strong style={{ color: "#F59E0B" }}>
          R$ {(v ?? 0).toFixed(2)}
        </Text>
      ),
    },
    {
      title:     "Estoque",
      dataIndex: "qty_available",
      width:     90,
      align:     "center",
      render:    (v: number) => {
        const qty = v ?? 0;
        return (
          <Tag color={qty > 0 ? "success" : "error"} style={{ margin: 0 }}>
            {qty} un
          </Tag>
        );
      },
    },
    {
      title:  "",
      key:    "acao",
      width:  110,
      render: (_: unknown, record: Produto) => (
        <Button
          type="primary"
          size="small"
          onClick={(e) => { e.stopPropagation(); selecionarEFechar(record); }}
        >
          Selecionar
        </Button>
      ),
    },
  ];

  return (
    <Modal
      title="📦 Produtos Cadastrados"
      open={aberto}
      centered
      onCancel={onFechar}
      keyboard
      width="min(92vw, 860px)"
      footer={
        <Text type="secondary" style={{ fontSize: 13 }}>
          {total} produto{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}
        </Text>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>

        {/* Campo de busca */}
        <Input
          autoFocus
          allowClear
          size="large"
          prefix={<SearchOutlined />}
          placeholder="Buscar por nome, código de barras ou SKU..."
          value={busca}
          onChange={e => handleBusca(e.target.value)}
        />

        {/* Tabela */}
        <Table<Produto>
          rowKey="id"
          size="small"
          columns={colunas}
          dataSource={produtos}
          loading={carregando}
          scroll={{ y: 380 }}
          onRow={(record) => ({
            onClick: () => selecionarEFechar(record),
            style:   { cursor: "pointer" },
          })}
          pagination={{
            current:   pagina,
            pageSize:  POR_PAGINA,
            total,
            onChange:  handlePagina,
            showTotal: () => null,
            size:      "small",
            showSizeChanger: false,
          }}
          locale={{ emptyText: "Nenhum produto encontrado" }}
        />
      </div>
    </Modal>
  );
}