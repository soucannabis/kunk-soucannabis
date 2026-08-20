'use strict';

/** Helpers TipTap */
function t(text, marks) {
  const node = { type: 'text', text };
  if (marks) node.marks = marks;
  return node;
}
function bold(text) {
  return t(text, [{ type: 'bold' }]);
}
function v(name) {
  return { type: 'variable', attrs: { name } };
}
function p(...parts) {
  return { type: 'paragraph', content: parts.length ? parts : undefined };
}
function h2(text) {
  return { type: 'heading', attrs: { level: 2 }, content: [bold(text)] };
}

/** Trecho comum: adesão + identificação jurídica da associação. */
function adhesionIdentityTail() {
  return [
    t(', voluntariamente me comprometo pelo presente instrumento particular de adesão à '),
    v('association_full_name'),
    t(', pessoa jurídica de direito privado, inscrita no CNPJ nº '),
    v('association_cnpj'),
    t(', com sede em '),
    v('association_city'),
    t('-'),
    v('association_state'),
    t(', aqui denominada '),
    v('association_name'),
    t(
      ' ou Associação, com o objetivo de regulamentar a relação entre os associados e a associação mediante as cláusulas e condições a seguir enunciadas.'
    ),
  ];
}

/** Introdução do associado (sem paciente). */
function introSelf() {
  return p(
    t('Eu, '),
    v('responsible_full_name'),
    t(', de nacionalidade '),
    v('nationality'),
    t(', estado civil '),
    v('marital_status'),
    t(', portador do RG nº '),
    v('responsible_rg'),
    t(' - '),
    v('associate_rg_issuer'),
    t(', CPF nº '),
    v('responsible_cpf'),
    t(', email '),
    v('email'),
    t(', residente e domiciliado à '),
    v('street'),
    t(' nº '),
    v('street_number'),
    t(', bairro '),
    v('neighborhood'),
    t(', município de '),
    v('city'),
    t(', estado '),
    v('state'),
    t(', CEP '),
    v('cep'),
    ...adhesionIdentityTail()
  );
}

/** Introdução do responsável com paciente. */
function introWithPatient() {
  return p(
    t('Eu, '),
    v('responsible_full_name'),
    t(', de nacionalidade '),
    v('nationality'),
    t(', estado civil '),
    v('marital_status'),
    t(', portador do RG nº '),
    v('responsible_rg'),
    t(' - '),
    v('associate_rg_issuer'),
    t(', CPF nº '),
    v('responsible_cpf'),
    t(', e-mail '),
    v('email'),
    t(', residente e domiciliado à '),
    v('street'),
    t(', nº '),
    v('street_number'),
    t(', bairro '),
    v('neighborhood'),
    t(', município de '),
    v('city'),
    t(', estado '),
    v('state'),
    t(', CEP '),
    v('cep'),
    t(', responsável pelo tratamento de '),
    v('patient_full_name'),
    t(' CPF '),
    v('patient_cpf'),
    ...adhesionIdentityTail()
  );
}

function clauseValorSelf() {
  return [
    h2('CLÁUSULA TERCEIRA – DO VALOR DA ASSOCIAÇÃO'),
    p(
      t('A '),
      v('association_name'),
      t(' não cobra de Associados Pacientes nenhuma taxa de adesão ou mensalidade.')
    ),
  ];
}

function clauseValorWithPatient() {
  return [
    h2('CLÁUSULA TERCEIRA – DO VALOR DA ASSOCIAÇÃO'),
    p(
      t('3.1. - A '),
      v('association_name'),
      t(' não cobra de Associados Pacientes nenhuma taxa de adesão ou mensalidade.')
    ),
    p(
      t('3.2. - A '),
      v('association_name'),
      t(
        ' pode oferecer aos seus associados, mediante pagamento financeiro, produtos educativos para fins de ampliação do conhecimento acerca do uso consciente da Cannabis e de saúde integrativa.'
      )
    ),
    p(
      t(
        '3.3. - A aquisição de qualquer produto educativo pago não é obrigatória nem requisito necessário para se associar.'
      )
    ),
    p(
      t('3.4. - A '),
      v('association_name'),
      t(
        ' pode receber valores financeiros através da venda de produtos souvenirs e outros produtos agroecológicos e fitoterápicos produzidos por ela ou por parceiros.'
      )
    ),
    p(
      t('3.5. - A '),
      v('association_name'),
      t(
        ' aceita doações de associados que voluntariamente desejam contribuir financeiramente para a manutenção das atividades da associação.'
      )
    ),
  ];
}

