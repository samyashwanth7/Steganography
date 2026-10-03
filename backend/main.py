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
import logging
import functools
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
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
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

# --- App Setup ---
app = FastAPI(title="Core Steganography API")

# --- CORS ---
allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [o.strip() for o in allowed_origins_raw.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Rate Limiting (slowapi with fallback) ---
def get_real_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    limiter = Limiter(key_func=get_real_ip, enabled=os.getenv("RATELIMIT_ENABLED", "1") != "0")
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
except ImportError:
    class _DummyLimiter:
        def limit(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator
    limiter = _DummyLimiter()

# --- Supabase Config ---
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

_supabase_data_key = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
if not SUPABASE_SERVICE_ROLE_KEY and SUPABASE_KEY:
    logging.warning("SUPABASE_SERVICE_ROLE_KEY not set; falling back to anon SUPABASE_KEY for data operations.")

supabase: Client = create_client(SUPABASE_URL, _supabase_data_key) if SUPABASE_URL and _supabase_data_key else None

# --- Constants & Keys (v2 & legacy) ---
LEGACY_MANIFEST_KEY = "a7e1f5d2-a8b3-4c9f-8d7e-2c5b6a1d4f8e"  # public; used ONLY to read v1 files
_env_manifest = os.getenv("MANIFEST_KEY")
if not _env_manifest:
    logging.warning("MANIFEST_KEY environment variable is not set! Using dev-insecure-manifest-key. DO NOT USE IN PRODUCTION.")
MANIFEST_KEY = _env_manifest or "dev-insecure-manifest-key"
V2_MAGIC = b"STN2"
V2_PERM_KEY = "v2:" + MANIFEST_KEY
V2_MANIFEST_AES_KEY = hashlib.sha256(b"steno-v2-manifest|" + MANIFEST_KEY.encode()).digest()
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1

MAGIC_BYTES = b"STG_F"
HEADER_FILENAME_LEN_BYTES = 2
HEADER_FILESIZE_BYTES = 4
SALT_BYTES = 16
IV_BYTES = 16
MAX_FILE_SIZE = 50 * 1024 * 1024
ZERO_WIDTH_ZERO = '\u200c'
ZERO_WIDTH_ONE = '\u200d'
MANIFEST_HEADER_LENGTH_BITS = 32
MANIFEST_RESERVED_BITS = 32768


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

# Legacy v1 crypto (for backward compatibility decoding only)
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

# v2 crypto (scrypt + AES-GCM)
def derive_v2(key: str, salt: bytes) -> tuple[bytes, bytes]:
    m = hashlib.scrypt(key.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=64)
    return m[:32], m[32:]  # (enc_key, id_key)

def key_tag(id_key: bytes) -> bytes:
    return hmac.new(id_key, b"steno-v2-id", hashlib.sha256).digest()[:16]

def data_to_binary(data: bytes) -> str:
    return ''.join(format(byte, '08b') for byte in data)

def binary_to_data(binary: str) -> bytes:
    if len(binary) % 8 != 0:
        binary = binary[:-(len(binary) % 8)]
    return bytes(int(binary[i:i+8], 2) for i in range(0, len(binary), 8))

@functools.lru_cache(maxsize=4)
def get_randomized_indices(key: str, total_size: int) -> np.ndarray:
    seed = int.from_bytes(hashlib.sha256(key.encode('utf-8')).digest(), 'big') % (2**32 - 1)
    rng = np.random.default_rng(seed)
    indices = np.arange(total_size)
    rng.shuffle(indices)
    indices.setflags(write=False)
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

    if has_lower: score += 10
    else: suggestions.append("Add lowercase letters")
    if has_upper: score += 10
    else: suggestions.append("Add uppercase letters")
    if has_digit: score += 10
    else: suggestions.append("Add numbers")
    if has_special: score += 10
    else: suggestions.append("Add special characters (!@#$%^&*)")

    # Shannon entropy (up to 30 points)
    if length > 0:
        freq = {}
        for c in key:
            freq[c] = freq.get(c, 0) + 1
        entropy = -sum((count / length) * math.log2(count / length) for count in freq.values())
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
    reserved_bits = 32768

    def total_slots(self, media_bytes: bytes) -> int:
        raise NotImplementedError

    def embed_segments(self, media_bytes: bytes, segments: list[tuple[int, str]], perm_key: str) -> bytes:
        raise NotImplementedError

    def extract_bits(self, media_bytes: bytes, perm_key: str, num_bits: int, start_bit: int, version: int) -> str:
        raise NotImplementedError

    def get_capacity(self, media_bytes: bytes) -> int:
        return max(0, (self.total_slots(media_bytes) - self.reserved_bits) // 8)


class ImageHandler(MediaHandler):
    reserved_bits = 32768

    def total_slots(self, media_bytes: bytes) -> int:
        with Image.open(io.BytesIO(media_bytes)) as img:
            w, h = img.size
            return w * h * 3

    def extract_bits(self, media_bytes: bytes, perm_key: str, num_bits: int, start_bit: int, version: int) -> str:
        if version == 1:
            flat = np.array(Image.open(io.BytesIO(media_bytes)).convert('RGBA')).flatten()
            if start_bit + num_bits > flat.size:
                raise ValueError("Not enough space to extract bits")
            indices = get_randomized_indices(perm_key, flat.size)
            idx = indices[start_bit : start_bit + num_bits]
            extracted = flat[idx] & 1
            return (extracted.astype(np.uint8) + 48).tobytes().decode("ascii")
        else:
            arr = np.array(Image.open(io.BytesIO(media_bytes)).convert("RGBA"))
            rgb = arr[..., :3].reshape(-1)
            if start_bit + num_bits > rgb.size:
                raise ValueError("Not enough space to extract bits")
            indices = get_randomized_indices(perm_key, rgb.size)
            idx = indices[start_bit : start_bit + num_bits]
            extracted = rgb[idx] & 1
            return (extracted.astype(np.uint8) + 48).tobytes().decode("ascii")

    def embed_segments(self, media_bytes: bytes, segments: list[tuple[int, str]], perm_key: str) -> bytes:
        orig_img = Image.open(io.BytesIO(media_bytes))
        has_alpha = orig_img.mode in ("RGBA", "LA") or ("transparency" in orig_img.info)
        arr = np.array(orig_img.convert("RGBA"))
        h, w, _ = arr.shape
        rgb = arr[..., :3].reshape(-1).copy()
        total = rgb.size
        indices = get_randomized_indices(perm_key, total)

        for start_bit, bit_str in segments:
            bits_arr = np.frombuffer(bit_str.encode("ascii"), dtype=np.uint8) - 48
            n = len(bits_arr)
            if start_bit + n > total:
                raise ValueError("Data exceeds image capacity")
            pos = indices[start_bit : start_bit + n]
            mismatch = ((rgb[pos] & 1) != bits_arr)
            if np.any(mismatch):
                mismatch_pos = pos[mismatch]
                mismatch_vals = rgb[mismatch_pos].astype(np.int16)
                rng = np.random.default_rng(secrets.randbits(64))
                deltas = rng.choice(np.array([-1, 1], dtype=np.int16), size=len(mismatch_pos))
                deltas[mismatch_vals == 0] = 1
                deltas[mismatch_vals == 255] = -1
                rgb[mismatch_pos] = (mismatch_vals + deltas).astype(np.uint8)

        arr[..., :3] = rgb.reshape(h, w, 3)
        if has_alpha:
            out_img = Image.fromarray(arr, 'RGBA')
        else:
            out_img = Image.fromarray(arr[..., :3], 'RGB')

        with io.BytesIO() as out:
            out_img.save(out, format="PNG")
            return out.getvalue()


class AudioHandler(MediaHandler):
    reserved_bits = 32768

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

    def total_slots(self, media_bytes: bytes) -> int:
        frames, params = self._load(media_bytes)
        return len(frames) // params.sampwidth

    def extract_bits(self, media_bytes: bytes, perm_key: str, num_bits: int, start_bit: int, version: int) -> str:
        frames, params = self._load(media_bytes)
        if version == 1:
            if start_bit + num_bits > len(frames):
                raise ValueError("Not enough space to extract bits")
            arr_frames = np.frombuffer(frames, dtype=np.uint8)
            indices = get_randomized_indices(perm_key, len(arr_frames))
            idx = indices[start_bit : start_bit + num_bits]
            extracted = arr_frames[idx] & 1
            return (extracted.astype(np.uint8) + 48).tobytes().decode("ascii")
        else:
            sampwidth = params.sampwidth
            slots = len(frames) // sampwidth
            if start_bit + num_bits > slots:
                raise ValueError("Not enough space to extract bits")
            indices = get_randomized_indices(perm_key, slots)
            idx = indices[start_bit : start_bit + num_bits]
            byte_indices = idx * sampwidth
            arr_frames = np.frombuffer(frames, dtype=np.uint8)
            extracted = arr_frames[byte_indices] & 1
            return (extracted.astype(np.uint8) + 48).tobytes().decode("ascii")

    def embed_segments(self, media_bytes: bytes, segments: list[tuple[int, str]], perm_key: str) -> bytes:
        frames, params = self._load(media_bytes)
        arr_frames = np.frombuffer(frames, dtype=np.uint8).copy()
        sampwidth = params.sampwidth
        slots = len(arr_frames) // sampwidth
        indices = get_randomized_indices(perm_key, slots)

        for start_bit, bit_str in segments:
            bits_arr = np.frombuffer(bit_str.encode("ascii"), dtype=np.uint8) - 48
            n = len(bits_arr)
            if start_bit + n > slots:
                raise ValueError("Data exceeds audio capacity")
            pos = indices[start_bit : start_bit + n]
            byte_pos = pos * sampwidth
            arr_frames[byte_pos] = (arr_frames[byte_pos] & 254) | bits_arr

        with io.BytesIO() as out:
            with wave.open(out, 'wb') as wf:
                wf.setparams(params)
                wf.writeframes(arr_frames.tobytes())
            return out.getvalue()


class TextHandler(MediaHandler):
    reserved_bits = 8192

    def total_slots(self, media_bytes: bytes) -> int:
        return 10 * 1024 * 1024

    def extract_bits(self, media_bytes: bytes, perm_key: str, num_bits: int, start_bit: int, version: int) -> str:
        text = media_bytes.decode('utf-8', errors='ignore')
        zwcs = [c for c in text if c in (ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE)]
        if start_bit + num_bits > len(zwcs):
            raise ValueError("Not enough space to extract bits")
        extracted = zwcs[start_bit : start_bit + num_bits]
        return "".join('1' if c == ZERO_WIDTH_ONE else '0' for c in extracted)

    def embed_segments(self, media_bytes: bytes, segments: list[tuple[int, str]], perm_key: str) -> bytes:
        text = media_bytes.decode('utf-8', errors='ignore')
        clean_text = "".join(c for c in text if c not in (ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE))
        zwc_list = [c for c in text if c in (ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE)]

        for start_bit, bit_str in segments:
            req_len = start_bit + len(bit_str)
            if req_len > len(zwc_list):
                zwc_list.extend([ZERO_WIDTH_ZERO] * (req_len - len(zwc_list)))
            for i, b in enumerate(bit_str):
                zwc_list[start_bit + i] = ZERO_WIDTH_ONE if b == '1' else ZERO_WIDTH_ZERO

        total_zwc = len(zwc_list)
        parts = clean_text.split(" ")
        num_spaces = len(parts) - 1

        if num_spaces > 0 and total_zwc > 0:
            chunk_size = total_zwc // num_spaces
            out = []
            ptr = 0
            for i in range(num_spaces):
                out.append(parts[i])
                out.append(" ")
                if chunk_size > 0:
                    out.append("".join(zwc_list[ptr : ptr + chunk_size]))
                    ptr += chunk_size
            out.append(parts[-1])
            if ptr < total_zwc:
                out.append("".join(zwc_list[ptr:]))
            return "".join(out).encode("utf-8")
        else:
            return (clean_text + "".join(zwc_list)).encode("utf-8")


def get_media_handler(content_type: str = "", filename: str = "", media_bytes: bytes = b"") -> MediaHandler:
    ct = (content_type or "").lower()
    fn = (filename or "").lower()
    
    if any(k in ct for k in ("image", "png", "jpeg", "jpg", "webp", "bmp")):
        return ImageHandler()
    if any(k in ct for k in ("audio", "wav", "mpeg", "mp3", "ogg", "flac")):
        return AudioHandler()
    if "text" in ct:
        return TextHandler()

    if any(fn.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".bmp")):
        return ImageHandler()
    if any(fn.endswith(ext) for ext in (".wav", ".mp3", ".ogg", ".m4a", ".flac")):
        return AudioHandler()
    if any(fn.endswith(ext) for ext in (".txt", ".md", ".json", ".csv", ".log")):
        return TextHandler()

    if media_bytes:
        if media_bytes.startswith(b'\x89PNG\r\n\x1a\n') or media_bytes.startswith(b'\xff\xd8\xff') or media_bytes.startswith(b'GIF8') or media_bytes.startswith(b'BM'):
            return ImageHandler()
        if media_bytes.startswith(b'RIFF') or media_bytes.startswith(b'ID3') or media_bytes.startswith(b'\xff\xfb'):
            return AudioHandler()

    return TextHandler()


# --- Core Steganography Functions (v2 & Legacy) ---
class LegacyFormatError(Exception):
    pass


def read_manifest(handler: MediaHandler, media_bytes: bytes) -> tuple[Optional[int], Optional[list]]:
    """Try reading v2 manifest first; if not present, try v1 legacy manifest."""
    # 1. Try v2
    try:
        len_bits = handler.extract_bits(media_bytes, V2_PERM_KEY, 32, 0, version=2)
        L = struct.unpack(">I", binary_to_data(len_bits))[0]
        if 0 < L * 8 + 32 <= handler.reserved_bits:
            blob_bits = handler.extract_bits(media_bytes, V2_PERM_KEY, L * 8, 32, version=2)
            blob = binary_to_data(blob_bits)
            if blob.startswith(V2_MAGIC):
                nonce = blob[4:16]
                ct = blob[16:]
                json_bytes = AESGCM(V2_MANIFEST_AES_KEY).decrypt(nonce, ct, V2_MAGIC)
                entries = json.loads(json_bytes.decode('utf-8'))
                if isinstance(entries, list):
                    return 2, entries
    except Exception:
        pass

    # 2. Try v1 (legacy)
    try:
        m_len_bits = handler.extract_bits(media_bytes, LEGACY_MANIFEST_KEY, MANIFEST_HEADER_LENGTH_BITS, 0, version=1)
        m_len = struct.unpack('>I', binary_to_data(m_len_bits))[0]
        if 0 < m_len * 8 + 32 <= MANIFEST_RESERVED_BITS:
            m_bits = handler.extract_bits(media_bytes, LEGACY_MANIFEST_KEY, MANIFEST_HEADER_LENGTH_BITS + (m_len * 8), 0, version=1)
            raw_manifest = decrypt_payload(binary_to_data(m_bits[MANIFEST_HEADER_LENGTH_BITS:]), LEGACY_MANIFEST_KEY)
            manifest = json.loads(raw_manifest.decode('utf-8'))
            if isinstance(manifest, list):
                return 1, manifest
    except Exception:
        pass

    return None, None


def parse_payload(payload: bytes) -> tuple[Optional[str], any]:
    """Parse decrypted uncompressed payload bytes into ('file', (fname, data)) or ('text', msg)."""
    if payload.startswith(MAGIC_BYTES):
        try:
            ptr = len(MAGIC_BYTES)
            flen = struct.unpack('>H', payload[ptr:ptr+2])[0]; ptr += 2
            fname = payload[ptr:ptr+flen].decode('utf-8'); ptr += flen
            fsize = struct.unpack('>I', payload[ptr:ptr+4])[0]; ptr += 4
            return "file", (fname, payload[ptr:ptr+fsize])
        except Exception:
            pass

    try:
        msg = payload.decode('utf-8', errors='ignore')
        if (pos := msg.find('\x03')) != -1:
            return "text", msg[:pos]
        return "text", msg
    except Exception:
        pass
    return None, None


def encode_v2(handler: MediaHandler, media_bytes: bytes, payload: bytes, key: str, meta: Optional[dict] = None) -> bytes:
    ver, entries = read_manifest(handler, media_bytes)
    if ver == 1:
        raise LegacyFormatError("This file was created with an older STENO version. It can still be decoded, but new secrets must go into a fresh cover file.")

    if ver is None or entries is None:
        entries = []

    scrub_segments = []
    new_entries = []
    for entry in entries:
        salt = base64.b64decode(entry["s"])
        expected_tag = base64.b64decode(entry["t"])
        _, id_key_check = derive_v2(key, salt)
        if hmac.compare_digest(key_tag(id_key_check), expected_tag):
            rand_bits = ''.join(secrets.choice('01') for _ in range(entry["l"]))
            scrub_segments.append((entry["b"], rand_bits))
        else:
            new_entries.append(entry)
    entries = new_entries

    salt = os.urandom(16)
    enc_key, id_key = derive_v2(key, salt)
    tag = key_tag(id_key)

    nonce = os.urandom(12)
    compressed = zlib.compress(payload, 9)
    ct = AESGCM(enc_key).encrypt(nonce, compressed, None)
    payload_blob = nonce + ct
    payload_bits = data_to_binary(payload_blob)

    start_bit = max((e["b"] + e["l"] for e in entries), default=handler.reserved_bits)
    total_slots = handler.total_slots(media_bytes)
    if start_bit + len(payload_bits) > total_slots:
        raise ValueError("Not enough capacity")

    new_entry = {
        "s": base64.b64encode(salt).decode("ascii"),
        "t": base64.b64encode(tag).decode("ascii"),
        "b": start_bit,
        "l": len(payload_bits),
        "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    if meta:
        new_entry["meta"] = meta
    entries.append(new_entry)

    json_bytes = json.dumps(entries).encode("utf-8")
    m_nonce = os.urandom(12)
    m_ct = AESGCM(V2_MANIFEST_AES_KEY).encrypt(m_nonce, json_bytes, V2_MAGIC)
    manifest_blob = V2_MAGIC + m_nonce + m_ct
    manifest_data = struct.pack(">I", len(manifest_blob)) + manifest_blob
    manifest_bits = data_to_binary(manifest_data)
    if len(manifest_bits) > handler.reserved_bits:
        raise ValueError("Manifest full: too many secrets in this file")

    segments = scrub_segments + [(start_bit, payload_bits), (0, manifest_bits)]
    return handler.embed_segments(media_bytes, segments, V2_PERM_KEY)


def decode_any(handler: MediaHandler, media_bytes: bytes, key: str) -> tuple[Optional[str], any]:
    ver, entries = read_manifest(handler, media_bytes)
    if not ver or not entries:
        return None, None

    if ver == 2:
        for entry in entries:
            try:
                salt = base64.b64decode(entry["s"])
                expected_tag = base64.b64decode(entry["t"])
                enc_key, id_key = derive_v2(key, salt)
                if hmac.compare_digest(key_tag(id_key), expected_tag):
                    bits = handler.extract_bits(media_bytes, V2_PERM_KEY, entry["l"], entry["b"], version=2)
                    blob = binary_to_data(bits)
                    nonce = blob[:12]
                    ct = blob[12:]
                    compressed = AESGCM(enc_key).decrypt(nonce, ct, None)
                    payload = zlib.decompress(compressed)
                    return parse_payload(payload)
            except Exception:
                continue
        return None, None

    elif ver == 1:
        key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
        secret = next((m for m in entries if m.get('key_hash') == key_hash), None)
        if not secret:
            return None, None
        try:
            s_bits = handler.extract_bits(media_bytes, LEGACY_MANIFEST_KEY, secret['length_bits'], secret['start_bit'], version=1)
            payload = zlib.decompress(decrypt_payload(binary_to_data(s_bits), key))
            return parse_payload(payload)
        except Exception:
            return None, None

    return None, None


def delete_v2(handler: MediaHandler, media_bytes: bytes, key: str) -> bytes:
    ver, entries = read_manifest(handler, media_bytes)
    if ver == 1:
        raise LegacyFormatError("This file was created with an older STENO version. It can still be decoded, but new secrets must go into a fresh cover file.")
    if ver != 2 or not entries:
        raise HTTPException(404, "Secret not found or invalid key")

    target_entry = None
    remaining_entries = []
    for entry in entries:
        salt = base64.b64decode(entry["s"])
        expected_tag = base64.b64decode(entry["t"])
        _, id_key_check = derive_v2(key, salt)
        if target_entry is None and hmac.compare_digest(key_tag(id_key_check), expected_tag):
            target_entry = entry
        else:
            remaining_entries.append(entry)

    if target_entry is None:
        raise HTTPException(404, "Secret not found or invalid key")

    rand_bits = ''.join(secrets.choice('01') for _ in range(target_entry["l"]))
    scrub_segment = (target_entry["b"], rand_bits)

    json_bytes = json.dumps(remaining_entries).encode("utf-8")
    m_nonce = os.urandom(12)
    m_ct = AESGCM(V2_MANIFEST_AES_KEY).encrypt(m_nonce, json_bytes, V2_MAGIC)
    manifest_blob = V2_MAGIC + m_nonce + m_ct
    manifest_data = struct.pack(">I", len(manifest_blob)) + manifest_blob
    manifest_bits = data_to_binary(manifest_data)

    segments = [scrub_segment, (0, manifest_bits)]
    return handler.embed_segments(media_bytes, segments, V2_PERM_KEY)


# Backward compatibility aliases
encode_additive = encode_v2
decode_additive = decode_any
delete_additive = delete_v2


# --- Auth Middleware / Dependency ---
async def get_current_user(request: Request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header.split(' ')[1]
    
    try:
        if JWT_SECRET:
            payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], options={"verify_aud": False})
            return payload
        elif supabase:
            res = supabase.auth.get_user(token)
            if res and res.user:
                return {"sub": res.user.id, "email": res.user.email}
            raise HTTPException(status_code=401, detail="Invalid token")
        else:
            if os.getenv("ALLOW_DEV_AUTH") == "1":
                return {"sub": "local_dev_user"}
            raise HTTPException(status_code=500, detail="Auth not configured")
    except HTTPException:
        raise
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
@limiter.limit("10/minute")
async def register(request: Request, body: RegisterRequest):
    """Register a new user via Supabase Auth and insert profile into users table."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(500, "Supabase not configured")
    try:
        req_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        auth_res = req_client.auth.sign_up({
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
@limiter.limit("10/minute")
async def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends()):
    """Login with email (username field) and password. Returns JWT access token."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(500, "Supabase not configured")
    try:
        req_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        auth_res = req_client.auth.sign_in_with_password({
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

        supabase.storage.from_('profiles').upload(
            storage_path,
            file_bytes,
            file_options={"content-type": file.content_type or "image/png", "upsert": "true"},
        )

        public_url = supabase.storage.from_('profiles').get_public_url(storage_path)
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
        try:
            b = encode_v2(
                handler,
                media_bytes,
                (message + '\x03').encode('utf-8'),
                key,
                meta=extra if extra else None,
            )
        except LegacyFormatError as le:
            raise HTTPException(409, str(le))

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
        try:
            b = encode_v2(
                handler,
                media_bytes,
                p,
                key,
                meta=extra if extra else None,
            )
        except LegacyFormatError as le:
            raise HTTPException(409, str(le))

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
@limiter.limit("30/minute")
async def dec(
    request: Request,
    media: Optional[UploadFile] = File(None),
    cover_media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    key: str = Form(...),
):
    try:
        mf = resolve_media_file(cover_media, file, media)
        media_bytes = await mf.read()
        handler = get_media_handler(mf.content_type, mf.filename, media_bytes)
        t, data = decode_any(handler, media_bytes, key)
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
@limiter.limit("30/minute")
async def dec_batch(
    request: Request,
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
                t, data = decode_any(handler, media_bytes, key)
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
    """Delete a secret from the media (real scrub with random bits)."""
    try:
        mf = resolve_media_file(cover_media, file, media)
        media_bytes = await mf.read()
        handler = get_media_handler(mf.content_type, mf.filename, media_bytes)
        try:
            b = delete_v2(handler, media_bytes, key)
        except LegacyFormatError as le:
            raise HTTPException(409, str(le))
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
        res = supabase.table('encoded_images').select('filepath').eq('id', item_id).eq('owner_id', user['sub']).limit(1).execute()
        row = res.data[0] if res.data else None
        if not row:
            raise HTTPException(404, "Item not found")

        filepath = row['filepath']
        supabase.storage.from_('uploads').remove([filepath])
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
            res = supabase.table('users').select('id').eq('email', recipient_email).limit(1).execute()
            row = res.data[0] if res.data else None
            if not row:
                results.append({"email": recipient_email, "status": "user_not_found"})
                continue

            receiver_id = row['id']
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
        ver, raw_manifest = read_manifest(handler, media_bytes)

        if not raw_manifest:
            return {"payloads": [], "manifest": [], "total_secrets": 0, "message": "No embedded data detected"}

        payloads = []
        for entry in raw_manifest:
            norm = {
                "start_bit": entry.get("b", entry.get("start_bit")),
                "length_bits": entry.get("l", entry.get("length_bits")),
                "ts": entry.get("ts"),
                "format": "v2" if ver == 2 else "v1",
            }
            if "meta" in entry and isinstance(entry["meta"], dict):
                norm.update(entry["meta"])
            for k, v in entry.items():
                if k not in ("s", "t", "b", "l", "ts", "key_hash", "start_bit", "length_bits", "meta"):
                    norm[k] = v
            payloads.append(norm)

        return {
            "payloads": payloads,
            "manifest": payloads,
            "total_secrets": len(payloads),
            "message": f"Detected {len(payloads)} embedded payload(s)",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))
