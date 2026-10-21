import type { SpindleAPI, MacroDefinitionDTO, InterceptorDisposer } from 'lumiverse-spindle-types';
import { NotebookController } from './controller';
import { VERSION } from './types';

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const string = (v: unknown, name: string) => { if (typeof v !== 'string' || !v) throw new Error(`${name} is required.`); return v; };

/** Route one panel request. Every action names the chat it acts on. */
export async function handle(controller: NotebookController, action: string, input: unknown): Promise<unknown> {
  const data = record(input);
  switch (action) {
    case 'snapshot': return controller.snapshot(typeof data.chatId === 'string' ? data.chatId : null);
    case 'create': return controller.create(string(data.chatId, 'Chat'), data.preferences, data.ideas, data.keepIdeas);
    case 'checkup': { const job = await controller.checkup(string(data.chatId, 'Chat'), 'You asked for a check-up'); if (!job) throw new Error('The notebook is already being updated.'); return job; }
    case 'enable': return controller.setEnabled(string(data.chatId, 'Chat'), data.enabled === true);
    case 'pace': return controller.setPace(string(data.chatId, 'Chat'), data.pace);
    case 'skip': return controller.skipTime(string(data.chatId, 'Chat'), data.amount, data.unit);
    case 'edit': return controller.editNotebook(string(data.chatId, 'Chat'), data.notebook);
    case 'remove': return controller.remove(string(data.chatId, 'Chat'));
    case 'stories': return controller.stories();
    case 'talk': return controller.talk(string(data.chatId, 'Chat'), data.text, data.keep);
    case 'push': return controller.push(string(data.chatId, 'Chat'), data.kind);
    case 'undo-talk': return controller.undoTalk(string(data.chatId, 'Chat'));
    case 'cancel': return controller.cancel(string(data.chatId, 'Chat'));
    case 'unpin': return controller.unpin(string(data.chatId, 'Chat'), data.noteId);
    case 'clear-talk': return controller.clearTalk(string(data.chatId, 'Chat'));
    case 'dismiss-skip': return controller.dismissSkip(string(data.chatId, 'Chat'));
    case 'settings': return controller.saveSettings(data.settings);
    case 'version': return VERSION;
    default: throw new Error('Unknown Grimoire action. Reload the extension.');
  }
}

/** Macro calls carry the chat and user in slightly different places across hosts. */
export function macroIdentity(context: unknown): { chatId?: string; userId?: string } {
  const value = record(context), env = record(value.env), chat = record(env.chat), extra = record(env.extra);
  const pick = (...values: unknown[]) => values.find((v): v is string => typeof v === 'string' && !!v.trim());
  return { chatId: pick(value.chatId, chat.id), userId: pick(value.userId, extra.userId) };
}

export function setupBackend(api: SpindleAPI): () => void {
  const controllers = new Map<string, NotebookController>();
  const instance = (userId?: string) => {
    const key = userId ?? 'owner';
    let found = controllers.get(key);
    if (!found) { found = new NotebookController(api, userId, () => api.sendToFrontend({ type: 'grimoire:changed' }, userId)); controllers.set(key, found); }
    return found;
  };
  const stops: Array<() => void> = [];
  stops.push(api.onFrontendMessage((payload, userId, frontendSessionId) => {
    const request = record(payload);
    if (request.type !== 'grimoire:request' || typeof request.id !== 'string' || request.id.length > 100 || typeof request.action !== 'string') return;
    void handle(instance(userId), request.action, request.input)
      .then(result => api.sendToFrontend({ type: 'grimoire:response', id: request.id, result }, userId, { frontendSessionId }))
      .catch(error => api.sendToFrontend({ type: 'grimoire:response', id: request.id, error: error instanceof Error ? error.message : 'Grimoire could not do that.' }, userId, { frontendSessionId }));
  }));

  const macros: Array<[string, 'note' | 'clock' | 'pace', string]> = [
    ['grimoire_note', 'note', 'The Grimoire note for this reply. Returns text only when Settings → Where the note goes is set to “In my preset”.'],
    ['grimoire_clock', 'clock', 'The current story time from Grimoire.'],
    ['grimoire_pace', 'pace', 'The current pace line from Grimoire (auto, quiet, or fast).'],
  ];
  for (const [name, kind, description] of macros) {
    const definition = { name, category: 'Grimoire', description, returnType: 'string', volatile: true,
      handler: async (context: unknown) => { try { const who = macroIdentity(context); return await instance(who.userId).macro(kind, who.chatId); } catch { return ''; } } };
    // The published type models handlers as strings; the worker accepts a function.
    try { api.registerMacro(definition as unknown as MacroDefinitionDTO); } catch { /* host without macros */ }
  }

  let interceptor: InterceptorDisposer | undefined;
  const configure = () => {
    if (api.permissions.has('interceptor') && !interceptor) interceptor = api.registerInterceptor((messages, ctx) => instance(ctx.userId).intercept(messages, ctx), 60);
    else if (!api.permissions.has('interceptor') && interceptor) { interceptor(); interceptor = undefined; }
  };
  configure();
  stops.push(api.permissions.onChanged(() => { configure(); for (const [key] of controllers) api.sendToFrontend({ type: 'grimoire:changed' }, key === 'owner' ? undefined : key); }));
  stops.push(api.on('GENERATION_ENDED', (payload, userId) => {
    const event = record(payload);
    if (typeof event.chatId !== 'string' || event.error || typeof event.messageId !== 'string') return;
    void instance(userId).afterReply(event.chatId, typeof event.generationType === 'string' ? event.generationType : undefined).catch(() => {}).finally(() => api.sendToFrontend({ type: 'grimoire:changed' }, userId));
  }));
  stops.push(api.on('CHAT_FORKED', (payload, userId) => {
    const event = record(payload);
    if (typeof event.sourceChatId === 'string' && typeof event.forkedChatId === 'string') void instance(userId).fork(event.sourceChatId, event.forkedChatId).catch(() => {});
  }));
  for (const name of ['MESSAGE_EDITED', 'MESSAGE_DELETED', 'MESSAGE_SWIPED', 'CHAT_SWITCHED', 'CHAT_CHANGED']) stops.push(api.on(name, (_payload, userId) => api.sendToFrontend({ type: 'grimoire:changed' }, userId)));
  return () => { stops.forEach(stop => stop()); interceptor?.(); for (const controller of controllers.values()) controller.dispose(); };
}

declare const spindle: SpindleAPI;
if (typeof spindle !== 'undefined') setupBackend(spindle);
