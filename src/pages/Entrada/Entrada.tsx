import { useState, useRef, useEffect } from "react";
import { buscarPorBarcode, entradaManual, entradaComNFe, entradaApenasNFe, criarEBuscarProduto } from "../../services/odoo";
import { Produto } from "../../types";
import "./Entrada.css";

interface ItemEntrada {
  produto: Produto;
  quantidade: number;
}

interface ProdutoNFe {
  nome: string;
  barcode: string;
  quantidade: number;
  produto?: Produto;
  encontrado: boolean;
}

interface FormCadastro {
  name: string;
  barcode: string;
  default_code: string;
  list_price: string;
}

export default function Entrada() {
  const [modo, setModo]                         = useState<"manual" | "xml">("manual");
  const [itens, setItens]                       = useState<ItemEntrada[]>([]);
  const [barcodeBuffer, setBarcodeBuffer]       = useState("");
  const [buscando, setBuscando]                 = useState(false);
  const [processando, setProcessando]           = useState(false);
  const [mensagem, setMensagem]                 = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [xmlItens, setXmlItens]                 = useState<ProdutoNFe[]>([]);
  const [xmlCarregado, setXmlCarregado]         = useState(false);
  const [fornecedor, setFornecedor]             = useState("");
  const [entradaFisica, setEntradaFisica]       = useState(true);
  const [modalCadastro, setModalCadastro]       = useState(false);
  const [itemCadastrando, setItemCadastrando]   = useState<number | null>(null);
  const [formCadastro, setFormCadastro]         = useState<FormCadastro>({ name: "", barcode: "", default_code: "", list_price: "" });
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (modo === "manual") {
      const refocus = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" && target !== inputRef.current) return;
        if (target.tagName === "BUTTON") return;
        inputRef.current?.focus();
      };
      document.addEventListener("click", refocus);
      inputRef.current?.focus();
      return () => document.removeEventListener("click", refocus);
    }
  }, [modo]);

  function exibirMensagem(tipo: "sucesso" | "erro", texto: string) {
    setMensagem({ tipo, texto });
    setTimeout(() => setMensagem(null), 3000);
  }

  // ── Modo Manual ──────────────────────────────────────────────────────────

  async function processarBarcode(barcode: string) {
    if (!barcode || buscando) return;
    setBuscando(true);
    try {
      const produto = await buscarPorBarcode(barcode);
      if (!produto) {
        exibirMensagem("erro", `Produto não encontrado: ${barcode}`);
        return;
      }
      setItens((prev) => {
        const existente = prev.find((i) => i.produto.id === produto.id);
        if (existente) {
          return prev.map((i) =>
            i.produto.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
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

  function setQuantidadeDigitada(produtoId: number, valor: string) {
    const qtd = parseInt(valor);
    if (isNaN(qtd) || qtd < 1) return;
    setItens((prev) =>
      prev.map((i) => i.produto.id === produtoId ? { ...i, quantidade: qtd } : i)
    );
  }

  async function confirmarEntradaManual() {
    if (itens.length === 0) { exibirMensagem("erro", "Nenhum item adicionado."); return; }
    setProcessando(true);
    try {
      for (const item of itens) {
        const resultado = await entradaManual(item.produto.id, item.quantidade);
        if (!resultado.sucesso) {
          exibirMensagem("erro", `Erro em ${item.produto.name}: ${resultado.erro}`);
          return;
        }
      }
      exibirMensagem("sucesso", "✅ Entrada registrada com sucesso!");
      setItens([]);
    } catch {
      exibirMensagem("erro", "Erro ao registrar entrada.");
    } finally {
      setProcessando(false);
    }
  }

  // ── Modo XML ─────────────────────────────────────────────────────────────

  async function processarXML(file: File) {
    try {
      const texto = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(texto, "text/xml");

      const emitNome = doc.querySelector("emit > xNome")?.textContent ?? "Fornecedor desconhecido";
      setFornecedor(emitNome);

      const detNodes = doc.querySelectorAll("det");
      const itensParsed: ProdutoNFe[] = [];

      for (const det of detNodes) {
        const nome       = det.querySelector("xProd")?.textContent ?? "";
        const barcode    = det.querySelector("cEAN")?.textContent ?? "";
        const qtdStr     = det.querySelector("qCom")?.textContent ?? "0";
        const quantidade = parseFloat(qtdStr);
        itensParsed.push({ nome, barcode, quantidade, encontrado: false });
      }

      const itensComProduto = await Promise.all(
        itensParsed.map(async (item) => {
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
      exibirMensagem("erro", "Erro ao processar XML. Verifique se é uma NF-e válida.");
    }
  }

  async function confirmarEntradaXML() {
    const encontrados = xmlItens.filter((i) => i.encontrado && i.produto);
    if (encontrados.length === 0) {
      exibirMensagem("erro", "Nenhum produto foi encontrado no sistema.");
      return;
    }

    setProcessando(true);
    try {
      for (const item of encontrados) {
        const resultado = entradaFisica
          ? await entradaComNFe(item.produto!.id, item.quantidade)
          : await entradaApenasNFe(item.produto!.id, item.quantidade);

        if (!resultado.sucesso) {
          exibirMensagem("erro", `Erro em ${item.nome}: ${resultado.erro}`);
          return;
        }
      }
      exibirMensagem("sucesso", `✅ ${encontrados.length} produto(s) registrados!`);
      setXmlItens([]);
      setXmlCarregado(false);
      setFornecedor("");
      setEntradaFisica(true);
    } catch {
      exibirMensagem("erro", "Erro ao registrar entrada.");
    } finally {
      setProcessando(false);
    }
  }

  // ── Cadastro Rápido ───────────────────────────────────────────────────────

  async function salvarCadastroRapido() {
    if (!formCadastro.name.trim()) {
      exibirMensagem("erro", "Nome é obrigatório.");
      return;
    }
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
        setXmlItens((prev) => prev.map((item, i) =>
          i === itemCadastrando
            ? { ...item, produto, encontrado: true }
            : item
        ));
        exibirMensagem("sucesso", `✅ ${produto.name} cadastrado e vinculado!`);
      } else {
        exibirMensagem("erro", "Produto criado mas não encontrado. Verifique o barcode.");
      }

      setModalCadastro(false);
      setItemCadastrando(null);
    } catch {
      exibirMensagem("erro", "Erro ao cadastrar produto.");
    } finally {
      setSalvandoCadastro(false);
    }
  }

  const naoEncontrados = xmlItens.filter((i) => !i.encontrado).length;

  return (
    <div className="entrada-container">

      <input
        ref={inputRef}
        className="barcode-input"
        value={barcodeBuffer}
        onChange={(e) => setBarcodeBuffer(e.target.value)}
        onKeyDown={handleKeyDown}
        readOnly={buscando || modo === "xml"}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".xml"
        style={{ display: "none" }}
        onChange={(e) => {
          if (e.target.files?.[0]) processarXML(e.target.files[0]);
          e.target.value = "";
        }}
      />

      {mensagem && (
        <div className={`mensagem mensagem-${mensagem.tipo}`}>{mensagem.texto}</div>
      )}

      {/* Header */}
      <div className="entrada-header">
        <h2>Entrada de Mercadoria</h2>
        <div className="modo-toggle">
          <button
            className={modo === "manual" ? "toggle-btn active" : "toggle-btn"}
            onClick={() => { setModo("manual"); setXmlCarregado(false); setXmlItens([]); }}
          >
            ⌨️ Manual
          </button>
          <button
            className={modo === "xml" ? "toggle-btn active xml" : "toggle-btn"}
            onClick={() => setModo("xml")}
          >
            📄 XML NF-e
          </button>
        </div>
      </div>

      {/* ── MODO MANUAL ── */}
      {modo === "manual" && (
        <div className="entrada-body">
          <div className="entrada-scanner">
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

          <div className="entrada-itens">
            <h3>Itens para dar entrada</h3>
            {itens.length === 0 ? (
              <div className="itens-vazio">Nenhum item adicionado</div>
            ) : (
              <div className="itens-lista">
                {itens.map((item) => (
                  <div key={item.produto.id} className="entrada-item">
                    <div className="item-nome">{item.produto.name}</div>
                    <div className="item-controles">
                      <button onClick={() => alterarQuantidade(item.produto.id, -1)}>−</button>
                      <input
                        type="number"
                        value={item.quantidade}
                        onChange={(e) => setQuantidadeDigitada(item.produto.id, e.target.value)}
                        className="qtd-input"
                        min="1"
                      />
                      <button onClick={() => alterarQuantidade(item.produto.id, +1)}>+</button>
                    </div>
                    <button
                      className="item-remover"
                      onClick={() => setItens((prev) => prev.filter((i) => i.produto.id !== item.produto.id))}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            <div className="entrada-footer">
              <button
                className="btn-confirmar"
                onClick={confirmarEntradaManual}
                disabled={processando || itens.length === 0}
              >
                {processando ? "Processando..." : "📥 Confirmar Entrada"}
              </button>
              {itens.length > 0 && (
                <button className="btn-cancelar" onClick={() => setItens([])}>
                  🗑️ Cancelar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODO XML ── */}
      {modo === "xml" && (
        <div className="xml-container">
          {!xmlCarregado ? (
            <div className="xml-upload" onClick={() => fileRef.current?.click()}>
              <div className="upload-icon">📄</div>
              <p>Clique para selecionar o XML da NF-e</p>
              <p className="scanner-hint">Arquivos .xml</p>
            </div>
          ) : (
            <div className="xml-resultado">
              <div className="xml-info">
                <span>Fornecedor: <strong>{fornecedor}</strong></span>
                <span>
                  {xmlItens.filter(i => i.encontrado).length} de {xmlItens.length} produtos encontrados
                  {naoEncontrados > 0 && (
                    <span className="xml-aviso"> · ⚠️ {naoEncontrados} não encontrado(s)</span>
                  )}
                </span>
              </div>

              <div className="entrada-opcao">
                <p>Deseja dar entrada também no estoque físico (WH/Estoque)?</p>
                <div className="opcao-grupo">
                  <label className={`opcao-btn ${!entradaFisica ? "ativo" : ""}`}>
                    <input
                      type="radio"
                      name="entradaFisica"
                      checked={!entradaFisica}
                      onChange={() => setEntradaFisica(false)}
                    />
                    Não — apenas Fiscal
                  </label>
                  <label className={`opcao-btn ${entradaFisica ? "ativo" : ""}`}>
                    <input
                      type="radio"
                      name="entradaFisica"
                      checked={entradaFisica}
                      onChange={() => setEntradaFisica(true)}
                    />
                    Sim — WH/Estoque + Fiscal
                  </label>
                </div>
              </div>

              <div className="tabela-wrap">
                <table className="tabela-xml">
                  <thead>
                    <tr>
                      <th>Produto na Nota</th>
                      <th>Barcode</th>
                      <th>Qtd</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {xmlItens.map((item, i) => (
                      <tr key={i} className={item.encontrado ? "" : "row-nao-encontrado"}>
                        <td>{item.encontrado ? item.produto!.name : item.nome}</td>
                        <td className="col-barcode">{item.barcode || "—"}</td>
                        <td className="col-qtd">{item.quantidade}</td>
                        <td>
                          {item.encontrado ? (
                            <span className="badge-encontrado">✅ Encontrado</span>
                          ) : (
                            <div className="nao-encontrado-acoes">
                              <span className="badge-nao-encontrado">⚠️ Não encontrado</span>
                              <button
                                className="btn-cadastrar-rapido"
                                onClick={() => {
                                  setItemCadastrando(i);
                                  setFormCadastro({
                                    name:         item.nome,
                                    barcode:      item.barcode !== "SEM GTIN" ? item.barcode : "",
                                    default_code: "",
                                    list_price:   "",
                                  });
                                  setModalCadastro(true);
                                }}
                              >
                                + Cadastrar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="xml-footer">
                <button
                  className="btn-cancelar"
                  onClick={() => {
                    setXmlCarregado(false);
                    setXmlItens([]);
                    setFornecedor("");
                    setEntradaFisica(true);
                  }}
                >
                  🗑️ Cancelar
                </button>
                <button
                  className="btn-confirmar"
                  onClick={confirmarEntradaXML}
                  disabled={processando || xmlItens.filter(i => i.encontrado).length === 0}
                >
                  {processando
                    ? "Processando..."
                    : `📥 Confirmar ${xmlItens.filter(i => i.encontrado).length} produto(s)`
                  }
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal cadastro rápido */}
      {modalCadastro && (
        <div className="modal-overlay" onClick={() => setModalCadastro(false)}>
          <div className="modal-cadastro" onClick={(e) => e.stopPropagation()}>
            <div className="modal-cadastro-header">
              <h3>Cadastrar Produto</h3>
              <button className="modal-fechar" onClick={() => setModalCadastro(false)}>✕</button>
            </div>
            <div className="modal-cadastro-body">
              <div className="campo">
                <label>Nome *</label>
                <input
                  type="text"
                  value={formCadastro.name}
                  onChange={(e) => setFormCadastro({ ...formCadastro, name: e.target.value })}
                  autoFocus
                />
              </div>
              <div className="campo-grupo">
                <div className="campo">
                  <label>SKU</label>
                  <input
                    type="text"
                    value={formCadastro.default_code}
                    onChange={(e) => setFormCadastro({ ...formCadastro, default_code: e.target.value })}
                    placeholder="Ex: PROD-001"
                  />
                </div>
                <div className="campo">
                  <label>Código de Barras</label>
                  <input
                    type="text"
                    value={formCadastro.barcode}
                    onChange={(e) => setFormCadastro({ ...formCadastro, barcode: e.target.value })}
                  />
                </div>
              </div>
              <div className="campo">
                <label>Preço de Venda (R$)</label>
                <input
                  type="number"
                  value={formCadastro.list_price}
                  onChange={(e) => setFormCadastro({ ...formCadastro, list_price: e.target.value })}
                  placeholder="0,00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="modal-cadastro-footer">
              <button className="btn-cancelar" onClick={() => setModalCadastro(false)}>
                Cancelar
              </button>
              <button
                className="btn-salvar"
                onClick={salvarCadastroRapido}
                disabled={salvandoCadastro}
              >
                {salvandoCadastro ? "Cadastrando..." : "✅ Cadastrar e Incluir"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}