function sharedClausesAfterValor() {
  return [
    h2('CLÁUSULA QUARTA – DOS DADOS PESSOAIS'),
    p(
      t(
        '4.1. - A Associação realizará o tratamento de dados pessoais, inclusive dados pessoais sensíveis, sempre em respeito ao melhor interesse dos associados, em conformidade com a Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018) e do Estatuto da Criança e Adolescente (Lei nº 8.069/1990);'
      )
    ),
    p(t('4.2. - Os dados requeridos pela Associação devem ser preenchidos pelo próprio associado;')),
    p(
      t(
        '4.3. - O preenchimento das informações referentes a menores de idade e incapazes devem ser feitos pelos seus responsáveis legais.'
      )
    ),

    h2('CLÁUSULA QUINTA – DOS DEVERES DOS ASSOCIADOS'),
    p(t('São deveres dos associados:')),
    p(
      t(
        '5.1. - Fornecer todas as informações e documentos solicitados pela Associação de forma transparente;'
      )
    ),
    p(
      t(
        '5.2. - Informar para a Associação, a partir da filiação, as patologias que se busca tratamento, os sintomas e o ano de diagnóstico.'
      )
    ),
    p(
      t(
        '5.3. - Fornecer informações referentes à continuidade e evolução do tratamento sempre que solicitado pela associação.'
      )
    ),

    h2('CLÁUSULA SEXTA – DO TRATAMENTO E RESPONSABILIDADE'),
    p(t('6. – Deve ser do conhecimento do associado:')),
    p(
      t(
        '6.1. - Art. 5º, RDC 327 da ANVISA determina que os produtos à base de Cannabis serão prescritos após esgotadas outras opções terapêuticas disponíveis no mercado brasileiro;'
      )
    ),
    p(
      t(
        '6.2. - Os medicamentos de Cannabis são de uso estritamente pessoal, sendo intransferível e proibida a sua entrega a terceiros, doações, venda ou qualquer outra utilização diferente da indicada pelo profissional prescritor;'
      )
    ),
    p(
      t(
        '6.3. - Os medicamentos de Cannabis ainda não possuem registro no Brasil, portanto, ainda não possuem a sua segurança e eficácia avaliada e comprovada pela ANVISA, quanto a reações adversas ao paciente;'
      )
    ),
    p(
      t(
        '6.4. – É de responsabilidade do paciente contatar a Associação imediatamente a equipe de suporte ou o profissional prescritor acompanhante na ocorrência dos seguintes sintomas: a) vertigem, b) tontura, c) crise de ansiedade.'
      )
    ),
    p(
      t(
        '6.5. - O associado paciente deve proceder com CAUTELA e RIGOR na administração e utilização desse composto, seguindo as orientações dos prescritores que o acompanham;'
      )
    ),
    p(
      t(
        '6.6. - O THC possui ampla aplicação medicinal, porém trata-se sabidamente de uma substância com alto poder “Anxiogenic” (Ansiogênico), ou seja, em algumas pessoas com predisposição a transtornos ansiosos o THC pode desencadear uma crise ansiosa quando administrado indevidamente.'
      )
    ),
    p(
      t(
        '6.7. - Caso o associado paciente possua histórico de crises nervosas, transtorno obsessivo compulsivo, transtorno bipolar, histeria, psicose ou qualquer outra patologia vinculada à ocorrência de episódios ansiosos ou alucinatórios, deve-se comunicar o profissional prescritor acompanhante, assim como a equipe de acolhimento do suporte terapêutico disponibilizada pela Associação;'
      )
    ),
    p(
      t(
        '6.8. - O associado paciente se responsabiliza integralmente pela correta administração de seus medicamentos. A responsabilidade de retirada ou acréscimo de medicamentos será única e exclusivamente do profissional prescritor responsável, ou da equipe de suporte terapêutico com anuência e determinação escrita do profissional prescritor responsável.'
      )
    ),
    p(
      t('6.9. - O associado signatário declara estar habilitado para o tratamento com derivados de cannabis, desonerando a '),
      v('association_full_name'),
      t(
        ' de quaisquer responsabilidade seja por agravamento da enfermidade e/ou patologia que possa vir a ocorrer, especialmente pelo uso inadequado ou fora das prescrições ou determinações do profissional prescritor.'
      )
    ),

    h2('CLÁUSULA SÉTIMA – DA LEGITIMIDADE DA ASSOCIAÇÃO EM ASSESSORAR A BUSCA E COMPRA DO REMÉDIO PARA O ASSOCIADO'),
    p(
      t(
        '7.1. - O associado paciente signatário do presente termo declara não possuir renda suficiente para suportar os custos do tratamento à base de cannabis a ele prescrito em prol de sua saúde, sendo-lhe impossível financeiramente importar este medicamento, tal como permite a ANVISA.'
      )
    ),
    p(
      t(
        '7.2. - Declara ainda que buscou maneiras de obter financiamento de seu tratamento junto aos órgãos competentes do Estado onde reside, obtendo ausência de resposta ou resposta negativa.'
      )
    ),
    p(
      t('7.3. – O associado paciente que assina este termo de adesão, legitima e autoriza expressamente a '),
      v('association_full_name'),
      t(
        ', tal como descrito no art. 5º, XXI, da Constituição Federal, a representá-lo na busca do melhor produto derivado da Cannabis que melhor lhe atenderia, tal como receitado pelo seu médico, levando em consideração, valor e qualidade, e também a intermediar a aquisição do remédio.'
      )
    ),

    h2('CLÁUSULA OITAVA – DAS REGRAS CONTIDAS NO TERMO DE ADESÃO'),
    p(
      t('8.1. – As determinações contidas nesse documento poderão ser revistas a qualquer momento pela '),
      v('association_full_name'),
      t(
        '. Assim ocorrendo, será disponibilizado novo documento para ter aprovação e assinatura do associado.'
      )
    ),

    p(v('city'), t(', '), v('current_date'), t('.')),
  ];
}

