/**
 * @file src/data/indicators.catalog.js
 * @description Catálogo oficial de indicadores (v0 MVP) para o Selo NCS.
 * Contém a definição estática dos critérios de avaliação.
 */

/**
 * @typedef {import('../types/core').IndicatorMeta} IndicatorMeta
 */

export const ACCEPTED_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp"
];

/**
 * Helper factory para criar objetos de indicador com defaults seguros.
 * @param {Partial<IndicatorMeta> & { id: number, pillar: string, title: string }} props
 * @returns {IndicatorMeta}
 */
const mk = ({
  id,
  pillar,
  category,
  categoryLabel,
  theme,
  title,
  question,
  tooltip,
  references = {},
  evidence = {}
}) => ({
  id,
  pillar,
  category,
  categoryLabel,
  theme,
  title,
  question,
  tooltip,
  scoring: {
    scale: 100,
    model: "status->points"
  },
  evidence: {
    required: true,
    maxSizeMB: 10,
    acceptedMimeTypes: ACCEPTED_EVIDENCE_MIME_TYPES,
    minimum: [],
    strong: [],
    antiFakeNotes: [],
    ...evidence
  },
  references: {
    ods: [],
    gri: [],
    iso26000: [],
    ungc: [],
    ifrs: [],
    ...references
  }
});

/**
 * Catálogo oficial de indicadores (Protótipo 4.2).
 * Trabalha com 12 indicadores distribuídos em E, S, G.
 * * @type {IndicatorMeta[]}
 */
export const INDICATOR_CATALOG_V0 = [
  // =========================
  // Ambiental (E)
  // =========================
  mk({
    id: 1,
    pillar: "E",
    category: "Ambiental",
    categoryLabel: "Ambiental (E)",
    theme: "Emissões",
    title: "Emissões de GEE (Gases de Efeito Estufa)",
    question: "Controle e redução das emissões de gases de efeito estufa",
    tooltip: ""
  }),
  mk({
    id: 2,
    pillar: "E",
    category: "Ambiental",
    categoryLabel: "Ambiental (E)",
    theme: "Energia",
    title: "Energia e Eficiência",
    question: "Gestão do uso de energia e medidas de eficiência",
    tooltip: ""
  }),
  mk({
    id: 3,
    pillar: "E",
    category: "Ambiental",
    categoryLabel: "Ambiental (E)",
    theme: "Resíduos",
    title: "Resíduos e Circularidade",
    question: "Gestão de resíduos, reciclagem e circularidade",
    tooltip: ""
  }),
  mk({
    id: 4,
    pillar: "E",
    category: "Ambiental",
    categoryLabel: "Ambiental (E)",
    theme: "Água",
    title: "Água e Efluentes",
    question: "Uso responsável de água e tratamento de efluentes",
    tooltip: ""
  }),

  // =========================
  // Social (S)
  // =========================
  mk({
    id: 5,
    pillar: "S",
    category: "Social",
    categoryLabel: "Social (S)",
    theme: "SST",
    title: "Saúde e Segurança do Trabalho",
    question: "Práticas mínimas de saúde e segurança do trabalho",
    tooltip: ""
  }),
  mk({
    id: 6,
    pillar: "S",
    category: "Social",
    categoryLabel: "Social (S)",
    theme: "Equidade",
    title: "Não Discriminação e Equidade",
    question: "Políticas de não discriminação e promoção da equidade",
    tooltip: ""
  }),
  mk({
    id: 7,
    pillar: "S",
    category: "Social",
    categoryLabel: "Social (S)",
    theme: "Fornecedores",
    title: "Cadeia de Suprimentos Responsável",
    question: "Critérios e acompanhamento de fornecedores e compras",
    tooltip: ""
  }),
  mk({
    id: 8,
    pillar: "S",
    category: "Social",
    categoryLabel: "Social (S)",
    theme: "Comunidade",
    title: "Engajamento Comunitário e Desenvolvimento Local",
    question: "Relação com a comunidade e impactos locais",
    tooltip: ""
  }),

  // =========================
  // Governança (G)
  // =========================
  mk({
    id: 9,
    pillar: "G",
    category: "Governança",
    categoryLabel: "Governança (G)",
    theme: "Governança",
    title: "Governança da Sustentabilidade",
    question: "Estruturas de governança voltadas para sustentabilidade",
    tooltip: ""
  }),
  mk({
    id: 10,
    pillar: "G",
    category: "Governança",
    categoryLabel: "Governança (G)",
    theme: "Integridade",
    title: "Ética, Integridade e Canal de Denúncias",
    question: "Regras de ética, integridade e mecanismos de denúncia",
    tooltip: ""
  }),
  mk({
    id: 11,
    pillar: "G",
    category: "Governança",
    categoryLabel: "Governança (G)",
    theme: "LGPD",
    title: "Proteção de Dados (LGPD)",
    question: "Políticas e práticas de proteção de dados pessoais",
    tooltip: ""
  }),
  mk({
    id: 12,
    pillar: "G",
    category: "Governança",
    categoryLabel: "Governança (G)",
    theme: "Riscos",
    title: "Gestão de Riscos e Continuidade de Negócios",
    question: "Identificação e tratamento de riscos e planos de continuidade",
    tooltip: ""
  })
];
