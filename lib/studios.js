import {
  t2vModels,
  i2vModels,
  v2vModels,
  lipsyncModels,
} from '../packages/studio/src/models.js';

const VALID = new Set(['IMAGE', 'VIDEO', 'CINEMA', 'LIPSYNC']);

const endpointsOf = (models) => new Set(models.map((m) => m.endpoint || m.id));

const VIDEO_ENDPOINTS = new Set([
  ...endpointsOf(t2vModels),
  ...endpointsOf(i2vModels),
  ...endpointsOf(v2vModels),
]);
const LIPSYNC_ENDPOINTS = endpointsOf(lipsyncModels);

export function isPollPath(path) {
  return String(path).startsWith('predictions/');
}

export function resolveStudio({ origin, endpoint } = {}) {
  const declared = String(origin ?? '').split(':')[1]?.toUpperCase();
  if (declared && VALID.has(declared)) return declared;

  if (LIPSYNC_ENDPOINTS.has(endpoint)) return 'LIPSYNC';
  if (VIDEO_ENDPOINTS.has(endpoint)) return 'VIDEO';
  return 'IMAGE';
}
