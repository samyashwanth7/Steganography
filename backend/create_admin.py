from sqlalchemy.orm import Session
from database import SessionLocal, engine
from models import User
from auth import get_password_hash

def create_admin():
    db = SessionLocal()
    try:
        # Check if admin exists
        admin_email = "admin@steganography.com"
        existing_admin = db.query(User).filter(User.email == admin_email).first()
        
        if existing_admin:
            print(f"Admin user {admin_email} already exists.")
            return

        # Create admin
        admin_user = User(
            email=admin_email,
            first_name="System",
            last_name="Admin",
            hashed_password=get_password_hash("admin123"),
            is_admin=True
        )
        
        db.add(admin_user)
        db.commit()
        print(f"Admin user created successfully.\nEmail: {admin_email}\nPassword: admin123")
        
    except Exception as e:
        print(f"Error creating admin: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    create_admin()
