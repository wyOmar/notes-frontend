const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterKey = '';
let currentView = 'active'; 
let localNotes = [];
let activeNoteId = null;
let saveTimeout = null;

// State Tracking to prevent phantom edits
let loadedTitle = '';
let loadedContent = '';

function timeAgo(dateString) {
    if (!dateString) return "Unknown";
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " yrs ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " mos ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hrs ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return "just now";
}

function toggleSidebar() {
    document.getElementById('app-sidebar').classList.toggle('open');
}

async function authenticate() {
    masterKey = document.getElementById('master-pwd').value;
    if (!masterKey) return;
    document.getElementById('error-message').innerText = 'Decrypting...';
    try {
        await fetchNotes('active');
        document.getElementById('auth-layer').style.display = 'none';
        document.getElementById('workspace').style.display = 'flex';
        renderList();
    } catch (e) {
        document.getElementById('error-message').innerText = 'Access Denied.';
    }
}

async function api(method, endpoint, body = null, isFormData = false) {
    const options = { method, headers: { 'x-api-key': masterKey } };
    if (body) {
        if (isFormData) options.body = body;
        else {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }
    const res = await fetch(`${API_URL}${endpoint}`, options);
    if (!res.ok) throw new Error('API Fault');
    return res.json();
}

async function fetchNotes(view) {
    localNotes = await api('GET', `?trash=${view === 'trash'}`);
}

async function switchTab(tab) {
    flushPendingSave(); 

    currentView = tab;
    document.getElementById('tab-active').classList.toggle('active', tab === 'active');
    document.getElementById('tab-gallery').classList.toggle('active', tab === 'gallery');
    document.getElementById('tab-trash').classList.toggle('active', tab === 'trash');
    
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('editor-active').style.display = 'none';
    document.getElementById('gallery-view').style.display = 'none';
    document.getElementById('app-sidebar').classList.remove('open'); 

    // Reset search bar visually
    document.getElementById('search-bar').value = '';

    if (tab === 'gallery') {
        await fetchNotes('active'); 
        document.getElementById('gallery-view').style.display = 'block';
        renderGlobalGallery();
        document.getElementById('notes-list').innerHTML = ''; 
    } else {
        await fetchNotes(tab);
        document.getElementById('editor-empty').style.display = 'block';
        renderList();
    }
    activeNoteId = null;
}

// Global Search Routing
document.getElementById('search-bar').addEventListener('input', () => {
    if (currentView === 'gallery') renderGlobalGallery();
    else renderList();
});

function renderList() {
    if (currentView === 'gallery') return; 
    
    const query = document.getElementById('search-bar').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const listDiv = document.getElementById('notes-list');
    listDiv.innerHTML = '';

    let filtered = localNotes.filter(note => (note.title + note.content).toLowerCase().includes(query));

    filtered.sort((a, b) => {
        const timeA = new Date(sortOrder.includes('edited') ? a.updatedAt : a.createdAt).getTime();
        const timeB = new Date(sortOrder.includes('edited') ? b.updatedAt : b.createdAt).getTime();
        return sortOrder.includes('desc') ? (timeB - timeA) : (timeA - timeB);
    });

    filtered.forEach(note => {
        const div = document.createElement('div');
        div.className = `list-item ${note._id === activeNoteId ? 'selected' : ''}`;
        
        const dateString = sortOrder.includes('edited') 
            ? `Edited ${timeAgo(note.updatedAt)}` 
            : `Created ${timeAgo(note.createdAt)}`;

        div.innerHTML = `
            <div>${note.title || 'Untitled'}</div>
            <div class="meta-text">${dateString}</div>
        `;
        
        div.onclick = () => {
            flushPendingSave(); 
            loadNoteEditor(note._id);
        };
        listDiv.appendChild(div);
    });
}

function loadNoteEditor(id) {
    activeNoteId = id;
    const note = localNotes.find(n => n._id === id);
    
    // Set base state tracking to prevent phantom edits
    loadedTitle = note.title || '';
    loadedContent = note.content || '';

    renderList(); 
    document.getElementById('app-sidebar').classList.remove('open'); 

    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('editor-active').style.display = 'flex';
    document.getElementById('editor-title').value = note.title;
    document.getElementById('editor-content').value = note.content;
    
    document.getElementById('meta-display').innerText = `Created: ${new Date(note.createdAt).toLocaleDateString()} | Updated: ${timeAgo(note.updatedAt)}`;

    const btnDelete = document.getElementById('btn-delete-note');
    const btnRestore = document.getElementById('btn-restore-note');
    
    if (currentView === 'trash') {
        btnRestore.style.display = 'inline-flex';
        document.getElementById('editor-title').disabled = true;
        document.getElementById('editor-content').disabled = true;
    } else {
        btnRestore.style.display = 'none';
        document.getElementById('editor-title').disabled = false;
        document.getElementById('editor-content').disabled = false;
    }

    renderImages(note.images);
}

document.getElementById('editor-title').addEventListener('input', scheduleSave);
document.getElementById('editor-content').addEventListener('input', scheduleSave);

function scheduleSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => flushPendingSave(true), 1500); 
}

