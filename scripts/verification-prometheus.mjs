// Local-only synthetic metrics for scripts/verify-monitoring-api.mjs.
// Never use this fixture as a production metrics source.
import http from 'node:http';
let stale = false;
http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:33080');
  if (url.pathname === '/fixture/stale') {
    stale = url.searchParams.get('value') === 'true';
    response.end('ok');
    return;
  }
  const now = Date.now() / 1000;
  const query = url.searchParams.get('query') || '';
  const sample = now - (stale ? 600 : 10);
  let result = [];
  if (query === 'timestamp(up)') result = [{ metric: { job: 'node', instance: 'verification' }, value: [now, String(sample)] }];
  else if (query === 'up') result = [{ metric: { job: 'node', instance: 'verification' }, value: [now, '1'] }];
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ status: 'success', data: url.pathname.endsWith('/series') ? [] : { resultType: url.pathname.endsWith('/query_range') ? 'matrix' : 'vector', result } }));
}).listen(33080, '127.0.0.1', () => console.log('Verification metrics listening on 127.0.0.1:33080'));
