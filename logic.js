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

// --- 2. AUTH & REDIRECT ---
auth.onAuthStateChanged(user => {
    const path = window.location.pathname;
    let page = path.split("/").pop();
    if(page === "") page = "index.html"; 

    if (user) {
        if (page === "index.html") window.location.href = "app.html";
        if(document.getElementById('user-email-display')) {
            document.getElementById('user-email-display').innerText = user.email.split('@')[0];
            // Load Profile Data (Coins/Role) Logic here...
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

// --- 4. VIDEO CHAT LOGIC (Advanced) ---
if (window.location.pathname.includes("app.html")) {
    
    let peer, myStream, currentCall, myPeerId, currentPartnerId;
    let isMatching = false;
    let currentCameraMode = 'user'; // 'user' (Front) or 'environment' (Back)

    // --- Start Matching ---
    function startMatching() {
        if(isMatching) return;
        isMatching = true;

        // UI Updates
        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('cancel-btn').style.display = 'inline-block';
        const statusText = document.getElementById('status-text');
        statusText.innerText = "Connecting Camera...";
        
        // Camera ON
        openCamera(currentCameraMode).then(() => {
            statusText.innerText = "Connecting to Server...";
            if(!peer) {
                peer = new Peer();
                peer.on('open', id => {
                    myPeerId = id;
                    findMatch(); 
                });
                peer.on('call', call => {
                    // Answer Call
                    document.getElementById('video-container').style.display = 'block';
                    call.answer(myStream);
                    handleCall(call);
                });
            } else {
                findMatch();
            }
        });
    }

    // --- Helper: Open Camera ---
    function openCamera(mode) {
        return navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: true })
        .then(stream => {
            if(myStream) myStream.getTracks().forEach(track => track.stop()); // Stop old stream
            myStream = stream;
            document.getElementById('myVideo').srcObject = stream;
            
            // If inside a call, replace track (Advanced) - For now, we restart logic
            if(currentCall) {
                const videoTrack = stream.getVideoTracks()[0];
                const sender = currentCall.peerConnection.getSenders().find(s => s.track.kind === videoTrack.kind);
                if(sender) sender.replaceTrack(videoTrack);
            }
        })
        .catch(err => {
            alert("Camera Error: " + err.message);
            isMatching = false;
            resetUI();
        });
    }

    // --- Switch Camera Logic ---
    window.switchCamera = function() {
        currentCameraMode = (currentCameraMode === 'user') ? 'environment' : 'user';
        openCamera(currentCameraMode);
    };

    // --- Cancel Search Logic ---
    window.cancelSearch = function() {
        isMatching = false;
        
        // Remove from waiting queue
        db.ref('waiting_queue').orderByValue().equalTo(myPeerId).once('value', snapshot => {
            snapshot.forEach(child => child.ref.remove());
        });

        // Close Camera & Peer
        if(myStream) myStream.getTracks().forEach(track => track.stop());
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

    // --- Matching Logic (with Block check) ---
    function findMatch() {
        if(!isMatching) return;
        document.getElementById('status-text').innerText = "Searching for Partner...";
        
        // Load Blocked Users List
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
                        
                        // Check if not me AND not blocked
                        if (partnerId !== myPeerId && !blockedUsers[partnerId]) {
                            foundPartner = true;
                            currentPartnerId = partnerId; // Save for reporting

                            db.ref('waiting_queue/' + key).remove().then(() => {
                                const call = peer.call(partnerId, myStream);
                                handleCall(call);
                            });
                            break; 
                        }
                    }

                    if(!foundPartner) addToQueue(); // Everyone is blocked or me
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
        currentPartnerId = call.peer; // Store partner ID
        document.getElementById('video-container').style.display = 'block';
        document.getElementById('status-text').innerText = "";
        
        call.on('stream', remoteStream => {
            document.getElementById('remoteVideo').srcObject = remoteStream;
        });
        call.on('close', () => { if(isMatching) findMatch(); });
        call.on('error', () => { if(isMatching) findMatch(); });
    }

    // --- Report User Logic ---
    window.reportUser = function() {
        if(currentPartnerId && confirm("Report and Block this user?")) {
            // Add to Block List in Firebase
            db.ref('users/' + auth.currentUser.uid + '/blocked/' + currentPartnerId).set(true);
            alert("User Blocked!");
            findNext(); // Skip immediately
        }
    };

    window.endCall = function() {
        if (currentCall) currentCall.close();
        cancelSearch(); // Fully stop
    };

    window.findNext = function() {
        if (currentCall) currentCall.close();
        // Camera stays open, just find new match
        findMatch();
    };
}

