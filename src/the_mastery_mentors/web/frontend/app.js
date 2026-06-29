// API Helper Functions
async function fetchConfig() {
    const res = await fetch("/api/config");
    return await res.json();
}

async function startSimulation(followedBot, allQwen, windDir, windInt) {
    const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            followed_bot: followedBot,
            all_qwen: allQwen,
            wind_direction: windDir,
            wind_intensity: windInt
        })
    });
    return await res.json();
}

async function stepSimulation() {
    const res = await fetch("/api/step", { method: "POST" });
    return await res.json();
}

async function forceTack() {
    const res = await fetch("/api/tack", { method: "POST" });
    return await res.json();
}

// Color Palette for Boats
const BOAT_COLORS = {
    "BOT_01": "#ff4a5a", // Paolo - Red
    "BOT_02": "#e040fb", // Filippo - Purple
    "BOT_03": "#ff9100", // Enrico - Orange
    "BOT_04": "#00e676", // Giuseppe - Green
    "BOT_05": "#00f0ff", // Emanuele - Cyan
    "BOT_06": "#ffff00", // Elia - Yellow
    "BOT_07": "#ff4081"  // Simeon - Pink
};

// Global Simulation Variables
let simState = null;
let followedBot = "BOT_05";
let playInterval = null;
let isPlaying = false;
let currentTimeSec = 13*3600 + 48*60 + 40; // 13:48:40 in seconds

// Canvas Setup
const canvas = document.getElementById("regatta-canvas");
const ctx = canvas.getContext("2d");

// Responsive Canvas Sizing
function resizeCanvas() {
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    drawMap();
}
window.addEventListener("resize", resizeCanvas);

// Coordinate Transformation (Simulation coordinates X:0-1000, Y:0-1200 to Canvas width/height)
function transformCoords(x, y) {
    // Add margin around the lake
    const marginX = canvas.width * 0.15;
    const marginY = canvas.height * 0.1;
    
    // Map X (0-1000) to (marginX, canvas.width - marginX)
    const mapX = marginX + (x / 1000) * (canvas.width - 2 * marginX);
    
    // Map Y (0-1200) to (canvas.height - marginY, marginY) - Y=0 is at bottom (marks), Y=1200 is at top (gate)
    const mapY = canvas.height - marginY - (y / 1200) * (canvas.height - 2 * marginY);
    
    return { x: mapX, y: mapY };
}

