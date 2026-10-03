# STENO — Cryptographic Steganography Protocol & Steganalysis Lab

> Multi-payload additive steganography and forensic steganalysis suite for hiding encrypted data, files, and credentials inside images, audio, and text with zero audible or visual distortion.

---

## Features

- **Additive Multi-Payload Embedding**: Embed multiple independent secrets inside a single carrier file sequentially with different keys without overwriting previous data.
- **Modern v2 Cryptographic Architecture**: Memory-hard `scrypt` key derivation (`N=16384, r=8, p=1`), `AES-256-GCM` authenticated encryption, and deterministic pseudo-random index scattering.
- **±1 Matching (LSB Matching)**: In images, avoids classical LSB replacement artifacts by randomly incrementing or decrementing pixel values, resisting pairs-of-values chi-square steganalysis.
- **Low-Byte Sample Audio Steganography**: 16-bit WAV PCM embedding modifying only the low byte of each sample (max sample delta $\le 1$, inaudible to human hearing).
- **Distributed Zero-Width Steganography**: Embeds data invisibly in plain text using zero-width characters distributed across inter-word spaces.
- **Steganalysis Lab**: Live forensic detection powered by the Westfeld–Pfitzmann Chi-Square statistical test, LSB bit plane isolation, and real-time PSNR calculation.
- **Cryptographic Erasure (Scrubbing)**: Overwrites targeted secret bit regions with cryptographically secure random bits and rewrites the manifest.
- **Full Legacy Backward Compatibility**: Seamlessly detects and decodes legacy v1 files through automatic format detection.

---

## Screenshots

| Cryptographic Studio | Steganalysis Lab |
|:---:|:---:|
| *(Upload cover media, configure multiple secrets, key generator, and capacity monitor)* | *(Chi-Square detection gauge, verdict badge, PSNR delta, and isolated LSB bit plane)* |

| Forensic Audit | Vault / Library |
|:---:|:---:|
| *(Admin payload audit, timestamp tracking, and bit-span inspection)* | *(Cloud storage vault for encoded carriers with search and metadata)* |

---

## Architecture

```
┌─────────────────────────────────┐
│     Next.js 16 Web Client       │
│  (React 19, Tailwind, Vercel)   │
└────────────────┬────────────────┘
                 │ HTTPS / REST (Proxied)
                 ▼
┌─────────────────────────────────┐
│      FastAPI Python Server      │
│  (Python 3.12, NumPy, Render)   │
└────────────────┬────────────────┘
                 │ Service Role / Auth
                 ▼
┌─────────────────────────────────┐
│        Supabase Platform        │
│   (Auth, Postgres, Storage)     │
└─────────────────────────────────┘
```

---

## How It Works

### STENO v2 Format

1. **Encrypted Manifest Header**:
   - Reserved at bit offset `0` of the carrier.
   - Encrypted using `AES-256-GCM` with key `SHA-256("steno-v2-manifest|" + MANIFEST_KEY)` and authenticated with prefix `STN2`.
   - Contains a list of payload descriptors with random salts, HMAC key tags, bit offsets, lengths, and timestamps.
   - **Zero Key Leakage**: Manifest entries never store plaintext keys or SHA-256 key hashes. Secret discovery uses constant-time HMAC tag comparison: `HMAC-SHA256(id_key, "steno-v2-id")`.

2. **Payload Encryption**:
   - Key derivation: `(enc_key, id_key) = scrypt(key, salt, N=16384, r=8, p=1, dklen=64)`.
   - Compression: Level-9 `zlib` compression.
   - Encryption: `AES-256-GCM` with a 12-byte random cryptographic nonce and 16-byte authentication tag.

3. **Carrier Embedding**:
   - **Images**: Uses RGB channels only. Where the carrier LSB mismatches the payload bit, the value is shifted by $\pm 1$ randomly (`+1` when 0, `-1` when 255). Alpha channel remains byte-identical.
   - **Audio**: Little-endian 16-bit WAV PCM. Slots map to byte `i * sampwidth` (the low byte of each sample), ensuring sample delta never exceeds 1.
   - **Text**: Zero-width non-joiners (`\u200c`) and joiners (`\u200d`) are evenly distributed across inter-word spaces rather than appended to the end.

4. **True Erasure (Scrubbing)**:
   - When a secret is deleted, its exact bit range in the carrier is overwritten with cryptographically random noise before the manifest is re-encrypted.

### Legacy v1 Compatibility

