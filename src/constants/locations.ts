export const LOCATIONS = {
  FISCAL:           { id: 17, name: "Estoque Fiscal" },
  DEPOSITO_LATERAL: { id: 20, name: "Depósito Lateral" },
  GARAGEM:          { id: 19, name: "Garagem" },
  MEZANINO:         { id: 18, name: "Mezanino" },
  PERDAS_QUEBRAS:   { id: 21, name: "Perdas e Quebras" },
  WH_ESTOQUE:       { id:  8, name: "WH/Estoque" },
  FORNECEDOR:       { id:  4, name: "Fornecedores" },
  CLIENTE:          { id:  5, name: "Clientes" },
} as const;

export const LOCATION_LIST = Object.values(LOCATIONS).filter(
  (loc) => ![4, 5, 8].includes(loc.id) // apenas locais operacionais
);