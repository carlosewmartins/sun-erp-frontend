import { useState, useEffect, useRef } from "react";
import {
  App,
  Alert,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Input,
  InputNumber,
  Modal,
  Pagination,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  AppstoreOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  TagOutlined,
} from "@ant-design/icons";
import {
  buscarProdutos,
  contarProdutos,
  criarProduto,
  atualizarProduto,
  buscarSaldosProduto,
  ajusteEstoque,
  ajusteDireto,
  buscarSaldosTodos,
  execute,
} from "../../services/odoo";
import ModalVariantes from "../../components/ui/ModalVariantes";
import { LOCATION_LIST } from "../../constants/locations";

const { Text, Title } = Typography;

// ─── Campo NCM no product.template ───────────────────────────────────────────
// Trocar para 'l10n_br_ncm_code' após instalar l10n_br_fiscal no Proxmox
const NCM_FIELD = "x_ncm" as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Produto {
  id:            number;
  name:          string;
  barcode:       string | false;
  default_code:  string | false;
  list_price:    number;
  qty_available: number;
  uom_id:        [number, string] | false;
}

interface SaldoLocal {
  location_id:       [number, string];
  quantity:          number;
  reserved_quantity: number;
}

interface FormData {
  name:         string;
  barcode:      string;
  default_code: string;
  list_price:   string;
  ncm:          string;   // ← NCM (8 dígitos numéricos)
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const FORM_VAZIO: FormData = {
  name:         "",
  barcode:      "",
  default_code: "",
  list_price:   "",
  ncm:          "",
};

const POR_PAGINA    = 50;
const ESTOQUE_BAIXO = 5;

const C = {
  amber:   "#F59E0B",
  success: "#22C55E",
  error:   "#EF4444",
  bgRow:   "#F8FAFC",
} as const;

// ─── Componente ──────────────────────────────────────────────────────────────

export default function Produtos() {
  const { message, modal } = App.useApp();

  // ── Estados ──────────────────────────────────────────────────────────────
  const [produtos,       setProdutos]       = useState<Produto[]>([]);
  const [total,          setTotal]          = useState(0);
  const [pagina,         setPagina]         = useState(1);
  const [busca,          setBusca]          = useState("");
  const [carregando,     setCarregando]     = useState(true);
  const [modalAberto,    setModalAberto]    = useState(false);
  const [editando,       setEditando]       = useState<Produto | null>(null);
  const [form,           setForm]           = useState<FormData>(FORM_VAZIO);
  const [salvando,       setSalvando]       = useState(false);
  const [saldos,         setSaldos]         = useState<SaldoLocal[]>([]);
  const [produtoDetalhe, setProdutoDetalhe] = useState<Produto | null>(null);
  const [modalAjuste,    setModalAjuste]    = useState(false);
  const [ajusteTipo,     setAjusteTipo]     = useState<"entrada" | "saida" | "direto">("entrada");
  const [ajusteLocal,    setAjusteLocal]    = useState<number>(LOCATION_LIST[0].id);
  const [ajusteQtd,      setAjusteQtd]     = useState<number | null>(null);
  const [ajustando,      setAjustando]     = useState(false);
  const [saldosTotais,   setSaldosTotais]  = useState<Record<number, number>>({});
  const [modalVariantes, setModalVariantes] = useState(false);

  // ── Estados NCM ───────────────────────────────────────────────────────────
  // ncmMap:    product.product.id → ncm string
  // tmplIdMap: product.product.id → product.template.id
  const [ncmMap,    setNcmMap]    = useState<Record<number, string>>({});
  const [tmplIdMap, setTmplIdMap] = useState<Record<number, number>>({});

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { carregar("", 1); }, []);

  // ── Lógica de negócio ─────────────────────────────────────────────────────

  async function carregar(termo: string, pag: number) {
    setCarregando(true);
    try {
      const [lista, count] = await Promise.all([
        buscarProdutos(termo, (pag - 1) * POR_PAGINA, POR_PAGINA),
        contarProdutos(termo),
      ]);
      const produtosList = lista as Produto[];
      setProdutos(produtosList);
      setTotal(count);

      const ids    = produtosList.map(p => p.id);
      const totais = await buscarSaldosTodos(ids);
      setSaldosTotais(totais);

      // Busca NCMs (falha silenciosa — não bloqueia a tela)
      await carregarNcms(ids);
    } catch {
      message.error("Erro ao carregar produtos.");
    } finally {
      setCarregando(false);
    }
  }

