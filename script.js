let subjectCount = 0;
const numScoreColumns = 8; // 1st-3rd Period, 1st Exam, 4th-6th Period, Final Exam
const columnIdMap = ['avg1', 'avg2', 'avg3', 'avgExam1', 'avg4', 'avg5', 'avg6', 'avgExam2'];
let currentThreshold = 70;
let activeColumns = []; // Tracks columns with data (indices)
let columnNames = ['1st Period', '2nd Period', '3rd Period', 'Exam 1', '4th Period', '5th Period', '6th Period', 'Final']; // For labeling
let lastOverallAvg = '0.00'; // For stats
let lastSubjectAvgs = []; // For stats
let currentUser = null; // Firebase user
let isGPAMode = false; // GPA toggle state

// NEW: Chart instances for visualizations
let subjectBarChart = null;
let gradePieChart = null;

// NEW: QR Scanning Variables
let videoStream = null;
let qrScanningInterval = null;

// REMOVED: Hardcoded OpenAI key - now handled via Vercel proxy (/api/openai)
// Ensure you have /api/openai.js deployed on Vercel with OPENAI_API_KEY env var

// NEW: Debounce utility for input events
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// UPDATED: Letter grade mapping (handles % and GPA)
function getLetterGrade(avg, isGPA = false) {
    const numAvg = parseFloat(avg);
    if (isGPA) {
        // GPA 4.0 scale mapping
        if (numAvg >= 3.7) return 'A';
        if (numAvg >= 3.3) return 'A-';
        if (numAvg >= 3.0) return 'B+';
        if (numAvg >= 2.7) return 'B';
        if (numAvg >= 2.3) return 'B-';
        if (numAvg >= 2.0) return 'C+';
        if (numAvg >= 1.7) return 'C';
        if (numAvg >= 1.3) return 'C-';
        if (numAvg >= 1.0) return 'D';
        return 'F';
    } else {
        // Percentage scale (original)
        if (numAvg >= 90) return 'A';
        if (numAvg >= 80) return 'B';
        if (numAvg >= 70) return 'C';
        if (numAvg >= 60) return 'D';
        return 'F';
    }
}

// UPDATED: GPA mapping (bucketed for accuracy)
function scaleToGPA(score) {
    const letter = getLetterGrade(score, false); // % to letter
    const gpaMap = { 
        'A': 4.0, 'A-': 3.7, 
        'B+': 3.3, 'B': 3.0, 'B-': 2.7, 
        'C+': 2.3, 'C': 2.0, 'C-': 1.7, 
        'D': 1.0, 'F': 0.0 
    };
    return gpaMap[letter] || 0.0;
}

// UPDATED: Retry last message (for AI errors) - now handles both chat types
let lastUserMessage = '';
function retryLastMessage(chatType = 'full') {  // Default to full chat
    if (lastUserMessage) {
        const input = chatType === 'floating' ? 
            document.getElementById('floatingChatInput') : 
            document.getElementById('aiChatInput');
        if (input) {
            input.value = lastUserMessage;
            if (chatType === 'floating') {
                sendMessageToFloatingAI();
            } else {
                sendMessageToAI();
            }
        }
    }
}

// UPDATED: AI Chat Functions (now proxies through Vercel /api/openai)
function handleKeyPress(e) {
    if (e.key === 'Enter') sendMessageToAI();
}

// NEW: Floating chat keypress handler
function handleFloatingKeyPress(e) {
    if (e.key === 'Enter') sendMessageToFloatingAI();
}

async function sendMessageToAI() {
    const input = document.getElementById('aiChatInput');
    const message = input.value.trim();
    if (!message) return;

    lastUserMessage = message; // For retry

    // Add user message to chat
    addMessageToChat(message, 'user');
    input.value = '';
    showAIStatus('🤔 Thinking...', 'loading');

    // NEW: Pass grades context for smarter replies
    const context = lastSubjectAvgs.length > 0 ? 
        `Current grades: Overall ${lastOverallAvg}%. Subjects: ${lastSubjectAvgs.map(s => `${s.name}: ${s.avg}%`).join('; ')}.` : 
        'No grades calculated yet.';

    try {
        const response = await fetch('/api/openai', {  // Vercel proxy endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful AI assistant for the Grade Calculator tool. Provide concise, friendly advice on grades, study tips, GPA calculation, or tool usage. Keep responses under 150 words. Be encouraging!'
                    },
                    { role: 'user', content: `${context} User query: ${message}` }
                ],
                max_tokens: 150,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('AI service not available—check deployment.');
            }
            const errorData = await response.json();
            throw new Error(errorData.error || `API Error ${response.status}`);
        }

        const data = await response.json();
        const aiReply = data.choices[0].message.content;
        addMessageToChat(aiReply, 'ai');
        showAIStatus('✅ Sent!', 'success');
    } catch (error) {
        console.error('AI Error:', error);
        const errorMsg = error.message.includes('not configured') ? '❌ API key not set on server. Contact admin.' :
                         error.message.includes('401') ? '❌ Invalid API key—check server config.' :
                         error.message.includes('429') ? '⏳ Rate limit hit. Try again in a minute.' :
                         '❌ Connection issue. Check internet or try again.';
        const fallbackMsg = 'AI is taking a break. Try: Focus on weak subjects for quick wins!';
        showAIStatus(errorMsg, 'error');
        addMessageToChat(`Sorry! ${errorMsg}. ${fallbackMsg} <button class="retry-btn" onclick="retryLastMessage()">Retry</button>`, 'ai');
    }
}

// UPDATED: Send message for floating chat (proxies through Vercel)
async function sendMessageToFloatingAI() {
    const input = document.getElementById('floatingChatInput');
    const message = input.value.trim();
    if (!message) return;

    lastUserMessage = message; // For retry

    // Add user message to floating chat
    addMessageToFloatingChat(message, 'user');
    input.value = '';
    showFloatingAIStatus('🤔 Thinking...', 'loading');

    // NEW: Pass grades context for smarter replies
    const context = lastSubjectAvgs.length > 0 ? 
        `Current grades: Overall ${lastOverallAvg}%. Subjects: ${lastSubjectAvgs.map(s => `${s.name}: ${s.avg}%`).join('; ')}.` : 
        'No grades calculated yet.';

    try {
        const response = await fetch('/api/openai', {  // Vercel proxy endpoint
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful AI assistant for the Grade Calculator tool. Provide concise, friendly advice on grades, study tips, GPA calculation, or tool usage. Keep responses under 150 words. Be encouraging!'
                    },
                    { role: 'user', content: `${context} User query: ${message}` }
                ],
                max_tokens: 150,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('AI service not available—check deployment.');
            }
            const errorData = await response.json();
            throw new Error(errorData.error || `API Error ${response.status}`);
        }

        const data = await response.json();
        const aiReply = data.choices[0].message.content;
        addMessageToFloatingChat(aiReply, 'ai');
        showFloatingAIStatus('✅ Sent!', 'success');
    } catch (error) {
        console.error('AI Error:', error);
        const errorMsg = error.message.includes('not configured') ? '❌ API key not set on server. Contact admin.' :
                         error.message.includes('401') ? '❌ Invalid API key—check server config.' :
                         error.message.includes('429') ? '⏳ Rate limit hit. Try again in a minute.' :
                         '❌ Connection issue. Check internet or try again.';
        const fallbackMsg = 'AI is taking a break. Try: Focus on weak subjects for quick wins!';
        showFloatingAIStatus(errorMsg, 'error');
        // UPDATED: Pass 'floating' to retry function
        addMessageToFloatingChat(`Sorry! ${errorMsg}. ${fallbackMsg} <button class="retry-btn" onclick="retryLastMessage('floating')">Retry</button>`, 'ai');
    }
}

