import { useState, useRef, useEffect } from "react";
import { buscarPorBarcode, registrarVenda } from "../../services/odoo";
import { Produto, ItemVenda, TipoVenda } from "../../types";
import ModalProdutos from "../../components/ui/ModalProdutos";
import "./PDV.css";

export default function PDV() {
  const [tipoVenda, setTipoVenda] = useState<TipoVenda>("recibo");
  const [carrinho, setCarrinho] = useState<ItemVenda[]>([]);
  const [barcodeBuffer, setBarcodeBuffer] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mantém o input sempre focado para capturar o leitor de barcode
  useEffect(() => {
    const refocus = () => inputRef.current?.focus();
    document.addEventListener("click", refocus);
    refocus();
    return () => document.removeEventListener("click", refocus);
  }, []);

// Listener para F1 no useEffect
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F1") { e.preventDefault(); setModalAberto(true); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);
  
  // Adicione a função de seleção pelo modal
  function selecionarProdutoModal(produto: Produto) {
    adicionarAoCarrinho(produto);
  }

  // Exibe mensagem temporária
  function exibirMensagem(tipo: "sucesso" | "erro", texto: string) {
    setMensagem({ tipo, texto });
    setTimeout(() => setMensagem(null), 3000);
  }

  // Processa o barcode lido
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

  // Captura input do leitor (funciona como teclado)
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      processarBarcode(barcodeBuffer.trim());
    }
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
        .map((i) =>
          i.produto.id === produtoId
            ? { ...i, quantidade: i.quantidade + delta }
            : i
        )
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

      exibirMensagem("sucesso", `✅ Venda finalizada com sucesso!`);
      setCarrinho([]);
    } catch {
      exibirMensagem("erro", "Erro ao finalizar venda.");
    } finally {
      setFinalizando(false);
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

        {/* Toggle Recibo / NFC-e */}
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

        {/* Painel esquerdo — instrução de bipagem */}
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
                  >
                    ✕
                  </button>
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

      {/* Modal */}
      <ModalProdutos aberto={modalAberto}
      onFechar={() => { setModalAberto(false); inputRef.current?.focus(); }}
      onSelecionar={selecionarProdutoModal}
      />
    </div>
  );
}