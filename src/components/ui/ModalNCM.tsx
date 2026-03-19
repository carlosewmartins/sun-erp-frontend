/**
 * src/components/ui/ModalNCM.tsx
 *
 * Modal de validação e cadastro de NCM antes de finalizar venda.
 *
 * Modo obrigatório (NFC-e):
 *   - Bloqueante: não permite prosseguir sem preencher todos os NCMs
 *   - Botões: Cancelar | Salvar e continuar
 *
 * Modo opcional (Recibo):
 *   - Não bloqueia: permite pular
 *   - Botões: Cancelar | Pular | Salvar e continuar
 *   - Se pular: prossegue sem NCM (sale completa normalmente)
 *
 * Campo Odoo: l10n_br_ncm_code em product.template
 *   Requer módulo l10n_br instalado no Odoo.
 *   Se não estiver instalado, altere a constante NCM_FIELD abaixo.
 *
 * Regras:
 *   - Se todos os produtos já têm NCM cadastrado: auto-confirma sem exibir UI
 *   - NCM deve ter exatamente 8 dígitos numéricos
 *   - Salva no Odoo antes de confirmar (persistência garantida)
 */

import { useState, useEffect } from "react";
import {
  App,
  Button,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
} from "antd";
import { execute } from "../../services/odoo";
import { ItemVenda } from "../../types";

const { Text } = Typography;

// ─── Campo NCM no product.template ───────────────────────────────────────────
// Requer módulo l10n_br instalado no Odoo.
// Se preferir um campo customizado (ex: x_ncm), altere aqui.
const NCM_FIELD = "x_ncm";

