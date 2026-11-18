import { describe, expect, test } from 'bun:test';
import { askJson, askModel, ModelError, withBackup } from '../src/model';
import { readUsage, Trace } from '../src/trace';

describe('timing records', () => {
  test('each request is timed, sized, and a sent-back answer says why; nothing of the text is kept', async () => {
    const trace = new Trace('create', 'Writing the notebook');
    let n = 0;
    const ask = trace.wrap(async () => { n++; await new Promise(r => setTimeout(r, 15)); return n === 1 ? 'not json at all' : '{"secret": "the butler did it"}'; });
    const out = await askJson(ask, [{ role: 'user', content: 'x' }], v => v, undefined, trace.sentBack);
    expect(out).toEqual({ secret: 'the butler did it' });
    const done = trace.done('complete');
    expect(done.requests.length).toBe(2);
    expect(done.requests[0]).toMatchObject({ step: 'Writing the notebook', ok: true, chars: 15, sentBack: 'MALFORMED_JSON' });
    expect(done.requests[0].ms).toBeGreaterThanOrEqual(10);
    expect(done.requests[1].sentBack).toBeUndefined();
    expect(JSON.stringify(done)).not.toContain('butler');
  });
  test('a failure is kept by its category, and a backup answer is marked', async () => {
    const trace = new Trace('checkup', 'Updating the notebook');
    const main = trace.wrap(async () => { throw new ModelError('DECLINED', 'no'); });
    const backup = trace.wrap(async () => '{}');
    await withBackup(main, backup, trace.backup)([], undefined);
    expect(trace.done('complete').requests.map(r => [r.ok, r.error, r.backup])).toEqual([[false, 'DECLINED', undefined], [true, undefined, true]]);
  });
  test('token counts the provider reports are recorded, thinking included', async () => {
    expect(readUsage({ prompt_tokens: 9000, completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 2500 } })).toEqual({ input: 9000, output: 4000, thinking: 2500 });
    expect(readUsage({ input_tokens: 10, output_tokens: 20 })).toEqual({ input: 10, output: 20, thinking: undefined });
    expect(readUsage(undefined)).toEqual({ input: undefined, output: undefined, thinking: undefined });
    const trace = new Trace('create', 'Writing');
    const api: any = { permissions: { has: () => true }, connections: { get: async () => ({ id: 'c', provider: 'openrouter', model: 'google/some-model' }) },
      generate: { raw: async () => ({ content: '{}', finish_reason: 'stop', usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 30 } } }) } };
    const ask = trace.wrap((m, s) => askModel(api, undefined, { connectionId: 'c', maxOutputTokens: 1000, reasoningMode: 'inherit', meter: trace.meter }, m, s));
    await ask([{ role: 'user', content: 'x' }]);
    expect(trace.done('complete').requests[0]).toMatchObject({ tokens: { input: 100, output: 50, thinking: 30 }, model: 'google/some-model' });
  });
  test('while a job runs, the request still waiting shows, and every start and finish is announced', async () => {
    let changes = 0, release!: () => void;
    const trace = new Trace('create', 'Writing the notebook', Date.now(), () => { changes++; });
    const ask = trace.wrap(() => new Promise<string>(r => { release = () => r('{}'); }));
    const pending = ask([]);
    const live = trace.live();
    expect(live.status).toBe('running');
    expect(live.requests).toEqual([]);
    expect(live.waiting?.step).toBe('Writing the notebook');
    expect(changes).toBe(1);
    release(); await pending;
    expect(trace.live().waiting).toBeUndefined();
    expect(trace.live().requests.length).toBe(1);
    expect(changes).toBe(2);
  });
});
