import { useState, useRef, useEffect } from "react";
import { buscarPorBarcode, registrarVenda } from "../../services/odoo";
import { Produto, ItemVenda, TipoVenda } from "../../types";
import ModalProdutos from "../../components/ui/ModalProdutos";
import ModalDesconto from "../../components/ui/ModalDesconto";
import { emitirNFCe, FormaPagamento, buscarDanfeHtml } from "../../services/fiscal";
import { usePDVShortcuts } from "../../hooks/usePDVShortcuts";
import "./PDV.css";

export default function PDV() {
  const [tipoVenda, setTipoVenda]             = useState<TipoVenda>("recibo");
  const [carrinho, setCarrinho]               = useState<ItemVenda[]>([]);
  const [desconto, setDesconto]               = useState(0);
  const [ultimoDesconto, setUltimoDesconto] = useState(0);
  const [barcodeBuffer, setBarcodeBuffer]     = useState("");
  const [buscando, setBuscando]               = useState(false);
  const [finalizando, setFinalizando]         = useState(false);
  const [mensagem, setMensagem]               = useState<{ tipo: "sucesso" | "erro" | "aviso"; texto: string } | null>(null);
  const [modalAberto, setModalAberto]         = useState(false);
  const [modalPagamento, setModalPagamento]   = useState(false);
  const [modalCliente, setModalCliente]       = useState(false);
  const [modalDesconto, setModalDesconto]     = useState(false);
  const [formaPagamento, setFormaPagamento]   = useState<FormaPagamento>("dinheiro");
  const [cpfCnpj, setCpfCnpj]               = useState("");
  const [emitindoNFCe, setEmitindoNFCe]     = useState(false);
  const [resultadoNFCe, setResultadoNFCe]   = useState<{ danfeUrl?: string; chave?: string } | null>(null);
  const [danfeHtml, setDanfeHtml]           = useState<string | null>(null);
  const [carregandoDanfe, setCarregandoDanfe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const algumModalAberto =
    modalAberto    ||
    modalPagamento ||
    modalCliente   ||
    modalDesconto  ||
    !!resultadoNFCe;

  function abrirModalPagamento(formaInicial: FormaPagamento = "dinheiro") {
    if (carrinho.length === 0) {
      exibirMensagem("erro", "Carrinho vazio.");
      return;
    }
    setFormaPagamento(formaInicial);
    setModalPagamento(true);
  }

  usePDVShortcuts(
    {
      onF1:  () => setModalAberto(true),
      onF2:  () => setTipoVenda(t => t === "recibo" ? "nfce" : "recibo"),
      onF3:  () => setModalDesconto(true),
      onF4:  finalizarVenda,
      onAlt: () => abrirModalPagamento("debito"),
    },
    algumModalAberto,
  );

  useEffect(() => {
    const refocus = () => inputRef.current?.focus();
    document.addEventListener("click", refocus);
    refocus();
    return () => document.removeEventListener("click", refocus);
  }, []);

  function selecionarProdutoModal(produto: Produto) {
    adicionarAoCarrinho(produto);
  }

  function exibirMensagem(tipo: "sucesso" | "erro" | "aviso", texto: string) {
    setMensagem({ tipo, texto });
    setTimeout(() => setMensagem(null), 3000);
  }

  // ── helper: zera desconto e avisa o operador ──────────────────────────────
  function limparDesconto() {
    setDesconto(0);
    exibirMensagem("aviso", "⚠️ Desconto removido. Reaplicar com F3.");
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
    // captura antes de qualquer setState para a condição ser confiável
    const temDesconto = desconto > 0;

    if (temDesconto) {
      limparDesconto();
    } else {
      exibirMensagem("sucesso", `✅ ${produto.name} adicionado`);
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
        .map((i) => i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i)
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

  async function finalizarVenda() {
    if (carrinho.length === 0) {
      exibirMensagem("erro", "Carrinho vazio.");
      return;
    }
    if (tipoVenda === "nfce") {
      abrirModalPagamento("dinheiro");
      return;
    }
    await processarVenda();
  }

  async function processarVenda() {
    setFinalizando(true);
    try {
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
      }

      if (tipoVenda === "nfce") {
        setEmitindoNFCe(true);
        const resultado = await emitirNFCe({
          itens: carrinho.map(item => ({
            produtoId:  item.produto.id,
            nome:       item.produto.name,
            ncm:        "00000000",
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

        setResultadoNFCe({ danfeUrl: resultado.danfeUrl, chave: resultado.chave });
        exibirMensagem("sucesso", "✅ NFC-e autorizada com sucesso!");
      } else {
        exibirMensagem("sucesso", "✅ Venda finalizada!");
      }

      setCarrinho([]);
      setDesconto(0);
      setModalPagamento(false);
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
    <div className="pdv-container">

      <input
        ref={inputRef}
        className="barcode-input"
        value={barcodeBuffer}
        onChange={(e) => setBarcodeBuffer(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={buscando}
      />

      {mensagem && (
        <div className={`mensagem mensagem-${mensagem.tipo}`}>
          {mensagem.texto}
        </div>
      )}

      <div className="pdv-header">
        <h2>PDV — Balcão</h2>
        <div className="tipo-venda-toggle">
          <button
            className={tipoVenda === "recibo" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => setTipoVenda("recibo")}
          >
            🧾 Recibo
          </button>
          <button
            className={tipoVenda === "nfce" ? "toggle-btn active nfce" : "toggle-btn"}
            onClick={() => setTipoVenda("nfce")}
          >
            📄 NFC-e
          </button>
        </div>
      </div>

      <div className="pdv-body">

        <div className="pdv-scanner">
          {buscando ? (
            <div className="scanner-buscando">
              <div className="spinner" />
              <p>Buscando produto...</p>
            </div>
          ) : (
            <div className="scanner-idle">
              <div className="scanner-icon">▐▌</div>
              <p>Bipe o produto ou</p>
              <p>digite o código de barras</p>
              <p className="scanner-hint">e pressione Enter</p>
              <div className="barcode-display">
                {barcodeBuffer || <span className="placeholder">aguardando...</span>}
              </div>
            </div>
          )}
        </div>

        <div className="pdv-carrinho">
          <h3>Carrinho</h3>

          {carrinho.length === 0 ? (
            <div className="carrinho-vazio">Nenhum item adicionado</div>
          ) : (
            <div className="carrinho-itens">
              {carrinho.map((item) => (
                <div key={item.produto.id} className="carrinho-item">
                  <div className="item-nome">{item.produto.name}</div>
                  <div className="item-controles">
                    <button onClick={() => alterarQuantidade(item.produto.id, -1)}>−</button>
                    <span>{item.quantidade}</span>
                    <button onClick={() => alterarQuantidade(item.produto.id, +1)}>+</button>
                  </div>
                  <div className="item-preco">
                    R$ {(item.preco_unitario * item.quantidade).toFixed(2)}
                  </div>
                  <button
                    className="item-remover"
                    onClick={() => removerItem(item.produto.id)}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="carrinho-footer">
            {desconto > 0 && (
              <>
                <div className="carrinho-total" style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                  <span>Subtotal</span>
                  <span>R$ {totalBruto.toFixed(2)}</span>
                </div>
                <div className="carrinho-total" style={{ color: "#f87171" }}>
                  <span>🏷️ Desconto</span>
                  <span>− R$ {desconto.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="carrinho-total">
              <span>Total</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
            <button
              className="btn-finalizar"
              onClick={finalizarVenda}
              disabled={finalizando || carrinho.length === 0}
            >
              {finalizando ? "Processando..." : "✅ Finalizar Venda"}
            </button>
            {carrinho.length > 0 && (
              <button
                className="btn-cancelar"
                onClick={cancelarVenda}
                disabled={finalizando}
              >
                🗑️ Cancelar Venda
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="f1-hint">
        <span><kbd>F1</kbd> Produtos</span>
        <span><kbd>F2</kbd> Recibo/NFC-e</span>
        <span><kbd>F3</kbd> Desconto</span>
        <span><kbd>F4</kbd> Finalizar</span>
        <span><kbd>Alt</kbd> Finalizar Débito</span>
        <span><kbd>B</kbd> Cliente</span>
      </div>

      <ModalProdutos
        aberto={modalAberto}
        onFechar={() => { setModalAberto(false); inputRef.current?.focus(); }}
        onSelecionar={selecionarProdutoModal}
      />

      {modalCliente && (
        <div className="modal-overlay" onClick={() => { setModalCliente(false); inputRef.current?.focus(); }}>
          <div className="modal-pagamento" onClick={e => e.stopPropagation()}>
            <div className="modal-pag-header">
              <h3>👤 Identificar Cliente</h3>
              <button className="modal-fechar" onClick={() => { setModalCliente(false); inputRef.current?.focus(); }}>✕</button>
            </div>
            <div className="modal-pag-body">
              <div className="pag-section">
                <label>CPF / CNPJ</label>
                <input
                  autoFocus
                  type="text"
                  value={cpfCnpj}
                  onChange={e => setCpfCnpj(e.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  maxLength={18}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === "Escape") {
                      setModalCliente(false);
                      inputRef.current?.focus();
                    }
                  }}
                />
              </div>
            </div>
            <div className="modal-pag-footer">
              <button className="btn-cancelar-pag" onClick={() => { setCpfCnpj(""); setModalCliente(false); inputRef.current?.focus(); }}>
                Limpar
              </button>
              <button className="btn-emitir-nfce" onClick={() => { setModalCliente(false); inputRef.current?.focus(); }}>
                ✅ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <ModalDesconto
      isOpen={modalDesconto}
      totalBruto={totalBruto}
      ultimoDesconto={ultimoDesconto}
      onConfirmar={(valor) => { setDesconto(valor); setUltimoDesconto(valor); }}
      onFechar={() => { setModalDesconto(false); inputRef.current?.focus(); }}
      />

      {modalPagamento && (
        <div className="modal-overlay" onClick={() => setModalPagamento(false)}>
          <div className="modal-pagamento" onClick={e => e.stopPropagation()}>
            <div className="modal-pag-header">
              <h3>💳 Finalizar com NFC-e</h3>
              <button className="modal-fechar" onClick={() => setModalPagamento(false)}>✕</button>
            </div>

            <div className="modal-pag-body">
              <div className="pag-total">
                <span>Total</span>
                <strong>R$ {calcularTotal().toFixed(2)}</strong>
              </div>

              <div className="pag-section">
                <label>Forma de Pagamento</label>
                <div className="pag-formas">
                  {[
                    { valor: "dinheiro", label: "💵 Dinheiro" },
                    { valor: "debito",   label: "💳 Débito"   },
                    { valor: "credito",  label: "💳 Crédito"  },
                    { valor: "pix",      label: "📱 Pix"      },
                  ].map(f => (
                    <button
                      key={f.valor}
                      className={`pag-forma-btn ${formaPagamento === f.valor ? "ativo" : ""}`}
                      onClick={() => setFormaPagamento(f.valor as FormaPagamento)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pag-section">
                <label>CPF/CNPJ na nota (opcional)</label>
                <input
                  autoFocus
                  type="text"
                  value={cpfCnpj}
                  onChange={e => setCpfCnpj(e.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  maxLength={18}
                  onKeyDown={e => {
                    if (e.key === "Enter") processarVenda();
                    if (e.key === "Escape") setModalPagamento(false);
                  }}
                />
              </div>
            </div>

            <div className="modal-pag-footer">
              <button className="btn-cancelar-pag" onClick={() => setModalPagamento(false)}>
                Cancelar
              </button>
              <button
                className="btn-emitir-nfce"
                onClick={processarVenda}
                disabled={finalizando || emitindoNFCe}
              >
                {emitindoNFCe ? "⏳ Autorizando..." :
                 finalizando  ? "Processando..."   :
                 "✅ Emitir NFC-e"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resultadoNFCe && (
        <div className="modal-overlay" onClick={() => { setResultadoNFCe(null); setDanfeHtml(null); }}>
          <div className={`modal-danfe ${danfeHtml ? "modal-danfe-expanded" : ""}`} onClick={e => e.stopPropagation()}>
            <div className="modal-pag-header">
              <h3>✅ NFC-e Autorizada</h3>
              <button className="modal-fechar" onClick={() => { setResultadoNFCe(null); setDanfeHtml(null); }}>✕</button>
            </div>
            <div className="modal-pag-body">
              <div className="danfe-chave">
                <span>Chave de acesso</span>
                <code>{resultadoNFCe.chave}</code>
              </div>
              {resultadoNFCe.danfeUrl && !danfeHtml && (
                <button
                  className="btn-danfe"
                  disabled={carregandoDanfe}
                  onClick={async () => {
                    setCarregandoDanfe(true);
                    try {
                      const html = await buscarDanfeHtml(resultadoNFCe.danfeUrl!);
                      setDanfeHtml(html);
                    } catch (error) {
                      console.error("Erro ao carregar DANFE:", error);
                      alert("Erro ao carregar DANFE");
                    } finally {
                      setCarregandoDanfe(false);
                    }
                  }}
                >
                  {carregandoDanfe ? "Carregando..." : "🖨️ Visualizar DANFE"}
                </button>
              )}
              {danfeHtml && (
                <iframe
                  srcDoc={danfeHtml}
                  className="danfe-iframe"
                  title="DANFE"
                />
              )}
            </div>
            <div className="modal-pag-footer">
              {danfeHtml && (
                <button
                  className="btn-danfe"
                  onClick={() => {
                    const iframe = document.querySelector(".danfe-iframe") as HTMLIFrameElement;
                    iframe?.contentWindow?.print();
                  }}
                >
                  🖨️ Imprimir
                </button>
              )}
              <button className="btn-emitir-nfce" onClick={() => { setResultadoNFCe(null); setDanfeHtml(null); }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}