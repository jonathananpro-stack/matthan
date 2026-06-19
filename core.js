const CORE = {
    state: {
        mode: 'TRAIN',
        facingMode: "user",
        currentSourceType: null,
        isCombatScanning: false,
        combatInterval: null,
        faceMatcher: null,
        
        // Dữ liệu Phiên (Session)
        session: {
            isActive: false,
            name: "",
            checkedInSet: new Set(),
            unknownsQueue: [] // Mảng chứa descriptor kẻ lạ để không chụp trùng lặp
        }
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

            const secureID = this.generateFaceID();
            this.profiles[secureID] = {
                id: secureID,
                info: { name: name, unit: unit },
                biometrics: { descriptor: descriptorArray },
                media: { base64: imgSrc },
                meta: { createdAt: new Date().toLocaleString() }
            };

            localStorage.setItem('SEC_AI_KNOWLEDGE_BASE', JSON.stringify(this.profiles));
            CORE.log(`[HUẤN LUYỆN] Đã nạp DNA: <b style="color:#00ffcc">${name}</b>`);
            
            // Xây dựng lại Lõi So Khớp ngay lập tức để Radar nhận ra ngay
            CORE.combat.buildFaceMatcher(); 

            // Xóa thẻ khỏi hàng đợi (Dù là Hàng đợi Huấn luyện hay Hàng đợi Kẻ lạ)
            const card = document.getElementById(`card-${tempId}`);
            if (card) {
                card.remove();
                // Cập nhật lại số đếm thẻ lạ nếu đang ở mode Combat
                CORE.combat.updateUnknownCount();
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

        openModal(id, imgSrc, descriptorArray) {
            document.getElementById('modal-id').value = id;
            document.getElementById('modal-img').src = imgSrc;
            document.getElementById('modal-descriptor').value = descriptorArray.join(','); 
            document.getElementById('modal-name').value = '';
            document.getElementById('modal-unit').value = '';
            document.getElementById('label-modal').classList.add('active');
            document.getElementById('modal-name').focus();
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
        this.log("Đang nạp TỔ HỢP 3 MẠNG NƠ-RON AI...");
        try {
            const modelPath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(modelPath),
                faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
                faceapi.nets.faceRecognitionNet.loadFromUri(modelPath)
            ]);
            document.getElementById('sys-status').innerText = "SYS: [ TRỰC TUYẾN ]";
            this.db.loadFromStorage();
        } catch (error) {
            this.log(`<span style='color:red'>LỖI NẠP AI: ${error.message}</span>`);
        }
    },

    media: {
        async startCamera(videoId) {
            const videoElement = document.getElementById(videoId);
            try {
                if (videoElement.srcObject) videoElement.srcObject.getTracks().forEach(track => track.stop());
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: CORE.state.facingMode } });
                videoElement.srcObject = stream;
                videoElement.style.display = 'block';
                CORE.state.currentSourceType = 'camera';
            } catch (e) {
                CORE.log("<span style='color:red'>LỖI: Trình duyệt từ chối Camera!</span>");
            }
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
                    imgElement.style.display = 'block';
                    videoElement.style.display = 'none';
                    CORE.state.currentSourceType = 'image';
                }
            };
            reader.readAsDataURL(file);
        },
        clearSource(vidId, imgId, canvasId) {
            const v = document.getElementById(vidId);
            const i = document.getElementById(imgId);
            if (v.srcObject) v.srcObject.getTracks().forEach(track => track.stop());
            v.style.display = 'none'; i.style.display = 'none';
            document.getElementById(canvasId).getContext('2d').clearRect(0,0,10000,10000);
            CORE.state.currentSourceType = null;
        }
    },

    ai: {
        async extractFacesTrain() {
            CORE.log("Đang phân tích và mã hóa DNA khuôn mặt...");
            const sourceElement = document.getElementById('vid').style.display === 'block' ? document.getElementById('vid') : document.getElementById('img-view');
            const ch = document.getElementById('crosshair'); ch.classList.add('locked');

            try {
                const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
                const faces = await faceapi.detectAllFaces(sourceElement, options).withFaceLandmarks().withFaceDescriptors();

                if (faces.length > 0) {
                    this.processQueue(faces, sourceElement, 'face-queue');
                }
                setTimeout(() => ch.classList.remove('locked'), 1000);
            } catch (err) {}
        },

        processQueue(faces, sourceElement, containerId, isAlert = false) {
            const queueContainer = document.getElementById(containerId);
            faces.forEach((face, index) => {
                const box = face.detection ? face.detection.box : face.box;
                const canvas = document.createElement('canvas');
                const pad = 20;
                canvas.width = box.width + pad*2; canvas.height = box.height + pad*2;
                canvas.getContext('2d').drawImage(sourceElement, box.x - pad, box.y - pad, box.width + pad*2, box.height + pad*2, 0, 0, canvas.width, canvas.height);

                const faceDataUrl = canvas.toDataURL('image/png');
                const faceId = 'target_' + Date.now() + '_' + index;
                const descriptorArray = Array.from(face.descriptor); 

                const card = document.createElement('div');
                card.className = isAlert ? 'face-card alert-card' : 'face-card';
                card.id = `card-${faceId}`;
                card.onclick = () => CORE.ui.openModal(faceId, faceDataUrl, descriptorArray);
                
                // Thu nhỏ kích thước thẻ nếu đang ở Hàng đợi trực chiến để dễ nhìn ngang
                const styleImg = isAlert ? 'width: 60px; height: 60px; object-fit: cover;' : '';
                
                card.innerHTML = `<img src="${faceDataUrl}" style="${styleImg}">
                                  <div style="color:${isAlert ? '#ff3333' : '#ffcc00'}; font-size:9px; margin-top:3px; font-weight:bold;">[ GÁN NHÃN ]</div>`;
                
                queueContainer.appendChild(card);
            });
            
            if (isAlert) CORE.combat.updateUnknownCount();
        }
    },

    // ================= MODULE TRỰC CHIẾN (QUẢN LÝ PHIÊN) =================
    combat: {
        startSession() {
            const nameInput = document.getElementById('session-name').value.trim();
            if(!nameInput) return alert("Vui lòng nhập tên Phiên nhiệm vụ!");
            
            // Khởi tạo trạng thái Phiên
            CORE.state.session = {
                isActive: true,
                name: nameInput,
                checkedInSet: new Set(),
                unknownsQueue: []
            };

            // Giao diện
            document.getElementById('session-setup').style.display = 'none';
            document.getElementById('session-active').style.display = 'flex';
            document.getElementById('lbl-session-name').innerText = nameInput;
            document.getElementById('combat-count').innerText = "0";
            document.getElementById('combat-log').innerHTML = ''; // Xóa log cũ
            document.getElementById('combat-unknown-queue').innerHTML = ''; // Xóa hàng đợi lạ
            document.getElementById('unknown-zone').style.display = 'none';

            CORE.log(`🟢 Đã thiết lập Phiên: [${nameInput}]`);
        },

        endSession() {
            this.stopScan();
            CORE.state.session.isActive = false;
            
            // Giao diện
            document.getElementById('session-setup').style.display = 'block';
            document.getElementById('session-active').style.display = 'none';
            document.getElementById('session-name').value = '';
            
            CORE.log("🛑 Đã kết thúc Phiên nhiệm vụ.");
        },

        buildFaceMatcher() {
            const labeledDescriptors = [];
            for (const id in CORE.db.profiles) {
                const p = CORE.db.profiles[id];
                if (p.biometrics && p.biometrics.descriptor.length === 128) {
                    labeledDescriptors.push(new faceapi.LabeledFaceDescriptors(id, [new Float32Array(p.biometrics.descriptor)]));
                }
            }
            if (labeledDescriptors.length > 0) {
                CORE.state.faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
            } else {
                CORE.state.faceMatcher = null; // CSDL trống
            }
        },

        toggleScan() {
            if (!CORE.state.session.isActive) return alert("Vui lòng Tạo Phiên Nhiệm Vụ trước khi bật Radar!");
            const btn = document.getElementById('btn-scan-live');
            if (CORE.state.isCombatScanning) {
                this.stopScan();
                btn.innerHTML = "🔴 BẬT RADAR QUÉT";
                btn.style.borderColor = "var(--neon)";
            } else {
                CORE.state.isCombatScanning = true;
                btn.innerHTML = "⏹ DỪNG RADAR";
                btn.style.borderColor = "var(--alert)";
                this.scanLoop();
            }
        },

        stopScan() {
            CORE.state.isCombatScanning = false;
            if(CORE.state.combatInterval) clearTimeout(CORE.state.combatInterval);
            const canvas = document.getElementById('combat-out');
            canvas.getContext('2d').clearRect(0,0, canvas.width, canvas.height);
        },

        async scanLoop() {
            if (!CORE.state.isCombatScanning) return;
            const videoElement = document.getElementById('combat-vid');
            const canvas = document.getElementById('combat-out');
            
            if (videoElement.paused || videoElement.ended || !videoElement.srcObject) {
                CORE.state.combatInterval = setTimeout(() => this.scanLoop(), 1000);
                return;
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
                    let label = 'unknown';
                    let distance = 1;

                    if (CORE.state.faceMatcher) {
                        const match = CORE.state.faceMatcher.findBestMatch(result.descriptor);
                        label = match.label; distance = match.distance;
                    }

                    // Xử lý Giao diện Canvas Box
                    if (label !== 'unknown' && distance <= 0.55) {
                        // 1. NHẬN DIỆN ĐƯỢC NGƯỜI QUEN
                        const profile = CORE.db.profiles[label];
                        ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
                        ctx.strokeRect(box.x, box.y, box.width, box.height);
                        ctx.fillStyle = "#00ffcc"; ctx.fillRect(box.x, box.y - 20, box.width, 20);
                        ctx.fillStyle = "#000"; ctx.font = "bold 12px Arial";
                        ctx.fillText(`${profile.info.name} (${Math.round((1 - distance)*100)}%)`, box.x + 5, box.y - 5);
                        
                        this.recordCheckIn(profile);
                    } else {
                        // 2. PHÁT HIỆN KẺ LẠ -> Đẩy vào Hàng đợi (Active Learning)
                        ctx.strokeStyle = "#ff3333"; ctx.lineWidth = 2;
                        ctx.strokeRect(box.x, box.y, box.width, box.height);
                        ctx.fillStyle = "rgba(255,51,51,0.5)"; ctx.fillRect(box.x, box.y, box.width, box.height);
                        
                        this.processUnknown(result, videoElement);
                    }
                });
            } catch (err) {}

            CORE.state.combatInterval = setTimeout(() => this.scanLoop(), 150); // Lặp lại nhanh
        },

        processUnknown(result, sourceElement) {
            // Kiểm tra xem Kẻ Lạ này đã được đẩy vào hàng đợi trước đó chưa (Chống spam cắt ảnh liên tục)
            const descriptor = result.descriptor;
            let isAlreadyQueued = false;
            
            for (let u of CORE.state.session.unknownsQueue) {
                // Tính khoảng cách DNA, nếu < 0.5 thì vẫn là cái ông lạ mặt vừa nãy
                const dist = faceapi.euclideanDistance(descriptor, u);
                if (dist < 0.5) { isAlreadyQueued = true; break; }
            }

            if (!isAlreadyQueued) {
                // Đẩy DNA vào bộ nhớ đệm chống spam
                CORE.state.session.unknownsQueue.push(descriptor);
                
                // Mở giao diện Hàng đợi lạ
                document.getElementById('unknown-zone').style.display = 'block';
                
                // Gọi AI cắt ảnh đưa vào Hàng đợi "combat-unknown-queue"
                CORE.ai.processQueue([result], sourceElement, 'combat-unknown-queue', true);
            }
        },

        updateUnknownCount() {
            const container = document.getElementById('combat-unknown-queue');
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
