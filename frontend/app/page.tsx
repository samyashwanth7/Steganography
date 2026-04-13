"use client";

import { useState, useCallback, useId, useRef, FC, useEffect } from 'react';
import { UploadCloud, X, File as FileIcon, Type, Lock, Unlock, ClipboardCopy, Music, Eye, EyeOff, KeyRound, CheckCircle, XCircle, Info, PlusCircle, Trash2, Save, Library, Edit2, Check, ChevronDown, ChevronUp, LogOut, AlertTriangle, User, Shield, Send, Inbox } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralNetworkAnimation from './components/NeuralNetworkAnimation';

// --- Type Definitions ---
type SecretEntry = {
  id: string;
  type: 'text' | 'file' | 'password';
  key: string;
  keyStrength: { score: number; label: string; feedback: string[] } | null;
  isKeyVisible: boolean;
  isCollapsed: boolean;
  data: {
    message: string;
    file: File | null;
    website: string;
    username: string;
    password: string;
    isPasswordVisible: boolean;
    faviconUrl: string | null;
  };
};

type Toast = { id: string; type: 'success' | 'error'; message: string };
type ConfirmationType = { isOpen: boolean; title: string; message: string; onConfirm: () => void };

// --- Reusable UI Components ---

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const CapacityBar: FC<{ used: number; total: number }> = ({ used, total }) => {
  if (total === 0) return null;
  const percentage = Math.min(100, (used / total) * 100);
  const color = percentage > 90 ? 'bg-red-500' : percentage > 75 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="w-full mt-2">
      <div className="flex justify-between text-xs text-red-300 mb-1">
        <span>Storage: {formatBytes(used)} / {formatBytes(total)}</span>
        <span>{percentage.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-red-950 rounded-full overflow-hidden border border-red-900">
        <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

const MediaDropzone: FC<{ onFileChange: (file: File) => void; file: File | null; clearFile: () => void; accept?: string; label: string; }> =
  ({ onFileChange, file, clearFile, accept = "image/*, audio/*, text/plain", label }) => {
    const [isDragging, setIsDragging] = useState(false);
    const fileInputId = useId();

    const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") setIsDragging(true);
      else if (e.type === "dragleave") setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation(); setIsDragging(false);
      if (e.dataTransfer.files?.[0]) onFileChange(e.dataTransfer.files[0]);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.[0]) onFileChange(e.target.files[0]);
    };

    if (file) {
      return (
        <div className="relative p-4 border-2 border-dashed border-red-800 rounded-lg text-center bg-red-950/50">
          {file.type.startsWith('image/') ? (
            <img src={URL.createObjectURL(file)} alt="Preview" className="max-h-40 mx-auto rounded-md" />
          ) : file.type.startsWith('audio/') ? (
            <div className="flex flex-col items-center justify-center p-4">
              <Music className="w-16 h-16 text-gray-400" />
              <audio controls src={URL.createObjectURL(file)} className="w-full mt-4"></audio>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-4">
              <FileIcon className="w-16 h-16 text-gray-400" />
            </div>
          )}
          <p className="mt-2 text-sm text-yellow-100 truncate">{file.name}</p>
          <button onClick={clearFile} className="absolute top-2 right-2 p-1 bg-red-600 rounded-full hover:bg-red-700 text-white"><X size={16} /></button>
        </div>
      );
    }

    return (
      <div
        onDragEnter={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        onClick={() => document.getElementById(fileInputId)?.click()}
        className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragging ? 'border-yellow-500 bg-red-900/50' : 'border-red-800 hover:border-yellow-600 bg-red-950/50'}`}
      >
        <input type="file" id={fileInputId} accept={accept} onChange={handleFileSelect} className="hidden" />
        <UploadCloud className="mx-auto h-12 w-12 text-yellow-200" />
        <p className="mt-2 text-yellow-100"><span className="font-semibold text-yellow-400">Click to upload</span> or drag and drop</p>
        <p className="text-xs text-red-300">{label}</p>
      </div>
    );
  };


const KeyStrengthIndicator: FC<{ strength: { score: number; label: string, feedback: string[] } | null }> = ({ strength }) => {
  if (!strength || !strength.label) return null;
  const colorClass = strength.label === "Too Short" || strength.label === "Empty" ? 'bg-red-600' : strength.score < 50 ? 'bg-red-500' : strength.score < 75 ? 'bg-orange-500' : 'bg-green-500';

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2">
        <div className="w-full bg-red-950/70 rounded-full h-2.5">
          <div className={`${colorClass} h-2.5 rounded-full transition-all duration-300`} style={{ width: `${strength.score}%` }}></div>
        </div>
        <p className="text-sm font-semibold text-white w-20 text-right">
          {strength.label}
        </p>
      </div>
      {strength.feedback && strength.feedback.length > 0 && strength.label !== "Strong" && (
        <ul className="list-disc list-inside text-xs text-red-300 mt-2 space-y-1">
          {strength.feedback.map((fb, i) => <li key={i}>{fb}</li>)}
        </ul>
      )}
    </div>
  );
};


const ModeToggle: FC<{ mode: 'text' | 'file' | 'password'; setMode: (mode: 'text' | 'file' | 'password') => void }> = ({ mode, setMode }) => (
  <div className="flex items-center justify-center p-1 bg-red-950/60 rounded-lg mb-4">
    <button onClick={() => setMode('text')} className={`w-1/3 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${mode === 'text' ? 'bg-gradient-to-r from-red-600 to-yellow-500 text-white' : 'text-yellow-100 hover:bg-red-900/50'}`}>
      <Type size={16} /> Text
    </button>
    <button onClick={() => setMode('file')} className={`w-1/3 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${mode === 'file' ? 'bg-gradient-to-r from-red-600 to-yellow-500 text-white' : 'text-yellow-100 hover:bg-red-900/50'}`}>
      <FileIcon size={16} /> File
    </button>
    <button onClick={() => setMode('password')} className={`w-1/3 flex items-center justify-center gap-2 px-4 py-2 rounded-md transition-colors ${mode === 'password' ? 'bg-gradient-to-r from-red-600 to-yellow-500 text-white' : 'text-yellow-100 hover:bg-red-900/50'}`}>
      <Lock size={16} /> Password
    </button>
  </div>
);



// --- Cipher Scramble Text Component ---
const CipherScrambleText: FC<{ text: string }> = ({ text }) => {
  const [displayText, setDisplayText] = useState(text);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const randomChar = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()[]{}<>';
    return chars[Math.floor(Math.random() * chars.length)];
  };

  useEffect(() => {
    const scramble = () => {
      if (!text) return;
      const scrambled = text
        .split('')
        .map(char => (char.match(/\s/) ? ' ' : randomChar()))
        .join('');
      setDisplayText(scrambled);
    };

    intervalRef.current = setInterval(scramble, 110);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [text]);

  return <p className="text-white text-xl font-bold mt-4 font-mono">{displayText}</p>;
};

// --- Loading Overlay Component ---
const LoadingOverlay: FC<{ progress: number; operation: string }> = ({ progress, operation }) => (
  <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50 rounded-lg">
    <div className="flex flex-col items-center justify-center p-8 bg-red-950/80 rounded-xl border border-red-800 shadow-lg">
      <CipherScrambleText text={operation} />
      <p className="text-yellow-400 text-2xl font-mono mt-2">{Math.round(progress)}%</p>
    </div>
  </div>
);


// --- Main Page Component ---
export default function Home() {
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [coverMedia, setCoverMedia] = useState<File | null>(null);
  const [encodedMediaUrl, setEncodedMediaUrl] = useState<string | null>(null);
  const [encodedMediaType, setEncodedMediaType] = useState<string | null>(null);
  const [mediaCapacity, setMediaCapacity] = useState<number | null>(null);

  const [decodeMedia, setDecodeMedia] = useState<File | null>(null);
  const [decodeEntries, setDecodeEntries] = useState<{ id: string; key: string; isVisible: boolean; result?: { found: boolean; type: 'text' | 'file' | null; message: string | null; filename: string | null; data_base64: string | null } }[]>([{ id: '1', key: '', isVisible: false }]);
  const [copiedStatus, setCopiedStatus] = useState({ website: false, username: false, password: false });

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingOperation, setLoadingOperation] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'encode' | 'decode' | 'delete' | 'library' | 'send'>('encode');
  const [direction, setDirection] = useState(0);

  // Send Tab State
  const [sendRecipientList, setSendRecipientList] = useState<string[]>(['']);
  const [sendMedia, setSendMedia] = useState<File | null>(null);
  const [sendLoading, setSendLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState<{ id: number; filename: string; display_name: string; num_secrets: number; created_at: string }[]>([]);
  const [selectedLibraryItem, setSelectedLibraryItem] = useState<{ id: number; filename: string; display_name: string; num_secrets: number; created_at: string } | null>(null);
  const [lastEncodedCount, setLastEncodedCount] = useState<number>(0);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");


  // const [isDecodeKeyVisible, setIsDecodeKeyVisible] = useState<boolean>(false); // Integrated into decodeEntries
  const [isCheckKeyVisible, setIsCheckKeyVisible] = useState<boolean>(false);

  // Delete State
  const [deleteMedia, setDeleteMedia] = useState<File | null>(null);
  const [deleteKey, setDeleteKey] = useState<string>('');
  const [isDeleteKeyVisible, setIsDeleteKeyVisible] = useState<boolean>(false);
  const [deletedFileUrl, setDeletedFileUrl] = useState<{ url: string; name: string } | null>(null);

  const [checkMedia, setCheckMedia] = useState<File | null>(null);
  const [checkKey, setCheckKey] = useState<string>('');
  const [checkStatus, setCheckStatus] = useState<'idle' | 'success' | 'fail'>('idle');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationType>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

  const keyDebounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const urlDebounceTimeouts = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const addToast = (type: 'success' | 'error', message: string) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    setConfirmation({ isOpen: true, title, message, onConfirm });
  };

  const closeConfirmation = () => {
    setConfirmation({ ...confirmation, isOpen: false });
  };

  // Auth State
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [authView, setAuthView] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ first_name: string; last_name: string; email: string; profile_image: string | null; is_admin: boolean } | null>(null);

  const fetchUserProfile = async (accessToken: string) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/users/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data);
      }
    } catch (e) { console.error("Failed to fetch user profile", e); }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchUserProfile(storedToken);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch('http://127.0.0.1:8000/api/token', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        const accessToken = data.access_token;
        setToken(accessToken);
        localStorage.setItem('token', accessToken);
        addToast('success', 'Logged in successfully');
        setIsAuthModalOpen(false);
        setLoginError(null);
        fetchUserProfile(accessToken);
      } else if (response.status === 404) {
        // addToast('error', 'User not registered. Redirecting to Sign Up...'); // Optional: Remove toast if inline is enough, or keep both. Keeping toast for redirect info.
        setAuthView('register');
        setLoginError(null);
      } else if (response.status === 401) {
        setLoginError('Invalid Credentials. Please try again.');
        // addToast('error', 'Invalid Credentials. Please try again.'); // Removing toast in favor of inline
      } else {
        setLoginError('Login failed: An unexpected error occurred.');
      }
    } catch (error) {
      console.error("Login error:", error);
      addToast('error', 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, first_name: firstName, last_name: lastName })
      });

      if (response.ok) {
        const data = await response.json();
        const accessToken = data.access_token;
        setToken(accessToken);
        localStorage.setItem('token', accessToken);
        addToast('success', 'Account created successfully');
        setIsAuthModalOpen(false);
        fetchUserProfile(accessToken);
      } else {
        const errorData = await response.json();
        addToast('error', `Registration failed: ${errorData.detail || 'Error'}`);
      }
    } catch (error) {
      console.error("Registration error:", error);
      addToast('error', 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('token');
    setLibraryItems([]); // Clear library data from UI
    setCurrentUser(null);
    addToast('success', 'Logged out successfully');
  };

  const getFileType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext || '')) return 'audio';
    return 'other';
  };


  const addSecret = () => {
    setSecrets(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'text',
      key: '',
      keyStrength: null,
      isKeyVisible: false,
      isCollapsed: false,
      data: {
        message: '',
        file: null,
        website: '',
        username: '',
        password: '',
        isPasswordVisible: false,
        faviconUrl: null,
      }
    }]);
  };

  const updateSecret = (id: string, newValues: Partial<Omit<SecretEntry, 'data'>> | { data: Partial<SecretEntry['data']> }) => {
    setSecrets(prev => prev.map(secret => {
      if (secret.id === id) {
        if ('data' in newValues) {
          return { ...secret, data: { ...secret.data, ...newValues.data } };
        }
        return { ...secret, ...newValues };
      }
      return secret;
    }));
  };

  const removeSecret = (id: string) => {
    setSecrets(prev => prev.filter(secret => secret.id !== id));
  };


  const handleWebsiteUrlChange = (url: string, secretId: string) => {
    updateSecret(secretId, { data: { website: url } });
    if (urlDebounceTimeouts.current[secretId]) clearTimeout(urlDebounceTimeouts.current[secretId]);

    urlDebounceTimeouts.current[secretId] = setTimeout(() => {
      if (!url) {
        updateSecret(secretId, { data: { faviconUrl: null } });
        return;
      }
      try {
        let fullUrl = url;
        if (!/^https?:\/\//i.test(fullUrl)) { fullUrl = `https://` + fullUrl; }
        const domain = new URL(fullUrl).hostname;
        updateSecret(secretId, { data: { faviconUrl: `https://www.google.com/s2/favicons?domain=${domain}&sz=64` } });
      } catch (error) {
        updateSecret(secretId, { data: { faviconUrl: null } });
      }
    }, 500);
  };


  const handleCoverMediaChange = useCallback(async (file: File) => {
    setCoverMedia(file);
    setError(null);
    setMediaCapacity(null);
    setEncodedMediaUrl(null);
    const formData = new FormData();
    formData.append('cover_media', file);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/capacity', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail);
      if (data.capacity_bytes > 0) setMediaCapacity(data.capacity_bytes);
      else { setError(data.message || 'This media cannot be used.'); setCoverMedia(null); }
    } catch (err: any) { setError(err.message); }
  }, []);


  const handleKeyChange = (key: string, secretId: string) => {
    updateSecret(secretId, { key });
    if (keyDebounceTimeout.current) clearTimeout(keyDebounceTimeout.current);
    keyDebounceTimeout.current = setTimeout(async () => {
      if (key === '') {
        updateSecret(secretId, { keyStrength: null });
        return;
      }
      try {
        const res = await fetch('http://127.0.0.1:8000/api/key-strength', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
        if (res.ok) {
          const strength = await res.json();
          updateSecret(secretId, { keyStrength: strength });
        }
      } catch (err) { console.error("Key strength check failed:", err); }
    }, 300);
  };


  const handleCopy = (text: string, field: 'website' | 'username' | 'password') => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopiedStatus(prev => ({ ...prev, [field]: true }));
      setTimeout(() => setCopiedStatus(prev => ({ ...prev, [field]: false })), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
    document.body.removeChild(textArea);
  };

  const handleOpenWebsite = (url: string) => {
    if (!url) return;
    let fullUrl = url;
    if (!/^https?:\/\//i.test(fullUrl)) {
      fullUrl = `https://` + fullUrl;
    }
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
  };

  const generateStrongKey = (secretId: string) => {
    const length = 16;
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()[]{}<>';
    const allChars = upper + lower + numbers + symbols;

    let key = '';
    key += upper[Math.floor(Math.random() * upper.length)];
    key += lower[Math.floor(Math.random() * lower.length)];
    key += numbers[Math.floor(Math.random() * numbers.length)];
    key += symbols[Math.floor(Math.random() * symbols.length)];

    for (let i = 4; i < length; i++) {
      key += allChars[Math.floor(Math.random() * allChars.length)];
    }
    const finalKey = key.split('').sort(() => 0.5 - Math.random()).join('');
    handleKeyChange(finalKey, secretId);
  };

  const handleEncode = async () => {
    if (!coverMedia || secrets.length === 0) {
      setError('Please provide a cover media and data to hide.'); return;
    }
    for (const secret of secrets) {
      const isPasswordInvalid = secret.type === 'password' && (!secret.data.website || !secret.data.username || !secret.data.password);
      if (!secret.key || (secret.type === 'text' && !secret.data.message) || (secret.type === 'file' && !secret.data.file) || isPasswordInvalid) {
        setError(`Please fill all fields for all data files. An entry is incomplete.`); return;
      }
    }

    setLoading(true); setLoadingOperation('Encoding...'); setError(null); setEncodedMediaUrl(null); setProgress(0);
    let currentMediaBlob: Blob = coverMedia;
    try {
      for (const [index, secret] of secrets.entries()) {
        setLoadingOperation(`Encoding data ${index + 1}/${secrets.length}`);
        const formData = new FormData();
        formData.append('cover_media', currentMediaBlob);
        formData.append('key', secret.key);
        let endpoint = '';
        if (secret.type === 'text') {
          formData.append('message', secret.data.message);
          endpoint = 'http://127.0.0.1:8000/api/encode-text';
        } else if (secret.type === 'file' && secret.data.file) {
          formData.append('secret_file', secret.data.file);
          endpoint = 'http://127.0.0.1:8000/api/encode-file';
        } else if (secret.type === 'password') {
          const passwordData = { type: 'stenography-password-manager-data', website: secret.data.website, username: secret.data.username, password: secret.data.password };
          formData.append('message', JSON.stringify(passwordData, null, 2));
          endpoint = 'http://127.0.0.1:8000/api/encode-text';
        }


        const response = await fetch(endpoint, {
          method: 'POST',
          body: formData,
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!response.ok) throw new Error(`Failed at Data - ${index + 1}: ` + (await response.json()).detail);
        currentMediaBlob = await response.blob();
        setProgress(((index + 1) / secrets.length) * 100);
      }

      const mediaUrl = URL.createObjectURL(currentMediaBlob);
      const newCoverFile = new File([currentMediaBlob], coverMedia.name, { type: currentMediaBlob.type });
      setCoverMedia(newCoverFile);
      setCoverMedia(newCoverFile);
      setEncodedMediaUrl(mediaUrl);
      setEncodedMediaType(currentMediaBlob.type);
      setLastEncodedCount(secrets.length);
      setSecrets([]);
    } catch (err: any) { setError(err.message); }
    finally {
      setLoading(false);
      setLoadingOperation(null);
    }
  };


  const addDecodeEntry = () => {
    setDecodeEntries(prev => [...prev, { id: crypto.randomUUID(), key: '', isVisible: false }]);
  };

  const removeDecodeEntry = (id: string) => {
    setDecodeEntries(prev => prev.filter(e => e.id !== id));
  };

  const updateDecodeEntry = (id: string, key: string) => {
    setDecodeEntries(prev => prev.map(e => e.id === id ? { ...e, key } : e));
  };

  const toggleDecodeEntryVisibility = (id: string) => {
    setDecodeEntries(prev => prev.map(e => e.id === id ? { ...e, isVisible: !e.isVisible } : e));
  };


  const handleDecode = async () => {
    if (!decodeMedia || decodeEntries.length === 0 || decodeEntries.every(e => !e.key)) {
      setError('Please provide a media file and at least one key.'); return;
    }
    setLoading(true); setLoadingOperation('Decoding...');
    setError(null);
    // Clear previous results
    setDecodeEntries(prev => prev.map(e => ({ ...e, result: undefined })));

    // Construct keys list
    // We map only non-empty keys, but we need to track WHICH entry they belong to.
    // Actually, simpler to send all keys (even empty ones as empty string) to maintain index alignment?
    // Or filter and re-map.
    // Let's filter but keep IDs to map back.
    const activeEntries = decodeEntries.map((e, index) => ({ ...e, originalIndex: index })).filter(e => e.key);
    const keys = activeEntries.map(e => e.key);

    const formData = new FormData();
    formData.append('media', decodeMedia);
    formData.append('keys', JSON.stringify(keys));

    try {
      setProgress(40);
      const response = await fetch('http://127.0.0.1:8000/api/decode-batch', { method: 'POST', body: formData });
      setProgress(80);
      if (!response.ok) throw new Error((await response.json()).detail);

      const results = await response.json();

      // Map results back to entries
      setDecodeEntries(prev => {
        const newEntries = [...prev];
        results.forEach((result: any, i: number) => {
          const entryIndex = activeEntries[i].originalIndex;
          newEntries[entryIndex] = { ...newEntries[entryIndex], result };
        });
        return newEntries;
      });

    } catch (err: any) { setError(err.message); }
    finally {
      setProgress(100);
      setTimeout(() => { setLoading(false); setLoadingOperation(null); }, 500);
    }
  };

  const handleCheck = async () => {
    if (!checkMedia || !checkKey) {
      setError("Please provide a media file and a key to check."); return;
    }
    setLoading(true);
    setLoadingOperation('Checking...');
    setProgress(0);
    setError(null);
    setCheckStatus('idle');

    const formData = new FormData();
    formData.append('media', checkMedia);
    formData.append('key', checkKey);

    try {
      setProgress(40);
      const response = await fetch('http://127.0.0.1:8000/api/decode', { method: 'POST', body: formData });
      setProgress(90);
      setCheckStatus(response.ok ? 'success' : 'fail');
    } catch (err: any) {
      setError(err.message);
      setCheckStatus('fail');
    }
    finally {
      setProgress(100);
      setTimeout(() => {
        setLoading(false);
        setLoadingOperation(null);
      }, 500);
    }
  };

  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const handleSaveToLibrary = async () => {
    if (!token) {
      addToast('error', 'Please login to save to library');
      setAuthView('login');
      setIsAuthModalOpen(true);
      return;
    }
    if (!encodedMediaUrl) return;
    setSavingToLibrary(true);
    try {
      const response = await fetch(encodedMediaUrl);
      const blob = await response.blob();
      const file = new File([blob], getDownloadFilename(), { type: blob.type });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('num_secrets', lastEncodedCount.toString());

      const apiResponse = await fetch('http://127.0.0.1:8000/api/save-to-library', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!apiResponse.ok) throw new Error("Failed to save");
      addToast('success', "Successfully saved to library!");
    } catch (e) {
      addToast('error', "Failed to save to library.");
    } finally {
      setSavingToLibrary(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteMedia || !deleteKey) {
      setError("Please provide a media file and a key to delete."); return;
    }
    setLoading(true);
    setLoadingOperation('Deleting...');
    setProgress(0);
    setError(null);
    setDeletedFileUrl(null);

    const formData = new FormData();
    formData.append('cover_media', deleteMedia);
    formData.append('key', deleteKey);

    try {
      setProgress(50);
      const response = await fetch('http://127.0.0.1:8000/api/delete', { method: 'POST', body: formData });

      if (!response.ok) throw new Error((await response.json()).detail);

      const fileBlob = await response.blob();

      // Determine filename
      let filename = 'media_deleted';
      if (deleteMedia.name) {
        const parts = deleteMedia.name.split('.');
        const ext = parts.pop();
        filename = parts.join('.') + '_deleted.' + ext;
      }

      setDeletedFileUrl({ url: URL.createObjectURL(fileBlob), name: filename });
      setProgress(100);
    } catch (err: any) {
      setError(err.message);
    }
    finally {
      setTimeout(() => {
        setLoading(false);
        setLoadingOperation(null);
      }, 500);
    }
  };

  const handleRename = async () => {
    if (!selectedLibraryItem || !editedName.trim()) return;
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/library/${selectedLibraryItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ filename: editedName })
      });
      if (response.ok) {
        const updatedItem = await response.json();
        // Update local state
        setLibraryItems(prev => prev.map(item => item.id === selectedLibraryItem.id ? { ...item, display_name: editedName } : item));
        setSelectedLibraryItem({ ...selectedLibraryItem, display_name: editedName });
        setIsEditingName(false);
      }
    } catch (error) {
      console.error("Failed to rename:", error);
    }
  };

  const handleDeleteLibraryItem = async () => {
    if (!selectedLibraryItem) return;
    confirmAction("Delete Image", "Are you sure you want to delete this image? This cannot be undone.", async () => {
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/library/${selectedLibraryItem.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          setLibraryItems(prev => prev.filter(item => item.id !== selectedLibraryItem.id));
          setSelectedLibraryItem(null);
          addToast('success', "Item deleted successfully.");
        } else {
          addToast('error', "Failed to delete item.");
        }
      } catch (error) {
        console.error("Failed to delete item:", error);
        addToast('error', "Failed to delete item.");
      } finally {
        closeConfirmation();
      }
    });
  };




  const handleProfileImageUpload = async (file: File) => {
    if (!token) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/users/me/profile-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(prev => prev ? { ...prev, profile_image: data.profile_image } : null);
        addToast('success', 'Profile image updated successfully');
      } else {
        const errorData = await response.json();
        console.error("Upload error:", errorData);
        addToast('error', `Failed: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error uploading profile image:', error);
      addToast('error', 'Failed to upload profile image: Network error');
    }
  };

  const handleDeleteProfileImage = async () => {
    if (!token) return;
    try {
      const response = await fetch('http://127.0.0.1:8000/api/users/me/profile-image', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setCurrentUser(prev => prev ? { ...prev, profile_image: null } : null);
        addToast('success', 'Profile image removed');
      } else {
        const errorData = await response.json();
        addToast('error', `Failed: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting profile image:', error);
      addToast('error', 'Failed to delete profile image');
    }
  };

  const commonButtonStyle = "w-full px-4 py-2 font-bold text-white bg-gradient-to-r from-red-600 to-yellow-500 rounded-md hover:from-red-700 hover:to-yellow-600 disabled:from-red-800 disabled:to-red-900 disabled:bg-none transition-all disabled:cursor-not-allowed";

  const totalSecretsSize = secrets.reduce((acc, s) => acc + (s.data.file?.size || s.data.message.length || 256), 0);
  const capacityWarning = mediaCapacity && (totalSecretsSize + (secrets.length * 1024)) > mediaCapacity;

  const getDownloadFilename = () => {
    if (!coverMedia) return 'encoded_media';
    const baseName = coverMedia.name.split('.').slice(0, -1).join('.');
    const ext = encodedMediaType?.startsWith("image") ? 'png' : encodedMediaType?.startsWith("audio") ? 'wav' : 'txt';
    return `${baseName}_steg.${ext}`;
  }

  const handleSendEmail = async () => {
    if (!sendMedia) {
      addToast('error', 'Please select a file to send.');
      return;
    }

    const validRecipients = sendRecipientList.filter(email => email.trim() !== '');
    if (validRecipients.length === 0) {
      addToast('error', 'Please enter at least one recipient email.');
      return;
    }

    setSendLoading(true);
    const formData = new FormData();
    formData.append('file', sendMedia);
    formData.append('recipient_email', validRecipients.join(','));

    try {
      const response = await fetch('http://127.0.0.1:8000/api/send-email', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const data = await response.json();
      if (response.ok) {
        addToast('success', data.message);
        setSendMedia(null);
        setSendRecipientList(['']);
      } else {
        addToast('error', data.detail || 'Failed to send email.');
      }
    } catch (e) {
      addToast('error', 'Network error occurred.');
    } finally {
      setSendLoading(false);
    }
  };

  const addSendRecipient = () => {
    setSendRecipientList([...sendRecipientList, '']);
  };

  const removeSendRecipient = (index: number) => {
    if (sendRecipientList.length > 1) {
      setSendRecipientList(sendRecipientList.filter((_, i) => i !== index));
    }
  };

  const updateSendRecipient = (index: number, value: string) => {
    const newList = [...sendRecipientList];
    newList[index] = value;
    setSendRecipientList(newList);
  };


  const handleTabChange = (tab: 'encode' | 'decode' | 'delete' | 'library' | 'send') => {
    if (tab === activeTab) return;
    const tabs = ['encode', 'decode', 'delete', 'library', 'send'];
    const newIndex = tabs.indexOf(tab);
    const oldIndex = tabs.indexOf(activeTab);
    setDirection(newIndex > oldIndex ? 1 : -1);
    setActiveTab(tab);
    setError(null);

    if (tab === 'encode') {
      setSecrets([{
        id: crypto.randomUUID(), type: 'text', key: '', keyStrength: null, isKeyVisible: false, isCollapsed: false,
        data: { message: '', file: null, website: '', username: '', password: '', isPasswordVisible: false, faviconUrl: null }
      }]);
      setCoverMedia(null); setEncodedMediaUrl(null); setEncodedMediaType(null); setMediaCapacity(null);
    } else if (tab === 'decode') {
      setDecodeMedia(null); setDecodeEntries([{ id: crypto.randomUUID(), key: '', isVisible: false }]);
      setCheckMedia(null); setCheckKey(''); setCheckStatus('idle');
    } else if (tab === 'delete') {
      setDeleteMedia(null); setDeleteKey(''); setDeletedFileUrl(null);
    } else if (tab === 'library') {
      fetchLibrary(); // Fetch library data when tab is active
    } else if (tab === 'send') {
      setSendRecipientList(['']); setSendMedia(null);
    }
  };

  const handleDecodeFromLibrary = async (item: typeof libraryItems[0]) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/uploads/${item.filename}`);
      if (!response.ok) throw new Error("Failed to fetch file");
      const blob = await response.blob();
      const file = new File([blob], item.filename, { type: blob.type });

      // Switch to decode tab and set file
      handleTabChange('decode');
      setDecodeMedia(file);
      setSelectedLibraryItem(null);
      addToast('success', "Image loaded for decoding.");
    } catch (error) {
      console.error("Failed to load for decoding:", error);
      addToast('error', "Failed to load image.");
    }
  };

  const fetchLibrary = async () => {
    if (!token) return;
    try {
      const response = await fetch('http://127.0.0.1:8000/api/library', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLibraryItems(data);
      }
    } catch (error) {
      console.error("Failed to fetch library:", error);
    }
  };

  useEffect(() => {
    if (secrets.length === 0) {
      addSecret();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="fixed top-0 left-0 w-full h-full bg-gray-900 z-[-2]"></div>
      <NeuralNetworkAnimation />
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 relative z-10 font-sans">
        <div className="w-full max-w-2xl bg-black/50 backdrop-blur-sm border border-red-800/50 rounded-lg shadow-2xl shadow-red-500/10">
          <div className="p-4 sm:p-6 relative">
            <div className="absolute top-4 right-4 z-20">
              <div className="relative">
                <button
                  onClick={() => !token ? (setAuthView('login'), setIsAuthModalOpen(true), setLoginError(null)) : setIsProfileMenuOpen(!isProfileMenuOpen)}
                  className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors cursor-pointer overflow-hidden ${token ? 'bg-yellow-600 border-yellow-400 text-white' : 'bg-red-900/50 border-red-700 text-red-300 hover:text-white hover:border-red-500'}`}
                  title={token ? "Profile Menu" : "Login / Sign Up"}
                >
                  {token && currentUser?.profile_image ? (
                    <img src={`http://127.0.0.1:8000/api/uploads/${currentUser.profile_image.replace('uploads/', '')}`} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User size={20} />
                  )}
                </button>

                <AnimatePresence>
                  {isProfileMenuOpen && token && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full right-0 mt-2 w-72 bg-black/90 backdrop-blur border border-red-800 rounded-md shadow-xl overflow-hidden"
                    >
                      {currentUser && (
                        <div className="px-6 py-4 border-b border-red-800/50 bg-red-950/30">
                          <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3">User Profile</p>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-yellow-500 bg-black/50 group">
                              {currentUser.profile_image ? (
                                <img src={`http://127.0.0.1:8000/api/uploads/${currentUser.profile_image.replace('uploads/', '')}`} alt="Profile" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-yellow-500"><User size={32} /></div>
                              )}
                              <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                                <Edit2 size={16} className="text-white" />
                                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleProfileImageUpload(e.target.files[0])} className="hidden" />
                              </label>
                              {currentUser.profile_image && (
                                <button
                                  onClick={(e) => { e.preventDefault(); handleDeleteProfileImage(); }}
                                  className="absolute top-0 right-0 p-1 bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-red-700 rounded-bl-md"
                                  title="Remove Profile Picture"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-bold text-lg truncate">{currentUser.first_name} {currentUser.last_name}</p>
                              <p className="text-sm text-red-300 truncate">{currentUser.email}</p>
                              {currentUser.is_admin && <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-600 text-black text-[10px] font-bold rounded">ADMIN</span>}
                            </div>
                          </div>
                          {currentUser.is_admin && (
                            <a href="/admin" className="w-full mb-3 px-3 py-2 bg-red-900/50 hover:bg-yellow-600/20 border border-red-700 hover:border-yellow-500 text-yellow-200 rounded flex items-center justify-center gap-2 transition-all">
                              <Shield size={16} /> Admin Dashboard
                            </a>
                          )}
                        </div>
                      )}
                      <a href="/inbox" className="w-full text-left px-4 py-3 hover:bg-red-900/50 text-red-200 hover:text-white flex items-center gap-2 transition-colors border-b border-red-800/30">
                        <Inbox size={16} /> Inbox
                      </a>
                      <button onClick={() => { handleLogout(); setIsProfileMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-red-900/50 text-red-200 hover:text-white flex items-center gap-2 transition-colors">
                        <LogOut size={16} /> Logout
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <h1 className="text-4xl font-bold text-center mb-2 text-white bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-yellow-400">Steganography Encoder</h1>
            <p className="text-center text-red-200 mb-8">Hide your data in a single file.</p>
            <div className="flex border-b border-red-800 mb-6">
              <button onClick={() => handleTabChange('encode')} className={`px-4 py-2 -mb-px font-semibold transition-colors cursor-pointer ${activeTab === 'encode' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-red-300 hover:text-yellow-200'}`}>Encode</button>
              <button onClick={() => handleTabChange('decode')} className={`px-4 py-2 -mb-px font-semibold transition-colors cursor-pointer ${activeTab === 'decode' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-red-300 hover:text-yellow-200'}`}>Decode</button>
              <button onClick={() => handleTabChange('delete')} className={`px-4 py-2 -mb-px font-semibold transition-colors cursor-pointer ${activeTab === 'delete' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-red-300 hover:text-yellow-200'}`}>Delete</button>
              <button onClick={() => handleTabChange('library')} className={`px-4 py-2 -mb-px font-semibold transition-colors cursor-pointer ${activeTab === 'library' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-red-300 hover:text-yellow-200'}`}>Library</button>
              <button onClick={() => handleTabChange('send')} className={`px-4 py-2 -mb-px font-semibold transition-colors cursor-pointer ${activeTab === 'send' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-red-300 hover:text-yellow-200'}`}>Send</button>
            </div>

            <div className="p-4 sm:p-6 bg-red-950/70 rounded-lg shadow-lg relative overflow-hidden">
              {loading && loadingOperation && <LoadingOverlay progress={progress} operation={loadingOperation} />}
              <AnimatePresence mode="wait" custom={direction}>
                {activeTab === 'send' ? (
                  <motion.div
                    key="send"
                    custom={direction}
                    variants={{
                      enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 })
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <h2 className="text-2xl font-semibold mb-2 text-white">Secure Send</h2>
                    <p className="text-gray-300 mb-4">Send encrypted files directly to other users.</p>

                    {!token ? (
                      <div className="p-8 border border-red-800/50 rounded-lg bg-red-950/30 text-center">
                        <Lock size={48} className="mx-auto text-red-500 mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Authentication Required</h3>
                        <p className="text-red-300 mb-4">You must be logged in to send secure files.</p>
                        <button onClick={() => { setIsAuthModalOpen(true); setAuthView('login'); }} className="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-lg transition-colors">
                          Login Now
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <label className="block font-medium text-white mb-2">1. Recipients</label>
                          <div className="space-y-3">
                            {sendRecipientList.map((email, index) => (
                              <div key={index} className="flex gap-2">
                                <div className="relative flex-1">
                                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                  <input
                                    type="email"
                                    placeholder="recipient@example.com"
                                    value={email}
                                    onChange={(e) => updateSendRecipient(index, e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-red-950/70 border border-red-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white placeholder:text-gray-500"
                                  />
                                </div>
                                {sendRecipientList.length > 1 && (
                                  <button
                                    onClick={() => removeSendRecipient(index)}
                                    className="p-3 bg-red-950/50 hover:bg-red-900 border border-red-800 rounded-lg text-red-400 hover:text-red-200 transition-colors"
                                  >
                                    <Trash2 size={20} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={addSendRecipient}
                            className="mt-3 flex items-center gap-2 text-yellow-500 hover:text-yellow-400 text-sm font-medium transition-colors"
                          >
                            <PlusCircle size={16} /> Add Another Recipient
                          </button>
                        </div>

                        <div>
                          <label className="block font-medium text-white mb-2">2. Select File to Send</label>
                          <MediaDropzone
                            onFileChange={setSendMedia}
                            file={sendMedia}
                            clearFile={() => setSendMedia(null)}
                            label="Upload encrypted image or any file"
                            accept="*"
                          />
                        </div>

                        <button
                          onClick={handleSendEmail}
                          disabled={sendLoading || !sendMedia || !sendRecipientList.some(e => e.trim() !== '')}
                          className={`w-full py-3 rounded-lg font-bold text-lg flex items-center justify-center gap-2 transition-all ${sendLoading || !sendMedia || !sendRecipientList.some(e => e.trim() !== '') ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-700 hover:to-emerald-600 text-white shadow-lg shadow-green-900/20'}`}
                        >
                          {sendLoading ? (
                            <>
                              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                              Sending Securely...
                            </>
                          ) : (
                            <>
                              <Send size={20} /> Send File
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </motion.div>
                ) : activeTab === 'encode' ? (
                  <motion.div
                    key="encode"
                    custom={direction}
                    variants={{
                      enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 })
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <h2 className="text-2xl font-semibold mb-2 text-white">Encode Data</h2>
                    <label className="block font-medium text-white">1. Choose Cover Media</label>
                    <MediaDropzone onFileChange={handleCoverMediaChange} file={coverMedia} clearFile={() => { setCoverMedia(null); setMediaCapacity(null); setEncodedMediaUrl(null); }} label="Image, Audio (WAV, MP3), or Text file" accept="image/*,audio/*,text/plain" />
                    {mediaCapacity && <p className="text-sm text-center text-gray-400">Est. total capacity: <span className="font-bold text-yellow-400">{formatBytes(mediaCapacity)}</span></p>}

                    <div className="border-t border-red-800/70 pt-4">
                      <label className="block font-medium text-white mb-2">2. Add Data</label>
                      <div className="space-y-6">
                        {secrets.map((secret, index) => (
                          <div key={secret.id} className="p-4 bg-red-950/40 rounded-lg border border-red-800/50 relative">
                            <div className="absolute top-2 right-2 flex gap-1">
                              <button onClick={() => updateSecret(secret.id, { isCollapsed: !secret.isCollapsed })} className="p-1 text-red-300 hover:text-white hover:bg-red-700/50 rounded-full transition-colors">
                                {secret.isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                              </button>
                              <button onClick={() => removeSecret(secret.id)} className="p-1 text-red-300 hover:text-white hover:bg-red-700 rounded-full transition-colors"><Trash2 size={16} /></button>
                            </div>
                            <p className="font-bold text-yellow-200 mb-2">Data - {index + 1}</p>

                            {!secret.isCollapsed && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ModeToggle mode={secret.type} setMode={(type) => updateSecret(secret.id, { type })} />
                                {secret.type === 'text' ? (
                                  <textarea value={secret.data.message} onChange={(e) => updateSecret(secret.id, { data: { message: e.target.value } })} placeholder="Your Message" rows={3} className="w-full px-3 py-2 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y placeholder:text-red-300 text-white"></textarea>
                                ) : secret.type === 'file' ? (
                                  <>
                                    <MediaDropzone onFileChange={(file) => updateSecret(secret.id, { data: { file } })} file={secret.data.file} clearFile={() => updateSecret(secret.id, { data: { file: null } })} accept="*" label="Any file type" />
                                    {secret.data.file && <p className="text-sm text-center text-gray-400">File size: <span className={"font-bold text-yellow-400"}>{formatBytes(secret.data.file.size)}</span></p>}
                                  </>
                                ) : (
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-sm font-medium text-yellow-100 mb-1">Website URL</label>
                                      <div className="relative flex items-center">
                                        {secret.data.faviconUrl && <img src={secret.data.faviconUrl} alt="favicon" className="absolute left-3 w-5 h-5 pointer-events-none" onError={() => updateSecret(secret.id, { data: { faviconUrl: null } })} />}
                                        <input type="text" value={secret.data.website} onChange={(e) => handleWebsiteUrlChange(e.target.value, secret.id)} placeholder="https://example.com" className={`w-full py-2 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white transition-all ${secret.data.faviconUrl ? 'pl-10 pr-3' : 'px-3'}`} />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-yellow-100 mb-1">Username</label>
                                      <input type="text" value={secret.data.username} onChange={(e) => updateSecret(secret.id, { data: { username: e.target.value } })} placeholder="user@example.com" className="w-full px-3 py-2 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" />
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium text-yellow-100 mb-1">Password</label>
                                      <div className="relative">
                                        <input type={secret.data.isPasswordVisible ? "text" : "password"} value={secret.data.password} onChange={(e) => updateSecret(secret.id, { data: { password: e.target.value } })} placeholder="Enter password" className="w-full px-3 py-2 pr-10 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" />
                                        <button type="button" onClick={() => updateSecret(secret.id, { data: { isPasswordVisible: !secret.data.isPasswordVisible } })} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-yellow-400">{secret.data.isPasswordVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <label className="block font-medium mt-4 text-white mb-2">Enter Key</label>
                                <div className="flex items-center gap-2">
                                  <div className="relative w-full">
                                    <input type={secret.isKeyVisible ? "text" : "password"} value={secret.key} onChange={(e) => handleKeyChange(e.target.value, secret.id)} placeholder="Enter key" className="w-full px-3 py-2 pr-10 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" />
                                    <button type="button" onClick={() => updateSecret(secret.id, { isKeyVisible: !secret.isKeyVisible })} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-yellow-400">{secret.isKeyVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
                                  </div>
                                  <button type="button" onClick={() => generateStrongKey(secret.id)} className="p-2 text-gray-400 hover:text-yellow-400 bg-red-950/70 border border-red-800 rounded-md flex-shrink-0" title="Generate Strong Key"><KeyRound size={18} /></button>
                                </div>
                                <KeyStrengthIndicator strength={secret.keyStrength} />
                              </motion.div>
                            )}
                          </div>
                        ))}
                      </div>
                      {mediaCapacity && (
                        <div className="mt-4 px-1">
                          <CapacityBar used={totalSecretsSize} total={mediaCapacity} />
                        </div>
                      )}
                      <button onClick={addSecret} className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 font-semibold text-yellow-200 border-2 border-dashed border-red-800 rounded-md hover:border-yellow-600 hover:text-yellow-100 transition-colors">
                        <PlusCircle size={18} /> Add Data
                      </button>
                    </div>

                    {capacityWarning && <p className="text-sm text-center font-bold text-red-500 mt-4">Warning: Total size of data files may be too large for the cover media.</p>}

                    <button onClick={handleEncode} disabled={!!(loading || capacityWarning)} className={`${commonButtonStyle} mt-4`}>
                      {loading ? 'Processing...' : 'Encode Data'}
                    </button>

                    {encodedMediaUrl && (
                      <div className="mt-4 p-4 bg-yellow-900/50 border border-yellow-700 rounded-md text-center">
                        <h3 className="font-bold text-lg mb-2 text-white">Encoding Complete</h3>
                        <div className="my-4">
                          {encodedMediaType?.startsWith('image/') ? (
                            <img src={encodedMediaUrl} alt="Encoded Media Preview" className="max-h-40 mx-auto rounded-md" />
                          ) : encodedMediaType?.startsWith('audio/') ? (
                            <div className="flex flex-col items-center justify-center p-4">
                              <Music className="w-16 h-16 text-yellow-100" />
                              <audio controls src={encodedMediaUrl} className="w-full mt-4"></audio>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center p-4">
                              <FileIcon className="w-16 h-16 text-yellow-100" />
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 justify-center">
                          <a href={encodedMediaUrl} download={getDownloadFilename()} className="inline-block px-6 py-2 font-bold text-black bg-gradient-to-r from-yellow-400 to-orange-400 rounded-md hover:from-yellow-500 hover:to-orange-500 transition-all">Download Media</a>
                          <button onClick={handleSaveToLibrary} disabled={savingToLibrary} className="px-6 py-2 font-bold text-white bg-red-800 border border-red-600 rounded-md hover:bg-red-700 flex items-center gap-2">
                            <Save size={18} /> {savingToLibrary ? 'Saving...' : 'Save to Library'}
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ) : activeTab === 'decode' ? (
                  <motion.div
                    key="decode"
                    custom={direction}
                    variants={{
                      enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 })
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <h2 className="text-2xl font-semibold text-white">Decode Data</h2>

                    <div className="p-4 bg-red-950/40 rounded-lg space-y-3">
                      <h3 className="text-lg font-semibold text-yellow-100">Quick Check</h3>
                      <p className="text-sm text-red-300 -mt-2">Check if a file contains hidden data for a specific key.</p>
                      <label className="block font-medium text-white mb-2">1. Upload Media to Check</label>
                      <MediaDropzone onFileChange={setCheckMedia} file={checkMedia} clearFile={() => { setCheckMedia(null); setCheckStatus('idle'); }} label="Image, Audio, or Text file" accept="image/*,audio/*,text/plain" />
                      <label className="block font-medium mt-4 text-white mb-2">2. Enter Key</label>
                      <div className="relative w-full">
                        <input type={isCheckKeyVisible ? "text" : "password"} value={checkKey} onChange={(e) => setCheckKey(e.target.value)} placeholder="Enter Key" className="w-full px-3 py-2 pr-10 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" />
                        <button type="button" onClick={() => setIsCheckKeyVisible(!isCheckKeyVisible)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-yellow-400">{isCheckKeyVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
                      </div>
                      <button onClick={handleCheck} disabled={loading} className="w-full px-4 py-2 font-bold text-white bg-gradient-to-r from-red-700 to-yellow-600 rounded-md hover:from-red-800 hover:to-yellow-700 disabled:opacity-50 transition-all">
                        {loading && loadingOperation === 'Checking...' ? 'Checking...' : 'Check for Content'}
                      </button>
                      {checkStatus === 'success' && (<div className="mt-2 p-3 bg-green-900/50 border border-green-700 rounded-md text-green-200 text-center flex items-center justify-center gap-2"><CheckCircle size={18} /> <p>Data was found for this key.</p></div>)}
                      {checkStatus === 'fail' && (<div className="mt-2 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-200 text-center flex items-center justify-center gap-2"><XCircle size={18} /> <p>No data found for this key.</p></div>)}
                    </div>

                    <div className="border-t border-red-800/50 my-4 pt-4">
                      <h3 className="text-lg font-semibold text-yellow-100 mb-3">Batch Decode</h3>
                      <p className="text-sm text-red-300 -mt-2 mb-4">Decode multiple secrets from one file by providing all keys.</p>
                      <label className="block font-medium text-white mb-2">1. Upload Media to Decode</label>
                      <MediaDropzone onFileChange={setDecodeMedia} file={decodeMedia} clearFile={() => { setDecodeMedia(null); setDecodeEntries(prev => prev.map(e => ({ ...e, result: undefined }))); }} label="Image, Audio, or Text file" accept="image/*,audio/*,text/plain" />

                      <label className="block font-medium mt-4 text-white mb-2">2. Enter Keys</label>
                      <div className="space-y-4">
                        {decodeEntries.map((entry, index) => (
                          <div key={entry.id} className="p-4 bg-red-950/40 rounded-lg border border-red-800/50 relative">
                            {decodeEntries.length > 1 && (
                              <button onClick={() => removeDecodeEntry(entry.id)} className="absolute top-2 right-2 p-1 text-red-300 hover:text-white hover:bg-red-700 rounded-full"><Trash2 size={16} /></button>
                            )}
                            <label className="block text-sm font-bold text-yellow-200 mb-1">Key - {index + 1}</label>
                            <div className="relative w-full">
                              <input type={entry.isVisible ? "text" : "password"} value={entry.key} onChange={(e) => updateDecodeEntry(entry.id, e.target.value)} placeholder={`Enter Key - ${index + 1}`} className="w-full px-3 py-2 pr-10 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" />
                              <button type="button" onClick={() => toggleDecodeEntryVisibility(entry.id)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-yellow-400">{entry.isVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
                            </div>

                            {entry.result && (
                              <div className={`mt-3 p-3 rounded-md border ${entry.result.found ? 'bg-green-900/30 border-green-800' : 'bg-red-900/30 border-red-800'}`}>
                                {entry.result.found ? (
                                  <div>
                                    {entry.result.type === 'text' ? (
                                      (() => {
                                        try {
                                          const parsed = JSON.parse(entry.result.message || '{}');
                                          if (parsed && parsed.type === 'stenography-password-manager-data') {
                                            return (
                                              <div className="space-y-2 font-mono bg-black/50 p-3 rounded text-sm mt-2">
                                                <div className="flex items-center justify-between gap-2 mb-2 border-b border-red-800/30 pb-2">
                                                  <span className="text-yellow-100 font-bold text-xs uppercase">Credentials Found</span>
                                                  <button onClick={() => handleOpenWebsite(parsed.website)} className="px-2 py-0.5 text-xs font-bold text-black bg-yellow-400 rounded hover:bg-yellow-500">OPEN</button>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                  <p className="text-white text-xs truncate"><span className="text-red-300 w-16 inline-block font-semibold">Website:</span> {parsed.website}</p>
                                                  <button onClick={() => handleCopy(parsed.website, 'website')} className="text-yellow-200 hover:text-white" title="Copy Website"><ClipboardCopy size={14} /></button>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                  <p className="text-white text-xs truncate"><span className="text-red-300 w-16 inline-block font-semibold">User:</span> {parsed.username}</p>
                                                  <button onClick={() => handleCopy(parsed.username, 'username')} className="text-yellow-200 hover:text-white" title="Copy Username"><ClipboardCopy size={14} /></button>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                  <p className="text-white text-xs truncate"><span className="text-red-300 w-16 inline-block font-semibold">Pass:</span> {parsed.password}</p>
                                                  <button onClick={() => handleCopy(parsed.password, 'password')} className="text-yellow-200 hover:text-white" title="Copy Password"><ClipboardCopy size={14} /></button>
                                                </div>
                                              </div>
                                            );
                                          }
                                        } catch (e) { }
                                        return <p className="font-mono bg-black/50 p-2 rounded text-white whitespace-pre-wrap">{entry.result.message}</p>;
                                      })()
                                    ) : (
                                      <div className="text-center">
                                        <p className="text-sm text-green-200 mb-2">File found: {entry.result.filename}</p>
                                        <a href={`data:application/octet-stream;base64,${entry.result.data_base64}`} download={entry.result.filename} className="inline-block px-4 py-1 text-sm font-bold text-black bg-green-500 rounded-md hover:bg-green-400">Download File</a>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-sm text-red-300 italic">No content found.</p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        <button onClick={addDecodeEntry} className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 font-semibold text-yellow-200 border-2 border-dashed border-red-800 rounded-md hover:border-yellow-600 hover:text-yellow-100 transition-colors">
                          <PlusCircle size={18} /> Add Another Key
                        </button>
                      </div>

                    </div>
                    <button onClick={handleDecode} disabled={loading} className={`${commonButtonStyle} mt-4`}>{loading ? 'Processing...' : 'Decode All'}</button>
                  </motion.div>
                ) : activeTab === 'delete' ? (
                  <motion.div
                    key="delete"
                    custom={direction}
                    variants={{
                      enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 })
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <h2 className="text-2xl font-semibold text-white">Delete Data</h2>
                    <p className="text-red-300">Permanently delete data associated with a specific key from the media file.</p>

                    <label className="block font-medium text-white mb-2">1. Upload Media</label>
                    <MediaDropzone onFileChange={setDeleteMedia} file={deleteMedia} clearFile={() => { setDeleteMedia(null); setDeletedFileUrl(null); }} label="Image, Audio, or Text file" accept="image/*,audio/*,text/plain" />

                    <label className="block font-medium mt-4 text-white mb-2">2. Enter Key</label>
                    <div className="relative w-full">
                      <input type={isDeleteKeyVisible ? "text" : "password"} value={deleteKey} onChange={(e) => setDeleteKey(e.target.value)} placeholder="Enter Key" className="w-full px-3 py-2 pr-10 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" />
                      <button type="button" onClick={() => setIsDeleteKeyVisible(!isDeleteKeyVisible)} className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-yellow-400">{isDeleteKeyVisible ? <Eye size={18} /> : <EyeOff size={18} />}</button>
                    </div>

                    <button onClick={handleDelete} disabled={loading} className={`${commonButtonStyle} bg-red-700 hover:bg-red-800`}>
                      {loading ? 'Processing...' : 'Delete Data'}
                    </button>

                    {deletedFileUrl && (
                      <div className="mt-4 p-4 bg-yellow-900/50 border border-yellow-700 rounded-md text-center">
                        <h3 className="font-bold text-lg mb-2 text-white">Deletion Complete!</h3>
                        <p className="mb-4 text-sm text-yellow-100">The data associated with the key has been securely erased.</p>
                        <a href={deletedFileUrl.url} download={deletedFileUrl.name} className="inline-block px-6 py-2 font-bold text-black bg-gradient-to-r from-yellow-400 to-orange-400 rounded-md hover:from-yellow-500 hover:to-orange-500 transition-all">Download Cleaned File</a>
                      </div>
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="library"
                    custom={direction}
                    variants={{
                      enter: (direction: number) => ({ x: direction > 0 ? 50 : -50, opacity: 0 }),
                      center: { x: 0, opacity: 1 },
                      exit: (direction: number) => ({ x: direction < 0 ? 50 : -50, opacity: 0 })
                    }}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <h2 className="text-2xl font-semibold text-white">Library</h2>
                    <p className="text-red-300">Access your saved encoded images.</p>

                    {!token ? (
                      <div className="text-center p-8 bg-black/30 rounded-lg border border-red-900/30">
                        <Lock className="mx-auto h-12 w-12 text-red-800/50 mb-3" />
                        <p className="text-red-400 mb-4">Please login to view your private library.</p>
                        <button onClick={() => { setAuthView('login'); setIsAuthModalOpen(true); }} className="px-4 py-2 font-bold text-white bg-red-800 rounded hover:bg-red-700 transition-colors">
                          Login / Sign Up
                        </button>
                      </div>
                    ) : libraryItems.length === 0 ? (
                      <div className="text-center p-8 bg-black/30 rounded-lg border border-red-900/30">
                        <Library className="mx-auto h-12 w-12 text-red-800/50 mb-3" />
                        <p className="text-red-400">Library is empty.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {libraryItems.map((item) => (
                          <div key={item.id} onClick={() => setSelectedLibraryItem(item)} className="bg-red-950/40 border border-red-800/50 rounded-lg p-3 hover:border-yellow-500/50 transition-colors group cursor-pointer relative">
                            <div className="aspect-square bg-black/50 rounded mb-2 overflow-hidden relative flex items-center justify-center">
                              {getFileType(item.filename) === 'image' ? (
                                <img src={`http://127.0.0.1:8000/api/uploads/${item.filename}`} alt={item.filename} className="w-full h-full object-cover" />
                              ) : getFileType(item.filename) === 'audio' ? (
                                <Music className="w-12 h-12 text-yellow-500" />
                              ) : (
                                <FileIcon className="w-12 h-12 text-gray-400" />
                              )}
                              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                <Info className="text-white opacity-0 group-hover:opacity-100 transition-opacity" size={24} />
                              </div>
                            </div>
                            <p className="text-xs text-yellow-100 truncate font-mono" title={item.display_name || item.filename}>{item.display_name || item.filename}</p>
                            <p className="text-[10px] text-red-400 mt-1">{new Date(item.created_at).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Image Details Modal */}
                    {selectedLibraryItem && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedLibraryItem(null)}>
                        <div className="bg-red-950 border border-red-700 rounded-lg max-w-lg w-full p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                          <div className="absolute top-2 right-2 flex gap-2">
                            <button onClick={handleDeleteLibraryItem} className="text-red-400 hover:text-red-500 transition-colors" title="Delete Image"><Trash2 size={24} /></button>
                            <button onClick={() => setSelectedLibraryItem(null)} className="text-red-400 hover:text-white"><X size={24} /></button>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-4">
                            {getFileType(selectedLibraryItem.filename) === 'image' ? 'Image Details' :
                              getFileType(selectedLibraryItem.filename) === 'audio' ? 'Audio Details' : 'File Details'}
                          </h3>

                          <div className="flex gap-4">
                            <div className="w-1/3 flex items-center justify-center bg-black/30 rounded border border-red-800 aspect-square">
                              {getFileType(selectedLibraryItem.filename) === 'image' ? (
                                <img src={`http://127.0.0.1:8000/api/uploads/${selectedLibraryItem.filename}`} className="rounded w-full h-full object-cover" />
                              ) : getFileType(selectedLibraryItem.filename) === 'audio' ? (
                                <Music className="w-24 h-24 text-yellow-500" />
                              ) : (
                                <FileIcon className="w-24 h-24 text-gray-400" />
                              )}
                            </div>
                            <div className="w-2/3 space-y-3">
                              <div>
                                <label className="text-xs font-bold text-red-400 uppercase">Filename</label>
                                <div className="flex items-center gap-2">
                                  {isEditingName ? (
                                    <>
                                      <input
                                        type="text"
                                        value={editedName}
                                        onChange={(e) => setEditedName(e.target.value)}
                                        className="bg-black/50 text-white border border-red-700 rounded px-2 py-1 text-sm font-mono w-full focus:outline-none focus:border-yellow-500"
                                        autoFocus
                                      />
                                      <button onClick={handleRename} className="p-1 text-green-400 hover:text-green-300"><Check size={18} /></button>
                                      <button onClick={() => setIsEditingName(false)} className="p-1 text-red-400 hover:text-red-300"><X size={18} /></button>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-white font-mono text-sm break-all">{selectedLibraryItem.display_name || selectedLibraryItem.filename}</p>
                                      <button onClick={() => { setIsEditingName(true); setEditedName(selectedLibraryItem.display_name || selectedLibraryItem.filename); }} className="p-1 text-gray-400 hover:text-white transition-colors"><Edit2 size={16} /></button>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-red-400 uppercase">Date Saved</label>
                                <p className="text-white text-sm">{new Date(selectedLibraryItem.created_at).toLocaleString()}</p>
                              </div>
                              <div>
                                <label className="text-xs font-bold text-red-400 uppercase">Secrets Encoded</label>
                                <p className="text-yellow-400 font-bold text-lg">{selectedLibraryItem.num_secrets} <span className="text-xs font-normal text-yellow-200/70">items hidden</span></p>
                              </div>
                              <div className="pt-4 flex flex-col gap-3">
                                <a href={`http://127.0.0.1:8000/api/uploads/${selectedLibraryItem.filename}`} download={selectedLibraryItem.display_name || selectedLibraryItem.filename} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-yellow-500 text-black font-bold rounded hover:bg-yellow-400 transition-colors w-full">
                                  <Save size={18} /> Download {getFileType(selectedLibraryItem.filename) === 'image' ? 'Image' : 'File'}
                                </a>
                                <button onClick={() => handleDecodeFromLibrary(selectedLibraryItem)} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-red-800 text-white font-bold rounded hover:bg-red-700 transition-colors border border-red-600 w-full">
                                  <Unlock size={18} /> Decode
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  </motion.div>
                )}
              </AnimatePresence>

              {error && (<div className="mt-4 p-3 bg-red-900/50 border border-red-700 rounded-md text-red-300"><p><span className="font-bold">Error:</span> {error}</p></div>)}
            </div>
          </div>
        </div>
      </main >

      {/* Toasts Container */}
      < div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" >
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`pointer-events-auto px-4 py-3 rounded shadow-lg border flex items-center gap-2 ${toast.type === 'success' ? 'bg-green-900/80 border-green-700 text-green-100' : 'bg-red-900/80 border-red-700 text-red-100'}`}
            >
              {toast.type === 'success' ? <CheckCircle size={18} /> : <XCircle size={18} />}
              <span className="text-sm font-medium">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div >

      {/* Confirmation Modal */}
      {
        confirmation.isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-red-950 border border-red-700 rounded-lg max-w-sm w-full p-6 shadow-2xl relative">
              <h3 className="text-lg font-bold text-white mb-2">{confirmation.title}</h3>
              <p className="text-red-200 mb-6">{confirmation.message}</p>
              <div className="flex justify-end gap-3">
                <button onClick={closeConfirmation} className="px-4 py-2 text-red-300 hover:text-white transition-colors">Cancel</button>
                <button onClick={() => { confirmation.onConfirm(); closeConfirmation(); }} className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-600 transition-colors">Confirm</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Auth Modal */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setIsAuthModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-red-950 border border-red-700 rounded-lg max-w-md w-full p-8 shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => setIsAuthModalOpen(false)} className="absolute top-4 right-4 text-red-400 hover:text-white cursor-pointer"><X size={24} /></button>
              <h1 className="text-3xl font-bold text-center mb-2 text-white bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-yellow-400">Steganography</h1>
              <p className="text-center text-red-200 mb-8">Secure your secrets.</p>

              {loginError && (
                <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-md flex items-center gap-2 text-red-100 text-sm">
                  <AlertTriangle size={16} />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={authView === 'login' ? handleLogin : handleRegister} className="space-y-4">
                {authView === 'register' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-yellow-100 mb-1">First Name</label>
                      <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full px-3 py-2 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" placeholder="John" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-yellow-100 mb-1">Last Name</label>
                      <input type="text" required value={lastName} onChange={e => setLastName(e.target.value)} className="w-full px-3 py-2 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" placeholder="Doe" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-yellow-100 mb-1">Email</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" placeholder="you@example.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-yellow-100 mb-1">Password</label>
                  <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full px-3 py-2 bg-red-950/70 border border-red-800 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500 placeholder:text-red-300 text-white" placeholder="••••••••" />
                </div>
                <button type="submit" disabled={loading} className={`${commonButtonStyle} w-full cursor-pointer`}>
                  {loading ? 'Please wait...' : authView === 'login' ? 'Login' : 'Create Account'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <p className="text-sm text-red-300">
                  {authView === 'login' ? "Don't have an account? " : "Already have an account? "}
                  <button onClick={() => { setAuthView(authView === 'login' ? 'register' : 'login'); setLoginError(null); }} className="text-yellow-400 font-bold hover:underline cursor-pointer">
                    {authView === 'login' ? 'Sign Up' : 'Login'}
                  </button>
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Admin Dashboard Modal */}


    </>
  );
};
