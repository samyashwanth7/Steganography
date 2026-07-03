const API_URL = "http://127.0.0.1:8000";

// Tab Switching
document.getElementById('tab-encode').onclick = () => switchTab('encode');
document.getElementById('tab-decode').onclick = () => switchTab('decode');

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`view-${tab}`).classList.add('active');
}

// File Dropzones
function setupDropzone(dropId, inputId, textId) {
  const drop = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  const text = document.getElementById(textId);

  drop.onclick = () => input.click();
  input.onchange = () => text.innerText = input.files[0] ? input.files[0].name : 'Click or Drag File Here';

  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('dragover'); };
  drop.ondragleave = () => drop.classList.remove('dragover');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      text.innerText = e.dataTransfer.files[0].name;
    }
  };
}

setupDropzone('drop-encode', 'file-encode', 'encode-filename');
setupDropzone('drop-decode', 'file-decode', 'decode-filename');

// Encode Function
document.getElementById('btn-encode').onclick = async () => {
  const coverFile = document.getElementById('file-encode').files[0];
  const key = document.getElementById('encode-key').value;
  const message = document.getElementById('encode-message').value;
  const secretFile = document.getElementById('encode-secret-file').files[0];
  const resDiv = document.getElementById('encode-result');

  if (!coverFile || !key) return alert("Cover media and Key are required.");
  if (!message && !secretFile) return alert("Must provide a text message or a secret file.");

  const formData = new FormData();
  formData.append('cover_media', coverFile);
  formData.append('key', key);
  
  let endpoint = "/api/encode-text";
  if (secretFile) {
    formData.append('secret_file', secretFile);
    endpoint = "/api/encode-file";
  } else {
    formData.append('message', message);
  }

  resDiv.classList.remove('hidden');
  resDiv.innerText = "Encoding... Please wait.";

  try {
    const response = await fetch(API_URL + endpoint, { method: "POST", body: formData });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Encoding failed");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "encoded_" + coverFile.name;
    a.click();
    resDiv.innerText = "Success! File downloaded.";
    resDiv.style.color = "var(--accent)";
  } catch (e) {
    resDiv.innerText = "Error: " + e.message;
    resDiv.style.color = "var(--primary)";
  }
};

// Decode Function
document.getElementById('btn-decode').onclick = async () => {
  const media = document.getElementById('file-decode').files[0];
  const key = document.getElementById('decode-key').value;
  const resDiv = document.getElementById('decode-result');

  if (!media || !key) return alert("Media and Key are required.");

  const formData = new FormData();
  formData.append('media', media);
  formData.append('key', key);

  resDiv.classList.remove('hidden');
  resDiv.innerText = "Decoding... Please wait.";
  resDiv.style.color = "var(--text-main)";

  try {
    const response = await fetch(API_URL + "/api/decode", { method: "POST", body: formData });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Decoding failed");
    }

    const contentType = response.headers.get("Content-Type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      resDiv.innerHTML = `<strong>Hidden Message:</strong><br>${data.message}`;
      resDiv.style.color = "var(--accent)";
    } else {
      // It's a file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = response.headers.get("content-disposition")?.split('filename="')[1]?.split('"')[0] || "secret_file";
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      resDiv.innerText = `Success! Secret file '${filename}' downloaded.`;
      resDiv.style.color = "var(--accent)";
    }
  } catch (e) {
    resDiv.innerText = "Error: " + e.message;
    resDiv.style.color = "var(--primary)";
  }
};
