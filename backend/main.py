import pymysql
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_connection
from datetime import datetime, date
from fastapi.encoders import jsonable_encoder
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class RegisterRequest(BaseModel):
    user_id: str
    name: str
    descriptor: list[float]

class AttendanceRequest(BaseModel):
    user_id: str
    emotion: str

def init_db():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(100),
            descriptor JSON
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(50),
            date DATE,
            time TIME,
            emotion VARCHAR(20),
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    """)
    conn.close()

init_db()

@app.get("/")
def read_root():
    return {"message": "Smart Attendance Backend is Running!"}

@app.post("/register")
def register(req: RegisterRequest):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (user_id, name, descriptor) VALUES (%s, %s, %s) "
        "ON DUPLICATE KEY UPDATE name=%s, descriptor=%s",
        (req.user_id, req.name, str(req.descriptor), req.name, str(req.descriptor))
    )
    conn.close()
    return {"status": "ok"}

@app.post("/attendance")
def mark_attendance(req: AttendanceRequest):
    conn = get_connection()
    cur = conn.cursor()
    today = date.today()
    
    cur.execute(
        "SELECT id FROM attendance WHERE user_id=%s AND date=%s",
        (req.user_id, today)
    )
    if cur.fetchone():
        conn.close()
        return {"status": "already_marked"}

    now = datetime.now().time()
    cur.execute(
        "INSERT INTO attendance (user_id, date, time, emotion) VALUES (%s, %s, %s, %s)",
        (req.user_id, today, now, req.emotion)
    )
    conn.close()
    return {"status": "marked"}

@app.delete("/users/{user_id}")
def delete_user(user_id: str):
    conn = get_connection()
    cur = conn.cursor()
    try:
        # আগে হাজিরার রেকর্ড ডিলিট করতে হবে (Foreign Key Constraint এর কারণে)
        cur.execute("DELETE FROM attendance WHERE user_id = %s", (user_id,))
        # এরপর ইউজারের ডেটা ডিলিট করবে
        cur.execute("DELETE FROM users WHERE user_id = %s", (user_id,))
        return {"status": "success", "message": "User deleted"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()

class UserUpdateRequest(BaseModel):
    name: str

@app.put("/users/{user_id}")
def update_user(user_id: str, req: UserUpdateRequest):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE users SET name = %s WHERE user_id = %s", (req.name, user_id))
    conn.close()
    return {"status": "success", "message": "User updated"}


@app.get("/attendance/today")
def today_attendance():
    conn = get_connection()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    # সরাসরি SQL দিয়ে সময় ফরম্যাট করা হচ্ছে
    cur.execute("""
        SELECT u.name, a.user_id, TIME_FORMAT(a.time, '%h:%i %p') AS time, a.emotion
        FROM attendance a JOIN users u ON a.user_id = u.user_id
        WHERE a.date = CURDATE()
        ORDER BY a.time DESC
    """)
    rows = cur.fetchall()
    conn.close()
    return rows

@app.get("/users")
def get_users():
    conn = get_connection()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT user_id, name, descriptor FROM users")
    rows = cur.fetchall()
    conn.close()
    
    for row in rows:
        if isinstance(row['descriptor'], str):
            row['descriptor'] = json.loads(row['descriptor'])
    return rows

@app.delete("/attendance/{attendance_id}")
def delete_attendance(attendance_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM attendance WHERE id = %s", (attendance_id,))
    conn.close()
    return {"status": "success"}

@app.get("/attendance/history/{user_id}")
def get_user_history(user_id: str):
    conn = get_connection()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("""
        SELECT a.id, a.date, TIME_FORMAT(a.time, '%%h:%%i %%p') AS time, a.emotion, u.name
        FROM attendance a JOIN users u ON a.user_id = u.user_id
        WHERE a.user_id = %s
        ORDER BY a.date DESC, a.time DESC
    """, (user_id,))
    
    rows = cur.fetchall()
    conn.close()

    result = []
    for row in rows:
        date_val = row.get('date')
        date_str = date_val.strftime('%Y-%m-%d') if hasattr(date_val, 'strftime') else str(date_val)

        result.append({
            "name": row.get('name', 'Unknown'),
            "date": date_str,
            "time": str(row.get('time', '')),
            "emotion": str(row.get('emotion', ''))
        })
        
    return result
