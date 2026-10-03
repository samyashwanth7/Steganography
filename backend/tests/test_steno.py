import io
import time
import json
import wave
import numpy as np
from PIL import Image
from pathlib import Path

def make_random_rgb_png(w=200, h=200) -> bytes:
    arr = np.random.randint(0, 256, (h, w, 3), dtype=np.uint8)
    img = Image.fromarray(arr, 'RGB')
    bio = io.BytesIO()
    img.save(bio, format='PNG')
    return bio.getvalue()

def make_random_rgba_png(w=200, h=200) -> bytes:
    arr = np.random.randint(0, 256, (h, w, 4), dtype=np.uint8)
    # Ensure varied alpha values
    arr[..., 3] = np.random.randint(10, 245, (h, w), dtype=np.uint8)
    img = Image.fromarray(arr, 'RGBA')
    bio = io.BytesIO()
    img.save(bio, format='PNG')
    return bio.getvalue()

def make_sine_wav(duration=1.0, sample_rate=44100, freq=440) -> bytes:
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    samples = (np.sin(2 * np.pi * freq * t) * 30000).astype(np.int16)
    bio = io.BytesIO()
    with wave.open(bio, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())
    return bio.getvalue()

def test_1_image_text_roundtrip(client):
    cover = make_random_rgb_png(200, 200)
    res = client.post(
        "/api/encode-text",
        files={"cover_media": ("cover.png", cover, "image/png")},
        data={"message": "Secret Image Message v2", "key": "test-key-1"}
    )
    assert res.status_code == 200, res.text
    encoded = res.content

    dec = client.post(
        "/api/decode",
        files={"media": ("stego.png", encoded, "image/png")},
        data={"key": "test-key-1"}
    )
    assert dec.status_code == 200, dec.text
    assert dec.json() == {"type": "text", "message": "Secret Image Message v2"}

def test_2_image_file_roundtrip(client):
    cover = make_random_rgb_png(200, 200)
    secret_bytes = b"STENO-FILE-BINARY-PAYLOAD-\x00\x01\xfe\xff" * 10
    res = client.post(
        "/api/encode-file",
        files={
            "cover_media": ("cover.png", cover, "image/png"),
            "secret_file": ("secret_doc.bin", secret_bytes, "application/octet-stream")
        },
        data={"key": "test-file-key-2"}
    )
    assert res.status_code == 200, res.text
    encoded = res.content

    dec = client.post(
        "/api/decode",
        files={"media": ("stego.png", encoded, "image/png")},
        data={"key": "test-file-key-2"}
    )
    assert dec.status_code == 200, dec.text
    assert dec.content == secret_bytes
    assert 'filename="secret_doc.bin"' in dec.headers.get("Content-Disposition", "")

def test_3_three_secrets_in_one_image(client):
    cover = make_random_rgb_png(200, 200)
    
    # 1. First secret
    r1 = client.post(
        "/api/encode-text",
        files={"cover_media": ("cover.png", cover, "image/png")},
        data={"message": "Message One", "key": "key-one"}
    )
    assert r1.status_code == 200

    # 2. Second secret
    r2 = client.post(
        "/api/encode-text",
        files={"cover_media": ("stego1.png", r1.content, "image/png")},
        data={"message": "Message Two", "key": "key-two"}
    )
    assert r2.status_code == 200

    # 3. Third secret
    r3 = client.post(
        "/api/encode-text",
        files={"cover_media": ("stego2.png", r2.content, "image/png")},
        data={"message": "Message Three", "key": "key-three"}
    )
    assert r3.status_code == 200
    final_stego = r3.content

    # All three decode
    d1 = client.post("/api/decode", files={"media": ("f.png", final_stego, "image/png")}, data={"key": "key-one"})
    assert d1.status_code == 200
    assert d1.json()["message"] == "Message One"

    d2 = client.post("/api/decode", files={"media": ("f.png", final_stego, "image/png")}, data={"key": "key-two"})
    assert d2.status_code == 200
    assert d2.json()["message"] == "Message Two"

    d3 = client.post("/api/decode", files={"media": ("f.png", final_stego, "image/png")}, data={"key": "key-three"})
    assert d3.status_code == 200
    assert d3.json()["message"] == "Message Three"

    # Wrong key -> 404
    d_bad = client.post("/api/decode", files={"media": ("f.png", final_stego, "image/png")}, data={"key": "wrong-key"})
    assert d_bad.status_code == 404

