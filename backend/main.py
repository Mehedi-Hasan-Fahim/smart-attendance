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

@app.get("/attendance/history/{user_id}")
def get_user_history(user_id: str):
    conn = get_connection()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    
    try:
        cur.execute("""
            SELECT a.date, TIME_FORMAT(a.time, '%h:%i %p') AS time, a.emotion, u.name
            FROM attendance a JOIN users u ON a.user_id = u.user_id
            WHERE a.user_id = %s
            ORDER BY a.date DESC, a.time DESC
        """, (user_id,))
        rows = cur.fetchall()
    except Exception as e:
        print(f"Database Error: {e}")
        return {"error": "Database connection failed"}
    finally:
        conn.close()

    result = []
    for row in rows:
        # ডেটকে ম্যানুয়ালি স্ট্রিং-এ কনভার্ট করা হচ্ছে
        d = row['date']
        if d is not None:
            d_str = d.strftime('%Y-%m-%d') if hasattr(d, 'strftime') else str(d)
        else:
            d_str = ""

        result.append({
            "name": str(row['name']),
            "date": d_str,
            "time": str(row['time']),
            "emotion": str(row['emotion'])
        })
        
    return result
