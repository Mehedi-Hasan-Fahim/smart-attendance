const API_BASE = 'https://smart-attendance-backend-wv9v.onrender.com';
const MODEL_URL = '/models'; 

let faceMatcher = null;
const labeledDescriptors = [];
let recentlyGreeted = {}; 
let isEyeClosed = false;
let livenessPassed = false; // চোখের পলক সফল হয়েছে কি না

async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
}

async function startVideo() {
    const video = document.getElementById('video');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    return new Promise(resolve => video.addEventListener('playing', () => resolve(video)));
}

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


async function logAttendance(userId, emotion) {
    const res = await fetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, emotion: emotion })
    });
    return res.json();
}


// EAR হিসাব করার ফাংশন
function calculateEAR(eye) {
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (v1 + v2) / (2.0 * h);
}

function speakGreeting(name, emotion) {
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


async function recognizeFace() {
    const video = document.getElementById('video');
    const wrapper = document.getElementById('videoWrapper');
    const statusEl = document.getElementById('status');
    
    const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();

    if (!detection) {
        wrapper.className = "video-wrapper scanning";
        statusEl.textContent = '🔍 Looking for face...';
        statusEl.style.color = 'white';
        isEyeClosed = false; 
        livenessPassed = false; 
        return;
    }

    // EAR মাপা
    const leftEAR = calculateEAR(detection.landmarks.getLeftEye());
    const rightEAR = calculateEAR(detection.landmarks.getRightEye());
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // ব্লিংক ডিটেকশন (থ্রেশহোল্ড বাড়িয়ে ০.২৪ করা হলো)
    if (avgEAR < 0.24) {
        isEyeClosed = true;
    } else if (avgEAR > 0.28 && isEyeClosed) {
        isEyeClosed = false;
        livenessPassed = true; 
    }

    if (!livenessPassed) {
        wrapper.className = "video-wrapper detected"; 
        statusEl.textContent = '👁️ Face Detected! Please blink your eyes.';
        statusEl.style.color = '#f59e0b'; 
        return;
    }

    const emotion = Object.keys(detection.expressions).reduce((a, b) => detection.expressions[a] > detection.expressions[b] ? a : b);
    let userInfo = null;
    
    if (faceMatcher) {
        const match = faceMatcher.findBestMatch(detection.descriptor);
        if (match.label !== 'unknown') {
            const [id, name] = match.label.split('|');
            userInfo = { id, name, emotion };
        }
    }

    if (userInfo) {
        wrapper.className = "video-wrapper recognized"; // Green ring
        const { id, name, emotion } = userInfo;
        
        // টেক্সট সাথে সাথে আপডেট হবে
        statusEl.textContent = `👋 Welcome ${name}!`;
        statusEl.style.color = '#22c55e';

        const now = Date.now();
        // যদি এই ৬০ সেকেন্ডে তাকে গ্রিটিং না করা হয়ে থাকে
        if (!recentlyGreeted[id] || now - recentlyGreeted[id] > 60000) {
            recentlyGreeted[id] = now;
            await logAttendance(id, emotion);
            speakGreeting(name, emotion);
        }

        // ৪ সেকেন্ড পর স্ক্রিন আবার রিসেট হবে
        setTimeout(() => {
            livenessPassed = false;
            isEyeClosed = false;
            wrapper.className = "video-wrapper scanning";
            statusEl.textContent = '👀 Look at the camera...';
            statusEl.style.color = 'white';
        }, 4000);

        return; // রিটার্ন করে দিলাম যাতে লুপে বারবার টেক্সট চেঞ্জ না হয়
    } else {
        wrapper.className = "video-wrapper detected"; 
        statusEl.textContent = '❓ Unknown Person. Please register first.';
        statusEl.style.color = '#ef4444';
    }
}

// init ফাংশনে setInterval এর গতি বাড়ানো হলো (৬০০ মিলিসেকেন্ড)
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

        // আগে ৮০০ ছিল, এখন ৬০০ মিলিসেকেন্ড করা হলো (ফাস্ট কাজ করবে)
        setInterval(recognizeFace, 600); 
    } catch (error) {
        document.getElementById('status').textContent = '❌ Error: ' + error.message;
    }
}

init();
