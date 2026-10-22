const API_BASE = 'https://smart-attendance-backend-wv9v.onrender.com';
const MODEL_URL = '/models'; 

let faceMatcher = null;
const labeledDescriptors = [];
let recentlyGreeted = {}; 
let isProcessing = false; // লক: যাতে একসাথে একাধিক স্ক্যান না হয়
let isAudioEnabled = false;

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

// ৪. EAR হিসাব (ব্লিংক ডিটেকশন)
function calculateEAR(eye) {
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (v1 + v2) / (2.0 * h);
}

// ৫. অডিও প্লে ফাংশন (আগের অডিও বন্ধ করে নতুনটা বাজাবে)
function speakGreeting(name, emotion) {
    if (!isAudioEnabled) return; // ব্রাউজার ব্লক করলে স্কিপ করবে
    
    window.speechSynthesis.cancel(); // আগের কথা বলা বন্ধ করবে
    
    const hour = new Date().getHours();
    let timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    let emotionMessage = "";
    if (emotion === 'happy') emotionMessage = "You look happy today.";
    else if (emotion === 'sad') emotionMessage = "You seem a bit sad. Keep your head up!";
    else if (emotion === 'angry') emotionMessage = "Take a deep breath. Have a calm day!";
    else emotionMessage = "Have a great day!";

    const msg = new SpeechSynthesisUtterance(`${timeGreeting}, ${name}. ${emotionMessage}`);
    msg.lang = 'en-US';
    window.speechSynthesis.speak(msg);
}

// ৬. মূল রিকগনিশন লজিক
async function processFrame() {
    if (isProcessing) return; // যদি আগের ফ্রেম প্রসেসিং চলতে থাকে, তবে অপেক্ষা করবে
    
    const video = document.getElementById('video');
    const wrapper = document.getElementById('videoWrapper');
    const statusEl = document.getElementById('status');
    
    try {
        isProcessing = true; // লক করা হলো

        // TinyFaceDetector এর সাইজ ছোট করে দিলাম (inputSize: 160) যাতে সুপারফাস্ট হয়
        const detection = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor()
            .withFaceExpressions();

        if (!detection) {
            wrapper.className = "video-wrapper scanning";
            statusEl.textContent = '🔍 Looking for face...';
            statusEl.style.color = 'white';
            isProcessing = false;
            return;
        }

        // EAR মাপা
        const avgEAR = (calculateEAR(detection.landmarks.getLeftEye()) + calculateEAR(detection.landmarks.getRightEye())) / 2.0;
        
        if (avgEAR < 0.25) { // ব্লিংকের থ্রেশহোল্ড একটু বাড়িয়ে দিলাম
            wrapper.className = "video-wrapper detected"; 
            statusEl.textContent = '👁️ Face Detected! Please blink your eyes.';
            statusEl.style.color = '#f59e0b'; 
            isProcessing = false;
            return;
        }

        // যদি চোখ খোলা থাকে, তবে ম্যাচিং করব
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

            // ৪ সেকেন্ড পর আবার স্ক্যানিং শুরু হবে
            setTimeout(() => {
                wrapper.className = "video-wrapper scanning";
                statusEl.textContent = '👀 Look at the camera...';
                statusEl.style.color = 'white';
            }, 4000);

        } else {
            wrapper.className = "video-wrapper detected"; 
            statusEl.textContent = '❓ Unknown Person. Please register.';
            statusEl.style.color = '#ef4444';
        }
    } catch (error) {
        console.error("Processing error:", error);
    } finally {
        isProcessing = false; // কাজ শেষ, লক খুলে দিলাম
    }
}

// ৭. অটো-লুপ (setInterval এর বদলে setTimeout ব্যবহার করা হলো যাতে ওভারল্যাপ না হয়)
async function scanLoop() {
    await processFrame();
    // আগের ফ্রেম শেষ হয়ে গেলে ৩০০ মিলিসেকেন্ড পর আবার স্ক্যান করবে
    setTimeout(scanLoop, 300); 
}

// ৮. Initialize
async function init() {
    try {
        document.getElementById('status').textContent = '⏳ Loading AI Models... (Please wait)';
        await loadModels();
        
        document.getElementById('status').textContent = '☁️ Connecting to Server...';
        await loadRegisteredUsers(); 
        
        document.getElementById('status').textContent = '📷 Starting Camera...';
        await startVideo();
        
        document.getElementById('videoWrapper').className = "video-wrapper scanning";
        document.getElementById('status').textContent = '👀 Look at the camera...';

        scanLoop(); // লুপ শুরু হলো
    } catch (error) {
        document.getElementById('status').textContent = '❌ Error: ' + error.message;
    }
}

// ৯. অডিও চালু করার জন্য ইউজার ইন্টারঅ্যাকশন নেওয়া
document.body.addEventListener('click', () => {
    if (!isAudioEnabled) {
        isAudioEnabled = true;
        // একটি ডামি অডিও বাজিয়ে ব্রাউজারকে পারমিশন দেওয়া
        const msg = new SpeechSynthesisUtterance("Audio enabled.");
        window.speechSynthesis.speak(msg);
    }
}, { once: true });

init();
