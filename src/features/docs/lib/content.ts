/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { DocsSectionId } from './sections'

import authEn from '../content/en/authentication.md?raw'
import authZh from '../content/zh/authentication.md?raw'
import audioEn from '../content/en/audio.md?raw'
import audioZh from '../content/zh/audio.md?raw'
import alphaSearchEn from '../content/en/alpha-search.md?raw'
import alphaSearchZh from '../content/zh/alpha-search.md?raw'
import billingEn from '../content/en/billing.md?raw'
import billingZh from '../content/zh/billing.md?raw'
import chatEn from '../content/en/chat-completions.md?raw'
import chatZh from '../content/zh/chat-completions.md?raw'
import claudeEn from '../content/en/claude-messages.md?raw'
import claudeZh from '../content/zh/claude-messages.md?raw'
import embeddingsEn from '../content/en/embeddings.md?raw'
import embeddingsZh from '../content/zh/embeddings.md?raw'
import errorsEn from '../content/en/errors.md?raw'
import errorsZh from '../content/zh/errors.md?raw'
import geminiEn from '../content/en/gemini.md?raw'
import geminiZh from '../content/zh/gemini.md?raw'
import imageEn from '../content/en/image-generation.md?raw'
import imageZh from '../content/zh/image-generation.md?raw'
import modelsEn from '../content/en/models.md?raw'
import modelsZh from '../content/zh/models.md?raw'
import openaiModelsEn from '../content/en/openai-models.md?raw'
import openaiModelsZh from '../content/zh/openai-models.md?raw'
import pathEmbeddingsEn from '../content/en/path-embeddings.md?raw'
import pathEmbeddingsZh from '../content/zh/path-embeddings.md?raw'
import quickStartEn from '../content/en/quick-start.md?raw'
import quickStartZh from '../content/zh/quick-start.md?raw'
import rerankEn from '../content/en/rerank.md?raw'
import rerankZh from '../content/zh/rerank.md?raw'
import responsesEn from '../content/en/responses.md?raw'
import responsesZh from '../content/zh/responses.md?raw'
import tokenLogsEn from '../content/en/token-logs.md?raw'
import tokenLogsZh from '../content/zh/token-logs.md?raw'
import tokenUsageEn from '../content/en/token-usage.md?raw'
import tokenUsageZh from '../content/zh/token-usage.md?raw'
import usageEn from '../content/en/usage.md?raw'
import usageZh from '../content/zh/usage.md?raw'
import videoEn from '../content/en/video.md?raw'
import videoZh from '../content/zh/video.md?raw'

export type DocsLocale = 'en' | 'zh'

const CONTENT: Record<DocsLocale, Record<DocsSectionId, string>> = {
  en: {
    'quick-start': quickStartEn,
    authentication: authEn,
    'chat-completions': chatEn,
    responses: responsesEn,
    'alpha-search': alphaSearchEn,
    'claude-messages': claudeEn,
    models: modelsEn,
    'openai-models': openaiModelsEn,
    gemini: geminiEn,
    'image-generation': imageEn,
    video: videoEn,
    embeddings: embeddingsEn,
    'path-embeddings': pathEmbeddingsEn,
    audio: audioEn,
    rerank: rerankEn,
    billing: billingEn,
    usage: usageEn,
    'token-usage': tokenUsageEn,
    'token-logs': tokenLogsEn,
    errors: errorsEn,
  },
  zh: {
    'quick-start': quickStartZh,
    authentication: authZh,
    'chat-completions': chatZh,
    responses: responsesZh,
    'alpha-search': alphaSearchZh,
    'claude-messages': claudeZh,
    models: modelsZh,
    'openai-models': openaiModelsZh,
    gemini: geminiZh,
    'image-generation': imageZh,
    video: videoZh,
    embeddings: embeddingsZh,
    'path-embeddings': pathEmbeddingsZh,
    audio: audioZh,
    rerank: rerankZh,
    billing: billingZh,
    usage: usageZh,
    'token-usage': tokenUsageZh,
    'token-logs': tokenLogsZh,
    errors: errorsZh,
  },
}

export function resolveDocsLocale(language: string): DocsLocale {
  return language.startsWith('zh') ? 'zh' : 'en'
}

export function getDocsContent(
  section: DocsSectionId,
  locale: DocsLocale
): string {
  return CONTENT[locale][section] ?? CONTENT.en[section]
}
