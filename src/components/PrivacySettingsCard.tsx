import React, { useEffect, useState } from 'react';
import { EyeOff, ShieldCheck, UserSearch } from 'lucide-react';
import { fetchRankingPreferences, updatePrivacy } from '../api/nsacClient';
import type { RankingPreferences } from '../api/types';
import { useM3Theme } from '../theme/ThemeContext';
import { ExpressiveSegmentedCard } from './expressive/ExpressivePrimitives';
import { PrivacyToggle } from './PrivacyToggle';

/**
 * Account-wide exposure (Perfil tab):
 * - "Ser encontrado na busca": findable by name/e-mail even without showing the name in the ranking.
 * - "Modo invisível": never exposed anywhere — leaves the ranking, search, photo and public profile.
 */
export const PrivacySettingsCard: React.FC<{ token: string; refreshSignal?: number }> = ({
  token,
  refreshSignal = 0,
}) => {
  const { tokens } = useM3Theme();
  const [prefs, setPrefs] = useState<RankingPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRankingPreferences(token)
      .then((p) => !cancelled && setPrefs(p))
      .catch(() => !cancelled && setError('Não foi possível carregar suas configurações de privacidade.'));
    return () => {
      cancelled = true;
    };
  }, [token, refreshSignal]);

  const save = async (patch: { discoverable?: boolean; invisible?: boolean }) => {
    setSaving(true);
    setError(null);
    try {
      setPrefs(await updatePrivacy(token, patch));
    } catch {
      setError('Não foi possível salvar agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const invisible = prefs?.invisible ?? false;
  const namedInRanking = Boolean(prefs?.opted_in && !prefs.hide_name);
  const findable = !invisible && (namedInRanking || Boolean(prefs?.discoverable));

  return (
    <ExpressiveSegmentedCard index={0} total={1} style={{ padding: '18px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <ShieldCheck size={18} color={tokens.primary} />
        <span style={{ fontWeight: 800, fontSize: '1rem' }}>Privacidade</span>
      </div>
      <div style={{ fontSize: '0.78rem', color: tokens.onSurfaceVariant, marginBottom: 14 }}>
        {invisible
          ? 'Você não aparece em lugar nenhum: nem no ranking, nem na busca, nem com perfil público.'
          : findable
            ? 'Outros alunos podem te encontrar pelo nome ou pelo e-mail completo.'
            : 'Ninguém consegue te encontrar na busca.'}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <PrivacyToggle
          icon={<UserSearch size={18} />}
          title="Ser encontrado na busca"
          caption={
            invisible
              ? 'Indisponível no modo invisível'
              : namedInRanking
                ? 'Você já aparece porque mostra seu nome no ranking'
                : 'Por nome ou pelo seu e-mail completo'
          }
          checked={findable}
          disabled={!prefs || saving || invisible || namedInRanking}
          onChange={(next) => save({ discoverable: next })}
        />
        <PrivacyToggle
          icon={<EyeOff size={18} />}
          title="Modo invisível"
          caption={
            invisible
              ? 'Ativo: fora do ranking, da busca e sem perfil público'
              : 'Sai do ranking e esconde você de toda a plataforma'
          }
          checked={invisible}
          disabled={!prefs || saving}
          onChange={(next) => save({ invisible: next })}
        />
      </div>

      {error && <div style={{ marginTop: 10, fontSize: '0.8rem', color: tokens.error }}>{error}</div>}
    </ExpressiveSegmentedCard>
  );
};