// Drawing Functions
function drawMap() {
    if (!ctx) return;
    
    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Draw Lake Water
    ctx.fillStyle = "#0c1529";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw Shores
    // Left Shore (Limone / Bresciana)
    ctx.fillStyle = "#16233b";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Smooth bezier curve for shore
    ctx.quadraticCurveTo(canvas.width * 0.15, canvas.height * 0.5, 0, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.lineTo(0, 0);
    ctx.fill();
    
    // Left Shore border line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(canvas.width * 0.15, canvas.height * 0.5, 0, canvas.height);
    ctx.stroke();

    // Right Shore (Malcesine / Veronese)
    ctx.fillStyle = "#16233b";
    ctx.beginPath();
    ctx.moveTo(canvas.width, 0);
    ctx.quadraticCurveTo(canvas.width * 0.85, canvas.height * 0.5, canvas.width, canvas.height);
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(canvas.width, 0);
    ctx.fill();
    
    // Right Shore border line
    ctx.beginPath();
    ctx.moveTo(canvas.width, 0);
    ctx.quadraticCurveTo(canvas.width * 0.85, canvas.height * 0.5, canvas.width, canvas.height);
    ctx.stroke();

    // 2. Draw Start / Finish / Gate Line (Y = 1050)
    const gateLeft = transformCoords(100, 1050);
    const gateRight = transformCoords(900, 1050);
    
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(gateLeft.x, gateLeft.y);
    ctx.lineTo(gateRight.x, gateRight.y);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw Gate Label
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = "bold 10px Outfit";
    ctx.textAlign = "center";
    ctx.fillText("PARTENZA / FINISH / GATE", canvas.width * 0.5, gateLeft.y - 10);

    // 3. Draw Marks ALFA 1 & ALFA 2 (Y = 150)
    // ALFA 1 (X=250, Y=150)
    // ALFA 2 (X=750, Y=150)
    const m1 = transformCoords(250, 150);
    const m2 = transformCoords(750, 150);
    
    drawMarkCircle(m1.x, m1.y, "❶", "#ff9100");
    drawMarkCircle(m2.x, m2.y, "❷", "#00e676");

    // 4. Draw Laylines from ALFA 2 (preferred upwind mark)
    // Starboard layline: Y = 900 - X => from (150, 750) to (750, 150)
    const laylineStart = transformCoords(150, 750);
    const laylineEnd = transformCoords(750, 150);
    ctx.strokeStyle = "rgba(0, 240, 255, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(laylineStart.x, laylineStart.y);
    ctx.lineTo(laylineEnd.x, laylineEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Draw Trails & Boats
    if (simState && simState.boats) {
        Object.entries(simState.boats).forEach(([code, boat]) => {
            if (!boat.active) return;
            
            const color = BOAT_COLORS[code] || "#ffffff";
            const isFollowed = (code === followedBot);
            
            // Draw Trail
            if (boat.trail && boat.trail.length > 0) {
                ctx.strokeStyle = color;
                ctx.lineWidth = isFollowed ? 2.5 : 1.2;
                ctx.globalAlpha = 0.55;
                ctx.beginPath();
                const startPt = transformCoords(boat.trail[0].x, boat.trail[0].y);
                ctx.moveTo(startPt.x, startPt.y);
                
                for (let i = 1; i < boat.trail.length; i++) {
                    const pt = transformCoords(boat.trail[i].x, boat.trail[i].y);
                    ctx.lineTo(pt.x, pt.y);
                }
                
                // Connect to current position
                const currentPt = transformCoords(boat.x, boat.y);
                ctx.lineTo(currentPt.x, currentPt.y);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }
            
            // Draw Boat Icon
            const pt = transformCoords(boat.x, boat.y);
            let angle = 0;
            
            // Set orientation based on leg and mure
            if (simState.leg === "PRIMA_BOLINA") {
                // Sailing upwind (going down towards Y=150)
                // Port tack goes South-West (X decreasing, Y decreasing): approx 235 degrees (4.1 rad)
                // Starboard tack goes South-East (X increasing, Y decreasing): approx 145 degrees (2.5 rad)
                angle = (boat.mure === "mure_a_sinistra") ? 4.1 : 2.53;
            } else {
                // Sailing downwind (going up towards Y=1050)
                // Port tack goes North-East (X increasing, Y increasing): approx 35 degrees (0.6 rad)
                // Starboard tack goes North-West (X decreasing, Y increasing): approx 325 degrees (5.7 rad)
                angle = (boat.mure === "mure_a_sinistra") ? 0.6 : 5.67;
            }
            
            drawBoatIcon(pt.x, pt.y, angle, color, isFollowed, boat.bot_name);
        });
    }
}

function drawMarkCircle(x, y, label, color) {
    // Flag pole
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 18);
    ctx.stroke();
    
    // Flag triangle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 18);
    ctx.lineTo(x + 12, y - 14);
    ctx.lineTo(x, y - 10);
    ctx.fill();
    
    // Base circle
    ctx.fillStyle = "#1e293b";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px Outfit";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
}

function drawBoatIcon(x, y, angle, color, isFollowed, label) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    
    // If followed, draw a glowing halo around the boat
    if (isFollowed) {
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.fillStyle = "rgba(0, 240, 255, 0.15)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    
    // Draw triangular boat body pointing UP
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -9);       // Bow (Prua)
    ctx.lineTo(5, 7);       // Starboard Stern (Poppa destra)
    ctx.lineTo(0, 4);       // Center Stern
    ctx.lineTo(-5, 7);      // Port Stern (Poppa sinistra)
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    ctx.restore();
    
    // Draw Boat Label
    ctx.fillStyle = isFollowed ? "#ffffff" : "rgba(255, 255, 255, 0.6)";
    ctx.font = isFollowed ? "bold 11px Outfit" : "10px Inter";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 22);
}

// Update UI Components
function updateLeaderboard() {
    if (!simState || !simState.boats) return;
    
    const body = document.getElementById("leaderboard-body");
    body.innerHTML = "";
    
    // Sort boats by rank
    const sortedBoats = Object.values(simState.boats).sort((a, b) => a.rank - b.rank);
    
    sortedBoats.forEach(b => {
        const row = document.createElement("tr");
        if (b.bot_code === followedBot) {
            row.classList.add("followed-row");
        }
        
        row.innerHTML = `
            <td><strong>${b.rank}</strong></td>
            <td>
                <span class="follow-circle" style="background-color: ${BOAT_COLORS[b.bot_code]}"></span>
                ${b.bot_name}
            </td>
            <td>${b.speed.toFixed(1)} kn</td>
            <td><span class="badge" style="background: rgba(255,255,255,0.05); color: #fff;">${b.preferred_side === "left" ? "Sinistra" : "Destra"}</span></td>
            <td>
                <button class="btn btn-secondary btn-sm" onclick="setFollowedBot('${b.bot_code}')" style="padding: 4px 8px; font-size: 10px;">
                    ${b.bot_code === followedBot ? "★ Seguito" : "Segui"}
                </button>
            </td>
        `;
        body.appendChild(row);
    });
}

