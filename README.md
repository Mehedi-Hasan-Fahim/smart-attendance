# Smart Attendance System with Face Recognition & Emotion Detection 🤖📸

A modern, AI-powered web-based attendance system that uses facial recognition and liveness detection (blink detection) to mark attendance in real-time. It features a user-friendly Kiosk mode for attendance marking and a secure, feature-rich Admin panel for management. The system greets users with personalized audio messages based on their detected emotion and the current time of day.

## 🚀 Live Demo
- **[Kiosk (User Interface)](https://smart-attendance-frontend-mu.vercel.app/)** - *Click anywhere on the screen to start.*
- **[Admin Panel](https://smart-attendance-frontend-mu.vercel.app/admin.html)**

## ✨ Key Features
### Kiosk Mode (User Interface)
- **Real-time Face Recognition:** Uses `face-api.js` for fast and accurate face matching directly in the browser.
- **Emotion Detection:** Detects user emotions (Happy, Sad, Neutral, Angry, etc.) using pre-trained models.
- **Liveness Detection (Anti-Spoofing):** Requires the user to blink their eyes to prevent photo spoofing.
- **Dynamic Visual Feedback:** 
  - 🔴 Red Ring: Scanning for face.
  - 🟡 Yellow Ring: Face detected, waiting for blink.
  - 🟢 Green Ring: Face recognized and attendance marked.
- **Personalized Audio Greeting:** Uses the Web Speech API to greet users dynamically (e.g., "Good morning, Fahim. You look happy today!").

### Admin Dashboard
- **Professional UI:** Clean layout with a responsive sidebar menu.
- **Analytics Dashboard:** Visualizes the daily attendance emotions using a dynamic Doughnut Chart (Chart.js).
- **Register New Users:** Register new users with their name, ID, and facial data.
- **Attendance Logs:** View daily attendance and search for specific user history by ID.
- **CSV Export:** Download the attendance logs directly as a CSV file for Excel reporting.
- **Database Management:** Update or delete user records safely.

## 🛠️ Tech Stack
**Frontend:**
- HTML5, CSS3, JavaScript (Vanilla)
- [face-api.js](https://github.com/justadudewhohacks/face-api.js) (TensorFlow.js based facial recognition & emotion detection)
- [Chart.js](https://www.chartjs.org/) (For Analytics Dashboard)
- Web Speech API (For text-to-speech audio greeting)

**Backend:**
- Python 3
- [FastAPI](https://fastapi.tiangolo.com/) (High-performance API framework)
- PyMySQL (Database connector)

**Database & Deployment:**
- [TiDB Cloud](https://tidbcloud.com/) (Serverless MySQL)
- [Render](https://render.com/) (Backend Hosting)
- [Vercel](https://vercel.com/) (Frontend Hosting)

## 📸 Screenshots

### 1. Kiosk Mode (Face Recognition & Liveness Detection)
![Kiosk Mode](assets/kiosk-screenshot.png)

### 2. Admin Analytics Portal
![Analytics Portal](assets/anatytics-portal-screenshot.png)

### 3. Register New User Portal
![Register User](assets/register-new-user-portal-screenshot.png)

### 4. Attendance Logs Portal
![Attendance Logs](assets/attendance-logs-portal-screenshot.png)

### 5.Poster
![Poster](assets/Main-SDSE-Poster.png)


## ⚙️ Architecture & Workflow
1. **Frontend (Browser):** Captures video feed via WebRTC. `face-api.js` processes the video to detect faces, landmarks (for blink detection), and emotions.
2. **Liveness Check:** Calculates the Eye Aspect Ratio (EAR) to ensure the user is a real person.
3. **Matching:** Compares the captured face descriptor with the stored descriptors fetched from the backend.
4. **Backend (FastAPI):** Receives the User ID and detected emotion. Checks if the user has already been marked present today (cooldown logic).
5. **Database (TiDB):** Stores user face encodings (as JSON arrays) and daily attendance logs.
6. **Audio Output:** If a match is found, the browser uses the Web Speech API to speak the greeting.

## 🚀 How to Run Locally

### 1. Clone the repository
```bash
git clone https://github.com/Mehedi-Hasan-Fahim/smart-attendance.git
cd smart-attendance
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
# Activate virtual environment
# Windows: venv\Scripts\activate
# Mac/Linux: source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file in the `backend` folder and add your database credentials:
```env
TIDB_HOST="your_tidb_host"
TIDB_PORT="4000"
TIDB_USER="your_tidb_user"
TIDB_PASSWORD="your_tidb_password"
```

Run the FastAPI server:
```bash
uvicorn main:app --reload
```

### 3. Frontend Setup
You can use any local server to run the frontend (e.g., Live Server in VS Code).
```bash
cd frontend
# Open index.html (Kiosk) or admin.html (Admin Panel) using Live Server
```
---
## 👨‍💻 Author
*Developed with the assistance of:*

![DeepSeek Logo](https://github.com/deepseek-ai/DeepSeek-V2/blob/main/figures/logo.svg?raw=true)
<br>
**Prompter**
GitHub: [@Mehedi-Hasan-Fahim](https://github.com/Mehedi-Hasan-Fahim)
---
