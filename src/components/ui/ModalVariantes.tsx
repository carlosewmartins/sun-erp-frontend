import { useState, useEffect } from "react";
import {
  App,
  Button,
  Checkbox,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tabs,
  Typography,
} from "antd";
import type { TableColumnsType } from "antd";
import {
  DeleteOutlined,
  PlusOutlined,
  SaveOutlined,
  TagOutlined,
  TagsOutlined,
  AppstoreOutlined,
} from "@ant-design/icons";
import {
  buscarAtributos,
  buscarAtributosProduto,
  buscarVariantesProduto,
  buscarTemplateAttrValues,
  adicionarAtributoProduto,
  removerAtributoProduto,
  criarAtributo,
  criarValorAtributo,
  atualizarVariante,
  execute,
} from "../../services/odoo";

const { Text, Title } = Typography;

// ─── Campo NCM ───────────────────────────────────────────────────────────────
// Trocar para 'l10n_br_ncm_code' após instalar l10n_br_fiscal no Proxmox
const NCM_FIELD = "x_ncm" as const;

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Props {
  templateId:   number;
  templateNome: string;
  precoBase:    number;
  onFechar:     () => void;
}

interface AtributoGlobal {
  id:     number;
  name:   string;
  values: { id: number; name: string }[];
}

interface LinhaAtributo {
  id:                         number;
  attribute_id:               [number, string];
  value_ids:                  number[];
  product_template_value_ids: number[];
}

interface TemplateAttrValue {
  id:                         number;
  name:                       string;
  attribute_id:               [number, string];
  product_attribute_value_id: [number, string];
  ptav_active:                boolean;
}

interface Variante {
  id:                                   number;
  name:                                 string;
  default_code:                         string | false;
  barcode:                              string | false;
  list_price:                           number;
  qty_available:                        number;
  product_template_attribute_value_ids: number[];
}

interface FormVariante {
  default_code: string;
  barcode:      string;
  list_price:   string;
}