def test_4_reencode_same_key_replaces(client):
    cover = make_random_rgb_png(200, 200)
    r1 = client.post(
        "/api/encode-text",
        files={"cover_media": ("cover.png", cover, "image/png")},
        data={"message": "Initial Message", "key": "key-replace"}
    )
    assert r1.status_code == 200

    r2 = client.post(
        "/api/encode-text",
        files={"cover_media": ("stego.png", r1.content, "image/png")},
        data={"message": "Updated New Message", "key": "key-replace"}
    )
    assert r2.status_code == 200

    dec = client.post("/api/decode", files={"media": ("stego.png", r2.content, "image/png")}, data={"key": "key-replace"})
    assert dec.status_code == 200
    assert dec.json()["message"] == "Updated New Message"

def test_5_wav_roundtrip_and_sample_diff(client):
    cover = make_sine_wav(1.0, 44100, 440)
    res = client.post(
        "/api/encode-text",
        files={"cover_media": ("sine.wav", cover, "audio/wav")},
        data={"message": "Audio Secret Message", "key": "audio-key-5"}
    )
    assert res.status_code == 200, res.text
    encoded = res.content

    dec = client.post(
        "/api/decode",
        files={"media": ("stego.wav", encoded, "audio/wav")},
        data={"key": "audio-key-5"}
    )
    assert dec.status_code == 200
    assert dec.json()["message"] == "Audio Secret Message"

    # Max |sample difference| vs cover <= 1
    with wave.open(io.BytesIO(cover), 'rb') as wf:
        cover_samples = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
    with wave.open(io.BytesIO(encoded), 'rb') as wf:
        encoded_samples = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)

    diff = np.max(np.abs(encoded_samples.astype(int) - cover_samples.astype(int)))
    assert diff <= 1, f"Max sample difference exceeded 1: {diff}"

def test_6_text_roundtrip_and_distribution(client):
    cover_text = b"Steganography is the practice of concealing a secret message within another ordinary file. This technique has a long and fascinating history."
    res = client.post(
        "/api/encode-text",
        files={"cover_media": ("carrier.txt", cover_text, "text/plain")},
        data={"message": "Hidden Text Info", "key": "text-key-6"}
    )
    assert res.status_code == 200, res.text
    encoded = res.content
    encoded_str = encoded.decode('utf-8')

    dec = client.post(
        "/api/decode",
        files={"media": ("stego.txt", encoded, "text/plain")},
        data={"key": "text-key-6"}
    )
    assert dec.status_code == 200
    assert dec.json()["message"] == "Hidden Text Info"

    zwcs = [c for c in encoded_str if c in ('\u200c', '\u200d')]
    # ZWC count check
    assert len(zwcs) < 1000 + 8192 + 512

    # Check ZWCs are not all at the end
    clean = "".join(c for c in encoded_str if c not in ('\u200c', '\u200d'))
    last_word = clean.split()[-1]
    assert not encoded_str.endswith("".join(zwcs)), "ZWCs must not all be placed at the end"

def test_7_delete_secret(client):
    cover = make_random_rgb_png(200, 200)
    r1 = client.post(
        "/api/encode-text",
        files={"cover_media": ("cover.png", cover, "image/png")},
        data={"message": "First Secret", "key": "k-delete-1"}
    )
    r2 = client.post(
        "/api/encode-text",
        files={"cover_media": ("stego.png", r1.content, "image/png")},
        data={"message": "Second Secret", "key": "k-keep-2"}
    )
    assert r2.status_code == 200

    # Delete first secret
    del_res = client.post(
        "/api/delete",
        files={"media": ("stego.png", r2.content, "image/png")},
        data={"key": "k-delete-1"}
    )
    assert del_res.status_code == 200
    cleaned = del_res.content

    # Deleted key returns 404
    d1 = client.post("/api/decode", files={"media": ("c.png", cleaned, "image/png")}, data={"key": "k-delete-1"})
    assert d1.status_code == 404

    # Retained key still decodes
    d2 = client.post("/api/decode", files={"media": ("c.png", cleaned, "image/png")}, data={"key": "k-keep-2"})
    assert d2.status_code == 200
    assert d2.json()["message"] == "Second Secret"