// ─── Tokens de cor ────────────────────────────────────────────────────────────
const C = {
  amber:   "#F59E0B",
  amberBg: "#FFF8E7",
  success: "#22C55E",
  infoBg:  "#EFF6FF",
  infoBorder: "#BFDBFE",
  warnBorder: "#F59E0B",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export type NcmMap = Record<number, string>; // product.product id → NCM (8 dígitos)

type Props = {
  isOpen: boolean;
  itens: ItemVenda[];
  obrigatorio: boolean; // true = NFC-e (bloqueia) | false = Recibo (pode pular)
  onConfirmar: (ncmMap: NcmMap) => void;
  onFechar: () => void;
};

// ─── Componente ───────────────────────────────────────────────────────────────
export default function ModalNCM({
  isOpen,
  itens,
  obrigatorio,
  onConfirmar,
  onFechar,
}: Props) {
  const { message } = App.useApp();

  const [loading,       setLoading]       = useState(false);
  const [salvando,      setSalvando]      = useState(false);
  const [itensSemNCM,   setItensSemNCM]   = useState<ItemVenda[]>([]);
  const [ncmValues,     setNcmValues]     = useState<NcmMap>({}); // inputs do form
  const [ncmCompleto,   setNcmCompleto]   = useState<NcmMap>({}); // todos (com + sem)

  // Reseta e verifica ao abrir
  useEffect(() => {
    if (!isOpen || itens.length === 0) return;
    setItensSemNCM([]);
    setNcmValues({});
    setNcmCompleto({});
    verificarNCMs();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Busca NCMs do Odoo ─────────────────────────────────────────────────────
  // NCM_FIELD (x_ncm) vive em product.template, não em product.product.
  // Fluxo: product.product → product_tmpl_id → product.template → NCM_FIELD
  async function verificarNCMs() {
    setLoading(true);
    try {
      const prodIds = itens.map((i) => i.produto.id);

      // 1. Busca product_tmpl_id de cada product.product
      type RawProd = { id: number; product_tmpl_id: [number, string] };
      const prods = (await execute(
        "product.product", "read",
        [prodIds, ["id", "product_tmpl_id"]],
      )) as RawProd[];

      const prodTmplMap: Record<number, number> = {};
      prods.forEach(p => { prodTmplMap[p.id] = p.product_tmpl_id[0]; });

      // 2. Busca NCM_FIELD em product.template
      const tmplIds = [...new Set(Object.values(prodTmplMap))];
      type RawTmpl = { id: number; [key: string]: unknown };
      const tmpls = (await execute(
        "product.template", "read",
        [tmplIds, ["id", NCM_FIELD]],
      )) as RawTmpl[];

      const tmplNcmMap: Record<number, string> = {};
      tmpls.forEach(t => {
        const v = t[NCM_FIELD];
        if (typeof v === "string" && v.trim()) tmplNcmMap[t.id] = v.trim();
      });

      // 3. Monta mapas por product.product id
      const mapaCompleto: NcmMap = {};
      const mapaInput:    NcmMap = {};
      const semNCM: ItemVenda[]  = [];

      for (const item of itens) {
        const tmplId = prodTmplMap[item.produto.id];
        const ncmRaw = tmplId ? tmplNcmMap[tmplId] : undefined;
        const ncm    = typeof ncmRaw === "string" ? ncmRaw.replace(/\D/g, "") : "";

        if (ncm.length === 8) {
          mapaCompleto[item.produto.id] = ncm;
        } else {
          semNCM.push(item);
          mapaCompleto[item.produto.id] = "";
          mapaInput[item.produto.id]    = "";
        }
      }

      setNcmCompleto(mapaCompleto);

      // Auto-confirma se todos já têm NCM (sem mostrar UI)
      if (semNCM.length === 0) {
        onConfirmar(mapaCompleto);
        return;
      }

      setItensSemNCM(semNCM);
      setNcmValues(mapaInput);
    } catch (e) {
      console.error(e);
      message.error(
        "Erro ao verificar NCM. Verifique a conexão com o Odoo e se o campo x_ncm existe em product.template."
      );
      onFechar();
    } finally {
      setLoading(false);
    }
  }

  // ── Helpers de validação ───────────────────────────────────────────────────
  const ncmLimpo  = (id: number) => ncmValues[id]?.replace(/\D/g, "") ?? "";
  const ncmValido = (id: number) => ncmLimpo(id).length === 8;
  const todosValidos = () => itensSemNCM.every((i) => ncmValido(i.produto.id));

  // ── Salva NCMs no Odoo e confirma ─────────────────────────────────────────
  async function salvar(itensParaSalvar: ItemVenda[]) {
    for (const item of itensParaSalvar) {
      const ncm = ncmLimpo(item.produto.id);
      console.log("[ModalNCM] salvar → produto:", item.produto.id, "| ncm:", ncm);

      // Busca product_tmpl_id
      type RawProd = { id: number; product_tmpl_id: [number, string] };
      const prods = (await execute(
        "product.product", "read",
        [[item.produto.id], ["id", "product_tmpl_id"]],
      )) as RawProd[];

      if (!prods.length) {
        console.warn("[ModalNCM] produto não encontrado:", item.produto.id);
        continue;
      }

      const tmplId = prods[0].product_tmpl_id[0];
      console.log("[ModalNCM] product.template id:", tmplId, "| gravando x_ncm =", ncm);

      const ok = await execute("product.template", "write", [
        [tmplId],
        { [NCM_FIELD]: ncm },
      ]);

      console.log("[ModalNCM] write result:", ok);

      // Confirma lendo de volta
      type RawTmpl = { id: number; [key: string]: unknown };
      const check = (await execute(
        "product.template", "read",
        [[tmplId], ["id", NCM_FIELD]],
      )) as RawTmpl[];
      console.log("[ModalNCM] verificação pós-write:", NCM_FIELD, "=", check[0]?.[NCM_FIELD]);
    }
  }

  async function handleConfirmar() {
    if (!todosValidos()) {
      message.error("Preencha o NCM de todos os produtos (8 dígitos)");
      return;
    }
    setSalvando(true);
    try {
      await salvar(itensSemNCM);

      const finalMap: NcmMap = { ...ncmCompleto };
      for (const item of itensSemNCM) {
        finalMap[item.produto.id] = ncmLimpo(item.produto.id);
      }

      const qtd = itensSemNCM.length;
      message.success(`NCM${qtd > 1 ? "s" : ""} salvo${qtd > 1 ? "s" : ""} com sucesso`);
      onConfirmar(finalMap);
    } catch (e) {
      console.error(e);
      message.error("Erro ao salvar NCM no Odoo");
    } finally {
      setSalvando(false);
    }
  }

  // Pular: salva os que foram preenchidos (se houver), ignora os vazios
  async function handlePular() {
    setSalvando(true);
    try {
      const preenchidos = itensSemNCM.filter((i) => ncmValido(i.produto.id));
      if (preenchidos.length > 0) await salvar(preenchidos);

      const finalMap: NcmMap = { ...ncmCompleto };
      for (const item of itensSemNCM) {
        finalMap[item.produto.id] = ncmLimpo(item.produto.id) || "00000000";
      }

      onConfirmar(finalMap);
    } catch (e) {
      console.error(e);
      message.error("Erro ao salvar NCM");
    } finally {
      setSalvando(false);
    }
  }

  // ── Footer dinâmico ───────────────────────────────────────────────────────
  const footer = [
    <Button key="cancelar" onClick={onFechar} disabled={salvando}>
      Cancelar
    </Button>,

    !obrigatorio && (
      <Button key="pular" onClick={handlePular} loading={salvando} disabled={loading}>
        Pular
      </Button>
    ),

    <Button
      key="confirmar"
      type="primary"
      loading={salvando}
      disabled={loading || (obrigatorio && !todosValidos())}
      style={{ background: C.success, borderColor: C.success }}
      onClick={handleConfirmar}
    >
      Salvar e continuar
    </Button>,
  ].filter(Boolean);

  // ── Render ────────────────────────────────────────────────────────────────
  const titulo = obrigatorio
    ? "⚠️ NCM obrigatório para emissão de NFC-e"
    : "💡 Produtos sem NCM cadastrado";

  return (
    <Modal
      title={titulo}
      open={isOpen}
      centered
      maskClosable={false}
      keyboard={false}
      onCancel={onFechar}
      footer={footer}
      width={480}
    >
      {/* Loading inicial (buscando NCMs) */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "32px 0" }}>
          <Spin />
          <Text type="secondary" style={{ display: "block", marginTop: 12 }}>
            Verificando NCMs...
          </Text>
        </div>
      ) : (
        <Space direction="vertical" style={{ width: "100%" }} size={20}>

          {/* Banner explicativo */}
          <div style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: `1px solid ${obrigatorio ? C.warnBorder : C.infoBorder}`,
            background: obrigatorio ? C.amberBg : C.infoBg,
          }}>
            <Text style={{ fontSize: 13 }}>
              {obrigatorio
                ? "Os produtos abaixo não possuem NCM cadastrado. Preencha para continuar com a emissão da NFC-e."
                : "Os produtos abaixo não possuem NCM. Preencha agora para facilitar futuras emissões, ou clique em Pular."}
            </Text>
          </div>

          {/* Campos de NCM */}
          {itensSemNCM.map((item, idx) => {
            const val  = ncmValues[item.produto.id] ?? "";
            const len  = val.replace(/\D/g, "").length;
            const erro = len > 0 && len < 8;

            return (
              <div key={item.produto.id}>
                <Space size={6} style={{ marginBottom: 6 }}>
                  <Text strong style={{ fontSize: 14 }}>
                    {item.produto.name}
                  </Text>
                  {item.produto.default_code && (
                    <Tag style={{ fontSize: 11 }}>{item.produto.default_code}</Tag>
                  )}
                </Space>

                <Input
                  autoFocus={idx === 0}
                  size="large"
                  placeholder="00000000 (8 dígitos)"
                  maxLength={8}
                  value={val}
                  status={erro ? "error" : undefined}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setNcmValues((prev) => ({ ...prev, [item.produto.id]: v }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && todosValidos()) handleConfirmar();
                  }}
                  suffix={
                    <Text
                      type={erro ? "danger" : "secondary"}
                      style={{ fontSize: 11 }}
                    >
                      {len}/8
                    </Text>
                  }
                />

                {erro && (
                  <Text type="danger" style={{ fontSize: 12 }}>
                    NCM deve ter 8 dígitos
                  </Text>
                )}
              </div>
            );
          })}
        </Space>
      )}
    </Modal>
  );
}