When decoding, STENO checks the manifest length and magic header. If an older v1 file is detected, STENO automatically routes extraction through the legacy CBC/PBKDF2 engine using the built-in legacy manifest key. Legacy files remain decodable, while new writes into legacy files are safely rejected (HTTP 409) to preserve archive integrity.

---

## Security Model & Honest Limitations

Like all steganographic systems, STENO has explicit threat model boundaries:

1. **Lossy Compression Destroys Hidden Data**:
   - LSB steganography relies on exact pixel and sample values.
   - Saving an encoded image as JPEG, converting WAV to MP3/AAC, or sending media through platforms that recompress uploads (WhatsApp, Twitter/X, Instagram, Discord) **destroys the embedded payload**.
   - Carriers must be transported in lossless containers (PNG, WAV, UTF-8 text).

2. **Text Normalization**:
   - Zero-width unicode characters are invisible in text editors and browsers, but will be stripped by text sanitizers, Unicode normalization filters, or copy-pasting through ASCII-only terminal windows.

3. **Server Manifest Key Dependency**:
   - Because bit indices are pseudorandomly scattered using `MANIFEST_KEY`, carriers created on a server instance can only be decoded by servers sharing that same `MANIFEST_KEY`. Old v1 files decode anywhere via the standardized legacy key.

4. **Steganalysis Visibility**:
   - While $\pm 1$ matching resists naive pairs-of-values attacks better than basic LSB replacement, high-capacity embedding still alters image entropy. Heavy embedding in clean photos can be detected by sophisticated higher-order steganalysis tools.

---

## Steganalysis Lab

The integrated Steganalysis Lab enables forensic inspection of suspect images:

- **Westfeld–Pfitzmann Chi-Square Test**: Evaluates frequency differences between adjacent pixel pairs ($2k$ and $2k+1$) across RGB histograms. Computes degrees of freedom and the survival function $p$-value ($p < 0.3$: *Not detected*, $p < 0.8$: *Suspicious*, $p \ge 0.8$: *Likely stego*).
- **LSB Plane Isolation**: Extracts bit 0 across RGB channels and stretches to full binary contrast ($0 \to 0$, $1 \to 255$). Natural images show residual image outlines; stego images exhibit uniform static noise.
- **PSNR (Peak Signal-to-Noise Ratio)**: When the original cover image is provided, computes exact mean squared error and PSNR in decibels:
  $$\text{PSNR} = 10 \cdot \log_{10}\left(\frac{255^2}{\text{MSE}}\right)$$

---

## Tech Stack

- **Backend**: Python 3.12, FastAPI, NumPy, SciPy, Pillow, Cryptography (AES-GCM, scrypt), SlowAPI, PyDub, Supabase-py.
- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Framer Motion, Lucide React.
- **Infrastructure**: Vercel (Frontend), Render (FastAPI Backend), Supabase (Auth, PostgreSQL, Storage).

---

## Local Setup

### Prerequisites

- Python 3.12+
- Node.js 20+ and npm

### 1. Backend

```bash
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env
```

Configure `backend/.env`:
```ini
MANIFEST_KEY=your-custom-secret-key-here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-jwt-secret
ALLOWED_ORIGINS=http://localhost:3000
RATELIMIT_ENABLED=1
ALLOW_DEV_AUTH=1
```

Run the backend:
```bash
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Deployment

### Render (Backend)

- Environment: Python 3.12 (`PYTHON_VERSION=3.12.8`)
- Build Command: `pip install -r backend/requirements.txt`
- Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Environment Variables:
  - `MANIFEST_KEY`: High-entropy 32-character key (`python -c "import secrets; print(secrets.token_urlsafe(32))"`)
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
  - `ALLOWED_ORIGINS`: `https://your-vercel-domain.vercel.app`
  - `RATELIMIT_ENABLED`: `1`
  - `ALLOW_DEV_AUTH`: `0`

### Vercel (Frontend)

- Framework Preset: Next.js
- Root Directory: `frontend`
- Environment Variables:
  - `BACKEND_URL`: `https://your-render-service.onrender.com`

---

## Running Tests

### Backend Test Suite

The backend test suite validates all 14 format, cryptography, legacy decoding, and security assertions:

```bash
cd backend
python -m pytest tests -q
```

### Frontend Typecheck & Build

```bash
cd frontend
npx tsc --noEmit
npm run build
```

---

## License

MIT License. Designed and built for secure cryptographic research and portfolio demonstration.
