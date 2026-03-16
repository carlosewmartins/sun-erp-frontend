import { useState, useEffect } from "react";
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
import "./ModalVariantes.css";

interface Props {
  templateId: number;
  templateNome: string;
  precoBase: number;
  onFechar: () => void;
}

interface AtributoGlobal {
  id: number;
  name: string;
  values: { id: number; name: string }[];
}

interface LinhaAtributo {
  id: number;
  attribute_id: [number, string];
  value_ids: number[];
  product_template_value_ids: number[];
}

interface TemplateAttrValue {
  id: number;
  name: string;
  attribute_id: [number, string];
  product_attribute_value_id: [number, string];
  ptav_active: boolean;
}

interface Variante {
  id: number;
  name: string;
  default_code: string | false;
  barcode: string | false;
  list_price: number;
  qty_available: number;
  product_template_attribute_value_ids: number[];
}

interface FormVariante {
  default_code: string;
  barcode: string;
  list_price: string;
}

type Aba = "atributos" | "variantes";

export default function ModalVariantes({ templateId, templateNome, precoBase, onFechar }: Props) {
  const [aba, setAba]                             = useState<Aba>("atributos");
  const [atributosGlobais, setAtributosGlobais]   = useState<AtributoGlobal[]>([]);
  const [linhasAtributo, setLinhasAtributo]       = useState<LinhaAtributo[]>([]);
  const [tavs, setTavs]                           = useState<TemplateAttrValue[]>([]);
  const [variantes, setVariantes]                 = useState<Variante[]>([]);
  const [formsVariante, setFormsVariante]         = useState<Record<number, FormVariante>>({});
  const [carregando, setCarregando]               = useState(true);
  const [salvando, setSalvando]                   = useState(false);
  const [mensagem, setMensagem]                   = useState<{ tipo: "sucesso" | "erro"; texto: string } | null>(null);

  // Modal adicionar atributo
  const [modalAttr, setModalAttr]                 = useState(false);
  const [attrSelecionado, setAttrSelecionado]     = useState<number | "novo">(0);
  const [novoAttrNome, setNovoAttrNome]           = useState("");
  const [valoresSelecionados, setValoresSelecionados] = useState<number[]>([]);
  const [novosValores, setNovosValores]           = useState<string[]>([""]);
  const [adicionandoAttr, setAdicionandoAttr]     = useState(false);

  // Modal adicionar variante
  const [modalVariante, setModalVariante]         = useState(false);
  const [tavsSelecionados, setTavsSelecionados]   = useState<Record<number, number>>({}); // attrId → tavId
  const [formNovaVariante, setFormNovaVariante]   = useState<FormVariante>({ default_code: "", barcode: "", list_price: "" });
  const [adicionandoVariante, setAdicionandoVariante] = useState(false);

  useEffect(() => { carregar(); }, []);

  function exibirMensagem(tipo: "sucesso" | "erro", texto: string) {
    setMensagem({ tipo, texto });
    setTimeout(() => setMensagem(null), 3000);
  }

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

      // Inicializa forms das variantes
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
      exibirMensagem("erro", "Erro ao carregar dados do produto.");
    } finally {
      setCarregando(false);
    }
  }

  // ── Atributos ────────────────────────────────────────────────────────────

  async function confirmarAdicionarAtributo() {
    if (adicionandoAttr) return;
    setAdicionandoAttr(true);
    try {
      let attributeId: number;
      let valueIds: number[] = [...valoresSelecionados];

      if (attrSelecionado === "novo") {
        if (!novoAttrNome.trim()) {
          exibirMensagem("erro", "Nome do atributo é obrigatório.");
          return;
        }
        attributeId = await criarAtributo(novoAttrNome.trim());
      } else {
        attributeId = attrSelecionado as number;
      }

      // Cria novos valores se necessário
      for (const nv of novosValores.filter(v => v.trim())) {
        const novoId = await criarValorAtributo(attributeId, nv.trim());
        valueIds.push(novoId);
      }

      if (valueIds.length === 0) {
        exibirMensagem("erro", "Selecione ou adicione pelo menos um valor.");
        return;
      }

      await adicionarAtributoProduto(templateId, attributeId, valueIds);
      exibirMensagem("sucesso", "✅ Atributo adicionado!");
      setModalAttr(false);
      resetModalAttr();
      await carregar();
    } catch {
      exibirMensagem("erro", "Erro ao adicionar atributo.");
    } finally {
      setAdicionandoAttr(false);
    }
  }

  async function handleRemoverAtributo(lineId: number) {
    try {
      await removerAtributoProduto(lineId);
      exibirMensagem("sucesso", "Atributo removido.");
      await carregar();
    } catch {
      exibirMensagem("erro", "Não é possível remover — existem variantes com este atributo.");
    }
  }

  function resetModalAttr() {
    setAttrSelecionado(0);
    setNovoAttrNome("");
    setValoresSelecionados([]);
    setNovosValores([""]);
  }

  // ── Variantes ────────────────────────────────────────────────────────────

  async function confirmarAdicionarVariante() {
    if (adicionandoVariante) return;

    // Verifica se todos os atributos foram selecionados
    const attrIds = linhasAtributo.map(l => l.attribute_id[0]);
    for (const attrId of attrIds) {
      if (!tavsSelecionados[attrId]) {
        exibirMensagem("erro", "Selecione um valor para cada atributo.");
        return;
      }
    }

    setAdicionandoVariante(true);
    try {
      const tavIds = Object.values(tavsSelecionados);
      const preco = parseFloat(formNovaVariante.list_price) || precoBase;

      // Busca o product.product que corresponde à combinação
      // No Odoo, a variante já é criada automaticamente quando os atributos são adicionados
      // Precisamos encontrar a variante existente ou criar uma nova
      const todasVariantes = await buscarVariantesProduto(templateId) as Variante[];

      // Encontra a variante que tem exatamente os TAVs selecionados
      const varianteExistente = todasVariantes.find(v => {
        const vTavs = v.product_template_attribute_value_ids.sort();
        const selTavs = tavIds.sort();
        return JSON.stringify(vTavs) === JSON.stringify(selTavs);
      });

      if (varianteExistente) {
        // Atualiza a variante existente
        await atualizarVariante(varianteExistente.id, {
          default_code: formNovaVariante.default_code || undefined,
          barcode:      formNovaVariante.barcode || undefined,
          list_price:   preco,
        });
        exibirMensagem("sucesso", "✅ Variante atualizada!");
      } else {
        exibirMensagem("erro", "Combinação não encontrada. Verifique os atributos do produto.");
        return;
      }

      setModalVariante(false);
      setTavsSelecionados({});
      setFormNovaVariante({ default_code: "", barcode: "", list_price: "" });
      await carregar();
    } catch {
      exibirMensagem("erro", "Erro ao salvar variante.");
    } finally {
      setAdicionandoVariante(false);
    }
  }

  async function salvarVariante(varianteId: number) {
    setSalvando(true);
    try {
      const form = formsVariante[varianteId];
      await atualizarVariante(varianteId, {
        default_code: form.default_code || undefined,
        barcode:      form.barcode || undefined,
        list_price:   parseFloat(form.list_price) || precoBase,
      });
      exibirMensagem("sucesso", "✅ Variante salva!");
    } catch {
      exibirMensagem("erro", "Erro ao salvar variante.");
    } finally {
      setSalvando(false);
    }
  }

  function updateFormVariante(id: number, campo: keyof FormVariante, valor: string) {
    setFormsVariante(prev => ({
      ...prev,
      [id]: { ...prev[id], [campo]: valor }
    }));
  }

  // Agrupa TAVs por atributo
  const tavsPorAtributo: Record<number, TemplateAttrValue[]> = {};
  for (const tav of tavs) {
    const attrId = tav.attribute_id[0];
    if (!tavsPorAtributo[attrId]) tavsPorAtributo[attrId] = [];
    tavsPorAtributo[attrId].push(tav);
  }

  // Atributos que já estão no produto
  const atributosNoProduct = linhasAtributo.map(l => l.attribute_id[0]);

  // Atributos globais disponíveis para adicionar (não estão no produto ainda)
  const atributosDisponiveis = atributosGlobais.filter(a => !atributosNoProduct.includes(a.id));

  return (
    <div className="modal-variantes-overlay" onClick={onFechar}>
      <div className="modal-variantes-box" onClick={e => e.stopPropagation()}>

        {mensagem && (
          <div className={`mv-mensagem mv-mensagem-${mensagem.tipo}`}>{mensagem.tipo === "sucesso" ? "✅" : "❌"} {mensagem.texto}</div>
        )}

        {/* Header */}
        <div className="mv-header">
          <div>
            <h2>{templateNome}</h2>
            <span className="mv-subtitle">Gestão de Variantes</span>
          </div>
          <button className="mv-fechar" onClick={onFechar}>✕</button>
        </div>

        {/* Abas */}
        <div className="mv-abas">
          <button
            className={aba === "atributos" ? "mv-aba mv-aba-ativa" : "mv-aba"}
            onClick={() => setAba("atributos")}
          >
            🏷️ Atributos {linhasAtributo.length > 0 && <span className="mv-badge">{linhasAtributo.length}</span>}
          </button>
          <button
            className={aba === "variantes" ? "mv-aba mv-aba-ativa" : "mv-aba"}
            onClick={() => setAba("variantes")}
          >
            🎨 Variantes {variantes.length > 0 && <span className="mv-badge">{variantes.length}</span>}
          </button>
        </div>

        {carregando ? (
          <div className="mv-carregando">Carregando...</div>
        ) : (
          <div className="mv-body">

            {/* ── ABA ATRIBUTOS ── */}
            {aba === "atributos" && (
              <div className="mv-section">
                <div className="mv-section-header">
                  <p className="mv-section-desc">
                    Defina os atributos do produto (ex: Tamanho, Cor). Após definir os atributos, as variantes serão criadas na aba Variantes.
                  </p>
                  <button className="btn-add-attr" onClick={() => setModalAttr(true)}>
                    + Adicionar Atributo
                  </button>
                </div>

                {linhasAtributo.length === 0 ? (
                  <div className="mv-vazio">
                    <p>Nenhum atributo cadastrado.</p>
                    <p>Adicione atributos para criar variantes deste produto.</p>
                  </div>
                ) : (
                  <div className="mv-atributos-lista">
                    {linhasAtributo.map(linha => {
                      const tavsDoAttr = tavsPorAtributo[linha.attribute_id[0]] ?? [];
                      return (
                        <div key={linha.id} className="mv-atributo-card">
                          <div className="mv-attr-info">
                            <strong>{linha.attribute_id[1]}</strong>
                            <div className="mv-attr-values">
                              {tavsDoAttr.map(tav => (
                                <span key={tav.id} className="mv-value-chip">
                                  {tav.product_attribute_value_id[1]}
                                </span>
                              ))}
                            </div>
                          </div>
                          <button
                            className="btn-remover-attr"
                            onClick={() => handleRemoverAtributo(linha.id)}
                            title="Remover atributo"
                          >
                            🗑️
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── ABA VARIANTES ── */}
            {aba === "variantes" && (
              <div className="mv-section">
                <div className="mv-section-header">
                  <p className="mv-section-desc">
                    Configure SKU, barcode e preço de cada variante. Preço em branco herda o valor do produto pai (R$ {precoBase.toFixed(2)}).
                  </p>
                  {linhasAtributo.length > 0 && (
                    <button className="btn-add-attr" onClick={() => setModalVariante(true)}>
                      + Configurar Variante
                    </button>
                  )}
                </div>

                {variantes.length === 0 ? (
                  <div className="mv-vazio">
                    <p>Nenhuma variante encontrada.</p>
                    {linhasAtributo.length === 0
                      ? <p>Adicione atributos primeiro na aba Atributos.</p>
                      : <p>Clique em "Configurar Variante" para definir SKU e barcode.</p>
                    }
                  </div>
                ) : (
                  <div className="mv-variantes-lista">
                    <div className="mv-variantes-header-row">
                      <span>Variante</span>
                      <span>SKU</span>
                      <span>Barcode</span>
                      <span>Preço (R$)</span>
                      <span>Estoque</span>
                      <span></span>
                    </div>
                    {variantes.map(v => (
                      <div key={v.id} className="mv-variante-row">
                        <span className="mv-var-nome">{v.name}</span>
                        <input
                          type="text"
                          value={formsVariante[v.id]?.default_code ?? ""}
                          onChange={e => updateFormVariante(v.id, "default_code", e.target.value)}
                          placeholder="SKU"
                          className="mv-input"
                        />
                        <input
                          type="text"
                          value={formsVariante[v.id]?.barcode ?? ""}
                          onChange={e => updateFormVariante(v.id, "barcode", e.target.value)}
                          placeholder="Código de barras"
                          className="mv-input"
                        />
                        <input
                          type="number"
                          value={formsVariante[v.id]?.list_price ?? ""}
                          onChange={e => updateFormVariante(v.id, "list_price", e.target.value)}
                          placeholder={precoBase.toFixed(2)}
                          className="mv-input mv-input-preco"
                          min="0"
                          step="0.01"
                        />
                        <span className="mv-var-estoque">{v.qty_available} un</span>
                        <button
                          className="btn-salvar-variante"
                          onClick={() => salvarVariante(v.id)}
                          disabled={salvando}
                        >
                          💾
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Modal adicionar atributo */}
        {modalAttr && (
          <div className="mv-modal-inner-overlay" onClick={() => { setModalAttr(false); resetModalAttr(); }}>
            <div className="mv-modal-inner" onClick={e => e.stopPropagation()}>
              <div className="mv-modal-inner-header">
                <h3>Adicionar Atributo</h3>
                <button className="mv-fechar" onClick={() => { setModalAttr(false); resetModalAttr(); }}>✕</button>
              </div>
              <div className="mv-modal-inner-body">

                <div className="campo">
                  <label>Atributo</label>
                  <select
                    value={attrSelecionado}
                    onChange={e => {
                      const val = e.target.value;
                      setAttrSelecionado(val === "novo" ? "novo" : Number(val));
                      setValoresSelecionados([]);
                    }}
                    className="campo-select"
                  >
                    <option value={0}>— Selecione —</option>
                    {atributosDisponiveis.map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                    <option value="novo">+ Criar novo atributo</option>
                  </select>
                </div>

                {attrSelecionado === "novo" && (
                  <div className="campo">
                    <label>Nome do novo atributo</label>
                    <input
                      type="text"
                      value={novoAttrNome}
                      onChange={e => setNovoAttrNome(e.target.value)}
                      placeholder="Ex: Voltagem, Material, Tamanho..."
                      autoFocus
                    />
                  </div>
                )}

                {attrSelecionado !== 0 && attrSelecionado !== "novo" && (
                  <div className="campo">
                    <label>Valores existentes</label>
                    <div className="mv-valores-grid">
                      {atributosGlobais
                        .find(a => a.id === attrSelecionado)
                        ?.values.map(v => (
                          <label key={v.id} className={`mv-valor-check ${valoresSelecionados.includes(v.id) ? "ativo" : ""}`}>
                            <input
                              type="checkbox"
                              checked={valoresSelecionados.includes(v.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setValoresSelecionados(prev => [...prev, v.id]);
                                } else {
                                  setValoresSelecionados(prev => prev.filter(id => id !== v.id));
                                }
                              }}
                            />
                            {v.name}
                          </label>
                        ))
                      }
                    </div>
                  </div>
                )}

                <div className="campo">
                  <label>Novos valores para adicionar</label>
                  {novosValores.map((nv, i) => (
                    <div key={i} className="mv-novo-valor-row">
                      <input
                        type="text"
                        value={nv}
                        onChange={e => {
                          const arr = [...novosValores];
                          arr[i] = e.target.value;
                          setNovosValores(arr);
                        }}
                        placeholder={`Valor ${i + 1} (ex: P, M, G...)`}
                      />
                      {novosValores.length > 1 && (
                        <button
                          className="btn-remover-valor"
                          onClick={() => setNovosValores(prev => prev.filter((_, idx) => idx !== i))}
                        >✕</button>
                      )}
                    </div>
                  ))}
                  <button
                    className="btn-add-valor"
                    onClick={() => setNovosValores(prev => [...prev, ""])}
                  >
                    + Adicionar valor
                  </button>
                </div>

              </div>
              <div className="mv-modal-inner-footer">
                <button className="btn-cancelar" onClick={() => { setModalAttr(false); resetModalAttr(); }}>
                  Cancelar
                </button>
                <button
                  className="btn-salvar"
                  onClick={confirmarAdicionarAtributo}
                  disabled={adicionandoAttr || (attrSelecionado === 0)}
                >
                  {adicionandoAttr ? "Adicionando..." : "✅ Adicionar"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal configurar variante */}
        {modalVariante && (
          <div className="mv-modal-inner-overlay" onClick={() => setModalVariante(false)}>
            <div className="mv-modal-inner" onClick={e => e.stopPropagation()}>
              <div className="mv-modal-inner-header">
                <h3>Configurar Variante</h3>
                <button className="mv-fechar" onClick={() => setModalVariante(false)}>✕</button>
              </div>
              <div className="mv-modal-inner-body">

                {linhasAtributo.map(linha => {
                  const tavsDoAttr = tavsPorAtributo[linha.attribute_id[0]] ?? [];
                  return (
                    <div key={linha.id} className="campo">
                      <label>{linha.attribute_id[1]}</label>
                      <div className="mv-valores-grid">
                        {tavsDoAttr.map(tav => (
                          <label
                            key={tav.id}
                            className={`mv-valor-check ${tavsSelecionados[linha.attribute_id[0]] === tav.id ? "ativo" : ""}`}
                          >
                            <input
                              type="radio"
                              name={`attr-${linha.attribute_id[0]}`}
                              checked={tavsSelecionados[linha.attribute_id[0]] === tav.id}
                              onChange={() => setTavsSelecionados(prev => ({
                                ...prev,
                                [linha.attribute_id[0]]: tav.id,
                              }))}
                            />
                            {tav.product_attribute_value_id[1]}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div className="campo-grupo">
                  <div className="campo">
                    <label>SKU</label>
                    <input
                      type="text"
                      value={formNovaVariante.default_code}
                      onChange={e => setFormNovaVariante(prev => ({ ...prev, default_code: e.target.value }))}
                      placeholder="Ex: CAM-P-BCO"
                    />
                  </div>
                  <div className="campo">
                    <label>Código de Barras</label>
                    <input
                      type="text"
                      value={formNovaVariante.barcode}
                      onChange={e => setFormNovaVariante(prev => ({ ...prev, barcode: e.target.value }))}
                      placeholder="Ex: 7891234567890"
                    />
                  </div>
                </div>

                <div className="campo">
                  <label>Preço (deixe vazio para usar R$ {precoBase.toFixed(2)})</label>
                  <input
                    type="number"
                    value={formNovaVariante.list_price}
                    onChange={e => setFormNovaVariante(prev => ({ ...prev, list_price: e.target.value }))}
                    placeholder={precoBase.toFixed(2)}
                    min="0"
                    step="0.01"
                  />
                </div>

              </div>
              <div className="mv-modal-inner-footer">
                <button className="btn-cancelar" onClick={() => setModalVariante(false)}>Cancelar</button>
                <button
                  className="btn-salvar"
                  onClick={confirmarAdicionarVariante}
                  disabled={adicionandoVariante}
                >
                  {adicionandoVariante ? "Salvando..." : "✅ Salvar Variante"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}