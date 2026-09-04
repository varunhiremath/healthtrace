import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_PROFILE } from '../db/db.js';
import { openRows } from '../db/vault.js';
import useLockStore from '../store/lockStore.js';
import { MARKER_KEYS, DERIVED_KEYS, getMarker } from '../data/markers.js';
import { computeDerived } from '../utils/derived.js';
import { effectiveMarker, classify } from '../utils/ranges.js';
import { summarise, seriesFor, derivedSeries, rankByConcern, delta } from '../utils/trends.js';
import useSettingsStore, { DEFAULT_PINNED } from '../store/settingsStore.js';

// One place that reads the database and hands the screens ready-to-render data.
// Everything below is derived at read time — nothing computed here is stored,
// so a deleted reading takes every number that depended on it with it.
//
// When the lock is on, rows arrive from Dexie sealed and are opened here — so
// decryption happens in exactly one place, on the way in, and no screen has to
// know the difference. Every query takes the lock's `generation` as a
// dependency: unlocking is not a change to any table, so without it Dexie would
// have no reason to re-run and the screens would sit on empty results.

// Everyone in the household, oldest first, so the order does not shuffle.
export function useProfiles() {
  const generation = useLockStore((s) => s.generation);
  const rows = useLiveQuery(async () => openRows('profile', await db.profile.toArray()), [generation], undefined);
  return useMemo(() => {
    if (rows === undefined) return { profiles: [], loaded: false };
    const profiles = rows
      .map((row) => ({ ...DEFAULT_PROFILE, ...row }))
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    return { profiles, loaded: true };
  }, [rows]);
}

/**
 * The person the app is currently showing.
 *
 * The remembered id is only a hint: if it points at somebody who has been
 * deleted — or at nobody, on a fresh install — this falls back to the first
 * profile rather than leaving the app with no one selected.
 */
export function useProfile() {
  const { profiles, loaded } = useProfiles();
  const activeProfileId = useSettingsStore((s) => s.activeProfileId);

  const profile = useMemo(() => {
    if (!profiles.length) return DEFAULT_PROFILE;
    return profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
  }, [profiles, activeProfileId]);

  return { profile, profiles, loaded, profileId: profile.id ?? null };
}

export function useReports(profileId) {
  const generation = useLockStore((s) => s.generation);
  return useLiveQuery(
    async () =>
      profileId == null
        ? []
        : openRows('reports', await db.reports.where('profileId').equals(profileId).reverse().sortBy('date')),
    [profileId, generation],
    undefined
  );
}

export function useReadings(profileId) {
  const generation = useLockStore((s) => s.generation);
  return useLiveQuery(
    async () =>
      profileId == null ? [] : openRows('readings', await db.readings.where('profileId').equals(profileId).toArray()),
    [profileId, generation],
    undefined
  );
}

export function useTargets(profileId) {
  const generation = useLockStore((s) => s.generation);
  const rows = useLiveQuery(
    async () =>
      profileId == null ? [] : openRows('targets', await db.targets.where('profileId').equals(profileId).toArray()),
    [profileId, generation],
    undefined
  );
  return useMemo(() => {
    const out = {};
    for (const row of rows ?? []) out[row.markerKey] = { min: row.min, max: row.max };
    return out;
  }, [rows]);
}

export function useAttachments(reportId) {
  const generation = useLockStore((s) => s.generation);
  return useLiveQuery(
    async () =>
      reportId == null ? [] : openRows('attachments', await db.attachments.where('reportId').equals(reportId).toArray()),
    [reportId, generation],
    undefined
  );
}

/**
 * The whole health picture, assembled once and shared by every screen.
 * `loading` is true until the database has actually answered — screens must not
 * render an "empty" state over data that is merely still arriving.
 */
