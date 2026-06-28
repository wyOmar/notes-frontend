const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterKey = '';
let currentView = 'workspace'; 
let localNotes = [];
let activeNoteId = null;
let saveTimeout = null;

let loadedTitle = '';
let loadedContent = '';

const TICK_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

function showTick(btn) {
    const og = btn.innerHTML;
    btn.innerHTML = TICK_SVG;
    setTimeout(() => btn.innerHTML = og, 2000);
}

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

function formatExactDate(dateString) {
    if (!dateString) return "Unknown";
    const d = new Date(dateString);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function toggleSidebar() { document.getElementById('app-sidebar').classList.toggle('open'); }

async function authenticate() {
    masterKey = document.getElementById('master-pwd').value;
    if (!masterKey) return;
    document.getElementById('error-message').innerText = 'Decrypting...';
    try {
        await fetchNotes('workspace');
        document.getElementById('auth-layer').style.display = 'none';
        document.getElementById('workspace').style.display = 'flex';
        renderList();
        renderGlobalGallery();
    } catch (e) {
        document.getElementById('error-message').innerText = 'Access Denied.';
    }
}

async function api(method, endpoint, body = null, isFormData = false) {
    const options = { method, headers: { 'x-api-key': masterKey } };
    if (body) {
        if (isFormData) options.body = body;
        else { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(body); }
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
    
    document.getElementById('tab-trash').style.display = tab === 'trash' ? 'none' : 'block';
    document.getElementById('btn-workspace').style.display = tab === 'trash' ? 'block' : 'none';
    
    document.getElementById('editor-active').style.display = 'none';
    document.getElementById('app-sidebar').classList.remove('open'); 
    document.getElementById('search-bar').value = '';

    if (tab === 'workspace') {
        await fetchNotes('workspace'); 
        activeNoteId = null;
        document.getElementById('gallery-view').style.display = 'block';
        renderGlobalGallery();
        renderList();
    } else {
        await fetchNotes('trash');
        activeNoteId = null;
        document.getElementById('gallery-view').style.display = 'none';
        renderList();
    }
}

document.getElementById('search-bar').addEventListener('input', () => {
    if (!activeNoteId && currentView === 'workspace') renderGlobalGallery();
    renderList();
});

function renderList() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const listDiv = document.getElementById('notes-list');
    listDiv.innerHTML = '';

    let filtered = localNotes.filter(note => note.title !== '__GLOBAL_MEDIA__' && (note.title + note.content).toLowerCase().includes(query));

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
            : `Created ${formatExactDate(note.createdAt)}`;

        div.innerHTML = `<div>${note.title || 'Untitled'}</div><div class="meta-text">${dateString}</div>`;
        
        div.onclick = () => {
            flushPendingSave(); 
            if (activeNoteId === note._id) {
                activeNoteId = null;
                document.getElementById('editor-active').style.display = 'none';
                if (currentView === 'workspace') document.getElementById('gallery-view').style.display = 'block';
                renderList();
            } else {
                loadNoteEditor(note._id);
            }
        };
        listDiv.appendChild(div);
    });
}

function loadNoteEditor(id) {
    activeNoteId = id;
    const note = localNotes.find(n => n._id === id);
    
    loadedTitle = note.title || '';
    loadedContent = note.content || '';

    renderList(); 
    document.getElementById('app-sidebar').classList.remove('open'); 
    document.getElementById('gallery-view').style.display = 'none';
    document.getElementById('editor-active').style.display = 'flex';
    document.getElementById('editor-title').value = note.title;
    document.getElementById('editor-content').value = note.content;
    
    document.getElementById('meta-display').innerText = `Created: ${formatExactDate(note.createdAt)} | Updated: ${timeAgo(note.updatedAt)}`;

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
    if (saveTimeout) { clearTimeout(saveTimeout); saveTimeout = null; }
    if (!activeNoteId || currentView === 'trash') return;
    
    const idToSave = activeNoteId; 
    const title = document.getElementById('editor-title').value;
    const content = document.getElementById('editor-content').value;
    
    if (title === loadedTitle && content === loadedContent) return;

    loadedTitle = title;
    loadedContent = content;

    const idx = localNotes.findIndex(n => n._id === idToSave);
    if (idx !== -1) {
        localNotes[idx].title = title;
        localNotes[idx].content = content;
        localNotes[idx].updatedAt = new Date().toISOString();
    }
    
    if (isAutoSave) {
        document.getElementById('meta-display').innerText = `Created: ${formatExactDate(localNotes[idx].createdAt)} | Updated: just now`;
        renderList(); 
    }
    api('PUT', `/${idToSave}`, { title, content }).catch(err => console.error("Save failed:", err));
}

async function copyNoteContent(btn) {
    const title = document.getElementById('editor-title').value;
    const content = document.getElementById('editor-content').value;
    try {
        await navigator.clipboard.writeText(`${title}\n\n${content}`);
        showTick(btn);
    } catch (err) {}
}

async function createNewNote() {
    flushPendingSave();
    if(currentView !== 'workspace') await switchTab('workspace');
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

// === ESC & DRAG DROP ROUTING ===
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.getElementById('image-modal').style.display === 'flex') {
            closeModal();
        } else if (activeNoteId) {
            flushPendingSave();
            activeNoteId = null;
            document.getElementById('editor-active').style.display = 'none';
            if (currentView === 'workspace') document.getElementById('gallery-view').style.display = 'block';
            renderList();
        }
    }
});

