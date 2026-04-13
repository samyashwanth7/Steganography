from sqlalchemy import create_engine, text
import os

DATABASE_URL = "sqlite:///./steganography.db"

def add_admin_column():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0"))
            print("Successfully added is_admin column to users table.")
        except Exception as e:
            print(f"Error (column might already exist): {e}")

if __name__ == "__main__":
    add_admin_column()
