import { useState, useEffect } from "react";
import {
  App,
  Badge,
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
} from "../../services/odoo";

const { Text, Title } = Typography;

// ─── Tipos (idênticos ao original) ───────────────────────────────────────────

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
  id:                          number;
  attribute_id:                [number, string];
  value_ids:                   number[];
  product_template_value_ids:  number[];
}

interface TemplateAttrValue {
  id:                           number;
  name:                         string;
  attribute_id:                 [number, string];
  product_attribute_value_id:   [number, string];
  ptav_active:                  boolean;
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

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ModalVariantes({
  templateId,
  templateNome,
  precoBase,
  onFechar,
}: Props) {
  const { message, modal } = App.useApp();

  // ── Estados (idênticos ao original) ──────────────────────────────────────
  const [aba,               setAba]               = useState("atributos");
  const [atributosGlobais,  setAtributosGlobais]  = useState<AtributoGlobal[]>([]);
  const [linhasAtributo,    setLinhasAtributo]     = useState<LinhaAtributo[]>([]);
  const [tavs,              setTavs]              = useState<TemplateAttrValue[]>([]);
  const [variantes,         setVariantes]         = useState<Variante[]>([]);
  const [formsVariante,     setFormsVariante]     = useState<Record<number, FormVariante>>({});
  const [carregando,        setCarregando]        = useState(true);
  const [salvando,          setSalvando]          = useState<number | null>(null);

  // Modal adicionar atributo
  const [modalAttr,            setModalAttr]            = useState(false);
  const [attrSelecionado,      setAttrSelecionado]      = useState<number | "novo">(0);
  const [novoAttrNome,         setNovoAttrNome]         = useState("");
  const [valoresSelecionados,  setValoresSelecionados]  = useState<number[]>([]);
  const [novosValores,         setNovosValores]         = useState<string[]>([""]);
  const [adicionandoAttr,      setAdicionandoAttr]      = useState(false);

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
    } catch {
      message.error("Erro ao carregar dados do produto.");
    } finally {
      setCarregando(false);
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
      title:   `Remover "${nomeAttr}"?`,
      content: "Esta ação não pode ser desfeita. Variantes associadas podem ser afetadas.",
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
      const preco  = parseFloat(formNovaVariante.list_price) || precoBase;

      const todasVariantes = await buscarVariantesProduto(templateId) as Variante[];
      const varianteExistente = todasVariantes.find(v => {
        const vTavs   = [...v.product_template_attribute_value_ids].sort();
        const selTavs = [...tavIds].sort();
        return JSON.stringify(vTavs) === JSON.stringify(selTavs);
      });

      if (varianteExistente) {
        await atualizarVariante(varianteExistente.id, {
          default_code: formNovaVariante.default_code || undefined,
          barcode:      formNovaVariante.barcode || undefined,
          list_price:   preco,
        });
        message.success("Variante atualizada!");
      } else {
        message.error("Combinação não encontrada. Verifique os atributos do produto.");
        return;
      }

      setModalVariante(false);
      setTavsSelecionados({});
      setFormNovaVariante({ default_code: "", barcode: "", list_price: "" });
      await carregar();
    } catch {
      message.error("Erro ao salvar variante.");
    } finally {
      setAdicionandoVariante(false);
    }
  }

  async function salvarVariante(varianteId: number) {
    setSalvando(varianteId);
    try {
      const form = formsVariante[varianteId];
      await atualizarVariante(varianteId, {
        default_code: form.default_code || undefined,
        barcode:      form.barcode || undefined,
        list_price:   parseFloat(form.list_price) || precoBase,
      });
      message.success("Variante salva!");
    } catch {
      message.error("Erro ao salvar variante.");
    } finally {
      setSalvando(null);
    }
  }

  function updateFormVariante(id: number, campo: keyof FormVariante, valor: string) {
    setFormsVariante(prev => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  // ── Dados derivados ───────────────────────────────────────────────────────
  const tavsPorAtributo: Record<number, TemplateAttrValue[]> = {};
  for (const tav of tavs) {
    const attrId = tav.attribute_id[0];
    if (!tavsPorAtributo[attrId]) tavsPorAtributo[attrId] = [];
    tavsPorAtributo[attrId].push(tav);
  }

  const atributosNoProduct  = linhasAtributo.map(l => l.attribute_id[0]);
  const atributosDisponiveis = atributosGlobais.filter(a => !atributosNoProduct.includes(a.id));

  // ── Colunas da tabela de variantes ───────────────────────────────────────
  const colunasVariantes: TableColumnsType<Variante> = [
    {
      title:     "Variante",
      dataIndex: "name",
      ellipsis:  true,
      render:    (v: string) => <Text strong>{v}</Text>,
    },
    {
      title:  "SKU",
      key:    "sku",
      width:  140,
      render: (_: unknown, record: Variante) => (
        <Input
          size="small"
          value={formsVariante[record.id]?.default_code ?? ""}
          onChange={e => updateFormVariante(record.id, "default_code", e.target.value)}
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
          onChange={e => updateFormVariante(record.id, "barcode", e.target.value)}
          placeholder="Código de barras"
        />
      ),
    },
    {
      title:  "Preço (R$)",
      key:    "preco",
      width:  130,
      render: (_: unknown, record: Variante) => (
        <InputNumber
          size="small"
          style={{ width: "100%" }}
          min={0}
          precision={2}
          decimalSeparator=","
          value={formsVariante[record.id]?.list_price
            ? parseFloat(formsVariante[record.id].list_price)
            : undefined}
          placeholder={precoBase.toFixed(2)}
          onChange={v => updateFormVariante(record.id, "list_price", v != null ? String(v) : "")}
        />
      ),
    },
    {
      title:     "Estoque",
      dataIndex: "qty_available",
      width:     90,
      align:     "center",
      render:    (v: number) => (
        <Tag color={v > 0 ? "success" : "error"}>{v} un</Tag>
      ),
    },
    {
      title:  "",
      key:    "salvar",
      width:  60,
      align:  "center",
      render: (_: unknown, record: Variante) => (
        <Button
          type="primary"
          size="small"
          icon={<SaveOutlined />}
          loading={salvando === record.id}
          onClick={() => salvarVariante(record.id)}
        />
      ),
    },
  ];

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <Modal
      open
      centered
      width="min(95vw, 860px)"
      onCancel={onFechar}
      keyboard
      footer={null}
      title={
        <div>
          <Title level={4} style={{ margin: 0 }}>{templateNome}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Gestão de Variantes</Text>
        </div>
      }
    >
      {carregando ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <Spin size="large" tip="Carregando..." />
        </div>
      ) : (
        <Tabs
          activeKey={aba}
          onChange={setAba}
          items={[
            // ── ABA ATRIBUTOS ──────────────────────────────────────────────
            {
              key:   "atributos",
              label: (
                <Space>
                  <TagsOutlined />
                  Atributos
                  {linhasAtributo.length > 0 && (
                    <Badge count={linhasAtributo.length} color="#F59E0B" />
                  )}
                </Space>
              ),
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Text type="secondary">
                        Defina os atributos do produto (ex: Tamanho, Cor).
                        Após definir, as variantes aparecem na aba Variantes.
                      </Text>
                    </Col>
                    <Col>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setModalAttr(true)}
                      >
                        Adicionar Atributo
                      </Button>
                    </Col>
                  </Row>

                  {linhasAtributo.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8" }}>
                      <TagsOutlined style={{ fontSize: 32, marginBottom: 8, display: "block" }} />
                      <Text type="secondary">Nenhum atributo cadastrado.</Text><br />
                      <Text type="secondary">Adicione atributos para criar variantes.</Text>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {linhasAtributo.map(linha => {
                        const tavsDoAttr = tavsPorAtributo[linha.attribute_id[0]] ?? [];
                        return (
                          <div
                            key={linha.id}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "14px 16px", background: "#F8FAFC",
                              borderRadius: 8, border: "1px solid #E2E8F0",
                            }}
                          >
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              <Text strong>{linha.attribute_id[1]}</Text>
                              <Space size={6} wrap>
                                {tavsDoAttr.map(tav => (
                                  <Tag key={tav.id} color="amber" style={{ background: "#FFF8E7", color: "#D97706", border: "1px solid #FDE68A" }}>
                                    {tav.product_attribute_value_id[1]}
                                  </Tag>
                                ))}
                              </Space>
                            </div>
                            <Button
                              type="text"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => handleRemoverAtributo(linha.id, linha.attribute_id[1])}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ),
            },

            // ── ABA VARIANTES ──────────────────────────────────────────────
            {
              key:   "variantes",
              label: (
                <Space>
                  <AppstoreOutlined />
                  Variantes
                  {variantes.length > 0 && (
                    <Badge count={variantes.length} color="#F59E0B" />
                  )}
                </Space>
              ),
              children: (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Text type="secondary">
                        Configure SKU, barcode e preço. Preço em branco herda R$ {precoBase.toFixed(2)}.
                      </Text>
                    </Col>
                    {linhasAtributo.length > 0 && (
                      <Col>
                        <Button
                          type="primary"
                          icon={<PlusOutlined />}
                          onClick={() => setModalVariante(true)}
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
              onChange={val => {
                setAttrSelecionado(val);
                setValoresSelecionados([]);
              }}
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
                        if (e.target.checked) {
                          setValoresSelecionados(prev => [...prev, v.id]);
                        } else {
                          setValoresSelecionados(prev => prev.filter(id => id !== v.id));
                        }
                      }}
                    >
                      {v.name}
                    </Checkbox>
                  ))
                }
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
          <Button key="cancelar" onClick={() => setModalVariante(false)}>
            Cancelar
          </Button>,
          <Button
            key="salvar"
            type="primary"
            loading={adicionandoVariante}
            onClick={confirmarAdicionarVariante}
          >
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
                  onChange={e => setTavsSelecionados(prev => ({
                    ...prev,
                    [linha.attribute_id[0]]: e.target.value,
                  }))}
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

          <Form.Item
            label={`Preço (vazio = R$ ${precoBase.toFixed(2)})`}
            style={{ marginBottom: 0 }}
          >
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