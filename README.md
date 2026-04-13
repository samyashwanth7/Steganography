# Advanced Steganography Platform

## Overview
The Advanced Steganography Platform is a web-based application designed to hide sensitive information (text, files, or credentials) inside innocent-looking cover media (images, audio files, or plain text). Unlike basic steganography tools, this platform features **Complex Additive Steganography**, allowing users to hide *multiple*, independent secrets sequentially within the same cover file without overwriting previous data.

This project focuses solely on **Fast, Serverless-ready Steganography**, discarding unnecessary bloat such as persistent user databases and messaging loops in favor of a lean cryptographic tool ready for instant scaling.

## Live Demo
The frontend UI is hosted on GitHub Pages: [https://samyashwanth7.github.io/Steganography](https://samyashwanth7.github.io/Steganography)

> **Note**: As GitHub Pages only hosts static files, the cryptographic backend (Python FastAPI) needs to be running locally or hosted on an external server (like Render or Heroku) for the encoding and decoding functionality to work.

## Features & Core Functionalities

### 1. Complex Additive Steganography
The platform's additive nature allows multiple distinct payloads inside the same file:
- **The Manifest**: The application reserves the first few bits of a file for an *Encrypted Manifest*. Every time a new secret is encoded, its `key_hash`, `start_bit`, and `length_bits` are added to this manifest.
- **Location Randomization**: Using a `MANIFEST_KEY`, the platform securely and predictably shuffles the indices of the media, scattering the manifest bits across the file to avoid sequential detection.
- **Capacity Checking**: Calculates remaining capacity dynamically, placing new secrets right after the last without data loss.

### 2. Supported Cover Media
- **Images (PNG, JPG, etc.)**: Alters the Least Significant Bits (LSBs) of image pixels. Visual distortion is practically zero. Auto-coverts unsupported types to PNG to preserve bits.
- **Audio (WAV)**: Alters the LSBs of audio frame data. Uses `wave` and `ffmpeg/afconvert` dynamically for conversions.
- **Text**: Embeds data invisibly using "Zero-Width Characters" (ZWCs). Scatters invisible ZWC symbols within spaces of a plain text file.

### 3. Security & Encryption
- All secret payloads undergo `zlib` compression.
- Compressed payloads are encrypted using **AES-128 in CBC mode**.
- The encryption key is derived using `PBKDF2 HMAC SHA-256` (hashed 100,000 times) with a randomly generated 16-byte salt and IV.

## Architecture

The project is structured with a monolithic full-stack design utilizing modern frameworks.

```
Steganography/
├── backend/                  # Fast API Python backend for cryptographic tasks
│   ├── main.py               # Core application entrypoint & API endpoints
│   ├── requirements.txt      # Python dependencies
│   ├── uploads/              # Temporary file processing directory
│   └── (Cryptographic Handlers & Utilities)
├── frontend/                 # Next.js React application
│   ├── app/                  # Main interactive UI components and layouts
│   ├── public/               # Static assets
│   ├── package.json          # Node.js dependencies
│   └── (Configuration files)
└── README.md                 # Project documentation
```

### Backend (`backend/main.py`)
Provides the stateless API to encode and decode payloads:
- `encode_additive()`: Core logic to handle file/payload combination using AES.
- `decode_additive()`: Logic to resolve manifests and rebuild arrays from shuffled bytes to retrieve payloads.
- `/api/encode-text` & `/api/encode-file`: Endpoints to inject secrets.
- `/api/decode`: Evaluates incoming files, parses the manifest using the original user key, and extracts payloads.

### Frontend (`frontend`)
A streamlined UI built on Next.js focusing on usability:
- **MediaDropzone**: Responsive drag-and-drop feature for cover files.
- **Sequential Encoding UI**: Allows adding multiple data payloads with different keys sequentially.
- **Key Strength Visualizer**: Ensures passwords used to derive the AES keys represent real security.
- **ModeToggle**: Easily switch between hiding raw text, full files, or password credentials.

## Workflows

**Encoding Workflow:**
1. User uploads a standard Media File (Cover).
2. User provides a Secret Payload and Key.
3. Payload gets Compressed -> AES Encrypted -> Converted to Binary bits.
4. Backend retrieves the file's current Manifest (if any) and appends new metadata.
5. Randomly scatters the new Binary payload inside the Cover File based on key hashes.
6. User downloads the "dirty" cover file.

**Decoding Workflow:**
1. Receiver uploads the "dirty" Media File and enters their unique Key.
2. System decrypts the hidden Manifest.
3. Bits are extracted from the correlated randomized location and rebuilt into an encrypted block.
4. Block undergoes AES Decryption -> Zlib Decompression -> Returns the original Payload.

## Setup & Running Locally

### Backend (Python)
1. Navigate to the `backend/` directory.
2. Create a virtual environment: `python -m venv venv`
3. Activate the virtual environment.
4. Install requirements: `pip install -r requirements.txt`
5. Run the server: `uvicorn main:app --reload` (Runs on port 8000)

### Frontend (Next.js)
1. Navigate to the `frontend/` directory.
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev` (Runs on port 3000 by default)

Open `http://localhost:3000` to access the Steganography platform!
