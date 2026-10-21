import pymysql
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_connection
from datetime import datetime, date, timedelta
import json

app = FastAPI()

# CORS — যাতে আপনার Vercel/Netlify ফ্রন্টএন্ড ব্যাকএন্ডে ডেটা পাঠাতে পারে
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

# টেবিল তৈরি (প্রথমবার চালালে ডেটাবেজে টেবিল তৈরি হবে)
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
    
    # কুল-ডাউন: আজ ইতিমধ্যে এন্ট্রি থাকলে স্কিপ করবে
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
    cur.execute("""
        SELECT u.name, a.user_id, a.time, a.emotion
        FROM attendance a JOIN users u ON a.user_id = u.user_id
        WHERE a.date = CURDATE()
        ORDER BY a.time DESC
    """)
    rows = cur.fetchall()
    conn.close()
    
    # সময়কে ফরম্যাট করা (67691 থেকে 06:48 PM তে কনভার্ট)
    for row in rows:
        t = row['time']
        if isinstance(t, timedelta):
            total_seconds = int(t.total_seconds())
            hours = total_seconds // 3600
            minutes = (total_seconds % 3600) // 60
            ampm = "AM" if hours < 12 else "PM"
            display_hour = hours % 12
            if display_hour == 0:
                display_hour = 12
            row['time'] = f"{display_hour:02d}:{minutes:02d} {ampm}"
        elif hasattr(t, 'strftime'):
            row['time'] = t.strftime('%I:%M %p')
            
    return rows

@app.get("/users")
def get_users():
    conn = get_connection()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT user_id, name, descriptor FROM users")
    rows = cur.fetchall()
    conn.close()
    
    # ডেসক্রিপ্টর যদি স্ট্রিং হিসেবে থাকে, তবে তাকে লিস্টে কনভার্ট করা
    for row in rows:
        if isinstance(row['descriptor'], str):
            row['descriptor'] = json.loads(row['descriptor'])
    return rows