window.addEventListener('paste', async (e) => {
    if (currentView === 'trash') return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        if (items[index].kind === 'file') {
            e.preventDefault();
            await uploadImage(items[index].getAsFile(), activeNoteId || 'global');
        }
    }
});

window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', async e => {
    e.preventDefault();
    if (currentView === 'trash') return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        for (let file of files) {
            if (file.type.startsWith('image/')) await uploadImage(file, activeNoteId || 'global');
        }
    }
});

async function handleManualUpload(e) {
    if (e.target.files[0]) await uploadImage(e.target.files[0], activeNoteId || 'global');
    e.target.value = ''; 
}

async function uploadImage(file, targetId) {
    const fd = new FormData();
    fd.append('image', file);
    
    // Optimistic UI Injection
    const localUrl = URL.createObjectURL(file);
    const tempId = 'temp-' + Date.now();
    const tempImg = { _id: tempId, url: localUrl, thumbUrl: localUrl, sizeBytes: file.size, isTemp: true };

    let note;
    if (targetId === 'global') {
        note = localNotes.find(n => n.title === '__GLOBAL_MEDIA__');
        if (!note) { note = { _id: 'global', title: '__GLOBAL_MEDIA__', images: [] }; localNotes.push(note); }
    } else {
        note = localNotes.find(n => n._id === targetId);
    }

    if (note) {
        note.images.push(tempImg);
        if (activeNoteId === targetId) renderImages(note.images);
        else if (currentView === 'workspace' && !activeNoteId) renderGlobalGallery();
    }
    
    try {
        const newImg = await api('POST', `/${targetId}/images`, fd, true);
        const idx = note.images.findIndex(i => i._id === tempId);
        if (idx !== -1) note.images[idx] = newImg;

        if (activeNoteId === targetId) renderImages(note.images);
        else if (currentView === 'workspace' && !activeNoteId) renderGlobalGallery();
    } catch (err) {
        note.images = note.images.filter(i => i._id !== tempId);
        if (activeNoteId === targetId) renderImages(note.images);
        else if (currentView === 'workspace' && !activeNoteId) renderGlobalGallery();
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
            let searchable = img.visionData ? JSON.stringify(img.visionData).toLowerCase() : "";
            if (!query || searchable.includes(query)) {
                globalGrid.appendChild(createImageCard(img, true, note._id));
            }
        });
    });
}

function renderVisionData(vision) {
    if (!vision) return '';
    let html = `<div class="vision-block">`;
    if (vision.labels && vision.labels.length > 0) html += `<strong>Labels (≥0.7):</strong><pre>${vision.labels.join('\n')}</pre>`;
    if (vision.text) html += `<strong>Text Detection:</strong><pre>${vision.text}</pre>`;
    if (vision.webGuesses && vision.webGuesses.length > 0) html += `<strong>Web Guesses:</strong><pre>${vision.webGuesses.join('\n')}</pre>`;
    if (vision.webEntities && vision.webEntities.length > 0) html += `<strong>Web Entities (≥0.7):</strong><pre>${vision.webEntities.join('\n')}</pre>`;
    if (vision.objects && vision.objects.length > 0) html += `<strong>Objects (≥0.7):</strong><pre>${vision.objects.join('\n')}</pre>`;
    html += `</div>`;
    return html === `<div class="vision-block"></div>` ? '' : html;
}

function createImageCard(img, showDelete, noteId) {
    const card = document.createElement('div');
    card.className = `img-card ${img.isTemp ? 'temp' : ''}`;
    const displaySrc = img.thumbUrl || img.url; 
    
    let html = `
        <img src="${displaySrc}" onclick="${img.isTemp ? '' : `openModal('${noteId}', '${img._id}')`}">
        <div class="meta">${(img.sizeBytes/1024).toFixed(1)}KB</div>
    `;
    if (showDelete && !img.isTemp) {
        html += `<button title="Delete Media" onclick="deleteImage('${img._id}', '${noteId}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>`;
    }
    card.innerHTML = html;
    return card;
}

async function deleteImage(imgId, noteId) {
    if (confirm("Remove this media?")) {
        const force = currentView === 'trash';
        await api('DELETE', `/${noteId}?imageId=${imgId}&force=${force}`);
        const note = localNotes.find(n => n._id === noteId);
        if (note) {
            note.images = note.images.filter(i => i._id !== imgId);
            if (activeNoteId === noteId) renderImages(note.images);
            else if (currentView === 'workspace' && !activeNoteId) renderGlobalGallery();
        }
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
    jumpBtn.style.display = (!activeNoteId && note.title !== '__GLOBAL_MEDIA__') ? 'flex' : 'none';
    
    document.getElementById('image-modal').style.display = 'flex';
}

function closeModal(e) {
    if (e && e.target.id !== 'image-modal' && !e.target.classList.contains('close-modal')) return;
    document.getElementById('image-modal').style.display = 'none';
    document.getElementById('modal-img').src = ''; 
    document.getElementById('modal-vision-container').innerHTML = '';
    currentModalUrl = '';
}

async function jumpToNote() {
    closeModal();
    loadNoteEditor(currentModalNoteId);
}

async function copyModalImage(btn) {
    try {
        const response = await fetch(currentModalUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        showTick(btn);
    } catch (err) {}
}

async function downloadModalImage() {
    const response = await fetch(currentModalUrl);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Media_${Date.now()}.png`;
    link.click();
}