<script>
    let subjectCount = 0;
    const numScoreColumns = 8; // 1st,2nd,3rd,Exam1,4th,5th,6th,Exam2
    const columnIdMap = ['avg1', 'avg2', 'avg3', 'avgExam1', 'avg4', 'avg5', 'avg6', 'avgExam2'];
    let currentThreshold = 70;
    let activeColumns = []; // Tracks columns with data (indices)
    let columnNames = ['1st Period', '2nd Period', '3rd Period', 'Exam 1', '4th Period', '5th Period', '6th Period', 'Final']; // For labeling
    let lastOverallAvg = '0.00'; // For stats
    let lastSubjectAvgs = []; // For stats
    let currentUser = null; // Firebase user

    // REMOVED: Hardcoded OPENAI_API_KEY - now handled server-side via /api/openai

    // NEW: Debounce utility for input events
    function debounce(fn, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    // NEW: Letter grade mapping
    function getLetterGrade(avg) {
        const numAvg = parseFloat(avg);
        if (numAvg >= 90) return 'A';
        if (numAvg >= 80) return 'B';
        if (numAvg >= 70) return 'C';
        if (numAvg >= 60) return 'D';
        return 'F';
    }

    // UPDATED: AI Chat Functions (now proxies through /api/openai)
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

        // Add user message to chat
        addMessageToChat(message, 'user');
        input.value = '';
        showAIStatus('🤔 Thinking...', 'loading');

        try {
            const response = await fetch('/api/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'API Error');
            }

            const data = await response.json();
            const aiReply = data.reply;
            addMessageToChat(aiReply, 'ai');
            showAIStatus('✅ Sent!', 'success');
            input.focus(); // FIXED: Refocus after send
        } catch (error) {
            console.error('AI Error:', error);
            const errorMsg = error.message.includes('500') ? '❌ Server issue—try again.' :
                             error.message.includes('400') ? '❌ Empty message—type something!' :
                             '❌ Connection issue. Check internet.';
            showAIStatus(errorMsg, 'error');
            addMessageToChat(`Sorry! ${errorMsg} Let's try another question.`, 'ai');
            input.focus(); // FIXED: Refocus on error
        }
    }

    // UPDATED: Send message for floating chat
    async function sendMessageToFloatingAI() {
        const input = document.getElementById('floatingChatInput');
        const message = input.value.trim();
        if (!message) return;

        // Add user message to floating chat
        addMessageToFloatingChat(message, 'user');
        input.value = '';
        showFloatingAIStatus('🤔 Thinking...', 'loading');

        try {
            const response = await fetch('/api/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'API Error');
            }

            const data = await response.json();
            const aiReply = data.reply;
            addMessageToFloatingChat(aiReply, 'ai');
            showFloatingAIStatus('✅ Sent!', 'success');
            input.focus(); // FIXED: Refocus after send
        } catch (error) {
            console.error('Floating AI Error:', error);
            const errorMsg = error.message.includes('500') ? '❌ Server issue—try again.' :
                             error.message.includes('400') ? '❌ Empty message—type something!' :
                             '❌ Connection issue. Check internet.';
            showFloatingAIStatus(errorMsg, 'error');
            addMessageToFloatingChat(`Sorry! ${errorMsg} Let's try another question.`, 'ai');
            input.focus(); // FIXED: Refocus on error
        }
    }

    function addMessageToChat(message, sender) {
        const messagesDiv = document.getElementById('aiChatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${sender}`;
        messageDiv.textContent = message;
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // NEW: Add message to floating chat
    function addMessageToFloatingChat(message, sender) {
        const messagesDiv = document.getElementById('floatingChatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${sender}`;
        messageDiv.textContent = message;
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
            'settings': 'Settings | Grade Calculator - Customize Your Experience',
            'profile': 'Profile | Grade Calculator - Manage Account & Sessions',
            'contact': 'Contact Us | Grade Calculator - Get Support',
            'ai': 'AI Assistant | Grade Calculator - Smart Study Help', // NEW
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
                'ai': 'Chat with our AI assistant for grade advice, study tips, and tool help.', // NEW
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

    // Function to add a new subject row (with optional default name)
    function addSubjectRow(defaultName = '') {
        subjectCount++;
        const tbody = document.querySelector('#gradeTable tbody');
        const row = document.createElement('tr');
        let scoreInputs = '';
        for (let i = 0; i < numScoreColumns; i++) {
            scoreInputs += `<td><input type="number" min="0" max="100" placeholder="Score"></td>`;
        }
        row.innerHTML = `
            <td>
                <input type="text" value="${defaultName}" placeholder="Enter subject name">
                <button class="remove-btn">Remove</button>
            </td>
            ${scoreInputs}
            <td class="average-cell">0.00</td>
        `;
        tbody.appendChild(row);
        clearError();
    }

    // Function to remove a row
    function removeRow(button) {
        button.closest('tr').remove();
        clearError();
    }

    // Show/hide download buttons
    function toggleDownloadBtns(show) {
        const csvBtn = document.getElementById('downloadBtn');
        const pdfBtn = document.getElementById('pdfBtn');
        if (csvBtn) csvBtn.style.display = show ? 'inline-block' : 'none';
        if (pdfBtn) pdfBtn.style.display = show ? 'inline-block' : 'none';
    }

    // Download table as CSV (filtered to active columns)
    function downloadCSV() {
        const table = document.getElementById('gradeTable');
        const tbodyRows = Array.from(table.querySelectorAll('tbody tr'));
        let csvContent = '';

        // Dynamic headers: Subject + Active Periods + Subject Average
        const headers = ['Subject'];
        activeColumns.forEach(i => headers.push(columnNames[i]));
        headers.push('Subject Average');
        csvContent += headers.join(',') + '\n';

        // Data rows (only tbody, filter columns)
        tbodyRows.forEach(row => {
            const cells = Array.from(row.querySelectorAll('th, td'));
            if (cells.length === 0) return;

            const rowData = [];
            rowData.push(`"${cells[0].querySelector('input') ? (cells[0].querySelector('input').value || '') : cells[0].textContent.trim()}"`); // Subject

            // Only active columns
            activeColumns.forEach(i => {
                const cell = cells[i + 1]; // +1 skips subject column
                const input = cell.querySelector('input');
                rowData.push(`"${input ? (input.value || '') : cell.textContent.trim()}"`);
            });

            rowData.push(`"${cells[cells.length - 1].textContent.trim()}"`); // Subject Average
            csvContent += rowData.join(',') + '\n';
        });

        // Add footer row (period averages, filtered)
        const footerRow = ['Period Averages'];
        activeColumns.forEach(i => {
            const avgId = columnIdMap[i];
            const avgEl = document.getElementById(avgId);
            footerRow.push(`"${avgEl ? avgEl.textContent : '0.00'}"`);
        });
        footerRow.push(`"${document.getElementById('overallAverage').textContent}"`); // Overall
        csvContent += footerRow.join(',') + '\n';

        // Filename with periods
        const includeDate = localStorage.getItem('dateInExport') !== 'false';
        const dateStr = includeDate ? `-${new Date().toISOString().split('T')[0]}` : '';
        const periodStr = activeColumns.length > 0 ? ` - ${activeColumns.map(i => columnNames[i]).join(', ')}` : '';
        const filename = `grade-matrix${periodStr}${dateStr}.csv`;

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // Download table as PDF (filtered to active columns, with checks & footer)
    function downloadPDF() {
        // Enhanced check
        if (activeColumns.length === 0) {
            alert('No scores entered. Calculate averages first!');
            return;
        }
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });
            const tableData = [];
            
            // Dynamic headers: Subject + Active Periods + Subject Average
            const tableHeaders = ['Subject'];
            activeColumns.forEach(i => tableHeaders.push(columnNames[i]));
            tableHeaders.push('Subject Average');

            // Collect data from table (only tbody rows, filter columns)
            const tbodyRows = document.querySelectorAll('#gradeTable tbody tr');
            tbodyRows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                if (cells.length === 0) return;

                const rowData = [];
                rowData.push(cells[0].querySelector('input') ? (cells[0].querySelector('input').value || '') : cells[0].textContent.trim()); // Subject

                // Only active columns
                activeColumns.forEach(i => {
                    const cell = cells[i + 1]; // +1 skips subject column
                    const input = cell.querySelector('input');
                    rowData.push(input ? (input.value || '') : cell.textContent.trim());
                });

                rowData.push(cells[cells.length - 1].textContent.trim()); // Subject Average
                tableData.push(rowData);
            });

            if (tableData.length === 0) {
                alert('No data to export. Add subjects and scores first.');
                return;
            }

            // Add table to PDF
            doc.autoTable({
                head: [tableHeaders],
                body: tableData,
                startY: 30,
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [44, 73, 94] }, // Dark blue header
                margin: { left: 10, right: 10 }
            });

            // Add title, periods note, and overall avg
            doc.setFontSize(16);
            doc.text('Grade Matrix Report', 14, 10);
            const periodStr = activeColumns.length > 0 ? ` (Periods: ${activeColumns.map(i => columnNames[i]).join(', ')})` : '';
            doc.setFontSize(10);
            doc.text(`Filtered to entered data${periodStr}`, 14, 20);
            doc.setFontSize(12);
            doc.text(`Overall Average: ${document.getElementById('overallAverage').textContent}`, 14, doc.lastAutoTable.finalY + 10);

            // Add timestamp footer
            const pageHeight = doc.internal.pageSize.height;
            doc.setFontSize(8);
            doc.text(`Generated: ${new Date().toLocaleString()}`, 14, pageHeight - 10);

            // Filename with periods
            const includeDate = localStorage.getItem('dateInExport') !== 'false';
            const dateStr = includeDate ? `-${new Date().toISOString().split('T')[0]}` : '';
            const periodStrFile = activeColumns.length > 0 ? ` - ${activeColumns.map(i => columnNames[i]).join(', ')}` : '';
            const filename = `grade-matrix${periodStrFile}${dateStr}.pdf`;

            // Download
            doc.save(filename);
        } catch (err) {
            console.error('PDF Export Error:', err);
            showError('PDF export failed. Check console or try smaller table.');
        }
    }

    // Function to calculate averages
    function calculateAverages() {
        try {
            const rows = document.querySelectorAll('#gradeTable tbody tr');
            if (rows.length === 0) {
                showError('Please add at least one subject.');
                return;
            }

            const columnTotals = new Array(numScoreColumns).fill(0);
            const columnCounts = new Array(numScoreColumns).fill(0);
            let grandTotal = 0;
            let grandCount = 0;
            let invalidSubjects = [];
            lastSubjectAvgs = []; // Reset for stats

            columnIdMap.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '0.00';
            });

            for (let r = 0; r < rows.length; r++) {
                const row = rows[r];
                const subjectInput = row.querySelector('input[type="text"]');
                const scoreInputs = row.querySelectorAll('input[type="number"]');
                const avgCell = row.querySelector('.average-cell');

                if (!subjectInput || subjectInput.value.trim() === '') {
                    invalidSubjects.push(r + 1);
                    continue;
                }

                let subjectTotal = 0;
                let subjectValid = 0;

                for (let i = 0; i < scoreInputs.length; i++) {
                    const input = scoreInputs[i];
                    if (!input.value) continue;

                    let score = parseFloat(input.value);
                    if (isNaN(score) || score < 0 || score > 100) {
                        showError('Scores must be numbers between 0 and 100.');
                        return;
                    }
                    if (score > 100) score = 100; // Clamp to 100

                    subjectTotal += score;
                    subjectValid++;
                    grandTotal += score;
                    grandCount++;

                    columnTotals[i] += score;
                    columnCounts[i]++;
                }

                const subjectAvg = subjectValid > 0 ? (subjectTotal / subjectValid).toFixed(2) : '0.00';
                if (avgCell) avgCell.textContent = subjectAvg;
                lastSubjectAvgs.push({ name: subjectInput.value.trim(), avg: parseFloat(subjectAvg) });
            }

            if (invalidSubjects.length > 0) {
                showError(`Please name subjects in rows: ${invalidSubjects.join(', ')}`);
                return;
            }

            for (let i = 0; i < numScoreColumns; i++) {
                const colAvg = columnCounts[i] > 0 ? (columnTotals[i] / columnCounts[i]).toFixed(2) : '0.00';
                const colId = columnIdMap[i];
                const el = document.getElementById(colId);
                if (el) el.textContent = colAvg;
            }

            const overallAvg = grandCount > 0 ? (grandTotal / grandCount).toFixed(2) : '0.00';
            lastOverallAvg = overallAvg;
            const overallEl = document.getElementById('overallAverage');
            if (overallEl) overallEl.textContent = overallAvg + '%';

            // Track active columns (with data)
            activeColumns = [];
            for (let i = 0; i < numScoreColumns; i++) {
                if (columnCounts[i] > 0) {
                    activeColumns.push(i);
                }
            }

            displayResult(overallAvg);
            generateStats(); // Update profile stats
            clearError();
            toggleDownloadBtns(true);
        } catch (err) {
            console.error(err);
            showError('An unexpected error occurred. Check the console for details.');
        }
    }

    // Function to display result
    function displayResult(average) {
        const resultDiv = document.getElementById('result');
        const letter = getLetterGrade(average);
        resultDiv.innerHTML = `<div class="result">Overall Average Grade: ${average}% (${letter})</div>`;
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
        alert('Session saved!');
    }

    function loadSessions() {
        const sessions = JSON.parse(localStorage.getItem('savedSessions')) || [];
        const list = document.getElementById('sessionList');
        list.innerHTML = '';
        sessions.forEach(session => {
            const li = document.createElement('li');
            li.className = 'session-item';
            li.innerHTML = `
                <span>${session.timestamp} (Avg: ${session.overallAvg}%)</span>
                <div>
                    <button class="small-btn" onclick="loadSession(${session.id})">Load</button>
                    <button class="remove-btn" onclick="deleteSession(${session.id})">Delete</button>
                </div>
            `;
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
            setTimeout(() => calculateAverages(), 100);
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

    function generateStats() {
        const statsGrid = document.getElementById('statsGrid');
        if (lastSubjectAvgs.length === 0) {
            statsGrid.innerHTML = '<p class="stat-item">No data yet. Calculate grades first!</p>';
            return;
        }
        const totalSubjects = lastSubjectAvgs.length;
        const bestSubject = lastSubjectAvgs.reduce((max, curr) => curr.avg > max.avg ? curr : max);
        const worstSubject = lastSubjectAvgs.reduce((min, curr) => curr.avg < min.avg ? curr : min);
        statsGrid.innerHTML = `
            <div class="stat-item">
                <div>Total Subjects</div>
                <div class="stat-value">${totalSubjects}</div>
            </div>
            <div class="stat-item">
                <div>Overall Avg</div>
                <div class="stat-value">${lastOverallAvg}%</div>
            </div>
            <div class="stat-item">
                <div>Best: ${bestSubject.name}</div>
                <div class="stat-value">${bestSubject.avg}%</div>
            </div>
            <div class="stat-item">
                <div>Worst: ${worstSubject.name}</div>
                <div class="stat-value">${worstSubject.avg}%</div>
            </div>
        `;
    }

    // Contact functions (updated with EmailJS + Auto-Reply)
    function submitContactForm(e) {
        e.preventDefault();
        const name = document.getElementById('contactName').value.trim();
        const email = document.getElementById('contactEmail').value.trim();
        const subject = document.getElementById('contactSubject').value.trim();
        const message = document.getElementById('contactMessage').value.trim();

        // UPDATED: Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            alert('Please enter a valid email address.');
            return;
        }

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

            // Send auto-reply to user (only if main email succeeds)
            console.log('Sending auto-reply...');
            emailjs.send('service_t4jdpwc', 'template_awyrou5', {
                name: name,
                email: email,
                subject: `Re: ${subject}`,
                message: message
            }).then((replyResult) => {
                console.log('Auto-Reply Success:', replyResult.text);
            }).catch((replyError) => {
                console.error('Auto-Reply Error (non-blocking):', replyError);
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
            if (termsSec) termsSec.style.display = 'block';
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
        
        // Default subjects
        const defaults = localStorage.getItem('defaultSubjects') || 'Mathematics,English,Science,History';
        document.getElementById('defaultSubjectsInput').value = defaults;
        
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

    // Update low score threshold
    function updateThreshold() {
        const newVal = parseInt(document.getElementById('thresholdInput').value);
        if (newVal >= 0 && newVal <= 100) {
            currentThreshold = newVal;
            document.getElementById('currentThreshold').textContent = newVal;
            localStorage.setItem('lowScoreThreshold', newVal);
            // Re-apply to all inputs
            document.querySelectorAll('#gradeTable input[type="number"]').forEach(input => {
                updateScoreColor(input);
            });
            clearError();
        } else {
            showError('Threshold must be 0-100.');
        }
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
            toggleDownloadBtns(false);
            activeColumns = [];
            columnIdMap.forEach(id => document.getElementById(id).textContent = '0.00');
            document.getElementById('overallAverage').textContent = '0.00';
            document.getElementById('result').innerHTML = '';
            clearError();
            alert('Data cleared! Back to defaults.');
            showSection('grades');
        }
    }

    // Event listeners & Initial Load
    document.addEventListener('DOMContentLoaded', function() {
        // FIXED: Force close mobile nav on load/refresh
        closeMobileNav();

        // UPDATED: Initialize EmailJS with check
        if (typeof emailjs !== 'undefined') {
            emailjs.init('mMoFbLBQtA226NQY_');
            console.log('EmailJS initialized');
        } else {
            console.warn('EmailJS not loaded - check CDN link');
        }

        // Initialize Firebase Auth (now calls updateAuthUI immediately)
        initAuth();

        // Bind main buttons
        document.getElementById('addSubject').addEventListener('click', () => addSubjectRow(''));
        document.getElementById('calculate').addEventListener('click', calculateAverages);
        
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
    });
</script>