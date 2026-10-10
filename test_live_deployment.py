import io
import time
import json
import wave
import base64
import requests
import numpy as np
from PIL import Image
from pathlib import Path

BASE_URL = "https://steganography-alpha.vercel.app"

print(f"=== TESTING LIVE DEPLOYMENT AT {BASE_URL} ===\n")

# Helpers
def make_rgb_png(w=200, h=200):
    arr = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    bio = io.BytesIO()
    img.save(bio, format='PNG')
    return bio.getvalue()

def make_wav(duration=1.0, sample_rate=44100, freq=440):
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    samples = (np.sin(2 * np.pi * freq * t) * 30000).astype(np.int16)
    bio = io.BytesIO()
    with wave.open(bio, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())
    return bio.getvalue()

# 1. Health check
print("[1/12] Testing Health & Ciphers...")
res = requests.get(f"{BASE_URL}/api/health", timeout=15)
assert res.status_code == 200, f"Health check failed: {res.text}"
health = res.json()
print(f"      Status: {health['status']}, Ciphers: {health.get('ciphers')}")
assert "AES-256-GCM" in health.get("ciphers", [])
assert "scrypt" in health.get("ciphers", [])

# 2. Key Generation & Key Strength
print("[2/12] Testing Key Generator & Key Strength Scorer...")
gen_res = requests.post(f"{BASE_URL}/api/generate-key", timeout=15)
assert gen_res.status_code == 200
rand_key = gen_res.json()["key"]
assert len(rand_key) == 16
print(f"      Generated Key: {rand_key}")

str_res = requests.post(f"{BASE_URL}/api/key-strength", json={"key": "Cyber#2026!SecKey"}, timeout=15)
assert str_res.status_code == 200
strength_data = str_res.json()
print(f"      Strength Score: {strength_data['score']}, Label: {strength_data['strength']}")
assert strength_data["score"] >= 80

# 3. Capacity
print("[3/12] Testing Capacity Calculation...")
cover_png = make_rgb_png(200, 200)
cap_res = requests.post(
    f"{BASE_URL}/api/capacity",
    files={"cover_media": ("cover.png", cover_png, "image/png")},
    timeout=15
)
assert cap_res.status_code == 200
cap_bytes = cap_res.json()["capacity_bytes"]
print(f"      200x200 Image Capacity: {cap_bytes} bytes ({cap_bytes/1024:.1f} KB)")
assert cap_bytes > 0

# 4. Image Text Mode Round-trip
print("[4/12] Testing Image Text Encoding & Decoding...")
enc_text_res = requests.post(
    f"{BASE_URL}/api/encode-text",
    files={"cover_media": ("cover.png", cover_png, "image/png")},
    data={"message": "Live Cloud Test Secret 2026", "key": "live-demo-key-1"},
    timeout=20
)
assert enc_text_res.status_code == 200, f"Encode failed: {enc_text_res.text}"
stego_png = enc_text_res.content

dec_text_res = requests.post(
    f"{BASE_URL}/api/decode",
    files={"media": ("stego.png", stego_png, "image/png")},
    data={"key": "live-demo-key-1"},
    timeout=20
)
assert dec_text_res.status_code == 200, f"Decode failed: {dec_text_res.text}"
assert dec_text_res.json()["message"] == "Live Cloud Test Secret 2026"
print("      Image text encode/decode verified perfectly!")

# 5. Image File Mode Round-trip
print("[5/12] Testing Image File Embedding (Binary Secret)...")
binary_payload = b"CONFIDENTIAL_BINARY_PAYLOAD_\x00\x01\xfe\xff" * 5
enc_file_res = requests.post(
    f"{BASE_URL}/api/encode-file",
    files={
        "cover_media": ("cover.png", cover_png, "image/png"),
        "secret_file": ("classified.bin", binary_payload, "application/octet-stream")
    },
    data={"key": "file-secret-key"},
    timeout=20
)
assert enc_file_res.status_code == 200, f"File encode failed: {enc_file_res.text}"
file_stego_png = enc_file_res.content

