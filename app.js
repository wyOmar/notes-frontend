const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterKey = '';
let currentView = 'active'; // 'active' or 'trash'
let localNotes = [];
let activeNoteId = null;
let saveTimeout = null;

async function authenticate() {
    masterKey = document.getElementById('master-pwd').value;
    if (!masterKey) return;
    document.getElementById('error-message').innerText = '> DECRYPTING...';
    try {
        await fetchNotes();
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

async function fetchNotes() {
    localNotes = await api('GET', `?trash=${currentView === 'trash'}`);
}

async function switchTab(tab) {
    currentView = tab;
    document.getElementById('tab-active').classList.toggle('active', tab === 'active');
    document.getElementById('tab-trash').classList.toggle('active', tab === 'trash');
    activeNoteId = null;
    document.getElementById('editor-active').style.display = 'none';
    document.getElementById('editor-empty').style.display = 'block';
    await fetchNotes();
    renderList();
}

// === SEARCH PARSER ===
document.getElementById('search-bar').addEventListener('input', renderList);

function renderList() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const listDiv = document.getElementById('notes-list');
    listDiv.innerHTML = '';

    // Parse specific flags
    const afterMatch = query.match(/after:(\d{4}-\d{2}-\d{2})/);
    const beforeMatch = query.match(/before:(\d{4}-\d{2}-\d{2})/);
    const cleanQuery = query.replace(/after:\S+/g, '').replace(/before:\S+/g, '').trim();

    const filtered = localNotes.filter(note => {
        let textMatch = (note.title + note.content).toLowerCase().includes(cleanQuery);
        let timeMatch = true;
        const nTime = new Date(note.createdAt).getTime();
        
        if (afterMatch) timeMatch = timeMatch && (nTime >= new Date(afterMatch[1]).getTime());
        if (beforeMatch) timeMatch = timeMatch && (nTime <= new Date(beforeMatch[1]).getTime());

        return textMatch && timeMatch;
    });

    filtered.forEach(note => {
        const div = document.createElement('div');
        div.className = `list-item ${note._id === activeNoteId ? 'selected' : ''}`;
        div.innerText = note.title || 'UNTITLED';
        div.onclick = () => loadNoteEditor(note._id);
        listDiv.appendChild(div);
    });
}

// === EDITOR / AUTO-SAVE LOGIC ===
function loadNoteEditor(id) {
    activeNoteId = id;
    const note = localNotes.find(n => n._id === id);
    renderList(); // Update selected state

    document.getElementById('editor-empty').style.display = 'none';
    document.getElementById('editor-active').style.display = 'flex';
    
    document.getElementById('editor-title').value = note.title;
    document.getElementById('editor-content').value = note.content;
    
    const dDate = new Date(note.createdAt).toLocaleDateString();
    document.getElementById('meta-display').innerText = `CREATED: ${dDate} | IMAGES: ${note.images.length}`;

    const btn = document.getElementById('btn-delete-note');
    btn.innerText = currentView === 'trash' ? '[ FORCE_DELETE ]' : '[ DELETE_RECORD ]';

    renderImages(note.images);
}

const inputNodes = ['editor-title', 'editor-content'];
inputNodes.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveActiveNote, 1500); // Debounce typing
    });
    el.addEventListener('blur', () => {
        clearTimeout(saveTimeout);
        saveActiveNote(); // Save on exit
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

// === IMAGE UPLOAD LOGIC ===
document.getElementById('editor-content').addEventListener('paste', async (e) => {
    if (currentView === 'trash') return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            e.preventDefault();
            const blob = item.getAsFile();
            await uploadImage(blob);
        }
    }
});

async function handleManualUpload(e) {
    if (e.target.files[0]) await uploadImage(e.target.files[0]);
    e.target.value = ''; // reset
}

async function uploadImage(file) {
    if (!activeNoteId) return;
    const fd = new FormData();
    fd.append('image', file);
    
    document.getElementById('editor-title').value = "UPLOADING...";
    const newImg = await api('POST', `/${activeNoteId}/images`, fd, true);
    document.getElementById('editor-title').value = localNotes.find(n => n._id === activeNoteId).title;

    const note = localNotes.find(n => n._id === activeNoteId);
    note.images.push(newImg);
    renderImages(note.images);
}

function renderImages(images) {
    const gallery = document.getElementById('image-gallery');
    gallery.innerHTML = '';
    images.forEach(img => {
        const card = document.createElement('div');
        card.className = 'img-card';
        
        const sizeKb = (img.sizeBytes / 1024).toFixed(1);
        const resolution = img.width ? `${img.width}x${img.height}` : 'UNKNOWN';
        
        card.innerHTML = `
            <img src="${img.url}">
            <div class="meta">${resolution} | ${sizeKb}KB</div>
            <button onclick="deleteImage('${img._id}')">X</button>
        `;
        gallery.appendChild(card);
    });
}

async function deleteImage(imgId) {
    const force = currentView === 'trash';
    await api('DELETE', `/${activeNoteId}?imageId=${imgId}&force=${force}`);
    
    const note = localNotes.find(n => n._id === activeNoteId);
    note.images = note.images.filter(i => i._id !== imgId);
    renderImages(note.images);
}