function updateCoachPanel(coachAdvice) {
    const container = document.getElementById("coach-panel-content");
    container.innerHTML = "";
    
    if (!coachAdvice) {
        container.innerHTML = `<div class="no-advice">Richiesta in corso all'Ufficiale Tattico (Qwen 3.5 4B)...</div>`;
        return;
    }
    
    const actionClass = coachAdvice.azione.toLowerCase();
    const actionLabel = coachAdvice.azione;
    
    const box = document.createElement("div");
    box.className = "coach-box";
    box.innerHTML = `
        <div class="coach-action">
            <span>Azione consigliata:</span>
            <span class="action-badge ${actionClass}">${actionLabel}</span>
        </div>
        <div class="coach-warning">
            <strong>Punto Critico Rilevato:</strong> ${coachAdvice.punto_critico_rilevato}
        </div>
        <div class="coach-motivation">
            <strong>Motivazione:</strong> ${coachAdvice.motivazione_tattica}
        </div>
    `;
    container.appendChild(box);
}

// Playback Management
function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

async function triggerStep() {
    try {
        const data = await stepSimulation();
        simState = data.state;
        
        // Update Time & Slider
        currentTimeSec += 30; // 30s per step
        document.getElementById("current-time").innerText = formatTime(currentTimeSec);
        
        const totalSteps = 35; // Fixed steps for simulation
        const sliderVal = Math.min(100, Math.floor((simState.step / totalSteps) * 100));
        document.getElementById("time-slider").value = sliderVal;
        
        // Redraw & updates
        drawMap();
        updateLeaderboard();
        updateCoachPanel(data.coach_advice);
        
        // If finished, stop
        if (!simState.started) {
            pausePlayback();
            alert("Regata Completata! Le barche sono giunte al traguardo.");
        }
    } catch (e) {
        console.error("Errore durante lo step della simulazione: ", e);
        pausePlayback();
    }
}

function startPlayback() {
    if (isPlaying) return;
    isPlaying = true;
    
    const playBtn = document.getElementById("btn-play-pause");
    playBtn.innerHTML = `<span class="icon">⏸</span> Pause`;
    playBtn.classList.remove("btn-primary");
    playBtn.classList.add("btn-secondary");
    
    const speedMult = parseInt(document.getElementById("speed-mult").value) || 5;
    const intervalMs = Math.max(100, 2000 / speedMult); // Speed scaling
    
    playInterval = setInterval(triggerStep, intervalMs);
}

function pausePlayback() {
    if (!isPlaying) return;
    isPlaying = false;
    
    const playBtn = document.getElementById("btn-play-pause");
    playBtn.innerHTML = `<span class="icon">▶</span> Play`;
    playBtn.classList.remove("btn-secondary");
    playBtn.classList.add("btn-primary");
    
    clearInterval(playInterval);
}

// User Action Handlers
window.setFollowedBot = async function(botCode) {
    followedBot = botCode;
    console.log(`Seguendo la barca: ${botCode}`);
    
    // Restart simulation with new followed bot
    const allQwen = document.getElementById("chk-all-qwen").checked;
    currentTimeSec = 13*3600 + 48*60 + 40;
    
    pausePlayback();
    const data = await startSimulation(followedBot, allQwen, 190.0, 14.0);
    simState = data.state;
    
    document.getElementById("current-time").innerText = formatTime(currentTimeSec);
    document.getElementById("time-slider").value = 0;
    
    drawMap();
    updateLeaderboard();
    document.getElementById("coach-panel-content").innerHTML = `
        <div class="no-advice">Avvia la regata per ricevere consigli tattici da Qwen.</div>
    `;
};

// Event Listeners
document.getElementById("btn-play-pause").addEventListener("click", () => {
    if (isPlaying) {
        pausePlayback();
    } else {
        startPlayback();
    }
});

document.getElementById("btn-tack").addEventListener("click", async () => {
    if (!simState || !simState.started) return;
    const data = await forceTack();
    if (data.status === "ok") {
        console.log(`Manovra manuale eseguita: ${data.mure}`);
        simState.boats[followedBot].mure = data.mure;
        drawMap();
    }
});

document.getElementById("chk-all-qwen").addEventListener("change", async () => {
    // Restart to apply Qwen settings
    setFollowedBot(followedBot);
});

document.getElementById("speed-mult").addEventListener("change", () => {
    if (isPlaying) {
        pausePlayback();
        startPlayback();
    }
});

// App Initialization
async function initApp() {
    resizeCanvas();
    // Default start
    await setFollowedBot("BOT_05");
}

initApp();
