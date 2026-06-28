const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterKey = '';
let currentView = 'active'; 
let localNotes = [];
let activeNoteId = null;
let saveTimeout = null;

// Helper: Time Ago Formatter
function timeAgo(dateString) {
    if (!dateString) return "Unknown date";
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

async function authenticate() {
    masterKey = document.getElementById('master-pwd').value;
    if (!masterKey) return;
    document.getElementById('error-message').innerText = 'Decrypting...';
    try {
        await fetchNotes();
        document.getElementById('auth-layer').style.display = 'none';
        document.getElementById('workspace').style.display = 'flex';
        renderList();
    } catch (e) {
        document.getElementById('error-message').innerText = 'Access Denied';
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
    if (!res.ok) throw new Error('API Error');
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

document.getElementById('search-bar').addEventListener('input', renderList);

function renderList() {
    const query = document.getElementById('search-bar').value.toLowerCase();
    const sortOrder = document.getElementById('sort-order').value;
    const listDiv = document.getElementById('notes-list');
    listDiv.innerHTML = '';

    let filtered = localNotes.filter(note => {
        return (note.title + note.content).toLowerCase().includes(query);
    });

    // Apply Sorting
    filtered.sort((a, b) => {
        const timeA = new Date(sortOrder.includes('edited') ? a.updatedAt : a.createdAt).getTime();
        const timeB = new Date(sortOrder.includes('edited') ? b.updatedAt : b.createdAt).getTime();
        return sortOrder.includes('desc') ? (timeB - timeA) : (timeA - timeB);
    });

    filtered.forEach(note => {
        const div = document.createElement('div');
        div.className = `list-item ${note._id === activeNoteId ? 'selected' : ''}`;
        
        const titleText = note.title || 'Untitled Note';
        const dateText = sortOrder.includes('edited') 
            ? `Edited ${timeAgo(note.updatedAt)}` 
            : `Created ${timeAgo(note.createdAt)}`;

        div.innerHTML = `
            <div class="item-title">${titleText}</div>
            <div class="item-meta">${dateText}</div>
        `;
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
    
    document.getElementById('meta-display').innerText = `Created: ${new Date(note.createdAt).toLocaleDateString()} | Last Edited: ${timeAgo(note.updatedAt)}`;

    // Manage Buttons
    const btnDelete = document.getElementById('btn-delete-note');
    const btnRestore = document.getElementById('btn-restore-note');
    
    if (currentView === 'trash') {
        btnDelete.innerText = 'Permanently Delete';
        btnRestore.style.display = 'inline-block';
        document.getElementById('editor-title').disabled = true;
        document.getElementById('editor-content').disabled = true;
    } else {
        btnDelete.innerText = 'Delete Note';
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
    localNotes[idx].updatedAt = new Date().toISOString();
    renderList();
    document.getElementById('meta-display').innerText = `Created: ${new Date(localNotes[idx].createdAt).toLocaleDateString()} | Last Edited: just now`;
}

async function createNewNote() {
    if(currentView === 'trash') await switchTab('active');
    const note = await api('POST', '');
    localNotes.unshift(note);
    loadNoteEditor(note._id);
}

async function deleteActiveNote() {
    if (!activeNoteId) return;
    if (confirm("Are you sure you want to delete this note?")) {
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

// === IMAGES ===
document.getElementById('editor-content').addEventListener('paste', async (e) => {
    if (currentView === 'trash') return;
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            e.preventDefault();
            await uploadImage(item.getAsFile());
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
    
    const originalTitle = document.getElementById('editor-title').value;
    document.getElementById('editor-title').value = "Uploading image...";
    
    const newImg = await api('POST', `/${activeNoteId}/images`, fd, true);
    
    document.getElementById('editor-title').value = originalTitle;
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
        card.innerHTML = `
            <img src="${img.url}" onclick="openModal('${img.url}')">
            <div class="meta">${img.width}x${img.height} | ${(img.sizeBytes/1024).toFixed(1)}KB</div>
            <button title="Delete Image" onclick="deleteImage('${img._id}')">&times;</button>
        `;
        gallery.appendChild(card);
    });
}

async function deleteImage(imgId) {
    if(confirm("Delete this image?")) {
        const force = currentView === 'trash';
        await api('DELETE', `/${activeNoteId}?imageId=${imgId}&force=${force}`);
        const note = localNotes.find(n => n._id === activeNoteId);
        note.images = note.images.filter(i => i._id !== imgId);
        renderImages(note.images);
    }
}

// === LIGHTBOX LOGIC ===
let currentModalUrl = '';

function openModal(url) {
    currentModalUrl = url;
    document.getElementById('modal-img').src = url;
    document.getElementById('image-modal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('image-modal').style.display = 'none';
    currentModalUrl = '';
}

async function copyModalImage() {
    try {
        const response = await fetch(currentModalUrl);
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        alert('Image copied to clipboard!');
    } catch (err) {
        alert('Clipboard API not fully supported in this browser. Try right-clicking the image.');
    }
}

async function downloadModalImage() {
    const response = await fetch(currentModalUrl);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `VincentNote_Image_${Date.now()}.png`;
    link.click();
}