function addMessageToChat(message, sender) {
    const messagesDiv = document.getElementById('aiChatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${sender}`;
    messageDiv.innerHTML = message;  // Use innerHTML for retry button
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// NEW: Add message to floating chat
function addMessageToFloatingChat(message, sender) {
    const messagesDiv = document.getElementById('floatingChatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${sender}`;
    messageDiv.innerHTML = message;  // Use innerHTML for retry button
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showAIStatus(message, type) {
    const statusDiv = document.getElementById('aiStatus');
    statusDiv.textContent = message;
    statusDiv.className = `ai-status ${type}`;
    if (type !== 'loading') {
        setTimeout(() => { statusDiv.textContent = ''; statusDiv.className = 'ai-status'; }, 3000);
    }
}

// NEW: Show status for floating chat
function showFloatingAIStatus(message, type) {
    const statusDiv = document.getElementById('floatingChatStatus');
    statusDiv.textContent = message;
    statusDiv.className = `floating-chat-status ${type}`;
    if (type !== 'loading') {
        setTimeout(() => { statusDiv.textContent = ''; statusDiv.className = 'floating-chat-status'; }, 3000);
    }
}

// NEW: Toggle floating chat window
function toggleFloatingChat() {
    const window = document.getElementById('floatingChatWindow');
    window.classList.toggle('active');
    if (window.classList.contains('active')) {
        document.getElementById('floatingChatInput').focus();
    }
}

// NEW: Close floating chat on outside click or Escape
document.addEventListener('click', function(e) {
    const window = document.getElementById('floatingChatWindow');
    const toggleBtn = document.querySelector('.floating-chat-toggle');
    if (window.classList.contains('active') && !window.contains(e.target) && !toggleBtn.contains(e.target)) {
        window.classList.remove('active');
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const window = document.getElementById('floatingChatWindow');
        if (window.classList.contains('active')) {
            window.classList.remove('active');
        }
    }
});

// NEW: QR Scan Functions
function startQRScan() {
    const modal = document.getElementById('qrModal');
    const status = document.getElementById('qrStatus');
    modal.style.display = 'block';
    status.textContent = 'Requesting camera access...';

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            videoStream = stream;
            const video = document.getElementById('qrVideo');
            video.srcObject = stream;
            video.play();
            status.textContent = 'Scanning for QR code...';
            startScanning(video);
        })
        .catch(err => {
            console.error('Camera Error:', err);
            status.textContent = 'Camera access denied. Please enable permissions.';
        });
}

function startScanning(video) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    qrScanningInterval = setInterval(() => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                clearInterval(qrScanningInterval);
                handleQRScan(code.data);
            }
        }
    }, 500); // Scan every 500ms
}

function handleQRScan(data) {
    try {
        const session = JSON.parse(data);
        if (session && session.data && session.timestamp) {
            if (confirm(`Load session from ${session.timestamp}? This will overwrite current data.`)) {
                // Load like manual session
                document.querySelector('#gradeTable tbody').innerHTML = '';
                session.data.forEach(item => {
                    addSubjectRow(item.subject);
                    const inputs = document.querySelectorAll('#gradeTable tbody tr:last-child input[type="number"]');
                    item.scores.forEach((score, i) => {
                        if (inputs[i]) inputs[i].value = score;
                    });
                });
                setTimeout(() => {
                    calculateAverages();
                    document.querySelectorAll('#gradeTable input[type="number"]').forEach(updateScoreColor);
                }, 100);
                showSection('grades');
                closeQRModal();
                alert('Session loaded from QR!');
            } else {
                // If not confirmed, restart scanning
                startScanning(document.getElementById('qrVideo'));
            }
        } else {
            throw new Error('Invalid QR data');
        }
    } catch (err) {
        console.error('QR Parse Error:', err);
        document.getElementById('qrStatus').textContent = 'Invalid QR code. Try again.';
        // Restart scanning after 2s without closing modal
        setTimeout(() => startScanning(document.getElementById('qrVideo')), 2000);
    }
    // closeQRModal() moved to success path only
}

function closeQRModal() {
    const modal = document.getElementById('qrModal');
    modal.style.display = 'none';
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    if (qrScanningInterval) {
        clearInterval(qrScanningInterval);
        qrScanningInterval = null;
    }
}

// NEW: Generate QR for Session (called after save)
function generateQRForSession(session) {
    if (!session || typeof session !== 'object') {
        console.error('generateQRForSession called with invalid data:', session);
        alert('Could not generate QR code: session data is missing.');
        return;
    }
    const qrData = JSON.stringify(session);
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, qrData, { width: 256 }, (err) => {
        if (err) {
            alert('QR Generation Failed: ' + err);
            return;
        }
        const link = document.createElement('a');
        link.download = `session-qr-${session.id}.png`;
        link.href = canvas.toDataURL();
        link.click();
        alert('QR code downloaded! Print or share it to scan later.');
    });
}

// NEW: Advanced OCR Functions
function setupOcrDropZone() {
    const dropZone = document.getElementById('ocrDropZone');
    const fileInput = document.getElementById('ocrFileInput');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) {
            fileInput.files = files;
            handleOcrFileSelect({ target: fileInput });
        }
    });
}

function handleOcrFileSelect(event) {
    const file = event.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
    }

    resetOcrSection(); // Clear previous results

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('ocrPreviewImage').src = e.target.result;
        document.getElementById('ocrPreviewContainer').style.display = 'block';
    };
    reader.readAsDataURL(file);

    runOcr(reader);
}

function resetOcrSection() {
    document.getElementById('ocrPreviewContainer').style.display = 'none';
    document.getElementById('ocrPreviewImage').src = '#';
    document.getElementById('ocrProgress').style.display = 'none';
    document.getElementById('ocrProgressBar').style.width = '0%';
    document.getElementById('ocrProgressBar').style.backgroundColor = '#27ae60';
    document.getElementById('ocrProgressText').textContent = '';
    document.getElementById('ocrResultText').value = '';
}

