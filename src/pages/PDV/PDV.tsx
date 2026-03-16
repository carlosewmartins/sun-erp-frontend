import { useState, useRef, useEffect } from "react";
import { buscarPorBarcode, registrarVenda } from "../../services/odoo";
import { Produto, ItemVenda, TipoVenda } from "../../types";
import ModalProdutos from "../../components/ui/ModalProdutos";
import { emitirNFCe, FormaPagamento, buscarDanfeHtml } from "../../services/fiscal";
import "./PDV.css";

export default function PDV() {
  const [tipoVenda, setTipoVenda]             = useState<TipoVenda>("recibo");
  const [carrinho, setCarrinho]               = useState<ItemVenda[]>([]);
  const [barcodeBuffer, setBarcodeBuffer]     = useState("");
  const [buscando, setBuscando]               = useState(false);
  const [finalizando, setFinalizando]         = useState(false);
  const [mensagem, setMensagem]               = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [modalAberto, setModalAberto]         = useState(false);
  const [modalPagamento, setModalPagamento]   = useState(false);
  const [formaPagamento, setFormaPagamento]   = useState<FormaPagamento>("dinheiro");
  const [cpfCnpj, setCpfCnpj]               = useState("");
  const [emitindoNFCe, setEmitindoNFCe]     = useState(false);
  const [resultadoNFCe, setResultadoNFCe]   = useState<{ danfeUrl?: string; chave?: string } | null>(null);
  const [danfeHtml, setDanfeHtml]           = useState<string | null>(null);
  const [carregandoDanfe, setCarregandoDanfe] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refocus = () => inputRef.current?.focus();
    document.addEventListener("click", refocus);
    refocus();
    return () => document.removeEventListener("click", refocus);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); setModalAberto(true); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  function selecionarProdutoModal(produto: Produto) {
    adicionarAoCarrinho(produto);
  }

  function exibirMensagem(tipo: "sucesso" | "erro", texto: string) {
    setMensagem({ tipo, texto });
    setTimeout(() => setMensagem(null), 3000);
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
    if (e.key === "Enter") processarBarcode(barcodeBuffer.trim());
  }

  function adicionarAoCarrinho(produto: Produto) {
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
    exibirMensagem("sucesso", `✅ ${produto.name} adicionado`);
  }

  function alterarQuantidade(produtoId: number, delta: number) {
    setCarrinho((prev) =>
      prev
        .map((i) => i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i)
        .filter((i) => i.quantidade > 0)
    );
  }

  function removerItem(produtoId: number) {
    setCarrinho((prev) => prev.filter((i) => i.produto.id !== produtoId));
  }

  function calcularTotal() {
    return carrinho.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0);
  }

  async function finalizarVenda() {
    if (carrinho.length === 0) {
      exibirMensagem("erro", "Carrinho vazio.");
      return;
    }

    // NFC-e → abre modal de pagamento primeiro
    if (tipoVenda === "nfce") {
      setModalPagamento(true);
      return;
    }

    // Recibo → fluxo direto
    await processarVenda();
  }

  async function processarVenda() {
    setFinalizando(true);
    try {
      // 1. Baixa estoque no Odoo
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

      // 2. Se NFC-e, emite pela Focus NFe
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
          valorTotal: calcularTotal(),
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
      setModalPagamento(false);
      setCpfCnpj("");

    } catch {
      exibirMensagem("erro", "Erro ao finalizar venda.");
    } finally {
      setFinalizando(false);
      setEmitindoNFCe(false);
    }
  }

  const total = calcularTotal();

  return (
    <div className="pdv-container">

      {/* Input invisível para capturar barcode */}
      <input
        ref={inputRef}
        className="barcode-input"
        value={barcodeBuffer}
        onChange={(e) => setBarcodeBuffer(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={buscando}
      />

      {/* Mensagem de feedback */}
      {mensagem && (
        <div className={`mensagem mensagem-${mensagem.tipo}`}>
          {mensagem.texto}
        </div>
      )}

      {/* Header */}
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

      {/* Área principal */}
      <div className="pdv-body">

        {/* Painel esquerdo — scanner */}
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

        {/* Painel direito — carrinho */}
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

          {/* Rodapé do carrinho */}
          <div className="carrinho-footer">
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
                onClick={() => setCarrinho([])}
                disabled={finalizando}
              >
                🗑️ Cancelar Venda
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hint F1 */}
      <div className="f1-hint">Pressione F1 para listar produtos</div>

      {/* Modal lista de produtos */}
      <ModalProdutos
        aberto={modalAberto}
        onFechar={() => { setModalAberto(false); inputRef.current?.focus(); }}
        onSelecionar={selecionarProdutoModal}
      />

      {/* Modal de pagamento NFC-e */}
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
                  type="text"
                  value={cpfCnpj}
                  onChange={e => setCpfCnpj(e.target.value)}
                  placeholder="000.000.000-00 ou 00.000.000/0001-00"
                  maxLength={18}
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

      {/* Modal DANFE */}
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