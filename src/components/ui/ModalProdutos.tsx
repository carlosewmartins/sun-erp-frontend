import { useState, useEffect, useRef } from "react";
import { Produto } from "../../types";
import { execute } from "../../services/odoo";
import "./ModalProdutos.css";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  onSelecionar: (produto: Produto) => void;
}

export default function ModalProdutos({ aberto, onFechar, onSelecionar }: Props) {
  const [busca, setBusca]           = useState("");
  const [produtos, setProdutos]     = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [pagina, setPagina]         = useState(0);
  const [total, setTotal]           = useState(0);
  const buscaRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const POR_PAGINA = 50;

  useEffect(() => {
    if (aberto) {
      setBusca("");
      setPagina(0);
      setTimeout(() => buscaRef.current?.focus(), 100);
      buscarProdutos("", 0);
    }
  }, [aberto]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onFechar]);

  async function buscarProdutos(termo: string, pag: number) {
    setCarregando(true);
    try {
      const domain = termo
        ? ["|", "|",
            ["name",         "ilike", termo],
            ["barcode",      "=",     termo],
            ["default_code", "ilike", termo],
          ]
        : [];
  
      const resultado = await execute(
        "product.product",
        "search_read",
        [domain],
        {
          fields: ["id", "name", "barcode", "default_code", "list_price", "qty_available"],
          limit:  POR_PAGINA,
          offset: pag * POR_PAGINA,
          order:  "name asc",
        }
      );
  
      setProdutos(resultado ?? []);
  
      const count = await execute(
        "product.product",
        "search_count",
        [domain]
      );
  
      setTotal(count ?? 0);
  
    } catch {
      setProdutos([]);
    } finally {
      setCarregando(false);
    }
  }

  function handleBusca(valor: string) {
    setBusca(valor);
    setPagina(0);
    clearTimeout(timerRef.current!);
    timerRef.current = setTimeout(() => buscarProdutos(valor, 0), 350);
  }

  function handlePagina(nova: number) {
    setPagina(nova);
    buscarProdutos(busca, nova);
  }

  if (!aberto) return null;

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2>Produtos Cadastrados</h2>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        {/* Busca */}
        <div className="modal-busca">
          <input
            ref={buscaRef}
            type="text"
            placeholder="Buscar por nome, código de barras ou SKU..."
            value={busca}
            onChange={(e) => handleBusca(e.target.value)}
          />
          {carregando && <div className="busca-spinner" />}
        </div>

        {/* Tabela */}
        <div className="modal-tabela-wrap">
          <table className="modal-tabela">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nome</th>
                <th>Cód. Barras</th>
                <th>Preço</th>
                <th>Em estoque</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {produtos.length === 0 && !carregando ? (
                <tr>
                  <td colSpan={6} className="tabela-vazia">
                    Nenhum produto encontrado
                  </td>
                </tr>
              ) : (
                produtos.map((p) => (
                  <tr key={p.id} onClick={() => { onSelecionar(p); onFechar(); }}>
                    <td className="col-sku">{p.default_code || "—"}</td>
                    <td className="col-nome">{p.name}</td>
                    <td className="col-barcode">{p.barcode || "—"}</td>
                    <td className="col-preco">R$ {(p.list_price ?? 0).toFixed(2)}</td>
                    <td className="col-qtd">{p.qty_available ?? 0} un</td>
                    <td>
                      <button className="btn-selecionar">Selecionar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="modal-footer">
          <span>{total} produtos encontrados</span>
          <div className="paginacao">
            <button
              onClick={() => handlePagina(pagina - 1)}
              disabled={pagina === 0}
            >← Anterior</button>
            <span>Página {pagina + 1} de {Math.max(1, Math.ceil(total / POR_PAGINA))}</span>
            <button
              onClick={() => handlePagina(pagina + 1)}
              disabled={(pagina + 1) * POR_PAGINA >= total}
            >Próxima →</button>
          </div>
        </div>

      </div>
    </div>
  );
}