async function preprocessImage(reader) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.getElementById('ocrPreprocessCanvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;

            // 1. Draw image
            ctx.drawImage(img, 0, 0);

            // 2. Apply filters: grayscale and contrast
            ctx.filter = 'grayscale(100%) contrast(180%)';
            ctx.drawImage(canvas, 0, 0); // Re-draw with filter

            resolve(canvas);
        };
        img.onerror = reject;
        img.src = reader.result;
    });
}

async function runOcr(reader) {
    const progressDiv = document.getElementById('ocrProgress');
    const progressBar = document.getElementById('ocrProgressBar');
    const progressText = document.getElementById('ocrProgressText');
    const resultText = document.getElementById('ocrResultText');

    progressDiv.style.display = 'block';
    resultText.value = '';

    try {
        // 1. Pre-process the image for better accuracy
        const processedCanvas = await preprocessImage(reader);

        const { createWorker } = Tesseract;
        const worker = await createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progress = Math.round(m.progress * 100);
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `Recognizing... ${progress}%`;
                } else {
                    progressText.textContent = m.status.charAt(0).toUpperCase() + m.status.slice(1) + '...';
                }
            }
        });
        const { data: { text } } = await worker.recognize(processedCanvas);
        await worker.terminate();

        resultText.value = text;
        progressText.textContent = 'Recognition Complete!';
    } catch (err) {
        console.error('OCR Error:', err);
        progressText.textContent = 'OCR failed. Please try a clearer image.';
        progressBar.style.width = '100%';
        progressBar.style.backgroundColor = '#e74c3c';
    }
}

function parseAndAddOcrGrades() {
    const text = document.getElementById('ocrResultText').value;
    if (!text.trim()) return alert('No text to parse. Please run OCR first.');

    const lines = text.split('\n').filter(line => line.trim());
    addParsedGrades(lines);
    alert('Grades parsed from text! Review the table and click "Calculate Averages".');
    showSection('grades');
}

function addParsedGrades(lines) {
    // Basic regex to extract subject and scores (customize as needed)
    lines.forEach(line => {
        const match = line.match(/^([a-zA-Z\s]+?)\s+((?:\d{1,3}(?:\.\d+)?\s*)+)$/);
        if (match) {
            const subject = match[1].trim();
            const scores = match[2].trim().split(/\s+/).map(s => parseFloat(s)).filter(s => !isNaN(s));
            if (scores.length > 0) {
                addSubjectRow(subject);
                const inputs = document.querySelectorAll('#gradeTable tbody tr:last-child input[type="number"]');
                scores.slice(0, inputs.length).forEach((score, i) => {
                    inputs[i].value = score;
                    updateScoreColor(inputs[i]);
                });
            }
        }
    });
}

 // JS Fallback for www redirect (uncomment if no custom domain)
/*
if (window.location.hostname === 'www.suahco4.github.io') {
    window.location.replace('https://suahco4.github.io' + window.location.pathname);
}
*/

// Dynamic Meta Updates for SEO
function updateMetaForSection(section) {
    const titles = {
        'grades': 'Grade Calculator | Free Online GPA & Average Tool with PDF/CSV Export',
        'help': 'Help & Guide | Grade Calculator - Free GPA Tool',
        'ocr': 'Advanced OCR | Grade Calculator - Scan from Image',
        'settings': 'Settings | Grade Calculator - Customize Your Experience',
        'profile': 'Profile | Grade Calculator - Manage Account & Sessions',
        'contact': 'Contact Us | Grade Calculator - Get Support',
        'ai': 'Assistant | Grade Calculator - Smart Study Help',
        'privacy': 'Privacy Policy | Grade Calculator - Data Protection',
        'terms': 'Terms of Service | Grade Calculator - User Agreement'
    };
    document.title = titles[section] || 'Grade Calculator | Free Online GPA Tool';
    
    // Update meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
        const descriptions = {
            'grades': 'Track grades across periods & exams with our free Grade Matrix Calculator. Calculate averages, export PDF/CSV, save sessions. Mobile-friendly & secure.',
            'help': 'Learn to use Grade Calculator: add subjects, calculate averages, export reports. Free GPA tool for students.',
            'ai': 'Chat with our assistant for grade advice, study tips, and tool help.',
            'contact': 'Contact Grade Calculator team for support on our free GPA tool.',
            'privacy': 'Grade Calculator Privacy Policy: how we protect your data.',
            'terms': 'Grade Calculator Terms of Service: rules for using our free grading tool.'
        };
        metaDesc.setAttribute('content', descriptions[section] || 'Track grades across periods & exams with our free Grade Matrix Calculator. Calculate averages, export PDF/CSV, save sessions. Mobile-friendly & secure.');
    }
}

// Firebase Auth Functions
function signUpWithEmail(email, password, name) {
    const { createUserWithEmailAndPassword, updateProfile } = window;
    const auth = window.auth;
    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            return updateProfile(user, { displayName: name });
        })
        .then(() => {
            alert('Account created successfully! You are now logged in.');
            document.getElementById('authForm').reset();
            document.getElementById('authError').textContent = '';
            loadProfile();
            closeMobileNav(); // NEW: Close nav after auth
        })
        .catch((error) => {
            console.error('Sign Up Error:', error);
            document.getElementById('authError').textContent = error.message;
        });
}

function signInWithEmail(email, password) {
    const { signInWithEmailAndPassword } = window;
    const auth = window.auth;
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            alert('Logged in successfully!');
            document.getElementById('authForm').reset();
            document.getElementById('authError').textContent = '';
            loadProfile();
            closeMobileNav(); // NEW: Close nav after auth
        })
        .catch((error) => {
            console.error('Sign In Error:', error);
            document.getElementById('authError').textContent = error.message;
        });
}

function signOutUser() {
    const { signOut } = window;
    const auth = window.auth;
    signOut(auth).then(() => {
        alert('Logged out successfully!');
        currentUser = null;
        updateAuthUI();
        showSection('grades');
        closeMobileNav(); // NEW: Close nav after logout
    }).catch((error) => {
        console.error('Sign Out Error:', error);
    });
}

// Auth State Observer
function initAuth() {
    const { onAuthStateChanged } = window;
    const auth = window.auth;
    // Initial call to update UI immediately (sets to guest state)
    updateAuthUI();
    onAuthStateChanged(auth, (user) => {
        currentUser = user;
        updateAuthUI();
        if (user) {
            loadProfile();
        }
    });
}

function updateAuthUI() {
    const authSection = document.getElementById('authSection');
    const profileInfo = document.getElementById('profileInfo');
    const navPic = document.getElementById('navProfilePic');
    const dropdown = document.getElementById('profileDropdown');

    if (currentUser) {
        authSection.classList.remove('active');
        profileInfo.classList.add('active');
        navPic.src = currentUser.photoURL || 'Suahco4.png';
        dropdown.innerHTML = `
            <a href="#" onclick="showSection('profile')">Edit Profile</a>
            <a href="#" onclick="signOutUser()">Logout</a>
        `;
    } else {
        authSection.classList.add('active');
        profileInfo.classList.remove('active');
        navPic.src = 'Suahco4.png';
        dropdown.innerHTML = `
            <a href="#" onclick="showSection('profile')">Login</a>
        `;
    }
    // Ensure dropdown is hidden after update (prevents flash on refresh)
    dropdown.classList.remove('active');
    // FIXED: Close mobile nav after UI update
    closeMobileNav();
}

