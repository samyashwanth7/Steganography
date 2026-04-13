# Product Requirements Document (PRD): Advanced Steganography Platform

## 1. Executive Summary
The Advanced Steganography Platform is a web-based application designed to hide sensitive information (text, files, or credentials) inside innocent-looking cover media (images, audio files, or plain text). Unlike basic steganography tools, this platform features **Complex Additive Steganography**, allowing users to hide *multiple*, independent secrets sequentially within the same cover file without overwriting previous data.

## 2. Target Audience
- Security professionals needing a secure way to transmit data via public channels.
- Privacy-conscious individuals protecting passwords or sensitive files.
- Users who want an organized "Library" of all their steganographic artifacts.

## 3. Core Functionalities & "How it Works"

### A. Media Handling (The "Cover")
The platform supports three primary mediums to hide data:
- **Images (PNG, JPG, etc.)**: Alters the Least Significant Bits (LSBs) of image pixels. Visual distortion is practically zero. It auto-converts unsupported types to PNG to preserve hidden bits across saves.
- **Audio (WAV)**: Alters the LSBs of audio frame data. It uses `wave` and `ffmpeg/afconvert` dynamically to assure files like MP3s can be converted to WAV for lossless data retention.
- **Text**: Embeds data invisibly using "Zero-Width Characters" (ZWCs). By scattering invisible Zero-Width Joiner/Non-Joiner symbols within spaces of a plain text file, data is hidden cryptographically inside visible text.

### B. Complex Additive Steganography (The "Engine")
The "Additive" nature of the application allows multiple secrets to coexist in the same file. 
- **The Manifest**: The application reserves the first few bits of a file for an *Encrypted Manifest*. Every time a new secret is encoded, its `key_hash`, `start_bit`, and `length_bits` are added to this manifest.
- **Location Randomization**: Using a `MANIFEST_KEY`, the platform securely and predictably shuffles the indices of the media, scattering the manifest bits across the file to avoid sequential detection.
- **Capacity Checking**: Before adding another secret, the app calculates remaining capacity (using `api/capacity`) and uses the manifest to know exactly where the last secret ended, placing the new secret sequentially right after it.

### C. Security & Encryption
- All secret payloads undergo `zlib` compression (to maximize storage).
- The compressed payload is encrypted using **AES-128 in CBC mode**.
- The encryption key is derived using `PBKDF2 HMAC SHA-256` (hashed 100,000 times) with a randomly generated 16-byte salt and IV.
- **Key Strength**: Integrated password validator ensuring users pick strong keys before encoding.

### D. Ecosystem Features (The "Friend's Additions")
- **Authentication**: JWT-based secure user signups, sign-ins, and profile management with SQLite.
- **Library Manager**: Saves users' encoded artifacts to a database so they can download or manage previously created steganographic files.
- **Steganographic Inbox (Messaging)**: Users can directly target friends with an encoded file. The server processes the file and injects recipient metadata into the hidden manifest, placing it directly in their in-app inbox.
- **Admin Dashboard**: Admins can run forensic detection algorithms that read the encrypted `MANIFEST_KEY` to see exactly *when* and *by whom* a file was encoded.

## 4. Workflows

**Encoding Workflow:**
1. User uploads a standard Media File (Cover).
2. User provides a Secret Payload (Text message, File, or Password Object).
3. Payload gets Compressed -> AES Encrypted -> Converted to Binary bits.
4. Backend retrieves the file's current Manifest (if any).
5. Appends the new Secret's metadata to the Manifest.
6. Randomly scatters the new Binary payload inside the Cover File using randomized mathematical arrays.
7. User downloads the "dirty" image, which visually looks identical to the original.

**Decoding Workflow:**
1. Receiver uploads the "dirty" Media File and enters their unique Key.
2. System decrypts the hidden Manifest using the hardcoded platform key to find the location associated with the hash of the User's Key.
3. Bits are extracted from that randomized location and rebuilt into an encrypted block.
4. Block undergoes AES Decryption -> Zlib Decompression -> Returns the original Payload.

## 5. Potential Future Optimizations (Storage/Size reduction)
If the project needs to be compressed (as previously discussed), the database, JWT loops, Inbox UI, and Library overhead can be completely cut out, turning the application into a pure, stateless client-server cryptography tool.
