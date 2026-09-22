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

export type DocsStatusField = {
  name: string
  type: string
  required?: boolean
  descriptionKey: string
  example?: string
}

export type DocsStatusHeader = {
  name: string
  descriptionKey: string
}

export type DocsStatusCode = {
  code: number
  titleKey: string
  descriptionKey: string
  fields: DocsStatusField[]
  headers?: DocsStatusHeader[]
}

const OPENAI_ERROR_FIELDS: DocsStatusField[] = [
  {
    name: 'error',
    type: 'object',
    required: true,
    descriptionKey: 'docs.status.fields.errorObject',
  },
  {
    name: 'error.message',
    type: 'string',
    required: true,
    descriptionKey: 'docs.status.fields.errorMessage',
  },
  {
    name: 'error.type',
    type: 'string',
    required: true,
    descriptionKey: 'docs.status.fields.errorType',
    example: 'invalid_request_error',
  },
  {
    name: 'error.code',
    type: 'string',
    descriptionKey: 'docs.status.fields.errorCode',
    example: 'model_not_found',
  },
  {
    name: 'error.param',
    type: 'string',
    descriptionKey: 'docs.status.fields.errorParam',
  },
]

export const DOCS_STATUS_CODES: DocsStatusCode[] = [
  {
    code: 400,
    titleKey: 'docs.status.400.title',
    descriptionKey: 'docs.status.400.description',
    fields: OPENAI_ERROR_FIELDS.map((field) =>
      field.name === 'error.type'
        ? { ...field, example: 'invalid_request_error' }
        : field
    ),
  },
  {
    code: 401,
    titleKey: 'docs.status.401.title',
    descriptionKey: 'docs.status.401.description',
    fields: OPENAI_ERROR_FIELDS.map((field) => {
      if (field.name === 'error.type') {
        return { ...field, example: 'authentication_error' }
      }
      if (field.name === 'error.code') {
        return { ...field, example: 'invalid_api_key' }
      }
      return field
    }),
  },
  {
    code: 403,
    titleKey: 'docs.status.403.title',
    descriptionKey: 'docs.status.403.description',
    fields: OPENAI_ERROR_FIELDS.map((field) => {
      if (field.name === 'error.type') {
        return { ...field, example: 'permission_error' }
      }
      if (field.name === 'error.code') {
        return { ...field, example: 'model_not_allowed' }
      }
      return field
    }),
  },
  {
    code: 404,
    titleKey: 'docs.status.404.title',
    descriptionKey: 'docs.status.404.description',
    fields: OPENAI_ERROR_FIELDS.map((field) => {
      if (field.name === 'error.type') {
        return { ...field, example: 'invalid_request_error' }
      }
      if (field.name === 'error.code') {
        return { ...field, example: 'not_found' }
      }
      return field
    }),
  },
  {
    code: 429,
    titleKey: 'docs.status.429.title',
    descriptionKey: 'docs.status.429.description',
    headers: [
      {
        name: 'Retry-After',
        descriptionKey: 'docs.status.headers.retryAfter',
      },
    ],
    fields: OPENAI_ERROR_FIELDS.map((field) => {
      if (field.name === 'error.type') {
        return { ...field, example: 'rate_limit_error' }
      }
      if (field.name === 'error.code') {
        return { ...field, example: 'rate_limit_exceeded' }
      }
      return field
    }),
  },
  {
    code: 500,
    titleKey: 'docs.status.500.title',
    descriptionKey: 'docs.status.500.description',
    fields: OPENAI_ERROR_FIELDS.map((field) => {
      if (field.name === 'error.type') {
        return { ...field, example: 'server_error' }
      }
      if (field.name === 'error.code') {
        return { ...field, example: 'internal_error' }
      }
      return field
    }),
  },
]
