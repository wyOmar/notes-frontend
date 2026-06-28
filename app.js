const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterPassword = '';

async function authenticateAndLoad() {
    masterPassword = prompt("INPUT MASTER KEY:");
    if (!masterPassword) return;

    await loadNotes();
}

async function loadNotes() {
    const container = document.getElementById('notes-container');
    const errorDiv = document.getElementById('error-message');
    
    container.innerHTML = '<p style="text-align:center;">> DECRYPTING_RECORDS...</p>';
    errorDiv.innerText = '';

    try {
        const response = await fetch(API_URL, {
            headers: {
                'x-api-key': masterPassword
            }
        });

        if (!response.ok) {
            throw new Error('ACCESS DENIED.');
        }

        const notes = await response.json();
        container.innerHTML = ''; 

        // Unhide form block and hide login button
        document.getElementById('create-form-container').style.display = 'block';
        document.getElementById('login-btn').style.display = 'none';

        if (notes.length === 0) {
            container.innerHTML = '<p style="text-align:center;">> NO_RECORDS_FOUND.</p>';
            return;
        }

        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';
            
            // Map directly to your Schema variables
            let htmlContent = `<h2 class="note-title">${note.title || 'UNTITLED'}</h2><p>${note.content}</p>`;
            
            if (note.imageUrl) {
                htmlContent += `<img src="${note.imageUrl}" class="note-img" loading="lazy">`;
            }
            
            card.innerHTML = htmlContent;
            container.appendChild(card);
        });

    } catch (error) {
        container.innerHTML = '';
        errorDiv.innerText = `> ERROR: ${error.message}`;
    }
}

// Intercept form submission and build Multipart Data 
document.getElementById('createNoteForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 

    const title = document.getElementById('noteTitle').value;
    const content = document.getElementById('noteContent').value;
    const imageFile = document.getElementById('noteImage').files[0];
    
    const formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    if (imageFile) {
        formData.append('image', imageFile);
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'x-api-key': masterPassword
                // Do NOT set Content-Type header manually. Browser handles the multipart boundary automatically.
            },
            body: formData
        });

        if (response.ok) {
            alert('RECORD_SAVED.');
            document.getElementById('createNoteForm').reset();
            await loadNotes(); // Reload the updated feed
        } else {
            const err = await response.json();
            alert(`API_ERROR: ${err.error}`);
        }
    } catch (error) {
        console.error('Submission fault:', error);
        alert('NETWORK_FAULT.');
    }
});