  /**
   * Busca NCMs de uma lista de product.product ids.
   * Faz join: product.product → product_tmpl_id → product.template → NCM_FIELD
   */
  async function carregarNcms(prodIds: number[]) {
    if (!prodIds.length) return;
    try {
      // 1. Busca product_tmpl_id
      const prodTmpls = await execute(
        "product.product", "read",
        [prodIds, ["id", "product_tmpl_id"]],
      ) as Array<{ id: number; product_tmpl_id: [number, string] }>;

      const newTmplIdMap: Record<number, number> = {};
      prodTmpls.forEach(p => { newTmplIdMap[p.id] = p.product_tmpl_id[0]; });
      setTmplIdMap(newTmplIdMap);

      // 2. Busca NCM_FIELD nos templates
      const tmplIds = [...new Set(Object.values(newTmplIdMap))];
      const tmpls = await execute(
        "product.template", "read",
        [tmplIds, ["id", NCM_FIELD]],
      ) as Array<{ id: number; [key: string]: unknown }>;

      const tmplNcmMap: Record<number, string> = {};
      tmpls.forEach(t => {
        const v = t[NCM_FIELD];
        if (typeof v === "string" && v.trim()) tmplNcmMap[t.id] = v.trim();
      });

      // 3. Monta mapa product.product.id → ncm
      const map: Record<number, string> = {};
      prodTmpls.forEach(p => { map[p.id] = tmplNcmMap[p.product_tmpl_id[0]] || ""; });
      setNcmMap(map);
    } catch {
      // NCM não obrigatório para exibição — falha silenciosa
    }
  }

  function handleBusca(valor: string) {
    setBusca(valor);
    setPagina(1);
    clearTimeout(timerRef.current!);
    timerRef.current = setTimeout(() => carregar(valor, 1), 350);
  }

