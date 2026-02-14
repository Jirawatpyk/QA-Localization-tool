# 16. File Storage - S3 vs GCS vs Vercel Blob

### Comparison

| Feature | AWS S3 | Google Cloud Storage | Vercel Blob |
|---------|--------|---------------------|-------------|
| **Pricing** | $0.023/GB/mo | $0.020/GB/mo | Included in Vercel plans |
| **Free Tier** | 5GB (12 months) | 5GB (always free) | 1GB (Hobby) |
| **Presigned URLs** | Yes | Yes | Yes (via `put()` API) |
| **CDN** | CloudFront (separate) | Cloud CDN (separate) | Built-in |
| **Max Object Size** | 5TB | 5TB | 500MB |
| **SDK** | `@aws-sdk/client-s3` | `@google-cloud/storage` | `@vercel/blob` |
| **Complexity** | Medium (IAM, policies) | Medium (service accounts) | Low (zero config on Vercel) |
| **Regions** | 30+ | 35+ | Vercel edge |
| **Integration** | Universal | Google ecosystem | Vercel only |

### XLIFF File Characteristics

- Typical XLIFF file: 100KB - 50MB
- Some large projects: up to 200MB
- Format: XML-based text files (compressible)
- Access pattern: Upload once, read multiple times, rarely updated

### Recommendation: Vercel Blob (MVP) or S3 (Production)

**MVP Phase: Vercel Blob**
- Zero configuration on Vercel
- Simple API: `put()`, `del()`, `list()`, `head()`
- Client-side uploads supported
- Sufficient for MVP file sizes
- No IAM/credentials management needed

**Production Phase: AWS S3 or GCS**
- More control over storage policies
- Better lifecycle management (auto-delete old files)
- Cross-region replication if needed
- More cost-effective at scale
- S3 if already in AWS ecosystem; GCS if using Google OAuth/services

### File Upload Architecture

```
Client Browser
    |
    |-- 1. Request presigned URL from API
    |
    v
API Route
    |
    |-- 2. Generate presigned URL
    |-- 3. Return URL to client
    |
    v
Client Browser
    |
    |-- 4. Upload directly to storage (presigned URL)
    |-- 5. Notify API of upload completion
    |
    v
API Route / Background Job
    |
    |-- 6. Parse XLIFF from storage
    |-- 7. Queue QA processing
```

This bypasses the 4.5MB Vercel payload limit entirely.

### Sources
- https://vercel.com/docs/storage/vercel-blob
- https://aws.amazon.com/s3/pricing/
- https://cloud.google.com/storage/pricing

---
