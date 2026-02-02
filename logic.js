// --- 1. FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyAGN80kDKzxSEPacwS1eE0nCnoK8T1v8Qk",
  authDomain: "chatty-33835.firebaseapp.com",
  projectId: "chatty-33835",
  storageBucket: "chatty-33835.firebasestorage.app",
  messagingSenderId: "485619898976",
  appId: "1:485619898976:web:e2ce8a544e4a4ea6494105",
  measurementId: "G-Y0WDD83SQL"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();
const db = firebase.database();

// --- 2. AUTH LOGIC ---
auth.onAuthStateChanged(user => {
    const path = window.location.pathname;
    let page = path.split("/").pop();
    if(page === "") page = "index.html"; 

    if (user) {
        if (page === "index.html") window.location.href = "app.html";
        if(document.getElementById('user-email-display')) {
            document.getElementById('user-email-display').innerText = user.email.split('@')[0];
        }
    } else {
        if (page === "app.html") window.location.href = "index.html";
    }
});

// --- 3. LOGIN FUNCTIONS ---
function loginUser() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Please fill all fields");
    auth.signInWithEmailAndPassword(email, password).catch(err => document.getElementById('error-msg').innerText = err.message);
}

function registerUser() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Please fill all fields");
    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            db.ref('users/' + userCredential.user.uid).set({ email: email, role: 'member', coins: 10 });
            alert("Account Created!");
        })
        .catch(err => document.getElementById('error-msg').innerText = err.message);
}

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert(err.message));
}

function logout() { auth.signOut(); }
function switchTab(tabId, el) {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
}

// --- 4. VIDEO CHAT LOGIC (FIXED) ---
if (window.location.pathname.includes("app.html")) {
    
    let peer, myStream, currentCall, myPeerId, currentPartnerId;
    let isMatching = false;
    let currentCameraMode = 'user'; // 'user' = Front, 'environment' = Back

    function startMatching() {
        if(isMatching) return;
        isMatching = true;

        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('cancel-btn').style.display = 'inline-block';
        const statusText = document.getElementById('status-text');
        statusText.innerText = "Accessing Camera...";
        
        // Open Camera (Audio + Video)
        openCamera(currentCameraMode).then(() => {
            statusText.innerText = "Connecting to Server...";
            if(!peer) {
                peer = new Peer();
                peer.on('open', id => {
                    myPeerId = id;
                    findMatch(); 
                });
                peer.on('call', call => {
                    document.getElementById('video-container').style.display = 'block';
                    call.answer(myStream);
                    handleCall(call);
                });
                peer.on('error', err => {
                    console.error("Peer Error:", err);
                    statusText.innerText = "Connection Error. Retrying...";
                    setTimeout(findMatch, 2000);
                });
            } else {
                findMatch();
            }
        });
    }

    // --- Camera Handler (With Switch Fix) ---
    function openCamera(mode) {
        return navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: mode }, 
            audio: true // Audio is REQUIRED
        })
        .then(stream => {
            // Stop old tracks if exist
            if(myStream) myStream.getTracks().forEach(track => track.stop());
            
            myStream = stream;
            document.getElementById('myVideo').srcObject = stream;
            
            // If already in a call, replace the video track seamlessly
            if(currentCall && currentCall.peerConnection) {
                const videoTrack = stream.getVideoTracks()[0];
                const sender = currentCall.peerConnection.getSenders().find(s => s.track.kind === videoTrack.kind);
                if(sender) {
                    sender.replaceTrack(videoTrack).catch(err => console.error("Track replace error:", err));
                }
            }
        })
        .catch(err => {
            alert("Camera/Mic Error: " + err.message);
            isMatching = false;
            resetUI();
        });
    }

    window.switchCamera = function() {
        // Toggle Mode
        currentCameraMode = (currentCameraMode === 'user') ? 'environment' : 'user';
        openCamera(currentCameraMode);
    };

    window.cancelSearch = function() {
        isMatching = false;
        if(myPeerId) {
            db.ref('waiting_queue').orderByValue().equalTo(myPeerId).once('value', snapshot => {
                snapshot.forEach(child => child.ref.remove());
            });
        }
        if(myStream) myStream.getTracks().forEach(track => track.stop());
        if(currentCall) currentCall.close();
        if(peer) peer.destroy();
        peer = null;
        resetUI();
    };

    function resetUI() {
        document.getElementById('video-container').style.display = 'none';
        document.getElementById('start-btn').style.display = 'inline-block';
        document.getElementById('cancel-btn').style.display = 'none';
        document.getElementById('status-text').innerText = "";
    }

    function findMatch() {
        if(!isMatching) return;
        document.getElementById('status-text').innerText = "Searching for Partner...";
        document.getElementById('call-timer').innerText = "Searching...";
        
        db.ref('users/' + auth.currentUser.uid + '/blocked').once('value').then(blockedSnapshot => {
            const blockedUsers = blockedSnapshot.val() || {};
            const queueRef = db.ref('waiting_queue');
            
            queueRef.once('value', snapshot => {
                const users = snapshot.val();
                if (users) {
                    const keys = Object.keys(users);
                    let foundPartner = false;
                    for(let key of keys) {
                        const partnerId = users[key];
                        if (partnerId !== myPeerId && !blockedUsers[partnerId]) {
                            foundPartner = true;
                            currentPartnerId = partnerId;
                            db.ref('waiting_queue/' + key).remove().then(() => {
                                const call = peer.call(partnerId, myStream);
                                handleCall(call);
                            });
                            break; 
                        }
                    }
                    if(!foundPartner) addToQueue();
                } else {
                    addToQueue();
                }
            });
        });
    }

    function addToQueue() {
        if(!isMatching) return;
        const ref = db.ref('waiting_queue').push();
        ref.set(myPeerId);
        ref.onDisconnect().remove();
        document.getElementById('status-text').innerText = "Waiting for someone...";
    }

    function handleCall(call) {
        currentCall = call;
        currentPartnerId = call.peer;
        
        // Show Video UI
        document.getElementById('video-container').style.display = 'block';
        document.getElementById('status-text').innerText = "";
        
        // Update WhatsApp Style Name
        document.getElementById('remote-name').innerText = "ID: " + currentPartnerId.substring(0, 6) + "...";
        document.getElementById('call-timer').innerText = "Connected";

        call.on('stream', remoteStream => {
            const remoteVideo = document.getElementById('remoteVideo');
            remoteVideo.srcObject = remoteStream;
            
            // --- AUDIO FIX ---
            // Ensure remote video is NOT muted and force play
            remoteVideo.muted = false;
            remoteVideo.play().catch(e => console.error("Auto-play error:", e));
        });

        call.on('close', () => { if(isMatching) findMatch(); });
        call.on('error', () => { if(isMatching) findMatch(); });
    }

    window.reportUser = function() {
        if(currentPartnerId && confirm("Block this user?")) {
            db.ref('users/' + auth.currentUser.uid + '/blocked/' + currentPartnerId).set(true);
            findNext();
        }
    };

    window.endCall = function() {
        if (currentCall) currentCall.close();
        cancelSearch();
    };

    window.findNext = function() {
        if (currentCall) currentCall.close();
        document.getElementById('remoteVideo').srcObject = null;
        document.getElementById('remote-name').innerText = "Finding next...";
        findMatch();
    };
}

