// VHunter Notes Module
import * as db from './db.js';
import * as ui from './ui.js';
import { switchPage } from './pages.js';

export let notesCache = [];
let runCallback = null;

export function setRunCallback(callback) {
  runCallback = callback;
}

export async function loadNotes() {
  try {
    const result = await db.getNotes();
    notesCache = Array.isArray(result) ? result : (result.data || []);
    renderNotes();
  } catch (e) {
    console.error('Failed to load notes:', e);
  }
}

export function renderNotes() {
  const container = document.getElementById('notesList');

  if (!notesCache.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">No notes yet</div>
        <div class="empty-hint">Capture your trading ideas</div>
      </div>
    `;
    return;
  }

  container.innerHTML = notesCache.map(n => {
    const date = new Date(n.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    const tags = n.tags ? n.tags.split(',').map(t => t.trim()).filter(t => t) : [];

    return `
      <div class="note-card">
        <div class="note-header">
          <span class="note-ticker">${n.ticker}</span>
          <span class="note-date">${date}</span>
        </div>
        <div class="note-content">${n.content}</div>
        ${tags.length ? `
          <div class="note-tags">
            ${tags.map(t => `<span class="note-tag">${t}</span>`).join('')}
          </div>
        ` : ''}
        <div class="note-actions">
          <button class="btn-secondary btn-sm" onclick="editNote('${n.id}')">Edit</button>
          <button class="btn-secondary btn-sm" onclick="analyzeNoteTicker('${n.ticker}')">Analyze</button>
          <button class="btn-secondary btn-sm btn-danger" onclick="deleteNote('${n.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

export function openNoteModal(note = null) {
  document.getElementById('noteModalTitle').textContent = note ? 'Edit Note' : 'New Note';
  document.getElementById('noteId').value = note?.id || '';
  document.getElementById('noteTicker').value = note?.ticker || ui.$('tk').value || '';
  document.getElementById('noteTags').value = note?.tags || '';
  document.getElementById('noteContent').value = note?.content || '';
  document.getElementById('noteModal').classList.add('active');
}

export function closeNoteModal() {
  document.getElementById('noteModal').classList.remove('active');
}

export async function saveNote(e) {
  e.preventDefault();

  const note = {
    ticker: document.getElementById('noteTicker').value.toUpperCase(),
    tags: document.getElementById('noteTags').value || null,
    content: document.getElementById('noteContent').value
  };

  const id = document.getElementById('noteId').value;

  try {
    if (id) {
      await db.updateNote(id, note.content, note.tags);
    } else {
      await db.addNote(note);
    }
    closeNoteModal();
    loadNotes();
  } catch (e) {
    alert('Failed to save note: ' + e.message);
  }
}

export function editNote(id) {
  const note = notesCache.find(n => n.id === id);
  if (note) openNoteModal(note);
}

export async function deleteNote(id) {
  if (!confirm('Delete this note?')) return;

  try {
    await db.deleteNote(id);
    loadNotes();
  } catch (e) {
    alert('Failed to delete note: ' + e.message);
  }
}

export function analyzeNoteTicker(ticker) {
  ui.$('tk').value = ticker;
  switchPage('analyze');
  if (runCallback) runCallback();
}

// Expose to window for onclick handlers
window.openNoteModal = openNoteModal;
window.closeNoteModal = closeNoteModal;
window.saveNote = saveNote;
window.editNote = editNote;
window.deleteNote = deleteNote;
window.analyzeNoteTicker = analyzeNoteTicker;
