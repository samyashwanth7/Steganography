import re
import os

filepath = r"c:\Users\sampa\OneDrive\文档\vs code programs\Steganography\backend\main.py"
with open(filepath, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Truncate everything after '/api/save-to-library'
if '@app.post("/api/save-to-library")' in text:
    text = text.split('@app.post("/api/save-to-library")')[0]

# 2. Remove specific DB and Auth imports
removals = [
    "from sqlalchemy.orm import Session",
    "from database import SessionLocal, engine, Base",
    "from models import EncodedImage, User, Message",
    "from auth import get_current_user, get_current_user_optional, create_access_token, get_password_hash, verify_password, ACCESS_TOKEN_EXPIRE_MINUTES",
    "from fastapi.security import OAuth2PasswordRequestForm",
    "import uuid"
]
for req in removals:
    text = text.replace(req + "\n", "")

# 3. Remove DB setup
db_setup = """# Create tables
Base.metadata.create_all(bind=engine)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()"""
text = text.replace(db_setup, "")

# 4. Remove User/Token Pydantic models
user_models = """class UserCreate(BaseModel):
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
    token_type: str"""
text = text.replace(user_models, "")

# 5. Fix '/api/encode-text' endpoint signature
text = re.sub(
    r"""@app\.post\("/api/encode-text"\)\s*async def api_encode_text\(\s*cover_media: UploadFile = File\(\.\.\.\), \s*message: str = Form\(\.\.\.\), \s*key: str = Form\(\.\.\.\),\s*current_user: User = Depends\(get_current_user\)\s*\):""",
    """@app.post("/api/encode-text")
async def api_encode_text(
    cover_media: UploadFile = File(...), 
    message: str = Form(...), 
    key: str = Form(...)
):""",
    text
)

# Fix '/api/encode-text' body
text = re.sub(
    r"""creator_info = \{\s*'creator_id': current_user.id,\s*'creator_email': current_user.email,\s*'creator_name': f"\{current_user.first_name\} \{current_user.last_name\}"\s*\}\s*encoded_bytes = encode_additive\(handler, media_bytes, payload_bytes, key, creator_info\)""",
    """encoded_bytes = encode_additive(handler, media_bytes, payload_bytes, key, None)""",
    text
)

# 6. Fix '/api/encode-file' endpoint signature
text = re.sub(
    r"""@app\.post\("/api/encode-file"\)\s*async def api_encode_file\(\s*cover_media: UploadFile = File\(\.\.\.\), \s*secret_file: UploadFile = File\(\.\.\.\), \s*key: str = Form\(\.\.\.\),\s*current_user: User \| None = Depends\(get_current_user_optional\)\s*\):""",
    """@app.post("/api/encode-file")
async def api_encode_file(
    cover_media: UploadFile = File(...), 
    secret_file: UploadFile = File(...), 
    key: str = Form(...)
):""",
    text
)

# Fix '/api/encode-file' body
text = re.sub(
    r"""creator_info = None\s*if current_user:\s*creator_info = \{\s*'creator_id': current_user.id,\s*'creator_email': current_user.email,\s*'creator_name': f"\{current_user.first_name\} \{current_user.last_name\}"\s*\}\s*encoded_bytes = encode_additive\(handler, media_bytes, payload, key, creator_info\)""",
    """encoded_bytes = encode_additive(handler, media_bytes, payload, key, None)""",
    text
)

# Cleanup extra newlines
text = re.sub(r'\n{3,}', '\n\n', text)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(text)
print("main.py cleaned successfully!")
