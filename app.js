const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterKey = '';
let currentView = 'active'; 
let localNotes = [];
let activeNoteId = null;
let saveTimeout = null;

async function authenticate() {
    masterKey = document.getElementById('master-pwd').value;
    if (!masterKey) return;
    document.getElementById('error-message').innerText = '> DECRYPTING...';
    try {
        await fetchNotes('active');
        document.getElementById('auth-layer').style.display = 'none';
        document.getElementById('workspace').style.display = 'flex';
        renderList();
    } catch (e) {
        document.getElementById('error-message').innerText = '> ACCESS_DENIED';
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
    if (!res.ok) throw new Error('API_FAULT');
    return res.json();
}

async function fetchNotes(view) {
    localNotes = await api('GET', `?trash=${view === 'trash'}`);
}

async function switchTab(tab) {
    currentView = tab;
    document.getElementById('tab-active').classList.toggle('active', tab === 'active');
    document.getElementById('tab-gallery').classList.toggle('active', tab === 'gallery');
    document.getElementById('tab-trash').classList.toggle('active', tab === 'trash');
    
    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('editor-active').style.display = 'none';
    document.getElementById('gallery-view').style.display = 'none';

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
    const listDiv = document.getElementById('notes-list');
    listDiv.innerHTML = '';

    const filtered = localNotes.filter(note => (note.title + note.content).toLowerCase().includes(query));

    filtered.forEach(note => {
        const div = document.createElement('div');
        div.className = `list-item ${note._id === activeNoteId ? 'selected' : ''}`;
        div.innerText = note.title || 'UNTITLED';
        div.onclick = () => loadNoteEditor(note._id);
        listDiv.appendChild(div);
    });
}

function loadNoteEditor(id) {
    activeNoteId = id;
    const note = localNotes.find(n => n._id === id);
    renderList(); 

    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('editor-active').style.display = 'flex';
    document.getElementById('editor-title').value = note.title;
    document.getElementById('editor-content').value = note.content;
    document.getElementById('meta-display').innerText = `CREATED: ${new Date(note.createdAt).toLocaleDateString()}`;

    const btnDelete = document.getElementById('btn-delete-note');
    const btnRestore = document.getElementById('btn-restore-note');
    
    if (currentView === 'trash') {
        btnDelete.innerText = '[ FORCE_DELETE ]';
        btnRestore.style.display = 'inline-block';
        document.getElementById('editor-title').disabled = true;
        document.getElementById('editor-content').disabled = true;
    } else {
        btnDelete.innerText = '[ DELETE_RECORD ]';
        btnRestore.style.display = 'none';
        document.getElementById('editor-title').disabled = false;
        document.getElementById('editor-content').disabled = false;
    }

    renderImages(note.images);
}

const inputNodes = ['editor-title', 'editor-content'];
inputNodes.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveActiveNote, 1500); 
    });
    el.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        saveActiveNote(); 
    });
});

async function saveActiveNote() {
    if (!activeNoteId || currentView === 'trash') return;
    const title = document.getElementById('editor-title').value;
    const content = document.getElementById('editor-content').value;
    await api('PUT', `/${activeNoteId}`, { title, content });
    const idx = localNotes.findIndex(n => n._id === activeNoteId);
    localNotes[idx].title = title;
    localNotes[idx].content = content;
    renderList();
}

async function createNewNote() {
    if(currentView !== 'active') await switchTab('active');
    const note = await api('POST', '');
    localNotes.unshift(note);
    loadNoteEditor(note._id);
}

async function deleteActiveNote() {
    if (!activeNoteId) return;
    const force = currentView === 'trash';
    await api('DELETE', `/${activeNoteId}?force=${force}`);
    await switchTab(currentView);
}

async function restoreActiveNote() {
    if (!activeNoteId) return;
    await api('PUT', `/${activeNoteId}`, { restore: true });
    await switchTab('trash');
}

// === IMAGE LOGIC ===
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
    document.getElementById('editor-title').value = "UPLOADING_MEDIA...";
    
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
    
    // Load thumbUrl to save bandwidth, fallback to url if thumb failed generating
    const displaySrc = img.thumbUrl || img.url; 
    
    let html = `
        <img src="${displaySrc}" onclick="openModal('${img.url}', '${noteId}')">
        <div class="meta">${(img.sizeBytes/1024).toFixed(1)}KB</div>
    `;
    if (showDelete) html += `<button title="Delete" onclick="deleteImage('${img._id}')">X</button>`;
    
    card.innerHTML = html;
    return card;
}

async function deleteImage(imgId) {
    const force = currentView === 'trash';
    await api('DELETE', `/${activeNoteId}?imageId=${imgId}&force=${force}`);
    const note = localNotes.find(n => n._id === activeNoteId);
    note.images = note.images.filter(i => i._id !== imgId);
    renderImages(note.images);
}

// === LIGHTBOX LOGIC ===
let currentModalUrl = '';
let currentModalNoteId = null;

function openModal(highResUrl, noteId) {
    currentModalUrl = highResUrl;
    currentModalNoteId = noteId;
    document.getElementById('modal-img').src = highResUrl; // Load the heavy image only on click
    
    const jumpBtn = document.getElementById('btn-jump-note');
    jumpBtn.style.display = (currentView === 'gallery' && noteId) ? 'flex' : 'none';
    
    document.getElementById('image-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('image-modal').style.display = 'none';
    document.getElementById('modal-img').src = ''; // Clear memory
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
        alert('IMAGE_COPIED');
    } catch (err) {
        alert('CLIPBOARD_API_UNSUPPORTED');
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