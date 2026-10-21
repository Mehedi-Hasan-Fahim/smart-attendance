const API_BASE = 'https://smart-attendance-backend-wv9v.onrender.com';
const MODEL_URL = '/models'; 

let faceMatcher = null;
const labeledDescriptors = [];

async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    console.log('✅ Models loaded');
}

async function startVideo() {
    const video = document.getElementById('video');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    return new Promise(resolve => {
        video.addEventListener('playing', () => resolve(video));
    });
}

async function registerFace(name, userId) {
    const video = document.getElementById('video');
    const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) throw new Error('মুখ শনাক্ত হয়নি');

    // ১. face-api.js এর জন্য এটাকে Float32Array রাখতে হবে
    const descriptor = detection.descriptor;
    
    // ২. লেবেলড ফেস ডেসক্রিপ্টরে সরাসরি Float32Array পাঠাতে হবে
    labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(`${userId}|${name}`, [descriptor]));
    faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

    // ৩. ব্যাকএন্ডে (Render) পাঠানোর জন্য Array তে কনভার্ট করতে হবে, কারণ JSON Float32Array সাপোর্ট করে না
    const descriptorArray = Array.from(descriptor);

    await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, name: name, descriptor: descriptorArray })
    });
    return true;
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

async function fetchTodayAttendance() {
    const res = await fetch(`${API_BASE}/attendance/today`);
    return res.json();
}

async function refreshTable() {
    const data = await fetchTodayAttendance();
    const tbody = document.querySelector('#attendanceTable tbody');
    tbody.innerHTML = data.map(r =>
        `<tr><td>${r.name}</td><td>${r.user_id}</td><td>${r.time}</td><td>${r.emotion}</td></tr>`
    ).join('');
}

// অডিও গ্রিটিং (Web Speech API)
function speakGreeting(name, emotion) {
    const hour = new Date().getHours();
    let timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    
    let emotionMessage = "";
    if (emotion === 'happy') emotionMessage = "You look happy today. Hope you stay cheerful all day!";
    else if (emotion === 'sad') emotionMessage = "You seem a bit sad. Keep your head up, better days are coming!";
    else if (emotion === 'angry') emotionMessage = "Take a deep breath. Let's make today a calm and productive one!";
    else emotionMessage = "Have a great day!";

    const msg = new SpeechSynthesisUtterance(`${timeGreeting}, ${name}. ${emotionMessage}`);
    msg.lang = 'en-US';
    window.speechSynthesis.speak(msg);
}

async function init() {
    await loadModels();
    await startVideo();
    document.getElementById('status').textContent = '✅ প্রস্তুত। ক্যামেরার দিকে তাকান।';
    await refreshTable();

    setInterval(async () => {
        const result = await recognizeFace();
        if (result?.userInfo) {
            const { id, name, emotion } = result.userInfo;
            document.getElementById('status').textContent = `👋 ${name} | ইমোশন: ${emotion}`;

            const logRes = await logAttendance(id, emotion);
            if (logRes.status === 'marked') {
                speakGreeting(name, emotion);
                await refreshTable();
            }
        }
    }, 3000);
}

document.getElementById('registerBtn').addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const id = document.getElementById('regId').value.trim();
    if (!name || !id) return alert('নাম ও ID দিন');
    try {
        await registerFace(name, id);
        alert('✅ মুখ রেজিস্টার হয়েছে!');
    } catch (e) {
        alert('❌ ' + e.message);
    }
});

init();
