// src/i18n/ptBR.js
//
// Dicionário base (pt‑BR) para textos institucionais do Selo NCS.  Este
// arquivo exporta um objeto flat com todas as chaves utilizadas no front
// (programa, suporte, localização, selos etc.).  Cada chave usa notação
// ponto (namespace.key) para facilitar a composição e a fusão com
// configurações de marca.  Modifique aqui para ajustar o idioma ou
// atualizar o padrão global.  Overrides específicos de marca são
// aplicados em tempo de execução via src/i18n/index.js.

export default Object.freeze({
  // Nome completo do programa.  Ex.: "NCS: Governança & Impacto".
  'program.name_full': 'NCS: Governança & Impacto',
  // Nome curto do programa.  Ex.: "NCS".
  'program.name_short': 'NCS',
  // Nome do selo.  Ex.: "Selo NCS".
  'program.seal_name': 'Selo NCS',
  // Endereço de e‑mail de suporte ou contato.
  'support.email': 'coordenacao@comunidade-ncs.org',
  // Número/canal de WhatsApp de suporte (pode ser vazio).
  'support.whatsapp': '',
  // URL base para documentos legais (Regulamentos, Termos etc.).
  'legal.base_url': '/docs',
  // Logo principal (src relativo) usado em navbar e header.
  'logo.primary': '/images/ncs-logo.png',
  // Logo de parceiro (src relativo) usado em navbar e footer.  Pode ser
  // vazio ou ausente para ocultar o logo de parceiro.
  'logo.partner': '/images/logo-intuel.png',
  // Rótulo de localização exibido no rodapé.  Inclui cidade e
  // organização responsável.  Ex.: "Londrina, PR • NCS (INTUEL/UEL)".
  'location.label': 'Londrina, PR • NCS (INTUEL/UEL)',
  // Texto de copyright exibido no rodapé.
  'footer.copyright': '© 2026 NCS — Governança & Impacto.',

  // Nome completo da operação/plataforma.  Define a entidade que opera
  // tecnicamente a plataforma do selo (separada da gestão e decisão do
  // Programa).  Ex.: "Operação da Plataforma".
  'operator.name_full': 'Operação da Plataforma',
  // Nome curto da operação/plataforma.  Ex.: "Operação".
  'operator.name_short': 'Operação',
});