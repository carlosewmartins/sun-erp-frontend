import { useState, useRef, useEffect } from "react";
import {
  App,
  Button,
  Card,
  Col,
  Input,
  Modal,
  Radio,
  Row,
  Segmented,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import {
  BarcodeOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  LoadingOutlined,
  PrinterOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { buscarPorBarcode, registrarVenda, execute } from "../../services/odoo";
import { Produto, ItemVenda, TipoVenda } from "../../types";
import ModalProdutos from "../../components/ui/ModalProdutos";
import ModalDesconto from "../../components/ui/ModalDesconto";
import ModalNCM, { NcmMap } from "../../components/ui/ModalNCM";
import { emitirNFCe, FormaPagamento, buscarDanfeHtml } from "../../services/fiscal";
import { usePDVShortcuts } from "../../hooks/usePDVShortcuts";

const { Text, Title } = Typography;

const C = {
  amber:     "#F59E0B",
  amberBg:   "#FFF8E7",
  success:   "#22C55E",
  error:     "#EF4444",
  bgRow:     "#F8FAFC",
  border:    "#E2E8F0",
  textMuted: "#64748B",
} as const;

export default function PDV() {
  const { message, modal } = App.useApp();

  const [tipoVenda, setTipoVenda]           = useState<TipoVenda>("recibo");
  const [carrinho, setCarrinho]             = useState<ItemVenda[]>([]);
  const [desconto, setDesconto]             = useState(0);
  const [ultimoDesconto, setUltimoDesconto] = useState(0);
  const [barcodeBuffer, setBarcodeBuffer]   = useState("");
  const [buscando, setBuscando]             = useState(false);
  const [finalizando, setFinalizando]       = useState(false);
  const [modalAberto, setModalAberto]       = useState(false);
  const [modalPagamento, setModalPagamento] = useState(false);
  const [modalCliente, setModalCliente]     = useState(false);
  const [modalDesconto, setModalDesconto]   = useState(false);
  const [modalNCM, setModalNCM]             = useState(false);          // ← novo
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("dinheiro");
  const [cpfCnpj, setCpfCnpj]             = useState("");
  const [emitindoNFCe, setEmitindoNFCe]   = useState(false);
  const [resultadoNFCe, setResultadoNFCe] = useState<{ danfeUrl?: string; chave?: string } | null>(null);
  const [danfeHtml, setDanfeHtml]         = useState<string | null>(null);
  const [carregandoDanfe, setCarregandoDanfe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const algumModalAberto =
    modalAberto    ||
    modalPagamento ||
    modalCliente   ||
    modalDesconto  ||
    modalNCM       ||    // ← adicionado
    !!resultadoNFCe;

  function refocusInput() {
    inputRef.current?.focus();
  }

  function abrirModalPagamento(formaInicial: FormaPagamento = "dinheiro") {
    if (carrinho.length === 0) {
      message.error("Carrinho vazio.");
      return;
    }
    setFormaPagamento(formaInicial);
    setModalPagamento(true);
  }

  usePDVShortcuts(
    {
      onF1:  () => setModalAberto(true),
      onF2:  () => setTipoVenda((t) => (t === "recibo" ? "nfce" : "recibo")),
      onF3:  () => setModalDesconto(true),
      onF4:  finalizarVenda,
      onAlt: () => abrirModalPagamento("debito"),
    },
    algumModalAberto,
  );

  useEffect(() => {
    const refocus = () => {
      if (!algumModalAberto) inputRef.current?.focus();
    };
    document.addEventListener("click", refocus);
    if (!algumModalAberto) inputRef.current?.focus();
    return () => document.removeEventListener("click", refocus);
  }, [algumModalAberto]);

  function exibirMensagem(tipo: "sucesso" | "erro" | "aviso", texto: string) {
    if (tipo === "sucesso")     message.success(texto);
    else if (tipo === "erro")   message.error(texto);
    else                        message.warning(texto);
  }

  function selecionarProdutoModal(produto: Produto) {
    adicionarAoCarrinho(produto);
  }

  function limparDesconto() {
    setDesconto(0);
    exibirMensagem("aviso", "Desconto removido. Reaplicar com F3.");
  }

  async function processarBarcode(barcode: string) {
    if (!barcode || buscando) return;
    setBuscando(true);
    try {
      const produto = await buscarPorBarcode(barcode);
      if (!produto) {
        exibirMensagem("erro", `Produto não encontrado: ${barcode}`);
        return;
      }
      adicionarAoCarrinho(produto);
    } catch {
      exibirMensagem("erro", "Erro ao buscar produto. Verifique a conexão com o Odoo.");
    } finally {
      setBuscando(false);
      setBarcodeBuffer("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === "b" || e.key === "B") && barcodeBuffer === "") {
      e.preventDefault();
      setModalCliente(true);
      return;
    }
    if (e.key === "Enter") processarBarcode(barcodeBuffer.trim());
  }

  function adicionarAoCarrinho(produto: Produto) {
    if (desconto > 0) {
      limparDesconto();
    } else {
      exibirMensagem("sucesso", `${produto.name} adicionado`);
    }
    setCarrinho((prev) => {
      const existente = prev.find((i) => i.produto.id === produto.id);
      if (existente) {
        return prev.map((i) =>
          i.produto.id === produto.id
            ? { ...i, quantidade: i.quantidade + 1 }
            : i
        );
      }
      return [...prev, { produto, quantidade: 1, preco_unitario: produto.list_price ?? 0 }];
    });
  }

  function alterarQuantidade(produtoId: number, delta: number) {
    if (desconto > 0) limparDesconto();
    setCarrinho((prev) =>
      prev
        .map((i) =>
          i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i
        )
        .filter((i) => i.quantidade > 0)
    );
  }

  function removerItem(produtoId: number) {
    if (desconto > 0) limparDesconto();
    setCarrinho((prev) => prev.filter((i) => i.produto.id !== produtoId));
  }

  function calcularTotalBruto() {
    return carrinho.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0);
  }

  function calcularTotal() {
    return Math.max(0, calcularTotalBruto() - desconto);
  }

  function cancelarVenda() {
    setCarrinho([]);
    setDesconto(0);
  }

  function confirmarCancelamento() {
    modal.confirm({
      title:         "Cancelar venda?",
      content:       "Todos os itens do carrinho serão removidos.",
      okText:        "Cancelar Venda",
      okButtonProps: { danger: true },
      cancelText:    "Voltar",
      onOk:          cancelarVenda,
      centered:      true,
      maskClosable:  true,
    });
  }

  async function finalizarVenda() {
    if (carrinho.length === 0) {
      exibirMensagem("erro", "Carrinho vazio.");
      return;
    }
    // NFC-e: primeiro abre modal de pagamento
    if (tipoVenda === "nfce") {
      abrirModalPagamento("dinheiro");
      return;
    }
    // Recibo: abre modal NCM (opcional) antes de processar
    setModalNCM(true);
  }

  // ─── processarVenda ──────────────────────────────────────────────────────────
  // Chamado pelo botão "Emitir NFC-e" no modal de pagamento.
  // Fecha o modal de pagamento e abre o ModalNCM (obrigatório para NFC-e).
  // O ModalNCM chama executarVenda() ao confirmar.
  async function processarVenda() {
    setModalPagamento(false);
    setModalNCM(true);
  }

  // ─── executarVenda ───────────────────────────────────────────────────────────
  // Recebe o mapa de NCMs validados/preenchidos pelo ModalNCM.
  // Executa: registrarVenda (para cada item) → emitirNFCe (se nfce) → salva metadados.
  async function executarVenda(ncmMap: NcmMap) {
    setModalNCM(false);
    setFinalizando(true);
    const pickingIds: number[] = [];

    try {
      // 1. Movimenta estoque para cada item do carrinho
      for (const item of carrinho) {
        const resultado = await registrarVenda(
          item.produto.id,
          item.quantidade,
          tipoVenda
        );
        if (!resultado.sucesso) {
          exibirMensagem("erro", `Erro em ${item.produto.name}: ${resultado.erro}`);
          return;
        }
        if (resultado.picking_id) pickingIds.push(resultado.picking_id);
      }

      // 2. NFC-e: emite nota fiscal com NCMs reais
      if (tipoVenda === "nfce") {
        setEmitindoNFCe(true);

        const resultado = await emitirNFCe({
          itens: carrinho.map((item) => ({
            produtoId:  item.produto.id,
            nome:       item.produto.name,
            ncm:        ncmMap[item.produto.id] ?? "00000000", // ← NCM real
            barcode:    item.produto.barcode || undefined,
            quantidade: item.quantidade,
            valorUnit:  item.preco_unitario,
          })),
          formaPagamento,
          cpfCnpjCliente: cpfCnpj.replace(/\D/g, "") || undefined,
          valorTotal:     calcularTotal(),
          desconto,
        });

        setEmitindoNFCe(false);

        if (!resultado.sucesso) {
          exibirMensagem("erro", `Erro NFC-e: ${resultado.erro}`);
          return;
        }

        // Persiste chave NFC-e nos pickings para o módulo de Relatórios
        if (resultado.chave && pickingIds.length > 0) {
          try {
            await execute("stock.picking", "write", [
              pickingIds,
              {
                origin: `NFCE-${resultado.chave.slice(-8)}`,
                note:   resultado.chave,
              },
            ]);
          } catch {
            // Falha silenciosa — não bloqueia a venda
          }
        }

        setResultadoNFCe({ danfeUrl: resultado.danfeUrl, chave: resultado.chave });
        exibirMensagem("sucesso", "NFC-e autorizada com sucesso!");

      // 3. Recibo: apenas persiste referência de agrupamento
      } else {
        if (pickingIds.length > 0) {
          try {
            await execute("stock.picking", "write", [
              pickingIds,
              { origin: `RECIBO-${Date.now()}` },
            ]);
          } catch {
            // Falha silenciosa
          }
        }
        exibirMensagem("sucesso", "Venda finalizada!");
      }

      // 4. Limpa carrinho
      setCarrinho([]);
      setDesconto(0);
      setCpfCnpj("");

    } catch {
      exibirMensagem("erro", "Erro ao finalizar venda.");
    } finally {
      setFinalizando(false);
      setEmitindoNFCe(false);
    }
  }

  const totalBruto = calcularTotalBruto();
  const total      = calcularTotal();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 20, position: "relative" }}>

      {/* Input invisível — captura barcode do leitor USB HID */}
      <input
        ref={inputRef}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
        value={barcodeBuffer}
        onChange={(e) => setBarcodeBuffer(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={buscando}
      />

      {/* ── Header ── */}
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={3} style={{ margin: 0 }}>PDV — Balcão</Title>
        </Col>
        <Col>
          <Segmented
            value={tipoVenda}
            onChange={(v) => setTipoVenda(v as TipoVenda)}
            size="large"
            options={[
              { label: "🧾 Recibo", value: "recibo" },
              { label: "📄 NFC-e",  value: "nfce"   },
            ]}
          />
        </Col>
      </Row>

      {/* ── Body: Scanner + Carrinho ── */}
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
                  marginTop: 20,
                  background:  C.bgRow,
                  border:      `2px dashed ${C.border}`,
                  borderRadius: 10,
                  padding:     "12px 24px",
                  fontFamily:  "monospace",
                  fontSize:    18,
                  minWidth:    200,
                  color:       barcodeBuffer ? "#1A1A1A" : C.border,
                }}>
                  {barcodeBuffer || "aguardando..."}
                </div>
              </div>
            )}
          </Card>
        </Col>

        {/* Carrinho */}
        <Col span={14} style={{ display: "flex" }}>
          <Card
            title={<Text strong style={{ fontSize: 18 }}>Carrinho</Text>}
            style={{ width: "100%", display: "flex", flexDirection: "column" }}
            styles={{ body: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "12px 24px" } }}
          >
            {carrinho.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Text type="secondary" style={{ fontSize: 15 }}>Nenhum item adicionado</Text>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {carrinho.map((item) => (
                  <div
                    key={item.produto.id}
                    style={{
                      display:    "flex",
                      alignItems: "center",
                      gap:        12,
                      padding:    12,
                      background: C.bgRow,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
                      {item.produto.name}
                    </Text>
                    <Space size={8}>
                      <Button size="small" onClick={() => alterarQuantidade(item.produto.id, -1)}>−</Button>
                      <Text strong style={{ minWidth: 24, textAlign: "center", display: "inline-block" }}>
                        {item.quantidade}
                      </Text>
                      <Button size="small" onClick={() => alterarQuantidade(item.produto.id, +1)}>+</Button>
                    </Space>
                    <Text strong style={{ minWidth: 80, textAlign: "right", fontSize: 14 }}>
                      R$ {(item.preco_unitario * item.quantidade).toFixed(2)}
                    </Text>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<CloseOutlined />}
                      onClick={() => removerItem(item.produto.id)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Footer do carrinho */}
            <div style={{ borderTop: `2px solid ${C.border}`, paddingTop: 16, marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {desconto > 0 && (
                <>
                  <Row justify="space-between">
                    <Text type="secondary">Subtotal</Text>
                    <Text type="secondary">R$ {totalBruto.toFixed(2)}</Text>
                  </Row>
                  <Row justify="space-between">
                    <Text style={{ color: C.error }}>🏷️ Desconto</Text>
                    <Text style={{ color: C.error }}>− R$ {desconto.toFixed(2)}</Text>
                  </Row>
                </>
              )}
              <Row justify="space-between" align="middle">
                <Text strong style={{ fontSize: 20 }}>Total</Text>
                <Text strong style={{ fontSize: 20 }}>R$ {total.toFixed(2)}</Text>
              </Row>

              <Button
                type="primary"
                block
                size="large"
                icon={<CheckCircleOutlined />}
                onClick={finalizarVenda}
                disabled={carrinho.length === 0}
                loading={finalizando}
                style={carrinho.length > 0 ? { background: C.success, borderColor: C.success } : {}}
              >
                {finalizando ? "Processando..." : "Finalizar Venda"}
              </Button>

              {carrinho.length > 0 && (
                <Button
                  block
                  danger
                  icon={<DeleteOutlined />}
                  onClick={confirmarCancelamento}
                  disabled={finalizando}
                >
                  Cancelar Venda
                </Button>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── Hints de atalho ── */}
      <Space size={12} wrap style={{ position: "fixed", bottom: 16, right: 24 }}>
        {(
          [
            ["F1", "Produtos"],
            ["F2", "Recibo/NFC-e"],
            ["F3", "Desconto"],
            ["F4", "Finalizar"],
            ["Alt", "Finalizar Débito"],
            ["B", "Cliente"],
          ] as [string, string][]
        ).map(([key, label]) => (
          <Space key={key} size={4}>
            <Tag style={{ fontFamily: "monospace", margin: 0 }}>{key}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
          </Space>
        ))}
      </Space>

      {/* ── Modal Produtos (F1) ── */}
      <ModalProdutos
        aberto={modalAberto}
        onFechar={() => { setModalAberto(false); refocusInput(); }}
        onSelecionar={selecionarProdutoModal}
      />

      {/* ── Modal Cliente (B) ── */}
      <Modal
        title="👤 Identificar Cliente"
        open={modalCliente}
        centered
        maskClosable
        onCancel={() => { setModalCliente(false); refocusInput(); }}
        footer={[
          <Button
            key="limpar"
            onClick={() => { setCpfCnpj(""); setModalCliente(false); refocusInput(); }}
          >
            Limpar
          </Button>,
          <Button
            key="confirmar"
            type="primary"
            onClick={() => { setModalCliente(false); refocusInput(); }}
          >
            Confirmar
          </Button>,
        ]}
      >
        <div style={{ padding: "16px 0" }}>
          <Text type="secondary" style={{ display: "block", marginBottom: 8, fontWeight: 600 }}>
            CPF / CNPJ
          </Text>
          <Input
            autoFocus
            prefix={<UserOutlined />}
            size="large"
            value={cpfCnpj}
            onChange={(e) => setCpfCnpj(e.target.value)}
            placeholder="000.000.000-00 ou 00.000.000/0001-00"
            maxLength={18}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") {
                setModalCliente(false);
                refocusInput();
              }
            }}
          />
        </div>
      </Modal>

      {/* ── Modal Desconto (F3) ── */}
      <ModalDesconto
        isOpen={modalDesconto}
        totalBruto={totalBruto}
        ultimoDesconto={ultimoDesconto}
        onConfirmar={(valor) => { setDesconto(valor); setUltimoDesconto(valor); }}
        onFechar={() => { setModalDesconto(false); refocusInput(); }}
      />

      {/* ── Modal NCM ── */}
      {/* NFC-e: obrigatorio=true (bloqueia emissão se faltar NCM)   */}
      {/* Recibo: obrigatorio=false (pode pular, apenas sugere)       */}
      <ModalNCM
        isOpen={modalNCM}
        itens={carrinho}
        obrigatorio={tipoVenda === "nfce"}
        onConfirmar={(ncmMap) => {
          refocusInput();
          executarVenda(ncmMap);
        }}
        onFechar={() => {
          setModalNCM(false);
          refocusInput();
        }}
      />

      {/* ── Modal Pagamento (NFC-e) ── */}
      <Modal
        title="💳 Finalizar com NFC-e"
        open={modalPagamento}
        centered
        maskClosable={false}
        onCancel={() => setModalPagamento(false)}
        footer={[
          <Button key="cancelar" onClick={() => setModalPagamento(false)}>
            Cancelar
          </Button>,
          <Button
            key="emitir"
            type="primary"
            onClick={processarVenda}
            disabled={finalizando || emitindoNFCe}
            loading={finalizando || emitindoNFCe}
          >
            {emitindoNFCe ? "Autorizando..." : finalizando ? "Processando..." : "Emitir NFC-e"}
          </Button>,
        ]}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "16px 0" }}>

          {/* Total */}
          <div style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            padding:        "14px 18px",
            background:     C.amberBg,
            borderRadius:   12,
          }}>
            <Text style={{ fontSize: 15 }}>Total</Text>
            <Text strong style={{ fontSize: 22, color: C.amber }}>
              R$ {calcularTotal().toFixed(2)}
            </Text>
          </div>

          {/* Forma de pagamento */}
          <div>
            <Text type="secondary" style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13 }}>
              Forma de Pagamento
            </Text>
            <Radio.Group
              value={formaPagamento}
              onChange={(e) => setFormaPagamento(e.target.value)}
              buttonStyle="solid"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%" }}
            >
              {(
                [
                  { valor: "dinheiro", label: "💵 Dinheiro" },
                  { valor: "debito",   label: "💳 Débito"   },
                  { valor: "credito",  label: "💳 Crédito"  },
                  { valor: "pix",      label: "📱 Pix"      },
                ] as { valor: FormaPagamento; label: string }[]
              ).map((f) => (
                <Radio.Button
                  key={f.valor}
                  value={f.valor}
                  style={{ textAlign: "center", height: 52, lineHeight: "52px" }}
                >
                  {f.label}
                </Radio.Button>
              ))}
            </Radio.Group>
          </div>

          {/* CPF/CNPJ */}
          <div>
            <Text type="secondary" style={{ display: "block", marginBottom: 8, fontWeight: 600, fontSize: 13 }}>
              CPF/CNPJ na nota (opcional)
            </Text>
            <Input
              autoFocus
              prefix={<UserOutlined />}
              size="large"
              value={cpfCnpj}
              onChange={(e) => setCpfCnpj(e.target.value)}
              placeholder="000.000.000-00 ou 00.000.000/0001-00"
              maxLength={18}
              onKeyDown={(e) => {
                if (e.key === "Enter")  processarVenda();
                if (e.key === "Escape") setModalPagamento(false);
              }}
            />
          </div>
        </div>
      </Modal>

      {/* ── Modal DANFE ── */}
      <Modal
        title="✅ NFC-e Autorizada"
        open={!!resultadoNFCe}
        centered
        maskClosable
        width={danfeHtml ? "min(90vw, 450px)" : 460}
        onCancel={() => { setResultadoNFCe(null); setDanfeHtml(null); }}
        styles={danfeHtml ? { body: { height: "65vh", display: "flex", flexDirection: "column" } } : undefined}
        footer={
          danfeHtml
            ? [
                <Button
                  key="imprimir"
                  type="primary"
                  icon={<PrinterOutlined />}
                  style={{ background: C.success, borderColor: C.success }}
                  onClick={() => {
                    const iframe = document.querySelector(".danfe-iframe") as HTMLIFrameElement;
                    iframe?.contentWindow?.print();
                  }}
                >
                  Imprimir
                </Button>,
                <Button key="fechar" onClick={() => { setResultadoNFCe(null); setDanfeHtml(null); }}>
                  Fechar
                </Button>,
              ]
            : [
                <Button
                  key="fechar"
                  type="primary"
                  onClick={() => { setResultadoNFCe(null); setDanfeHtml(null); }}
                >
                  Fechar
                </Button>,
              ]
        }
      >
        <div style={{
          display:       "flex",
          flexDirection: "column",
          gap:           16,
          padding:       "16px 0",
          ...(danfeHtml ? { flex: 1 } : {}),
        }}>
          {/* Chave de acesso */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Text type="secondary" style={{ fontWeight: 600, fontSize: 13 }}>Chave de acesso</Text>
            <code style={{
              fontFamily: "monospace",
              fontSize:   12,
              background: C.bgRow,
              padding:    10,
              borderRadius: 8,
              wordBreak:  "break-all",
              color:      "#1A1A1A",
              display:    "block",
            }}>
              {resultadoNFCe?.chave}
            </code>
          </div>

          {/* Botão visualizar DANFE */}
          {resultadoNFCe?.danfeUrl && !danfeHtml && (
            <Button
              type="primary"
              block
              size="large"
              icon={<PrinterOutlined />}
              loading={carregandoDanfe}
              style={{ background: C.success, borderColor: C.success }}
              onClick={async () => {
                setCarregandoDanfe(true);
                try {
                  const html = await buscarDanfeHtml(resultadoNFCe.danfeUrl!);
                  setDanfeHtml(html);
                } catch {
                  message.error("Erro ao carregar DANFE");
                } finally {
                  setCarregandoDanfe(false);
                }
              }}
            >
              {carregandoDanfe ? "Carregando..." : "Visualizar DANFE"}
            </Button>
          )}

          {/* iframe do DANFE */}
          {danfeHtml && (
            <iframe
              srcDoc={danfeHtml}
              className="danfe-iframe"
              title="DANFE"
              style={{ flex: 1, width: "100%", border: "none", borderRadius: 8, background: "white", marginTop: 12 }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}