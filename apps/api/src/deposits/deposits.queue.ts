export const DEPOSIT_QUEUE = 'deposit-verify';
// REQ-DEP-05: provider unreachable → 3 retries over ~10 minutes, then "Provider unavailable".
export const DEPOSIT_JOB_OPTS = {
  attempts: 4,
  backoff: { type: 'exponential' as const, delay: 75_000 }, // 75s, 150s, 300s ≈ 9 min
  removeOnComplete: 1000,
  removeOnFail: 1000,
};