const C = {
  amber:   "#F59E0B",
  amberBg: "#FFF8E7",
  success: "#22C55E",
  border:  "#E2E8F0",
  bgRow:   "#F8FAFC",
} as const;

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ModalVariantes({
  templateId,
  templateNome,
  precoBase,
  onFechar,
}: Props) {
  const { message, modal } = App.useApp();

  // ── Estados (idênticos ao original) ──────────────────────────────────────
  const [aba,              setAba]              = useState("atributos");
  const [atributosGlobais, setAtributosGlobais] = useState<AtributoGlobal[]>([]);
  const [linhasAtributo,   setLinhasAtributo]   = useState<LinhaAtributo[]>([]);
  const [tavs,             setTavs]             = useState<TemplateAttrValue[]>([]);
  const [variantes,        setVariantes]        = useState<Variante[]>([]);
  const [formsVariante,    setFormsVariante]    = useState<Record<number, FormVariante>>({});
  const [carregando,       setCarregando]       = useState(true);
  const [salvando,         setSalvando]         = useState<number | null>(null);

  // ── Estados NCM do template ───────────────────────────────────────────────
  const [ncmTemplate,    setNcmTemplate]    = useState("");
  const [ncmEditando,    setNcmEditando]    = useState(false);
  const [ncmInput,       setNcmInput]       = useState("");
  const [salvandoNcm,    setSalvandoNcm]    = useState(false);

  // Modal adicionar atributo
  const [modalAttr,           setModalAttr]           = useState(false);
  const [attrSelecionado,     setAttrSelecionado]     = useState<number | "novo">(0);
  const [novoAttrNome,        setNovoAttrNome]        = useState("");
  const [valoresSelecionados, setValoresSelecionados] = useState<number[]>([]);
  const [novosValores,        setNovosValores]        = useState<string[]>([""]);
  const [adicionandoAttr,     setAdicionandoAttr]     = useState(false);

  // Modal configurar variante
  const [modalVariante,       setModalVariante]       = useState(false);
  const [tavsSelecionados,    setTavsSelecionados]    = useState<Record<number, number>>({});
  const [formNovaVariante,    setFormNovaVariante]    = useState<FormVariante>({ default_code: "", barcode: "", list_price: "" });
  const [adicionandoVariante, setAdicionandoVariante] = useState(false);

  useEffect(() => { carregar(); }, []);

  // ── Lógica de negócio (100% preservada) ──────────────────────────────────

  async function carregar() {
    setCarregando(true);
    try {
      const [globais, linhas, tavsData, vars] = await Promise.all([
        buscarAtributos(),
        buscarAtributosProduto(templateId),
        buscarTemplateAttrValues(templateId),
        buscarVariantesProduto(templateId),
      ]);

      setAtributosGlobais(globais as AtributoGlobal[]);
      setLinhasAtributo(linhas as LinhaAtributo[]);
      setTavs(tavsData as TemplateAttrValue[]);

      const varsData = vars as Variante[];
      setVariantes(varsData);

      const forms: Record<number, FormVariante> = {};
      for (const v of varsData) {
        forms[v.id] = {
          default_code: v.default_code || "",
          barcode:      v.barcode || "",
          list_price:   v.list_price !== precoBase ? String(v.list_price) : "",
        };
      }
      setFormsVariante(forms);

      // Busca NCM do template
      await carregarNcmTemplate();
    } catch {
      message.error("Erro ao carregar dados do produto.");
    } finally {
      setCarregando(false);
    }
  }

  async function carregarNcmTemplate() {
    try {
      const res = await execute(
        "product.template", "read",
        [[templateId], ["id", NCM_FIELD]],
      ) as Array<{ id: number; [key: string]: unknown }>;
      const v = res[0]?.[NCM_FIELD];
      const ncm = typeof v === "string" ? v.trim() : "";
      setNcmTemplate(ncm);
      setNcmInput(ncm);
    } catch {
      // falha silenciosa
    }
  }

  async function salvarNcm() {
    const ncmLimpo = ncmInput.replace(/\D/g, "");
    if (ncmLimpo && ncmLimpo.length !== 8) {
      message.error("NCM deve ter exatamente 8 dígitos");
      return;
    }
    setSalvandoNcm(true);
    try {
      await execute("product.template", "write", [
        [templateId],
        { [NCM_FIELD]: ncmLimpo || false },
      ]);
      setNcmTemplate(ncmLimpo);
      setNcmEditando(false);
      message.success("NCM salvo com sucesso!");
    } catch {
      message.error("Erro ao salvar NCM.");
    } finally {
      setSalvandoNcm(false);
    }
  }

  async function confirmarAdicionarAtributo() {
    if (adicionandoAttr) return;
    setAdicionandoAttr(true);
    try {
      let attributeId: number;
      let valueIds: number[] = [...valoresSelecionados];

      if (attrSelecionado === "novo") {
        if (!novoAttrNome.trim()) {
          message.error("Nome do atributo é obrigatório.");
          return;
        }
        attributeId = await criarAtributo(novoAttrNome.trim());
      } else {
        attributeId = attrSelecionado as number;
      }

      for (const nv of novosValores.filter(v => v.trim())) {
        const novoId = await criarValorAtributo(attributeId, nv.trim());
        valueIds.push(novoId);
      }

      if (valueIds.length === 0) {
        message.error("Selecione ou adicione pelo menos um valor.");
        return;
      }

      await adicionarAtributoProduto(templateId, attributeId, valueIds);
      message.success("Atributo adicionado!");
      setModalAttr(false);
      resetModalAttr();
      await carregar();
    } catch {
      message.error("Erro ao adicionar atributo.");
    } finally {
      setAdicionandoAttr(false);
    }
  }

  async function handleRemoverAtributo(lineId: number, nomeAttr: string) {
    modal.confirm({
      title:          `Remover "${nomeAttr}"?`,
      content:        "Esta ação não pode ser desfeita. Variantes associadas podem ser afetadas.",
      okText:         "Remover",
      okButtonProps:  { danger: true },
      cancelText:     "Cancelar",
      centered:       true,
      onOk: async () => {
        try {
          await removerAtributoProduto(lineId);
          message.success("Atributo removido.");
          await carregar();
        } catch {
          message.error("Não é possível remover — existem variantes com este atributo.");
        }
      },
    });
  }

  function resetModalAttr() {
    setAttrSelecionado(0);
    setNovoAttrNome("");
    setValoresSelecionados([]);
    setNovosValores([""]);
  }

  async function confirmarAdicionarVariante() {
    if (adicionandoVariante) return;

    const attrIds = linhasAtributo.map(l => l.attribute_id[0]);
    for (const attrId of attrIds) {
      if (!tavsSelecionados[attrId]) {
        message.error("Selecione um valor para cada atributo.");
        return;
      }
    }

    setAdicionandoVariante(true);
    try {
      const tavIds = Object.values(tavsSelecionados);
      const variante: Variante = {
        id: 0,
        name: templateNome,
        default_code: formNovaVariante.default_code || false,
        barcode:      formNovaVariante.barcode      || false,
        list_price:   parseFloat(formNovaVariante.list_price) || precoBase,
        qty_available: 0,
        product_template_attribute_value_ids: tavIds,
      };

      // Busca variante existente com essa combinação
      const vars = await buscarVariantesProduto(templateId) as Variante[];
      const existente = vars.find(v =>
        tavIds.every(tid => v.product_template_attribute_value_ids.includes(tid)) &&
        v.product_template_attribute_value_ids.length === tavIds.length
      );

      if (existente) {
        await atualizarVariante(existente.id, {
          default_code: variante.default_code || undefined,
          barcode:      variante.barcode      || undefined,
          list_price:   variante.list_price,
        });
        message.success("Variante atualizada!");
      } else {
        message.error("Combinação de variante não existe. Ajuste os atributos primeiro.");
        return;
      }

      setModalVariante(false);
      setTavsSelecionados({});
      setFormNovaVariante({ default_code: "", barcode: "", list_price: "" });
      await carregar();
    } catch {
      message.error("Erro ao configurar variante.");
    } finally {
      setAdicionandoVariante(false);
    }
  }

  async function salvarVariante(varianteId: number) {
    setSalvando(varianteId);
    try {
      const f = formsVariante[varianteId];
      await atualizarVariante(varianteId, {
        default_code: f.default_code || undefined,
        barcode:      f.barcode      || undefined,
        list_price:   parseFloat(f.list_price) || precoBase,
      });
      message.success("Variante salva!");
      await carregar();
    } catch {
      message.error("Erro ao salvar variante.");
    } finally {
      setSalvando(null);
    }
  }

  // ── Derivados ─────────────────────────────────────────────────────────────

  const atributosJaCadastrados = new Set(linhasAtributo.map(l => l.attribute_id[0]));
  const atributosDisponiveis   = atributosGlobais.filter(a => !atributosJaCadastrados.has(a.id));
  const tavsPorAtributo        = tavs.reduce<Record<number, TemplateAttrValue[]>>((acc, tav) => {
    const attrId = tav.attribute_id[0];
    if (!acc[attrId]) acc[attrId] = [];
    acc[attrId].push(tav);
    return acc;
  }, {});

  // ── Colunas de variantes ──────────────────────────────────────────────────

  const colunasVariantes: TableColumnsType<Variante> = [
    {
      title:     "Variante",
      dataIndex: "name",
      ellipsis:  true,
      render:    (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title:  "SKU",
      key:    "sku",
      width:  140,
      render: (_: unknown, record: Variante) => (
        <Input
          size="small"
          value={formsVariante[record.id]?.default_code ?? ""}
          onChange={e => setFormsVariante(prev => ({
            ...prev,
            [record.id]: { ...prev[record.id], default_code: e.target.value },
          }))}
          placeholder="SKU"
        />
      ),
    },
    {
      title:  "Barcode",
      key:    "barcode",
      width:  160,
      render: (_: unknown, record: Variante) => (
        <Input
          size="small"
          value={formsVariante[record.id]?.barcode ?? ""}
          onChange={e => setFormsVariante(prev => ({
            ...prev,
            [record.id]: { ...prev[record.id], barcode: e.target.value },
          }))}
          placeholder="Código de barras"
        />
      ),
    },
    {
      title:  "Preço",
      key:    "preco",
      width:  120,
      render: (_: unknown, record: Variante) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={2}
          decimalSeparator=","
          prefix="R$"
          placeholder={precoBase.toFixed(2)}
          value={formsVariante[record.id]?.list_price ? parseFloat(formsVariante[record.id].list_price) : undefined}
          onChange={v => setFormsVariante(prev => ({
            ...prev,
            [record.id]: { ...prev[record.id], list_price: v != null ? String(v) : "" },
          }))}
        />
      ),
    },
    {
      title:  "Estoque",
      dataIndex: "qty_available",
      width:  80,
      align:  "center",
      render: (v: number) => (
        <Tag color={v > 0 ? "success" : "error"}>{v} un</Tag>
      ),
    },
    {
      title:  "",
      key:    "salvar",
      width:  80,
      render: (_: unknown, record: Variante) => (
        <Button
          size="small"
          type="primary"
          icon={<SaveOutlined />}
          loading={salvando === record.id}
          onClick={() => salvarVariante(record.id)}
        >
          Salvar
        </Button>
      ),
    },
  ];

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <Modal
      title={
        <Space>
          <AppstoreOutlined />
          <span>Variantes — {templateNome}</span>
        </Space>
      }
      open
      centered
      maskClosable={false}
      onCancel={onFechar}
      footer={null}
      width="min(95vw, 860px)"
    >
      {carregando ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Spin size="large" tip="Carregando..." />
        </div>
      ) : (
        <>
          {/* ── NCM do Template (campo compartilhado por todas as variantes) ── */}
          <div style={{
            padding:      "12px 16px",
            background:   ncmTemplate ? "#F0FDF4" : "#FFF8E7",
            borderRadius: 8,
            border:       `1px solid ${ncmTemplate ? "#86EFAC" : C.amber}`,
            marginBottom: 16,
          }}>
            <Row align="middle" gutter={12}>
              <Col flex="auto">
                <Space>
                  <TagOutlined style={{ color: ncmTemplate ? C.success : C.amber }} />
                  <Text style={{ fontWeight: 600, fontSize: 13 }}>NCM do produto</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    (compartilhado por todas as variantes)
                  </Text>
                </Space>
                {ncmEditando ? (
                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                    <Input
                      autoFocus
                      size="small"
                      value={ncmInput}
                      onChange={e => setNcmInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
                      placeholder="00000000"
                      maxLength={8}
                      style={{ fontFamily: "monospace", width: 120, letterSpacing: 3 }}
                      status={ncmInput.length > 0 && ncmInput.length < 8 ? "error" : undefined}
                      onKeyDown={e => { if (e.key === "Enter") salvarNcm(); if (e.key === "Escape") { setNcmEditando(false); setNcmInput(ncmTemplate); } }}
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>{ncmInput.length}/8</Text>
                    <Button
                      size="small"
                      type="primary"
                      loading={salvandoNcm}
                      disabled={ncmInput.length > 0 && ncmInput.length !== 8}
                      onClick={salvarNcm}
                      style={{ background: C.success, borderColor: C.success }}
                    >
                      Salvar
                    </Button>
                    <Button
                      size="small"
                      onClick={() => { setNcmEditando(false); setNcmInput(ncmTemplate); }}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    {ncmTemplate
                      ? <Text code style={{ fontSize: 13 }}>{ncmTemplate}</Text>
                      : <Text type="secondary" style={{ fontSize: 12 }}>Sem NCM cadastrado</Text>}
                  </div>
                )}
              </Col>
              {!ncmEditando && (
                <Col>
                  <Button
                    size="small"
                    icon={<TagOutlined />}
                    onClick={() => { setNcmEditando(true); setNcmInput(ncmTemplate); }}
                  >
                    {ncmTemplate ? "Editar NCM" : "Cadastrar NCM"}
                  </Button>
                </Col>
              )}
            </Row>
          </div>

          <Tabs
            activeKey={aba}
            onChange={setAba}
            items={[
              {
                key:   "atributos",
                label: (
                  <Space>
                    <TagsOutlined />
                    Atributos
                    {linhasAtributo.length > 0 && (
                      <Tag style={{ marginLeft: 2 }}>{linhasAtributo.length}</Tag>
                    )}
                  </Space>
                ),
                children: (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Row justify="end">
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setModalAttr(true)}
                        disabled={atributosDisponiveis.length === 0}
                      >
                        Adicionar Atributo
                      </Button>
                    </Row>

                    {linhasAtributo.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "32px 0" }}>
                        <TagsOutlined style={{ fontSize: 32, marginBottom: 8, display: "block", color: "#94A3B8" }} />
                        <Text type="secondary">Nenhum atributo cadastrado.</Text>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {linhasAtributo.map(linha => {
                          const tavsDoAttr = tavsPorAtributo[linha.attribute_id[0]] ?? [];
                          return (
                            <div key={linha.id} style={{
                              padding: "12px 16px", background: C.bgRow,
                              borderRadius: 8, border: `1px solid ${C.border}`,
                            }}>
                              <Row justify="space-between" align="middle">
                                <Text strong>{linha.attribute_id[1]}</Text>
                                <Button
                                  size="small"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleRemoverAtributo(linha.id, linha.attribute_id[1])}
                                >
                                  Remover
                                </Button>
                              </Row>
                              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {tavsDoAttr.map(tav => (
                                  <Tag key={tav.id} color={tav.ptav_active ? "blue" : "default"}>
                                    {tav.product_attribute_value_id[1]}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key:   "variantes",
                label: (
                  <Space>
                    <AppstoreOutlined />
                    Variantes
                    {variantes.length > 0 && (
                      <Tag style={{ marginLeft: 2 }}>{variantes.length}</Tag>
                    )}
                  </Space>
                ),
                children: (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <Row justify="end">
                      {linhasAtributo.length > 0 && (
                        <Col>
                          <Button
                            icon={<PlusOutlined />}
                            onClick={() => {
                              setTavsSelecionados({});
                              setFormNovaVariante({ default_code: "", barcode: "", list_price: "" });
                              setModalVariante(true);
                            }}
                          >
                            Configurar Variante
                          </Button>
                        </Col>
                      )}
                    </Row>

                    {variantes.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "32px 0" }}>
                        <AppstoreOutlined style={{ fontSize: 32, marginBottom: 8, display: "block", color: "#94A3B8" }} />
                        <Text type="secondary">
                          {linhasAtributo.length === 0
                            ? "Adicione atributos primeiro na aba Atributos."
                            : 'Clique em "Configurar Variante" para definir SKU e barcode.'}
                        </Text>
                      </div>
                    ) : (
                      <Table<Variante>
                        rowKey="id"
                        size="small"
                        columns={colunasVariantes}
                        dataSource={variantes}
                        pagination={false}
                        scroll={{ y: 340 }}
                      />
                    )}
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {/* ── Modal Adicionar Atributo ── */}
      <Modal
        title="Adicionar Atributo"
        open={modalAttr}
        centered
        maskClosable
        onCancel={() => { setModalAttr(false); resetModalAttr(); }}
        footer={[
          <Button key="cancelar" onClick={() => { setModalAttr(false); resetModalAttr(); }}>
            Cancelar
          </Button>,
          <Button
            key="confirmar"
            type="primary"
            loading={adicionandoAttr}
            disabled={attrSelecionado === 0}
            onClick={confirmarAdicionarAtributo}
          >
            Adicionar
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>

          <Form.Item label="Atributo" style={{ marginBottom: 0 }}>
            <Select
              value={attrSelecionado === 0 ? undefined : attrSelecionado}
              placeholder="— Selecione —"
              onChange={val => { setAttrSelecionado(val); setValoresSelecionados([]); }}
              options={[
                ...atributosDisponiveis.map(a => ({ value: a.id, label: a.name })),
                { value: "novo", label: "+ Criar novo atributo" },
              ]}
            />
          </Form.Item>

          {attrSelecionado === "novo" && (
            <Form.Item label="Nome do novo atributo" style={{ marginBottom: 0 }}>
              <Input
                autoFocus
                value={novoAttrNome}
                onChange={e => setNovoAttrNome(e.target.value)}
                placeholder="Ex: Voltagem, Material, Tamanho..."
              />
            </Form.Item>
          )}

          {attrSelecionado !== 0 && attrSelecionado !== "novo" && (
            <Form.Item label="Valores existentes" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {atributosGlobais
                  .find(a => a.id === attrSelecionado)
                  ?.values.map(v => (
                    <Checkbox
                      key={v.id}
                      checked={valoresSelecionados.includes(v.id)}
                      onChange={e => {
                        if (e.target.checked) setValoresSelecionados(prev => [...prev, v.id]);
                        else setValoresSelecionados(prev => prev.filter(id => id !== v.id));
                      }}
                    >
                      {v.name}
                    </Checkbox>
                  ))}
              </div>
            </Form.Item>
          )}

          <Divider style={{ margin: "4px 0" }} />

          <Form.Item label="Novos valores" style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {novosValores.map((nv, i) => (
                <Space key={i}>
                  <Input
                    value={nv}
                    onChange={e => {
                      const arr = [...novosValores];
                      arr[i] = e.target.value;
                      setNovosValores(arr);
                    }}
                    placeholder={`Valor ${i + 1} (ex: P, M, G...)`}
                  />
                  {novosValores.length > 1 && (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => setNovosValores(prev => prev.filter((_, idx) => idx !== i))}
                    />
                  )}
                </Space>
              ))}
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                onClick={() => setNovosValores(prev => [...prev, ""])}
              >
                Adicionar valor
              </Button>
            </div>
          </Form.Item>
        </div>
      </Modal>

      {/* ── Modal Configurar Variante ── */}
      <Modal
        title="Configurar Variante"
        open={modalVariante}
        centered
        maskClosable
        onCancel={() => setModalVariante(false)}
        footer={[
          <Button key="cancelar" onClick={() => setModalVariante(false)}>Cancelar</Button>,
          <Button key="salvar" type="primary" loading={adicionandoVariante} onClick={confirmarAdicionarVariante}>
            Salvar Variante
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>

          {linhasAtributo.map(linha => {
            const tavsDoAttr = tavsPorAtributo[linha.attribute_id[0]] ?? [];
            return (
              <Form.Item key={linha.id} label={linha.attribute_id[1]} style={{ marginBottom: 0 }}>
                <Radio.Group
                  value={tavsSelecionados[linha.attribute_id[0]]}
                  onChange={e => setTavsSelecionados(prev => ({ ...prev, [linha.attribute_id[0]]: e.target.value }))}
                >
                  <Space wrap>
                    {tavsDoAttr.map(tav => (
                      <Radio.Button key={tav.id} value={tav.id}>
                        {tav.product_attribute_value_id[1]}
                      </Radio.Button>
                    ))}
                  </Space>
                </Radio.Group>
              </Form.Item>
            );
          })}

          <Divider style={{ margin: "4px 0" }} />

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item label="SKU" style={{ marginBottom: 0 }}>
                <Input
                  value={formNovaVariante.default_code}
                  onChange={e => setFormNovaVariante(prev => ({ ...prev, default_code: e.target.value }))}
                  placeholder="Ex: CAM-P-BCO"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Código de Barras" style={{ marginBottom: 0 }}>
                <Input
                  value={formNovaVariante.barcode}
                  onChange={e => setFormNovaVariante(prev => ({ ...prev, barcode: e.target.value }))}
                  placeholder="Ex: 7891234567890"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label={`Preço (vazio = R$ ${precoBase.toFixed(2)})`} style={{ marginBottom: 0 }}>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              precision={2}
              decimalSeparator=","
              prefix="R$"
              placeholder={precoBase.toFixed(2)}
              value={formNovaVariante.list_price ? parseFloat(formNovaVariante.list_price) : undefined}
              onChange={v => setFormNovaVariante(prev => ({ ...prev, list_price: v != null ? String(v) : "" }))}
            />
          </Form.Item>

        </div>
      </Modal>

    </Modal>
  );
}