function sharedClausesBeforeValor() {
  return [
    h2('CLÁUSULA PRIMEIRA – DAS CONDIÇÕES INICIAIS'),
    p(
      t('Através do presente Termo de Adesão, o associado manifesta a sua vontade de adesão ao quadro de associados da '),
      v('association_name'),
      t(
        ', como associado paciente, declarando conhecer e concordar com as normas estatutárias, subordinando-se a elas e às cláusulas abaixo.'
      )
    ),
    p(
      t('§1º O acesso ao documento se dará através do cadastro de associação no site da '),
      v('association_name'),
      t(', endereço eletrônico: '),
      v('association_site'),
      t('.')
    ),
    p(
      t('§2º O referido cadastro será analisado pela '),
      v('association_name'),
      t(' para aprovação, conforme previsto no seu Estatuto;')
    ),

    h2('CLÁUSULA SEGUNDA – DO ASSOCIADO'),
    p(
      t(
        '2.1. – Poderão ser admitidos como Associados pessoas físicas capazes, maiores de 18 (dezoito) anos, nos termos do art. 18 do estatuto, sem distinção de sexo, cor, raça, classe social ou credo.'
      )
    ),
    p(
      t('2.2. - No caso de busca de tratamento para menor de idade ou incapaz, a associação junto à '),
      v('association_name'),
      t(' deve ser feita exclusivamente por representante legal.')
    ),
    p(
      t(
        '2.3. - O preenchimento do presente termo de adesão oferece ao associado a categoria de Associado Paciente, conforme art. 11, inciso II do Estatuto vigente.'
      )
    ),
  ];
}

function buildDoc(kind) {
  const intro = kind === 'with_patient' ? introWithPatient() : introSelf();
  const valor = kind === 'with_patient' ? clauseValorWithPatient() : clauseValorSelf();
  return {
    type: 'doc',
    content: [intro, ...sharedClausesBeforeValor(), ...valor, ...sharedClausesAfterValor()],
  };
}

function defaultTitle(associationFullName) {
  const name = (associationFullName || 'Kunk').trim() || 'Kunk';
  return `Termo de Adesão à ${name}`;
}

module.exports = {
  buildDoc,
  defaultTitle,
  DEFAULT_SELF_CONTENT: buildDoc('self'),
  DEFAULT_WITH_PATIENT_CONTENT: buildDoc('with_patient'),
};