// Toggle between sign up/login form
function toggleAuthForm() {
    const submitBtn = document.getElementById('authSubmit');
    const toggleBtn = document.getElementById('toggleAuth');
    if (submitBtn.textContent === 'Sign Up') {
        submitBtn.textContent = 'Login';
        toggleBtn.textContent = 'Or Sign Up Instead';
    } else {
        submitBtn.textContent = 'Sign Up';
        toggleBtn.textContent = 'Or Login Instead';
    }
}

// Function to highlight scores below threshold in red
function updateScoreColor(input) {
    const value = parseFloat(input.value);
    if (value !== '' && !isNaN(value) && value < currentThreshold) {
        input.classList.add('low-score');
    } else {
        input.classList.remove('low-score');
    }
}

// UPDATED: Event delegation for real-time color updates (now debounced)
const debouncedUpdateColor = debounce(updateScoreColor, 300);
document.addEventListener('input', function(e) {
    if (e.target.type === 'number' && e.target.closest('#gradeTable')) {
        debouncedUpdateColor(e.target);
    }
});

// UPDATED: Add row (now with semester avg cells)
function addSubjectRow(defaultName = '') {
    subjectCount++;
    const tbody = document.querySelector('#gradeTable tbody');
    const row = document.createElement('tr');
    
    // Build the row with the new column order
    let scoreInputs1 = '';
    for (let i = 0; i < 4; i++) scoreInputs1 += `<td><input type="number" min="0" max="100" placeholder="Score"></td>`;
    let scoreInputs2 = '';
    for (let i = 4; i < 8; i++) scoreInputs2 += `<td><input type="number" min="0" max="100" placeholder="Score"></td>`;

    row.innerHTML = `
        <td>
            <input type="text" value="${defaultName}" placeholder="Enter subject name">
            <button class="remove-btn">Remove</button>
        </td>
        ${scoreInputs1}
        <td class="sem1-avg average-cell">0.00</td>
        ${scoreInputs2}
        <td class="sem2-avg average-cell">0.00</td>
        <td class="final-avg average-cell">0.00</td>
    `;
    tbody.appendChild(row);
    clearError();
}

// Function to remove a row
function removeRow(button) {
    button.closest('tr').remove();
    clearError();
}

// NEW: Reset semesters button
function resetSemesters() {
    if (confirm('Clear all semester scores? Subjects will remain.')) {
        document.querySelectorAll('#gradeTable input[type="number"]').forEach(input => input.value = '');
        calculateAverages(); // Recalc to show zeros
        toggleDownloadBtns(false); // Hide download buttons as there are no scores
        alert('Semesters reset!');
    }
}

// Show/hide download buttons
function toggleDownloadBtns(show) {
    const csvBtn = document.getElementById('downloadBtn');
    const pdfBtn = document.getElementById('pdfBtn');
    if (csvBtn) csvBtn.style.display = show ? 'inline-block' : 'none';
    if (pdfBtn) pdfBtn.style.display = show ? 'inline-block' : 'none';
}

// NEW: Toggle GPA mode
function toggleGPAScale() {
    isGPAMode = document.getElementById('gpaToggle').checked;
    localStorage.setItem('gpaMode', isGPAMode);
}

// NEW: Save school name to localStorage
function saveSchoolName() {
    const schoolName = document.getElementById('schoolNameInput').value.trim();
    localStorage.setItem('schoolName', schoolName);
    alert('School name saved!');
}

// UPDATED: Function to calculate averages (now with semester logic)

// REFACTORED: Central function to get all table data for exports
function getExportData() {
    const table = document.getElementById('gradeTable');
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const bodyRows = [];
    const footerRows = [];

    // Get Body Data
    table.querySelectorAll('tbody tr').forEach(row => {
        const rowData = [];
        const subjectInput = row.querySelector('input[type="text"]');
        rowData.push(subjectInput ? subjectInput.value.trim() : ''); // Subject Name

        const scoreInputs = row.querySelectorAll('input[type="number"]');
        const avgCells = row.querySelectorAll('.average-cell');

        // Corresponds to P1-P4, E1
        scoreInputs.forEach((input, index) => {
            rowData.push(input.value || '');
            if (index === 3) { // After 1st Exam (index 3)
                rowData.push(avgCells[0] ? avgCells[0].textContent.trim() : ''); // 1st Sem Avg
            }
        });

        // After all scores, add the last two averages
        rowData.push(avgCells[1] ? avgCells[1].textContent.trim() : ''); // 2nd Sem Avg
        rowData.push(avgCells[2] ? avgCells[2].textContent.trim() : ''); // Final Avg
        bodyRows.push(rowData);
    });

    // Get Footer Data
    table.querySelectorAll('tfoot tr').forEach(row => {
        const rowData = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
        footerRows.push(rowData);
    });

    return { headers, bodyRows, footerRows };
}

