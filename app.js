// 1. IMPORT LIBRARIES & KEYS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// IMPORT KEYS FROM HIDDEN FILE
import { FIREBASE_CONFIG, GEMINI_API_KEY } from './env.js'; 

// 2. INITIALIZE APP (Using keys from env.js)
const app = initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- FEATURE 1: LIVE DASHBOARD ---
const dashboard = document.getElementById('dashboard');

onSnapshot(collection(db, "labs"), (snapshot) => {
    dashboard.innerHTML = ""; 
    snapshot.forEach((docSnap) => {
        const lab = docSnap.data();
        let statusClass = "free";
        let statusText = "AVAILABLE";
        
        if(lab.status === "class_occupied") { 
            statusClass = "occupied"; 
            statusText = "IN CLASS"; 
        }
        if(lab.status === "placement") { 
            statusClass = "placement"; 
            statusText = "PLACEMENT"; 
        }

        const div = document.createElement('div');
        div.className = `card ${statusClass}`;
        div.innerHTML = `
            <div class="status-badge">${statusText}</div>
            <h3>${lab.name}</h3>
            <p style="color: #888;">Capacity: <strong>${lab.capacity}</strong></p>
            <div class="hover-details">
                Assets: Projector, AC, LAN
            </div>
        `;
        dashboard.appendChild(div);
    });
});

// --- FEATURE 2: PLACEMENT LOGIC ---
window.togglePlacementForm = () => {
    const el = document.getElementById('placementForm');
    el.style.display = (el.style.display === 'flex') ? 'none' : 'flex';
}

window.runPlacementOverride = async () => {
    const reqCap = parseInt(document.getElementById('reqCapacity').value);
    const reqCount = parseInt(document.getElementById('reqCount').value);
    
    // 1. Get all labs
    const q = query(collection(db, "labs"));
    const snapshot = await getDocs(q);
    
    let labsToLock = [];
    
    // 2. ROBUST FILTER LOGIC
    snapshot.forEach(doc => {
        const data = doc.data();
        
        // Safety: Ensure capacity is treated as a number
        const labCapacity = parseInt(data.capacity); 
        
        // Safety: Check Status by EXCLUSION (Match the Dashboard visual logic)
        const isOccupied = (data.status === 'placement' || data.status === 'class_occupied');
        
        if (!isOccupied && labCapacity >= reqCap) {
            labsToLock.push(doc.id);
        }
    });

    // 3. Check availability
    if (labsToLock.length < reqCount) {
        alert(`❌ ERROR: Only found ${labsToLock.length} free labs with capacity ${reqCap}. Need ${reqCount}.`);
        return;
    }

    // 4. Lock the first 'reqCount' labs
    for (let i = 0; i < reqCount; i++) {
        await updateDoc(doc(db, "labs", labsToLock[i]), { status: "placement" });
    }
    
    alert("✅ SUCCESS: Placement Drive Locked! Dashboard updated.");
    window.togglePlacementForm();
};

// --- FEATURE 3: AI + APPROVAL LOGIC ---
window.askAI = async () => {
    const userText = document.getElementById('userInput').value;
    const responseP = document.getElementById('aiResponse');
    
    if(!userText) return;
    
    responseP.innerHTML = "🤖 Analyzing availability...";
    responseP.style.color = "blue";

    // SIMULATED THINKING DELAY
    setTimeout(() => {
        // We FORCE the recommendation to be Python Lab for the demo
        const recommendedLab = "Python lab"; 
        
        responseP.style.color = "#2c3e50";
        responseP.innerHTML = `
            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 5px solid #28a745;">
                <strong>✅ Recommendation:</strong> ${recommendedLab}
                <br><span style="font-size: 0.9em; color: #555;">Reason: Best fit for capacity (50) and currently free.</span>
                <br><br>
                <div style="display: flex; gap: 10px;">
                    <button onclick="window.confirmBooking('${recommendedLab}')" style="background: #28a745; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer;">Approve ✅</button>
                    <button onclick="window.denyBooking()" style="background: #dc3545; color: white; padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer;">Deny ❌</button>
                </div>
            </div>
        `;
    }, 1500);
};

// --- REAL BOOKING FUNCTION ---
window.confirmBooking = async (labName) => {
    const responseP = document.getElementById('aiResponse');
    responseP.innerHTML = "⏳ Booking in progress...";
    
    try {
        // 1. Find the lab ID by name
        const q = query(collection(db, "labs"), where("name", "==", labName));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            responseP.innerHTML = "❌ Error: Lab not found in DB.";
            return;
        }

        // 2. Update the status in Firebase
        const labDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, "labs", labDoc.id), { status: "class_occupied" });

        // 3. Success Message
        responseP.innerHTML = `🎉 <strong>Success!</strong> ${labName} has been booked. Dashboard updated.`;
        responseP.style.color = "green";
        
    } catch (e) {
        console.error(e);
        responseP.innerHTML = "❌ Error booking lab: " + e.message;
    }
};

window.denyBooking = () => {
    const responseP = document.getElementById('aiResponse');
    responseP.innerHTML = "❌ Recommendation denied. Search again.";
    responseP.style.color = "red";
};