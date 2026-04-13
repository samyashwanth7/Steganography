import io
import datetime
import hashlib
import json
import re
import struct
import wave
import zlib
import os
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel
from PIL import Image
import numpy as np
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
from abc import ABC, abstractmethod
from pydub import AudioSegment
from dotenv import load_dotenv
import base64

import base64
from sqlalchemy.orm import Session
from database import SessionLocal, engine, Base
from models import EncodedImage, User, Message
from auth import get_current_user, get_current_user_optional, create_access_token, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES
from fastapi.security import OAuth2PasswordRequestForm
import uuid

load_dotenv()

# Create tables
Base.metadata.create_all(bind=engine)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Pydantic Models ---
class KeyStrengthRequest(BaseModel):
    key: str

class UpdateFilenameRequest(BaseModel):
    filename: str

class DecodeRequest(BaseModel):
    key: str

class UserCreate(BaseModel):
    email: str
    password: str
    first_name: str
    last_name: str

class UserOut(BaseModel):
    email: str
    first_name: str
    last_name: str
    profile_image: str | None = None
    is_admin: bool = False
    
    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str

# --- Constants ---
MAGIC_BYTES = b"STG_F"
HEADER_FILENAME_LEN_BYTES = 2
HEADER_FILESIZE_BYTES = 4
SALT_BYTES = 16
IV_BYTES = 16
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB limit
ZERO_WIDTH_ZERO = '\u200c'  # Zero-Width Non-Joiner
ZERO_WIDTH_ONE = '\u200d'   # Zero-Width Joiner
MANIFEST_KEY = os.getenv("MANIFEST_KEY", "a7e1f5d2-a8b3-4c9f-8d7e-2c5b6a1d4f8e") # A constant key for the manifest
MANIFEST_HEADER_LENGTH_BITS = 32
MANIFEST_RESERVED_BITS = 8192 # Reserve 1KB for the manifest
UPLOAD_DIR = "uploads"

if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)


# --- Media Handling Abstraction ---
class MediaHandler(ABC):
    @abstractmethod
    def get_capacity(self, media_bytes: bytes) -> int:
        pass

    @abstractmethod
    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes:
        pass

    @abstractmethod
    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str:
        pass

