import io
import datetime
import hashlib
import json
import struct
import wave
import zlib
import os
import numpy as np
from PIL import Image
from pydub import AudioSegment
from pydub.exceptions import CouldntDecodeError
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

app = FastAPI(title="Core Steganography API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

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
MANIFEST_RESERVED_BITS = 8192

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
    seed = int.from_bytes(hashlib.sha256(key.encode('utf-8')).digest(), 'big')
    rng = np.random.default_rng(seed)
    indices = np.arange(total_size)
    rng.shuffle(indices)
    return indices

# --- Media Handlers ---
class MediaHandler:
    def get_capacity(self, media_bytes: bytes) -> int: raise NotImplementedError
    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes: raise NotImplementedError
    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str: raise NotImplementedError

class ImageHandler(MediaHandler):
    def get_capacity(self, media_bytes: bytes) -> int:
        with Image.open(io.BytesIO(media_bytes)) as img:
            return (np.array(img.convert('RGBA')).size // 8) - 1024
            
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
            try:
                audio = AudioSegment.from_file(io.BytesIO(media_bytes))
                wav_io = io.BytesIO()
                audio.export(wav_io, format="wav")
                wav_io.seek(0)
                with wave.open(wav_io, 'rb') as af:
                    return bytearray(af.readframes(af.getnframes())), af.getparams()
            except CouldntDecodeError:
                raise HTTPException(422, "Could not decode audio")

    def get_capacity(self, media_bytes: bytes) -> int:
        frames, _ = self._load(media_bytes)
        return (len(frames) // 8) - 1024

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

def get_media_handler(content_type: str) -> MediaHandler:
    if 'image' in content_type: return ImageHandler()
    if 'audio' in content_type: return AudioHandler()
    raise HTTPException(415, "Unsupported media type")

# --- Additive Steganography logic ---
def encode_additive(handler, media_bytes: bytes, payload: bytes, key: str) -> bytes:
    existing_manifest, _ = decode_additive(handler, media_bytes, MANIFEST_KEY, True)
    manifest = existing_manifest or []
    key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
    if any(m['key_hash'] == key_hash for m in manifest): raise ValueError("Key already used")
    
    bin_payload = data_to_binary(encrypt_payload(zlib.compress(payload, level=9), key))
    start_bit = MANIFEST_RESERVED_BITS if not manifest else manifest[-1]['start_bit'] + manifest[-1]['length_bits']
    
    if start_bit + len(bin_payload) > handler.get_capacity(media_bytes) * 8: raise ValueError("Not enough capacity")
    manifest.append({'key_hash': key_hash, 'start_bit': start_bit, 'length_bits': len(bin_payload), 'ts': datetime.datetime.utcnow().isoformat()})
    
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
    except Exception: pass
    return None, None

# --- API Endpoints ---
@app.middleware("http")
async def limit_size(req: Request, call_next):
    if int(req.headers.get("content-length", 0)) > MAX_FILE_SIZE: return Response("File too large", status_code=413)
    return await call_next(req)

@app.post("/api/capacity")
async def get_cap(cover_media: UploadFile = File(...)):
    try: return {"capacity_bytes": get_media_handler(cover_media.content_type).get_capacity(await cover_media.read())}
    except Exception: return {"capacity_bytes": 0}

@app.post("/api/encode-text")
async def enc_text(cover_media: UploadFile = File(...), message: str = Form(...), key: str = Form(...)):
    try:
        b = encode_additive(get_media_handler(cover_media.content_type), await cover_media.read(), (message + '\x03').encode('utf-8'), key)
        return Response(content=b, media_type='image/png' if 'image' in cover_media.content_type else 'audio/wav')
    except Exception as e: raise HTTPException(400, str(e))

@app.post("/api/encode-file")
async def enc_file(cover_media: UploadFile = File(...), secret_file: UploadFile = File(...), key: str = Form(...)):
    try:
        sf, sb = secret_file.filename.encode('utf-8'), await secret_file.read()
        p = MAGIC_BYTES + struct.pack('>H', len(sf)) + sf + struct.pack('>I', len(sb)) + sb
        b = encode_additive(get_media_handler(cover_media.content_type), await cover_media.read(), p, key)
        return Response(content=b, media_type='image/png' if 'image' in cover_media.content_type else 'audio/wav')
    except Exception as e: raise HTTPException(400, str(e))

@app.post("/api/decode")
async def dec(media: UploadFile = File(...), key: str = Form(...)):
    try:
        t, data = decode_additive(get_media_handler(media.content_type), await media.read(), key)
        if t == "file": return Response(content=data[1], headers={'Content-Disposition': f'attachment; filename="{data[0]}"'}, media_type="application/octet-stream")
        if t == "text": return {"message": data}
        raise HTTPException(404, "Not found")
    except Exception as e: raise HTTPException(400, str(e))