// REFACTORED: Download CSV using the new data function
function downloadCSV() {
    if (document.querySelectorAll('#gradeTable tbody tr').length === 0) {
        alert('No data to export. Add subjects and scores first.');
        return;
    }

    const { headers, bodyRows, footerRows } = getExportData();
    let csvContent = '';

    // Helper to format a row for CSV
    const toCsvRow = (arr) => arr.map(val => `"${(val || '').replace(/"/g, '""')}"`).join(',') + '\n';

    csvContent += toCsvRow(headers);
    bodyRows.forEach(row => {
        csvContent += toCsvRow(row);
    });
    footerRows.forEach(row => {
        csvContent += toCsvRow(row);
    });

    // Filename
    const schoolName = localStorage.getItem('schoolName')?.trim() || 'grade-matrix';
    const sanitizedFilename = schoolName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const includeDate = localStorage.getItem('dateInExport') !== 'false';
    const dateStr = includeDate ? `-${new Date().toISOString().split('T')[0]}` : '';
    const filename = `${sanitizedFilename}${dateStr}.csv`;

    // Download
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' }); // Added BOM for Excel
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// REFACTORED: Download PDF using the new data function
function downloadPDF() {
    if (document.querySelectorAll('#gradeTable tbody tr').length === 0) {
        alert('No data to export. Add subjects and scores first.');
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });
        const { headers, bodyRows, footerRows } = getExportData();

        // Add table to PDF
        doc.autoTable({
            head: [headers],
            body: bodyRows,
            foot: footerRows,
            startY: 22,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2, halign: 'center' },
            headStyles: { fillColor: [44, 73, 94] },
            footStyles: { fillColor: [232, 244, 253], textColor: [0, 0, 0], fontStyle: 'bold' },
            margin: { left: 10, right: 10 },
        });

        // Add title and footer text
        const reportTitle = localStorage.getItem('schoolName')?.trim() || 'Grade Matrix Report';
        doc.setFontSize(16);
        doc.text(reportTitle, 14, 15);

        doc.setFontSize(10);
        doc.text(`Overall Averages are listed in the table footer.`, 14, doc.lastAutoTable.finalY + 10);

        // Add timestamp footer
        const pageHeight = doc.internal.pageSize.height;
        doc.setFontSize(8);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, pageHeight - 10);

        // Filename
        const sanitizedFilename = reportTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const includeDate = localStorage.getItem('dateInExport') !== 'false';
        const dateStr = includeDate ? `-${new Date().toISOString().split('T')[0]}` : '';
        const filename = `${sanitizedFilename}${dateStr}.pdf`;

        // Download
        doc.save(filename);
    } catch (err) {
        console.error('PDF Export Error:', err);
        showError('PDF export failed. Check console or try a smaller table.');
    }
}


            function calculateAverages() {
try {
    const rows = document.querySelectorAll('#gradeTable tbody tr');
    if (rows.length === 0) {
        showError('Please add at least one subject.');
        return;
    }

    const scale = isGPAMode ? (score) => Math.min(4.0, score / 25) : (score) => score;

    // Reset all avgs (periods + semesters)
    columnIdMap.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '0.00';
    });
    ['sem1OverallAvg', 'sem2OverallAvg', 'finalOverallAvg'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '0.00';
    });

    const columnTotals = new Array(numScoreColumns).fill(0);
    const columnCounts = new Array(numScoreColumns).fill(0);
    let sem1Total = 0, sem1Count = 0, sem2Total = 0, sem2Count = 0;
    let grandTotal = 0, grandCount = 0;
    let invalidSubjects = [];
    lastSubjectAvgs = [];

    // Per-subject calculations
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        const subjectInput = row.querySelector('input[type="text"]');
            const scoreInputs = Array.from(row.querySelectorAll('input[type="number"]'));
        const sem1AvgCell = row.querySelector('.sem1-avg');
        const sem2AvgCell = row.querySelector('.sem2-avg');
        const finalAvgCell = row.querySelector('.final-avg');

        if (!subjectInput || subjectInput.value.trim() === '') {
            invalidSubjects.push(r + 1);
            continue;
        }

        let sem1TotalRow = 0, sem1Valid = 0;
        let sem2TotalRow = 0, sem2Valid = 0;

        // Loop through all 8 score columns
        for (let i = 0; i < numScoreColumns; i++) {
            const input = scoreInputs[i];
            if (!input.value || input.value.trim() === '') continue;
            let score = parseFloat(input.value);
            if (isNaN(score) || score < 0 || score > 100) {
                showError('Scores must be numbers between 0 and 100.');
                return;
            }
            score = Math.min(100, Math.max(0, score));
            const scaled = scale(score);
            grandTotal += scaled;
            grandCount++;

            // Add to column total for period avg
            columnTotals[i] += scaled;
            columnCounts[i]++;

            // Add to semester totals
            if (i < 4) { // 1st Semester (0-3)
                sem1TotalRow += scaled;
                sem1Valid++;
                if (i < 3) { // Periods 1-3 for overall sem count
                    sem1Total += scaled;
                    sem1Count++;
                }
            } else { // 2nd Semester (4-7)
                sem2TotalRow += scaled;
                sem2Valid++;
                if (i > 4) { // Periods 4-6 for overall sem count
                    sem2Total += scaled;
                    sem2Count++;
                }
            }
        }

        // Subject semester avgs
        const sem1Avg = sem1Valid > 0 ? (sem1TotalRow / sem1Valid).toFixed(2) : '0.00';
        const sem2Avg = sem2Valid > 0 ? (sem2TotalRow / sem2Valid).toFixed(2) : '0.00';
        const finalAvg = (sem1Valid + sem2Valid > 0) ? ((sem1TotalRow + sem2TotalRow) / (sem1Valid + sem2Valid)).toFixed(2) : '0.00';

        const sem1Letter = getLetterGrade(sem1Avg, isGPAMode);
        const sem2Letter = getLetterGrade(sem2Avg, isGPAMode);
        const finalLetter = getLetterGrade(finalAvg, isGPAMode);

        if (sem1AvgCell) sem1AvgCell.innerHTML = `${sem1Avg} <small>(${sem1Letter})</small>`;
        if (sem2AvgCell) sem2AvgCell.innerHTML = `${sem2Avg} <small>(${sem2Letter})</small>`;
        if (finalAvgCell) finalAvgCell.innerHTML = `${finalAvg} <small>(${finalLetter})</small>`;

        lastSubjectAvgs.push({ 
            name: subjectInput.value.trim(), 
            sem1: parseFloat(sem1Avg), 
            sem2: parseFloat(sem2Avg), 
            final: parseFloat(finalAvg) 
        });
    }

    if (invalidSubjects.length > 0) {
        showError(`Please name subjects in rows: ${invalidSubjects.join(', ')}`);
        return;
    }

    // Footer: Individual period avgs (like before)
    for (let i = 0; i < numScoreColumns; i++) {
        const colAvg = columnCounts[i] > 0 ? (columnTotals[i] / columnCounts[i]).toFixed(2) : '0.00';
        const colId = columnIdMap[i];
        const el = document.getElementById(colId);
        if (el) el.innerHTML = `${colAvg} <small>(${getLetterGrade(colAvg, isGPAMode)})</small>`;
    }

    // Footer: Semester overall avgs (after periods)
    const sem1Overall = sem1Count > 0 ? (sem1Total / sem1Count).toFixed(2) : '0.00';
    const sem2Overall = sem2Count > 0 ? (sem2Total / sem2Count).toFixed(2) : '0.00';
    const finalOverall = grandCount > 0 ? (grandTotal / grandCount).toFixed(2) : '0.00';

    document.getElementById('sem1OverallAvg').innerHTML = `${sem1Overall} <small>(${getLetterGrade(sem1Overall, isGPAMode)})</small>`;
    document.getElementById('sem2OverallAvg').innerHTML = `${sem2Overall} <small>(${getLetterGrade(sem2Overall, isGPAMode)})</small>`;
    document.getElementById('finalOverallAvg').innerHTML = `${finalOverall} <small>(${getLetterGrade(finalOverall, isGPAMode)})</small>`;

    // Track active columns (all 8 now)
    activeColumns = Array.from({length: 8}, (_, i) => i);

    displayResult({ sem1: sem1Overall, sem2: sem2Overall, final: finalOverall });
    generateStats();
    clearError();
    toggleDownloadBtns(true);
} catch (err) {
    console.error(err);
    showError('An unexpected error occurred. Check the console for details.');
}
}