def test_8_legacy_fixtures_decode(client):
    fixtures_dir = Path(__file__).parent / "fixtures"
    
    # 1. Legacy Image
    img_bytes = (fixtures_dir / "legacy_image.png").read_bytes()
    d_img = client.post("/api/decode", files={"media": ("legacy_image.png", img_bytes, "image/png")}, data={"key": "legacy-image-key"})
    assert d_img.status_code == 200, d_img.text
    assert d_img.json()["message"] == "legacy image secret"

    # 2. Legacy Audio
    aud_bytes = (fixtures_dir / "legacy_audio.wav").read_bytes()
    d_aud = client.post("/api/decode", files={"media": ("legacy_audio.wav", aud_bytes, "audio/wav")}, data={"key": "legacy-audio-key"})
    assert d_aud.status_code == 200, d_aud.text
    assert d_aud.json()["message"] == "legacy audio secret"

    # 3. Legacy Text
    txt_bytes = (fixtures_dir / "legacy_text.txt").read_bytes()
    d_txt = client.post("/api/decode", files={"media": ("legacy_text.txt", txt_bytes, "text/plain")}, data={"key": "legacy-text-key"})
    assert d_txt.status_code == 200, d_txt.text
    assert d_txt.json()["message"] == "legacy text secret"

def test_9_encoding_into_legacy_fixture_409(client):
    fixtures_dir = Path(__file__).parent / "fixtures"
    img_bytes = (fixtures_dir / "legacy_image.png").read_bytes()
    res = client.post(
        "/api/encode-text",
        files={"cover_media": ("legacy.png", img_bytes, "image/png")},
        data={"message": "Try New Secret", "key": "new-key"}
    )
    assert res.status_code == 409
    assert "older STENO version" in res.json().get("detail", "")

def test_10_rgba_alpha_byte_identical(client):
    cover_rgba = make_random_rgba_png(200, 200)
    res = client.post(
        "/api/encode-text",
        files={"cover_media": ("rgba.png", cover_rgba, "image/png")},
        data={"message": "RGBA Alpha Preservation Secret", "key": "rgba-key-10"}
    )
    assert res.status_code == 200
    encoded_rgba = res.content

    orig_arr = np.array(Image.open(io.BytesIO(cover_rgba)))
    enc_arr = np.array(Image.open(io.BytesIO(encoded_rgba)))

    assert np.array_equal(orig_arr[..., 3], enc_arr[..., 3]), "Alpha channel must be byte-identical"

def test_11_decode_batch(client):
    cover = make_random_rgb_png(200, 200)
    r1 = client.post(
        "/api/encode-text",
        files={"cover_media": ("cover.png", cover, "image/png")},
        data={"message": "Batch Message 1", "key": "k1"}
    )
    r2 = client.post(
        "/api/encode-text",
        files={"cover_media": ("stego.png", r1.content, "image/png")},
        data={"message": "Batch Message 2", "key": "k2"}
    )
    assert r2.status_code == 200

    # Decode batch with JSON array string
    res = client.post(
        "/api/decode-batch",
        files={"media": ("stego.png", r2.content, "image/png")},
        data={"keys": json.dumps(["k1", "k2", "nonexistent"])}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["results"]["k1"]["message"] == "Batch Message 1"
    assert body["results"]["k2"]["message"] == "Batch Message 2"
    assert "error" in body["results"]["nonexistent"]

def test_13_capacity_positive(client):
    cover = make_random_rgb_png(200, 200)
    res = client.post("/api/capacity", files={"cover_media": ("c.png", cover, "image/png")})
    assert res.status_code == 200
    assert res.json()["capacity_bytes"] > 0

def test_14_smoke_1000x1000_speed(client):
    cover = make_random_rgb_png(1000, 1000)
    t0 = time.time()
    res = client.post(
        "/api/encode-text",
        files={"cover_media": ("large.png", cover, "image/png")},
        data={"message": "Fast 1000x1000 encode test", "key": "speed-key"}
    )
    elapsed = time.time() - t0
    assert res.status_code == 200
    assert elapsed < 5.0, f"Encoding 1000x1000 took {elapsed:.2f}s (must be < 5s)"
