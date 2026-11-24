import type { AllYearsResponse, RecoveryStatusCode } from '../api/types';
import type { GradePushHighlight } from '../notifications/pushService';
import { isBimesterPosted, normalizeYearInfo } from '../screens/BoletimScreen';
import { stripAccents } from './subjectIcons';

const STORAGE_PREFIX = 'n2sac_seen_grades_v1:';

interface SeenGradeEntry {
  grade: number | null;
  recovery: boolean;
  recoveryCode?: RecoveryStatusCode;
  recovered?: boolean | null;
}

type SeenGradesSnapshot = Record<string, SeenGradeEntry>;

function normalizeRecoveryCode(code: RecoveryStatusCode | undefined, recovery: boolean): RecoveryStatusCode | undefined {
  if (code) return code;
  return recovery ? undefined : 'NAC';
}

function storageKey(accountId: number): string {
  return `${STORAGE_PREFIX}${accountId}`;
}

export function gradeHighlightKey(subject: string, bimester: number, year: number): string {
  return `${year}|${stripAccents(subject)}|${bimester}`;
}

function loadSnapshot(accountId: number): SeenGradesSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as SeenGradesSnapshot;
  } catch {
    return null;
  }
}

function saveSnapshot(accountId: number, snapshot: SeenGradesSnapshot): void {
  try {
    localStorage.setItem(storageKey(accountId), JSON.stringify(snapshot));
  } catch {
    // storage quota / private mode
  }
}

export function buildSeenGradesSnapshot(boletim: AllYearsResponse): SeenGradesSnapshot {
  const snapshot: SeenGradesSnapshot = {};
  for (const rawYear of boletim.data ?? []) {
    const yr = normalizeYearInfo(rawYear);
    for (const subj of yr.grades) {
      for (const bi of subj.bimesters) {
        if (!isBimesterPosted(bi)) continue;
        const key = gradeHighlightKey(subj.subjectName, bi.bimester, yr.year);
        const recCode = normalizeRecoveryCode(bi.personal.recoveryCode, Boolean(bi.personal.recovery));
        const hasRecovery = Boolean(bi.personal.recovery) || (recCode !== undefined && recCode !== 'NAC');
        snapshot[key] = {
          grade: bi.personal.grade,
          recovery: hasRecovery,
          recoveryCode: recCode,
          recovered: bi.personal.recovered ?? null,
        };
      }
    }
  }
  return snapshot;
}

/**
 * Seeds the seen-grades baseline from the local cached boletim if no baseline exists yet.
 * This ensures that when fresh server data arrives moments later with newly posted grades,
 * we accurately detect the delta against what the student last saw on this device.
 */
export function seedSeenGradesIfMissing(accountId: number, boletim: AllYearsResponse | null): void {
  if (!boletim?.data?.length) return;
  if (loadSnapshot(accountId) !== null) return;
  saveSnapshot(accountId, buildSeenGradesSnapshot(boletim));
}

/**
 * Records highlights already shown via a notification tap so the subsequent boletim sync
 * does not open a duplicate "while you were away" popup for the same grades.
 */
export function markHighlightsAsSeen(accountId: number, highlights: GradePushHighlight[]): void {
  if (highlights.length === 0) return;
  const existing = loadSnapshot(accountId);
  if (!existing) return;
  let changed = false;
  for (const h of highlights) {
    if (h.personal_grade === null && !h.recovery) continue;
    const key = gradeHighlightKey(h.subject, h.bimester, h.year);
    existing[key] = {
      grade: h.personal_grade,
      recovery: Boolean(h.recovery),
    };
    changed = true;
  }
  if (changed) saveSnapshot(accountId, existing);
}

function gradesDiffer(a: number | null, b: number | null): boolean {
  if (a === null && b === null) return false;
  if (a === null || b === null) return true;
  return Math.abs(a - b) >= 0.005;
}

/**
 * Compares a freshly fetched boletim against the last-seen snapshot for `accountId`.
 * - On first-ever load (no baseline yet), seeds the baseline silently and returns `[]`.
 * - On subsequent opens/syncs, returns every newly posted or updated grade (with evolution
 *   against the student's previous bimester) and persists the updated snapshot.
 */
export function detectNewGradesAndUpdateSeen(
  accountId: number,
  boletim: AllYearsResponse | null
): GradePushHighlight[] {
  if (!boletim?.data?.length) return [];

  const prev = loadSnapshot(accountId);
  const next = buildSeenGradesSnapshot(boletim);

  if (prev === null) {
    saveSnapshot(accountId, next);
    return [];
  }

  const detected: GradePushHighlight[] = [];
  const normalizedYears = [...boletim.data].map(normalizeYearInfo).sort((a, b) => b.year - a.year);

  for (const yr of normalizedYears) {
    for (const subj of yr.grades) {
      const sortedBims = [...subj.bimesters].sort((a, b) => a.bimester - b.bimester);
      for (const bi of sortedBims) {
        if (!isBimesterPosted(bi)) continue;
        const key = gradeHighlightKey(subj.subjectName, bi.bimester, yr.year);
        const old = prev[key];
        const currRecCode = normalizeRecoveryCode(bi.personal.recoveryCode, Boolean(bi.personal.recovery));
        const currHasRecovery =
          Boolean(bi.personal.recovery) || (currRecCode !== undefined && currRecCode !== 'NAC');
        const oldRecCode = old ? normalizeRecoveryCode(old.recoveryCode, Boolean(old.recovery)) : undefined;
        const recoveryCodeChanged = Boolean(
          old && oldRecCode !== undefined && currRecCode !== undefined && oldRecCode !== currRecCode
        );
        const recoveredChanged = Boolean(
          old &&
            old.recovered !== undefined &&
            bi.personal.recovered !== undefined &&
            old.recovered !== bi.personal.recovered
        );
        const isNew = !old;
        const isUpdated = Boolean(
          old &&
            (gradesDiffer(old.grade, bi.personal.grade) ||
              Boolean(old.recovery) !== currHasRecovery ||
              recoveryCodeChanged ||
              recoveredChanged)
        );
        if (!isNew && !isUpdated) continue;

        const prevPosted = sortedBims
          .filter((b) => b.bimester < bi.bimester && isBimesterPosted(b) && b.personal.grade !== null)
          .pop();

        detected.push({
          subject: subj.subjectName,
          bimester: bi.bimester,
          year: yr.year,
          personal_grade: bi.personal.grade,
          class_average: bi.class.averageGrade,
          previous_grade: prevPosted?.personal.grade ?? null,
          recovery: Boolean(bi.personal.recovery),
        });
      }
    }
  }

  saveSnapshot(accountId, next);
  return detected;
}

/**
 * Merges two lists of grade highlights without duplicates (keyed by year + normalized subject + bimester),
 * keeping richer numeric fields when both lists contain the same grade.
 */
export function mergeGradeHighlights(
  primary: GradePushHighlight[],
  incoming: GradePushHighlight[]
): GradePushHighlight[] {
  const map = new Map<string, GradePushHighlight>();
  for (const h of [...primary, ...incoming]) {
    const key = gradeHighlightKey(h.subject, h.bimester, h.year);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, h);
    } else {
      map.set(key, {
        subject: cur.subject || h.subject,
        bimester: cur.bimester,
        year: cur.year,
        personal_grade: h.personal_grade ?? cur.personal_grade,
        class_average: h.class_average ?? cur.class_average,
        previous_grade: h.previous_grade ?? cur.previous_grade,
        recovery: cur.recovery || h.recovery,
      });
    }
  }
  return Array.from(map.values());
}
