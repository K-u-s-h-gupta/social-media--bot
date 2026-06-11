import { __awaiter } from "tslib";
import { Logger } from '@nestjs/common';
import { ioRedis } from "../redis/redis.service";
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve as resolvePath } from 'path';
import { getPlatformCapabilities, supportsTaskAction, } from './platform-capabilities';
const MIN_INTERVAL_MS = 30 * 60 * 1000;
// Fallback env loading for custom runtime launchers.
for (const envPath of [resolvePath(process.cwd(), '.env'), resolvePath(process.cwd(), '../../.env')]) {
    if (existsSync(envPath)) {
        dotenv.config({ path: envPath, override: false });
    }
}
export class SimpleAgent {
    constructor(agentId, deploymentId, credentialId, platform, username, prompt, client, orgId, onStatusChange, prePlannedTasks = []) {
        this.agentId = agentId;
        this.deploymentId = deploymentId;
        this.credentialId = credentialId;
        this.platform = platform;
        this.username = username;
        this.prompt = prompt;
        this.client = client;
        this.orgId = orgId;
        this.onStatusChange = onStatusChange;
        this.prePlannedTasks = prePlannedTasks;
        this.logger = new Logger(`Agent:${this.platform}/${this.username}`);
        this.timers = [];
        this._durationTimer = null;
        this._paused = false;
        this._stopped = false;
        this._status = 'running';
        this._lastActionAt = null;
        this._errorMessage = null;
        this._lastPlanPreview = null;
    }
    get status() {
        return this._status;
    }
    get lastActionAt() {
        return this._lastActionAt;
    }
    get errorMessage() {
        return this._errorMessage;
    }
    get lastPlanPreview() {
        return this._lastPlanPreview;
    }
    start() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            this.logger.log(`Starting for ${this.platform}/${this.username}`);
            let previewTasks;
            if (this.prePlannedTasks.length > 0) {
                previewTasks = this.prePlannedTasks;
                this.logger.log(`Using pre-planned tasks: ${previewTasks.map((p) => `${p.name}(${this.formatInterval(p.intervalMs)})`).join(', ')}`);
            }
            else {
                const preview = yield this.previewPlan();
                if (preview.validationErrors.length > 0) {
                    throw new Error(`Agent plan invalid: ${preview.validationErrors.join('; ')}`);
                }
                if (!preview.tasks.length) {
                    throw new Error('No runnable tasks were planned for this account.');
                }
                this.logger.log(`Plan source=${preview.source}; tasks=${preview.summary
                    .map((p) => `${p.name}(${p.intervalLabel})`)
                    .join(', ')}`);
                previewTasks = preview.tasks;
            }
            for (const plan of previewTasks) {
                this.forkTask(plan);
            }
            const durationMs = ((_a = previewTasks[0]) === null || _a === void 0 ? void 0 : _a.durationMs) || this.extractDurationMs(this.prompt);
            if (durationMs) {
                this.logger.log(`Auto-stop scheduled in ${this.formatInterval(durationMs)} (from prompt duration)`);
                this._durationTimer = setTimeout(() => {
                    var _a;
                    this.logger.log(`Duration reached (${this.formatInterval(durationMs)}), auto-stopping agent`);
                    this.stop();
                    (_a = this.onStatusChange) === null || _a === void 0 ? void 0 : _a.call(this, this.agentId, 'stopped', this._lastActionAt, 'Auto-stopped: prompt duration reached');
                }, durationMs);
                this.timers.push(this._durationTimer);
            }
            this._status = 'running';
        });
    }
    previewPlan() {
        return __awaiter(this, void 0, void 0, function* () {
            const capabilities = getPlatformCapabilities(this.platform);
            const requestedSubagentCount = this.extractRequestedSubagentCount(this.prompt);
            const promptValidation = this.validatePromptIntent(this.prompt);
            const baseWarnings = [...promptValidation.warnings];
            if (promptValidation.validationErrors.length > 0) {
                const preview = {
                    source: 'deterministic',
                    capabilities,
                    requestedSubagentCount,
                    tasks: [],
                    summary: [],
                    warnings: baseWarnings,
                    validationErrors: promptValidation.validationErrors,
                };
                this._lastPlanPreview = preview;
                return preview;
            }
            const source = this.prePlannedTasks.length ? 'deterministic' : 'llm';
            let candidatePlans = this.prePlannedTasks;
            let resolvedSource = source;
            if (!candidatePlans.length) {
                const built = yield this.buildCandidatePlans(requestedSubagentCount);
                candidatePlans = built.tasks;
                resolvedSource = built.source;
                baseWarnings.push(...built.warnings);
            }
            let { tasks, warnings, validationErrors } = this.normalizePlans(candidatePlans, capabilities, requestedSubagentCount);
            if (!tasks.length && resolvedSource === 'llm') {
                const detTasks = this.deterministicPlan();
                this.logger.log('LLM plan produced no runnable tasks; retrying with deterministic parser.');
                const retry = this.normalizePlans(detTasks, capabilities, requestedSubagentCount);
                tasks = retry.tasks;
                warnings = retry.warnings;
                validationErrors = retry.validationErrors;
                resolvedSource = 'deterministic';
            }
            const preview = {
                source: resolvedSource,
                capabilities,
                requestedSubagentCount,
                tasks,
                summary: tasks.map((task) => this.toSummary(task)),
                warnings: [...baseWarnings, ...warnings],
                validationErrors,
            };
            this._lastPlanPreview = preview;
            return preview;
        });
    }
    buildCandidatePlans(requestedSubagentCount) {
        return __awaiter(this, void 0, void 0, function* () {
            const warnings = [];
            const detTasks = this.deterministicPlan();
            const apiKey = this.getOpenAiApiKey();
            if (!apiKey) {
                return { source: 'deterministic', tasks: detTasks, warnings };
            }
            if (SimpleAgent.openAiKeyValid === false) {
                return { source: 'deterministic', tasks: detTasks, warnings };
            }
            try {
                const llmTasks = yield this.llmPlan(apiKey, requestedSubagentCount);
                if (llmTasks.length > 0) {
                    SimpleAgent.openAiKeyValid = true;
                    return { source: 'llm', tasks: llmTasks, warnings };
                }
                warnings.push('LLM returned empty plan; using deterministic parser instead.');
            }
            catch (e) {
                const message = (e === null || e === void 0 ? void 0 : e.message) || 'unknown error';
                if (message.includes('401') || message.includes('Unauthorized') || message.includes('invalid')) {
                    SimpleAgent.openAiKeyValid = false;
                    this.logger.log(`OpenAI API key is invalid (401). Skipping LLM planning permanently.`);
                }
                else {
                    this.logger.warn(`LLM plan failed: ${message}. Falling back to deterministic parser.`);
                    warnings.push(`LLM planning failed, fallback parser used: ${message}`);
                }
            }
            return { source: 'deterministic', tasks: detTasks, warnings };
        });
    }
    llmPlan(apiKey, requestedSubagentCount) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const countHint = requestedSubagentCount
                ? `Generate exactly ${requestedSubagentCount} distinct subagents if possible.`
                : 'Generate as many distinct runnable tasks as the instruction supports.';
            const capabilities = getPlatformCapabilities(this.platform);
            const supportedActions = [];
            const unsupportedActions = [];
            if (capabilities.supports.post)
                supportedActions.push('post');
            else
                unsupportedActions.push('post');
            if (capabilities.supports.search && capabilities.supports.comment)
                supportedActions.push('search_and_comment');
            else
                unsupportedActions.push('search_and_comment');
            if (capabilities.supports.search && capabilities.supports.like)
                supportedActions.push('search_and_like');
            else
                unsupportedActions.push('search_and_like');
            if (capabilities.supports.mentions)
                supportedActions.push('reply_mentions');
            else
                unsupportedActions.push('reply_mentions');
            const capNote = unsupportedActions.length > 0
                ? `Platform "${this.platform}" does NOT support: ${unsupportedActions.join(', ')}. Do not generate these actions.`
                : `All actions are supported on ${this.platform}.`;
            const resp = yield fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a social automation planner.