// UPDATED: Display result (now shows semester breakdown)
function displayResult(avgs) {
const resultDiv = document.getElementById('result');
const sem1Letter = getLetterGrade(avgs.sem1, isGPAMode);
const sem2Letter = getLetterGrade(avgs.sem2, isGPAMode);
const finalLetter = getLetterGrade(avgs.final, isGPAMode);
let displayText = `Periods: ${columnNames.map((name, i) => `${name}: ${document.getElementById(columnIdMap[i]).textContent.split(' ')[0]}`).join(' | ')} | 1st Sem: ${avgs.sem1} (${sem1Letter}) | 2nd Sem: ${avgs.sem2} (${sem2Letter}) | Final: ${avgs.final} (${finalLetter})`;
if (isGPAMode) {
    displayText += ' (GPA Mode)';
}
resultDiv.innerHTML = `<div class="result">${displayText}</div>`;
}

// Function to show error
function showError(message) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) errorDiv.textContent = message;
}

// Function to clear error
function clearError() {
    const errorDiv = document.getElementById('error');
    if (errorDiv) errorDiv.textContent = '';
}

// FIXED: Toggle mobile nav menu - now closes if open on section change
function toggleNav() {
    const menu = document.getElementById('navMenu');
    menu.classList.toggle('active');
}

// FIXED: Close mobile nav if open (no toggle - force close)
function closeMobileNav() {
    const menu = document.getElementById('navMenu');
    if (menu.classList.contains('active')) {
        menu.classList.remove('active');
    }
}

// Toggle profile dropdown
function toggleProfileMenu() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('active');
}

// Hide dropdown on outside click
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('profileDropdown');
    const profilePic = document.querySelector('.profile-pic');
    if (!profilePic.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// Logout function (now uses Firebase)
function logout() {
    signOutUser();
}

// Updated Profile functions (integrates with Firebase)
function loadProfile() {
    if (currentUser) {
        document.getElementById('userName').value = currentUser.displayName || '';
        document.getElementById('userEmail').value = currentUser.email || '';
        const picSrc = currentUser.photoURL || 'Suahco4.png';
        document.getElementById('profilePicPreview').src = picSrc;
        document.getElementById('navProfilePic').src = picSrc;
        generateStats();
        loadSessions();
        // NEW: Refresh stats on load
        if (lastOverallAvg !== '0.00') generateStats();
    }
}

function saveProfile() {
    if (!currentUser) return alert('Please log in first.');
    const name = document.getElementById('userName').value;
    const { updateProfile } = window;
    updateProfile(currentUser, { displayName: name })
        .then(() => {
            alert('Profile saved!');
            updateNavPic(currentUser.photoURL || 'Suahco4.png');
        })
        .catch((error) => {
            console.error('Profile Update Error:', error);
            alert('Failed to save profile.');
        });
}

function handlePicUpload(event) {
    const file = event.target.files[0];
    if (file && currentUser) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('profilePicPreview');
            img.src = e.target.result;
            updateNavPic(e.target.result);
            // TODO: Upload to Firebase Storage if needed
        };
        reader.readAsDataURL(file);
    }
}

function updateNavPic(src) {
    document.getElementById('navProfilePic').src = src;
}

// UPDATED: Save Session (now generates QR)
function saveSession() {
    const tableData = [];
    document.querySelectorAll('#gradeTable tbody tr').forEach(row => {
        const subjectInput = row.querySelector('input[type="text"]');
        const scoreInputs = Array.from(row.querySelectorAll('input[type="number"]')).map(input => input.value);
        tableData.push({
            subject: subjectInput ? subjectInput.value : '',
            scores: scoreInputs
        });
    });
    const session = {
        id: Date.now(),
        timestamp: new Date().toLocaleString(),
        data: tableData,
        overallAvg: lastOverallAvg
    };
    let sessions = JSON.parse(localStorage.getItem('savedSessions')) || [];
    sessions.unshift(session); // Add to front
    if (sessions.length > 5) sessions = sessions.slice(0, 5); // Limit to 5
    localStorage.setItem('savedSessions', JSON.stringify(sessions));
    loadSessions();
    // NEW: Generate QR
    generateQRForSession(session);
}

// NEW: Generate QR for the current, unsaved session data
function generateCurrentSessionQR() {
    const tableData = [];
    document.querySelectorAll('#gradeTable tbody tr').forEach(row => {
        const subjectInput = row.querySelector('input[type="text"]');
        const scoreInputs = Array.from(row.querySelectorAll('input[type="number"]')).map(input => input.value);
        tableData.push({
            subject: subjectInput ? subjectInput.value : '',
            scores: scoreInputs
        });
    });

    if (tableData.length === 0) return alert('No data in the table to generate a QR code.');

    const session = {
        id: 'current-' + Date.now(),
        timestamp: new Date().toLocaleString() + ' (Unsaved)',
        data: tableData,
        overallAvg: lastOverallAvg
    };
    generateQRForSession(session);
}

function loadSessions() {
    const sessions = JSON.parse(localStorage.getItem('savedSessions')) || [];
    const list = document.getElementById('sessionList');
    list.innerHTML = '';
    sessions.forEach(session => {
        const li = document.createElement('li');
        li.className = 'session-item';

        const span = document.createElement('span');
        span.textContent = `${session.timestamp} (Avg: ${session.overallAvg}%)`;

        const div = document.createElement('div');

        // Load button
        const loadBtn = document.createElement('button');
        loadBtn.className = 'small-btn';
        loadBtn.textContent = 'Load';
        loadBtn.onclick = () => loadSession(session.id);
        div.appendChild(loadBtn);

        // QR button
        const qrBtn = document.createElement('button');
        qrBtn.className = 'small-btn';
        qrBtn.style.backgroundColor = '#1abc9c';
        qrBtn.textContent = 'QR';
        qrBtn.onclick = () => generateQRForSession(session);
        div.appendChild(qrBtn);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'remove-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = () => deleteSession(session.id);
        div.appendChild(deleteBtn);

        li.appendChild(span);
        li.appendChild(div);
        list.appendChild(li);
    });
}

// UPDATED: Load session (now auto-recalculates)
function loadSession(id) {
    const sessions = JSON.parse(localStorage.getItem('savedSessions')) || [];
    const session = sessions.find(s => s.id === id);
    if (!session) return alert('Session not found!');
    if (confirm(`Load session from ${session.timestamp}? This will overwrite current data.`)) {
        // Clear table
        document.querySelector('#gradeTable tbody').innerHTML = '';
        // Add rows
        session.data.forEach(item => {
            addSubjectRow(item.subject);
            const inputs = document.querySelectorAll('#gradeTable tbody tr:last-child input[type="number"]');
            item.scores.forEach((score, i) => {
                if (inputs[i]) inputs[i].value = score;
            });
        });
        // NEW: Auto-recalculate after DOM update
        setTimeout(() => calculateAverages(), 200);
        showSection('grades');
        alert('Session loaded!');
    }
}

function deleteSession(id) {
    if (confirm('Delete this session?')) {
        let sessions = JSON.parse(localStorage.getItem('savedSessions')) || [];
        sessions = sessions.filter(s => s.id !== id);
        localStorage.setItem('savedSessions', JSON.stringify(sessions));
        loadSessions();
    }
}

