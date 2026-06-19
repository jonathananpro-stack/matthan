const CORE = {
    state: {
        mode: 'TRAIN',
        facingMode: "user",
        isCombatScanning: false,
        combatInterval: null,
        faceMatcher: null,
        session: { isActive: false, name: "", checkedInSet: new Set(), unknownsQueue: [] }
    },

    db: {
        profiles: {}, 
        
        generateFaceID() {
            const date = new Date();
            return `SEC_${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        },

        loadFromStorage() {
            const savedData = localStorage.getItem('SEC_AI_KNOWLEDGE_BASE');
            if (savedData) {
                this.profiles = JSON.parse(savedData);
                CORE.log(`Đã nạp <b style="color:#00ffcc">${Object.keys(this.profiles).length}</b> hồ sơ DNA từ Bộ nhớ.`);
                CORE.combat.buildFaceMatcher(); 
            }
        },

        saveTarget() {
            const tempId = document.getElementById('modal-id').value;
            const name = document.getElementById('modal-name').value.trim() || "UNKNOWN";
            const unit = document.getElementById('modal-unit').value.trim() || "N/A";
            const imgSrc = document.getElementById('modal-img').src;
            const descriptorStr = document.getElementById('modal-descriptor').value;
            const descriptorArray = descriptorStr ? descriptorStr.split(',').map(Number) : [];
            const matchedId = document.getElementById('modal-matched-id').value;

            let isUpdate = false;
            if (matchedId && this.profiles[matchedId] && this.profiles[matchedId].info.name === name) {
                isUpdate = true;
            }

            if (isUpdate) {
                // Cập nhật đa góc mặt (AI học thêm)
                if (!this.profiles[matchedId].biometrics.descriptors) this.profiles[matchedId].biometrics.descriptors = [];
                this.profiles[matchedId].biometrics.descriptors.push(descriptorArray);
                CORE.log(`[HỌC SÂU] Đã cập nhật góc mặt mới cho <b style="color:#00ffcc">${name}</b>`);
            } else {
                // Tạo mới hồ sơ
                const secureID = this.generateFaceID();
                this.profiles[secureID] = {
                    id: secureID,
                    info: { name: name, unit: unit },
                    biometrics: { descriptors: [descriptorArray] },
                    media: { base64: imgSrc },
                    meta: { createdAt: new Date().toLocaleString() }
                };
                CORE.log(`[HUẤN LUYỆN] Đã nạp DNA: <b style="color:#00ffcc">${name}</b>`);
            }

            localStorage.setItem('SEC_AI_KNOWLEDGE_BASE', JSON.stringify(this.profiles));
            CORE.combat.buildFaceMatcher(); 

            const card = document.getElementById(`card-${tempId}`);
            if (card) {
                card.remove();
                if (CORE.state.mode === 'COMBAT') CORE.combat.updateUnknownCount();
            }
            CORE.ui.closeModal();
        },

        deleteTarget(secureID) {
            if(confirm(`Xác nhận TIÊU HỦY vĩnh viễn hồ sơ [${secureID}]?`)) {
                delete this.profiles[secureID];
                localStorage.setItem('SEC_AI_KNOWLEDGE_BASE', JSON.stringify(this.profiles));
                CORE.combat.buildFaceMatcher(); 
                CORE.ui.openDatabaseModal(); 
            }
        },

        exportData() {
            const dataStr = JSON.stringify(this.profiles);
            const encodedData = btoa(encodeURIComponent(dataStr)); 
            const blob = new Blob([encodedData], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date();
            const dateStr = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2,'0')}${date.getDate().toString().padStart(2,'0')}`;
            a.download = `SEC_KNOWLEDGE_BASE_${dateStr}.sec`; 
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            CORE.log("<span style='color:#00ffcc'>Đã đóng gói và xuất file .sec thành công.</span>");
        },

        importData(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const dataStr = decodeURIComponent(atob(e.target.result));
                    const importedProfiles = JSON.parse(dataStr);
                    let newCount = 0;
                    for (const id in importedProfiles) {
                        if (!this.profiles[id]) { this.profiles[id] = importedProfiles[id]; newCount++; }
                    }
                    if (newCount > 0) {
                        localStorage.setItem('SEC_AI_KNOWLEDGE_BASE', JSON.stringify(this.profiles));
                        CORE.combat.buildFaceMatcher();
                        CORE.ui.openDatabaseModal(); 
                        CORE.log(`Đã nạp <b style="color:#00ffcc">${newCount}</b> hồ sơ tình báo mới.`);
                    } else {
                        CORE.log("<span style='color:#ffaa00'>Tất cả dữ liệu đã tồn tại.</span>");
                    }
                } catch (err) { alert("CẢNH BÁO: File không hợp lệ."); }
            };
            reader.readAsText(file);
            event.target.value = ''; 
        }
    },

    ui: {
        switchMode(newMode) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.module').forEach(m => m.classList.remove('active'));
            if (newMode === 'TRAIN') {
                document.getElementById('tab-train').classList.add('active');
                document.getElementById('module-train').classList.add('active');
                CORE.combat.stopScan(); 
            } else {
                document.getElementById('tab-combat').classList.add('active');
                document.getElementById('module-combat').classList.add('active');
            }
            CORE.state.mode = newMode;
        },

        openModal(id, imgSrc, descriptorArray, matchedId = null) {
            document.getElementById('modal-id').value = id;
            document.getElementById('modal-img').src = imgSrc;
            document.getElementById('modal-descriptor').value = descriptorArray.join(','); 
            document.getElementById('modal-matched-id').value = matchedId || "";
            
            const nameInput = document.getElementById('modal-name');
            const unitInput = document.getElementById('modal-unit');
            const suggestBox = document.getElementById('ai-suggestion-box');
            const suggestName = document.getElementById('ai-suggestion-name');
            const btnSave = document.getElementById('btn-save-target');

            if (matchedId && CORE.db.profiles[matchedId]) {
                const p = CORE.db.profiles[matchedId];
                nameInput.value = p.info.name; unitInput.value = p.info.unit;
                suggestBox.style.display = 'block'; suggestName.innerText = p.info.name;
                btnSave.innerHTML = "✅ CẬP NHẬT GÓC MẶT"; btnSave.style.background = "#00ffcc"; btnSave.style.color = "#000";
            } else {
                nameInput.value = ''; unitInput.value = '';
                suggestBox.style.display = 'none';
                btnSave.innerHTML = "💾 LƯU MỚI"; btnSave.style.background = "var(--neon)";
            }
            document.getElementById('label-modal').classList.add('active');
            nameInput.focus();
        },
        closeModal() { document.getElementById('label-modal').classList.remove('active'); },
        
        openDatabaseModal() {
            const grid = document.getElementById('saved-grid');
            const profiles = Object.entries(CORE.db.profiles);
            document.getElementById('db-count').innerText = `Tổng: ${profiles.length}`;
            if (profiles.length === 0) {
                grid.innerHTML = `<div style="grid-column: span 4; text-align: center; color: #888; padding: 20px;">Dữ liệu trống.</div>`;
            } else {
                grid.innerHTML = profiles.map(([id, p]) => `
                    <div class="face-card" style="border-color: #00ffcc; background: rgba(0,255,204,0.1); cursor: default; position: relative;">
                        <button onclick="CORE.db.deleteTarget('${id}')" style="position: absolute; top: -8px; right: -8px; background: #ff3333; color: white; border: 1px solid #ff3333; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-weight: bold; line-height: 15px;">×</button>
                        <img src="${p.media.base64}">
                        <div style="color: #00ffcc; font-weight: bold; font-size: 11px; margin-top: 5px;">${p.info.name}</div>
                        <div style="color: #aaa; font-size: 10px;">${p.info.unit}</div>
                    </div>
                `).join('');
            }
            document.getElementById('database-modal').classList.add('active');
        },
        closeDatabaseModal() { document.getElementById('database-modal').classList.remove('active'); }
    },

    init: async function() {
        this.log("Đang nạp TỔ HỢP MẠNG NƠ-RON AI...");
        try {
            const modelPath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
                faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
                faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
            ]);
            document.getElementById('sys-status').innerText = "SYS: [ TRỰC TUYẾN ]";
            this.db.loadFromStorage();
        } catch (error) { this.log(`<span style='color:red'>LỖI NẠP AI: ${error.message}</span>`); }
    },

    media: {
        async startCamera(videoId) {
            const videoElement = document.getElementById(videoId);
            try {
                if (videoElement.srcObject) videoElement.srcObject.getTracks().forEach(track => track.stop());
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: CORE.state.facingMode } });
                videoElement.srcObject = stream; videoElement.style.display = 'block';
                document.getElementById('img-view').style.display = 'none';
            } catch (e) { CORE.log("<span style='color:red'>LỖI CAMERA!</span>"); }
        },
        handleUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const videoElement = document.getElementById('vid');
            const imgElement = document.getElementById('img-view');
            if (videoElement.srcObject) videoElement.srcObject.getTracks().forEach(track => track.stop());
            const reader = new FileReader();
            reader.onload = (e) => {
                if (file.type.startsWith('image/')) {
                    imgElement.src = e.target.result;
                    imgElement.style.display = 'block'; videoElement.style.display = 'none';
                }
            };
            reader.readAsDataURL(file);
        },
        clearSource() {
            const v = document.getElementById('vid'); const i = document.getElementById('img-view');
            if (v.srcObject) v.srcObject.getTracks().forEach(track => track.stop());
            v.style.display = 'none'; i.style.display = 'none'; v.src = ""; i.src = "";
            document.getElementById('out').getContext('2d').clearRect(0,0,10000,10000);
            CORE.log("<span style='color:#ff3333; font-weight:bold;'>Đã tiêu hủy nguồn gốc.</span>");
        }
    },

    ai: {
        async extractFacesTrain() {
            CORE.log("Đang phân tích Radar...");
            const sourceElement = document.getElementById('vid').style.display === 'block' ? document.getElementById('vid') : document.getElementById('img-view');

            try {
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
                let faces = await faceapi.detectAllFaces(sourceElement, options).withFaceLandmarks().withFaceDescriptors();

                // Lọc chống cắt trùng lặp (Distance filtering)
                const uniqueFaces = [];
                faces.forEach(face => {
                    const box1 = face.detection ? face.detection.box : face.box;
                    let isOverlap = false;
                    for (let uFace of uniqueFaces) {
                        const box2 = uFace.detection ? uFace.detection.box : uFace.box;
                        const dist = Math.hypot((box1.x + box1.width/2) - (box2.x + box2.width/2), (box1.y + box1.height/2) - (box2.y + box2.height/2));
                        if (dist < box1.width * 0.5) { isOverlap = true; break; }
                    }
                    if (!isOverlap) uniqueFaces.push(face);
                });

                if (uniqueFaces.length > 0) {
                    CORE.log(`Phát hiện ${uniqueFaces.length} mục tiêu hợp lệ.`);
                    this.processQueue(uniqueFaces, sourceElement, 'face-queue');
                } else { CORE.log("Không tìm thấy mục tiêu rõ ràng."); }
            } catch (err) {}
        },

        processQueue(faces, sourceElement, containerId = 'face-queue', isAlert = false) {
            const queueContainer = document.getElementById(containerId);
            faces.forEach((face, index) => {
                const box = face.detection ? face.detection.box : face.box;
                const canvas = document.createElement('canvas');
                
                const srcW = sourceElement.naturalWidth || sourceElement.videoWidth || sourceElement.width;
                const srcH = sourceElement.naturalHeight || sourceElement.videoHeight || sourceElement.height;
                const padX = box.width * 0.15; const padY = box.height * 0.15;
                const sx = Math.max(0, box.x - padX); const sy = Math.max(0, box.y - padY);
                const sw = Math.min(srcW - sx, box.width + padX * 2); const sh = Math.min(srcH - sy, box.height + padY * 2);

                canvas.width = sw; canvas.height = sh;
                canvas.getContext('2d').drawImage(sourceElement, sx, sy, sw, sh, 0, 0, sw, sh);

                const faceDataUrl = canvas.toDataURL('image/png');
                const faceId = 'target_' + Date.now() + '_' + index;
                const descriptorArray = Array.from(face.descriptor); 

                // Gợi ý mặt quen
                let matchedId = null; let matchedName = "";
                if (CORE.state.faceMatcher) {
                    const match = CORE.state.faceMatcher.findBestMatch(face.descriptor);
                    if (match.label !== 'unknown' && match.distance <= 0.6) {
                        matchedId = match.label; matchedName = CORE.db.profiles[matchedId].info.name;
                    }
                }

                const card = document.createElement('div');
                card.className = isAlert ? 'face-card alert-card' : 'face-card';
                card.id = `card-${faceId}`;
                card.onclick = () => CORE.ui.openModal(faceId, faceDataUrl, descriptorArray, matchedId);
                
                const styleImg = isAlert ? 'height: 60px;' : '';
                let statusHtml = `<div style="color:${isAlert ? '#ff3333' : '#ffcc00'}; font-size:9px; font-weight:bold;">[ GÁN NHÃN ]</div>`;
                if (matchedId) {
                    statusHtml = `<div style="color:#00ffcc; font-size:9px; font-weight:bold;">Hỏi: ${matchedName}?</div>`;
                    card.style.borderColor = "#00ffcc";
                }

                card.innerHTML = `<img src="${faceDataUrl}" style="${styleImg}">${statusHtml}`;
                queueContainer.appendChild(card);
            });
            if (isAlert && CORE.combat) CORE.combat.updateUnknownCount();
        }
    },

    combat: {
        startSession() {
            const nameInput = document.getElementById('session-name').value.trim();
            if(!nameInput) return alert("Vui lòng nhập tên Phiên!");
            CORE.state.session = { isActive: true, name: nameInput, checkedInSet: new Set(), unknownsQueue: [] };
            document.getElementById('session-setup').style.display = 'none';
            document.getElementById('session-active').style.display = 'flex';
            document.getElementById('lbl-session-name').innerText = nameInput;
            document.getElementById('combat-count').innerText = "0";
            document.getElementById('combat-log').innerHTML = ''; 
            document.getElementById('combat-unknown-queue').innerHTML = ''; 
            document.getElementById('unknown-zone').style.display = 'none';
            CORE.log(`🟢 Đã thiết lập Phiên: [${nameInput}]`);
        },

        endSession() {
            this.stopScan(); CORE.state.session.isActive = false;
            document.getElementById('session-setup').style.display = 'block';
            document.getElementById('session-active').style.display = 'none';
            document.getElementById('session-name').value = '';
            CORE.log("🛑 Đã kết thúc Phiên.");
        },

        buildFaceMatcher() {
            const labeledDescriptors = [];
            for (const id in CORE.db.profiles) {
                const p = CORE.db.profiles[id];
                if (!p.biometrics) continue;
                let descArray = [];
                if (p.biometrics.descriptors && p.biometrics.descriptors.length > 0) {
                    descArray = p.biometrics.descriptors.map(d => new Float32Array(d));
                } else if (p.biometrics.descriptor && p.biometrics.descriptor.length === 128) {
                    descArray = [new Float32Array(p.biometrics.descriptor)];
                    p.biometrics.descriptors = [p.biometrics.descriptor]; delete p.biometrics.descriptor;
                }
                if (descArray.length > 0) labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(id, descArray));
            }
            CORE.state.faceMatcher = labeledDescriptors.length > 0 ? new faceapi.FaceMatcher(labeledDescriptors, 0.55) : null;
        },

        toggleScan() {
            if (!CORE.state.session.isActive) return alert("Tạo Phiên Nhiệm Vụ trước khi bật Radar!");
            const btn = document.getElementById('btn-scan-live');
            if (CORE.state.isCombatScanning) {
                this.stopScan(); btn.innerHTML = "🔴 BẬT RADAR QUÉT"; btn.style.borderColor = "var(--neon)";
            } else {
                CORE.state.isCombatScanning = true; btn.innerHTML = "⏹ DỪNG RADAR"; btn.style.borderColor = "var(--alert)";
                this.scanLoop();
            }
        },

        stopScan() {
            CORE.state.isCombatScanning = false;
            if(CORE.state.combatInterval) clearTimeout(CORE.state.combatInterval);
            const canvas = document.getElementById('combat-out');
            if(canvas) canvas.getContext('2d').clearRect(0,0, canvas.width, canvas.height);
        },

        async scanLoop() {
            if (!CORE.state.isCombatScanning) return;
            const videoElement = document.getElementById('combat-vid');
            const canvas = document.getElementById('combat-out');
            
            if (videoElement.paused || videoElement.ended || !videoElement.srcObject) {
                CORE.state.combatInterval = setTimeout(() => this.scanLoop(), 1000); return;
            }

            const displaySize = { width: videoElement.videoWidth, height: videoElement.videoHeight };
            if(displaySize.width === 0) { CORE.state.combatInterval = setTimeout(() => this.scanLoop(), 500); return; }
            faceapi.matchDimensions(canvas, displaySize);

            try {
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 });
                const detections = await faceapi.detectAllFaces(videoElement, options).withFaceLandmarks().withFaceDescriptors();
                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                resizedDetections.forEach(result => {
                    const box = result.detection.box;
                    let label = 'unknown'; let distance = 1;

                    if (CORE.state.faceMatcher) {
                        const match = CORE.state.faceMatcher.findBestMatch(result.descriptor);
                        label = match.label; distance = match.distance;
                    }

                    if (label !== 'unknown' && distance <= 0.55) {
                        const profile = CORE.db.profiles[label];
                        ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2; ctx.strokeRect(box.x, box.y, box.width, box.height);
                        ctx.fillStyle = "#00ffcc"; ctx.fillRect(box.x, box.y - 20, box.width, 20);
                        ctx.fillStyle = "#000"; ctx.font = "bold 12px Arial";
                        ctx.fillText(`${profile.info.name} (${Math.round((1 - distance)*100)}%)`, box.x + 5, box.y - 5);
                        this.recordCheckIn(profile);
                    } else {
                        ctx.strokeStyle = "#ff3333"; ctx.lineWidth = 2; ctx.strokeRect(box.x, box.y, box.width, box.height);
                        ctx.fillStyle = "rgba(255,51,51,0.5)"; ctx.fillRect(box.x, box.y, box.width, box.height);
                        this.processUnknown(result, videoElement);
                    }
                });
            } catch (err) {}

            CORE.state.combatInterval = setTimeout(() => this.scanLoop(), 150);
        },

        processUnknown(result, sourceElement) {
            const descriptor = result.descriptor; let isAlreadyQueued = false;
            for (let u of CORE.state.session.unknownsQueue) {
                if (faceapi.euclideanDistance(descriptor, u) < 0.5) { isAlreadyQueued = true; break; }
            }
            if (!isAlreadyQueued) {
                CORE.state.session.unknownsQueue.push(descriptor);
                document.getElementById('unknown-zone').style.display = 'block';
                CORE.ai.processQueue([result], sourceElement, 'combat-unknown-queue', true);
            }
        },

        updateUnknownCount() {
            const container = document.getElementById('combat-unknown-queue');
            if(!container) return;
            const count = container.children.length;
            document.getElementById('unknown-count').innerText = count;
            if (count === 0) document.getElementById('unknown-zone').style.display = 'none';
        },

        recordCheckIn(profile) {
            if (CORE.state.session.checkedInSet.has(profile.id)) return; 
            CORE.state.session.checkedInSet.add(profile.id);
            const time = new Date().toLocaleTimeString();
            const logBox = document.getElementById('combat-log');
            if (CORE.state.session.checkedInSet.size === 1) logBox.innerHTML = ''; 
            logBox.innerHTML = `
                <div class="checkin-item">
                    <img src="${profile.media.base64}">
                    <div>
                        <strong style="color:#00ffcc">${profile.info.name}</strong><br>
                        <span style="color:#aaa; font-size:10px;">${profile.info.unit} | LÚC: ${time}</span>
                    </div>
                </div>
            ` + logBox.innerHTML;
            document.getElementById('combat-count').innerText = CORE.state.session.checkedInSet.size;
        }
    },

    log(message) {
        const logBox = document.getElementById('system-logs');
        const time = new Date().toLocaleTimeString();
        logBox.innerHTML += `<div class="log-line"><span style="color:#555">[${time}]</span> ${message}</div>`;
        if(logBox) logBox.scrollTop = logBox.scrollHeight;
    }
};

window.onload = () => CORE.init();