async function flushPendingSave(isAutoSave = false) {
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }
    
    if (!activeNoteId || currentView === 'trash') return;
    
    const idToSave = activeNoteId; 
    const title = document.getElementById('editor-title').value;
    const content = document.getElementById('editor-content').value;
    
    // BUG FIX: Abort if no changes were actually made
    if (title === loadedTitle && content === loadedContent) return;

    // Update state tracking
    loadedTitle = title;
    loadedContent = content;

    const idx = localNotes.findIndex(n => n._id === idToSave);
    if (idx !== -1) {
        localNotes[idx].title = title;
        localNotes[idx].content = content;
        localNotes[idx].updatedAt = new Date().toISOString();
    }
    
    if (isAutoSave) {
        document.getElementById('meta-display').innerText = `Created: ${new Date(localNotes[idx].createdAt).toLocaleDateString()} | Updated: just now`;
        renderList(); 
    }

    api('PUT', `/${idToSave}`, { title, content }).catch(err => console.error("Save failed:", err));
}

async function copyNoteContent() {
    const title = document.getElementById('editor-title').value;
    const content = document.getElementById('editor-content').value;
    const fullText = `${title}\n\n${content}`;
    try {
        await navigator.clipboard.writeText(fullText);
        alert('Record copied to clipboard.');
    } catch (err) {
        alert('Failed to copy.');
    }
}

async function createNewNote() {
    flushPendingSave();
    if(currentView !== 'active') await switchTab('active');
    const note = await api('POST', '');
    localNotes.unshift(note);
    loadNoteEditor(note._id);
}

async function deleteActiveNote() {
    if (!activeNoteId) return;
    if (confirm("Delete this record?")) {
        const force = currentView === 'trash';
        await api('DELETE', `/${activeNoteId}?force=${force}`);
        await switchTab(currentView);
    }
}

async function restoreActiveNote() {
    if (!activeNoteId) return;
    await api('PUT', `/${activeNoteId}`, { restore: true });
    await switchTab('trash');
}

window.addEventListener('paste', async (e) => {
    if (!activeNoteId || currentView === 'trash') return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        if (items[index].kind === 'file') {
            e.preventDefault();
            await uploadImage(items[index].getAsFile());
        }
    }
});

async function handleManualUpload(e) {
    if (e.target.files[0]) await uploadImage(e.target.files[0]);
    e.target.value = ''; 
}

async function uploadImage(file) {
    if (!activeNoteId) return;
    const fd = new FormData();
    fd.append('image', file);
    
    const ogTitle = document.getElementById('editor-title').value;
    document.getElementById('editor-title').value = "Uploading Media & Analyzing...";
    
    try {
        const newImg = await api('POST', `/${activeNoteId}/images`, fd, true);
        const note = localNotes.find(n => n._id === activeNoteId);
        note.images.push(newImg);
        renderImages(note.images);
    } catch (err) {
        alert("Upload or Vision API failed.");
    } finally {
        document.getElementById('editor-title').value = ogTitle;
    }
}

function renderImages(images) {
    const gallery = document.getElementById('image-gallery');
    gallery.innerHTML = '';
    images.forEach(img => gallery.appendChild(createImageCard(img, true, activeNoteId)));
}