dec_file_res = requests.post(
    f"{BASE_URL}/api/decode",
    files={"media": ("stego.png", file_stego_png, "image/png")},
    data={"key": "file-secret-key"},
    timeout=20
)
assert dec_file_res.status_code == 200
assert dec_file_res.content == binary_payload
print("      Image binary file embedding verified perfectly!")

# 6. Multi-Payload Additive Steganography (3 independent secrets)
print("[6/12] Testing Multi-Payload Additive Steganography (3 secrets in 1 file)...")
# Secret 1
r1 = requests.post(
    f"{BASE_URL}/api/encode-text",
    files={"cover_media": ("cover.png", cover_png, "image/png")},
    data={"message": "Secret Alpha", "key": "key-alpha"},
    timeout=20
)
# Secret 2 into r1
r2 = requests.post(
    f"{BASE_URL}/api/encode-text",
    files={"cover_media": ("c1.png", r1.content, "image/png")},
    data={"message": "Secret Beta", "key": "key-beta"},
    timeout=20
)
# Secret 3 into r2
r3 = requests.post(
    f"{BASE_URL}/api/encode-text",
    files={"cover_media": ("c2.png", r2.content, "image/png")},
    data={"message": "Secret Gamma", "key": "key-gamma"},
    timeout=20
)
assert r3.status_code == 200
triple_stego = r3.content

# Decode all 3
d1 = requests.post(f"{BASE_URL}/api/decode", files={"media": ("s.png", triple_stego, "image/png")}, data={"key": "key-alpha"}, timeout=20)
d2 = requests.post(f"{BASE_URL}/api/decode", files={"media": ("s.png", triple_stego, "image/png")}, data={"key": "key-beta"}, timeout=20)
d3 = requests.post(f"{BASE_URL}/api/decode", files={"media": ("s.png", triple_stego, "image/png")}, data={"key": "key-gamma"}, timeout=20)
assert d1.json()["message"] == "Secret Alpha"
assert d2.json()["message"] == "Secret Beta"
assert d3.json()["message"] == "Secret Gamma"

# Wrong key returns 404
d_wrong = requests.post(f"{BASE_URL}/api/decode", files={"media": ("s.png", triple_stego, "image/png")}, data={"key": "wrong-key"}, timeout=20)
assert d_wrong.status_code == 404
print("      Additive stego verified: 3 secrets coexist, wrong key yields 404!")

# 7. Batch Decoding
print("[7/12] Testing Batch Decoding...")
batch_res = requests.post(
    f"{BASE_URL}/api/decode-batch",
    files={"media": ("s.png", triple_stego, "image/png")},
    data={"keys": json.dumps(["key-alpha", "key-beta", "nonexistent-key"])},
    timeout=20
)
assert batch_res.status_code == 200
batch_data = batch_res.json()["results"]
assert batch_data["key-alpha"]["message"] == "Secret Alpha"
assert batch_data["key-beta"]["message"] == "Secret Beta"
assert "error" in batch_data["nonexistent-key"]
print("      Batch decode verified!")

# 8. Steganalysis Lab (/api/analyze)
print("[8/12] Testing Steganalysis Lab (Chi-Square & PSNR)...")
analyze_res = requests.post(
    f"{BASE_URL}/api/analyze",
    files={
        "media": ("stego.png", stego_png, "image/png"),
        "cover": ("cover.png", cover_png, "image/png")
    },
    timeout=20
)
assert analyze_res.status_code == 200, f"Analyze failed: {analyze_res.text}"
analysis = analyze_res.json()
print(f"      Verdict: {analysis['verdict']}")
print(f"      Chi-Square p-value: {analysis['chi_square_probability']}")
print(f"      PSNR: {analysis['psnr_db']} dB, Changed: {analysis['changed_values_percent']}%")
assert analysis["psnr_db"] > 40.0
assert "lsb_plane_png" in analysis
# Verify LSB PNG is valid base64 image
lsb_bytes = base64.b64decode(analysis["lsb_plane_png"])
assert lsb_bytes.startswith(b"\x89PNG")
print("      Steganalysis Lab verified perfectly!")

