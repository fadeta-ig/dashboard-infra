export interface Pm2AppPolicy { source: string; name: string; mode: 'required' | 'optional' | 'ignored' }

export function resolvePm2Policy(source: string, name: string, policies: Pm2AppPolicy[], required: string[], ignored: string[]) {
  const policy = policies.find((item) => item.source === source && item.name === name)
    || policies.find((item) => item.source === '*' && item.name === name);
  if (policy) return policy.mode;
  const matches = (values: string[]) => values.includes(name) || values.includes(`${source}:${name}`);
  return matches(ignored) ? 'ignored' : matches(required) ? 'required' : 'optional';
}
