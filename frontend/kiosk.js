const API_BASE = 'https://smart-attendance-backend-wv9v.onrender.com';
const MODEL_URL = '/models'; 

let faceMatcher = null;
const labeledDescriptors = [];
let recentlyGreeted = {}; 
let isProcessing = false; 
let holdUI = false; // UI লক করার জন্য
let blinkTimer = null;

// ১. মডেল লোড
async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
}

// ২. ভিডিও চালু
async function startVideo() {
    const video = document.getElementById('video');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    return new Promise(resolve => video.addEventListener('playing', () => resolve(video)));
}

// ৩. ডেটাবেজ থেকে ইউজার লোড
async function loadRegisteredUsers() {
    try {
        const res = await fetch(`${API_BASE}/users`);
        const users = await res.json();
        users.forEach(user => {
            const descriptor = new Float32Array(user.descriptor);
            labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(`${user.user_id}|${user.name}`, [descriptor]));
        });
        if (labeledDescriptors.length > 0) faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
    } catch (err) { console.error("Error loading users:", err); }
}

// ৪. EAR হিসাব
function calculateEAR(eye) {
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (v1 + v2) / (2.0 * h);
}

// ৫. অডিও প্লে
function speakGreeting(name, emotion) {
    window.speechSynthesis.cancel(); 
    
    const hour = new Date().getHours();
    let timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    let emotionMessage = "";
    if (emotion === 'happy') emotionMessage = "You look happy today.";
    else if (emotion === 'sad') emotionMessage = "You seem a bit sad. Keep your head up!";
    else if (emotion === 'angry') emotionMessage = "Take a deep breath. Have a calm day!";
    else emotionMessage = "Have a great day!";

    const msg = new SpeechSynthesisUtterance(`${timeGreeting}, ${name}. ${emotionMessage}`);
    msg.lang = 'en-US';
    msg.rate = 0.9; // কথা বলার গতি একটু কমানো হলো
    window.speechSynthesis.speak(msg);
}

// ৬. মূল রিকগনিশন লজিক
async function processFrame() {
    // যদি UI লক থাকে বা আগের ফ্রেম প্রসেসিং চলতে থাকে, তবে কিছু করবে না
    if (isProcessing || holdUI) return; 
    
    const video = document.getElementById('video');
    const wrapper = document.getElementById('videoWrapper');
    const statusEl = document.getElementById('status');
    
    try {
        isProcessing = true;

        const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor()
            .withFaceExpressions();

        // যদি মুখ না পাওয়া যায়
        if (!detection) {
            wrapper.className = "video-wrapper scanning";
            statusEl.textContent = '🔍 Looking for face...';
            statusEl.style.color = 'white';
            isProcessing = false;
            return;
        }

        // চোখের পলক ডিটেকশন
        const avgEAR = (calculateEAR(detection.landmarks.getLeftEye()) + calculateEAR(detection.landmarks.getRightEye())) / 2.0;
        
        if (avgEAR < 0.25) { 
            wrapper.className = "video-wrapper detected"; 
            statusEl.textContent = '👁️ Face Detected! Please blink your eyes.';
            statusEl.style.color = '#f59e0b'; 
            isProcessing = false;
            return;
        }

        // ফেস ম্যাচিং
        const emotion = Object.keys(detection.expressions).reduce((a, b) => detection.expressions[a] > detection.expressions[b] ? a : b);
        let userInfo = null;
        
        if (faceMatcher) {
            const match = faceMatcher.findBestMatch(detection.descriptor);
            if (match.label !== 'unknown') {
                const [id, name] = match.label.split('|');
                userInfo = { id, name, emotion };
            }
        }

        // ইউজার পাওয়া গেলে
        if (userInfo) {
            holdUI = true; // UI লক করে দিলাম যাতে ফ্লিকার না করে
            wrapper.className = "video-wrapper recognized"; 
            const { id, name, emotion } = userInfo;
            
            statusEl.textContent = `👋 Welcome ${name}! (Emotion: ${emotion})`;
            statusEl.style.color = '#22c55e';

            const now = Date.now();
            if (!recentlyGreeted[id] || now - recentlyGreeted[id] > 60000) {
                recentlyGreeted[id] = now;
                await fetch(`${API_BASE}/attendance`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: id, emotion: emotion })
                });
                speakGreeting(name, emotion);
            }

            // ৪ সেকেন্ড পর UI আনলক হবে
            setTimeout(() => {
                wrapper.className = "video-wrapper scanning";
                statusEl.textContent = '👀 Look at the camera...';
                statusEl.style.color = 'white';
                holdUI = false; // UI আনলক
            }, 4000);

        } else {
            wrapper.className = "video-wrapper detected"; 
            statusEl.textContent = '❓ Unknown Person. Please register.';
            statusEl.style.color = '#ef4444';
        }
    } catch (error) {
        console.error("Processing error:", error);
    } finally {
        isProcessing = false; 
    }
}

// ৭. স্ক্যান লুপ
async function scanLoop() {
    await processFrame();
    setTimeout(scanLoop, 300); 
}

// ৮. Initialize
async function startSystem() {
    const overlay = document.getElementById('startOverlay');
    if(overlay) overlay.style.display = 'none'; // ওভারলে সরিয়ে দিলাম

    try {
        document.getElementById('status').textContent = '⏳ Loading AI Models...';
        await loadModels();
        
        document.getElementById('status').textContent = '☁️ Connecting to Server...';
        await loadRegisteredUsers(); 
        
        document.getElementById('status').textContent = '📷 Starting Camera...';
        await startVideo();
        
        document.getElementById('videoWrapper').className = "video-wrapper scanning";
        document.getElementById('status').textContent = '👀 Look at the camera...';

        // ওভারলে ক্লিক করলে একটি ডামি অডিও বাজাবো, যাতে ব্রাউজার অডিও পারমিশন লক খুলে দেয়
        const unlockMsg = new SpeechSynthesisUtterance("System started.");
        window.speechSynthesis.speak(unlockMsg);

        scanLoop(); 
    } catch (error) {
        document.getElementById('status').textContent = '❌ Error: ' + error.message;
    }
}

// ৯. ওভারলে ক্লিক করলেই সিস্টেম চালু হবে
document.getElementById('startOverlay').addEventListener('click', startSystem);
