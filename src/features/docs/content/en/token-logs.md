# Key logs

**Endpoint:** `GET {origin}/api/log/token`

This path starts at the site origin. Do not append it to `{baseUrl}`. It returns this API key's recent request logs, newest first. Channel secrets are not included.

```bash
curl {origin}/api/log/token \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Each log includes the model, quota, time, request ID, and IP. Only this key's records are returned.
