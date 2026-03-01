import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decideAiFilterAction } from '../src/services/emailService';

describe('decideAiFilterAction', () => {
    it('广告邮件低严重度应被过滤', () => {
        const result = decideAiFilterAction({
            category: 'ads',
            severity: 'low',
            importanceScore: 0.3,
            spamHint: true,
        });

        assert.equal(result.shouldFilter, true);
    });

    it('广告邮件中严重度但高重要度应保留', () => {
        const result = decideAiFilterAction({
            category: 'ads',
            severity: 'medium',
            importanceScore: 0.8,
            spamHint: true,
        });

        assert.equal(result.shouldFilter, false);
    });

    it('广告邮件中严重度时支持账户阈值覆盖', () => {
        const result = decideAiFilterAction({
            category: 'ads',
            severity: 'medium',
            importanceScore: 0.7,
            spamHint: true,
            adsKeepImportanceThreshold: 0.65,
        });

        assert.equal(result.shouldFilter, false);
    });

    it('通知邮件高严重度应保留', () => {
        const result = decideAiFilterAction({
            category: 'notification',
            severity: 'high',
            importanceScore: 0.1,
            spamHint: true,
        });

        assert.equal(result.shouldFilter, false);
    });

    it('通知邮件低严重度且低重要度并疑似垃圾时应过滤', () => {
        const result = decideAiFilterAction({
            category: 'notification',
            severity: 'low',
            importanceScore: 0.1,
            spamHint: true,
        });

        assert.equal(result.shouldFilter, true);
    });

    it('其他类型在高严重度且疑似垃圾时应过滤', () => {
        const result = decideAiFilterAction({
            category: 'other',
            severity: 'high',
            importanceScore: 0.6,
            spamHint: true,
        });

        assert.equal(result.shouldFilter, true);
    });
});