export function useHealthData() {
  const { profile, profiles, loaded: profileLoaded, profileId } = useProfile();
  const reports = useReports(profileId);
  const readings = useReadings(profileId);
  const targets = useTargets(profileId);
  const pinnedByProfile = useSettingsStore((s) => s.pinnedByProfile);
  const pinned = useMemo(
    () => (Array.isArray(pinnedByProfile[profileId]) ? pinnedByProfile[profileId] : DEFAULT_PINNED),
    [pinnedByProfile, profileId]
  );

  const loading = !profileLoaded || reports === undefined || readings === undefined;

  return useMemo(() => {
    const allReadings = readings ?? [];
    const allReports = reports ?? [];
    const sex = profile.sex ?? undefined;

    // Raw values grouped by the date they were taken, so derived markers can be
    // computed for each point in time rather than only for the latest.
    const valuesByDate = {};
    for (const reading of allReadings) {
      if (!Number.isFinite(reading.value)) continue;
      valuesByDate[reading.date] ??= {};
      // Two readings of the same marker on one day: the later entry wins.
      const existing = valuesByDate[reading.date][reading.markerKey];
      if (existing == null || (reading.createdAt ?? 0) >= existing.createdAt) {
        valuesByDate[reading.date][reading.markerKey] = {
          value: reading.value,
          createdAt: reading.createdAt ?? 0,
        };
      }
    }

    const derivedByDate = {};
    for (const [date, entries] of Object.entries(valuesByDate)) {
      const flat = Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v.value]));
      const derived = computeDerived(flat, profile, date);
      if (Object.keys(derived).length) derivedByDate[date] = derived;
    }

    // Which markers this person actually has data for.
    const trackedKeys = MARKER_KEYS.filter((key) =>
      DERIVED_KEYS.includes(key)
        ? Object.values(derivedByDate).some((d) => Number.isFinite(d[key]))
        : allReadings.some((r) => r.markerKey === key && Number.isFinite(r.value))
    );

    const rows = summarise(allReadings, trackedKeys, { sex, derivedByDate }).map((row) => {
      // Re-classify against the user's target if they set one.
      const marker = effectiveMarker(row.marker, targets);
      return {
        ...row,
        marker,
        status: classify(row.value, marker, sex),
        hasTarget: Boolean(marker.isTarget),
      };
    });

    const rowByKey = Object.fromEntries(rows.map((row) => [row.markerKey, row]));
    const pinnedRows = pinned.map((key) => rowByKey[key]).filter(Boolean);
    // Anything pinned but never measured, so Home can offer to fill the gap.
    const pinnedMissing = pinned.filter((key) => !rowByKey[key] && getMarker(key));

    return {
      loading,
      profile,
      profiles,
      profileId,
      pinned,
      sex,
      targets,
      reports: allReports,
      readings: allReadings,
      derivedByDate,
      rows,
      rowByKey,
      trackedKeys,
      pinnedRows,
      pinnedMissing,
      concerns: rankByConcern(rows),
    };
  }, [readings, reports, profile, profiles, profileId, targets, pinned, loading]);
}

// One marker's full history, for the marker detail screen.
export function useMarkerHistory(markerKey) {
  const data = useHealthData();
  return useMemo(() => {
    const base = getMarker(markerKey);
    if (!base) return null;
    const marker = effectiveMarker(base, data.targets);
    const series = base.derived
      ? derivedSeries(data.derivedByDate, markerKey)
      : seriesFor(data.readings, markerKey);
    return {
      marker,
      base,
      series,
      loading: data.loading,
      sex: data.sex,
      latest: series.length ? series[series.length - 1] : null,
      delta: delta(series, markerKey, data.sex),
      status: series.length ? classify(series[series.length - 1].value, marker, data.sex) : 'unknown',
    };
  }, [markerKey, data]);
}

// The readings that belong to one report, with their statuses, grouped by
// category in catalogue order.
export function useReportReadings(reportId) {
  const generation = useLockStore((s) => s.generation);
  const rows = useLiveQuery(
    async () =>
      reportId == null ? [] : openRows('readings', await db.readings.where('reportId').equals(reportId).toArray()),
    [reportId, generation],
    undefined
  );
  const { profile, profileId } = useProfile();
  const targets = useTargets(profileId);

  return useMemo(() => {
    if (rows === undefined) return { loading: true, readings: [], groups: [] };
    const sex = profile.sex ?? undefined;
    const decorated = rows
      .map((reading) => {
        const base = getMarker(reading.markerKey);
        if (!base) return null;
        const marker = effectiveMarker(base, targets);
        return { ...reading, marker, status: classify(reading.value, marker, sex) };
      })
      .filter(Boolean)
      // Catalogue order, so a report always reads in the same sequence.
      // Sorted by key, not by object identity — effectiveMarker returns a copy
      // when a target applies, which would not be found in MARKERS.
      .sort((a, b) => MARKER_KEYS.indexOf(a.markerKey) - MARKER_KEYS.indexOf(b.markerKey));

    const groups = [];
    for (const reading of decorated) {
      const category = reading.marker.category;
      const group = groups.find((g) => g.category === category);
      if (group) group.readings.push(reading);
      else groups.push({ category, readings: [reading] });
    }
    return { loading: false, readings: decorated, groups };
  }, [rows, profile, targets]);
}
