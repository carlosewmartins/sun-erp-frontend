import { useState, useEffect, useRef } from "react";
import { buscarProdutos, contarProdutos, criarProduto, atualizarProduto, buscarSaldosProduto, ajusteEstoque, ajusteDireto, buscarSaldosTodos } from "../../services/odoo";
import ModalVariantes from "../../components/ui/ModalVariantes";
import { LOCATION_LIST } from "../../constants/locations";
import "./Produtos.css";

interface Produto {
  id: number;
  name: string;
  barcode: string | false;
  default_code: string | false;
  list_price: number;
  qty_available: number;
  uom_id: [number, string] | false;
}

interface SaldoLocal {
  location_id: [number, string];
  quantity: number;
  reserved_quantity: number;
}

interface FormData {
  name: string;
  barcode: string;
  default_code: string;
  list_price: string;
}

const FORM_VAZIO: FormData = { name: "", barcode: "", default_code: "", list_price: "" };
const POR_PAGINA = 50;
const ESTOQUE_BAIXO = 5;

export default function Produtos() {
  const [produtos, setProdutos]             = useState<Produto[]>([]);
  const [total, setTotal]                   = useState(0);
  const [pagina, setPagina]                 = useState(0);
  const [busca, setBusca]                   = useState("");
  const [carregando, setCarregando]         = useState(true);
  const [modalAberto, setModalAberto]       = useState(false);
  const [editando, setEditando]             = useState<Produto | null>(null);
  const [form, setForm]                     = useState<FormData>(FORM_VAZIO);
  const [salvando, setSalvando]             = useState(false);
  const [saldos, setSaldos]                 = useState<SaldoLocal[]>([]);
  const [produtoDetalhe, setProdutoDetalhe] = useState<Produto | null>(null);
  const [mensagem, setMensagem]             = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
  const [modalAjuste, setModalAjuste]       = useState(false);
  const [ajusteTipo, setAjusteTipo]         = useState<"entrada" | "saida" | "direto">("entrada");
  const [ajusteLocal, setAjusteLocal]       = useState<number>(LOCATION_LIST[0].id);
  const [ajusteQtd, setAjusteQtd]           = useState("");
  const [ajustando, setAjustando]           = useState(false);
  const [saldosTotais, setSaldosTotais]     = useState<Record<number, number>>({});
  const [modalVariantes, setModalVariantes] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { carregar("", 0); }, []);

  function exibirMensagem(tipo: "sucesso" | "erro", texto: string) {
    setMensagem({ tipo, texto });
    setTimeout(() => setMensagem(null), 3000);
  }

  async function carregar(termo: string, pag: number) {
    setCarregando(true);
    try {
      const [lista, count] = await Promise.all([
        buscarProdutos(termo, pag * POR_PAGINA, POR_PAGINA),
        contarProdutos(termo),
      ]);
      const produtosList = lista as Produto[];
      setProdutos(produtosList);
      setTotal(count);
      const ids = produtosList.map((p) => p.id);
      const totais = await buscarSaldosTodos(ids);
      setSaldosTotais(totais);
    } catch {
      exibirMensagem("erro", "Erro ao carregar produtos.");
    } finally {
      setCarregando(false);
    }
  }

  function handleBusca(valor: string) {
    setBusca(valor);
    setPagina(0);
    clearTimeout(timerRef.current!);
    timerRef.current = setTimeout(() => carregar(valor, 0), 350);
  }

  function handlePagina(nova: number) {
    setPagina(nova);
    carregar(busca, nova);
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
      exibirMensagem("erro", "Nome do produto é obrigatório.");
      return;
    }
    setSalvando(true);
    try {
      const dados = {
        name:         form.name.trim(),
        barcode:      form.barcode.trim() || undefined,
        default_code: form.default_code.trim() || undefined,
        list_price:   parseFloat(form.list_price) || 0,
        type:         "product",
      };
      if (editando) {
        await atualizarProduto(editando.id, dados);
        exibirMensagem("sucesso", "Produto atualizado com sucesso!");
      } else {
        await criarProduto(dados);
        exibirMensagem("sucesso", "Produto criado com sucesso!");
      }
      setModalAberto(false);
      carregar(busca, pagina);
    } catch {
      exibirMensagem("erro", "Erro ao salvar produto.");
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarAjuste() {
    if (!produtoDetalhe) return;
    if (!ajusteQtd || parseFloat(ajusteQtd) <= 0) {
      exibirMensagem("erro", "Informe uma quantidade válida.");
      return;
    }
    setAjustando(true);
    try {
      const qtd = parseFloat(ajusteQtd);
      let resultado;
      if (ajusteTipo === "direto") {
        resultado = await ajusteDireto(produtoDetalhe.id, ajusteLocal, qtd);
      } else {
        resultado = await ajusteEstoque(produtoDetalhe.id, ajusteLocal, qtd, ajusteTipo);
      }
      if (resultado.sucesso) {
        exibirMensagem("sucesso", "✅ Estoque ajustado com sucesso!");
        setModalAjuste(false);
        setAjusteQtd("");
        const s = await buscarSaldosProduto(produtoDetalhe.id);
        setSaldos(s as SaldoLocal[]);
        carregar(busca, pagina);
      } else {
        exibirMensagem("erro", resultado.erro ?? "Erro ao ajustar estoque.");
      }
    } catch {
      exibirMensagem("erro", "Erro ao ajustar estoque.");
    } finally {
      setAjustando(false);
    }
  }

  const produtosAlerta    = produtos.filter((p) => {
    const s = saldosTotais[p.id] ?? 0;
    return s > 0 && s <= ESTOQUE_BAIXO;
  });
  const produtosNegativos = produtos.filter((p) => (saldosTotais[p.id] ?? 0) < 0);

  return (
    <div className="produtos-container">

      {mensagem && (
        <div className={`mensagem mensagem-${mensagem.tipo}`}>{mensagem.texto}</div>
      )}

      {/* Header */}
      <div className="produtos-header">
        <h2>Produtos e Estoque</h2>
        <button className="btn-novo" onClick={abrirNovo}>+ Novo Produto</button>
      </div>

      {/* Alertas */}
      {(produtosNegativos.length > 0 || produtosAlerta.length > 0) && (
        <div className="alertas-wrap">
          {produtosNegativos.length > 0 && (
            <div className="alerta alerta-critico">
              ⚠️ {produtosNegativos.length} produto(s) com saldo negativo
            </div>
          )}
          {produtosAlerta.length > 0 && (
            <div className="alerta alerta-baixo">
              🔔 {produtosAlerta.length} produto(s) com estoque baixo (≤ {ESTOQUE_BAIXO} un)
            </div>
          )}
        </div>
      )}

      {/* Busca */}
      <div className="produtos-filtros">
        <input
          type="text"
          placeholder="Buscar por nome, código de barras ou SKU..."
          value={busca}
          onChange={(e) => handleBusca(e.target.value)}
          className="filtro-busca"
        />
        <span className="total-info">{total} produtos</span>
      </div>

      {/* Tabela */}
      <div className="tabela-wrap">
        <table className="tabela-produtos">
          <thead>
            <tr>
              <th>Nome</th>
              <th>SKU</th>
              <th>Cód. Barras</th>
              <th>Preço</th>
              <th>Em estoque</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr><td colSpan={6} className="tabela-vazia">Carregando...</td></tr>
            ) : produtos.length === 0 ? (
              <tr><td colSpan={6} className="tabela-vazia">Nenhum produto encontrado</td></tr>
            ) : (
              produtos.map((p) => (
                <tr
                  key={p.id}
                  className={
                    (saldosTotais[p.id] ?? 0) < 0 ? "row-negativo" :
                    (saldosTotais[p.id] ?? 0) <= ESTOQUE_BAIXO ? "row-alerta" : ""
                  }
                  onClick={() => abrirDetalhe(p)}
                >
                  <td className="col-nome">
                    {p.name}
                    {(saldosTotais[p.id] ?? 0) < 0 && <span className="badge badge-negativo">Negativo</span>}
                    {(saldosTotais[p.id] ?? 0) >= 0 && (saldosTotais[p.id] ?? 0) <= ESTOQUE_BAIXO && (
                      <span className="badge badge-baixo">Baixo</span>
                    )}
                  </td>
                  <td className="col-sku">{p.default_code || "—"}</td>
                  <td className="col-barcode">{p.barcode || "—"}</td>
                  <td className="col-preco">R$ {p.list_price.toFixed(2)}</td>
                  <td className={`col-saldo ${(saldosTotais[p.id] ?? 0) < 0 ? "negativo" : ""}`}>
                    {saldosTotais[p.id] ?? 0}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn-editar" onClick={() => abrirEditar(p)}>✏️ Editar</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="paginacao">
        <button onClick={() => handlePagina(pagina - 1)} disabled={pagina === 0}>← Anterior</button>
        <span>Página {pagina + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span>
        <button onClick={() => handlePagina(pagina + 1)} disabled={(pagina + 1) * POR_PAGINA >= total}>Próxima →</button>
      </div>

      {/* Modal de cadastro/edição */}
      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-form-header">
              <h3>{editando ? "Editar Produto" : "Novo Produto"}</h3>
              <button className="modal-fechar" onClick={() => setModalAberto(false)}>✕</button>
            </div>
            <div className="modal-form-body">
              <div className="campo">
                <label>Nome *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Nome do produto"
                  autoFocus
                />
              </div>
              <div className="campo-grupo">
                <div className="campo">
                  <label>SKU / Referência</label>
                  <input
                    type="text"
                    value={form.default_code}
                    onChange={(e) => setForm({ ...form, default_code: e.target.value })}
                    placeholder="Ex: PROD-001"
                  />
                </div>
                <div className="campo">
                  <label>Código de Barras</label>
                  <input
                    type="text"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="Ex: 7891234567890"
                  />
                </div>
              </div>
              <div className="campo">
                <label>Preço de Venda (R$)</label>
                <input
                  type="number"
                  value={form.list_price}
                  onChange={(e) => setForm({ ...form, list_price: e.target.value })}
                  placeholder="0,00"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div className="modal-form-footer">
              <button className="btn-cancelar" onClick={() => setModalAberto(false)}>Cancelar</button>
              <button className="btn-salvar" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : editando ? "💾 Salvar" : "✅ Criar Produto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalhe */}
      {produtoDetalhe && !modalAjuste && !modalVariantes && (
        <div className="modal-overlay" onClick={() => setProdutoDetalhe(null)}>
          <div className="modal-detalhe" onClick={(e) => e.stopPropagation()}>
            <div className="modal-form-header">
              <h3>{produtoDetalhe.name}</h3>
              <button className="modal-fechar" onClick={() => setProdutoDetalhe(null)}>✕</button>
            </div>
            <div className="detalhe-info">
              <div className="detalhe-campo">
                <span>SKU</span>
                <strong>{produtoDetalhe.default_code || "—"}</strong>
              </div>
              <div className="detalhe-campo">
                <span>Barcode</span>
                <strong>{produtoDetalhe.barcode || "—"}</strong>
              </div>
              <div className="detalhe-campo">
                <span>Preço</span>
                <strong>R$ {produtoDetalhe.list_price.toFixed(2)}</strong>
              </div>
            </div>
            <h4>Saldo por Localização</h4>
            <div className="detalhe-saldos">
              {saldos.length === 0 ? (
                <p className="tabela-vazia">Sem saldo registrado</p>
              ) : (
                saldos.map((s) => (
                  <div key={s.location_id[0]} className="saldo-linha">
                    <span>{s.location_id[1].replace("Physical Locations/", "").replace("WH/", "")}</span>
                    <strong className={s.quantity < 0 ? "negativo" : ""}>{s.quantity} un</strong>
                  </div>
                ))
              )}
            </div>
            <div className="detalhe-botoes">
              <button
                className="btn-ajustar"
                onClick={() => {
                  setAjusteLocal(LOCATION_LIST[0].id);
                  setAjusteQtd("");
                  setAjusteTipo("entrada");
                  setModalAjuste(true);
                }}
              >
                ⚙️ Ajustar Estoque
              </button>
              <button
                className="btn-variantes"
                onClick={() => setModalVariantes(true)}
              >
                🎨 Variantes
              </button>
              <button
                className="btn-editar-detalhe"
                onClick={() => { setProdutoDetalhe(null); abrirEditar(produtoDetalhe); }}
              >
                ✏️ Editar Produto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de ajuste */}
      {modalAjuste && produtoDetalhe && (
        <div className="modal-overlay" style={{ zIndex: 600 }} onClick={() => setModalAjuste(false)}>
          <div className="modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-form-header">
              <h3>⚙️ Ajustar Estoque</h3>
              <button className="modal-fechar" onClick={() => setModalAjuste(false)}>✕</button>
            </div>
            <div className="modal-form-body">
              <div className="campo">
                <label>Produto</label>
                <div className="campo-readonly">{produtoDetalhe.name}</div>
              </div>
              <div className="campo">
                <label>Localização</label>
                <select
                  value={ajusteLocal}
                  onChange={(e) => setAjusteLocal(Number(e.target.value))}
                  className="campo-select"
                >
                  {LOCATION_LIST.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label>Tipo de Ajuste</label>
                <div className="tipo-ajuste-grupo">
                  {[
                    { valor: "entrada", label: "📥 Entrada avulsa" },
                    { valor: "saida",   label: "📤 Saída avulsa" },
                    { valor: "direto",  label: "🎯 Ajuste direto" },
                  ].map((op) => (
                    <button
                      key={op.valor}
                      className={`tipo-ajuste-btn ${ajusteTipo === op.valor ? "ativo" : ""}`}
                      onClick={() => setAjusteTipo(op.valor as "entrada" | "saida" | "direto")}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="campo">
                <label>
                  {ajusteTipo === "direto" ? "Quantidade final desejada" :
                   ajusteTipo === "entrada" ? "Quantidade a adicionar" :
                   "Quantidade a remover"}
                </label>
                <input
                  type="number"
                  value={ajusteQtd}
                  onChange={(e) => setAjusteQtd(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="1"
                  autoFocus
                />
                {saldos.find(s => s.location_id[0] === ajusteLocal) && (
                  <span className="saldo-atual-hint">
                    Saldo atual: {saldos.find(s => s.location_id[0] === ajusteLocal)?.quantity ?? 0} un
                  </span>
                )}
              </div>
            </div>
            <div className="modal-form-footer">
              <button className="btn-cancelar" onClick={() => setModalAjuste(false)}>Cancelar</button>
              <button className="btn-salvar" onClick={confirmarAjuste} disabled={ajustando}>
                {ajustando ? "Ajustando..." : "✅ Confirmar Ajuste"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de variantes */}
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