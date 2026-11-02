import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createQqService} from '../plugins/qq-connect/src/service.mjs';
import {REQUIRED_BACKEND_CAPABILITIES} from '../plugins/qq-connect/src/normalizer.mjs';

for (const [name, receipt] of [['explicit recorded=false', {recorded: false}], ['missing positive acknowledgement', {}]]) {
  test('review: QQ ' + name + ' cannot become an experienceRecorded claim', async () => {
    const instant = Date.UTC(2026, 9, 25, 22), accountId = '10001', groupId = '30001';
    const parent = process.env.AI_BUDDY_PLUGIN_TEST_ROOT??fileURLToPath(new URL('../test-data/', import.meta.url)); mkdirSync(parent, {recursive: true});
    const databasePath = join(mkdtempSync(join(parent, 'review-qq-ack-')), 'private.sqlite');
    const host = {async invoke(method, payload) {
      if (method === 'social.context.read') {
        if (payload.purpose === 'manage-plugin') return {contextToken: 'management', accountId, permissions: ['plugin.manage']};
        return {contextToken: 'event', characterId: payload.characterId, personaId: 'persona', lifeId: payload.lifeId ?? 'life', operationId: payload.operationId ?? 'operation', accountId, senderId: payload.senderId, conversationType: payload.conversationType, conversationId: payload.conversationId, sourceMessageId: payload.sourceMessageId};
      }
      if (method === 'activity.lease') return {leaseId: 'lease', generation: 1};
      if (method === 'activity.check') return {...payload, valid: true};
      if (method === 'activity.finish') return {finished: true};
      if (method === 'experience.append') return receipt;
      throw Error('Unexpected model/network/work call: ' + method);
    }};
    const transport = {async start(options) {const binding = {connectionId: 'fixture', accountId, capabilities: REQUIRED_BACKEND_CAPABILITIES}; options.onEpoch(binding); return binding;}, async close() {}, async send() {throw Error('Quiet group must not send');}};
    const service = createQqService({databasePath, host, transport, now: () => instant});
    const principal = {contextToken: 'local-host-owner'};
    try {
      await service.dispatch('settings.update', {enabled: true, connectionRef: 'fixture', accountId, groups: [{id: groupId}]}, principal);
      await service.dispatch('operator.select', {characterId: 'whale'}, principal);
      await service.dispatch('connect', {}, principal);
      const result = await service.receive({post_type: 'message', message_type: 'group', self_id: accountId, user_id: '20001', sender: {user_id: '20001'}, group_id: groupId, message_id: 'receipt-review', time: instant / 1000, message: [{type: 'text', data: {text: 'received but not stored'}}]});
      assert.equal(result.status, 'experience-pending');
      assert.notEqual(result.experienceRecorded, true);
    } finally {await service.close();}
  });
}