// UPDATED: Generate stats (with GPA support)
function generateStats() {
    // 1. Basic Stats Grid
    const statsGrid = document.getElementById('statsGrid');
    if (lastSubjectAvgs.length === 0) {
        statsGrid.innerHTML = '<p class="stat-item">No data yet. Calculate grades first!</p>';
        // Clear charts if they exist
        if (subjectBarChart) subjectBarChart.destroy();
        if (gradePieChart) gradePieChart.destroy();
        return;
    }
    const totalSubjects = lastSubjectAvgs.length;
    const bestSubject = lastSubjectAvgs.reduce((max, curr) => curr.final > max.final ? curr : max);
    const worstSubject = lastSubjectAvgs.reduce((min, curr) => curr.final < min.final ? curr : min);
    const overallDisplay = isGPAMode ? `${lastOverallAvg} GPA` : `${lastOverallAvg}%`;

    statsGrid.innerHTML = `
        <div class="stat-item">
            <div>Total Subjects</div>
            <div class="stat-value">${totalSubjects}</div>
        </div>
        <div class="stat-item">
            <div>Overall</div>
            <div class="stat-value">${overallDisplay}</div>
        </div>
        <div class="stat-item">
            <div>Best: ${bestSubject.name}</div>
            <div class="stat-value">${isGPAMode ? bestSubject.final.toFixed(2) : bestSubject.final}%</div>
        </div>
        <div class="stat-item">
            <div>Worst: ${worstSubject.name}</div>
            <div class="stat-value">${isGPAMode ? worstSubject.final.toFixed(2) : worstSubject.final}%</div>
        </div>
    `;

    // 2. Chart Visualizations
    // Destroy old charts before creating new ones
    if (subjectBarChart) subjectBarChart.destroy();
    if (gradePieChart) gradePieChart.destroy();

    // Bar Chart: Subject Performance
    const barCtx = document.getElementById('subjectBarChart').getContext('2d');
    subjectBarChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: lastSubjectAvgs.map(s => s.name),
            datasets: [{
                label: isGPAMode ? 'Final GPA' : 'Final Average (%)',
                data: lastSubjectAvgs.map(s => s.final),
                backgroundColor: lastSubjectAvgs.map(s => s.final < currentThreshold ? 'rgba(231, 76, 60, 0.6)' : 'rgba(52, 152, 219, 0.6)'),
                borderColor: lastSubjectAvgs.map(s => s.final < currentThreshold ? 'rgba(231, 76, 60, 1)' : 'rgba(52, 152, 219, 1)'),
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'Subject Performance' },
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: isGPAMode ? 4.0 : 100
                }
            }
        }
    });

    // Pie Chart: Grade Distribution
    const gradeCounts = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };
    lastSubjectAvgs.forEach(s => {
        const letter = getLetterGrade(s.final, isGPAMode);
        // Handle A-, B+, etc. by grouping them
        const mainGrade = letter.charAt(0);
        if (gradeCounts.hasOwnProperty(mainGrade)) {
            gradeCounts[mainGrade]++;
        }
    });

    const pieCtx = document.getElementById('gradePieChart').getContext('2d');
    gradePieChart = new Chart(pieCtx, {
        type: 'pie',
        data: {
            labels: Object.keys(gradeCounts),
            datasets: [{
                label: 'Grade Distribution',
                data: Object.values(gradeCounts),
                backgroundColor: ['#27ae60', '#2980b9', '#f39c12', '#e67e22', '#e74c3c'],
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: { display: true, text: 'Grade Distribution' }
            }
        }
    });
}

// UPDATED: Contact functions (with fixed auto-reply)
function submitContactForm(e) {
    e.preventDefault();
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const subject = document.getElementById('contactSubject').value.trim();
    const message = document.getElementById('contactMessage').value.trim();

    if (!name || !email || !subject || !message) {
        alert('Please fill in all fields.');
        return;
    }

    // Log for debugging
    console.log('Contact Form Submitted:', { name, email, subject, message });

    // Send main contact email via EmailJS
    emailjs.send('service_t4jdpwc', 'template_bq7h8n6', {
        name: name,
        email: email,
        subject: subject,
        message: message
    }).then((result) => {
        console.log('Main EmailJS Success:', result.text);

        // FIXED: Send dedicated auto-reply to user (only if main succeeds)
        console.log('Sending auto-reply...');
        emailjs.send('service_t4jdpwc', 'template_awyrou5', {  // Dedicated auto-reply template
            to_name: name,
            to_email: email,
            reply_subject: `Re: ${subject} - Thanks for reaching out!`,
            reply_message: `Hi ${name}! We received your message about "${subject}". Our team will review it within 24-48 hours. In the meantime, check our Help section for quick tips. Best, Grade Calculator Team`
        }).then((replyResult) => {
            console.log('Auto-Reply Success:', replyResult.text);
        }).catch((replyError) => {
            console.warn('Auto-Reply failed (non-critical):', replyError);
            // ENHANCED: Optional user notification on partial failure
            // alert('Message sent, but auto-reply delayed—check spam folder!');
        });

        alert('Message sent successfully! Check your email for an auto-reply confirmation. We\'ll get back to you soon.');
        document.getElementById('contactForm').reset();
    }, (error) => {
        console.error('Main EmailJS Error:', error);
        alert('Failed to send message. Please try again or email us directly.');
    });
}

// FIXED: Show section (handles all toggles + SEO meta updates) - Closes mobile nav
function showSection(section) {
    // Hide all sections
    document.querySelectorAll('section').forEach(sec => {
        sec.style.display = 'none';
    });
    
    // Show target
    if (section === 'grades') {
        const gradesSec = document.getElementById('grades-section');
        if (gradesSec) gradesSec.style.display = 'block';
        document.getElementById('result').style.display = 'block';
        document.getElementById('error').style.display = 'block';
    } else if (section === 'help') {
        const helpSec = document.getElementById('help-section');
        if (helpSec) helpSec.style.display = 'block';
        document.querySelectorAll('.accordion-content').forEach(content => content.classList.remove('active'));
    } else if (section === 'settings') {
        const settingsSec = document.getElementById('settings-section');
        if (settingsSec) settingsSec.style.display = 'block';
        loadSettings();
    } else if (section === 'profile') {
        const profileSec = document.getElementById('profile-section');
        if (profileSec) profileSec.style.display = 'block';
        loadProfile();
    } else if (section === 'ai') { // UPDATED: Now opens floating chat instead
        toggleFloatingChat();
        return; // Don't proceed to show full section
    } else if (section === 'ocr') {
        const ocrSec = document.getElementById('ocr-section');
        if (ocrSec) ocrSec.style.display = 'block';
        // resetOcrSection(); // Let's not reset, so user can see previous result
    } else if (section === 'contact') {
        const contactSec = document.getElementById('contact-section');
        if (contactSec) contactSec.style.display = 'block';
        document.getElementById('contactName').focus();
    } else if (section === 'privacy') {
        const privacySec = document.getElementById('privacy-section');
        if (privacySec) privacySec.style.display = 'block';
        document.querySelectorAll('.accordion-content').forEach(content => content.classList.remove('active'));
        document.querySelector('.accordion-content').classList.add('active');
    } else if (section === 'terms') {
        const termsSec = document.getElementById('terms-section');
        if (termsSec) termsSec.style.display = 'block'; // FIXED: Was privacySec
        document.querySelectorAll('.accordion-content').forEach(content => content.classList.remove('active'));
        document.querySelector('.accordion-content').classList.add('active');
    }
    
    // FIXED: Force close mobile nav on section change
    closeMobileNav();
    document.getElementById('profileDropdown').classList.remove('active');
    
    // Update SEO meta for this section
    updateMetaForSection(section);
}

