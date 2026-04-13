from database import engine, SessionLocal
from sqlalchemy import text

def migrate():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN profile_image VARCHAR"))
            conn.commit()
            print("Migration successful: Added profile_image column.")
        except Exception as e:
            print(f"Migration failed (might already exist): {e}")

if __name__ == "__main__":
    migrate()
