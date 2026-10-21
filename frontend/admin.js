const API_BASE = 'https://smart-attendance-backend-wv9v.onrender.com';
const MODEL_URL = '/models'; 

async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
}

async function startVideo() {
    const video = document.getElementById('video');
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    return new Promise(resolve => video.addEventListener('playing', () => resolve(video)));
}

async function registerFace(name, userId) {
    const video = document.getElementById('video');
    const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

    if (!detection) throw new Error('মুখ শনাক্ত হয়নি। ক্যামেরার দিকে সরাসরি তাকান।');

    const descriptorArray = Array.from(detection.descriptor);

    const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, name: name, descriptor: descriptorArray })
    });
    return res.ok;
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

async function init() {
    document.getElementById('status').textContent = 'মডেল লোড হচ্ছে...';
    await loadModels();
    await startVideo();
    document.getElementById('status').textContent = '✅ ক্যামেরা প্রস্তুত।';
    await refreshTable();
}

document.getElementById('registerBtn').addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const id = document.getElementById('regId').value.trim();
    const statusEl = document.getElementById('status');
    
    if (!name || !id) return alert('নাম ও ID দিন');
    
    try {
        statusEl.textContent = '⏳ মুখ স্ক্যান হচ্ছে...';
        await registerFace(name, id);
        statusEl.textContent = '✅ রেজিস্ট্রেশন সফল হয়েছে!';
        alert('✅ মুখ সফলভাবে রেজিস্টার হয়েছে!');
        document.getElementById('regName').value = '';
        document.getElementById('regId').value = '';
    } catch (e) {
        statusEl.textContent = '❌ এরর: ' + e.message;
    }
});

init();
