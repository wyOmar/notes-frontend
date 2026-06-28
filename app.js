const API_URL = 'https://api.vincentchan.uk/api/notes';
let masterPassword = '';

async function authenticateAndLoad() {
    masterPassword = prompt("Enter your master password:");
    if (!masterPassword) return;

    const container = document.getElementById('notes-container');
    const errorDiv = document.getElementById('error-message');
    
    container.innerHTML = '<p style="text-align:center;">Decrypting notes...</p>';
    errorDiv.innerText = '';

    try {
        const response = await fetch(API_URL, {
            headers: {
                'x-api-key': masterPassword
            }
        });

        if (!response.ok) {
            throw new Error('Access Denied. Incorrect Password.');
        }

        const notes = await response.json();
        container.innerHTML = ''; 

        if (notes.length === 0) {
            container.innerHTML = '<p style="text-align:center;">No notes found.</p>';
            return;
        }

        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'note-card';
            
            let htmlContent = `<h2 class="note-title">${note.title}</h2><p>${note.content}</p>`;
            
            if (note.imageUrl) {
                htmlContent += `<img src="${note.imageUrl}" class="note-img" loading="lazy">`;
            }
            
            card.innerHTML = htmlContent;
            container.appendChild(card);
        });

        document.getElementById('login-btn').style.display = 'none';

    } catch (error) {
        container.innerHTML = '';
        errorDiv.innerText = error.message;
    }
}