function renderGlobalGallery() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const globalGrid = document.getElementById('global-image-grid');
    globalGrid.innerHTML = '';
    
    localNotes.forEach(note => {
        note.images.forEach(img => {
            let searchable = "";
            if (img.visionData) {
                // Compile vision metadata into a searchable string block
                searchable = JSON.stringify(img.visionData).toLowerCase();
            }
            if (!query || searchable.includes(query)) {
                globalGrid.appendChild(createImageCard(img, false, note._id));
            }
        });
    });
}

function renderVisionData(vision) {
    if (!vision) return '';
    let html = `<div class="vision-block">`;
    
    if (vision.labels && vision.labels.length > 0) {
        html += `<strong>Labels (≥0.7):</strong><pre>${vision.labels.join('\n')}</pre>`;
    }
    if (vision.text) {
        html += `<strong>Text Detection:</strong><pre>${vision.text}</pre>`;
    }
    if (vision.webGuesses && vision.webGuesses.length > 0) {
        html += `<strong>Web Guesses:</strong><pre>${vision.webGuesses.join('\n')}</pre>`;
    }
    if (vision.webEntities && vision.webEntities.length > 0) {
        html += `<strong>Web Entities (≥0.7):</strong><pre>${vision.webEntities.join('\n')}</pre>`;
    }
    if (vision.objects && vision.objects.length > 0) {
        html += `<strong>Objects (≥0.7):</strong><pre>${vision.objects.join('\n')}</pre>`;
    }
    
    html += `</div>`;
    return html === `<div class="vision-block"></div>` ? '' : html;
}

function createImageCard(img, showDelete, noteId) {
    const card = document.createElement('div');
    card.className = 'img-card';
    const displaySrc = img.thumbUrl || img.url; 
    
    // Vision rendering explicitly removed from thumbnail view
    let html = `
        <img src="${displaySrc}" onclick="openModal('${noteId}', '${img._id}')">
        <div class="meta">${(img.sizeBytes/1024).toFixed(1)}KB</div>
    `;
    
    if (showDelete) {
        html += `<button title="Delete Media" onclick="deleteImage('${img._id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>`;
    }
    
    card.innerHTML = html;
    return card;
}

async function deleteImage(imgId) {
    if (confirm("Remove this media?")) {
        const force = currentView === 'trash';
        await api('DELETE', `/${activeNoteId}?imageId=${imgId}&force=${force}`);
        const note = localNotes.find(n => n._id === activeNoteId);
        note.images = note.images.filter(i => i._id !== imgId);
        renderImages(note.images);
    }
}

// === LIGHTBOX LOGIC ===
let currentModalUrl = '';
let currentModalNoteId = null;

function openModal(noteId, imgId) {
    const note = localNotes.find(n => n._id === noteId);
    if (!note) return;
    const img = note.images.find(i => i._id === imgId);
    if (!img) return;

    currentModalUrl = img.url;
    currentModalNoteId = noteId;

    document.getElementById('modal-img').src = img.url; 
    document.getElementById('modal-vision-container').innerHTML = renderVisionData(img.visionData);
    
    const jumpBtn = document.getElementById('btn-jump-note');
    jumpBtn.style.display = (currentView === 'gallery' && noteId) ? 'flex' : 'none';
    
    document.getElementById('image-modal').style.display = 'flex';
}

function closeModal(e) {
    // Only close if clicking exactly on the dark background or the button
    if (e && e.target.id !== 'image-modal' && !e.target.classList.contains('close-modal')) return;
    
    document.getElementById('image-modal').style.display = 'none';
    document.getElementById('modal-img').src = ''; 
    document.getElementById('modal-vision-container').innerHTML = '';
    currentModalUrl = '';
}

async function jumpToNote() {
    closeModal();
    await switchTab('active');
    loadNoteEditor(currentModalNoteId);
}

async function copyModalImage() {
    try {
        const response = await fetch(currentModalUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        alert('Media copied to clipboard.');
    } catch (err) {
        alert('Clipboard API unsupported in this browser for images.');
    }
}

async function downloadModalImage() {
    const response = await fetch(currentModalUrl);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Media_${Date.now()}.png`;
    link.click();
}