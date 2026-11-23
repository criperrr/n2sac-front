import React, { useCallback, useEffect, useState } from 'react';
import { Check, Crown, ShieldCheck, Users, Vote } from 'lucide-react';
import {
  castRepresentativeVote,
  fetchRoomElection,
  NsacApiClientError,
  revokeRepresentativeVote,
} from '../../api/nsacClient';
import type { ElectionCandidateRow, ElectionStatePayload } from '../../api/types';
import { useM3Theme } from '../../theme/ThemeContext';
import { PushedPage } from '../expressive/PushedPage';
import { EnhancedMorphButton, ExpressiveSegmentedCard } from '../expressive/ExpressivePrimitives';
import { MorphingLoadingState, MorphingShapeIndicator } from '../expressive/ShapeMorph';
import { ProfileAvatar } from '../profile/ProfileAvatar';

export const RepresentativesPage: React.FC<{
  token: string;
  onClose: () => void;
  onElectionUpdated?: () => void;
}> = ({ token, onClose, onElectionUpdated }) => {
  const { tokens, isMaterialYou } = useM3Theme();
  const [data, setData] = useState<ElectionStatePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await fetchRoomElection(token);
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof NsacApiClientError ? err.message : 'Não foi possível carregar a votação.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleVote = async (c: ElectionCandidateRow) => {
    if (busyId !== null) return;
    setBusyId(c.account_id);
    setError(null);
    try {
      const updated = c.voted_by_me
        ? await revokeRepresentativeVote(token, c.account_id)
        : await castRepresentativeVote(token, c.account_id);
      setData(updated);
      onElectionUpdated?.();
    } catch (err) {
      setError(err instanceof NsacApiClientError ? err.message : 'Não foi possível registrar seu voto.');
    } finally {
      setBusyId(null);
    }
  };

  const radius = isMaterialYou ? 22 : 12;

  return (
    <PushedPage title="Representantes de Classe" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 32 }}>
        {loading && !data ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <MorphingLoadingState label="Carregando votação da turma..." />
          </div>
        ) : data ? (
          <>
            {/* Summary & transparent rules */}
            <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    backgroundColor: tokens.primaryContainer,
                    color: tokens.onPrimaryContainer,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Crown size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
                    Eleição da Turma {data.room.class_code} ({data.room.school_year})
                  </div>
                  <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                    Voto público • Quórum atual: <strong>{data.room.quorum} votos</strong> • Até{' '}
                    <strong>{data.room.max_representatives} representantes</strong>
                  </div>
                </div>
              </div>

              <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: tokens.onSurfaceVariant, lineHeight: 1.5 }}>
                Você pode indicar até <strong>{data.room.max_votes_per_student} colegas</strong> e retirar seu voto a
                qualquer momento. Os até {data.room.max_representatives} colegas mais votados que atingirem{' '}
                <strong>{data.room.quorum}+ votos</strong> tornam-se Representantes de Classe (podem publicar anúncios,
                enviar imagens nos canais e personalizar foto/banner da turma, mas nunca expulsar ninguém).
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 999,
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    backgroundColor: tokens.secondaryContainer,
                    color: tokens.onSecondaryContainer,
                  }}
                >
                  <Vote size={14} /> Seus votos: {data.my_votes.length} / {data.room.max_votes_per_student}
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 999,
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    backgroundColor: tokens.surfaceContainerHigh,
                    color: tokens.onSurfaceVariant,
                  }}
                >
                  <Users size={14} /> {data.room.member_count} alunos na sala
                </span>
              </div>
            </ExpressiveSegmentedCard>

            {error && (
              <div
                role="alert"
                style={{
                  padding: '12px 16px',
                  borderRadius: 16,
                  backgroundColor: tokens.errorContainer,
                  color: tokens.onErrorContainer,
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}

            {/* Public vote ranking */}
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: tokens.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 4px 0' }}>
              Ranking de votos (público)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.candidates.map((c) => {
                const progress = Math.min(100, Math.round((c.vote_count / Math.max(1, data.room.quorum)) * 100));
                const isBusy = busyId === c.account_id;
                const votesExhausted = !c.voted_by_me && data.my_votes.length >= data.room.max_votes_per_student;

                return (
                  <div
                    key={c.account_id}
                    style={{
                      padding: '14px 16px',
                      borderRadius: radius,
                      backgroundColor: c.is_representative ? tokens.primaryContainer + '30' : tokens.surfaceContainerLow,
                      border: `1px solid ${c.is_representative ? tokens.primary : tokens.outlineVariant}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span
                        style={{
                          width: 24,
                          textAlign: 'center',
                          fontWeight: 800,
                          fontSize: '0.86rem',
                          color: c.is_representative ? tokens.primary : tokens.onSurfaceVariant,
                          flexShrink: 0,
                        }}
                      >
                        #{c.rank}
                      </span>

                      <ProfileAvatar name={c.display_label} image={c.avatar_url} size={40} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.92rem' }}>
                            {c.display_label}
                            {c.is_me ? ' (Você)' : ''}
                          </span>
                          {c.is_representative && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 999,
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                backgroundColor: tokens.primary,
                                color: tokens.onPrimary,
                              }}
                            >
                              <ShieldCheck size={11} /> Representante
                            </span>
                          )}
                        </div>
                        {c.nsac_email && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: tokens.onSurfaceVariant,
                              opacity: 0.85,
                              marginTop: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.nsac_email}
                          </div>
                        )}
                        <div style={{ fontSize: '0.76rem', color: tokens.onSurfaceVariant, marginTop: 2 }}>
                          <strong>{c.vote_count}</strong> / {data.room.quorum} votos necessários
                        </div>
                      </div>

                      {!c.is_me && data.room.is_functional && (
                        <EnhancedMorphButton
                          size="sm"
                          variant={c.voted_by_me ? 'tonal' : 'filled'}
                          disabled={isBusy || votesExhausted}
                          icon={
                            isBusy ? (
                              <MorphingShapeIndicator size={14} label="Votando" />
                            ) : c.voted_by_me ? (
                              <Check size={14} />
                            ) : (
                              <Vote size={14} />
                            )
                          }
                          onClick={() => void toggleVote(c)}
                        >
                          {c.voted_by_me ? 'Votado' : 'Votar'}
                        </EnhancedMorphButton>
                      )}
                    </div>

                    {/* Quorum progress bar */}
                    <div
                      style={{
                        height: 6,
                        borderRadius: 999,
                        backgroundColor: tokens.surfaceContainerHighest,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${progress}%`,
                          height: '100%',
                          borderRadius: 999,
                          backgroundColor: c.is_representative ? tokens.gradeSuccess : tokens.primary,
                          transition: 'width 260ms ease',
                        }}
                      />
                    </div>

                    {/* Non-secret public voters list */}
                    {c.voters.length > 0 && (
                      <div style={{ fontSize: '0.74rem', color: tokens.onSurfaceVariant, lineHeight: 1.45 }}>
                        <span style={{ fontWeight: 700 }}>Votaram ({c.voters.length}): </span>
                        {c.voters.map((v) => v.display_label).join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div style={{ padding: 24, textAlign: 'center', color: tokens.error }}>
            {error || 'Não foi possível carregar a votação.'}
          </div>
        )}
      </div>
    </PushedPage>
  );
};