class ImageHandler(MediaHandler):
    def get_capacity(self, media_bytes: bytes) -> int:
        with Image.open(io.BytesIO(media_bytes)) as img:
            data = np.array(img.convert('RGBA'))
            return (data.size // 8) - 1024
    
    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes:
        image = Image.open(io.BytesIO(media_bytes)).convert('RGBA')
        data = np.array(image)
        flat_data = data.flatten()
        
        required_size = start_bit + len(binary_data)
        if required_size > flat_data.size:
            raise ValueError('Data is too large for this image at the specified offset.')
        
        indices = get_randomized_indices(key, flat_data.size)
        
        # We offset into the single shuffled array to prevent data overlap
        for i in range(len(binary_data)):
            embed_index = indices[start_bit + i]
            flat_data[embed_index] = (flat_data[embed_index] & 254) | int(binary_data[i])
            
        encoded_data = flat_data.reshape(data.shape)
        encoded_image = Image.fromarray(encoded_data, 'RGBA')
        with io.BytesIO() as byte_arr:
            encoded_image.save(byte_arr, format='PNG')
            return byte_arr.getvalue()

    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str:
        image = Image.open(io.BytesIO(media_bytes)).convert('RGBA')
        data = np.array(image)
        flat_data = data.flatten()

        required_size = start_bit + num_bits
        if required_size > flat_data.size:
            raise ValueError("Not enough space in image to extract bits.")

        indices = get_randomized_indices(key, flat_data.size)
        # We offset into the single shuffled array to read the correct data segment
        binary_data = [str(flat_data[indices[start_bit + i]] & 1) for i in range(num_bits)]
        return "".join(binary_data)

class AudioHandler(MediaHandler):
    def _load_audio_frames(self, media_bytes: bytes):
        # Try to process as a standard WAV first, which doesn't require FFmpeg
        try:
            with wave.open(io.BytesIO(media_bytes), 'rb') as audio_file:
                params = audio_file.getparams()
                frames = bytearray(audio_file.readframes(audio_file.getnframes()))
                return frames, params
        except wave.Error:
            # If it's not a standard WAV, fall back to pydub for conversion (might need FFmpeg)
            try:
                audio = AudioSegment.from_file(io.BytesIO(media_bytes))
                wav_bytes_io = io.BytesIO()
                audio.export(wav_bytes_io, format="wav")
                wav_bytes_io.seek(0)
                with wave.open(wav_bytes_io, 'rb') as audio_file:
                    params = audio_file.getparams()
                    frames = bytearray(audio_file.readframes(audio_file.getnframes()))
                    return frames, params
            except CouldntDecodeError:
                raise HTTPException(
                    status_code=422,
                    detail="Could not decode audio file. It may be corrupted or in an unsupported format. For formats like MP3, ensure the server has FFmpeg installed."
                )

    def get_capacity(self, media_bytes: bytes) -> int:
        frames, _ = self._load_audio_frames(media_bytes)
        num_bytes = len(frames)
        return (num_bytes // 8) - 1024

    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes:
        frames, params = self._load_audio_frames(media_bytes)

        required_size = start_bit + len(binary_data)
        if required_size > len(frames):
            raise ValueError("Data is too large for this audio file at the specified offset.")

        indices = get_randomized_indices(key, len(frames))

        for i in range(len(binary_data)):
            embed_index = indices[start_bit + i]
            frames[embed_index] = (frames[embed_index] & 254) | int(binary_data[i])

        with io.BytesIO() as byte_arr:
            with wave.open(byte_arr, 'wb') as new_audio_file:
                new_audio_file.setparams(params)
                new_audio_file.writeframes(frames)
            return byte_arr.getvalue()

    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str:
        frames, _ = self._load_audio_frames(media_bytes)
        
        required_size = start_bit + num_bits
        if required_size > len(frames):
            raise ValueError("Not enough space in audio to extract bits.")

        indices = get_randomized_indices(key, len(frames))
        binary_data = [str(frames[indices[start_bit + i]] & 1) for i in range(num_bits)]
        return "".join(binary_data)

class TextHandler(MediaHandler):
    def get_capacity(self, media_bytes: bytes) -> int:
        text = media_bytes.decode('utf-8', errors='ignore')
        # Capacity is the number of characters, as we can hide one bit after each.
        clean_chars = [char for char in text if char not in [ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE]]
        return (len(clean_chars) // 8) - 1024

    def embed_data(self, media_bytes: bytes, binary_data: str, key: str, start_bit: int = 0) -> bytes:
        # Since text embedding is destructive, we must read all existing data,
        # modify the bitstream, and then rewrite everything.

        # 1. Get clean text
        text = media_bytes.decode('utf-8', errors='ignore')
        clean_chars = [char for char in text if char not in [ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE]]
        clean_text = "".join(clean_chars)
        
        if not clean_text:
            if start_bit == 0:
                # Create dummy text to hold the data if the file is empty
                clean_text = " " * (len(binary_data) + 1024) # Add buffer
            else:
                raise ValueError("Cannot add subsequent secrets to an empty text file.")

        # 2. Extract the entire existing bitstream
        max_possible_bits = len(clean_text)
        existing_bitstream = self.extract_data(media_bytes, key, max_possible_bits, 0)

        # 3. Construct the new, combined bitstream
        end_pos = start_bit + len(binary_data)
        if start_bit > len(existing_bitstream):
            padding_needed = start_bit - len(existing_bitstream)
            existing_bitstream += '0' * padding_needed

        new_bitstream = existing_bitstream[:start_bit] + binary_data + existing_bitstream[end_pos:]
        
        # 4. Check capacity
        if len(new_bitstream) > len(clean_text):
            raise ValueError(f"Not enough capacity in text. Has {len(clean_text)} slots, needs {len(new_bitstream)}.")

        # 5. Re-embed the entire new bitstream into the clean text
        indices = get_randomized_indices(key, len(clean_text))
        zwc_buckets = {i: [] for i in range(len(clean_text))}

        for i, bit in enumerate(new_bitstream):
            embed_char = ZERO_WIDTH_ZERO if bit == '0' else ZERO_WIDTH_ONE
            target_index = indices[i]
            zwc_buckets[target_index].append(embed_char)

        # 6. Reconstruct the final text
        result = []
        for i, char in enumerate(clean_text):
            result.append(char)
            if i in zwc_buckets:
                result.extend(zwc_buckets[i])

        return "".join(result).encode('utf-8')


    def extract_data(self, media_bytes: bytes, key: str, num_bits: int, start_bit: int = 0) -> str:
        text = media_bytes.decode('utf-8', errors='ignore')

        # 1. Separate clean text and build a map of ZWCs following each clean character
        clean_chars = []
        zwc_map = {}
        clean_char_index = -1
        for char in text:
            if char not in [ZERO_WIDTH_ZERO, ZERO_WIDTH_ONE]:
                clean_char_index += 1
                clean_chars.append(char)
                zwc_map[clean_char_index] = []
            elif clean_char_index >= 0:
                bit = '0' if char == ZERO_WIDTH_ZERO else '1'
                zwc_map[clean_char_index].append(bit)
        
        clean_text = "".join(clean_chars)
        if not clean_text:
            return ""

        # 2. Reconstruct the full bitstream by reading from buckets in the shuffled order
        indices = get_randomized_indices(key, len(clean_text))
        
        # Create a temporary array to hold bits in their "unshuffled" positions
        unshuffled_bits = [[] for _ in range(len(clean_text))]
        for char_idx, bucket in zwc_map.items():
            unshuffled_bits[char_idx].extend(bucket)

        # Reorder the bits based on the key's indices
        reordered_stream = []
        for bit_idx in range(len(clean_text)): # Max one bit per char for this simple model
             char_idx = indices[bit_idx]
             if unshuffled_bits[char_idx]:
                 reordered_stream.append(unshuffled_bits[char_idx].pop(0))

        full_stream = "".join(reordered_stream)
        
        # 3. Return the requested slice of the bitstream
        end_bit = start_bit + num_bits
        if start_bit > len(full_stream):
            return ""
            
        return full_stream[start_bit:end_bit]

# --- Media Handler Registry ---
MEDIA_HANDLERS = {
    'image': ImageHandler(),
    'audio': AudioHandler(),
    'text': TextHandler(),
}

def get_media_handler(content_type: str) -> MediaHandler:
    if not content_type or '/' not in content_type:
        raise HTTPException(status_code=415, detail="Unsupported media type.")
    major_type = content_type.lower().split('/')[0]
    handler = MEDIA_HANDLERS.get(major_type)
    if not handler:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {major_type}")
    return handler

# --- Core Steganography Logic ---
def data_to_binary(data: bytes) -> str:
    return ''.join(format(byte, '08b') for byte in data)

def binary_to_data(binary: str) -> bytes:
    if len(binary) % 8 != 0:
        binary = binary[:-(len(binary) % 8)]
    return bytes(int(binary[i:i+8], 2) for i in range(0, len(binary), 8))

def get_randomized_indices(key: str, total_size: int) -> np.ndarray:
    seed = int.from_bytes(hashlib.sha256(key.encode('utf-8')).digest(), 'big')
    rng = np.random.default_rng(seed)
    indices = np.arange(total_size)
    rng.shuffle(indices)
    return indices

# --- Encryption Functions ---
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
    encrypted_data = encryptor.update(padded_data) + encryptor.finalize()
    return salt + iv + encrypted_data

def decrypt_payload(encrypted_data: bytes, key: str) -> bytes:
    salt = encrypted_data[:SALT_BYTES]
    iv = encrypted_data[SALT_BYTES:SALT_BYTES + IV_BYTES]
    data_to_decrypt = encrypted_data[SALT_BYTES + IV_BYTES:]
    derived_key = derive_key(key, salt)
    cipher = Cipher(algorithms.AES(derived_key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded_data = decryptor.update(data_to_decrypt) + decryptor.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    data = unpadder.update(padded_data) + unpadder.finalize()
    return data

# --- Image Conversion for Compatibility ---
def convert_media_if_needed(media_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    if not content_type or '/' not in content_type: return media_bytes, content_type
    major_type, sub_type = content_type.lower().split('/')
    
    if major_type == 'image':
        try:
            # Use PIL to detect actual format from bytes
            with Image.open(io.BytesIO(media_bytes)) as img:
                if img.format == 'PNG':
                    # Already a PNG, return as is to preserve LSBs!
                    return media_bytes, 'image/png'
                
                # Otherwise, convert to PNG
                with io.BytesIO() as byte_arr:
                    img.convert('RGBA').save(byte_arr, format='PNG')
                    return byte_arr.getvalue(), 'image/png'
        except Exception:
            # If PIL fails, return original
            return media_bytes, content_type

    if major_type == 'audio':
        # If it's already wav, keep it
        if sub_type == 'wav' or sub_type == 'x-wav':
            return media_bytes, 'audio/wav'
            
        try:
            # Method 1: Try pydub (needs ffmpeg usually)
            audio = AudioSegment.from_file(io.BytesIO(media_bytes))
            with io.BytesIO() as byte_arr:
                audio.export(byte_arr, format="wav")
                return byte_arr.getvalue(), 'audio/wav'
        except Exception:
            # Method 2: Fallback to 'afconvert' (macOS native)
            try:
                import subprocess
                import tempfile
                
                # Create temp input file
                with tempfile.NamedTemporaryFile(delete=False, suffix=f".{sub_type}") as tmp_in:
                    tmp_in.write(media_bytes)
                    tmp_in_path = tmp_in.name
                
                tmp_out_path = tmp_in_path + ".wav"
                
                # Run afconvert: -f WAVE -d LEI16 (Little Endian 16-bit Integer)
                subprocess.run(["afconvert", "-f", "WAVE", "-d", "LEI16", tmp_in_path, tmp_out_path], check=True, capture_output=True)
                
                if os.path.exists(tmp_out_path):
                    with open(tmp_out_path, "rb") as f:
                        wav_bytes = f.read()
                    
                    # Cleanup using a safe try-finally or just here
                    try: os.unlink(tmp_in_path)
                    except: pass
                    try: os.unlink(tmp_out_path)
                    except: pass
                    
                    return wav_bytes, 'audio/wav'
            except Exception as e2:
                print(f"DEBUG: afconvert failed: {e2}")
                pass

            # Fallback failed
            return media_bytes, content_type
            
    return media_bytes, content_type

# --- High-Level Additive Encoding/Decoding ---

def encode_additive(handler: MediaHandler, media_bytes: bytes, payload: bytes, key: str, creator_info: dict = None) -> bytes:
    existing_manifest, _ = decode_additive(handler, media_bytes, MANIFEST_KEY, manifest_only=True)
    manifest_data = existing_manifest if existing_manifest else []

    key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
    if any(m['key_hash'] == key_hash for m in manifest_data):
        raise ValueError("This key has already been used. Please use a different key for each secret.")

    compressed_payload = zlib.compress(payload, level=9)
    encrypted_payload = encrypt_payload(compressed_payload, key)
    binary_payload = data_to_binary(encrypted_payload)
    
    if not manifest_data:
        start_bit = MANIFEST_RESERVED_BITS
    else:
        last_secret = manifest_data[-1]
        start_bit = last_secret['start_bit'] + last_secret['length_bits']

    if start_bit + len(binary_payload) > handler.get_capacity(media_bytes) * 8:
        raise ValueError("Not enough capacity in the cover media for this secret.")

    new_manifest_entry = { 
        'key_hash': key_hash, 
        'start_bit': start_bit, 
        'length_bits': len(binary_payload),
        'created_at': datetime.datetime.utcnow().isoformat()
    }

    if creator_info:
        print(f"DEBUG: Adding creator info to manifest: {creator_info}")
        new_manifest_entry.update(creator_info)

    manifest_data.append(new_manifest_entry)
    print(f"DEBUG: Final manifest data: {manifest_data}")
    
    manifest_json = json.dumps(manifest_data).encode('utf-8')
    encrypted_manifest = encrypt_payload(manifest_json, MANIFEST_KEY)
    final_manifest_payload = struct.pack('>I', len(encrypted_manifest)) + encrypted_manifest
    binary_manifest = data_to_binary(final_manifest_payload)
    
    if len(binary_manifest) > MANIFEST_RESERVED_BITS:
        raise ValueError(f"Manifest is too large. Cannot add more secrets.")
        
    # Embed secret payload, using the MANIFEST_KEY for location shuffling to ensure no overlaps.
    media_bytes = handler.embed_data(media_bytes, binary_payload, MANIFEST_KEY, start_bit=start_bit)
    
    # Embed the updated manifest at the beginning.
    media_bytes = handler.embed_data(media_bytes, binary_manifest, MANIFEST_KEY, start_bit=0)
    
    return media_bytes

def decode_additive(handler: MediaHandler, media_bytes: bytes, key: str, manifest_only=False):
    try:
        manifest_header_bits = handler.extract_data(media_bytes, MANIFEST_KEY, MANIFEST_HEADER_LENGTH_BITS, start_bit=0)
        if len(manifest_header_bits) < MANIFEST_HEADER_LENGTH_BITS: return None, None
        
        manifest_len_bytes = struct.unpack('>I', binary_to_data(manifest_header_bits))[0]
        total_manifest_bits = MANIFEST_HEADER_LENGTH_BITS + (manifest_len_bytes * 8)
        
        if total_manifest_bits > MANIFEST_RESERVED_BITS: return None, None

        all_manifest_bits = handler.extract_data(media_bytes, MANIFEST_KEY, total_manifest_bits, start_bit=0)
        encrypted_manifest_bits = all_manifest_bits[MANIFEST_HEADER_LENGTH_BITS:]
        encrypted_manifest_bytes = binary_to_data(encrypted_manifest_bits)
        
        decrypted_manifest = decrypt_payload(encrypted_manifest_bytes, MANIFEST_KEY)
        manifest = json.loads(decrypted_manifest.decode('utf-8'))
        
        if manifest_only:
            return manifest, None
    except Exception:
        return None, None

    key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
    secret_info = next((m for m in manifest if m['key_hash'] == key_hash), None)
    
    if not secret_info:
        return None, None
        
    try:
        # Extract secret using MANIFEST_KEY for location, then decrypt with the user's key.
        secret_bits = handler.extract_data(media_bytes, MANIFEST_KEY, secret_info['length_bits'], start_bit=secret_info['start_bit'])
        encrypted_secret_bytes = binary_to_data(secret_bits)
        decrypted_bytes = decrypt_payload(encrypted_secret_bytes, key)
        decompressed_bytes = zlib.decompress(decrypted_bytes)
    except Exception:
        return None, None

    if not decompressed_bytes:
        return None, None

    if decompressed_bytes[:len(MAGIC_BYTES)] == MAGIC_BYTES:
        try:
            ptr = len(MAGIC_BYTES)
            filename_len = struct.unpack('>H', decompressed_bytes[ptr:ptr+HEADER_FILENAME_LEN_BYTES])[0]
            ptr += HEADER_FILENAME_LEN_BYTES
            filename = decompressed_bytes[ptr:ptr+filename_len].decode('utf-8')
            ptr += filename_len
            file_size = struct.unpack('>I', decompressed_bytes[ptr:ptr+HEADER_FILESIZE_BYTES])[0]
            ptr += HEADER_FILESIZE_BYTES
            file_data = decompressed_bytes[ptr:ptr+file_size]
            if len(file_data) == file_size:
                return "file", (filename, file_data)
        except Exception: pass

    try:
        message = decompressed_bytes.decode('utf-8', errors='ignore')
        terminator_pos = message.find('\x03')
        if terminator_pos != -1:
            return "text", message[:terminator_pos]
    except Exception: pass
    
    return None, None
    
# --- Fallback Decoder for older, single-payload files ---
def delete_secret(handler: MediaHandler, media_bytes: bytes, key: str) -> tuple[bytes, bool]:
    manifest, _ = decode_additive(handler, media_bytes, MANIFEST_KEY, manifest_only=True)
    if not manifest:
        return media_bytes, False

    key_hash = hashlib.sha256(key.encode('utf-8')).hexdigest()
    target_entry = None
    target_index = -1
    
    for i, entry in enumerate(manifest):
        if entry['key_hash'] == key_hash:
            target_entry = entry
            target_index = i
            break
            
    if target_entry is None:
        return media_bytes, False
        
    num_bits = target_entry['length_bits']
    num_bytes = (num_bits + 7) // 8
    random_bytes = os.urandom(num_bytes)
    random_bits = data_to_binary(random_bytes)[:num_bits]
    
    media_bytes = handler.embed_data(media_bytes, random_bits, MANIFEST_KEY, start_bit=target_entry['start_bit'])
    
    del manifest[target_index]
    
    manifest_json = json.dumps(manifest).encode('utf-8')
    encrypted_manifest = encrypt_payload(manifest_json, MANIFEST_KEY)
    final_manifest_payload = struct.pack('>I', len(encrypted_manifest)) + encrypted_manifest
    binary_manifest = data_to_binary(final_manifest_payload)
    
    if len(binary_manifest) > MANIFEST_RESERVED_BITS:
         raise ValueError("Updated manifest is too large.")

    media_bytes = handler.embed_data(media_bytes, binary_manifest, MANIFEST_KEY, start_bit=0)
    
    return media_bytes, True

# --- Fallback Decoder for older, single-payload files ---

def decode_universal(handler: MediaHandler, media_bytes: bytes, key: str):
    HEADER_LENGTH_BITS = 32
    try:
        header_bits = handler.extract_data(media_bytes, key, HEADER_LENGTH_BITS, start_bit=0)
    except ValueError: return None, None
    if len(header_bits) < HEADER_LENGTH_BITS: return None, None

    try:
        payload_len_bytes = struct.unpack('>I', binary_to_data(header_bits))[0]
    except (struct.error, TypeError): return None, None

    total_bits_to_extract = HEADER_LENGTH_BITS + (payload_len_bytes * 8)
    try:
        all_bits = handler.extract_data(media_bytes, key, total_bits_to_extract, start_bit=0)
    except ValueError: return None, None

    encrypted_bits = all_bits[HEADER_LENGTH_BITS:]
    encrypted_bytes = binary_to_data(encrypted_bits)
    try:
        decrypted_bytes = decrypt_payload(encrypted_bytes, key)
        decompressed_bytes = zlib.decompress(decrypted_bytes)
    except Exception: return None, None

    if not decompressed_bytes:
        return None, None

    if decompressed_bytes[:len(MAGIC_BYTES)] == MAGIC_BYTES:
        try:
            ptr = len(MAGIC_BYTES)
            filename_len = struct.unpack('>H', decompressed_bytes[ptr:ptr+HEADER_FILENAME_LEN_BYTES])[0]
            ptr += HEADER_FILENAME_LEN_BYTES
            filename = decompressed_bytes[ptr:ptr+filename_len].decode('utf-8')
            ptr += filename_len
            file_size = struct.unpack('>I', decompressed_bytes[ptr:ptr+HEADER_FILESIZE_BYTES])[0]
            ptr += HEADER_FILESIZE_BYTES
            file_data = decompressed_bytes[ptr:ptr+file_size]
            if len(file_data) == file_size:
                return "file", (filename, file_data)
        except Exception: pass

    try:
        message = decompressed_bytes.decode('utf-8', errors='ignore')
        terminator_pos = message.find('\x03')
        if terminator_pos != -1:
            return "text", message[:terminator_pos]
    except Exception: pass
    
    return None, None

# --- FastAPI Application ---
app = FastAPI(title="Steganographic Encoder API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

@app.middleware("http")
async def check_file_size(request: Request, call_next):
    if "content-length" in request.headers:
        content_length = int(request.headers["content-length"])
        if content_length > MAX_FILE_SIZE:
            return Response(content=f"File size exceeds the limit of {MAX_FILE_SIZE / (1024*1024)}MB.", status_code=413)
    return await call_next(request)


@app.post("/api/key-strength")
async def api_check_key_strength(request: KeyStrengthRequest):
    key = request.key
    length = len(key)
    score = 0
    feedback = []

    if length < 8:
        feedback.append("Use at least 8 characters.")
    else:
        score += 25
    if length >= 12: score += 25
    
    if not re.search(r"[a-z]", key):
        feedback.append("Add a lowercase letter.")
    elif not re.search(r"[A-Z]", key):
        feedback.append("Add an uppercase letter.")
    else:
        score += 25

    if not re.search(r"\d", key):
        feedback.append("Add a number.")
    else:
        score += 15
        
    if not re.search(r"\W", key):
        feedback.append("Add a special character (e.g., !@#$).")
    else:
        score += 10
    
    score = min(score, 100)
    
    if length == 0: label = "Empty"
    elif length < 8: label = "Too Short"
    elif score < 50: label = "Weak"
    elif score < 75: label = "Medium"
    else: label = "Strong"; feedback = []
    
    return {"score": score, "label": label, "feedback": feedback}


@app.post("/api/capacity")
async def api_get_capacity(cover_media: UploadFile = File(...)):
    media_bytes = await cover_media.read()
    content_type = cover_media.content_type
    try:
        media_bytes, content_type = convert_media_if_needed(media_bytes, content_type)
        handler = get_media_handler(content_type)
        capacity = handler.get_capacity(media_bytes)
        if capacity > 0:
            return {"capacity_bytes": capacity}
        else:
            return {"capacity_bytes": 0, "message": "This media has no usable capacity."}
    except HTTPException as e:
        return {"capacity_bytes": 0, "message": e.detail}
    except Exception:
        return {"capacity_bytes": 0, "message": "Could not process file. It may be corrupted or in an unsupported format."}

@app.post("/api/encode-text")
async def api_encode_text(
    cover_media: UploadFile = File(...), 
    message: str = Form(...), 
    key: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    media_bytes = await cover_media.read()
    content_type = cover_media.content_type
    try:
        media_bytes, content_type = convert_media_if_needed(media_bytes, content_type)
        handler = get_media_handler(content_type)
        payload_bytes = (message + '\x03').encode('utf-8')
        
        creator_info = {
            'creator_id': current_user.id,
            'creator_email': current_user.email,
            'creator_name': f"{current_user.first_name} {current_user.last_name}"
        }
        
        encoded_bytes = encode_additive(handler, media_bytes, payload_bytes, key, creator_info)
        
        major_type = content_type.split('/')[0]
        output_content_type = 'text/plain'
        if major_type == 'image':
            output_content_type = 'image/png'
        elif major_type == 'audio':
            output_content_type = 'audio/wav'

        return Response(content=encoded_bytes, media_type=output_content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException as e:
        raise e
    except Exception as e: 
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during encoding: {e}")

@app.post("/api/encode-file")
async def api_encode_file(
    cover_media: UploadFile = File(...), 
    secret_file: UploadFile = File(...), 
    key: str = Form(...),
    current_user: User | None = Depends(get_current_user_optional)
):
    media_bytes = await cover_media.read()
    content_type = cover_media.content_type
    try:
        media_bytes, content_type = convert_media_if_needed(media_bytes, content_type)
        handler = get_media_handler(content_type)
        secret_filename = secret_file.filename.encode('utf-8')
        secret_file_bytes = await secret_file.read()
        payload = MAGIC_BYTES + struct.pack('>H', len(secret_filename)) + secret_filename + struct.pack('>I', len(secret_file_bytes)) + secret_file_bytes
        
        creator_info = None
        if current_user:
            creator_info = {
                'creator_id': current_user.id,
                'creator_email': current_user.email,
                'creator_name': f"{current_user.first_name} {current_user.last_name}"
            }

        encoded_bytes = encode_additive(handler, media_bytes, payload, key, creator_info)
        
        major_type = content_type.split('/')[0]
        output_content_type = 'text/plain'
        if major_type == 'image':
            output_content_type = 'image/png'
        elif major_type == 'audio':
            output_content_type = 'audio/wav'

        return Response(content=encoded_bytes, media_type=output_content_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException as e:
        raise e
    except Exception as e: 
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during file encoding: {e}")

@app.post("/api/decode")
async def api_decode(media: UploadFile = File(...), key: str = Form(...)):
    media_bytes = await media.read()
    content_type = media.content_type
    try:
        handler = get_media_handler(content_type)
        
        decoded_type, data = decode_additive(handler, media_bytes, key)
        
        if decoded_type is None:
            decoded_type, data = decode_universal(handler, media_bytes, key)

        if decoded_type == "file":
            filename, file_data = data
            headers = {'Content-Disposition': f'attachment; filename="{filename}"'}
            return Response(content=file_data, media_type="application/octet-stream", headers=headers)
        elif decoded_type == "text":
            return {"message": data}
        else:
            raise HTTPException(status_code=404, detail="No hidden content found or key is incorrect.")
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred during decoding: {e}")

@app.post("/api/delete")
async def api_delete(cover_media: UploadFile = File(...), key: str = Form(...)):
    media_bytes = await cover_media.read()
    content_type = cover_media.content_type
    try:
        media_bytes, content_type = convert_media_if_needed(media_bytes, content_type)
        handler = get_media_handler(content_type)
        
        updated_media_bytes, success = delete_secret(handler, media_bytes, key)
        
        if not success:
             raise HTTPException(status_code=404, detail="Key not found or nothing to delete.")
             
        major_type = content_type.split('/')[0]
        output_content_type = 'application/octet-stream'
        if major_type == 'image':
            output_content_type = 'image/png'
        elif major_type == 'audio':
            output_content_type = 'audio/wav'
            
        return Response(content=updated_media_bytes, media_type=output_content_type)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during deletion: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred during deletion: {e}")

@app.post("/api/decode-batch")
async def api_decode_batch(media: UploadFile = File(...), keys: str = Form(...)):
    media_bytes = await media.read()
    content_type = media.content_type
    
    try:
        keys_list = json.loads(keys)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid keys format. Must be a JSON list of strings.")

    results = []
    
    try:
        handler = get_media_handler(content_type)
        
        # We need to reuse media_bytes for each key.
        # Since decode_additive doesn't modify media_bytes, simple reuse is fine.
        
        for key in keys_list:
            if not key: continue
            
            result_entry = {"key": key, "found": False, "type": None, "message": None, "filename": None, "data_base64": None}
            
            try:
                decoded_type, data = decode_additive(handler, media_bytes, key)
                
                if decoded_type is None:
                     decoded_type, data = decode_universal(handler, media_bytes, key)
                
                if decoded_type == "text":
                    result_entry["found"] = True
                    result_entry["type"] = "text"
                    result_entry["message"] = data
                elif decoded_type == "file":
                    filename, file_data = data
                    result_entry["found"] = True
                    result_entry["type"] = "file"
                    result_entry["filename"] = filename
                    result_entry["data_base64"] = base64.b64encode(file_data).decode('utf-8')
            except Exception:
                pass # Fail silently for individual keys, just not found
                
            results.append(result_entry)
            
        return results

    except HTTPException as e:
        raise e
    except Exception as e:
         raise HTTPException(status_code=500, detail=f"An error occurred during batch decoding: {e}")

@app.post("/api/save-to-library")
async def save_to_library(
    file: UploadFile = File(...),
    num_secrets: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        contents = await file.read()
        
        # Generate unique filename
        file_ext = file.filename.split('.')[-1]
        unique_filename = f"{uuid.uuid4()}.{file_ext}"
        upload_dir = "uploads"
        file_path = os.path.join(upload_dir, unique_filename)
        
        # Ensure directory exists (just in case)
        os.makedirs(upload_dir, exist_ok=True)
        
        # Save file to disk
        with open(file_path, "wb") as f:
            f.write(contents)
            
        # Save record to DB
        db_image = EncodedImage(
            filename=file.filename, 
            filepath=file_path, 
            num_secrets=num_secrets,
            owner_id=current_user.id
        )
        db.add(db_image)
        db.commit()
        db.refresh(db_image)
        
        return {"id": db_image.id, "filename": db_image.filename, "message": "Saved to library successfully"}
        
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=f"Failed to save to library: {e}")

@app.get("/api/library")
def get_library(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    images = db.query(EncodedImage).filter(EncodedImage.owner_id == current_user.id).order_by(EncodedImage.created_at.desc()).all()
    results = []
    for img in images:
        results.append({
            "id": img.id,
            "filename": os.path.basename(img.filepath), # Actual file on disk (UUID)
            "display_name": img.filename, # Original uploaded name
            "num_secrets": img.num_secrets,
            "created_at": img.created_at
        })
    return results

@app.put("/api/library/{id}")
def update_library_item(id: int, request: UpdateFilenameRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_image = db.query(EncodedImage).filter(EncodedImage.id == id, EncodedImage.owner_id == current_user.id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    db_image.filename = request.filename
    db.commit()
    db.refresh(db_image)
    return {"message": "Filename updated successfully", "filename": db_image.filename}

@app.delete("/api/library/{id}")
def delete_library_item(id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db_image = db.query(EncodedImage).filter(EncodedImage.id == id, EncodedImage.owner_id == current_user.id).first()
    if not db_image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete from disk
    if os.path.exists(db_image.filepath):
        try:
            os.remove(db_image.filepath)
        except Exception as e:
            print(f"Error removing file: {e}")
            # Continue to delete DB record even if file deletion fails
            
    # Delete from DB
    db.delete(db_image)
    db.commit()
    return {"message": "Item deleted successfully"}

@app.get("/api/uploads/{filename:path}")
async def get_uploaded_file(filename: str):
    file_path = os.path.join("uploads", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="File not found")

# --- Auth Endpoints ---

@app.post("/api/users/me/profile-image")
async def upload_profile_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        # Validate file type
        if not file.content_type.startswith('image/'):
            raise HTTPException(status_code=400, detail="File must be an image")
            
        # Create uploads directory if not exists
        upload_dir = "uploads/profiles"
        os.makedirs(upload_dir, exist_ok=True)
        
        # Generate unique filename
        file_ext = file.filename.split('.')[-1]
        filename = f"user_{current_user.id}_{uuid.uuid4()}.{file_ext}"
        file_path = os.path.join(upload_dir, filename)
        
        # Save file
        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)
            
        # Update user profile
        # Use db.merge to ensure the object is attached to the current session
        user_to_update = db.merge(current_user)
        user_to_update.profile_image = f"profiles/{filename}"
        db.commit()
        db.refresh(user_to_update)
        
        return {"message": "Profile image updated successfully", "profile_image": user_to_update.profile_image}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {e}")

@app.delete("/api/users/me/profile-image")
async def delete_profile_image(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.profile_image:
        raise HTTPException(status_code=404, detail="Profile image not found")

    try:
        # Construct absolute path safely
        file_path = os.path.join("uploads", current_user.profile_image)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete image file: {e}")

    # Remove from DB
    user_to_update = db.merge(current_user)
    user_to_update.profile_image = None
    db.commit()
    db.refresh(user_to_update)

    return {"message": "Profile image deleted successfully"}

# --- Admin Endpoints ---
def get_current_admin_user(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

@app.get("/api/admin/users", response_model=list[UserOut])
def get_all_users(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_admin_user)
):
    users = db.query(User).all()
    return users

@app.post("/api/admin/detect")
async def api_admin_detect(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin_user)
):
    media_bytes = await file.read()
    content_type = file.content_type
    
    try:
        print(f"DEBUG: Analyze request. Filename: {file.filename}, Type: {content_type}, Size: {len(media_bytes)}")
        
        media_bytes, content_type = convert_media_if_needed(media_bytes, content_type)
        print(f"DEBUG: Converted/Checked type: {content_type}, Size: {len(media_bytes)}")
        
        handler = get_media_handler(content_type)
        print(f"DEBUG: Using handler: {handler}")
        
        # Use decode_additive with manifest_only=True to peep into the manifest without needing keys
        manifest, _ = decode_additive(handler, media_bytes, MANIFEST_KEY, manifest_only=True)
        print(f"DEBUG: Decode result: {manifest}")
        
        if not manifest:
             print("DEBUG: No manifest found.")
             # Try universal decoder or just return empty
             return {"found": False, "message": "No steganographic data detected with this system's signature."}
             
        print(f"DEBUG: Detected manifest: {manifest}")
        # Extract relevant metadata
        secrets_found = []
        for entry in manifest:
            secret_info = {
                "timestamp": entry.get("created_at"),
                "creator_name": entry.get("creator_name", "Unknown"),
                "creator_email": entry.get("creator_email", "Unknown"),
                "creator_id": entry.get("creator_id"),
                "receiver_name": entry.get("receiver_name"),
                "receiver_email": entry.get("receiver_email"),
                "receiver_id": entry.get("receiver_id"),
                "key_hash": entry.get("key_hash")
            }
            secrets_found.append(secret_info)
            
        return {"found": True, "secrets": secrets_found}

    except Exception as e:
        print(f"ERROR in api_admin_detect: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/api/register", response_model=Token)
def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(
        email=user.email, 
        hashed_password=hashed_password,
        first_name=user.first_name,
        last_name=user.last_name
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user:
         raise HTTPException(
            status_code=404, # Specific code for user not found to trigger frontend redirect
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me", response_model=UserOut)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/")
def read_root():
    return {"message": "Steganographic Encoder API is running!"}

@app.post("/api/send-email")
async def api_send_email(
    file: UploadFile = File(...),
    recipient_email: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Parse recipients
    recipient_emails = [e.strip() for e in recipient_email.split(',') if e.strip()]
    if not recipient_emails:
        raise HTTPException(status_code=400, detail="No valid recipient emails provided.")

    # 2. Read file content once
    original_media_bytes = await file.read()
    content_type = file.content_type
    
    try:
        # Pre-convert if needed (e.g. JPG -> PNG) so we don't do it N times
        # Note: convert_image_if_needed returns (bytes, str)
        print(f"DEBUG: Processing file for {len(recipient_emails)} recipients. Size: {len(original_media_bytes)}")
        processed_media_bytes, content_type = convert_media_if_needed(original_media_bytes, content_type)
        handler = get_media_handler(content_type)
        
        successful_sends = []
        failed_sends = []

        for target_email in recipient_emails:
            # 3. Verify recipient
            recipient = db.query(User).filter(User.email == target_email).first()
            if not recipient:
                failed_sends.append(f"{target_email} (User not found)")
                continue

            # 4. Prepare Metadata (Unique per user)
            transfer_metadata = {
                'creator_id': current_user.id,
                'creator_email': current_user.email,
                'creator_name': f"{current_user.first_name} {current_user.last_name}",
                'receiver_id': recipient.id,
                'receiver_email': recipient.email,
                'receiver_name': f"{recipient.first_name} {recipient.last_name}",
                'transfer_timestamp': datetime.datetime.utcnow().isoformat()
            }
            
            transfer_payload = b"SECURE_TRANSFER_MARKER"
            transfer_key = str(uuid.uuid4()) # Unique key per transfer
            
            # 5. Encode! (Fresh copy of bytes logic handled inside encode potentially? No, encode_additive takes bytes and returns bytes)
            # We pass the processed bytes. The function returns NEW bytes.
            encoded_bytes = encode_additive(handler, processed_media_bytes, transfer_payload, transfer_key, transfer_metadata)
            
            # 6. Save Encoded File
            filename = f"{uuid.uuid4()}_{file.filename}"
            if content_type == 'image/png' and not filename.endswith('.png'):
                filename += '.png'
            elif content_type == 'audio/wav' and not filename.endswith('.wav'):
                filename += '.wav'
                
            filepath = os.path.join(UPLOAD_DIR, filename)
            
            with open(filepath, "wb") as buffer:
                buffer.write(encoded_bytes)

            # 7. Create Message Record
            new_message = Message(
                sender_id=current_user.id,
                recipient_id=recipient.id,
                filename=file.filename,
                filepath=filename
            )
            db.add(new_message)
            successful_sends.append(target_email)
            
        db.commit() # Commit all messages

        if not successful_sends:
            # If all failed, return error
            msg = f"Failed to send. {', '.join(failed_sends)}"
            raise HTTPException(status_code=400, detail=msg)

        msg = f"Sent to {len(successful_sends)} recipients."
        if failed_sends:
            msg += f" (Failed: {', '.join(failed_sends)})"
            
        return {"message": msg}

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")

@app.get("/api/inbox")
async def api_inbox(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    messages = db.query(Message).filter(Message.recipient_id == current_user.id).order_by(Message.timestamp.desc()).all()
    
    result = []
    for msg in messages:
        result.append({
            "id": msg.id,
            "sender_email": msg.sender.email,
            "sender_name": f"{msg.sender.first_name} {msg.sender.last_name}",
            "filename": msg.filename,
            "stored_filename": msg.filepath,
            "timestamp": msg.timestamp.isoformat(),
            "is_read": msg.is_read
        })
    return result

@app.post("/api/inbox/{message_id}/read")
async def api_mark_read(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(Message).filter(Message.id == message_id, Message.recipient_id == current_user.id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    msg.is_read = True
    db.commit()
    return {"status": "success"}

@app.delete("/api/inbox/{message_id}")
async def api_delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(Message).filter(Message.id == message_id, Message.recipient_id == current_user.id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Optional: Delete the actual file if we want to save space
    if msg.filepath:
        try:
            full_path = os.path.join(UPLOAD_DIR, msg.filepath)
            if os.path.exists(full_path):
                os.remove(full_path)
        except Exception as e:
            print(f"Error deleting file {msg.filepath}: {e}")
            
    db.delete(msg)
    db.commit()
    return {"status": "success", "message": "Message deleted"}
