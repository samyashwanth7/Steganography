import sys
import os
import io
import uuid
from PIL import Image
import numpy as np

# Mocking the environment before importing main
os.environ["MANIFEST_KEY"] = "a7e1f5d2-a8b3-4c9f-8d7e-2c5b6a1d4f8e"

try:
    from main import encode_additive, decode_additive, ImageHandler, MANIFEST_KEY
except ImportError:
    # If running from root, adjust path
    sys.path.append(os.path.join(os.getcwd(), 'backend'))
    from main import encode_additive, decode_additive, ImageHandler, MANIFEST_KEY

def create_test_image():
    # Create a 100x100 random noise image (PNG)
    arr = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()

def test_flow():
    print("--- Starting Steganography Flow Test ---")
    
    # 1. Create Image
    original_bytes = create_test_image()
    print(f"Original size: {len(original_bytes)}")
    
    handler = ImageHandler()
    
    # 2. Encode
    payload = b"SECRET_DATA"
    key = str(uuid.uuid4())
    metadata = {
        "receiver_email": "test@example.com",
        "creator_email": "sender@example.com"
    }
    
    try:
        print("Encoding...")
        encoded_bytes = encode_additive(handler, original_bytes, payload, key, metadata)
        print(f"Encoded size: {len(encoded_bytes)}")
    except Exception as e:
        print(f"FAILED TO ENCODE: {e}")
        return

    # 3. Decode (Manifest Only)
    try:
        print("Decoding Manifest...")
        manifest, _ = decode_additive(handler, encoded_bytes, MANIFEST_KEY, manifest_only=True)
        
        if not manifest:
            print("FAILED: No manifest found.")
        else:
            print(f"SUCCESS: Manifest found: {manifest}")
            entry = manifest[0]
            if entry.get('receiver_email') == "test@example.com":
                print("SUCCESS: Receiver email matches.")
            else:
                print(f"FAILURE: Receiver email mismatch. Got: {entry.get('receiver_email')}")
            
    except Exception as e:
        print(f"FAILED TO DECODE: {e}")

if __name__ == "__main__":
    test_flow()
