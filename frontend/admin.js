const API_BASE = 'https://smart-attendance-backend-wv9v.onrender.com';
const MODEL_URL = '/models'; 
let currentData = []; // CSV ডাউনলোডের জন্য ডেটা জমা রাখবে

// সাইডবার মেনু কন্ট্রোল (Event Listener ব্যবহার করে)
document.getElementById('menu-dashboard').addEventListener('click', function() { showSection('dashboard', this); });
document.getElementById('menu-register').addEventListener('click', function() { showSection('register', this); });
document.getElementById('menu-attendance').addEventListener('click', function() { showSection('attendance', this); });

function showSection(id, element) {
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
    
    document.getElementById(id).classList.add('active');
    if(element) element.classList.add('active');
    
    if(id === 'dashboard') {
        setTimeout(() => { loadChart(); }, 200); // চার্ট লোড হতে একটু সময় দিলাম
    }
}

// মডেল লোড
async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
}

// ক্যামেরা চালু (রেজিস্ট্রেশন সেকশনের জন্য)
async function startVideo() {
    const video = document.getElementById('video');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        return new Promise(resolve => video.addEventListener('playing', () => resolve(video)));
    } catch(e) { console.error("Camera error", e); }
}

// রেজিস্ট্রেশন
async function registerFace(name, userId) {
    const video = document.getElementById('video');
    const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
    if (!detection) throw new Error('Face not detected.');
    const descriptorArray = Array.from(detection.descriptor);
    await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, name: name, descriptor: descriptorArray })
    });
}

// টেবিল রিফ্রেশ
async function refreshTable() {
    const res = await fetch(`${API_BASE}/attendance/today`);
    currentData = await res.json();
    renderTable(currentData, false);
}

// সার্চ
async function searchStudent() {
    const userId = document.getElementById('searchId').value.trim();
    if (!userId) return alert('Enter ID');
    const res = await fetch(`${API_BASE}/attendance/history/${userId}`);
    currentData = await res.json();
    renderTable(currentData, true);
}

function renderTable(data, isSearch) {
    const tbody = document.querySelector('#attendanceTable tbody');
    const thead = document.querySelector('#attendanceTable thead tr');
    
    if(isSearch) thead.innerHTML = `<th>Name</th><th>Date</th><th>Time</th><th>Emotion</th>`;
    else thead.innerHTML = `<th>Name</th><th>ID</th><th>Time</th><th>Emotion</th>`;

    if(!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4">No data found.</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(r => 
        `<tr><td>${r.name}</td><td>${isSearch ? r.date : r.user_id}</td><td>${r.time}</td><td>${r.emotion}</td></tr>`
    ).join('');
}

// CSV ডাউনলোড
function downloadCSV() {
    if(currentData.length === 0) return alert("No data to download!");
    
    let csvContent = "Name,ID,Date,Time,Emotion\n";
    currentData.forEach(row => {
        csvContent += `${row.name},${row.user_id || ''},${row.date || ''},${row.time},${row.emotion}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "attendance_report.csv";
    link.click();
}

// পাই-চার্ট (Analytics)
async function loadChart() {
    const res = await fetch(`${API_BASE}/attendance/today`);
    const data = await res.json();
    
    const counts = { happy: 0, neutral: 0, sad: 0, angry: 0, other: 0 };
    data.forEach(r => {
        if(counts[r.emotion] !== undefined) counts[r.emotion]++;
        else counts.other++;
    });

    const ctx = document.getElementById('emotionChart').getContext('2d');
    if(window.myChart) window.myChart.destroy();

    window.myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Happy', 'Neutral', 'Sad', 'Angry', 'Other'],
            datasets: [{
                data: [counts.happy, counts.neutral, counts.sad, counts.angry, counts.other],
                backgroundColor: ['#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#64748b'],
                borderWidth: 0
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: 'white' } } } 
        }
    });
}

// Initialization
document.getElementById('registerBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('regName').value.trim();
    const id = document.getElementById('regId').value.trim();
    if (!name || !id) return alert('Enter Name and ID');
    try {
        document.getElementById('status').textContent = "Scanning...";
        await registerFace(name, id);
        document.getElementById('status').textContent = "✅ Registered!";
        document.getElementById('status').style.color = "#22c55e";
    } catch (e) {
        document.getElementById('status').textContent = "❌ " + e.message;
        document.getElementById('status').style.color = "#ef4444";
    }
});

async function init() {
    await loadModels();
    await startVideo();
    await refreshTable();
}
init();
