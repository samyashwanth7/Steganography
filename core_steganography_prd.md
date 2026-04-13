# Core Steganography Application - PRD

## Overview
The goal is to streamline the current Steganography project into a "Core Version". Your friend added many features like user accounts, libraries, and messaging which drastically increased codebase size and storage footprints. This new configuration focuses solely on **Fast, Serverless-ready Steganography** utilizing the complex additive techniques (multiple secrets per file) while stripping away the bloat.

## Objectives
1. **Reduce Storage & Codebase Size**: Strip FastAPI and Next.js down to simple stateless components.
2. **Remove Dependencies**: Eliminate SQLite, SQLAlchemy, Auth tokens, sessions, user models, and messaging APIs.
3. **Preserve Core Cryptography**: Keep the secure payload handling (AES encryption, zlib compression), `ImageHandler`, `AudioHandler`, and `TextHandler`.
4. **Preserve Additive Capability**: The application will seamlessly handle multiple hidden files/texts encoded sequentially in the same target media file using key hashes and JSON manifests (which you indicated explicitly to leave in).

## Execution Plan (The "Cleanup")

### Backend (`backend/main.py` -> Clean to ~500 lines)
- **Remove**: DB connection logic (`SessionLocal`, `engine`, `get_db`).
- **Remove**: User schemas (`UserCreate`, `Token`), endpoints (`/api/register`, `/api/login`, `/api/users/me`), and profile logic.
- **Remove**: Admin detection and dashboard modules (`/api/admin/detect`, `/api/admin/users`).
- **Remove**: Inbox, Messaging, and Library endpoints structure.
- **Keep**: `get_media_handler`, `get_capacity`, `encode_additive`, `decode_additive`, `/api/encode-text`, `/api/encode-file`, `/api/decode`, `/api/delete`. 
- **Files to Delete**: `auth.py`, `models.py`, `database.py`, `create_admin.py`, `migrate_db.py`, `steganography.db`.

### Frontend (`frontend/app/page.tsx` -> Clean to ~600 lines)
- **Remove**: Authentication flow UI (Login / Register Modal).
- **Remove**: Library viewing tab, `selectedLibraryItem`, Database fetch hooks.
- **Remove**: API calls for inbox, sending steganographic emails to friends and reading from a backend inbox.
- **Remove**: User profile menu, "Logout" button, "Saved" tokens logic.
- **Keep**: 
  - Drag and drop `MediaDropzone`.
  - The sequential encoding UI (ability to add multiple data payloads with different keys before clicking Encode).
  - Key Strength visualizer.
  - The `ModeToggle` (Text / File / Password).
  - Decoding batch payload features.

## Why this approach?
This drops over 2,000 lines of complex codebase overhead while keeping exactly your requested features intact. No database means no bloated file storage, zero migrations to run, and the code becomes "publish-ready" for GitHub!
