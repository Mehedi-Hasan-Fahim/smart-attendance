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


// EAR (Eye Aspect Ratio) গাণিতিক সূত্র দিয়ে চোখের পলক ডিটেক্ট করা
function calculateEAR(eye) {
    // চোখের উপর ও নিচের দূরত্ব (Vertical)
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    // চোখের বাম ও ডান দূরত্ব (Horizontal)
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    
    // রেশিও বের করা
    return (v1 + v2) / (2.0 * h);
}

let isEyeClosed = false;

async function recognizeFace() {
    const video = document.getElementById('video');
    const wrapper = document.getElementById('videoWrapper');
    
    const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();

    if (!detection) {
        wrapper.className = "video-wrapper scanning";
        isEyeClosed = false; 
        return null;
    }

    // EAR মাপা
    const leftEAR = calculateEAR(detection.landmarks.getLeftEye());
    const rightEAR = calculateEAR(detection.landmarks.getRightEye());
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // EAR 0.22 এর নিচে নামলে বুঝতে হবে চোখ বন্ধ
    if (avgEAR < 0.22) {
        isEyeClosed = true;
    } 
    // চোখ আবার খুললে (EAR বেড়ে গেলে) ব্লিংক কাউন্ট হবে
    else if (avgEAR > 0.25 && isEyeClosed) {
        isEyeClosed = false;
        wrapper.setAttribute('data-blinked', 'true'); // ব্লিংক সফল
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

    // লাইভনেস চেক (ব্লিংক) পাস হলে এবং ইউজার ম্যাচ করলে তবেই সবুজ রিং হবে
    if (userInfo && wrapper.getAttribute('data-blinked') === 'true') {
        wrapper.className = "video-wrapper recognized"; // সবুজ রিং
        return { userInfo, emotion, isLive: true };
    } else {
        wrapper.className = "video-wrapper scanning"; // লাল রিং
        document.getElementById('status').textContent = userInfo ? '👁️ Please blink your eyes!' : '🔍 Scanning...';
        return { userInfo: null, emotion, isLive: false }; 
    }
}

let blinkDetected = false;
let scanStartTime = 0;

async function recognizeFace() {
    const video = document.getElementById('video');
    const wrapper = document.getElementById('videoWrapper');
    
    const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor()
        .withFaceExpressions();

    // যদি মুখ না পাওয়া যায়, রিং লাল থাকবে
    if (!detection) {
        wrapper.className = "video-wrapper scanning";
        blinkDetected = false; 
        scanStartTime = 0;
        return null;
    }

    // মুখ পাওয়া গেলে চেক করব চোখের পলক পড়েছে কি না
    if (detectBlink(detection.landmarks)) {
        blinkDetected = true;
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

    // লাইভনেস চেক (ব্লিংক) পাস হলে এবং ইউজার ম্যাচ করলে তবেই সবুজ রিং হবে
    if (userInfo && blinkDetected) {
        wrapper.className = "video-wrapper recognized"; // সবুজ রিং
        return { userInfo, emotion, isLive: true };
    } else {
        wrapper.className = "video-wrapper scanning"; // লাল রিং
        document.getElementById('status').textContent = userInfo ? '👁️ Please blink your eyes to verify!' : '🔍 Scanning...';
        return { userInfo: null, emotion, isLive: false }; // ব্লিংক না করলে হাজিরা নেবে না
    }
}

// init ফাংশনে একটু পরিবর্তন
async function init() {
    try {
        document.getElementById('status').textContent = '⏳ Loading Models...';
        await loadModels();
        await loadRegisteredUsers(); 
        await startVideo();
        
        document.getElementById('videoWrapper').className = "video-wrapper scanning"; // শুরুতে লাল রিং

        setInterval(async () => {
            const result = await recognizeFace();
            const wrapper = document.getElementById('videoWrapper');
            
            if (result && result.isLive && result.userInfo) {
                const { id, name, emotion } = result.userInfo;
                const now = Date.now();
                
                if (!recentlyGreeted[id] || now - recentlyGreeted[id] > 60000) {
                    recentlyGreeted[id] = now;
                    document.getElementById('status').textContent = `👋 ${name} | Emotion: ${emotion}`;
                    document.getElementById('status').style.color = '#22c55e';
                    
                    const logRes = await logAttendance(id, emotion);
                    speakGreeting(name, emotion);

                    // ৫ সেকেন্ড পর আবার স্ক্যানিং শুরু হবে
                    setTimeout(() => {
                        wrapper.className = "video-wrapper scanning";
                        wrapper.setAttribute('data-blinked', 'false'); // রিসেট
                        document.getElementById('status').textContent = '👀 Look at the camera...';
                        document.getElementById('status').style.color = 'white';
                    }, 5000);
                }
            }
        }, 1000); // প্রতি ১ সেকেন্ডে চেক করবে
    } catch (error) {
        console.error(error);
    }
}

// ইউজার ইন্টারঅ্যাকশনের পর অডিও চালু হওয়ার জন্য
document.body.addEventListener('click', () => {
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
}, { once: true });

init();
