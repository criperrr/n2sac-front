import React, { useState } from 'react';
import {
  ClipboardList,
  Clock,
  DoorOpen,
  Globe,
  ExternalLink,
  CheckCircle2,
  Lock,
  Printer,
  Info,
  Calendar,
  UserCheck,
} from 'lucide-react';
import { NsacApiClientError, requestFichaPdfLink } from '../api/nsacClient';
import { openExternalUrl, preopenTabForWeb } from '../platform/openExternal';
import type {
  AtrasoRecord,
  FichaAvaliacaoEntry,
  HomeInfo,
  SaidaRecord,
} from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import {
  EnhancedConnectedButtonGroup,
  EnhancedMorphButton,
  ExpressiveSegmentedCard,
  IconShapeContainer,
} from '../components/expressive/ExpressivePrimitives';
import { MorphingShapeIndicator } from '../components/expressive/ShapeMorph';

type AuxSection = 'fichas' | 'atrasos' | 'saidas' | 'portal';

export const FrequenciaScreen: React.FC<{
  token: string;
  accountId: number;
  fichas: FichaAvaliacaoEntry[];
  atrasos: AtrasoRecord[];
  saidas: SaidaRecord[];
  homeInfo: HomeInfo | null;
}> = ({ token, fichas, atrasos, saidas, homeInfo }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [section, setSection] = useState<AuxSection>('fichas');
  const [openingFichaId, setOpeningFichaId] = useState<number | null>(null);
  const [fichaMessage, setFichaMessage] = useState<{ id: number; text: string; error: boolean } | null>(null);

  /** Opens the ficha PDF (as the NSAC serves it) in the browser, ready to print or save. */
  const openFichaPdf = async (id: number) => {
    const tab = preopenTabForWeb();
    setOpeningFichaId(id);
    setFichaMessage(null);
    try {
      const url = await requestFichaPdfLink(token, id);
      if (openExternalUrl(url, tab) === 'needs-apk-update') {
        setFichaMessage({
          id,
          text: 'Atualize o app (APK) para abrir o PDF no navegador.',
          error: true,
        });
      }
    } catch (err) {
      tab?.close();
      setFichaMessage({
        id,
        text:
          err instanceof NsacApiClientError && err.status === 404
            ? 'Esta ficha ainda não foi liberada pelo NSAC.'
            : err instanceof Error
              ? err.message
              : 'Não foi possível abrir a ficha agora.',
        error: !(err instanceof NsacApiClientError && err.status === 404),
      });
    } finally {
      setOpeningFichaId(null);
    }
  };

  const displayFichas: FichaAvaliacaoEntry[] =
    fichas.length > 0
      ? fichas
      : [1, 2, 3, 4].map((b) => ({
          schoolYear: new Date().getFullYear(),
          bimester: b,
          lastViewed: null,
          statusText: 'Consultar ficha conceitual no portal NSAC',
          available: true,
          detailId: b,
          detailUrl: `/nsac/aluno/ficha-avaliacao/${b}`,
        }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Hero Banner */}
      <section
        style={{
          borderRadius: isMaterialYou ? 32 : 12,
          padding: isMaterialYou ? '22px 22px' : '18px 20px',
          backgroundColor: tokens.surfaceContainerLow,
          border: `1px solid ${tokens.outlineVariant}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <IconShapeContainer size={isMaterialYou ? 50 : 42} active>
            <ClipboardList size={isMaterialYou ? 24 : 20} />
          </IconShapeContainer>
          <div>
            <div style={{ fontSize: '0.73rem', fontWeight: 700, color: tokens.primary, textTransform: 'uppercase' }}>
              Registros Oficiais • NSAC Online
            </div>
            <h1 style={{ margin: 0, fontSize: isMaterialYou ? '1.55rem' : '1.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
              Fichas, Frequência & Portal CTI
            </h1>
          </div>
        </div>

        <EnhancedConnectedButtonGroup<AuxSection>
          value={section}
          onChange={setSection}
          options={[
            {
              value: 'fichas',
              label: 'Fichas de Avaliação',
              badge: displayFichas.length,
              icon: <ClipboardList size={15} />,
            },
            {
              value: 'atrasos',
              label: 'Atrasos',
              badge: atrasos.length,
              icon: <Clock size={15} />,
            },
            {
              value: 'saidas',
              label: 'Saídas Antecipadas',
              badge: saidas.length,
              icon: <DoorOpen size={15} />,
            },
            {
              value: 'portal',
              label: 'Portal NSAC',
              badge: homeInfo?.infoLinks?.length ?? 0,
              icon: <Globe size={15} />,
            },
          ]}
        />
      </section>

      {/* SECTION 1: FICHAS DE AVALIAÇÃO — the original PDF opens in the browser to print */}
      {section === 'fichas' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {displayFichas.map((entry, idx) => {
            const targetId = entry.detailId ?? entry.bimester;
            const opening = openingFichaId === targetId;
            const message = fichaMessage?.id === targetId ? fichaMessage : null;

            return (
              <ExpressiveSegmentedCard
                key={`${entry.bimester}-${idx}`}
                index={idx}
                total={displayFichas.length}
                style={{ padding: '18px 20px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <IconShapeContainer
                      size={44}
                      containerColor={
                        entry.available ? tokens.primaryContainer : tokens.surfaceContainerHighest
                      }
                      contentColor={
                        entry.available ? tokens.onPrimaryContainer : tokens.onSurfaceVariant
                      }
                      morphing={opening}
                    >
                      {entry.available ? <CheckCircle2 size={19} /> : <Lock size={19} />}
                    </IconShapeContainer>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.05rem' }}>
                        Ficha de Avaliação • {entry.bimester}º Bimestre
                        {entry.schoolYear ? ` (${entry.schoolYear})` : ''}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                        {entry.available
                          ? entry.lastViewed
                            ? `Visualizada em ${entry.lastViewed}`
                            : 'Disponível para imprimir'
                          : entry.statusText || 'Não disponível ainda'}
                      </div>
                    </div>
                  </div>

                  {entry.available ? (
                    <EnhancedMorphButton
                      size="sm"
                      variant="filled"
                      disabled={opening}
                      icon={
                        opening ? (
                          <MorphingShapeIndicator size={16} label="Abrindo ficha" />
                        ) : (
                          <Printer size={15} />
                        )
                      }
                      onClick={() => void openFichaPdf(targetId)}
                    >
                      {opening ? 'Abrindo...' : 'Abrir PDF'}
                    </EnhancedMorphButton>
                  ) : (
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 999,
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        backgroundColor: tokens.surfaceContainerHighest,
                        color: tokens.onSurfaceVariant,
                      }}
                    >
                      Bloqueada
                    </span>
                  )}
                </div>

                {message && (
                  <div
                    role="status"
                    style={{
                      marginTop: 12,
                      padding: '10px 12px',
                      borderRadius: 14,
                      fontSize: '0.82rem',
                      backgroundColor: message.error ? tokens.errorContainer : tokens.surfaceContainer,
                      color: message.error ? tokens.onErrorContainer : tokens.onSurfaceVariant,
                    }}
                  >
                    {message.text}
                  </div>
                )}
              </ExpressiveSegmentedCard>
            );
          })}
        </section>
      )}

      {/* SECTION 2: ATRASOS */}
      {section === 'atrasos' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              padding: '14px 18px',
              borderRadius: 22,
              backgroundColor: tokens.secondaryContainer,
              color: tokens.onSecondaryContainer,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: '0.84rem',
            }}
          >
            <Info size={18} style={{ flexShrink: 0 }} />
            <span>
              Regimento Disciplinar CTI/UNESP: o controle de pontualidade registra entradas após o
              início do primeiro tempo de aula.
            </span>
          </div>

          {atrasos.length === 0 ? (
            <div
              style={{
                padding: 36,
                textAlign: 'center',
                borderRadius: 28,
                backgroundColor: tokens.surfaceContainerLow,
                border: `1px solid ${tokens.outlineVariant}`,
              }}
            >
              <CheckCircle2 size={32} color={tokens.gradeSuccess} style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                Zero atrasos registrados!
              </div>
              <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
                Sua ficha de pontualidade no NSAC Online está limpa.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {atrasos.map((item, idx) => (
                <ExpressiveSegmentedCard
                  key={`${item.date}-${idx}`}
                  index={idx}
                  total={atrasos.length}
                  style={{ padding: '16px 18px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <IconShapeContainer
                        size={42}
                        containerColor={tokens.gradeWarningContainer}
                        contentColor={tokens.onGradeWarningContainer}
                      >
                        <Clock size={18} />
                      </IconShapeContainer>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
                          {item.date} {item.time ? `• ${item.time}` : ''}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                          {item.subject ? `Disciplina: ${item.subject}` : ''}
                          {item.reason ? ` • Motivo: ${item.reason}` : ''}
                          {!item.subject && !item.reason && item.rawColumns.length > 0
                            ? item.rawColumns.join(' • ')
                            : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                </ExpressiveSegmentedCard>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: SAÍDAS ANTECIPADAS */}
      {section === 'saidas' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {saidas.length === 0 ? (
            <div
              style={{
                padding: 36,
                textAlign: 'center',
                borderRadius: 28,
                backgroundColor: tokens.surfaceContainerLow,
                border: `1px solid ${tokens.outlineVariant}`,
              }}
            >
              <DoorOpen size={32} color={tokens.primary} style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                Nenhuma saída antecipada registrada
              </div>
              <div style={{ fontSize: '0.84rem', color: tokens.onSurfaceVariant, marginTop: 4 }}>
                Histórico de autorizações da portaria/coordenação sem ocorrências.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {saidas.map((item, idx) => (
                <ExpressiveSegmentedCard
                  key={`${item.date}-${idx}`}
                  index={idx}
                  total={saidas.length}
                  style={{ padding: '16px 18px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <IconShapeContainer size={42}>
                        <UserCheck size={18} />
                      </IconShapeContainer>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>
                          {item.date} {item.time ? `• ${item.time}` : ''}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                          {item.reason ? `Motivo: ${item.reason}` : ''}
                          {item.authorizedBy ? ` • Autorizado por: ${item.authorizedBy}` : ''}
                          {!item.reason && !item.authorizedBy && item.rawColumns.length > 0
                            ? item.rawColumns.join(' • ')
                            : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                </ExpressiveSegmentedCard>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 4: PORTAL NSAC HOME & LINKS INSTITUCIONAIS */}
      {section === 'portal' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            style={{
              padding: '16px 20px',
              borderRadius: 24,
              backgroundColor: tokens.primaryContainer,
              color: tokens.onPrimaryContainer,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Calendar size={20} />
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Data Oficial do Servidor NSAC
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.1rem' }}>
                  {homeInfo?.portalDate ?? 'Conectado ao Portal CTI UNESP Bauru'}
                </div>
              </div>
            </div>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: '0.75rem',
                fontWeight: 700,
                backgroundColor: tokens.onPrimaryContainer,
                color: tokens.primaryContainer,
              }}
            >
              {homeInfo?.availableRoutes?.length ?? 5} rotas ativas
            </span>
          </div>

          {homeInfo?.infoLinks && homeInfo.infoLinks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {homeInfo.infoLinks.map((link, idx) => (
                <ExpressiveSegmentedCard
                  key={`${link.url}-${idx}`}
                  index={idx}
                  total={homeInfo.infoLinks.length}
                  onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                  style={{ padding: '16px 18px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>{link.title}</div>
                      {link.description && (
                        <div style={{ fontSize: '0.82rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                          {link.description}
                        </div>
                      )}
                      <div style={{ fontSize: '0.75rem', color: tokens.primary, marginTop: 4 }}>
                        {link.url}
                      </div>
                    </div>
                    <EnhancedMorphButton size="sm" variant="tonal" icon={<ExternalLink size={14} />}>
                      Abrir
                    </EnhancedMorphButton>
                  </div>
                </ExpressiveSegmentedCard>
              ))}
            </div>
          ) : (
            <div
              style={{
                padding: 28,
                borderRadius: 24,
                backgroundColor: tokens.surfaceContainerLow,
                border: `1px solid ${tokens.outlineVariant}`,
                fontSize: '0.86rem',
                color: tokens.onSurfaceVariant,
              }}
            >
              Nenhum link institucional adicional disponível no momento.
            </div>
          )}
        </section>
      )}
    </div>
  );
};
