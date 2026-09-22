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
import {
  detectAuthStyle,
  extractCurlJsonBody,
  methodAllowsBody,
  shellSingleQuote,
  defaultBodyForPath,
} from './docs-api-debug'
import type { DocsEndpoint } from './parse-markdown'

export type DocsCodeSample = {
  id: string
  label: string
  language: string
  code: string
}

function resolveRequestBody(endpoint: DocsEndpoint, markdown: string): string | null {
  if (!methodAllowsBody(endpoint.method)) return null
  return extractCurlJsonBody(markdown) ?? defaultBodyForPath(endpoint.path)
}

function authHeaderLines(path: string, apiKey: string): { curl: string; httpName: string; httpValue: string } {
  const style = detectAuthStyle(path)
  if (style === 'x-api-key') {
    return {
      curl: `  -H ${shellSingleQuote(`x-api-key: ${apiKey}`)} \\\n  -H ${shellSingleQuote('anthropic-version: 2023-06-01')} \\\n`,
      httpName: 'x-api-key',
      httpValue: apiKey,
    }
  }
  return {
    curl: `  -H ${shellSingleQuote(`Authorization: Bearer ${apiKey}`)} \\\n`,
    httpName: 'Authorization',
    httpValue: `Bearer ${apiKey}`,
  }
}

export function buildDocsCodeSamples(options: {
  endpoint: DocsEndpoint
  markdown: string
  apiKeyPlaceholder?: string
}): DocsCodeSample[] {
  const apiKey = options.apiKeyPlaceholder || 'YOUR_API_KEY'
  const url = options.endpoint.path
  const method = options.endpoint.method.toUpperCase()
  const body = resolveRequestBody(options.endpoint, options.markdown)
  const auth = authHeaderLines(options.endpoint.path, apiKey)
  const hasJsonBody = Boolean(body && body.trim() && body.trim() !== '{\n  \n}')

  const curlParts = [`curl ${shellSingleQuote(url)} \\\n`, `  -X ${method} \\\n`, auth.curl]
  if (hasJsonBody) {
    curlParts.push(`  -H ${shellSingleQuote('Content-Type: application/json')} \\\n`)
    curlParts.push(`  -d ${shellSingleQuote(body!)}\n`)
  } else {
    curlParts[curlParts.length - 1] = curlParts[curlParts.length - 1].replace(/ \\\n$/, '\n')
  }

  const pythonHeaders =
    auth.httpName === 'x-api-key'
      ? `headers = {\n    "x-api-key": "${apiKey}",\n    "anthropic-version": "2023-06-01",\n    "Content-Type": "application/json",\n}`
      : `headers = {\n    "Authorization": "Bearer ${apiKey}",\n    "Content-Type": "application/json",\n}`

  const python = hasJsonBody
    ? `import json
import requests

url = "${url}"
${pythonHeaders}
payload = json.loads(${JSON.stringify(body)})

response = requests.request("${method}", url, headers=headers, json=payload)
print(response.status_code)
print(response.text)`
    : `import requests

url = "${url}"
${pythonHeaders}

response = requests.request("${method}", url, headers=headers)
print(response.status_code)
print(response.text)`

  const jsHeaders =
    auth.httpName === 'x-api-key'
      ? `  "x-api-key": "${apiKey}",\n  "anthropic-version": "2023-06-01",\n  "Content-Type": "application/json"`
      : `  Authorization: "Bearer ${apiKey}",\n  "Content-Type": "application/json"`

  const javascript = hasJsonBody
    ? `const response = await fetch("${url}", {
  method: "${method}",
  headers: {
${jsHeaders},
  },
  body: JSON.stringify(${body}),
});

console.log(response.status);
console.log(await response.text());`
    : `const response = await fetch("${url}", {
  method: "${method}",
  headers: {
${jsHeaders},
  },
});

console.log(response.status);
console.log(await response.text());`

  const goBody = hasJsonBody
    ? `payload := strings.NewReader(${JSON.stringify(body)})
	req, err := http.NewRequest("${method}", "${url}", payload)`
    : `req, err := http.NewRequest("${method}", "${url}", nil)`

  const go = `package main

import (
	"fmt"
	"io"
	"net/http"${hasJsonBody ? `
	"strings"` : ''}
)

func main() {
	${goBody}
	if err != nil {
		panic(err)
	}
	req.Header.Set("${auth.httpName}", "${auth.httpValue}")${
    auth.httpName === 'x-api-key'
      ? `
	req.Header.Set("anthropic-version", "2023-06-01")`
      : ''
  }${
    hasJsonBody
      ? `
	req.Header.Set("Content-Type", "application/json")`
      : ''
  }

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	fmt.Println(res.StatusCode)
	fmt.Println(string(body))
}`

  const javaHeaders =
    auth.httpName === 'x-api-key'
      ? `.header("x-api-key", "${apiKey}")
        .header("anthropic-version", "2023-06-01")`
      : `.header("Authorization", "Bearer ${apiKey}")`

  const java = hasJsonBody
    ? `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

var client = HttpClient.newHttpClient();
var body = """
${body}
""";
var request = HttpRequest.newBuilder()
        .uri(URI.create("${url}"))
        .method("${method}", HttpRequest.BodyPublishers.ofString(body))
        ${javaHeaders}
        .header("Content-Type", "application/json")
        .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.statusCode());
System.out.println(response.body());`
    : `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

var client = HttpClient.newHttpClient();
var request = HttpRequest.newBuilder()
        .uri(URI.create("${url}"))
        .method("${method}", HttpRequest.BodyPublishers.noBody())
        ${javaHeaders}
        .build();
var response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.statusCode());
System.out.println(response.body());`

  return [
    { id: 'curl', label: 'cURL', language: 'bash', code: curlParts.join('') },
    { id: 'python', label: 'Python', language: 'python', code: python },
    { id: 'javascript', label: 'JavaScript', language: 'javascript', code: javascript },
    { id: 'go', label: 'Go', language: 'go', code: go },
    { id: 'java', label: 'Java', language: 'java', code: java },
  ]
}
