import { useState, useEffect } from "react";
import {
  Alert,
  Button,
  Divider,
  InputNumber,
  Modal,
  Row,
  Typography,
} from "antd";

const { Text } = Typography;

const C = {
  amber:   "#F59E0B",
  amberBg: "#FFF8E7",
  error:   "#EF4444",
  success: "#22C55E",
} as const;

interface ModalDescontoProps {
  isOpen:          boolean;
  totalBruto:      number;
  ultimoDesconto?: number;
  onConfirmar:     (desconto: number) => void;
  onFechar:        () => void;
}

export default function ModalDesconto({
  isOpen,
  totalBruto,
  ultimoDesconto = 0,
  onConfirmar,
  onFechar,
}: ModalDescontoProps) {
  const [valorReais,   setValorReais]   = useState<number | null>(null);
  const [valorPercent, setValorPercent] = useState<number | null>(null);

  // ── Pré-preenche com último desconto ao abrir ────────────────────────────
  useEffect(() => {
    if (isOpen) {
      if (ultimoDesconto > 0) {
        setValorReais(parseFloat(ultimoDesconto.toFixed(2)));
        setValorPercent(
          totalBruto > 0
            ? parseFloat(((ultimoDesconto / totalBruto) * 100).toFixed(2))
            : null
        );
      } else {
        setValorReais(null);
        setValorPercent(null);
      }
    }
  }, [isOpen, ultimoDesconto, totalBruto]);

  // ── Sincronização bidirecional ───────────────────────────────────────────
  function handleValorChange(val: number | null) {
    setValorReais(val);
    if (val !== null && totalBruto > 0) {
      setValorPercent(parseFloat(((val / totalBruto) * 100).toFixed(2)));
    } else {
      setValorPercent(null);
    }
  }

  function handlePercentChange(pct: number | null) {
    setValorPercent(pct);
    if (pct !== null && totalBruto > 0) {
      setValorReais(parseFloat(((pct / 100) * totalBruto).toFixed(2)));
    } else {
      setValorReais(null);
    }
  }

  // ── Valores derivados para preview ──────────────────────────────────────
  const descontoValor    = valorReais ?? 0;
  const descontoPct      = valorPercent ?? 0;
  const totalComDesconto = Math.max(0, totalBruto - descontoValor);
  const descontoInvalido = descontoValor < 0 || descontoValor > totalBruto;
  const podePodConfirmar = descontoValor > 0 && !descontoInvalido;

  function confirmar() {
    if (!podePodConfirmar) return;
    onConfirmar(descontoValor);
    onFechar();
  }

  return (
    <Modal
      title="🏷️ Aplicar Desconto"
      open={isOpen}
      centered
      maskClosable
      onCancel={onFechar}
      keyboard        // Escape fecha
      footer={[
        <Button key="cancelar" onClick={onFechar}>
          Cancelar
        </Button>,
        <Button
          key="confirmar"
          type="primary"
          disabled={!podePodConfirmar}
          onClick={confirmar}
          style={podePodConfirmar ? { background: C.success, borderColor: C.success } : {}}
        >
          Aplicar Desconto
        </Button>,
      ]}
    >
      <div
        style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}
        onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
      >

        {/* Total do pedido */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 18px", background: C.amberBg, borderRadius: 12,
        }}>
          <Text style={{ fontSize: 15 }}>Total do pedido</Text>
          <Text strong style={{ fontSize: 22, color: C.amber }}>
            R$ {totalBruto.toFixed(2)}
          </Text>
        </div>

        {/* Campo R$ */}
        <div>
          <Text
            type="secondary"
            style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 8 }}
          >
            Desconto em R$
          </Text>
          <InputNumber
            autoFocus
            size="large"
            style={{ width: "100%" }}
            min={0}
            max={totalBruto}
            precision={2}
            decimalSeparator=","
            prefix="R$"
            placeholder="0,00"
            value={valorReais}
            onChange={handleValorChange}
            onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
            status={descontoInvalido ? "error" : undefined}
          />
        </div>

        {/* Campo % */}
        <div>
          <Text
            type="secondary"
            style={{ display: "block", fontWeight: 600, fontSize: 13, marginBottom: 8 }}
          >
            Desconto em %
          </Text>
          <InputNumber
            size="large"
            style={{ width: "100%" }}
            min={0}
            max={100}
            precision={2}
            decimalSeparator=","
            suffix="%"
            placeholder="0,00"
            value={valorPercent}
            onChange={handlePercentChange}
            onKeyDown={e => { if (e.key === "Enter") confirmar(); }}
          />
        </div>

        {/* Preview */}
        {descontoValor > 0 && (
          <>
            <Divider style={{ margin: "4px 0" }} />

            {descontoInvalido ? (
              <Alert
                type="error"
                message="Desconto maior que o total do pedido"
                showIcon
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Row justify="space-between">
                  <Text type="secondary">Desconto</Text>
                  <Text style={{ color: C.error, fontWeight: 600 }}>
                    − R$ {descontoValor.toFixed(2)}
                    <Text type="secondary" style={{ fontSize: 13, marginLeft: 6 }}>
                      ({descontoPct.toFixed(1)}%)
                    </Text>
                  </Text>
                </Row>
                <Row justify="space-between">
                  <Text strong>Total com desconto</Text>
                  <Text strong style={{ fontSize: 18, color: C.success }}>
                    R$ {totalComDesconto.toFixed(2)}
                  </Text>
                </Row>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}