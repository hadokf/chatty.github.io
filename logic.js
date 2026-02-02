// --- 1. FIREBASE CONFIGURATION (Based on your provided keys) ---
const firebaseConfig = {
  apiKey: "AIzaSyAGN80kDKzxSEPacwS1eE0nCnoK8T1v8Qk",
  authDomain: "chatty-33835.firebaseapp.com",
  projectId: "chatty-33835",
  storageBucket: "chatty-33835.firebasestorage.app",
  messagingSenderId: "485619898976",
  appId: "1:485619898976:web:e2ce8a544e4a4ea6494105",
  measurementId: "G-Y0WDD83SQL"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.database();


// --- 2. AUTH & REDIRECT LOGIC ---
auth.onAuthStateChanged(user => {
    const path = window.location.pathname;
    let page = path.split("/").pop();
    if(page === "") page = "index.html"; 

    if (user) {
        console.log("User Logged In:", user.email);

        if (page === "index.html") {
            window.location.href = "app.html";
        }
        
        // PROFILE UPDATE
        if(document.getElementById('user-email-display')) {
            const userId = user.uid;
            
            db.ref('users/' + userId).on('value', snapshot => {
                const data = snapshot.val();
                let roleBadge = "Member";
                let coins = 0;
                let isOwner = false;

                if (data) {
                    if (data.role === 'owner') {
                        isOwner = true;
                        roleBadge = "👑 Owner (God Mode)";
                        coins = "∞"; // Unlimited symbol
                    } else if (data.premium) {
                        roleBadge = "💎 Premium";
                        coins = data.coins || 0;
                    } else {
                        coins = data.coins || 0;
                    }
                }

                // Update UI
                if(document.getElementById('role-badge')) {
                    document.getElementById('role-badge').innerText = roleBadge;
                    if(isOwner) {
                        document.getElementById('role-badge').style.background = "#FFD700";
                        document.getElementById('role-badge').style.color = "black";
                        document.getElementById('user-email-display').style.color = "#FFD700";
                    }
                }
                if(document.getElementById('coin-count')) document.getElementById('coin-count').innerText = coins;
            });

            document.getElementById('user-email-display').innerText = user.email.split('@')[0];
        }

    } else {
        console.log("No User");
        if (page === "app.html") {
            window.location.href = "index.html";
        }
    }
});


// --- 3. LOGIN FUNCTIONS ---
function loginUser() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Please fill all fields");

    auth.signInWithEmailAndPassword(email, password)
        .catch(err => document.getElementById('error-msg').innerText = err.message);
}

function registerUser() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password) return alert("Please fill all fields");

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            db.ref('users/' + user.uid).set({
                email: email,
                coins: 10,
                role: 'member',
                premium: false
            });
            alert("Account Created!");
        })
        .catch(err => document.getElementById('error-msg').innerText = err.message);
}

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then((result) => {
        if (result.additionalUserInfo.isNewUser) {
            const user = result.user;
            db.ref('users/' + user.uid).set({
                email: user.email,
                coins: 10,
                role: 'member',
                premium: false
            });
        }
    }).catch((error) => {
        alert("Google Login Error: " + error.message);
    });
}

function logout() {
    auth.signOut();
}


// --- 4. APP LOGIC ---
function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');
}

if (window.location.pathname.includes("app.html")) {
    let peer, myStream, currentCall, myPeerId;
    let isMatching = false;

    function startMatching() {
        if(isMatching) return;
        isMatching = true;

        const statusText = document.getElementById('status-text');
        statusText.innerText = "Connecting Camera...";
        
        navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            myStream = stream;
            document.getElementById('myVideo').srcObject = stream;
            
            statusText.innerText = "Connecting to Server...";
            peer = new Peer(); 

            peer.on('open', id => {
                myPeerId = id;
                findMatch(); 
            });

            peer.on('call', call => {
                document.getElementById('video-container').style.display = 'block';
                call.answer(stream);
                handleCall(call);
            });
        })
        .catch(err => {
            alert("Camera error! Check permissions.");
            isMatching = false;
        });
    }

    function findMatch() {
        document.getElementById('status-text').innerText = "Searching for Partner...";
        const queueRef = db.ref('waiting_queue');
        
        queueRef.once('value', snapshot => {
            const users = snapshot.val();
            if (users) {
                const keys = Object.keys(users);
                const partnerKey = keys[0];
                const partnerId = users[partnerKey];

                if (partnerId !== myPeerId) {
                    db.ref('waiting_queue/' + partnerKey).remove().then(() => {
                        const call = peer.call(partnerId, myStream);
                        handleCall(call);
                    });
                } else {
                    addToQueue();
                }
            } else {
                addToQueue();
            }
        });
    }

    function addToQueue() {
        const ref = db.ref('waiting_queue').push();
        ref.set(myPeerId);
        ref.onDisconnect().remove();
        document.getElementById('status-text').innerText = "Waiting for someone to join...";
    }

    function handleCall(call) {
        currentCall = call;
        document.getElementById('video-container').style.display = 'block';
        call.on('stream', remoteStream => {
            document.getElementById('remoteVideo').srcObject = remoteStream;
        });
        call.on('close', endCall);
    }

    function endCall() {
        if (currentCall) currentCall.close();
        document.getElementById('video-container').style.display = 'none';
        findMatch(); 
    }

    function findNext() { endCall(); }
}
