// Read model for reviewed simulations and user-recorded field evidence.
// Satellite deltas are parcel means, never causal intervention effects.
export const changeLabels = {
  observed: "Değişim sahada görüldü",
  not_observed: "Değişim sahada görülmedi",
  uncertain: "Henüz karar verilemiyor",
};

export function mergeMissionRecords(...collections) {
  const records = new Map();
  for (const collection of collections)
    for (const record of collection) {
      const previous = records.get(record.id);
      if (!previous || previous.version < record.version)
        records.set(record.id, record);
    }
  return [...records.values()].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
}

export function missionEvidence(review, records, observations) {
  const geometryHash = review.fieldSnapshot.geometryHash;
  const findings = records
    .filter(
      (record) =>
        record.kind === "observation" &&
        record.status !== "archived" &&
        record.fieldId === review.fieldId &&
        record.fieldSnapshot.geometryHash === geometryHash &&
        record.payload.missionFinding?.reviewId === review.id,
    )
    .toSorted(
      (a, b) =>
        b.payload.observedAt.localeCompare(a.payload.observedAt) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
  const checked = new Set(
    findings.map((record) => record.payload.missionFinding.waypointIndex),
  ).size;
  const satellite = review.payload.simulationReview.satellite;
  if (!satellite)
    return {
      findings,
      checked,
      state: "no_source",
      comparison: null,
      newer: null,
    };
  const compatible = observations.filter(
    (item) =>
      item.provider === satellite.provider &&
      item.method === satellite.method &&
      Number.isFinite(item.metrics?.[satellite.metric]),
  );
  const baseline = compatible.find(
    (item) =>
      item.id === satellite.current.analysisId &&
      item.date === satellite.current.date,
  );
  // Only a strictly later capture with a non-overlapping aggregation period may form a delta.
  const newer =
    compatible
      .filter((item) => item.date > satellite.current.date)
      .toSorted((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  if (!newer)
    return {
      findings,
      checked,
      state: "awaiting_capture",
      comparison: null,
      newer,
    };
  if (!baseline)
    return {
      findings,
      checked,
      state: "baseline_missing",
      comparison: null,
      newer,
    };
  const validPeriod = (item) =>
    Number.isFinite(Date.parse(item.period?.from)) &&
    Date.parse(item.period.to) > Date.parse(item.period.from);
  if (
    !validPeriod(baseline) ||
    !validPeriod(newer) ||
    Date.parse(baseline.period.to) > Date.parse(newer.period.from)
  )
    return {
      findings,
      checked,
      state: "periods_overlap",
      comparison: null,
      newer,
    };
  const quality = (item) => {
    const coverage = item.coverage?.[satellite.metric];
    return (
      Number.isFinite(coverage) &&
      coverage > 0 &&
      coverage <= 1 &&
      (!Number.isFinite(item.minimumCoverage) ||
        coverage >= item.minimumCoverage)
    );
  };
  if (![baseline, newer].every(quality))
    return {
      findings,
      checked,
      state: "coverage_insufficient",
      comparison: null,
      newer,
    };
  return {
    findings,
    checked,
    state: "ready",
    newer,
    comparison: {
      metric: satellite.metric,
      baseline,
      after: newer,
      delta:
        newer.metrics[satellite.metric] - baseline.metrics[satellite.metric],
      scope: "parcel_mean",
      causal: false,
    },
  };
}
