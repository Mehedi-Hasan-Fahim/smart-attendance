const API_BASE = 'https://smart-attendance-backend-wv9v.onrender.com';
const MODEL_URL = '/models'; 

let faceMatcher = null;
const labeledDescriptors = [];
let recentlyGreeted = {}; // বারবার গ্রিটিং এড়ানোর জন্য

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

async function recognizeFace() {
    const video = document.getElementById('video');
    const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();

    if (!detection) return null;

    const emotion = Object.keys(detection.expressions)
        .reduce((a, b) => detection.expressions[a] > detection.expressions[b] ? a : b);

    let userInfo = null;
    if (faceMatcher) {
        const match = faceMatcher.findBestMatch(detection.descriptor);
        if (match.label !== 'unknown') {
            const [id, name] = match.label.split('|');
            userInfo = { id, name, emotion };
        }
    }
    return { userInfo, emotion };
}

async function logAttendance(userId, emotion) {
    const res = await fetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, emotion: emotion })
    });
    return res.json();
}

function speakGreeting(name, emotion) {
    const hour = new Date().getHours();
    let timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    let emotionMessage = "";
    if (emotion === 'happy') emotionMessage = "You look happy today. Hope you stay cheerful all day!";
    else if (emotion === 'sad') emotionMessage = "You seem a bit sad. Keep your head up!";
    else if (emotion === 'angry') emotionMessage = "Take a deep breath. Let's make today a calm one!";
    else emotionMessage = "Have a great day!";

    const msg = new SpeechSynthesisUtterance(`${timeGreeting}, ${name}. ${emotionMessage}`);
    msg.lang = 'en-US';
    window.speechSynthesis.speak(msg);
}

async function init() {
    try {
        document.getElementById('status').textContent = '⏳ মডেল লোড হচ্ছে...';
        await loadModels();
        await loadRegisteredUsers(); 
        document.getElementById('status').textContent = '📷 ক্যামেরা চালু হচ্ছে...';
        await startVideo();
        document.getElementById('status').textContent = '👀 ক্যামেরার দিকে তাকান...';

        setInterval(async () => {
            const result = await recognizeFace();
            if (result?.userInfo) {
                const { id, name, emotion } = result.userInfo;
                const now = Date.now();
                
                // ১ মিনিটের কুলডাউন, যাতে বারবার গ্রিটিং না করে
                if (!recentlyGreeted[id] || now - recentlyGreeted[id] > 60000) {
                    recentlyGreeted[id] = now;
                    document.getElementById('status').textContent = `👋 ${name} | ইমোশন: ${emotion}`;
                    
                    const logRes = await logAttendance(id, emotion);
                    if (logRes.status === 'marked') {
                        speakGreeting(name, emotion);
                    } else {
                         // যদি আজকে আগেই হাজিরা দেওয়া থাকে, তবুও গ্রিটিং করবে
                         speakGreeting(name, emotion);
                    }

                    // ৫ সেকেন্ড পর আবার স্ক্যানিং শুরু করবে
                    setTimeout(() => {
                        document.getElementById('status').textContent = '👀 ক্যামেরার দিকে তাকান...';
                    }, 5000);
                }
            }
        }, 3000);
    } catch (error) {
        document.getElementById('status').textContent = '❌ এরর: ' + error.message;
    }
}

// ইউজার ইন্টারঅ্যাকশনের পর অডিও চালু হওয়ার জন্য
document.body.addEventListener('click', () => {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
}, { once: true });

init();
