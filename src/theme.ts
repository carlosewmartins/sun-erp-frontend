/**
 * theme.ts — Tema global Ant Design (antd)
 * PDV / WMS — SUMMER COMERCIO DE VARIEDADES LTDA
 *
 * Como usar:
 *   import { pdvTheme } from "@/theme";
 *   <ConfigProvider theme={pdvTheme}>...</ConfigProvider>
 *
 * Fontes externas: adicione no index.html antes de usar:
 *   <link rel="preconnect" href="https://fonts.googleapis.com" />
 *   <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
 *   <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap" rel="stylesheet" />
 */

import type { ThemeConfig } from "antd";

// ─── Paleta de referência ─────────────────────────────────────────────────────
// Use COLOR.* em estilos inline e CSS Modules para manter consistência com o tema.

export const COLOR = {
  // Brand — Âmbar
  amber:          "#F59E0B",
  amberHover:     "#FCD34D",  // estado hover (gerado internamente pelo antd)
  amberActive:    "#D97706",  // estado pressed / active

  // Accent — Laranja (info, link)
  orange:         "#F97316",
  orangeActive:   "#EA6C0A",

  // Semânticas
  success:        "#22C55E",
  successBg:      "#F0FDF4",
  warning:        "#EAB308",
  warningBg:      "#FEFCE8",
  error:          "#EF4444",
  errorBg:        "#FEF2F2",
  info:           "#F97316",
  infoBg:         "#FFF7ED",

  // Neutros — base clara
  textBase:       "#1A1A1A",
  textSecondary:  "#64748B",
  textDisabled:   "#94A3B8",
  bgBase:         "#FFFFFF",
  bgLayout:       "#F8FAFC",   // fundo geral da página
  bgContainer:    "#FFFFFF",   // cards, painéis
  bgElevated:     "#FFFFFF",   // modais, dropdowns
  border:         "#E2E8F0",
  borderSecondary:"#F1F5F9",
} as const;

// ─── Tema principal ───────────────────────────────────────────────────────────

export const pdvTheme: ThemeConfig = {
  token: {

    // ── Color: Brand ──────────────────────────────────────────────────────────
    colorPrimary:             COLOR.amber,
    colorSuccess:             COLOR.success,
    colorWarning:             COLOR.warning,
    colorError:               COLOR.error,
    colorInfo:                COLOR.orange,
    colorLink:                COLOR.orange,
    colorLinkHover:           COLOR.orangeActive,
    colorLinkActive:          COLOR.orangeActive,

    // ── Color: Neutros ────────────────────────────────────────────────────────
    colorTextBase:            COLOR.textBase,
    colorBgBase:              COLOR.bgBase,
    colorBgLayout:            COLOR.bgLayout,
    colorBgContainer:         COLOR.bgContainer,
    colorBgElevated:          COLOR.bgElevated,
    colorBorder:              COLOR.border,
    colorBorderSecondary:     COLOR.borderSecondary,

    // ── Font ──────────────────────────────────────────────────────────────────
    fontSize:                 16,
    fontFamily:               "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",

    // ── Spacing & Size ────────────────────────────────────────────────────────
    sizeStep:                 4,
    sizeUnit:                 4,

    /**
     * controlHeight: 52px
     * Todos os controles baseados em altura (Button, Input, Select, InputNumber)
     * herdam este valor para size="middle".
     * size="large" → antd aplica ×1.25 ≈ 65px automaticamente.
     * Garante usabilidade com luvas e touch em tablets/coletores.
     */
    controlHeight:            52,

    // ── Style ─────────────────────────────────────────────────────────────────
    borderRadius:             8,
    wireframe:                false,

    // ── Motion ────────────────────────────────────────────────────────────────
    motionUnit:               0.1,
    motionBase:               0,
  },

  // ─── Overrides por componente ─────────────────────────────────────────────
  components: {

    // Button ──────────────────────────────────────────────────────────────────
    Button: {
      fontWeight:             700,
      // Remove sombras excessivas — visual limpo para balcão
      primaryShadow:          "none",
      defaultShadow:          "none",
      dangerShadow:           "none",
    },

    // Input ───────────────────────────────────────────────────────────────────
    Input: {
      // Halo âmbar no foco — feedback claro para operador
      activeShadow:           "0 0 0 3px rgba(245, 158, 11, 0.2)",
    },

    // InputNumber (modal de desconto R$ / %) ──────────────────────────────────
    InputNumber: {
      activeShadow:           "0 0 0 3px rgba(245, 158, 11, 0.2)",
    },

    // Table (ModalProdutos — lista com 14.000 SKUs) ───────────────────────────
    Table: {
      // Linhas generosas para touch em tablet/coletor
      rowHoverBg:             "#FFF7ED",    // laranja suavíssimo no hover
      headerBg:               COLOR.bgLayout,
      headerColor:            COLOR.textSecondary,
      headerSortActiveBg:     "#FEF3C7",   // âmbar muito suave no sort ativo
      borderColor:            COLOR.borderSecondary,
    },

    // Modal ───────────────────────────────────────────────────────────────────
    Modal: {
      borderRadiusLG:         12,
      headerBg:               COLOR.bgContainer,
      contentBg:              COLOR.bgContainer,
      footerBg:               COLOR.bgContainer,
      titleFontSize:          18,
      titleColor:             COLOR.textBase,
    },

    // Message (toasts — substituem o estado [mensagem] do PDV) ───────────────
    Message: {
      contentPadding:         "12px 20px",
      fontSize:               15,
    },

    // Card ────────────────────────────────────────────────────────────────────
    Card: {
      headerBg:               "transparent",
      bodyPadding:            20,
    },

    // Tag (hints de atalho: F1, F2, F3...) ────────────────────────────────────
    Tag: {
      defaultBg:              COLOR.bgLayout,
      defaultColor:           COLOR.textSecondary,
      borderRadiusSM:         4,
    },

    /**
     * Segmented — toggle Recibo ↔ NFC-e (F2)
     * O item selecionado fica âmbar com texto branco.
     * Equivale ao .toggle-btn.active do CSS atual.
     */
    Segmented: {
      itemActiveBg:           COLOR.amberHover,
      itemSelectedBg:         COLOR.amber,
      itemSelectedColor:      "#FFFFFF",
      trackBg:                COLOR.bgLayout,
    },

    /**
     * Radio.Button — forma de pagamento no modal
     * Equivale ao .pag-forma-btn.ativo do CSS atual.
     */
    Radio: {
      buttonBg:               COLOR.bgContainer,
      buttonCheckedBg:        COLOR.amber,
      buttonSolidCheckedBg:   COLOR.amber,
      buttonSolidCheckedColor:"#FFFFFF",
      buttonSolidCheckedHoverBg: COLOR.amberActive,
    },

    // Spin (loading do scanner / busca de produto) ─────────────────────────────
    Spin: {
      colorPrimary:           COLOR.amber,
    },

    // Layout ──────────────────────────────────────────────────────────────────
    Layout: {
      bodyBg:                 COLOR.bgLayout,
      siderBg:                COLOR.bgContainer,
      headerBg:               COLOR.bgContainer,
      headerHeight:           64,
    },

    // Alert (avisos inline — desconto removido, offline, etc.) ────────────────
    Alert: {
      borderRadius:           8,
      fontSize:               15,
    },
  },
};