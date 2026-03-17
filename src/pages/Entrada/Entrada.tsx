import { useState, useRef, useEffect } from "react";
import {
  App,
  Button,
  Card,
  Col,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Segmented,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  InboxOutlined,
  LoadingOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  buscarPorBarcode,
  entradaManual,
  entradaComNFe,
  entradaApenasNFe,
  criarEBuscarProduto,
} from "../../services/odoo";
import { Produto } from "../../types";

const { Text, Title } = Typography;
const { Dragger } = Upload;

// ─── Tipos (idênticos ao original) ───────────────────────────────────────────

interface ItemEntrada {
  produto:    Produto;
  quantidade: number;
}

interface ProdutoNFe {
  nome:       string;
  barcode:    string;
  quantidade: number;
  produto?:   Produto;
  encontrado: boolean;
}

interface FormCadastro {
  name:         string;
  barcode:      string;
  default_code: string;
  list_price:   string;
}

// ─── Tokens de cor ────────────────────────────────────────────────────────────

const C = {
  amber:   "#F59E0B",
  success: "#22C55E",
  error:   "#EF4444",
  bgRow:   "#F8FAFC",
  border:  "#E2E8F0",
} as const;

// ─── Componente ──────────────────────────────────────────────────────────────

export default function Entrada() {
  const { message } = App.useApp();

  // ── Estados (idênticos ao original) ──────────────────────────────────────
  const [modo,             setModo]             = useState<"manual" | "xml">("manual");
  const [itens,            setItens]            = useState<ItemEntrada[]>([]);
  const [barcodeBuffer,    setBarcodeBuffer]    = useState("");
  const [buscando,         setBuscando]         = useState(false);
  const [processando,      setProcessando]      = useState(false);
  const [xmlItens,         setXmlItens]         = useState<ProdutoNFe[]>([]);
  const [xmlCarregado,     setXmlCarregado]     = useState(false);
  const [fornecedor,       setFornecedor]       = useState("");
  const [entradaFisica,    setEntradaFisica]    = useState(true);
  const [modalCadastro,    setModalCadastro]    = useState(false);
  const [itemCadastrando,  setItemCadastrando]  = useState<number | null>(null);
  const [formCadastro,     setFormCadastro]     = useState<FormCadastro>({
    name: "", barcode: "", default_code: "", list_price: "",
  });
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Refocus no input de barcode (modo manual) ─────────────────────────────
  useEffect(() => {
    if (modo !== "manual") return;
    const refocus = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && target !== inputRef.current) return;
      if (target.tagName === "BUTTON") return;
      inputRef.current?.focus();
    };
    document.addEventListener("click", refocus);
    inputRef.current?.focus();
    return () => document.removeEventListener("click", refocus);
  }, [modo]);

  // ── Lógica de negócio (100% preservada) ──────────────────────────────────

  async function processarBarcode(barcode: string) {
    if (!barcode || buscando) return;
    setBuscando(true);
    try {
      const produto = await buscarPorBarcode(barcode);
      if (!produto) {
        message.error(`Produto não encontrado: ${barcode}`);
        return;
      }
      setItens(prev => {
        const existente = prev.find(i => i.produto.id === produto.id);
        if (existente) {
          return prev.map(i =>
            i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
          );
        }
        return [...prev, { produto, quantidade: 1 }];
      });
      message.success(`${produto.name} adicionado`);
    } catch {
      message.error("Erro ao buscar produto.");
    } finally {
      setBuscando(false);
      setBarcodeBuffer("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") processarBarcode(barcodeBuffer.trim());
  }

  function alterarQuantidade(produtoId: number, delta: number) {
    setItens(prev =>
      prev
        .map(i => i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i)
        .filter(i => i.quantidade > 0)
    );
  }

  function setQuantidadeDigitada(produtoId: number, valor: number | null) {
    if (!valor || valor < 1) return;
    setItens(prev =>
      prev.map(i => i.produto.id === produtoId ? { ...i, quantidade: valor } : i)
    );
  }

  async function confirmarEntradaManual() {
    if (itens.length === 0) { message.error("Nenhum item adicionado."); return; }
    setProcessando(true);
    try {
      for (const item of itens) {
        const resultado = await entradaManual(item.produto.id, item.quantidade);
        if (!resultado.sucesso) {
          message.error(`Erro em ${item.produto.name}: ${resultado.erro}`);
          return;
        }
      }
      message.success("Entrada registrada com sucesso!");
      setItens([]);
    } catch {
      message.error("Erro ao registrar entrada.");
    } finally {
      setProcessando(false);
    }
  }

  async function processarXML(file: File) {
    try {
      const texto  = await file.text();
      const parser = new DOMParser();
      const doc    = parser.parseFromString(texto, "text/xml");

      const emitNome = doc.querySelector("emit > xNome")?.textContent ?? "Fornecedor desconhecido";
      setFornecedor(emitNome);

      const detNodes    = doc.querySelectorAll("det");
      const itensParsed: ProdutoNFe[] = [];

      for (const det of detNodes) {
        const nome       = det.querySelector("xProd")?.textContent ?? "";
        const barcode    = det.querySelector("cEAN")?.textContent ?? "";
        const quantidade = parseFloat(det.querySelector("qCom")?.textContent ?? "0");
        itensParsed.push({ nome, barcode, quantidade, encontrado: false });
      }

      const itensComProduto = await Promise.all(
        itensParsed.map(async item => {
          if (!item.barcode || item.barcode === "SEM GTIN") return item;
          try {
            const produto = await buscarPorBarcode(item.barcode);
            if (produto) return { ...item, produto, encontrado: true };
          } catch {}
          return item;
        })
      );

      setXmlItens(itensComProduto);
      setXmlCarregado(true);
    } catch {
      message.error("Erro ao processar XML. Verifique se é uma NF-e válida.");
    }
  }

  async function confirmarEntradaXML() {
    const encontrados = xmlItens.filter(i => i.encontrado && i.produto);
    if (encontrados.length === 0) {
      message.error("Nenhum produto foi encontrado no sistema.");
      return;
    }
    setProcessando(true);
    try {
      for (const item of encontrados) {
        const resultado = entradaFisica
          ? await entradaComNFe(item.produto!.id, item.quantidade)
          : await entradaApenasNFe(item.produto!.id, item.quantidade);
        if (!resultado.sucesso) {
          message.error(`Erro em ${item.nome}: ${resultado.erro}`);
          return;
        }
      }
      message.success(`${encontrados.length} produto(s) registrados!`);
      setXmlItens([]);
      setXmlCarregado(false);
      setFornecedor("");
      setEntradaFisica(true);
    } catch {
      message.error("Erro ao registrar entrada.");
    } finally {
      setProcessando(false);
    }
  }

  async function salvarCadastroRapido() {
    if (!formCadastro.name.trim()) { message.error("Nome é obrigatório."); return; }
    if (itemCadastrando === null) return;
    setSalvandoCadastro(true);
    try {
      const produto = await criarEBuscarProduto({
        name:         formCadastro.name.trim(),
        barcode:      formCadastro.barcode.trim() || undefined,
        default_code: formCadastro.default_code.trim() || undefined,
        list_price:   parseFloat(formCadastro.list_price) || 0,
      });
      if (produto) {
        setXmlItens(prev => prev.map((item, i) =>
          i === itemCadastrando ? { ...item, produto, encontrado: true } : item
        ));
        message.success(`${produto.name} cadastrado e vinculado!`);
      } else {
        message.error("Produto criado mas não encontrado. Verifique o barcode.");
      }
      setModalCadastro(false);
      setItemCadastrando(null);
    } catch {
      message.error("Erro ao cadastrar produto.");
    } finally {
      setSalvandoCadastro(false);
    }
  }

  // ── Dados derivados ───────────────────────────────────────────────────────
  const naoEncontrados  = xmlItens.filter(i => !i.encontrado).length;
  const encontrados     = xmlItens.filter(i => i.encontrado).length;

  // ── Colunas da tabela XML ─────────────────────────────────────────────────
  const colunasXml: TableColumnsType<ProdutoNFe> = [
    {
      title:  "Produto na Nota",
      key:    "nome",
      render: (_, r) => <Text>{r.encontrado ? r.produto!.name : r.nome}</Text>,
    },
    {
      title:     "Barcode",
      dataIndex: "barcode",
      width:     160,
      render:    (v: string) => v
        ? <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title:     "Qtd",
      dataIndex: "quantidade",
      width:     70,
      align:     "center",
      render:    (v: number) => <Text strong>{v}</Text>,
    },
    {
      title:  "Status",
      key:    "status",
      width:  180,
      render: (_, record, index) =>
        record.encontrado ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>Encontrado</Tag>
        ) : (
          <Space size={8}>
            <Tag color="warning">Não encontrado</Tag>
            <Button
              size="small"
              type="dashed"
              icon={<PlusOutlined />}
              onClick={() => {
                setItemCadastrando(index);
                setFormCadastro({
                  name:         record.nome,
                  barcode:      record.barcode !== "SEM GTIN" ? record.barcode : "",
                  default_code: "",
                  list_price:   "",
                });
                setModalCadastro(true);
              }}
            >
              Cadastrar
            </Button>
          </Space>
        ),
    },
  ];

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%" }}>

      {/* Input invisível — captura barcode do leitor USB HID */}
      <input
        ref={inputRef}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
        value={barcodeBuffer}
        onChange={e => setBarcodeBuffer(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={buscando || modo === "xml"}
      />

      {/* Header */}
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={3} style={{ margin: 0 }}>Entrada de Mercadoria</Title>
        </Col>
        <Col>
          <Segmented
            size="large"
            value={modo}
            onChange={v => {
              setModo(v as "manual" | "xml");
              if (v === "manual") { setXmlCarregado(false); setXmlItens([]); }
            }}
            options={[
              { label: "⌨️ Manual",   value: "manual" },
              { label: "📄 XML NF-e", value: "xml"    },
            ]}
          />
        </Col>
      </Row>

      {/* ── MODO MANUAL ── */}
      {modo === "manual" && (
        <Row gutter={20} style={{ flex: 1, minHeight: 0 }}>

          {/* Scanner */}
          <Col span={10} style={{ display: "flex" }}>
            <Card
              style={{ width: "100%" }}
              styles={{ body: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center" } }}
            >
              {buscando ? (
                <Spin
                  indicator={<LoadingOutlined style={{ fontSize: 40 }} spin />}
                  tip="Buscando produto..."
                />
              ) : (
                <div style={{ textAlign: "center" }}>
                  <BarcodeOutlined style={{ fontSize: 64, color: C.amber, display: "block", marginBottom: 16 }} />
                  <Text style={{ display: "block", fontSize: 16 }}>Bipe o produto ou</Text>
                  <Text style={{ display: "block", fontSize: 16 }}>digite o código de barras</Text>
                  <Text type="secondary" style={{ display: "block", fontSize: 13, marginTop: 8 }}>
                    e pressione Enter
                  </Text>
                  <div style={{
                    marginTop: 20, background: C.bgRow,
                    border: `2px dashed ${C.border}`, borderRadius: 10,
                    padding: "12px 24px", fontFamily: "monospace",
                    fontSize: 18, minWidth: 200,
                    color: barcodeBuffer ? "#1A1A1A" : C.border,
                  }}>
                    {barcodeBuffer || "aguardando..."}
                  </div>
                </div>
              )}
            </Card>
          </Col>

          {/* Lista de itens */}
          <Col span={14} style={{ display: "flex" }}>
            <Card
              title={<Text strong style={{ fontSize: 18 }}>Itens para dar entrada</Text>}
              style={{ width: "100%", display: "flex", flexDirection: "column" }}
              styles={{ body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 24px" } }}
            >
              {itens.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Text type="secondary" style={{ fontSize: 15 }}>Nenhum item adicionado</Text>
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                  {itens.map(item => (
                    <div
                      key={item.produto.id}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: 12, background: C.bgRow, borderRadius: 10,
                      }}
                    >
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                        {item.produto.name}
                      </Text>
                      <Space size={8}>
                        <Button size="small" onClick={() => alterarQuantidade(item.produto.id, -1)}>−</Button>
                        <InputNumber
                          size="small"
                          min={1}
                          value={item.quantidade}
                          onChange={v => setQuantidadeDigitada(item.produto.id, v)}
                          style={{ width: 64 }}
                          controls={false}
                        />
                        <Button size="small" onClick={() => alterarQuantidade(item.produto.id, +1)}>+</Button>
                      </Space>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => setItens(prev => prev.filter(i => i.produto.id !== item.produto.id))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 16, marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<CheckCircleOutlined />}
                  loading={processando}
                  disabled={itens.length === 0}
                  style={itens.length > 0 ? { background: C.success, borderColor: C.success } : {}}
                  onClick={confirmarEntradaManual}
                >
                  {processando ? "Processando..." : "Confirmar Entrada"}
                </Button>
                {itens.length > 0 && (
                  <Button block danger icon={<DeleteOutlined />} onClick={() => setItens([])}>
                    Cancelar
                  </Button>
                )}
              </div>
            </Card>
          </Col>
        </Row>
      )}

      {/* ── MODO XML ── */}
      {modo === "xml" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
          {!xmlCarregado ? (

            /* Upload */
            <Dragger
              accept=".xml"
              showUploadList={false}
              beforeUpload={file => { processarXML(file); return false; }}
              style={{ padding: "40px 0" }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: C.amber }} />
              </p>
              <p className="ant-upload-text">Clique ou arraste o XML da NF-e aqui</p>
              <p className="ant-upload-hint">Arquivos .xml</p>
            </Dragger>

          ) : (

            /* Resultado do XML */
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Info do fornecedor */}
              <Card size="small" style={{ background: C.bgRow }}>
                <Row justify="space-between" align="middle">
                  <Space direction="vertical" size={2}>
                    <Text type="secondary" style={{ fontSize: 13 }}>Fornecedor</Text>
                    <Text strong>{fornecedor}</Text>
                  </Space>
                  <Space size={8}>
                    <Tag color="success">{encontrados} encontrado(s)</Tag>
                    {naoEncontrados > 0 && (
                      <Tag color="warning">{naoEncontrados} não encontrado(s)</Tag>
                    )}
                  </Space>
                </Row>
              </Card>

              {/* Opção física / fiscal */}
              <Card size="small" title={<Text style={{ fontSize: 14 }}>Dar entrada no estoque físico?</Text>}>
                <Radio.Group
                  value={entradaFisica}
                  onChange={e => setEntradaFisica(e.target.value)}
                  buttonStyle="solid"
                >
                  <Radio.Button value={false}>Não — apenas Fiscal</Radio.Button>
                  <Radio.Button value={true}>Sim — WH/Estoque + Fiscal</Radio.Button>
                </Radio.Group>
              </Card>

              {/* Tabela de itens */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                <Table<ProdutoNFe>
                  rowKey={(_, i) => String(i)}
                  size="small"
                  columns={colunasXml}
                  dataSource={xmlItens}
                  pagination={false}
                  scroll={{ y: "calc(100vh - 480px)" }}
                  rowClassName={r => r.encontrado ? "" : "ant-table-row-warning"}
                />
              </div>

              {/* Footer */}
              <Row gutter={12} justify="end">
                <Col>
                  <Button
                    danger
                    size="large"
                    icon={<DeleteOutlined />}
                    onClick={() => { setXmlCarregado(false); setXmlItens([]); setFornecedor(""); setEntradaFisica(true); }}
                  >
                    Cancelar
                  </Button>
                </Col>
                <Col>
                  <Button
                    type="primary"
                    size="large"
                    icon={<CheckCircleOutlined />}
                    loading={processando}
                    disabled={encontrados === 0}
                    style={encontrados > 0 ? { background: C.success, borderColor: C.success } : {}}
                    onClick={confirmarEntradaXML}
                  >
                    {processando ? "Processando..." : `Confirmar ${encontrados} produto(s)`}
                  </Button>
                </Col>
              </Row>
            </div>
          )}
        </div>
      )}

      {/* ── Modal Cadastro Rápido ── */}
      <Modal
        title="Cadastrar Produto"
        open={modalCadastro}
        centered
        maskClosable
        onCancel={() => setModalCadastro(false)}
        footer={[
          <Button key="cancelar" onClick={() => setModalCadastro(false)}>
            Cancelar
          </Button>,
          <Button
            key="salvar"
            type="primary"
            loading={salvandoCadastro}
            onClick={salvarCadastroRapido}
            style={{ background: C.success, borderColor: C.success }}
          >
            Cadastrar e Incluir
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
          <div>
            <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>Nome *</Text>
            <Input
              autoFocus
              size="large"
              value={formCadastro.name}
              onChange={e => setFormCadastro({ ...formCadastro, name: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") salvarCadastroRapido(); }}
            />
          </div>
          <Row gutter={12}>
            <Col span={12}>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>SKU</Text>
              <Input
                size="large"
                value={formCadastro.default_code}
                onChange={e => setFormCadastro({ ...formCadastro, default_code: e.target.value })}
                placeholder="Ex: PROD-001"
              />
            </Col>
            <Col span={12}>
              <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>Código de Barras</Text>
              <Input
                size="large"
                value={formCadastro.barcode}
                onChange={e => setFormCadastro({ ...formCadastro, barcode: e.target.value })}
              />
            </Col>
          </Row>
          <div>
            <Text type="secondary" style={{ fontWeight: 600, display: "block", marginBottom: 6 }}>Preço de Venda (R$)</Text>
            <InputNumber
              size="large"
              style={{ width: "100%" }}
              min={0}
              precision={2}
              decimalSeparator=","
              prefix="R$"
              placeholder="0,00"
              value={formCadastro.list_price ? parseFloat(formCadastro.list_price) : undefined}
              onChange={v => setFormCadastro({ ...formCadastro, list_price: v != null ? String(v) : "" })}
            />
          </div>
        </div>
      </Modal>

    </div>
  );
}