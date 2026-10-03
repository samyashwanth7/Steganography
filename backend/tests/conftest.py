import os
os.environ["MANIFEST_KEY"] = "test-manifest-key"
os.environ["RATELIMIT_ENABLED"] = "0"

try:
    import pytest
    fixture = pytest.fixture
except Exception:
    def fixture(fn):
        return fn

from starlette.testclient import TestClient
import main

@fixture
def client():
    return TestClient(main.app)
