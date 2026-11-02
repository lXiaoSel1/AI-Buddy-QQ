import {registerNativePlugin} from '../../../shared/native.mjs';
import {createQqService, QQ_UNCONNECTED} from './service.mjs';
export const name = 'ai-buddy-qq-connect';
export const inject = ['tools', 'connection', 'buddySocialServices'];
export function apply(ctx) { return registerNativePlugin(ctx, {pluginId: '@ai-buddy/qq-connect', label: 'QQ连接', createService: createQqService, unconnected: QQ_UNCONNECTED}); }
