import { useState, useRef, useEffect } from "react";
import { buscarPorBarcode, buscarSaldoPorLocal, transferirEntreGalpoes } from "../../services/odoo";
import { Produto, SaldoLocalização } from "../../types";
import { LOCATION_LIST } from "../../constants/locations";
import "./Transferencia.css";

interface ItemTransferencia {
  produto: Produto;
  quantidade: number;
}

export default function Transferencia() {
  const [origemId, setOrigemId]       = useState<number>(LOCATION_LIST[0].id);
  const [destinoId, setDestinoId]     = useState<number>(LOCATION_LIST[1].id);
  const [itens, setItens]             = useState<ItemTransferencia[]>([]);
  const [barcodeBuffer, setBarcodeBuffer] = useState("");
  const [buscando, setBuscando]       = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [produtoAtivo, setProdutoAtivo] = useState<Produto | null>(null);
  const [saldos, setSaldos]           = useState<SaldoLocalização[]>([]);
  const [mensagem, setMensagem]       = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refocus = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Não refoca se o clique foi em um select ou option
      if (target.tagName === "SELECT" || target.tagName === "OPTION") return;
      inputRef.current?.focus();
    };
    document.addEventListener("click", refocus);
    inputRef.current?.focus();
    return () => document.removeEventListener("click", refocus);
  }, []);
  
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

      // Busca saldo por localização
      const saldosProduto = await buscarSaldoPorLocal(produto.id);
      setSaldos(saldosProduto);
      setProdutoAtivo(produto);

      // Adiciona ou incrementa na lista
      setItens((prev) => {
        const existente = prev.find((i) => i.produto.id === produto.id);
        if (existente) {
          return prev.map((i) =>
            i.produto.id === produto.id
              ? { ...i, quantidade: i.quantidade + 1 }
              : i
          );
        }
        return [...prev, { produto, quantidade: 1 }];
      });

      exibirMensagem("sucesso", `✅ ${produto.name} adicionado`);
    } catch {
      exibirMensagem("erro", "Erro ao buscar produto.");
    } finally {
      setBuscando(false);
      setBarcodeBuffer("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") processarBarcode(barcodeBuffer.trim());
  }

  function alterarQuantidade(produtoId: number, delta: number) {
    setItens((prev) =>
      prev
        .map((i) => i.produto.id === produtoId ? { ...i, quantidade: i.quantidade + delta } : i)
        .filter((i) => i.quantidade > 0)
    );
  }

  function removerItem(produtoId: number) {
    setItens((prev) => prev.filter((i) => i.produto.id !== produtoId));
    if (produtoAtivo?.id === produtoId) {
      setProdutoAtivo(null);
      setSaldos([]);
    }
  }

  async function confirmarTransferencia() {
    if (itens.length === 0) {
      exibirMensagem("erro", "Nenhum item adicionado.");
      return;
    }
    if (origemId === destinoId) {
      exibirMensagem("erro", "Origem e destino não podem ser iguais.");
      return;
    }

    setTransferindo(true);

    try {
      for (const item of itens) {
        const resultado = await transferirEntreGalpoes(
          item.produto.id,
          item.quantidade,
          origemId,
          destinoId
        );

        if (!resultado.sucesso) {
          exibirMensagem("erro", `Erro em ${item.produto.name}: ${resultado.erro}`);
          return;
        }
      }

      exibirMensagem("sucesso", "✅ Transferência concluída com sucesso!");
      setItens([]);
      setProdutoAtivo(null);
      setSaldos([]);
    } catch {
      exibirMensagem("erro", "Erro ao realizar transferência.");
    } finally {
      setTransferindo(false);
    }
  }

  const saldoOrigem = saldos.find((s) => s.location_id[0] === origemId);

  return (
    <div className="trans-container">

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

      <h2>Transferência entre Galpões</h2>

      {/* Seleção de origem e destino */}
      <div className="trans-rota">
        <div className="rota-select">
          <label>Origem</label>
          <select
            value={origemId}
            onChange={(e) => setOrigemId(Number(e.target.value))}
          >
            {LOCATION_LIST.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>

        <div className="rota-seta">→</div>

        <div className="rota-select">
          <label>Destino</label>
          <select
            value={destinoId}
            onChange={(e) => setDestinoId(Number(e.target.value))}
          >
            {LOCATION_LIST.map((loc) => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="trans-body">

        {/* Painel esquerdo — scanner + saldo */}
        <div className="trans-scanner">
          {buscando ? (
            <div className="scanner-buscando">
              <div className="spinner" />
              <p>Buscando produto...</p>
            </div>
          ) : (
            <div className="scanner-idle">
              <div className="scanner-icon">▐▌</div>
              <p>Bipe o produto</p>
              <p className="scanner-hint">e pressione Enter</p>
              <div className="barcode-display">
                {barcodeBuffer || <span className="placeholder">aguardando...</span>}
              </div>
            </div>
          )}

          {/* Saldo do produto ativo na origem */}
          {produtoAtivo && (
            <div className="saldo-card">
              <div className="saldo-nome">{produtoAtivo.name}</div>
              <div className="saldo-info">
                <span>Saldo na origem:</span>
                <strong
                  className={
                    (saldoOrigem?.quantity ?? 0) <= 0 ? "saldo-negativo" : "saldo-ok"
                  }
                >
                  {saldoOrigem?.quantity ?? 0} un
                </strong>
              </div>
              <div className="saldo-todos">
                {saldos.map((s) => (
                  <div key={s.location_id[0]} className="saldo-linha">
                    <span>{s.location_id[1].replace("Physical Locations/", "")}</span>
                    <span>{s.quantity} un</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Painel direito — lista de itens */}
        <div className="trans-itens">
          <h3>Itens para transferir</h3>

          {itens.length === 0 ? (
            <div className="itens-vazio">Nenhum item adicionado</div>
          ) : (
            <div className="itens-lista">
              {itens.map((item) => (
                <div key={item.produto.id} className="trans-item">
                  <div className="item-nome">{item.produto.name}</div>
                  <div className="item-controles">
                    <button onClick={() => alterarQuantidade(item.produto.id, -1)}>−</button>
                    <span>{item.quantidade}</span>
                    <button onClick={() => alterarQuantidade(item.produto.id, +1)}>+</button>
                  </div>
                  <button
                    className="item-remover"
                    onClick={() => removerItem(item.produto.id)}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          <div className="trans-footer">
            <button
              className="btn-confirmar"
              onClick={confirmarTransferencia}
              disabled={transferindo || itens.length === 0 || origemId === destinoId}
            >
              {transferindo ? "Transferindo..." : "🔀 Confirmar Transferência"}
            </button>
            {itens.length > 0 && (
              <button
                className="btn-cancelar"
                onClick={() => { setItens([]); setProdutoAtivo(null); setSaldos([]); }}
                disabled={transferindo}
              >
                🗑️ Cancelar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}