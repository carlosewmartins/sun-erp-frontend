import { useState, useEffect, useRef } from "react";

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
  const [valorStr, setValorStr]     = useState("");
  const [percentStr, setPercentStr] = useState("");
  const inputValorRef               = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (ultimoDesconto > 0) {
        const valorFmt = ultimoDesconto.toFixed(2).replace(".", ",");
        const pctFmt   = totalBruto > 0
          ? ((ultimoDesconto / totalBruto) * 100).toFixed(2)
          : "";
        setValorStr(valorFmt);
        setPercentStr(pctFmt);
      } else {
        setValorStr("");
        setPercentStr("");
      }
      setTimeout(() => inputValorRef.current?.focus(), 50);
    }
  }, [isOpen, ultimoDesconto, totalBruto]);

  // ── sincronização entre os dois campos ───────────────────────────────────
  function handleValorChange(raw: string) {
    const sanitized = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    setValorStr(raw.replace(/[^\d.,]/g, ""));

    const valor = parseFloat(sanitized);
    if (!isNaN(valor) && totalBruto > 0) {
      const pct = (valor / totalBruto) * 100;
      setPercentStr(pct > 0 ? pct.toFixed(2) : "");
    } else {
      setPercentStr("");
    }
  }

  function handlePercentChange(raw: string) {
    const sanitized = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    setPercentStr(raw.replace(/[^\d.,]/g, ""));

    const pct = parseFloat(sanitized);
    if (!isNaN(pct) && totalBruto > 0) {
      const valor = (pct / 100) * totalBruto;
      setValorStr(valor > 0 ? valor.toFixed(2).replace(".", ",") : "");
    } else {
      setValorStr("");
    }
  }

  // ── valores derivados para preview ───────────────────────────────────────
  const descontoValor    = parseFloat(valorStr.replace(",", ".")) || 0;
  const descontoPct      = parseFloat(percentStr.replace(",", ".")) || 0;
  const totalComDesconto = Math.max(0, totalBruto - descontoValor);
  const descontoInvalido = descontoValor < 0 || descontoValor > totalBruto;

  function confirmar() {
    if (descontoInvalido) return;
    onConfirmar(descontoValor);
    onFechar();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter")  confirmar();
    if (e.key === "Escape") onFechar();
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onFechar}>
      <div
        className="modal-pagamento"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* header */}
        <div className="modal-pag-header">
          <h3>🏷️ Aplicar Desconto</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="modal-pag-body">

          {/* total bruto */}
          <div className="pag-total">
            <span>Total do pedido</span>
            <strong>R$ {totalBruto.toFixed(2)}</strong>
          </div>

          {/* campo valor R$ */}
          <div className="pag-section">
            <label>Desconto em R$</label>
            <input
              ref={inputValorRef}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={valorStr}
              onChange={e => handleValorChange(e.target.value)}
            />
          </div>

          {/* campo percentual */}
          <div className="pag-section">
            <label>Desconto em %</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={percentStr}
              onChange={e => handlePercentChange(e.target.value)}
            />
          </div>

          {/* preview */}
          {descontoValor > 0 && (
            <div className="desconto-preview">
              {descontoInvalido ? (
                <span className="desconto-erro">
                  ⚠️ Desconto maior que o total
                </span>
              ) : (
                <>
                  <div className="desconto-linha">
                    <span>Desconto</span>
                    <span className="desconto-valor-destaque">
                      − R$ {descontoValor.toFixed(2)}
                      <small> ({descontoPct.toFixed(1)}%)</small>
                    </span>
                  </div>
                  <div className="desconto-linha desconto-total-final">
                    <span>Total com desconto</span>
                    <strong>R$ {totalComDesconto.toFixed(2)}</strong>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div className="modal-pag-footer">
          <button className="btn-cancelar-pag" onClick={onFechar}>
            Cancelar
          </button>
          <button
            className="btn-emitir-nfce"
            onClick={confirmar}
            disabled={descontoInvalido || descontoValor === 0}
          >
            ✅ Aplicar Desconto
          </button>
        </div>
      </div>
    </div>
  );
}