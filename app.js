const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterKey = '';
let currentView = 'active'; 
let localNotes = [];
let activeNoteId = null;
let saveTimeout = null;

// Helper: Formats timestamps to "x minutes ago"
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

// Mobile Sidebar Toggle
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
    flushPendingSave(); // Bug Fix: Save current work synchronously before switching tabs

    currentView = tab;
    document.getElementById('tab-active').classList.toggle('active', tab === 'active');
    document.getElementById('tab-gallery').classList.toggle('active', tab === 'gallery');
    document.getElementById('tab-trash').classList.toggle('active', tab === 'trash');
    
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('editor-active').style.display = 'none';
    document.getElementById('gallery-view').style.display = 'none';
    document.getElementById('app-sidebar').classList.remove('open'); // Close mobile menu

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

document.getElementById('search-bar').addEventListener('input', renderList);

function renderList() {
    if (currentView === 'gallery') return; 
    
    const query = document.getElementById('search-bar').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const listDiv = document.getElementById('notes-list');
    listDiv.innerHTML = '';

    let filtered = localNotes.filter(note => (note.title + note.content).toLowerCase().includes(query));

    // Apply Sorting
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
            flushPendingSave(); // Bug Fix: Save previous note before loading the new one
            loadNoteEditor(note._id);
        };
        listDiv.appendChild(div);
    });
}

function loadNoteEditor(id) {
    activeNoteId = id;
    const note = localNotes.find(n => n._id === id);
    renderList(); // Update selected style visually
    document.getElementById('app-sidebar').classList.remove('open'); // Close mobile menu on select

    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('editor-active').style.display = 'flex';
    document.getElementById('editor-title').value = note.title;
    document.getElementById('editor-content').value = note.content;
    
    // Updated Meta Display
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

// === BUG FIX: The Data Flush Logic ===
// We only debounce while typing to prevent spamming the API.
// We DO NOT rely on the 'blur' event anymore, which caused the race condition.
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
    
    const idToSave = activeNoteId; // Lock the ID locally
    const title = document.getElementById('editor-title').value;
    const content = document.getElementById('editor-content').value;
    
    // Optimistic local update
    const idx = localNotes.findIndex(n => n._id === idToSave);
    if (idx !== -1) {
        localNotes[idx].title = title;
        localNotes[idx].content = content;
        localNotes[idx].updatedAt = new Date().toISOString();
    }
    
    if (isAutoSave) {
        document.getElementById('meta-display').innerText = `Created: ${new Date(localNotes[idx].createdAt).toLocaleDateString()} | Updated: just now`;
        renderList(); // Update timestamps in sidebar quietly
    }

    // Fire and forget API call
    api('PUT', `/${idToSave}`, { title, content }).catch(err => console.error("Save failed:", err));
}

// === UTILITIES ===
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

// === MEDIA LOGIC ===
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
    document.getElementById('editor-title').value = "Uploading Media...";
    
    const newImg = await api('POST', `/${activeNoteId}/images`, fd, true);
    document.getElementById('editor-title').value = ogTitle;
    
    const note = localNotes.find(n => n._id === activeNoteId);
    note.images.push(newImg);
    renderImages(note.images);
}

function renderImages(images) {
    const gallery = document.getElementById('image-gallery');
    gallery.innerHTML = '';
    images.forEach(img => gallery.appendChild(createImageCard(img, true, activeNoteId)));
}

function renderGlobalGallery() {
    const globalGrid = document.getElementById('global-image-grid');
    globalGrid.innerHTML = '';
    localNotes.forEach(note => {
        note.images.forEach(img => globalGrid.appendChild(createImageCard(img, false, note._id)));
    });
}

function createImageCard(img, showDelete, noteId) {
    const card = document.createElement('div');
    card.className = 'img-card';
    
    const displaySrc = img.thumbUrl || img.url; 
    
    let html = `
        <img src="${displaySrc}" onclick="openModal('${img.url}', '${noteId}')">
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

function openModal(highResUrl, noteId) {
    currentModalUrl = highResUrl;
    currentModalNoteId = noteId;
    document.getElementById('modal-img').src = highResUrl; 
    
    const jumpBtn = document.getElementById('btn-jump-note');
    jumpBtn.style.display = (currentView === 'gallery' && noteId) ? 'flex' : 'none';
    
    document.getElementById('image-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('image-modal').style.display = 'none';
    document.getElementById('modal-img').src = ''; 
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