Return ONLY a JSON object with a "tasks" array.
Allowed action values: ${supportedActions.join(', ')}.
Each item shape:
{
  "name": string,
  "action": string,
  "intervalMs": number,
  "topic"?: string,
  "query"?: string,
  "targetSubreddit"?: string
}
Rules:
- Min interval is 1800000.
- For reddit post tasks include targetSubreddit without the r/ prefix.
- ${capNote}
- ${countHint}
- Do not return markdown.`,
                        },
                        {
                            role: 'user',
                            content: `Platform: ${this.platform}
Instruction: ${this.prompt}`,
                        },
                    ],
                    max_tokens: 600,
                    temperature: 0.2,
                    response_format: { type: 'json_object' },
                }),
            });
            if (!resp.ok) {
                throw new Error(`OpenAI responded ${resp.status}`);
            }
            const data = (yield resp.json());
            const content = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content;
            if (!content || typeof content !== 'string') {
                throw new Error('OpenAI returned empty plan content');
            }
            return this.parsePlannerTasks(content);
        });
    }
    deterministicPlan() {
        const instructions = this.prompt
            .split(/[\n.!?]+/)
            .map((part) => part.trim())
            .filter(Boolean);
        const tasks = [];
        const seen = new Set();
        const globalSubreddit = this.extractSubreddit(this.prompt);
        const literalText = this.extractLiteralText(this.prompt);
        const durationMs = this.extractDurationMs(this.prompt);
        const mappedSubreddits = this.mapCommunitiesToSubreddits(this.prompt);
        const pushTask = (task) => {
            const key = `${task.action}|${task.query || ''}|${task.topic || ''}|${task.targetSubreddit || ''}`;
            if (seen.has(key))
                return;
            seen.add(key);
            tasks.push(task);
        };
        instructions.forEach((line, index) => {
            const lower = line.toLowerCase();
            const topic = this.extractTopic(line) || this.extractTopic(this.prompt) || this.prompt.slice(0, 180);
            const query = this.extractQuery(line) || topic;
            const targetSubreddit = this.extractSubreddit(line) || globalSubreddit || undefined;
            const isWriteComment = /\bwrite\s+a?\s*(comment|reply)\b/i.test(line);
            const isPostAsNoun = /\b(comment|like|reply|on|to|of|the|a|an|his|her|their|my|your|latest|new|recent)\s+(post|posts|tweet|tweets)\b/i.test(line);
            if ((/\b(post|publish|tweet|share)\b/.test(lower) || (/\bwrite\b/.test(lower) && !isWriteComment)) &&
                !isPostAsNoun) {
                pushTask({
                    name: `poster_${index + 1}`,
                    action: 'post',
                    intervalMs: this.extractIntervalMs(line, 2 * 60 * 60 * 1000),
                    topic: literalText || topic,
                    targetSubreddit,
                    literalText: literalText || undefined,
                    durationMs: durationMs || undefined,
                });
            }
            if (/\b(comment|respond to posts|engage in comments|reply on posts)\b/.test(lower) || isWriteComment) {
                const taskSubreddits = targetSubreddit ? [targetSubreddit] : mappedSubreddits.length ? mappedSubreddits : [];
                if (taskSubreddits.length > 0) {
                    for (const sr of taskSubreddits) {
                        pushTask({
                            name: `commenter_${sr}_${index + 1}`,
                            action: 'search_and_comment',
                            intervalMs: this.extractIntervalMs(line, 45 * 60 * 1000),
                            query,
                            targetSubreddit: sr,
                            literalText: literalText || undefined,
                            durationMs: durationMs || undefined,
                        });
                    }
                }
                else {
                    pushTask({
                        name: `commenter_${index + 1}`,
                        action: 'search_and_comment',
                        intervalMs: this.extractIntervalMs(line, 45 * 60 * 1000),
                        query,
                        literalText: literalText || undefined,
                        durationMs: durationMs || undefined,
                    });
                }
            }
            if (/\b(like|upvote|react)\b/.test(lower)) {
                pushTask({
                    name: `liker_${index + 1}`,
                    action: 'search_and_like',
                    intervalMs: this.extractIntervalMs(line, 30 * 60 * 1000),
                    query,
                    durationMs: durationMs || undefined,
                });
            }
            if (/\b(mention|mentions|notification|notifications|inbox)\b/.test(lower) &&
                /\b(reply|respond|monitor|watch|track)\b/.test(lower)) {
                pushTask({
                    name: `responder_${index + 1}`,
                    action: 'reply_mentions',
                    intervalMs: this.extractIntervalMs(line, 30 * 60 * 1000),
                    topic,
                    durationMs: durationMs || undefined,
                });
            }
        });
        if (!tasks.length) {
            const fallbackTopic = this.extractTopic(this.prompt) || this.prompt.slice(0, 180);
            tasks.push({
                name: 'poster_default',
                action: 'post',
                intervalMs: 2 * 60 * 60 * 1000,
                topic: literalText || fallbackTopic,
                targetSubreddit: globalSubreddit || undefined,
                literalText: literalText || undefined,
                durationMs: durationMs || undefined,
            });
        }
        return tasks;
    }
    normalizePlans(candidatePlans, capabilities, requestedSubagentCount) {
        var _a;
        const warnings = [];
        const validationErrors = [];
        const tasks = [];
        const seenNames = new Set();
        candidatePlans.forEach((rawTask, index) => {
            var _a, _b, _c;
            const action = this.normalizeAction(rawTask === null || rawTask === void 0 ? void 0 : rawTask.action);
            this.logger.debug(`normalizePlans task #${index + 1}: action="${rawTask === null || rawTask === void 0 ? void 0 : rawTask.action}" resolved=${action}`);
            if (!action) {
                warnings.push(`Ignored task #${index + 1}: unsupported action "${rawTask === null || rawTask === void 0 ? void 0 : rawTask.action}".`);
                return;
            }
            if (!supportsTaskAction(capabilities, action)) {
                warnings.push(`Skipped "${(rawTask === null || rawTask === void 0 ? void 0 : rawTask.name) || `task_${index + 1}`}" because ${this.platform} does not support ${action}.`);
                return;
            }
            const nameBase = ((rawTask === null || rawTask === void 0 ? void 0 : rawTask.name) || `${action}_${index + 1}`)
                .toLowerCase()
                .replace(/[^a-z0-9_]+/g, '_')
                .replace(/^_+|_+$/g, '');
            const name = this.ensureUniqueName(nameBase || `${action}_${index + 1}`, seenNames);
            const normalized = {
                name,
                action,
                intervalMs: Math.max(Number.isFinite(rawTask === null || rawTask === void 0 ? void 0 : rawTask.intervalMs) ? Number(rawTask.intervalMs) : this.defaultIntervalMs(action), MIN_INTERVAL_MS),
                topic: ((_a = rawTask === null || rawTask === void 0 ? void 0 : rawTask.topic) === null || _a === void 0 ? void 0 : _a.trim()) || undefined,
                query: ((_b = rawTask === null || rawTask === void 0 ? void 0 : rawTask.query) === null || _b === void 0 ? void 0 : _b.trim()) || undefined,
                targetSubreddit: this.normalizeSubreddit(rawTask === null || rawTask === void 0 ? void 0 : rawTask.targetSubreddit),
                literalText: ((_c = rawTask === null || rawTask === void 0 ? void 0 : rawTask.literalText) === null || _c === void 0 ? void 0 : _c.trim()) || undefined,
                durationMs: (rawTask === null || rawTask === void 0 ? void 0 : rawTask.durationMs) || undefined,
            };
            if (action === 'post' && this.platform === 'reddit') {
                normalized.targetSubreddit =
                    normalized.targetSubreddit ||
                        this.extractSubreddit((rawTask === null || rawTask === void 0 ? void 0 : rawTask.topic) || '') ||
                        this.extractSubreddit((rawTask === null || rawTask === void 0 ? void 0 : rawTask.query) || '') ||
                        this.extractSubreddit(this.prompt) ||
                        undefined;
                if (!normalized.targetSubreddit) {
                    warnings.push(`Skipped "${name}" post task: Reddit posts need explicit r/subreddit (example: r/startups).`);
                    return;
                }
            }
            if (action === 'post' && !normalized.topic) {
                normalized.topic = this.extractTopic(this.prompt) || this.prompt.slice(0, 180);
            }
            if ((action === 'search_and_comment' || action === 'search_and_like') &&
                !normalized.query) {
                normalized.query = this.extractQuery(this.prompt) || this.extractTopic(this.prompt) || this.prompt.slice(0, 180);
            }
            // Deduplicate: skip if same action + query + subreddit already planned
            const dedupeKey = `${normalized.action}|${normalized.query || ''}|${normalized.targetSubreddit || ''}`;
            const alreadyExists = tasks.some((t) => {
                const existingKey = `${t.action}|${t.query || ''}|${t.targetSubreddit || ''}`;
                return existingKey === dedupeKey;
            });
            if (alreadyExists) {
                warnings.push(`Skipped duplicate task "${normalized.name}" (same action+query already planned).`);
                return;
            }
            tasks.push(normalized);
            this.logger.debug(`normalizePlans task #${index + 1} pushed: name=${normalized.name}`);
        });
        this.logger.debug(`normalizePlans after loop: ${tasks.length} tasks, ${warnings.length} warnings`);
        if (!tasks.length) {
            const fallbackQuery = this.extractQuery(this.prompt) ||
                this.extractTopic(this.prompt) ||
                this.prompt.slice(0, 180);
            const addFallback = (task) => {
                if (!supportsTaskAction(capabilities, task.action)) {
                    return;
                }
                const fallbackName = this.ensureUniqueName(task.name, seenNames);
                tasks.push(Object.assign(Object.assign({}, task), { name: fallbackName }));
            };
            addFallback({
                name: 'commenter_fallback',
                action: 'search_and_comment',
                intervalMs: 45 * 60 * 1000,
                query: fallbackQuery,
            });
            addFallback({
                name: 'liker_fallback',
                action: 'search_and_like',
                intervalMs: 30 * 60 * 1000,
                query: fallbackQuery,
            });
            addFallback({
                name: 'responder_fallback',
                action: 'reply_mentions',
                intervalMs: 30 * 60 * 1000,
                topic: fallbackQuery,
            });
            if (!tasks.length && capabilities.supports.post) {
                const fallbackSubreddit = this.extractSubreddit(this.prompt) || undefined;
                if (this.platform !== 'reddit' || fallbackSubreddit) {
                    addFallback({
                        name: 'poster_fallback',
                        action: 'post',
                        intervalMs: 2 * 60 * 60 * 1000,
                        topic: fallbackQuery,
                        targetSubreddit: fallbackSubreddit,
                    });
                }
            }
            if (tasks.length) {
                warnings.push(`No runnable tasks were derived directly from the instruction for ${this.platform}/${this.username}. Using capability-safe fallback tasks.`);
            }
            else {
                validationErrors.push(`No runnable tasks could be generated for ${this.platform}/${this.username}.`);
            }
        }
        const normalizedRequestedCount = this.normalizeRequestedSubagentCount(requestedSubagentCount);
        const stagger = this.extractStaggerKeyword(this.prompt);
        this.logger.debug(`normalizePlans before align: ${tasks.length} tasks, requestedCount=${normalizedRequestedCount}, stagger=${stagger}`);
        if (normalizedRequestedCount && tasks.length > 0) {
            const aligned = this.alignTaskCount(tasks, normalizedRequestedCount, seenNames, warnings);
            this.logger.debug(`normalizePlans align returned: ${aligned.length} tasks`);
            const alignedCopy = [...aligned];
            tasks.length = 0;
            tasks.push(...alignedCopy);
            const total = tasks.length;
            if (stagger) {
                tasks.forEach((task, index) => {
                    const interval = task.intervalMs || this.defaultIntervalMs(task.action);
                    const spread = Math.max(60000, Math.floor(interval / Math.max(total, 1)));
                    const calculatedDelay = spread * index;
                    task.startDelayMs = Math.max(task.startDelayMs || 0, calculatedDelay);
                });
                warnings.push(`${total} subagents staggered by ${this.formatDelay(Math.max(60000, Math.floor((((_a = tasks[0]) === null || _a === void 0 ? void 0 : _a.intervalMs) || MIN_INTERVAL_MS) / Math.max(total, 1))))} each to avoid rate limits.`);
            }
            else {
                tasks.forEach((task) => {
                    task.startDelayMs = 0;
                });
                warnings.push(`${total} subagents running in parallel with no stagger.`);
            }
        }
        this.logger.debug(`normalizePlans result: ${tasks.length} tasks after normalization, ${warnings.length} warnings, ${validationErrors.length} errors`);
        return { tasks, warnings, validationErrors };
    }
    normalizeAction(value) {
        if (!value)
            return null;
        if (value === 'post')
            return 'post';
        if (value === 'search_and_comment')
            return 'search_and_comment';
        if (value === 'search_and_like')
            return 'search_and_like';
        if (value === 'reply_mentions')
            return 'reply_mentions';
        return null;
    }
    defaultIntervalMs(action) {
        switch (action) {
            case 'post':
                return 2 * 60 * 60 * 1000;
            case 'search_and_comment':
                return 45 * 60 * 1000;
            case 'search_and_like':
                return 30 * 60 * 1000;
            case 'reply_mentions':
                return 30 * 60 * 1000;
            default:
                return MIN_INTERVAL_MS;
        }
    }
    validatePromptIntent(prompt) {
        const warnings = [];
        const validationErrors = [];
        if (this.platform === 'reddit') {
            const creationRequest = /\b(?:create|make|launch|spin up|start)\s+(?:a\s+)?subreddit\b/i.test(prompt);
            const operationalRequest = /\b(post|comment|fork|reply|like|every|schedule|subagent|subagents|worker|workers)\b/i.test(prompt);
            if (creationRequest && operationalRequest) {
                validationErrors.push('Reddit subreddit creation is not supported. Choose an existing r/subreddit target instead.');
            }
            if (/\bfork\b[\s\S]*\bsubreddits?\b/i.test(prompt) && !/\bsubagents?\b/i.test(prompt)) {
                warnings.push('Fork requests only count subagents or workers. "Subreddits" is treated as content, not parallelism.');
            }
        }
        const intervalMatch = prompt.match(/\bevery\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/i);
        if (intervalMatch) {
            const amount = Number(intervalMatch[1]);
            const unit = intervalMatch[2].toLowerCase();
            if (Number.isFinite(amount) && amount > 0) {
                const requestedIntervalMs = this.intervalMsFromAmount(amount, unit);
                if (requestedIntervalMs < MIN_INTERVAL_MS) {
                    warnings.push(`Requested cadence of ${this.describeIntervalAmount(amount, unit)} is below the ${this.formatInterval(MIN_INTERVAL_MS)} minimum and will be raised to ${this.formatInterval(MIN_INTERVAL_MS)}.`);
                }
            }
        }
        if (/\bfor\s+\d+\s*(?:minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/i.test(prompt)) {
            warnings.push('Duration window detected; agent will auto-stop after the specified time.');
        }
        return { warnings, validationErrors };
    }
    extractIntervalMs(text, fallbackMs) {
        const numbered = text.match(/\bevery\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/i);
        if (numbered) {
            const amount = Number(numbered[1]);
            const unit = numbered[2].toLowerCase();
            if (!Number.isFinite(amount) || amount <= 0)
                return Math.max(fallbackMs, MIN_INTERVAL_MS);
            return Math.max(this.intervalMsFromAmount(amount, unit), MIN_INTERVAL_MS);
        }
        if (/\bhourly\b/i.test(text))
            return Math.max(60 * 60 * 1000, MIN_INTERVAL_MS);
        if (/\bdaily\b/i.test(text))
            return Math.max(24 * 60 * 60 * 1000, MIN_INTERVAL_MS);
        if (/\bhalf[- ]?hour(ly)?\b/i.test(text))
            return Math.max(30 * 60 * 1000, MIN_INTERVAL_MS);
        return Math.max(fallbackMs, MIN_INTERVAL_MS);
    }
    intervalMsFromAmount(amount, unit) {
        if (unit.startsWith('day'))
            return amount * 24 * 60 * 60 * 1000;
        if (unit.startsWith('hour') || unit.startsWith('hr'))
            return amount * 60 * 60 * 1000;
        return amount * 60 * 1000;
    }
    describeIntervalAmount(amount, unit) {
        if (unit.startsWith('day')) {
            return `${amount} ${amount === 1 ? 'day' : 'days'}`;
        }
        if (unit.startsWith('hour') || unit.startsWith('hr')) {
            return `${amount} ${amount === 1 ? 'hour' : 'hours'}`;
        }
        return `${amount} ${amount === 1 ? 'minute' : 'minutes'}`;
    }
    extractTopic(text) {
        const match = text.match(/\b(?:about|on|regarding|focused on|focus on)\s+(.+?)(?:\s+\bevery\b|$)/i);
        if (match === null || match === void 0 ? void 0 : match[1])
            return match[1].trim().slice(0, 240);
        const compact = text.replace(/\s+/g, ' ').trim();
        return compact ? compact.slice(0, 240) : null;
    }
    extractQuery(text) {
        const cleaned = this.stripActionPhrases(text);
        const match = cleaned.match(/\b(?:search|find|look for)\s+(?:for\s+)?(.+?)(?:\s+\bevery\b|$)/i);
        if (match === null || match === void 0 ? void 0 : match[1])
            return match[1].trim().slice(0, 240);
        const about = cleaned.match(/\b(?:about|on|for)\s+(.+?)(?:\s+\bevery\b|$)/i);
        if (about === null || about === void 0 ? void 0 : about[1])
            return about[1].trim().slice(0, 240);
        return cleaned.trim().slice(0, 240) || null;
    }
    stripActionPhrases(text) {
        return text
            .replace(/\bwrite\s+(a|an|the)\s+\w+\s*/gi, '')
            .replace(/\b(?:fork|spawn|create|make|build|launch|run)\s+(?:yourself\s+)?(?:into\s+)?\d+\s+(?:sub[- ]?agents?|agents?|workers?|forks?)\b/gi, '')
            .replace(/\bfor\s+\d+\s*(?:minute|minutes|min|mins|hour|hours|hr|hrs|day|days|second|seconds|sec|secs)\b/gi, '')
            .replace(/\band do the same operations\b/gi, '')
            .replace(/\bdo the same\b/gi, '')
            .replace(/\bdo it\b/gi, '')
            .replace(/\b(?:every|each)\s+\d+\s*(?:minute|minutes|min|mins|hour|hours|hr|hrs|day|days)\b/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }
    extractSubreddit(text) {
        const match = text.match(/\br\/([A-Za-z0-9_]+)\b/);
        return (match === null || match === void 0 ? void 0 : match[1]) || null;
    }
    extractLiteralText(text) {
        const match = text.match(/"([^"]+)"|'([^']+)'|"([^"]+)"|'([^']+)'/);
        if (match) {
            return (match[1] || match[2] || match[3] || match[4] || '').trim() || null;
        }
        const writeMatch = text.match(/\bwrite\s+(?:"([^"]+)"|'([^']+)'|"([^"]+)"|'([^']+)')\b/i);
        if (writeMatch) {
            return (writeMatch[1] || writeMatch[2] || writeMatch[3] || writeMatch[4] || '').trim() || null;
        }
        const sayMatch = text.match(/\b(?:say|comment|post)\s+(?:"([^"]+)"|'([^']+)'|"([^"]+)"|'([^']+)')\b/i);
        if (sayMatch) {
            return (sayMatch[1] || sayMatch[2] || sayMatch[3] || sayMatch[4] || '').trim() || null;
        }
        return null;
    }
    extractDurationMs(text) {
        const match = text.match(/\bfor\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|second|seconds|sec|secs)\b/i);
        if (match) {
            const amount = Number(match[1]);
            const unit = match[2].toLowerCase();
            if (!Number.isFinite(amount) || amount <= 0)
                return null;
            if (unit.startsWith('day'))
                return amount * 24 * 60 * 60 * 1000;
            if (unit.startsWith('hour') || unit.startsWith('hr'))
                return amount * 60 * 60 * 1000;
            if (unit.startsWith('min'))
                return amount * 60 * 1000;
            if (unit.startsWith('sec'))
                return amount * 1000;
            return amount * 60 * 1000;
        }
        return null;
    }
    mapCommunitiesToSubreddits(text) {
        const lower = text.toLowerCase();
        const subreddits = [];
        const mappings = [
            { keywords: ['indian startup', 'india startup', 'startup india', 'indian startups', 'india startups'], subreddit: 'StartUpIndia' },
            { keywords: ['indian stock', 'india stock', 'indian market', 'stock market india', 'nifty', 'sensex', 'bse', 'nse'], subreddit: 'IndianStreetBets' },
            { keywords: ['indian tech', 'india tech', 'indian technology', 'tech india'], subreddit: 'developersIndia' },
            { keywords: ['indian business', 'india business', 'business india'], subreddit: 'IndiaBusiness' },
            { keywords: ['indian entrepreneur', 'india entrepreneur', 'indian founders'], subreddit: 'IndiaStartup' },
            { keywords: ['india investment', 'indian investment', 'investment india', 'personalfinance india', 'indian finance'], subreddit: 'IndiaInvestments' },
        ];
        for (const mapping of mappings) {
            if (mapping.keywords.some((kw) => lower.includes(kw))) {
                subreddits.push(mapping.subreddit);
            }
        }
        return [...new Set(subreddits)];
    }
    normalizeSubreddit(value) {
        if (!value)
            return undefined;
        const cleaned = value.trim().replace(/^r\//i, '');
        return /^[A-Za-z0-9_]+$/.test(cleaned) ? cleaned : undefined;
    }
    ensureUniqueName(base, used) {
        let candidate = base;
        let idx = 2;
        while (used.has(candidate)) {
            candidate = `${base}_${idx}`;
            idx += 1;
        }
        used.add(candidate);
        return candidate;
    }
    toSummary(task) {
        return {
            name: task.name,
            action: task.action,
            intervalMs: task.intervalMs,
            intervalLabel: this.formatInterval(task.intervalMs),
            topic: task.topic,
            query: task.query,
            targetSubreddit: task.targetSubreddit,
            literalText: task.literalText,
        };
    }
    formatInterval(intervalMs) {
        if (intervalMs % (24 * 60 * 60 * 1000) === 0) {
            const days = intervalMs / (24 * 60 * 60 * 1000);
            return `${days}d`;
        }
        if (intervalMs % (60 * 60 * 1000) === 0) {
            const hours = intervalMs / (60 * 60 * 1000);
            return `${hours}h`;
        }
        const mins = Math.round(intervalMs / (60 * 1000));
        return `${mins}m`;
    }
    formatDelay(delayMs) {
        if (!Number.isFinite(delayMs) || delayMs <= 0)
            return 'now';
        if (delayMs % (60 * 60 * 1000) === 0) {
            const hours = delayMs / (60 * 60 * 1000);
            return `${hours}h delay`;
        }
        if (delayMs % (60 * 1000) === 0) {
            const mins = delayMs / (60 * 1000);
            return `${mins}m delay`;
        }
        const secs = Math.round(delayMs / 1000);
        return `${secs}s delay`;
    }
    extractJsonArray(content) {
        const trimmed = content.trim();
        if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
            return trimmed;
        }
        const objectStart = trimmed.indexOf('{');
        const objectEnd = trimmed.lastIndexOf('}');
        const arrayStart = trimmed.indexOf('[');
        const arrayEnd = trimmed.lastIndexOf(']');
        const start = objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
        const end = Math.max(objectEnd, arrayEnd);
        if (start === -1 || end === -1 || end <= start) {
            throw new Error('Planner response did not include JSON');
        }
        return trimmed.slice(start, end + 1);
    }
    parsePlannerTasks(content) {
        const payload = this.extractJsonArray(content);
        const parsed = JSON.parse(payload);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        if (parsed && typeof parsed === 'object') {
            const record = parsed;
            for (const key of ['tasks', 'subagents', 'agents', 'plans']) {
                if (Array.isArray(record[key])) {
                    return record[key];
                }
            }
        }
        throw new Error('Planner output did not include a tasks array');
    }
    normalizeRequestedSubagentCount(value) {
        if (value === null || value === undefined)
            return null;
        if (!Number.isFinite(value))
            return null;
        const normalized = Math.round(value);
        if (normalized < 1)
            return null;
        return normalized;
    }
    extractRequestedSubagentCount(text) {
        const patterns = [
            /\b(?:fork|spawn|create|make|build|launch|run)\s+(?:yourself\s+)?(?:into\s+)?(\d+)\s+(?:sub[- ]?agents?|agents?|workers?|forks?)\b/i,
            /\b(\d+)\s+(?:sub[- ]?agents?|agents?|workers?|forks?)\b/i,
            /\b(?:sub[- ]?agents?|agents?|workers?)\s*(?:x|:|=)\s*(\d+)\b/i,
        ];
        for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match === null || match === void 0 ? void 0 : match[1]) {
                const parsed = Number(match[1]);
                const normalized = this.normalizeRequestedSubagentCount(parsed);
                if (normalized)
                    return normalized;
            }
        }
        return null;
    }
    extractStaggerKeyword(text) {
        return /\b(?:stagger|staggered|staggering|delay|delayed|one by one|sequential|sequentially|spread out)\b/i.test(text);
    }
    alignTaskCount(tasks, requestedCount, seenNames, warnings) {
        if (!tasks.length) {
            return tasks;
        }
        if (tasks.length === requestedCount) {
            return tasks;
        }
        if (tasks.length > requestedCount) {
            warnings.push(`Trimmed plan from ${tasks.length} tasks down to ${requestedCount} requested subagents.`);
            return tasks.slice(0, requestedCount);
        }
        const aligned = [...tasks];
        const fragments = this.extractPromptFragments(this.prompt);
        let index = 0;
        while (aligned.length < requestedCount) {
            const source = tasks[index % tasks.length];
            const cloneNumber = aligned.length + 1;
            const clonedName = this.ensureUniqueName(`${source.name}_fork_${cloneNumber}`, seenNames);
            const variantSeed = fragments.length > 0
                ? fragments[index % fragments.length]
                : `${source.topic || source.query || this.extractTopic(this.prompt) || 'focus'} angle ${cloneNumber}`;
            const delayStep = Math.max(60000, Math.floor((source.intervalMs || this.defaultIntervalMs(source.action)) / requestedCount));
            aligned.push(Object.assign(Object.assign({}, source), { name: clonedName, startDelayMs: delayStep * (cloneNumber - 1), topic: source.action === 'post' ? this.variantText(source.topic || variantSeed, cloneNumber) : source.topic, query: source.action === 'post' ? source.query : this.variantText(source.query || variantSeed, cloneNumber) }));
            index += 1;
        }
        warnings.push(`Expanded plan from ${tasks.length} to ${requestedCount} requested subagents.`);
        return aligned;
    }
    variantText(base, variantNumber) {
        const compact = base.replace(/\s+/g, ' ').trim();
        return `${compact} (focus ${variantNumber})`.slice(0, 240);
    }
    extractPromptFragments(text) {
        return text
            .split(/[\n.!?;]+/)
            .map((part) => part.trim())
            .flatMap((part) => part.split(/\s+\b(?:and|plus|also|then|with|while|for)\b\s+/i))
            .map((part) => part.trim())
            .filter((part) => part.length >= 6)
            .map((part) => part.slice(0, 120))
            .filter(Boolean)
            .slice(0, 20);
    }
    forkTask(plan) {
        const run = () => __awaiter(this, void 0, void 0, function* () {
            if (this._stopped || this._paused)
                return;
            yield this.executeTask(plan);
        });
        const start = () => {
            run().catch((err) => {
                this.logger.error(`Initial run failed for ${plan.name}: ${err.message}`);
            });
            const timer = setInterval(run, plan.intervalMs);
            this.timers.push(timer);
        };
        const delay = Math.max(0, plan.startDelayMs || 0);
        if (delay > 0) {
            this.logger.log(`Staggering ${plan.name} first run by ${this.formatDelay(delay)}`);
            const timer = setTimeout(start, delay);
            this.timers.push(timer);
            return;
        }
        start();
    }
    executeTask(plan) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            try {
                let detail = '';
                const locationPrefix = plan.targetSubreddit ? `r/${plan.targetSubreddit}` : 'global';
                switch (plan.action) {
                    case 'post': {
                        const text = plan.literalText || (yield this.genPost(plan.topic || this.prompt));
                        const payload = this.platform === 'reddit' && plan.targetSubreddit
                            ? `r/${plan.targetSubreddit}: ${text}`
                            : text;
                        const result = yield this.client.post(payload);
                        this.ensureActionSucceeded(result, `${plan.name} post`);
                        const url = ((_a = result.data) === null || _a === void 0 ? void 0 : _a.url) || '';
                        detail =
                            this.platform === 'reddit' && plan.targetSubreddit
                                ? `Posted to r/${plan.targetSubreddit}: "${text.slice(0, 100)}"${url ? ` (${url})` : ''}`
                                : `Posted: "${text.slice(0, 100)}"${url ? ` (${url})` : ''}`;
                        break;
                    }
                    case 'search_and_comment': {
                        const posts = yield this.client.searchPosts(plan.query || this.prompt, 5, this.platform === 'reddit' ? plan.targetSubreddit : undefined);
                        if (!posts.length) {
                            detail = `No posts found for query "${plan.query || this.prompt}" in ${locationPrefix}`;
                            break;
                        }
                        const pick = posts[Math.floor(Math.random() * posts.length)];
                        const comment = plan.literalText || (yield this.genComment(plan.query || this.prompt, pick.text));
                        const result = yield this.client.comment(pick.id, comment, pick.extra);
                        this.ensureActionSucceeded(result, `${plan.name} comment`);
                        const permalink = this.formatPostUrl(pick);
                        if (this.platform === 'reddit') {
                            const subreddit = ((_b = pick.extra) === null || _b === void 0 ? void 0 : _b.subreddit) || plan.targetSubreddit || 'unknown';
                            detail = `Commented "${comment.slice(0, 60)}" on post in r/${subreddit} (${permalink})`;
                        }
                        else {
                            detail = `Commented "${comment.slice(0, 60)}" on post ${permalink}`;
                        }
                        break;
                    }
                    case 'search_and_like': {
                        const posts = yield this.client.searchPosts(plan.query || this.prompt, 10, this.platform === 'reddit' ? plan.targetSubreddit : undefined);
                        if (!posts.length) {
                            detail = `No posts found for query "${plan.query || this.prompt}" in ${locationPrefix}`;
                            break;
                        }
                        const picks = posts.sort(() => Math.random() - 0.5).slice(0, 3);
                        const likedDetails = [];
                        for (const p of picks) {
                            const result = yield this.client.like(p.id, p.extra);
                            this.ensureActionSucceeded(result, `${plan.name} like on ${p.id}`);
                            const permalink = this.formatPostUrl(p);
                            if (this.platform === 'reddit') {
                                const subreddit = ((_c = p.extra) === null || _c === void 0 ? void 0 : _c.subreddit) || plan.targetSubreddit || 'unknown';
                                likedDetails.push(`${p.id} in r/${subreddit} (${permalink})`);
                            }
                            else {
                                likedDetails.push(`${p.id} (${permalink})`);
                            }
                        }
                        detail = `Liked ${likedDetails.length} post(s) in ${locationPrefix}: ${likedDetails.join('; ')}`;
                        break;
                    }
                    case 'reply_mentions': {
                        const mentions = yield this.client.getMentions(5);
                        if (!mentions.length) {
                            detail = 'No mentions found';
                            break;
                        }
                        const replyDetails = [];
                        for (const mention of mentions) {
                            const reply = yield this.genComment(plan.topic || this.prompt, mention.text);
                            const result = yield this.client.reply(mention.id, reply, mention.extra);
                            this.ensureActionSucceeded(result, `${plan.name} reply on ${mention.id}`);
                            if (this.platform === 'reddit') {
                                const subreddit = ((_d = mention.extra) === null || _d === void 0 ? void 0 : _d.subreddit) || 'unknown';
                                replyDetails.push(`${mention.id} in r/${subreddit}`);
                            }
                            else {
                                replyDetails.push(`${mention.id} by @${mention.author || 'unknown'}`);
                            }
                        }
                        detail = `Replied to ${replyDetails.length} mention(s): ${replyDetails.join('; ')}`;
                        break;
                    }
                }
                this._lastActionAt = new Date();
                this._errorMessage = null;
                yield this.pushLog('success', plan.name, plan.action, detail);
                (_e = this.onStatusChange) === null || _e === void 0 ? void 0 : _e.call(this, this.agentId, 'running', this._lastActionAt, null);
            }
            catch (err) {
                const message = (err === null || err === void 0 ? void 0 : err.message) || 'Unknown error';
                this._lastActionAt = new Date();
                this._errorMessage = message;
                yield this.pushLog('error', plan.name, plan.action, message);
                this.logger.error(`Task ${plan.name} failed: ${message}`);
                (_f = this.onStatusChange) === null || _f === void 0 ? void 0 : _f.call(this, this.agentId, 'running', this._lastActionAt, this._errorMessage);
            }
        });
    }
    formatPostUrl(post) {
        var _a;
        if (this.platform === 'reddit' && ((_a = post.extra) === null || _a === void 0 ? void 0 : _a.permalink)) {
            return `https://reddit.com${post.extra.permalink}`;
        }
        return post.id;
    }
    ensureActionSucceeded(result, context) {
        if (!result.success) {
            throw new Error(`${context} failed: ${result.error || 'unknown platform error'}`);
        }
    }
    genPost(topic) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const apiKey = this.getOpenAiApiKey();
            if (!apiKey) {
                return `Quick update on ${topic}`.slice(0, 260);
            }
            try {
                const resp = yield fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'user',
                                content: `Write a single social media post.
Topic: ${topic}
Platform: ${this.platform}
Instruction context: ${this.prompt}
Constraints: under 280 characters, natural tone, output only the post text.`,
                            },
                        ],
                        max_tokens: 160,
                        temperature: 0.8,
                    }),
                });
                if (!resp.ok)
                    throw new Error(`OpenAI responded ${resp.status}`);
                const d = (yield resp.json());
                const text = (_d = (_c = (_b = (_a = d === null || d === void 0 ? void 0 : d.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim();
                if (!text)
                    throw new Error('OpenAI returned empty post');
                return text;
            }
            catch (_e) {
                return `Quick update on ${topic}`.slice(0, 260);
            }
        });
    }
    genComment(topic, postText) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const apiKey = this.getOpenAiApiKey();
            if (!apiKey) {
                return `Helpful point on ${topic}. Thanks for sharing.`;
            }
            try {
                const resp = yield fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'user',
                                content: `Write a short reply to this post.
Topic: ${topic}
Post: "${postText.slice(0, 220)}"
Keep it under 150 characters and conversational. Output only the reply.`,
                            },
                        ],
                        max_tokens: 100,
                        temperature: 0.75,
                    }),
                });
                if (!resp.ok)
                    throw new Error(`OpenAI responded ${resp.status}`);
                const d = (yield resp.json());
                const text = (_d = (_c = (_b = (_a = d === null || d === void 0 ? void 0 : d.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim();
                if (!text)
                    throw new Error('OpenAI returned empty comment');
                return text;
            }
            catch (_e) {
                return `Helpful point on ${topic}. Thanks for sharing.`;
            }
        });
    }
    pushLog(status, taskName, action, detail) {
        return __awaiter(this, void 0, void 0, function* () {
            const entry = {
                agentId: this.agentId,
                credentialId: this.credentialId,
                platform: this.platform,
                username: this.username,
                deploymentId: this.deploymentId,
                taskName,
                action,
                status,
                detail,
                ts: new Date().toISOString(),
            };
            try {
                const key = `swarm:deploy:logs:${this.orgId}`;
                yield ioRedis.lpush(key, JSON.stringify(entry));
                yield ioRedis.ltrim(key, 0, 499);
            }
            catch (_a) {
                // Non-critical.
            }
        });
    }
    getOpenAiApiKey() {
        const raw = process.env.OPENAI_API_KEY ||
            process.env.openai_api_key ||
            process.env.OPEN_AI_API_KEY ||
            process.env.OPENAI_KEY ||
            '';
        const trimmed = raw.trim();
        return trimmed.length ? trimmed : null;
    }
    pause() {
        var _a;
        this._paused = true;
        this._status = 'paused';
        (_a = this.onStatusChange) === null || _a === void 0 ? void 0 : _a.call(this, this.agentId, 'paused', this._lastActionAt, this._errorMessage);
    }
    resume() {
        var _a;
        this._paused = false;
        this._status = 'running';
        (_a = this.onStatusChange) === null || _a === void 0 ? void 0 : _a.call(this, this.agentId, 'running', this._lastActionAt, this._errorMessage);
    }
    stop() {
        var _a;
        this._stopped = true;
        this._status = 'stopped';
        for (const timer of this.timers)
            clearInterval(timer);
        this.timers = [];
        if (this._durationTimer) {
            clearTimeout(this._durationTimer);
            this._durationTimer = null;
        }
        (_a = this.onStatusChange) === null || _a === void 0 ? void 0 : _a.call(this, this.agentId, 'stopped', this._lastActionAt, this._errorMessage);
        this.logger.log(`Stopped ${this.platform}/${this.username}`);
    }
}
SimpleAgent.openAiKeyValid = null;
//# sourceMappingURL=simple.agent.js.map