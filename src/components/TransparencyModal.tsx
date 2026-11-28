import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  EyeOff,
  HelpCircle,
  Lock,
  Scale,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { ExpressiveModal, ModalHeader } from './expressive/ExpressiveModal';
import { useM3Theme } from '../theme/ThemeContext';

export interface TransparencySection {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  paragraphs: React.ReactNode[];
  example?: {
    title: string;
    body: React.ReactNode;
  };
  bullets?: Array<{ label: string; detail: React.ReactNode }>;
  nerdNote?: {
    title?: string;
    body: React.ReactNode;
  };
}

interface DeepTransparencyModalProps {
  ariaLabel: string;
  eyebrow: string;
  title: string;
  intro: React.ReactNode;
  icon: React.ReactNode;
  sections: TransparencySection[];
  onClose: () => void;
}

const DeepTransparencyModal: React.FC<DeepTransparencyModalProps> = ({
  ariaLabel,
  eyebrow,
  title,
  intro,
  icon,
  sections,
  onClose,
}) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [openNerdIds, setOpenNerdIds] = useState<Record<string, boolean>>({});

  const toggleNerd = (id: string) => {
    setOpenNerdIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <ExpressiveModal ariaLabel={ariaLabel} onClose={onClose} maxWidth={680}>
      {(close) => (
        <>
          <ModalHeader icon={icon} eyebrow={eyebrow} title={title} onClose={() => close()} />

          <p
            style={{
              margin: '12px 0 16px',
              fontSize: '0.86rem',
              lineHeight: 1.55,
              color: tokens.onSurfaceVariant,
            }}
          >
            {intro}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sections.map((sec) => {
              const nerdOpen = Boolean(openNerdIds[sec.id]);
              return (
                <article
                  key={sec.id}
                  style={{
                    padding: '15px 16px',
                    borderRadius: isMaterialYou ? 20 : 12,
                    backgroundColor: tokens.surfaceContainer,
                    border: `1px solid ${tokens.outlineVariant}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: isMaterialYou ? 12 : 8,
                        backgroundColor: tokens.primaryContainer,
                        color: tokens.onPrimaryContainer,
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {sec.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: '0.94rem',
                          fontWeight: 800,
                          color: tokens.onSurface,
                          lineHeight: 1.3,
                        }}
                      >
                        {sec.title}
                      </h3>
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: tokens.primary,
                          fontWeight: 600,
                          marginTop: 2,
                        }}
                      >
                        {sec.subtitle}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      fontSize: '0.84rem',
                      lineHeight: 1.58,
                      color: tokens.onSurfaceVariant,
                    }}
                  >
                    {sec.paragraphs.map((p, idx) => (
                      <p key={idx} style={{ margin: 0 }}>
                        {p}
                      </p>
                    ))}
                  </div>

                  {sec.bullets && sec.bullets.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        paddingLeft: 2,
                      }}
                    >
                      {sec.bullets.map((b, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 8,
                            fontSize: '0.82rem',
                            lineHeight: 1.5,
                            color: tokens.onSurfaceVariant,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 999,
                              backgroundColor: tokens.primary,
                              flexShrink: 0,
                              marginTop: 7,
                            }}
                          />
                          <div>
                            <strong style={{ color: tokens.onSurface }}>{b.label}:</strong>{' '}
                            {b.detail}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {sec.example && (
                    <div
                      style={{
                        padding: '11px 13px',
                        borderRadius: isMaterialYou ? 14 : 8,
                        backgroundColor: tokens.surfaceContainerHigh,
                        borderLeft: `3px solid ${tokens.primary}`,
                        fontSize: '0.81rem',
                        lineHeight: 1.52,
                        color: tokens.onSurface,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          color: tokens.primary,
                          marginBottom: 4,
                        }}
                      >
                        {sec.example.title}
                      </div>
                      <div style={{ color: tokens.onSurfaceVariant }}>{sec.example.body}</div>
                    </div>
                  )}

                  {sec.nerdNote && (
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleNerd(sec.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: `1px solid ${tokens.outlineVariant}`,
                          backgroundColor: tokens.surfaceContainerLow,
                          color: tokens.primary,
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{sec.nerdNote.title ?? 'Ver detalhe técnico / fórmula'}</span>
                        {nerdOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                      {nerdOpen && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: '10px 12px',
                            borderRadius: isMaterialYou ? 12 : 8,
                            backgroundColor: tokens.surfaceContainerLowest,
                            border: `1px solid ${tokens.outlineVariant}`,
                            fontSize: '0.78rem',
                            lineHeight: 1.55,
                            color: tokens.onSurfaceVariant,
                          }}
                        >
                          {sec.nerdNote.body}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </ExpressiveModal>
  );
};

// ---------------------------------------------------------------------------
// 1. BOLETIM TRANSPARENCY MODAL
// ---------------------------------------------------------------------------

export const BoletimTransparencyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sections: TransparencySection[] = [
    {
      id: 'boletim-meta-24',
      icon: <Calculator size={17} />,
      title: 'Como calculamos sua média e a Meta de 24 pontos',
      subtitle: 'Regra de aprovação direta do CTI e média real durante o ano',
      paragraphs: [
        <>
          No CTI, a aprovação direta exige <strong>média anual ≥ 6,0</strong> ao longo dos 4 bimestres — o que
          equivale a somar <strong>24,0 pontos</strong> (de um máximo de 40,0).
        </>,
        <>
          O portal oficial do NSAC costuma dividir seus pontos acumulados por <strong>4</strong> mesmo quando só
          saíram 1 ou 2 bimestres, fazendo parecer que você está com média 4,5 no meio do ano. Aqui no{' '}
          <strong>n²sac</strong>, mostramos a <strong>média real dos bimestres já lançados</strong> para você saber
          como está indo agora, e calculamos separadamente quanto falta nos bimestres restantes para fechar os 24,0
          pontos.
        </>,
      ],
      example: {
        title: 'Exemplo prático',
        body: (
          <>
            Se você tirou <strong>8,0</strong> no 1ºB e <strong>7,0</strong> no 2ºB, já somou{' '}
            <strong>15,0 pontos</strong>. Sua média real até agora é <strong>7,50</strong> (15 ÷ 2). Para fechar 24,0
            nos 2 bimestres restantes, faltam <strong>9,0 pontos</strong> — ou seja, média{' '}
            <strong>4,5 por bimestre</strong>. Se você já passou de 24,0 pontos (ex.: 28,0 pts), mostramos{' '}
            <strong>Aprovado (+1,00 na média)</strong> porque mesmo com 0 nos próximos bimestres sua média final
            mínima já é 7,00.
          </>
        ),
      },
    },
    {
      id: 'boletim-zeros-rec',
      icon: <CheckCircle2 size={17} />,
      title: 'Bimestres não lançados (0,0 do NSAC), Recuperações e Faltas',
      subtitle: 'Como evitamos falsos alertas e interpretamos códigos oficiais',
      paragraphs: [
        <>
          Quando um professor ainda não fechou um bimestre, o NSAC devolve <strong>0,0</strong> na sua nota (M.B.) e{' '}
          <strong>0,0</strong> na média da turma (M.T.), com código <strong>NAC</strong> (Não Aconteceu). O n²sac
          detecta automaticamente esses placeholders e <strong>não conta como nota zero</strong>, evitando derrubar sua
          média geral ou gerar falsas quedas de evolução.
        </>,
      ],
      bullets: [
        {
          label: 'M.B. vs M.T.',
          detail: (
            <>
              <strong>M.B.</strong> é a sua Média Bimestral; <strong>M.T.</strong> é a Média oficial da sua Turma
              fornecida pelo NSAC naquela matéria e bimestre.
            </>
          ),
        },
        {
          label: 'Códigos de Recuperação',
          detail: (
            <>
              <strong>NAC</strong> = não precisou; <strong>SAT</strong> = recuperação satisfatória (aprovou);{' '}
              <strong>INS</strong> = insatisfatória; <strong>NC</strong> = não compareceu.
            </>
          ),
        },
        {
          label: 'Distribuição de Faltas',
          detail:
            'Mostramos quantas faltas você acumulou em cada bimestre e qual disciplina concentra a maior fatia — útil para nunca estourar o limite de 25% de faltas por matéria.',
        },
      ],
    },
    {
      id: 'boletim-dados',
      icon: <Database size={17} />,
      title: 'Como os dados do seu Boletim são sincronizados e usados',
      subtitle: 'O que guardamos, o que fica local e quem pode ver',
      paragraphs: [
        <>
          Quando você entra ou atualiza o boletim, o servidor do n²sac consulta o portal do NSAC usando sua sessão
          criptografada e salva um espelho estruturado das suas notas e faltas no banco de dados vinculado apenas à sua
          conta.
        </>,
        <>
          <strong>Ninguém vê o seu boletim completo.</strong> Mesmo que você participe do Ranking, colegas só veem sua
          média agregada (ou comparação matéria a matéria quando ambos participam). Se você ativar o{' '}
          <strong>Modo Invisível</strong> no Perfil, suas notas ficam restritas 100% à sua tela pessoal e nem entram
          nas estatísticas coletivas.
        </>,
      ],
      nerdNote: {
        title: 'Ver detalhe técnico sobre PDF e cache',
        body: (
          <>
            Ao clicar em <strong>Compartilhar PDF</strong>, o servidor gera o PDF em memória a partir das suas notas já
            sincronizadas e envia diretamente ao seu aparelho — nenhum arquivo PDF fica salvo em disco no servidor. O
            boletim também usa validação <code>ETag / 304 Not Modified</code> para economizar dados móveis.
          </>
        ),
      },
    },
  ];

  return (
    <DeepTransparencyModal
      ariaLabel="Como funciona o Boletim"
      eyebrow="Transparência • Boletim"
      title="Como calculamos seu Boletim"
      intro="Tudo que aparece nesta tela nasce direto dos dados oficiais do NSAC, tratados para mostrar sua situação real sem distorções. Veja exatamente o que cada número significa."
      icon={<BookOpen size={20} />}
      sections={sections}
      onClose={onClose}
    />
  );
};

// ---------------------------------------------------------------------------
// 2. RANKING TRANSPARENCY MODAL (Strictly Ranking — zero INI A/B here!)
// ---------------------------------------------------------------------------

export const RankingTransparencyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sections: TransparencySection[] = [
    {
      id: 'ranking-turma-vs-cti',
      icon: <Scale size={17} />,
      title: 'Na sua turma vs. Entre turmas diferentes (Todo o CTI)',
      subtitle: 'Por que a média direta funciona na mesma sala, mas precisa de ajuste entre cursos',
      paragraphs: [
        <>
          Quando você olha o filtro <strong>Minha Turma</strong>, todo mundo fez exatamente as mesmas provas com os
          mesmos professores — então vale a sua <strong>média bruta direta</strong> (com proteção contra boletim
          incompleto).
        </>,
        <>
          Já em filtros com várias turmas (<strong>Mesmo Ano</strong>, <strong>Curso</strong> ou{' '}
          <strong>Todo o CTI</strong>), comparar médias brutas sem contexto seria injusto: existem salas e cursos com
          média oficial (M.T.) em torno de 6,8 e outros acima de 8,3. Para equilibrar, o motor estima a dificuldade
          oficial de cada matéria e turma (via regressão hierárquica sobre as M.T.s oficiais) e mede o quanto você se
          destaca acima da sua sala.
        </>,
        <>
          <strong>Como atribuímos o Score CTI (de 0,00 a 10,00):</strong> nos filtros entre turmas diferentes,
          exibimos o <strong>Score CTI</strong> de <strong>0,00 a 10,00</strong> (sempre em ordem decrescente, com sua
          média real do boletim logo abaixo — <strong>sua nota oficial nunca muda!</strong>). Primeiro calculamos o
          ponto-base da sua turma comparando as M.T.s dela com o padrão global do CTI. Se você está{' '}
          <strong>acima da média da turma</strong>, o Score CTI cresce proporcionalmente à fração do espaço até o{' '}
          <strong>10,00</strong> que você conquistou (<em>Headroom</em>) — garantindo que quem gabarita com média{' '}
          <strong>10,00</strong> (cobertura completa) receba <strong>Score CTI 10,00</strong> em qualquer sala e{' '}
          <strong>nunca perca</strong> por causa da sua turma. Se você está <strong>abaixo da média da turma</strong>,
          o Score CTI desce conforme quantos desvios-padrão você está abaixo da sala.
        </>,
      ],
      bullets: [
        {
          label: '9,00 a 10,00 — Topo do CTI',
          detail:
            'Desempenho excepcional, muito acima da M.T. da sua sala. 10,00 fechado significa gabarito perfeito com cobertura completa.',
        },
        {
          label: '7,80 a 8,99 — Acima do padrão',
          detail:
            'Você está bem acima da média da sua turma e se destaca no recorte geral do CTI.',
        },
        {
          label: '6,80 a 7,79 — Ritmo médio do CTI',
          detail:
            'Faixa típica de quem acompanha de perto a média oficial (M.T.) da própria sala — totalmente normal mesmo que sua nota bruta seja um pouco maior em turmas com M.T. alta.',
        },
        {
          label: '5,50 a 6,79 — Abaixo da média da sala',
          detail:
            'Indica distância abaixo da M.T. da sua turma (você pode estar aprovado com folga no boletim, apenas abaixo da média dos colegas).',
        },
        {
          label: '0,00 a 5,49 — Ponto de atenção',
          detail:
            'Bem abaixo do padrão da turma ou ainda com poucas disciplinas lançadas no recorte.',
        },
      ],
      example: {
        title: 'Exemplo numérico real',
        body: (
          <>
            Imagine a Turma A (M.T. 8,20) e a Turma B (M.T. 7,00). Um aluno com <strong>9,60 na Turma B</strong>{' '}
            conquistou 86,7% do espaço entre 7,00 e 10,00, podendo superar um aluno com{' '}
            <strong>9,70 na Turma A</strong> (83,3% do espaço entre 8,20 e 10,00). Porém, se alguém na Turma A tirar{' '}
            <strong>10,00 fechado</strong> (100% do espaço), fica automaticamente em 1º lugar.
          </>
        ),
      },
      nerdNote: {
        title: 'Ver fórmula do Motor Estatístico v7',
        body: (
          <>
            Estimamos <code>M_hat(c,s,b) ≈ μ₀ + θ_c + δ_(s,b) + γ_(s,ℓ)</code> via Ridge Hierárquico (λ_θ=8,
            λ_δ=0.01, λ_γ=2) sobre contas visíveis. Acima da média da sala,{' '}
            <code>h = (μ_i - M̄_c) / max(0.5, 10 - M̄_c)</code> e{' '}
            <code>S_avg = base_c + (10 - base_c) · Φ(h)</code>, onde <code>base_c = μ₀ + 0.5·θ_c</code>. Abaixo da
            média da sala, usamos o z-score empírico-Bayesiano com <code>σ_c</code> regularizado, contínuo em{' '}
            <code>μ_i = M̄_c</code>. A <strong>Meta pro 1º lugar</strong> é a inversa fechada exata dessa equação na
            sua sala.
          </>
        ),
      },
    },
    {
      id: 'ranking-4-modos',
      icon: <Trophy size={17} />,
      title: 'Como funcionam as 4 abas e o Ranking de Salas',
      subtitle: 'Média, Destaque vs. Sala, Maior Evolução, Constância e Salas',
      paragraphs: [
        <>
          Cada aba mede uma habilidade acadêmica diferente — e todas exigem cobertura mínima de notas para entrar no
          bloco oficial:
        </>,
      ],
      bullets: [
        {
          label: 'Média',
          detail:
            'Sua média geral (na mesma turma) ou nota calibrada com proteção do teto 10,00 (entre turmas diferentes).',
        },
        {
          label: 'Destaque vs. Sala',
          detail:
            'Diferença média entre a sua nota e a M.T. oficial da sua turma nas mesmas matérias e bimestres (pareamento exato 1-para-1).',
        },
        {
          label: 'Maior Evolução',
          detail:
            'Mede quanto sua média subiu do bimestre anterior para o mais recente, comparando estritamente as mesmas disciplinas nos dois bimestres.',
        },
        {
          label: 'Constância (sem punir nota 10!)',
          detail:
            'Muitos rankings usam desvio-padrão puro — o que pune quem tira 10 em uma matéria porque "aumenta a variação". Nós usamos o equivalente de certeza CARA (β=0,55) com penalidade suave abaixo de 6,0: subir qualquer nota SEMPRE melhora sua constância, mas notas baixas isoladas pesam mais do que notas altas.',
        },
        {
          label: 'Ranking de Salas',
          detail:
            'Usa o consenso mediano das M.T.s oficiais do NSAC (imune a notas individuais ou alunos fora do ranking), exigindo quórum mínimo de alunos ativos (3 no Integrado, 2 no Noturno).',
        },
      ],
    },
    {
      id: 'ranking-provisorio',
      icon: <Sparkles size={17} />,
      title: 'Selo "Provisório" e proteção contra boletim incompleto',
      subtitle: 'Por que 1 única nota 10 não rouba o 1º lugar',
      paragraphs: [
        <>
          No início de um bimestre ou quando faltam muitas matérias lançadas, um aluno com apenas 1 ou 2 notas 10
          poderia aparecer artificialmente na frente de quem já tem 16 disciplinas avaliadas.
        </>,
        <>
          Para impedir isso, calculamos sua <strong>Cobertura 2D</strong> (quantas disciplinas × bimestres esperados
          da sua turma já estão no seu boletim). Quem ainda está abaixo do limite entra como{' '}
          <strong>Provisório</strong> (posicionado abaixo dos alunos qualificados e sem distorcer o percentil Top X%),
          e aplicamos um encolhimento conservador proporcional às notas faltantes.
        </>,
      ],
    },
    {
      id: 'ranking-privacidade',
      icon: <EyeOff size={17} />,
      title: 'Privacidade: o que cada opção muda no Ranking',
      subtitle: 'Você decide exatamente como (ou se) aparece',
      paragraphs: [
        <>
          Você tem controle granular sobre sua presença no Ranking e pode mudar a qualquer segundo:
        </>,
      ],
      bullets: [
        {
          label: 'Participar com nome',
          detail:
            'Seu nome, turma e média aparecem no ranking, seu perfil público fica acessível e colegas podem comparar matérias com você.',
        },
        {
          label: 'Ocultar Meu Nome (Anônimo)',
          detail:
            'Você entra na disputa como "Aluno #XXX", sem foto, sem tags e sem perfil clicável.',
        },
        {
          label: 'Sair do Ranking',
          detail:
            'Você desaparece totalmente da lista pública, mas ainda vê seu resumo privado ("Onde você estaria: #X de Y") visível só para você.',
        },
        {
          label: 'Modo Invisível (no Perfil)',
          detail:
            'Barreira absoluta: além de sair do ranking e da busca, suas notas são excluídas de TODOS os cálculos estatísticos do servidor (M.T. consenso, dispersão, Ridge e ranking de salas).',
        },
      ],
    },
  ];

  return (
    <DeepTransparencyModal
      ariaLabel="Como o Ranking funciona"
      eyebrow="Transparência • Ranking"
      title="Como o Ranking funciona?"
      intro="Entenda em detalhes como calculamos posições na sua turma e no CTI inteiro, por que o sistema é justo entre cursos diferentes e como sua privacidade é respeitada."
      icon={<Trophy size={20} />}
      sections={sections}
      onClose={onClose}
    />
  );
};

// ---------------------------------------------------------------------------
// 3. TURMA TRANSPARENCY MODAL (Home of INI A/B classification + Classroom Hub)
// ---------------------------------------------------------------------------

export const TurmaTransparencyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sections: TransparencySection[] = [
    {
      id: 'turma-ini-ab',
      icon: <Users size={17} />,
      title: 'Como identificamos sua turma (e a separação automática INI A / INI B)',
      subtitle: 'Leitura da Ficha de Avaliação + impressão digital das Médias da Turma (M.T.)',
      paragraphs: [
        <>
          Na maioria dos cursos do CTI (como <strong>ELI</strong>, <strong>MEI</strong>, <strong>INF</strong>,{' '}
          <strong>ELE</strong>, <strong>MEC</strong>), o código da turma no boletim do NSAC já identifica exatamente a
          sua sala.
        </>,
        <>
          Já no <strong>Integrado de Informática (INI1, INI2 e INI3)</strong>, existem duas salas físicas (
          <strong>A</strong> e <strong>B</strong>), mas o boletim do NSAC exibe apenas <code>INI1</code>,{' '}
          <code>INI2</code> ou <code>INI3</code> — sem a letra! Para não misturar alunos de turmas físicas diferentes,
          o n²sac combina dois sinais 100% automáticos:
        </>,
      ],
      bullets: [
        {
          label: '1. Âncora oficial da Ficha de Avaliação',
          detail:
            'Quando o NSAC libera a Ficha de Avaliação em PDF de qualquer aluno ativo daquele ano, o documento contém o código completo (ex.: INI3A ou INI3B). O servidor lê apenas esse código de turma no PDF (sem armazenar o PDF) para saber qual grupo é A e qual é B.',
        },
        {
          label: '2. Assinatura matemática das M.T.s',
          detail:
            'Como alunos da mesma sala física têm exatamente a mesma Média da Turma (M.T.) em dezenas de células (matéria × bimestre), comparamos o vetor de M.T.s de cada aluno de INI com as âncoras ativas do ano. Quem bate com a M.T. da turma A vira INI3A; quem diverge sistematicamente nas M.T.s entra automaticamente em INI3B.',
        },
        {
          label: '3. Proteção contra ex-alunos e turmas vazias',
          detail:
            'Só usamos âncoras de contas visíveis com notas ativas naquele ano letivo — assim, um ex-aluno do ano passado nunca cria uma turma fantasma nem bagunça o ano atual.',
        },
      ],
      example: {
        title: 'Por que isso funciona tão bem na prática?',
        body: (
          <>
            Mesmo que apenas <strong>1 único aluno</strong> do INI3 tenha a Ficha de Avaliação identificada como{' '}
            <strong>INI3A</strong>, todos os colegas com as mesmas M.T.s nas matérias de 2026 recebem{' '}
            <strong>INI3A</strong> automaticamente, e os alunos cujas M.T.s são diferentes em quase todas as matérias
            são classificados com segurança como <strong>INI3B</strong>.
          </>
        ),
      },
    },
    {
      id: 'turma-quorum-eleicoes',
      icon: <ShieldCheck size={17} />,
      title: 'Quórum mínimo, Eleições de Representantes e Canal ao Vivo',
      subtitle: 'Como mantemos o espaço da turma organizado e seguro',
      paragraphs: [
        <>
          O Canal da Turma é exclusivo para alunos identificados naquela mesma turma e ano letivo. Para liberar o
          mural de anúncios e os chats, exigimos pelo menos <strong>6 alunos cadastrados</strong> na sala — isso evita
          que uma única pessoa crie um canal isolado e garante eleições legítimas de representantes.
        </>,
      ],
      bullets: [
        {
          label: 'Representantes eleitos',
          detail:
            'Podem fixar avisos importantes (provas, trabalhos, datas), personalizar banner/foto do canal e moderar recados da turma.',
        },
        {
          label: 'Atualizações em tempo real (SSE)',
          detail:
            'Mensagens, reações e novos anúncios chegam instantaneamente por conexão em tempo real enquanto você está com o app aberto, e via push quando está em segundo plano.',
        },
      ],
    },
  ];

  return (
    <DeepTransparencyModal
      ariaLabel="Como funciona o Canal da Turma"
      eyebrow="Transparência • Turma"
      title="Como sua Turma é organizada"
      intro="Entenda como detectamos automaticamente sua sala (incluindo a separação entre INI A e INI B) e como funcionam os canais e eleições da turma."
      icon={<Users size={20} />}
      sections={sections}
      onClose={onClose}
    />
  );
};

// ---------------------------------------------------------------------------
// 4. SENTINELA TRANSPARENCY MODAL
// ---------------------------------------------------------------------------

export const SentinelaTransparencyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sections: TransparencySection[] = [
    {
      id: 'sentinela-o21',
      icon: <Bell size={17} />,
      title: 'Como o Sentinela avisa de notas novas sem sobrecarregar o NSAC',
      subtitle: 'Monitoramento inteligente por turma — escala O(21) em vez de centenas de acessos',
      paragraphs: [
        <>
          Em vez de fazer login na conta de centenas de alunos o tempo todo (o que deixaria o portal do NSAC lento ou
          derrubaria o sistema da escola), o <strong>Sentinela</strong> monitora apenas{' '}
          <strong>1 representante técnico por turma</strong> (~21 turmas no CTI inteiro).
        </>,
        <>
          Como qualquer lançamento de nota de uma disciplina altera a <strong>Média da Turma (M.T.)</strong> no boletim
          de todos os alunos daquela sala ao mesmo tempo, basta detectar a mudança na M.T. da turma para saber que um
          professor acabou de lançar notas — e só então sincronizar os boletins individuais dos alunos daquela sala
          para disparar a notificação personalizada.
        </>,
      ],
      bullets: [
        {
          label: 'Modo Frio vs. Modo Quente',
          detail:
            'Em semanas tranquilas sem lançamento, o intervalo é bem espaçado. Assim que uma primeira nota sai na sua turma, o Sentinela entra em modo intenso (verificando com muito mais frequência) porque professores costumam fechar várias matérias na mesma janela.',
        },
        {
          label: 'Probabilidade de Lançamento',
          detail:
            'A barra percentual que você vê nesta tela usa o histórico real de datas em que os bimestres costumam ser fechados no CTI para estimar se estamos em janela quente de lançamentos.',
        },
        {
          label: 'Recuperação individual é privada',
          detail:
            'Se apenas uma nota individual muda (como recuperação SAT/INS) sem alterar a M.T. da turma, a notificação vai exclusivamente para você — nunca para seus colegas.',
        },
      ],
    },
    {
      id: 'sentinela-push',
      icon: <Lock size={17} />,
      title: 'Como funcionam as notificações (Android e Discord)',
      subtitle: 'Dados mínimos, controle total e silenciamento a qualquer hora',
      paragraphs: [
        <>
          As notificações no Android usam mensagens de alta prioridade (FCM) processadas diretamente pelo aplicativo no
          seu celular — permitindo acumular várias notas novas em um aviso limpo e abrir direto na matéria lançada.
        </>,
        <>
          Se você preferir não ver a nota exata na tela de bloqueio, pode ajustar o modo discreto ou desativar
          notificações totalmente em <strong>Configurações</strong>.
        </>,
      ],
    },
  ];

  return (
    <DeepTransparencyModal
      ariaLabel="Como o Sentinela funciona"
      eyebrow="Transparência • Sentinela"
      title="Como o Sentinela monitora suas notas"
      intro="Veja como conseguimos avisar quase na hora quando sai nota nova no NSAC, respeitando o servidor do CTI e a privacidade de cada aluno."
      icon={<Bell size={20} />}
      sections={sections}
      onClose={onClose}
    />
  );
};

// ---------------------------------------------------------------------------
// 5. PROFILE / DATA PRIVACY TRANSPARENCY MODAL
// ---------------------------------------------------------------------------

export const PrivacyDataTransparencyModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const sections: TransparencySection[] = [
    {
      id: 'priv-credenciais',
      icon: <Lock size={17} />,
      title: 'Como protegemos sua conta e senha do NSAC',
      subtitle: 'Criptografia autenticada AES-256-GCM e zero exposição em logs',
      paragraphs: [
        <>
          Para que o n²sac consiga buscar seu boletim e enviar alertas automáticos mesmo quando a sessão do NSAC
          expira, suas credenciais e cookies de sessão ficam criptografados no banco de dados com{' '}
          <strong>AES-256-GCM</strong> (criptografia autenticada com nonce único por gravação).
        </>,
        <>
          Sua senha <strong>nunca</strong> aparece em logs, respostas da API ou mensagens de erro. O token do aplicativo
          fica apenas no seu dispositivo, e ao clicar em <strong>Sair da conta</strong> a sessão é revogada
          imediatamente.
        </>,
      ],
    },
    {
      id: 'priv-mapa-dados',
      icon: <Database size={17} />,
      title: 'Onde seus dados são usados em cada área do app',
      subtitle: 'Mapa transparente de ponta a ponta',
      paragraphs: [
        <>Cada informação que você tem no n²sac serve a um propósito específico e controlado por você:</>,
      ],
      bullets: [
        {
          label: 'Boletim & Frequência',
          detail:
            'Notas, M.T.s, recuperações e faltas vindas do NSAC — visíveis por padrão apenas para você.',
        },
        {
          label: 'Ranking & Comparação 1v1',
          detail:
            'Só exibe seu nome, média ou comparação se você optar por participar. Você pode ficar anônimo ou sair do ranking mantendo seu resumo privado.',
        },
        {
          label: 'Perfil Público, Amigos & Chat',
          detail:
            'Bio, foto, banner e conexões (Discord/GitHub/etc.) só ficam visíveis conforme suas configurações de perfil público e solicitações de amizade.',
        },
        {
          label: 'Nome oficial via Google (@unesp.br)',
          detail:
            'Opcional (usado quando o e-mail abrevia seu nome). Lemos apenas seu nome completo oficial verificado pelo Google institucional da UNESP — sem acesso ao seu Gmail, Drive ou outros dados.',
        },
      ],
    },
    {
      id: 'priv-invisivel',
      icon: <ShieldCheck size={17} />,
      title: 'O que o Modo Invisível realmente garante',
      subtitle: 'Isolamento matemático total — não é apenas "esconder da tela"',
      paragraphs: [
        <>
          Ativar o <strong>Modo Invisível</strong> aciona uma barreira rígida no servidor: sua conta some do Ranking,
          some da busca de alunos, bloqueia perfil público e é <strong>100% removida dos cálculos estatísticos</strong>{' '}
          (não entra no consenso de M.T., não altera o nível θ da turma, não conta no Ranking de Salas e não aparece em
          destaques).
        </>,
        <>
          Mesmo invisível, você continua usando normalmente seu Boletim, PDF, Frequência, Sentinela e até o seu resumo
          privado de "onde você estaria" no Ranking (calculado isoladamente sem afetar nenhum outro aluno).
        </>,
      ],
    },
  ];

  return (
    <DeepTransparencyModal
      ariaLabel="Transparência de Dados e Privacidade"
      eyebrow="Transparência • Dados & Privacidade"
      title="Como seus dados são usados no n²sac"
      intro="Sem letras miúdas: veja exatamente o que guardamos, como protegemos sua conta do NSAC e como cada controle de privacidade funciona por dentro."
      icon={<ShieldCheck size={20} />}
      sections={sections}
      onClose={onClose}
    />
  );
};

export const TransparencyTriggerButton: React.FC<{
  label?: string;
  onClick: () => void;
}> = ({ label = 'Como funciona?', onClick }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '6px 11px',
        borderRadius: isMaterialYou ? 999 : 8,
        border: `1px solid ${tokens.outlineVariant}`,
        backgroundColor: isMaterialYou ? tokens.surfaceContainerLow : tokens.background,
        color: tokens.onSurfaceVariant,
        fontSize: '0.74rem',
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <HelpCircle size={13} />
      <span>{label}</span>
    </button>
  );
};
