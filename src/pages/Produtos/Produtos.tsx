import { useState, useEffect, useRef } from "react";
import { buscarProdutos, contarProdutos, criarProduto, atualizarProduto, buscarSaldosProduto } from "../../services/odoo";
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
  const [produtos, setProdutos]         = useState<Produto[]>([]);
  const [total, setTotal]               = useState(0);
  const [pagina, setPagina]             = useState(0);
  const [busca, setBusca]               = useState("");
  const [carregando, setCarregando]     = useState(true);
  const [modalAberto, setModalAberto]   = useState(false);
  const [editando, setEditando]         = useState<Produto | null>(null);
  const [form, setForm]                 = useState<FormData>(FORM_VAZIO);
  const [salvando, setSalvando]         = useState(false);
  const [saldos, setSaldos]             = useState<SaldoLocal[]>([]);
  const [produtoDetalhe, setProdutoDetalhe] = useState<Produto | null>(null);
  const [mensagem, setMensagem]         = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);
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
      setProdutos(lista as Produto[]);
      setTotal(count);
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
        type:         "consu",
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

  const produtosAlerta    = produtos.filter((p) => p.qty_available > 0 && p.qty_available <= ESTOQUE_BAIXO);
  const produtosNegativos = produtos.filter((p) => p.qty_available < 0);

  return (
    <div className="produtos-container">

      {/* Mensagem */}
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
                    p.qty_available < 0 ? "row-negativo" :
                    p.qty_available <= ESTOQUE_BAIXO && p.qty_available >= 0 ? "row-alerta" : ""
                  }
                  onClick={() => abrirDetalhe(p)}
                >
                  <td className="col-nome">
                    {p.name}
                    {p.qty_available < 0 && <span className="badge badge-negativo">Negativo</span>}
                    {p.qty_available >= 0 && p.qty_available <= ESTOQUE_BAIXO && (
                      <span className="badge badge-baixo">Baixo</span>
                    )}
                  </td>
                  <td className="col-sku">{p.default_code || "—"}</td>
                  <td className="col-barcode">{p.barcode || "—"}</td>
                  <td className="col-preco">R$ {p.list_price.toFixed(2)}</td>
                  <td className={`col-saldo ${p.qty_available < 0 ? "negativo" : ""}`}>
                    {p.qty_available}
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

      {/* Painel de detalhe de saldos */}
      {produtoDetalhe && (
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
            <button
              className="btn-editar-detalhe"
              onClick={() => { setProdutoDetalhe(null); abrirEditar(produtoDetalhe); }}
            >
              ✏️ Editar Produto
            </button>
          </div>
        </div>
      )}
    </div>
  );
}