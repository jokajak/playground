const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_LONG_EDGE = 1200;

function validateFile(file) {
  if (!file.type.startsWith('image/')) throw new Error('Not an image file.');
  if (file.size > MAX_FILE_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new Error(`Image is ${mb} MB — maximum before resize is 5 MB.`);
  }
}

export function resizeToDataUrl(file) {
  validateFile(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      const scale = Math.max(w, h) > MAX_LONG_EDGE ? MAX_LONG_EDGE / Math.max(w, h) : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image.')); };
    img.src = url;
  });
}

// Resolve a File to a data URL, calling onError(msg) on failure.
export async function fileToDataUrl(file, onError) {
  try {
    return await resizeToDataUrl(file);
  } catch (e) {
    onError(e.message);
    return null;
  }
}

// Wire drag-drop handlers onto an element. Calls onFile(file) with the dropped image file.
export function wireDropzone(el, onFile) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave', e => { if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over'); });
  el.addEventListener('drop', e => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'));
    if (file) onFile(file);
  });
}

// Extract an image file from a paste ClipboardEvent, or return null.
export function imageFromPaste(e) {
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  return item ? item.getAsFile() : null;
}