// Toggle accordion sections
function toggleAccordion(header) {
    const content = header.nextElementSibling;
    const isActive = content.classList.contains('active');
    
    // Close all others
    document.querySelectorAll('.accordion-content').forEach(c => c.classList.remove('active'));
    
    // Toggle this one
    if (!isActive) {
        content.classList.add('active');
    }
}

// Load saved settings
function loadSettings() {
    // Theme
    const isDark = localStorage.getItem('darkMode') === 'true';
    document.getElementById('themeToggle').checked = isDark;
    if (isDark) document.body.classList.add('dark-mode');
    
    // Threshold
    const threshold = localStorage.getItem('lowScoreThreshold') || 70;
    document.getElementById('thresholdInput').value = threshold;
    document.getElementById('currentThreshold').textContent = threshold;
    currentThreshold = parseInt(threshold);
    
    // GPA Mode
    isGPAMode = localStorage.getItem('gpaMode') === 'true';
    document.getElementById('gpaToggle').checked = isGPAMode;
    
    // Default subjects
    const defaults = localStorage.getItem('defaultSubjects') || 'Mathematics,English,Science,History';
    document.getElementById('defaultSubjectsInput').value = defaults;

    // School Name
    const schoolName = localStorage.getItem('schoolName') || '';
    document.getElementById('schoolNameInput').value = schoolName;
    
    // Date in export
    const dateInExport = localStorage.getItem('dateInExport') !== 'false';
    document.getElementById('dateInFilename').checked = dateInExport;
}

// Toggle dark mode
function toggleTheme() {
    const isDark = document.getElementById('themeToggle').checked;
    document.body.classList.toggle('dark-mode', isDark);
    localStorage.setItem('darkMode', isDark);
}

// UPDATED: Update low score threshold (with validation)
function updateThreshold() {
    const newVal = parseInt(document.getElementById('thresholdInput').value);
    if (isNaN(newVal) || newVal < 0 || newVal > 100) {
        showError('Threshold must be a number between 0-100.');
        return;
    }
    currentThreshold = newVal;
    document.getElementById('currentThreshold').textContent = newVal;
    localStorage.setItem('lowScoreThreshold', newVal);
    // Re-apply to all inputs
    document.querySelectorAll('#gradeTable input[type="number"]').forEach(input => {
        updateScoreColor(input);
    });
    clearError();
}

function applyThreshold() {
    updateThreshold();
    alert(`Threshold updated to ${currentThreshold}! Highlights refreshed.`);
}

// Save default subjects
function saveDefaultSubjects() {
    const subjects = document.getElementById('defaultSubjectsInput').value;
    localStorage.setItem('defaultSubjects', subjects);
    alert('Default subjects saved! Refresh page to see changes.');
}

// Toggle date in exports
function toggleDateInExport() {
    const includeDate = document.getElementById('dateInFilename').checked;
    localStorage.setItem('dateInExport', includeDate);
}

// Clear all data
function clearAllData() {
    if (confirm('Clear all subjects and scores? This cannot be undone.')) {
        document.querySelector('#gradeTable tbody').innerHTML = '';
        const defaults = localStorage.getItem('defaultSubjects') || 'Mathematics,English,Science,History';
        defaults.split(',').forEach(name => addSubjectRow(name.trim()));
        toggleDownloadBtns(false); // Corrected from toggleDownloadBtns
        activeColumns = [];
        columnIdMap.forEach(id => document.getElementById(id).textContent = '0.00');
        document.getElementById('sem1OverallAvg').textContent = '0.00';
        document.getElementById('sem2OverallAvg').textContent = '0.00';
        document.getElementById('finalOverallAvg').textContent = '0.00';
        document.getElementById('result').innerHTML = '';
        clearError();
        alert('Data cleared! Back to defaults.');
        showSection('grades');
    }
}

// NEW: Keyboard shortcut for calculate (Ctrl+Enter)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        calculateAverages();
    }
});

// Event listeners & Initial Load
document.addEventListener('DOMContentLoaded', function() {
    // FIXED: Force close mobile nav on load/refresh
    closeMobileNav();

    // NEW: Set current year in footer
    document.getElementById('copyrightYear').textContent = new Date().getFullYear();

    // Initialize EmailJS
    emailjs.init('mMoFbLBQtA226NQY_');

    // Initialize Firebase Auth (now calls updateAuthUI immediately)
    initAuth();

    // Bind main buttons
    document.getElementById('addSubject').addEventListener('click', () => addSubjectRow(''));
    document.getElementById('calculate').addEventListener('click', calculateAverages);
    document.getElementById('resetSemesters').addEventListener('click', resetSemesters); // NEW

    // NEW: OCR Event Listeners
    setupOcrDropZone();
    document.getElementById('ocrFileInput').addEventListener('change', handleOcrFileSelect);
    
    // Event delegation for remove buttons (dynamic)
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-btn')) {
            removeRow(e.target);
        }
    });

    // Auth form submit
    document.getElementById('authForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const email = document.getElementById('authEmail').value;
        const password = document.getElementById('authPassword').value;
        const name = document.getElementById('userName').value || email.split('@')[0];
        const submitBtn = document.getElementById('authSubmit');
        if (submitBtn.textContent === 'Sign Up') {
            signUpWithEmail(email, password, name);
        } else {
            signInWithEmail(email, password);
        }
    });

    // Toggle auth form
    document.getElementById('toggleAuth').addEventListener('click', toggleAuthForm);

    // Contact form submit
    document.getElementById('contactForm').addEventListener('submit', submitContactForm);

    // Load defaults
    const defaultSubjects = ['Mathematics', 'English', 'Science', 'History'];
    defaultSubjects.forEach(name => addSubjectRow(name));

    // Load settings & profile
    loadSettings();
    toggleDownloadBtns(false);
    showSection('grades'); // This will also set initial SEO meta

    // NEW: Close QR modal on outside click
    document.getElementById('qrModal').addEventListener('click', function(e) {
        if (e.target === this) closeQRModal();
    });
});