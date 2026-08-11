export function uploadMedia(url: string, blob: Blob, filename: string, onProgress: (value: number) => void) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); const form = new FormData(); form.append('file', blob, filename);
    xhr.open('POST', url); xhr.withCredentials = true;
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error('network'));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('invalid upload response')); } return; }
      let detail = ''; try { detail = JSON.parse(xhr.responseText).detail || ''; } catch { /* non-JSON error */ }
      reject(new Error(`upload status ${xhr.status}${detail ? `: ${detail}` : ''}`));
    };
    xhr.send(form);
  });
}
