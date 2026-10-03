import io
import datetime
import hashlib
import hmac
import json
import struct
import wave
import zlib
import zipfile
import os
import math
import secrets
import string
import uuid
import base64
import numpy as np
from PIL import Image

# Python 3.13 compatibility shim for audioop / pyaudioop
import sys
try:
    import audioop
except ImportError:
    try:
        import audioop_lts as _aop
        sys.modules['audioop'] = _aop
        sys.modules['pyaudioop'] = _aop
    except ImportError:
        pass

try:
    from pydub import AudioSegment
    from pydub.exceptions import CouldntDecodeError
    PYDUB_AVAILABLE = True
except Exception:
    AudioSegment = None
    class CouldntDecodeError(Exception):
        pass
    PYDUB_AVAILABLE = False
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from typing import Optional, List, Union
from dotenv import load_dotenv
from supabase import create_client, Client
from jose import jwt, JWTError

load_dotenv()

# --- Config & Setup ---
app = FastAPI(title="Core Steganography API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

MAGIC_BYTES = b"STG_F"
HEADER_FILENAME_LEN_BYTES = 2
HEADER_FILESIZE_BYTES = 4
SALT_BYTES = 16
IV_BYTES = 16
MAX_FILE_SIZE = 50 * 1024 * 1024
ZERO_WIDTH_ZERO = '\u200c'
ZERO_WIDTH_ONE = '\u200d'
MANIFEST_KEY = os.getenv("MANIFEST_KEY", "a7e1f5d2-a8b3-4c9f-8d7e-2c5b6a1d4f8e")
MANIFEST_HEADER_LENGTH_BITS = 32
MANIFEST_RESERVED_BITS = 32768  # Increased from 8192


# --- Pydantic Models ---
class RegisterRequest(BaseModel):
    first_name: str
    last_name: str
    email: str
    password: str


class KeyStrengthRequest(BaseModel):
    key: str


class SendEmailRequest(BaseModel):
    recipients: List[str]
    file_path: str


class RenameLibraryRequest(BaseModel):
    filename: str


# --- Core Cryptography ---
def derive_key(key: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac('sha256', key.encode('utf-8'), salt, 100000, dklen=32)

def encrypt_payload(data: bytes, key: str) -> bytes:
    salt = os.urandom(SALT_BYTES)
    derived_key = derive_key(key, salt)
    iv = os.urandom(IV_BYTES)
    padder = padding.PKCS7(128).padder()
    padded_data = padder.update(data) + padder.finalize()
    cipher = Cipher(algorithms.AES(derived_key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    return salt + iv + encryptor.update(padded_data) + encryptor.finalize()

def decrypt_payload(encrypted_data: bytes, key: str) -> bytes:
    salt = encrypted_data[:SALT_BYTES]
    iv = encrypted_data[SALT_BYTES:SALT_BYTES + IV_BYTES]
    data_to_decrypt = encrypted_data[SALT_BYTES + IV_BYTES:]
    derived_key = derive_key(key, salt)
    cipher = Cipher(algorithms.AES(derived_key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded_data = decryptor.update(data_to_decrypt) + decryptor.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    return unpadder.update(padded_data) + unpadder.finalize()

def data_to_binary(data: bytes) -> str:
    return ''.join(format(byte, '08b') for byte in data)

def binary_to_data(binary: str) -> bytes:
    if len(binary) % 8 != 0: binary = binary[:-(len(binary) % 8)]
    return bytes(int(binary[i:i+8], 2) for i in range(0, len(binary), 8))

def get_randomized_indices(key: str, total_size: int) -> np.ndarray:
    seed = int.from_bytes(hashlib.sha256(key.encode('utf-8')).digest(), 'big') % (2**32 - 1)
    rng = np.random.default_rng(seed)
    indices = np.arange(total_size)
    rng.shuffle(indices)
    return indices

def check_key_strength(key: str):
    """Granular 0-100 key strength scorer."""
    score = 0
    suggestions = []
    length = len(key)

    # Length scoring (up to 30 points)
    if length >= 16:
        score += 30
    elif length >= 12:
        score += 22
    elif length >= 8:
        score += 15
    elif length >= 6:
        score += 8
    else:
        score += max(0, length * 1)
    if length < 8:
        suggestions.append("Use at least 8 characters")
    if length < 12:
        suggestions.append("Consider using 12+ characters for better security")

    # Character class diversity (up to 40 points)
    has_lower = any(c.islower() for c in key)
    has_upper = any(c.isupper() for c in key)
    has_digit = any(c.isdigit() for c in key)
    has_special = any(not c.isalnum() for c in key)

    if has_lower:
        score += 10
    else:
        suggestions.append("Add lowercase letters")
    if has_upper:
        score += 10
    else:
        suggestions.append("Add uppercase letters")
    if has_digit:
        score += 10
    else:
        suggestions.append("Add numbers")
    if has_special:
        score += 10
    else:
        suggestions.append("Add special characters (!@#$%^&*)")

    # Shannon entropy (up to 30 points)
    if length > 0:
        freq = {}
        for c in key:
            freq[c] = freq.get(c, 0) + 1
        entropy = -sum((count / length) * math.log2(count / length) for count in freq.values())
        # Normalize: max entropy for printable ASCII is ~6.5 bits
        entropy_score = min(30, int((entropy / 6.5) * 30))
        score += entropy_score
        if entropy < 2.5:
            suggestions.append("Avoid repetitive patterns; use more varied characters")

    score = max(0, min(100, score))

    if score >= 80:
        strength = "Strong"
    elif score >= 50:
        strength = "Medium"
    else:
        strength = "Weak"

    return score, strength, suggestions


# --- Media Handlers ---
class MediaHandler:
    def get_capacity(self, media_bytes: bytes) -> int: raise NotImplementedError
    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes: raise NotImplementedError
    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str: raise NotImplementedError

class ImageHandler(MediaHandler):
    def get_capacity(self, media_bytes: bytes) -> int:
        with Image.open(io.BytesIO(media_bytes)) as img:
            return (np.array(img.convert('RGBA')).size // 8) - (MANIFEST_RESERVED_BITS // 8)
            
    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes:
        img = Image.open(io.BytesIO(media_bytes)).convert('RGBA')
        data = np.array(img)
        flat = data.flatten()
        if start_bit + len(binary_data) > flat.size: raise ValueError("Data too large for image offset")
        indices = get_randomized_indices(key, flat.size)
        for i, b in enumerate(binary_data):
            idx = indices[start_bit + i]
            flat[idx] = (flat[idx] & 254) | int(b)
        encoded_img = Image.fromarray(flat.reshape(data.shape), 'RGBA')
        with io.BytesIO() as out:
            encoded_img.save(out, format='PNG')
            return out.getvalue()
            
    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str:
        flat = np.array(Image.open(io.BytesIO(media_bytes)).convert('RGBA')).flatten()
        if start_bit + num_bits > flat.size: raise ValueError("Not enough space to extract bits")
        indices = get_randomized_indices(key, flat.size)
        return "".join(str(flat[indices[start_bit + i]] & 1) for i in range(num_bits))

class AudioHandler(MediaHandler):
    def _load(self, media_bytes: bytes):
        try:
            with wave.open(io.BytesIO(media_bytes), 'rb') as af:
                return bytearray(af.readframes(af.getnframes())), af.getparams()
        except wave.Error:
            if not PYDUB_AVAILABLE or AudioSegment is None:
                raise HTTPException(422, "Could not decode this audio. Upload a WAV file, or MP3/OGG/FLAC on a server with ffmpeg installed.")
            try:
                audio = AudioSegment.from_file(io.BytesIO(media_bytes))
                wav_io = io.BytesIO()
                audio.export(wav_io, format="wav")
                wav_io.seek(0)
                with wave.open(wav_io, 'rb') as af:
                    return bytearray(af.readframes(af.getnframes())), af.getparams()
            except Exception:
                raise HTTPException(422, "Could not decode this audio. Upload a WAV file, or MP3/OGG/FLAC on a server with ffmpeg installed.")

    def get_capacity(self, media_bytes: bytes) -> int:
        frames, _ = self._load(media_bytes)
        return (len(frames) // 8) - (MANIFEST_RESERVED_BITS // 8)

    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes:
        frames, params = self._load(media_bytes)
        if start_bit + len(binary_data) > len(frames): raise ValueError("Data too large for audio offset")
        indices = get_randomized_indices(key, len(frames))
        for i, b in enumerate(binary_data):
            idx = indices[start_bit + i]
            frames[idx] = (frames[idx] & 254) | int(b)
        with io.BytesIO() as out:
            with wave.open(out, 'wb') as wf:
                wf.setparams(params)
                wf.writeframes(frames)
            return out.getvalue()

    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str:
        frames, _ = self._load(media_bytes)
        if start_bit + num_bits > len(frames): raise ValueError("Not enough space to extract bits")
        indices = get_randomized_indices(key, len(frames))
        return "".join(str(frames[indices[start_bit + i]] & 1) for i in range(num_bits))

class TextHandler(MediaHandler):
    def get_capacity(self, media_bytes: bytes) -> int:
        return 1024 * 1024 * 10  # Arbitrarily large, limited by HTTP body size

    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes:
        text = media_bytes.decode('utf-8', errors='ignore')
        zwcs_in_text = [c for c in text if c in (ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE)]
        clean_text = "".join([c for c in text if c not in (ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE)])
        
        if start_bit + len(binary_data) > len(zwcs_in_text):
            zwcs_in_text.extend([ZERO_WIDTH_ZERO] * (start_bit + len(binary_data) - len(zwcs_in_text)))
        
        for i, b in enumerate(binary_data):
            zwcs_in_text[start_bit + i] = ZERO_WIDTH_ONE if b == '1' else ZERO_WIDTH_ZERO
            
        return (clean_text + "".join(zwcs_in_text)).encode('utf-8')

    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str:
        text = media_bytes.decode('utf-8', errors='ignore')
        zwcs = [c for c in text if c in (ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE)]
        if start_bit + num_bits > len(zwcs): raise ValueError("Not enough space to extract bits")
        
        extracted = zwcs[start_bit:start_bit + num_bits]
        return "".join(['1' if c == ZERO_WIDTH_ONE else '0' for c in extracted])

def get_media_handler(content_type: str = "", filename: str = "", media_bytes: bytes = b"") -> MediaHandler:
    ct = (content_type or "").lower()
    fn = (filename or "").lower()
    
    if any(k in ct for k in ("image", "png", "jpeg", "jpg", "webp", "bmp")):
        return ImageHandler()
    if any(k in ct for k in ("audio", "wav", "mpeg", "mp3", "ogg", "flac")):
        return AudioHandler()
    if "text" in ct:
        return TextHandler()

    # Check filename extension
    if any(fn.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp")):
        return ImageHandler()
    if any(fn.endswith(ext) for ext in (".wav", ".mp3", ".ogg", ".m4a", ".flac")):
        return AudioHandler()
    if any(fn.endswith(ext) for ext in (".txt", ".md", ".json", ".csv", ".log")):
        return TextHandler()

    # Check magic bytes
    if media_bytes:
        if media_bytes.startswith(b'\x89PNG\r\n\x1a\n') or media_bytes.startswith(b'\xff\xd8\xff') or media_bytes.startswith(b'GIF8') or media_bytes.startswith(b'BM'):
            return ImageHandler()
        if media_bytes.startswith(b'RIFF') or media_bytes.startswith(b'ID3') or media_bytes.startswith(b'\xff\xfb'):
            return AudioHandler()

    return TextHandler()

# --- Additive Steganography logic ---
def encode_additive(handler, media_bytes: bytes, payload: bytes, key: str, extra_manifest_fields: dict = None) -> bytes:
    existing_manifest, _ = decode_additive(handler, media_bytes, MANIFEST_KEY, True)
    manifest = existing_manifest or []
    key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
    
    if any(m['key_hash'] == key_hash for m in manifest):
        # Update existing
        manifest = [m for m in manifest if m['key_hash'] != key_hash]
    
    bin_payload = data_to_binary(encrypt_payload(zlib.compress(payload, level=9), key))
    start_bit = MANIFEST_RESERVED_BITS if not manifest else manifest[-1]['start_bit'] + manifest[-1]['length_bits']
    
    if start_bit + len(bin_payload) > handler.get_capacity(media_bytes) * 8 + MANIFEST_RESERVED_BITS: 
        raise ValueError("Not enough capacity")
    
    entry = {
        'key_hash': key_hash,
        'start_bit': start_bit,
        'length_bits': len(bin_payload),
        'ts': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    if extra_manifest_fields:
        entry.update(extra_manifest_fields)

    manifest.append(entry)
    
    bin_manifest = data_to_binary(struct.pack('>I', len(em := encrypt_payload(json.dumps(manifest).encode('utf-8'), MANIFEST_KEY))) + em)
    if len(bin_manifest) > MANIFEST_RESERVED_BITS: raise ValueError("Manifest too large")
    
    media_bytes = handler.embed_data(media_bytes, bin_payload, MANIFEST_KEY, start_bit)
    return handler.embed_data(media_bytes, bin_manifest, MANIFEST_KEY, 0)

def decode_additive(handler, media_bytes: bytes, key: str, manifest_only=False):
    try:
        m_len_bits = handler.extract_data(media_bytes, MANIFEST_KEY, MANIFEST_HEADER_LENGTH_BITS, 0)
        m_len = struct.unpack('>I', binary_to_data(m_len_bits))[0]
        m_bits = handler.extract_data(media_bytes, MANIFEST_KEY, MANIFEST_HEADER_LENGTH_BITS + (m_len * 8), 0)
        manifest = json.loads(decrypt_payload(binary_to_data(m_bits[MANIFEST_HEADER_LENGTH_BITS:]), MANIFEST_KEY).decode('utf-8'))
        if manifest_only: return manifest, None
    except Exception: return None, None

    key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
    secret = next((m for m in manifest if m['key_hash'] == key_hash), None)
    if not secret: return None, None
    
    try:
        s_bits = handler.extract_data(media_bytes, MANIFEST_KEY, secret['length_bits'], secret['start_bit'])
        payload = zlib.decompress(decrypt_payload(binary_to_data(s_bits), key))
    except Exception: return None, None
    
    if payload.startswith(MAGIC_BYTES):
        try:
            ptr = len(MAGIC_BYTES)
            flen = struct.unpack('>H', payload[ptr:ptr+2])[0]; ptr += 2
            fname = payload[ptr:ptr+flen].decode('utf-8'); ptr += flen
            fsize = struct.unpack('>I', payload[ptr:ptr+4])[0]; ptr += 4
            return "file", (fname, payload[ptr:ptr+fsize])
        except Exception: pass
    
    try:
        msg = payload.decode('utf-8', errors='ignore')
        if (pos := msg.find('\x03')) != -1: return "text", msg[:pos]
        return "text", msg
    except Exception: pass
    return None, None

def delete_additive(handler, media_bytes: bytes, key_hash: str) -> bytes:
    existing_manifest, _ = decode_additive(handler, media_bytes, MANIFEST_KEY, True)
    if not existing_manifest:
        return media_bytes
        
    new_manifest = [m for m in existing_manifest if m['key_hash'] != key_hash]
    if len(new_manifest) == len(existing_manifest):
        return media_bytes # Not found
        
    bin_manifest = data_to_binary(struct.pack('>I', len(em := encrypt_payload(json.dumps(new_manifest).encode('utf-8'), MANIFEST_KEY))) + em)
    if len(bin_manifest) > MANIFEST_RESERVED_BITS: raise ValueError("Manifest too large")
    
    return handler.embed_data(media_bytes, bin_manifest, MANIFEST_KEY, 0)

# --- Auth Middleware / Dependency ---
async def get_current_user(request: Request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header.split(' ')[1]
    
    try:
        if JWT_SECRET:
            # Note: Depending on Supabase settings, audience is "authenticated"
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False})
            return payload
        elif supabase:
            res = supabase.auth.get_user(token)
            if res and res.user:
                return {"sub": res.user.id, "email": res.user.email}
            raise HTTPException(status_code=401, detail="Invalid token")
        else:
            # For local dev without Supabase
            return {"sub": "local_dev_user"}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


async def get_admin_user(user=Depends(get_current_user)):
    """Dependency that ensures the current user is an admin."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    res = supabase.table('users').select('is_admin').eq('id', user['sub']).limit(1).execute()
    row = res.data[0] if res.data else None
    if not row or not row.get('is_admin'):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# --- API Endpoints ---
@app.middleware("http")
async def limit_size(req: Request, call_next):
    if int(req.headers.get("content-length", 0)) > MAX_FILE_SIZE: 
        return Response("File too large", status_code=413)
    return await call_next(req)


# ==================== SYSTEM & HEALTH ENDPOINTS ====================

@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "STENO Cryptographic API",
        "version": "2.4.0",
        "documentation": "/docs"
    }

@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "engine": "active",
        "ciphers": ["AES-256-GCM", "scrypt"]
    }


# ==================== AUTH ENDPOINTS ====================

@app.post("/api/register")
async def register(body: RegisterRequest):
    """Register a new user via Supabase Auth and insert profile into users table."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        auth_res = supabase.auth.sign_up({
            "email": body.email,
            "password": body.password,
        })
        if not auth_res.user:
            raise HTTPException(400, "Registration failed")

        user_id = auth_res.user.id
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        supabase.table('users').insert({
            "id": user_id,
            "first_name": body.first_name,
            "last_name": body.last_name,
            "email": body.email,
            "is_admin": False,
            "last_active": now,
            "logout_time": None,
            "profile_image": None,
        }).execute()

        return {"message": "User registered successfully", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Login with email (username field) and password. Returns JWT access token."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        auth_res = supabase.auth.sign_in_with_password({
            "email": form_data.username,
            "password": form_data.password,
        })
        if not auth_res.session:
            raise HTTPException(401, "Invalid credentials")

        return {
            "access_token": auth_res.session.access_token,
            "token_type": "bearer",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(401, f"Authentication failed: {str(e)}")


# ==================== USER PROFILE ENDPOINTS ====================

@app.get("/api/users/me")
async def get_me(user=Depends(get_current_user)):
    """Return the current user's profile from the users table."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        res = supabase.table('users').select('*').eq('id', user['sub']).limit(1).execute()
        row = res.data[0] if res.data else None
        if not row:
            raise HTTPException(404, "User profile not found")
        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/users/me/heartbeat")
async def heartbeat(user=Depends(get_current_user)):
    """Update the user's last_active timestamp."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        supabase.table('users').update({"last_active": now}).eq('id', user['sub']).execute()
        return {"status": "ok", "last_active": now}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/users/me/logout")
async def logout(user=Depends(get_current_user)):
    """Set the user's logout_time in the users table."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        supabase.table('users').update({"logout_time": now}).eq('id', user['sub']).execute()
        return {"status": "ok", "logout_time": now}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/users/me/profile-image")
async def upload_profile_image(file: UploadFile = File(...), user=Depends(get_current_user)):
    """Upload a profile image to Supabase Storage 'profiles' bucket."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        user_id = user['sub']
        ext = os.path.splitext(file.filename)[1] if file.filename else ".png"
        storage_path = f"{user_id}/avatar{ext}"
        file_bytes = await file.read()

        # Upload (upsert) to storage
        supabase.storage.from_('profiles').upload(
            storage_path,
            file_bytes,
            file_options={"content-type": file.content_type or "image/png", "upsert": "true"},
        )

        # Get public URL
        public_url = supabase.storage.from_('profiles').get_public_url(storage_path)

        # Update user record
        supabase.table('users').update({"profile_image": public_url}).eq('id', user_id).execute()

        return {"message": "Profile image uploaded", "url": public_url}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.delete("/api/users/me/profile-image")
async def delete_profile_image(user=Depends(get_current_user)):
    """Delete the user's profile image from storage."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        user_id = user['sub']
        # List files in the user's profile folder and remove them
        files = supabase.storage.from_('profiles').list(user_id)
        if files:
            paths = [f"{user_id}/{f['name']}" for f in files]
            supabase.storage.from_('profiles').remove(paths)

        supabase.table('users').update({"profile_image": None}).eq('id', user_id).execute()
        return {"message": "Profile image deleted"}
    except Exception as e:
        raise HTTPException(400, str(e))


# ==================== STEGANOGRAPHY ENDPOINTS ====================

def resolve_media_file(
    cover_media: Optional[UploadFile] = None,
    file: Optional[UploadFile] = None,
    media: Optional[UploadFile] = None,
) -> UploadFile:
    f = cover_media or file or media
    if not f:
        raise HTTPException(422, "No media file provided (expected 'cover_media', 'file', or 'media')")
    return f

@app.post("/api/capacity")
async def get_cap(
    cover_media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    media: Optional[UploadFile] = File(None),
):
    try: 
        mf = resolve_media_file(cover_media, file, media)
        media_bytes = await mf.read()
        cap = get_media_handler(mf.content_type, mf.filename, media_bytes).get_capacity(media_bytes)
        return {"capacity_bytes": max(0, cap), "capacity": max(0, cap)}
    except Exception as e:
        return {"capacity_bytes": 0, "capacity": 0, "error": str(e)}

@app.post("/api/encode-text")
@app.post("/api/encode/text")
async def enc_text(
    cover_media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    media: Optional[UploadFile] = File(None),
    message: str = Form(...),
    key: str = Form(...),
    creator_id: Optional[str] = Form(None),
    creator_email: Optional[str] = Form(None),
    creator_name: Optional[str] = Form(None),
    receiver_id: Optional[str] = Form(None),
    receiver_email: Optional[str] = Form(None),
    receiver_name: Optional[str] = Form(None),
):
    try:
        mf = resolve_media_file(cover_media, file, media)
        media_bytes = await mf.read()
        extra = {}
        if creator_id: extra['creator_id'] = creator_id
        if creator_email: extra['creator_email'] = creator_email
        if creator_name: extra['creator_name'] = creator_name
        if receiver_id: extra['receiver_id'] = receiver_id
        if receiver_email: extra['receiver_email'] = receiver_email
        if receiver_name: extra['receiver_name'] = receiver_name

        handler = get_media_handler(mf.content_type, mf.filename, media_bytes)
        b = encode_additive(
            handler,
            media_bytes,
            (message + '\x03').encode('utf-8'),
            key,
            extra_manifest_fields=extra if extra else None,
        )
        mt = 'text/plain' if 'text' in mf.content_type else ('image/png' if 'image' in mf.content_type else 'audio/wav')
        orig_name = mf.filename or "encoded_media"
        stem = orig_name.rsplit(".", 1)[0]
        ext = ".txt" if 'text' in mf.content_type else (".png" if 'image' in mf.content_type else ".wav")
        return Response(
            content=b,
            media_type=mt,
            headers={"Content-Disposition": f'attachment; filename="{stem}_stego{ext}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/api/encode-file")
@app.post("/api/encode/file")
async def enc_file(
    cover_media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    media: Optional[UploadFile] = File(None),
    secret_file: Optional[UploadFile] = File(None),
    payload_file: Optional[UploadFile] = File(None),
    key: str = Form(...),
    creator_id: Optional[str] = Form(None),
    creator_email: Optional[str] = Form(None),
    creator_name: Optional[str] = Form(None),
    receiver_id: Optional[str] = Form(None),
    receiver_email: Optional[str] = Form(None),
    receiver_name: Optional[str] = Form(None),
):
    try:
        mf = resolve_media_file(cover_media, file, media)
        sf_obj = secret_file or payload_file
        if not sf_obj:
            raise HTTPException(422, "No secret_file provided")

        extra = {}
        if creator_id: extra['creator_id'] = creator_id
        if creator_email: extra['creator_email'] = creator_email
        if creator_name: extra['creator_name'] = creator_name
        if receiver_id: extra['receiver_id'] = receiver_id
        if receiver_email: extra['receiver_email'] = receiver_email
        if receiver_name: extra['receiver_name'] = receiver_name

        media_bytes = await mf.read()
        sb = await sf_obj.read()
        sf = (sf_obj.filename or "secret.bin").encode("utf-8")
        p = MAGIC_BYTES + struct.pack(">H", len(sf)) + sf + struct.pack(">I", len(sb)) + sb

        handler = get_media_handler(mf.content_type, mf.filename, media_bytes)
        b = encode_additive(
            handler,
            media_bytes,
            p,
            key,
            extra_manifest_fields=extra if extra else None,
        )
        mt = 'text/plain' if 'text' in mf.content_type else ('image/png' if 'image' in mf.content_type else 'audio/wav')
        orig_name = mf.filename or "encoded_media"
        stem = orig_name.rsplit(".", 1)[0]
        ext = ".txt" if 'text' in mf.content_type else (".png" if 'image' in mf.content_type else ".wav")
        return Response(
            content=b,
            media_type=mt,
            headers={"Content-Disposition": f'attachment; filename="{stem}_stego{ext}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/api/decode")
async def dec(
    media: Optional[UploadFile] = File(None),
    cover_media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    key: str = Form(...),
):
    try:
        mf = resolve_media_file(cover_media, file, media)
        media_bytes = await mf.read()
        handler = get_media_handler(mf.content_type, mf.filename, media_bytes)
        t, data = decode_additive(handler, media_bytes, key)
        if t == "file": 
            return Response(content=data[1], headers={'Content-Disposition': f'attachment; filename="{data[0]}"'}, media_type="application/octet-stream")
        if t == "text": 
            return {"type": "text", "message": data}
        raise HTTPException(404, "Not found or invalid key")
    except HTTPException:
        raise
    except Exception as e: 
        raise HTTPException(400, str(e))

@app.post("/api/decode-batch")
async def dec_batch(
    media: Optional[UploadFile] = File(None),
    cover_media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    keys: Union[str, List[str]] = Form(...),
):
    try:
        mf = resolve_media_file(cover_media, file, media)
        key_list: List[str] = []
        raw_items = keys if isinstance(keys, list) else [keys]
        for item in raw_items:
            item_str = str(item).strip()
            if item_str.startswith("[") and item_str.endswith("]"):
                try:
                    parsed = json.loads(item_str)
                    if isinstance(parsed, list):
                        key_list.extend([str(k).strip() for k in parsed if str(k).strip()])
                        continue
                except Exception:
                    pass
            if "," in item_str:
                key_list.extend([k.strip() for k in item_str.split(",") if k.strip()])
            elif item_str:
                key_list.append(item_str)

        media_bytes = await mf.read()
        handler = get_media_handler(mf.content_type, mf.filename, media_bytes)
        
        results = {}
        for key in key_list:
            try:
                t, data = decode_additive(handler, media_bytes, key)
                if t == "file":
                    results[key] = {"type": "file", "filename": data[0], "data": base64.b64encode(data[1]).decode('utf-8')}
                elif t == "text":
                    results[key] = {"type": "text", "message": data}
                else:
                    results[key] = {"error": "No data found for this key"}
            except Exception as e:
                results[key] = {"error": str(e)}
        return {"results": results}
    except HTTPException:
        raise
    except Exception as e: 
        raise HTTPException(400, str(e))

@app.post("/api/delete")
async def del_secret(
    media: Optional[UploadFile] = File(None),
    cover_media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    key: str = Form(...),
):
    """Delete a secret from the media. Accepts raw key, computes key_hash internally."""
    try:
        mf = resolve_media_file(cover_media, file, media)
        media_bytes = await mf.read()
        handler = get_media_handler(mf.content_type, mf.filename, media_bytes)
        key_hash = hashlib.sha256(key.encode()).hexdigest()
        b = delete_additive(handler, media_bytes, key_hash)
        mt = 'text/plain' if 'text' in mf.content_type else ('image/png' if 'image' in mf.content_type else 'audio/wav')
        orig_name = mf.filename or "cleaned_media"
        stem = orig_name.rsplit(".", 1)[0]
        ext = ".txt" if 'text' in mf.content_type else (".png" if 'image' in mf.content_type else ".wav")
        return Response(
            content=b,
            media_type=mt,
            headers={"Content-Disposition": f'attachment; filename="{stem}_cleaned{ext}"'}
        )
    except HTTPException:
        raise
    except Exception as e: 
        raise HTTPException(400, str(e))



# ==================== KEY STRENGTH & GENERATION ====================

@app.post("/api/key-strength")
async def post_key_strength(body: KeyStrengthRequest):
    """Evaluate key strength on a 0-100 scale with suggestions."""
    score, strength, suggestions = check_key_strength(body.key)
    return {"score": score, "strength": strength, "suggestions": suggestions}


@app.post("/api/generate-key")
async def generate_key():
    """Generate a cryptographically random 16-character key."""
    alphabet = string.ascii_letters + string.digits + string.punctuation
    key = ''.join(secrets.choice(alphabet) for _ in range(16))
    return {"key": key}


# ==================== LIBRARY (CLOUD) ENDPOINTS ====================

@app.get("/api/library")
async def get_library(user=Depends(get_current_user)):
    if not supabase: raise HTTPException(500, "Supabase not configured")
    res = supabase.table('encoded_images').select('*').eq('owner_id', user['sub']).execute()
    return {"data": res.data}

@app.post("/api/save-to-library")
async def save_to_library(
    file: UploadFile = File(...),
    filename: str = Form(...),
    user=Depends(get_current_user),
):
    """Upload a file to Supabase Storage and save metadata to encoded_images table."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        file_bytes = await file.read()
        file_id = str(uuid.uuid4())
        ext = os.path.splitext(filename)[1] if filename else ".png"
        storage_name = f"{file_id}{ext}"

        supabase.storage.from_('uploads').upload(
            storage_name,
            file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"},
        )

        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        record = {
            "id": file_id,
            "filename": filename,
            "filepath": storage_name,
            "num_secrets": 0,
            "created_at": now,
            "owner_id": user['sub'],
        }
        supabase.table('encoded_images').insert(record).execute()
        return {"message": "Saved to library", "data": record}
    except Exception as e:
        raise HTTPException(400, str(e))


@app.put("/api/library/{item_id}")
async def rename_library_item(item_id: str, body: RenameLibraryRequest, user=Depends(get_current_user)):
    """Rename a library item."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        res = supabase.table('encoded_images').update({"filename": body.filename}).eq('id', item_id).eq('owner_id', user['sub']).execute()
        if not res.data:
            raise HTTPException(404, "Item not found")
        return {"message": "Renamed", "data": res.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.delete("/api/library/{item_id}")
async def delete_library_item(item_id: str, user=Depends(get_current_user)):
    """Delete a library item from DB and storage."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        # Get the record first to find the storage path
        res = supabase.table('encoded_images').select('filepath').eq('id', item_id).eq('owner_id', user['sub']).limit(1).execute()
        row = res.data[0] if res.data else None
        if not row:
            raise HTTPException(404, "Item not found")

        filepath = row['filepath']
        # Delete from storage
        supabase.storage.from_('uploads').remove([filepath])
        # Delete from DB
        supabase.table('encoded_images').delete().eq('id', item_id).eq('owner_id', user['sub']).execute()

        return {"message": "Deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.get("/api/uploads/{filename}")
async def serve_upload(filename: str):
    """Serve files from Supabase Storage 'uploads' bucket."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        data = supabase.storage.from_('uploads').download(filename)
        # Determine content type from extension
        ext = os.path.splitext(filename)[1].lower()
        ct_map = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
            '.txt': 'text/plain', '.pdf': 'application/pdf',
        }
        content_type = ct_map.get(ext, 'application/octet-stream')
        return Response(content=data, media_type=content_type)
    except Exception as e:
        raise HTTPException(404, f"File not found: {str(e)}")


# ==================== MESSAGING / INBOX ENDPOINTS ====================

@app.get("/api/inbox")
async def get_inbox(user=Depends(get_current_user)):
    if not supabase: raise HTTPException(500, "Supabase not configured")
    res = supabase.table('messages').select('*').eq('receiver_id', user['sub']).order('created_at', desc=True).execute()
    return {"data": res.data}

@app.post("/api/send-email")
async def send_email(body: SendEmailRequest, user=Depends(get_current_user)):
    """Send a file reference to multiple recipients via in-app messaging."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        sender_id = user['sub']
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        results = []

        for recipient_email in body.recipients:
            # Look up recipient in users table
            res = supabase.table('users').select('id').eq('email', recipient_email).limit(1).execute()
            row = res.data[0] if res.data else None
            if not row:
                results.append({"email": recipient_email, "status": "user_not_found"})
                continue

            receiver_id = row['id']
            # Extract filename from file_path
            stored_filename = os.path.basename(body.file_path)
            message_record = {
                "id": str(uuid.uuid4()),
                "sender_id": sender_id,
                "receiver_id": receiver_id,
                "filename": stored_filename,
                "stored_filename": stored_filename,
                "created_at": now,
                "is_read": False,
            }
            supabase.table('messages').insert(message_record).execute()
            results.append({"email": recipient_email, "status": "sent"})

        return {"results": results}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/inbox/{message_id}/read")
async def mark_message_read(message_id: str, user=Depends(get_current_user)):
    """Mark a message as read."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        res = supabase.table('messages').update({"is_read": True}).eq('id', message_id).eq('receiver_id', user['sub']).execute()
        if not res.data:
            raise HTTPException(404, "Message not found")
        return {"message": "Marked as read"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.delete("/api/inbox/{message_id}")
async def delete_message(message_id: str, user=Depends(get_current_user)):
    """Delete a message from the inbox."""
    if not supabase:
        raise HTTPException(500, "Supabase not configured")
    try:
        res = supabase.table('messages').delete().eq('id', message_id).eq('receiver_id', user['sub']).execute()
        if not res.data:
            raise HTTPException(404, "Message not found")
        return {"message": "Deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/admin/users")
async def admin_get_users(user=Depends(get_admin_user)):
    """Admin only: return all users."""
    try:
        res = supabase.table('users').select('*').execute()
        return {"data": res.data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/api/admin/detect")
async def admin_detect(media: UploadFile = File(...), user=Depends(get_admin_user)):
    """Admin only: forensic audit — decode the manifest to reveal all embedded payloads."""
    try:
        media_bytes = await media.read()
        handler = get_media_handler(media.content_type, media.filename, media_bytes)
        manifest, _ = decode_additive(handler, media_bytes, MANIFEST_KEY, manifest_only=True)

        if not manifest:
            return {"payloads": [], "message": "No embedded data detected"}

        return {
            "payloads": manifest,
            "total_secrets": len(manifest),
            "message": f"Detected {len(manifest)} embedded payload(s)",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

