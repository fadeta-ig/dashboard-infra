import { type NextRequest } from 'next/server';
import { ADDITIONAL_TARGET_SUGGESTIONS, SERVICE_PROBE_PLACEHOLDERS } from '@/lib/monitoring-config';
import { enforceMetricsRateLimit, noStoreJson } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const limited = enforceMetricsRateLimit(request);
  if (limited) return limited;

  return noStoreJson({
    additionalTargetSuggestions: ADDITIONAL_TARGET_SUGGESTIONS,
    serviceProbePlaceholders: SERVICE_PROBE_PLACEHOLDERS,
  });
}