  function handlePagina(novaPagina: number) {
    setPagina(novaPagina);
    carregar(busca, novaPagina);
  }

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setModalAberto(true);
  }

  function abrirEditar(p: Produto) {
    setEditando(p);
    setForm({
      name:         p.name,
      barcode:      p.barcode || "",
      default_code: p.default_code || "",
      list_price:   String(p.list_price),
      ncm:          ncmMap[p.id] || "",    // ← preenche NCM atual
    });
    setModalAberto(true);
  }

  async function abrirDetalhe(p: Produto) {
    setProdutoDetalhe(p);
    const s = await buscarSaldosProduto(p.id);
    setSaldos(s as SaldoLocal[]);
  }

  async function salvar() {
    if (!form.name.trim()) {
      message.error("Nome do produto é obrigatório.");
      return;
    }
    setSalvando(true);
    try {
      const ncmLimpo = form.ncm.replace(/\D/g, "");

      const dados = {
        name:         form.name.trim(),
        barcode:      form.barcode.trim() || undefined,
        default_code: form.default_code.trim() || undefined,
        list_price:   parseFloat(form.list_price) || 0,
        type:         "product",
      };

      if (editando) {
        await atualizarProduto(editando.id, dados);

        // Salva NCM no template (usa tmplIdMap para o ID correto)
        const tmplId = tmplIdMap[editando.id];
        if (tmplId && ncmLimpo) {
          await execute("product.template", "write", [
            [tmplId],
            { [NCM_FIELD]: ncmLimpo },
          ]);
        }

        message.success("Produto atualizado com sucesso!");
      } else {
        const templateId = await criarProduto(dados) as number;

        // Salva NCM no template recém-criado
        if (ncmLimpo && templateId) {
          await execute("product.template", "write", [
            [templateId],
            { [NCM_FIELD]: ncmLimpo },
          ]);
        }

        message.success("Produto criado com sucesso!");
      }

      setModalAberto(false);
      carregar(busca, pagina);
    } catch {
      message.error("Erro ao salvar produto.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarAjuste() {
    if (!produtoDetalhe) return;
    if (!ajusteQtd || ajusteQtd <= 0) {
      message.error("Informe uma quantidade válida.");
      return;
    }
    setAjustando(true);
    try {
      const resultado = ajusteTipo === "direto"
        ? await ajusteDireto(produtoDetalhe.id, ajusteLocal, ajusteQtd)
        : await ajusteEstoque(produtoDetalhe.id, ajusteLocal, ajusteQtd, ajusteTipo);

      if (resultado.sucesso) {
        message.success("Estoque ajustado com sucesso!");
        setModalAjuste(false);
        setAjusteQtd(null);
        const s = await buscarSaldosProduto(produtoDetalhe.id);
        setSaldos(s as SaldoLocal[]);
        carregar(busca, pagina);
      } else {
        message.error(resultado.erro ?? "Erro ao ajustar estoque.");
      }
    } catch {
      message.error("Erro ao ajustar estoque.");
    } finally {
      setAjustando(false);
    }
  }

  // ── Alertas de estoque ────────────────────────────────────────────────────
  const produtosNegativos = produtos.filter(p => (saldosTotais[p.id] ?? 0) < 0);
  const produtosAlerta    = produtos.filter(p => {
    const s = saldosTotais[p.id] ?? 0;
    return s >= 0 && s <= ESTOQUE_BAIXO;
  });

  // ── Colunas da tabela ─────────────────────────────────────────────────────
  const colunas: TableColumnsType<Produto> = [
    {
      title:     "Nome",
      dataIndex: "name",
      ellipsis:  true,
      render:    (v: string, record: Produto) => {
        const saldo = saldosTotais[record.id] ?? 0;
        return (
          <Space size={8}>
            <Text strong>{v}</Text>
            {saldo < 0 && <Tag color="error">Negativo</Tag>}
            {saldo >= 0 && saldo <= ESTOQUE_BAIXO && <Tag color="warning">Baixo</Tag>}
          </Space>
        );
      },
    },
    {
      title:     "SKU",
      dataIndex: "default_code",
      width:     120,
      render:    (v: string) => v
        ? <Text code style={{ fontSize: 12 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
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
      // Coluna NCM — exibe valor do ncmMap ou "—" se não cadastrado
      title:  "NCM",
      key:    "ncm",
      width:  110,
      align:  "center",
      render: (_: unknown, record: Produto) => {
        const ncm = ncmMap[record.id];
        return ncm
          ? <Text code style={{ fontSize: 11 }}>{ncm}</Text>
          : <Tag color="warning" style={{ fontSize: 11 }}>Sem NCM</Tag>;
      },
    },
    {
      title:     "Preço",
      dataIndex: "list_price",
      width:     110,
      align:     "right",
      render:    (v: number) => (
        <Text strong style={{ color: C.amber }}>R$ {v.toFixed(2)}</Text>
      ),
    },
    {
      title:  "Estoque",
      key:    "estoque",
      width:  100,
      align:  "center",
      render: (_: unknown, record: Produto) => {
        const saldo = saldosTotais[record.id] ?? 0;
        return (
          <Tag color={saldo < 0 ? "error" : saldo <= ESTOQUE_BAIXO ? "warning" : "success"}>
            {saldo} un
          </Tag>
        );
      },
    },
    {
      title:  "",
      key:    "acoes",
      width:  100,
      render: (_: unknown, record: Produto) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={e => { e.stopPropagation(); abrirEditar(record); }}
        >
          Editar
        </Button>
      ),
    },
  ];

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={3} style={{ margin: 0 }}>Produtos e Estoque</Title>
        </Col>
        <Col>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={abrirNovo}
          >
            Novo Produto
          </Button>
        </Col>
      </Row>

      {/* Alertas */}
      {produtosNegativos.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={`${produtosNegativos.length} produto(s) com saldo negativo`}
        />
      )}
      {produtosAlerta.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${produtosAlerta.length} produto(s) com estoque baixo (≤ ${ESTOQUE_BAIXO} un)`}
        />
      )}

      {/* Busca */}
      <Row align="middle" gutter={12}>
        <Col flex="auto">
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="Buscar por nome, código de barras ou SKU..."
            value={busca}
            onChange={e => handleBusca(e.target.value)}
          />
        </Col>
        <Col>
          <Text type="secondary">{total} produtos</Text>
        </Col>
      </Row>

      {/* Tabela */}
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, overflow: "hidden" }}>
        <Table<Produto>
          rowKey="id"
          size="small"
          columns={colunas}
          dataSource={produtos}
          loading={carregando}
          scroll={{ y: "calc(100vh - 380px)" }}
          onRow={record => ({
            onClick: () => abrirDetalhe(record),
            style:   { cursor: "pointer" },
          })}
          pagination={false}
          locale={{ emptyText: "Nenhum produto encontrado" }}
        />
      </div>

      {/* Paginação */}
      <Row justify="end">
        <Pagination
          current={pagina}
          pageSize={POR_PAGINA}
          total={total}
          onChange={handlePagina}
          showSizeChanger={false}
          size="small"
          showTotal={(t) => `${t} produtos`}
        />
      </Row>

      {/* ── Modal Cadastro / Edição ── */}
      <Modal
        title={editando ? "Editar Produto" : "Novo Produto"}
        open={modalAberto}
        centered
        maskClosable
        onCancel={() => setModalAberto(false)}
        footer={[
          <Button key="cancelar" onClick={() => setModalAberto(false)}>
            Cancelar
          </Button>,
          <Button
            key="salvar"
            type="primary"
            loading={salvando}
            onClick={salvar}
            style={{ background: C.success, borderColor: C.success }}
          >
            {editando ? "Salvar" : "Criar Produto"}
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>

          {/* Nome */}
          <div>
            <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
              Nome *
            </Text>
            <Input
              autoFocus
              size="large"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do produto"
              onKeyDown={e => { if (e.key === "Enter") salvar(); }}
            />
          </div>

          {/* SKU + Barcode */}
          <Row gutter={12}>
            <Col span={12}>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                SKU / Referência
              </Text>
              <Input
                size="large"
                value={form.default_code}
                onChange={e => setForm({ ...form, default_code: e.target.value })}
                placeholder="Ex: PROD-001"
              />
            </Col>
            <Col span={12}>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                Código de Barras
              </Text>
              <Input
                size="large"
                value={form.barcode}
                onChange={e => setForm({ ...form, barcode: e.target.value })}
                placeholder="Ex: 7891234567890"
              />
            </Col>
          </Row>

          {/* Preço + NCM */}
          <Row gutter={12}>
            <Col span={12}>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                Preço de Venda (R$)
              </Text>
              <InputNumber
                size="large"
                style={{ width: "100%" }}
                min={0}
                precision={2}
                decimalSeparator=","
                prefix="R$"
                placeholder="0,00"
                value={form.list_price ? parseFloat(form.list_price) : undefined}
                onChange={v => setForm({ ...form, list_price: v != null ? String(v) : "" })}
              />
            </Col>
            <Col span={12}>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                NCM
                <Text type="secondary" style={{ fontWeight: 400, marginLeft: 6, fontSize: 12 }}>
                  (8 dígitos — necessário para NFC-e)
                </Text>
              </Text>
              <Input
                size="large"
                prefix={<TagOutlined style={{ color: "#94A3B8" }} />}
                value={form.ncm}
                onChange={e => setForm({ ...form, ncm: e.target.value.replace(/\D/g, "").slice(0, 8) })}
                placeholder="00000000"
                maxLength={8}
                style={{ fontFamily: "monospace", letterSpacing: 3 }}
                status={form.ncm.length > 0 && form.ncm.length < 8 ? "error" : undefined}
              />
              {form.ncm.length > 0 && form.ncm.length < 8 && (
                <Text type="danger" style={{ fontSize: 12 }}>
                  {form.ncm.length}/8 dígitos
                </Text>
              )}
            </Col>
          </Row>

        </div>
      </Modal>

      {/* ── Modal Detalhe do Produto ── */}
      <Modal
        title={produtoDetalhe?.name}
        open={!!produtoDetalhe && !modalAjuste && !modalVariantes}
        centered
        maskClosable
        onCancel={() => setProdutoDetalhe(null)}
        footer={null}
        width={520}
      >
        {produtoDetalhe && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="SKU">
                {produtoDetalhe.default_code
                  ? <Text code>{produtoDetalhe.default_code}</Text>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Preço">
                <Text strong style={{ color: C.amber }}>
                  R$ {produtoDetalhe.list_price.toFixed(2)}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="Cód. Barras" span={2}>
                {produtoDetalhe.barcode
                  ? <Text style={{ fontFamily: "monospace" }}>{produtoDetalhe.barcode}</Text>
                  : <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="NCM" span={2}>
                {ncmMap[produtoDetalhe.id]
                  ? <Text code style={{ fontSize: 13, letterSpacing: 2 }}>{ncmMap[produtoDetalhe.id]}</Text>
                  : <Tag color="warning" style={{ fontSize: 11, margin: 0 }}>Sem NCM — clique em Editar para cadastrar</Tag>}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong style={{ display: "block", marginBottom: 10 }}>
                Saldo por Localização
              </Text>
              {saldos.length === 0 ? (
                <Text type="secondary">Sem saldo registrado</Text>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {saldos.map(s => (
                    <Row key={s.location_id[0]} justify="space-between" align="middle"
                      style={{ padding: "8px 12px", background: C.bgRow, borderRadius: 8 }}
                    >
                      <Text>
                        {s.location_id[1]
                          .replace("Physical Locations/", "")
                          .replace("WH/", "")}
                      </Text>
                      <Tag color={s.quantity < 0 ? "error" : "success"}>
                        {s.quantity} un
                      </Tag>
                    </Row>
                  ))}
                </div>
              )}
            </div>

            <Divider style={{ margin: "4px 0" }} />

            <Row gutter={10}>
              <Col span={8}>
                <Button
                  block
                  icon={<SettingOutlined />}
                  onClick={() => {
                    setAjusteLocal(LOCATION_LIST[0].id);
                    setAjusteQtd(null);
                    setAjusteTipo("entrada");
                    setModalAjuste(true);
                  }}
                >
                  Ajustar
                </Button>
              </Col>
              <Col span={8}>
                <Button
                  block
                  icon={<AppstoreOutlined />}
                  onClick={() => setModalVariantes(true)}
                >
                  Variantes
                </Button>
              </Col>
              <Col span={8}>
                <Button
                  block
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => { setProdutoDetalhe(null); abrirEditar(produtoDetalhe); }}
                >
                  Editar
                </Button>
              </Col>
            </Row>
          </div>
        )}
      </Modal>

      {/* ── Modal Ajuste de Estoque ── */}
      <Modal
        title="⚙️ Ajustar Estoque"
        open={modalAjuste && !!produtoDetalhe}
        centered
        maskClosable
        onCancel={() => setModalAjuste(false)}
        footer={[
          <Button key="cancelar" onClick={() => setModalAjuste(false)}>
            Cancelar
          </Button>,
          <Button
            key="confirmar"
            type="primary"
            loading={ajustando}
            onClick={confirmarAjuste}
            style={{ background: C.success, borderColor: C.success }}
          >
            Confirmar Ajuste
          </Button>,
        ]}
      >
        {produtoDetalhe && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>

            <Card size="small" style={{ background: C.bgRow }}>
              <Text strong>{produtoDetalhe.name}</Text>
            </Card>

            <div>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                Localização
              </Text>
              <Select
                size="large"
                style={{ width: "100%" }}
                value={ajusteLocal}
                onChange={v => setAjusteLocal(v)}
                options={LOCATION_LIST.map(l => ({ value: l.id, label: l.name }))}
              />
            </div>

            <div>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                Tipo de Ajuste
              </Text>
              <Radio.Group
                value={ajusteTipo}
                onChange={e => setAjusteTipo(e.target.value)}
                buttonStyle="solid"
                style={{ display: "flex" }}
              >
                <Radio.Button value="entrada" style={{ flex: 1, textAlign: "center" }}>📥 Entrada</Radio.Button>
                <Radio.Button value="saida"   style={{ flex: 1, textAlign: "center" }}>📤 Saída</Radio.Button>
                <Radio.Button value="direto"  style={{ flex: 1, textAlign: "center" }}>🎯 Direto</Radio.Button>
              </Radio.Group>
            </div>

            <div>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>
                {ajusteTipo === "direto"  ? "Quantidade final desejada" :
                 ajusteTipo === "entrada" ? "Quantidade a adicionar"    :
                                            "Quantidade a remover"}
              </Text>
              <InputNumber
                autoFocus
                size="large"
                style={{ width: "100%" }}
                min={0}
                step={1}
                precision={0}
                placeholder="0"
                value={ajusteQtd}
                onChange={v => setAjusteQtd(v)}
              />
              {saldos.find(s => s.location_id[0] === ajusteLocal) && (
                <Text type="secondary" style={{ fontSize: 13, marginTop: 6, display: "block" }}>
                  Saldo atual neste local:{" "}
                  <Text strong>
                    {saldos.find(s => s.location_id[0] === ajusteLocal)?.quantity ?? 0} un
                  </Text>
                </Text>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal Variantes ── */}
      {modalVariantes && produtoDetalhe && (
        <ModalVariantes
          templateId={produtoDetalhe.id}
          templateNome={produtoDetalhe.name}
          precoBase={produtoDetalhe.list_price}
          onFechar={() => {
            setModalVariantes(false);
            carregar(busca, pagina);
          }}
        />
      )}

    </div>
  );
}