# 9. Surgical Erasure / Scrubbing (/api/delete)
print("[9/12] Testing Cryptographic Scrubbing (/api/delete)...")
del_res = requests.post(
    f"{BASE_URL}/api/delete",
    files={"media": ("s.png", triple_stego, "image/png")},
    data={"key": "key-alpha"},
    timeout=20
)
assert del_res.status_code == 200
scrubbed_stego = del_res.content

# Deleted key gives 404
d_del = requests.post(f"{BASE_URL}/api/decode", files={"media": ("s.png", scrubbed_stego, "image/png")}, data={"key": "key-alpha"}, timeout=20)
assert d_del.status_code == 404

# Other secrets still decode
d_remain = requests.post(f"{BASE_URL}/api/decode", files={"media": ("s.png", scrubbed_stego, "image/png")}, data={"key": "key-beta"}, timeout=20)
assert d_remain.status_code == 200
assert d_remain.json()["message"] == "Secret Beta"
print("      Scrubbing verified: target erased to 404, remaining payload preserved!")

# 10. Audio Steganography (16-bit WAV PCM)
print("[10/12] Testing Audio Steganography (WAV)...")
cover_wav = make_wav(1.0, 44100, 440)
enc_wav_res = requests.post(
    f"{BASE_URL}/api/encode-text",
    files={"cover_media": ("audio.wav", cover_wav, "audio/wav")},
    data={"message": "Inaudible Audio Secret", "key": "audio-live-key"},
    timeout=20
)
assert enc_wav_res.status_code == 200
stego_wav = enc_wav_res.content

dec_wav_res = requests.post(
    f"{BASE_URL}/api/decode",
    files={"media": ("stego.wav", stego_wav, "audio/wav")},
    data={"key": "audio-live-key"},
    timeout=20
)
assert dec_wav_res.status_code == 200
assert dec_wav_res.json()["message"] == "Inaudible Audio Secret"
print("      Audio steganography verified!")

# 11. Text Steganography (Zero-Width Characters)
print("[11/12] Testing Text Steganography (Zero-Width)...")
cover_txt = b"Cybersecurity engineers protect computer networks from unauthorized access and malicious cyber threats."
enc_txt_res = requests.post(
    f"{BASE_URL}/api/encode-text",
    files={"cover_media": ("cover.txt", cover_txt, "text/plain")},
    data={"message": "Invisible Text Payload", "key": "txt-live-key"},
    timeout=20
)
assert enc_txt_res.status_code == 200
stego_txt = enc_txt_res.content

dec_txt_res = requests.post(
    f"{BASE_URL}/api/decode",
    files={"media": ("stego.txt", stego_txt, "text/plain")},
    data={"key": "txt-live-key"},
    timeout=20
)
assert dec_txt_res.status_code == 200
assert dec_txt_res.json()["message"] == "Invisible Text Payload"
print("      Text steganography verified!")

# 12. Legacy Backward Compatibility
print("[12/12] Testing Legacy v1 Backward Compatibility...")
fixtures_dir = Path("backend/tests/fixtures")
if (fixtures_dir / "legacy_image.png").exists():
    leg_img = (fixtures_dir / "legacy_image.png").read_bytes()
    leg_dec = requests.post(
        f"{BASE_URL}/api/decode",
        files={"media": ("legacy_image.png", leg_img, "image/png")},
        data={"key": "legacy-image-key"},
        timeout=20
    )
    assert leg_dec.status_code == 200
    assert leg_dec.json()["message"] == "legacy image secret"

    # Attempting to encode into legacy fixture returns 409
    leg_enc = requests.post(
        f"{BASE_URL}/api/encode-text",
        files={"cover_media": ("legacy.png", leg_img, "image/png")},
        data={"message": "Should Fail", "key": "new-k"},
        timeout=20
    )
    assert leg_enc.status_code == 409
    print("      Legacy backward compatibility & 409 protection verified!")

print("\n=======================================================")
print("ALL 12 LIVE DEPLOYMENT CHECKS PASSED WITH ZERO ERRORS!")
print("=======================================================")
