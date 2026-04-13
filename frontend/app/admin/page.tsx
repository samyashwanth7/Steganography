"use client";

import { useState, useEffect } from 'react';
import { Shield, Users, Activity, ArrowLeft, User, Search, UploadCloud, FileText, Calendar, Lock, Music, FileIcon, X } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralNetworkAnimation from '../components/NeuralNetworkAnimation';

export default function AdminPage() {
    const [activeTab, setActiveTab] = useState<'users' | 'track'>('users');
    const [users, setUsers] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track Tab State
    const [trackFile, setTrackFile] = useState<File | null>(null);
    const [trackFilePreview, setTrackFilePreview] = useState<string | null>(null);
    const [trackResult, setTrackResult] = useState<any | null>(null);
    const [trackLoading, setTrackLoading] = useState(false);
    const [trackError, setTrackError] = useState<string | null>(null);

    // Animation State
    const [direction, setDirection] = useState(0);

    const handleTabChange = (tab: 'users' | 'track') => {
        if (tab === activeTab) return;
        setDirection(tab === 'track' ? 1 : -1);
        setActiveTab(tab);
    };

    const handleTrackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setTrackFile(file);
            setTrackFilePreview(URL.createObjectURL(file));
            setTrackResult(null);
            setTrackError(null);
        }
    };

    const handleAnalyze = async () => {
        if (!trackFile) return;

        setTrackLoading(true);
        setTrackError(null);
        setTrackResult(null);

        const formData = new FormData();
        formData.append('file', trackFile);

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://127.0.0.1:8000/api/admin/detect', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await response.json();
            if (response.ok) {
                setTrackResult(data);
            } else {
                setTrackError(data.detail || "Analysis failed");
            }
        } catch (err) {
            setTrackError("Failed to connect to server");
        } finally {
            setTrackLoading(false);
        }
    };

    useEffect(() => {
        const fetchUsers = async () => {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = '/';
                return;
            }

            try {
                const response = await fetch('http://127.0.0.1:8000/api/admin/users', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    setUsers(data);
                } else {
                    setError("Access Denied");
                }
            } catch (err) {
                setError("Failed to fetch data");
            } finally {
                setLoading(false);
            }
        };

        fetchUsers();
    }, []);

    const filteredUsers = users.filter(user =>
        (user.first_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (user.last_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
    );

    return (
        <>
            <div className="fixed top-0 left-0 w-full h-full bg-gray-900 z-[-2]"></div>
            <NeuralNetworkAnimation />
            <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 relative z-10 font-sans text-red-100">

                {/* Header Section */}
                <div className="w-full max-w-4xl relative z-20 mb-6 flex justify-between items-center">
                    <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-red-950/50 border border-red-800/50 rounded-lg text-red-300 hover:text-white hover:border-red-500 transition-all">
                        <ArrowLeft size={18} /> Back
                    </Link>
                </div>

                <div className="w-full max-w-4xl bg-black/50 backdrop-blur-sm border border-red-800/50 rounded-lg shadow-2xl shadow-red-500/10">
                    <div className="p-4 sm:p-6 relative">

                        <div className="mb-6 text-center">
                            <h1 className="text-3xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-yellow-400 inline-flex items-center gap-2 justify-center">
                                <Shield className="text-yellow-500" size={32} /> Admin Dashboard
                            </h1>
                            <p className="text-red-200 mt-2">Manage users and system status</p>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-red-800 mb-6">
                            <button
                                onClick={() => handleTabChange('users')}
                                className={`px-4 py-2 -mb-px font-semibold transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'users' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-red-300 hover:text-yellow-200'}`}
                            >
                                <Users size={18} /> Users
                            </button>
                            <button
                                onClick={() => handleTabChange('track')}
                                className={`px-4 py-2 -mb-px font-semibold transition-colors cursor-pointer flex items-center gap-2 ${activeTab === 'track' ? 'border-b-2 border-yellow-500 text-yellow-400' : 'text-red-300 hover:text-yellow-200'}`}
                            >
                                <Activity size={18} /> Track
                            </button>
                        </div>

                        {/* Content Card */}
                        <div className="p-4 sm:p-6 bg-red-950/70 rounded-lg shadow-lg relative overflow-hidden min-h-[400px]">

                            {loading ? (
                                <div className="flex items-center justify-center h-64 text-red-400 animate-pulse">Loading data...</div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-64 text-red-400">
                                    <Shield size={48} className="mb-4 text-red-600" />
                                    <p className="text-lg font-bold text-white">{error}</p>
                                    <p className="text-sm mt-2">You do not have permission to view this page.</p>
                                </div>
                            ) : (
                                <AnimatePresence mode="wait" custom={direction}>
                                    {activeTab === 'users' ? (
                                        <motion.div
                                            key="users"
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
                                        >
                                            <div className="flex items-center justify-between mb-6">
                                                <h2 className="text-xl font-bold text-white">Registered Users</h2>
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                                                    <input
                                                        type="text"
                                                        placeholder="Search users..."
                                                        value={searchQuery}
                                                        onChange={(e) => setSearchQuery(e.target.value)}
                                                        className="pl-9 pr-4 py-2 bg-red-950/30 border border-red-900/50 rounded-lg text-sm text-white placeholder:text-red-400/50 focus:outline-none focus:border-yellow-500/50 w-full sm:w-64"
                                                    />
                                                </div>
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-red-900/50 text-red-400 text-xs uppercase tracking-wider">
                                                            <th className="p-4 font-semibold">User Identity</th>
                                                            <th className="p-4 font-semibold">Contact</th>
                                                            <th className="p-4 font-semibold text-center">Role</th>
                                                            <th className="p-4 font-semibold text-center">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-red-900/30 text-sm">
                                                        {filteredUsers.map((user, idx) => (
                                                            <tr key={idx} className="hover:bg-red-900/10 transition-colors">
                                                                <td className="p-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-10 h-10 rounded-full bg-black/60 border border-red-800 overflow-hidden flex items-center justify-center shrink-0">
                                                                            {user.profile_image ? (
                                                                                <img src={`http://127.0.0.1:8000/api/uploads/${user.profile_image.replace('uploads/', '')}`} className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <User size={20} className="text-red-500" />
                                                                            )}
                                                                        </div>
                                                                        <span className="text-white font-medium">{user.first_name} {user.last_name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="p-4 text-red-200 font-mono">{user.email}</td>
                                                                <td className="p-4 text-center">
                                                                    {user.is_admin ? (
                                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-md text-xs font-bold uppercase tracking-wide">
                                                                            <Shield size={10} /> Admin
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center px-2.5 py-1 bg-gray-800/50 text-gray-400 border border-gray-700/50 rounded-md text-xs font-medium uppercase tracking-wide">User</span>
                                                                    )}
                                                                </td>
                                                                <td className="p-4 text-center">
                                                                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="track"
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
                                            className="p-8"
                                        >
                                            <div className="max-w-2xl mx-auto">
                                                <h2 className="text-2xl font-bold text-white mb-6 text-center">Content Forensics</h2>

                                                <div className="bg-red-950/20 border-2 border-dashed border-red-900/50 rounded-xl p-8 hover:border-red-500/50 transition-colors text-center cursor-pointer relative mb-8 group">
                                                    {!trackFile ? (
                                                        <>
                                                            <input
                                                                type="file"
                                                                onChange={handleTrackFileChange}
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                                            />
                                                            <div className="flex flex-col items-center">
                                                                <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mb-4 group-hover:bg-red-900/50 transition-colors">
                                                                    <UploadCloud className="text-red-400" size={32} />
                                                                </div>
                                                                <p className="text-lg font-medium text-red-200 mb-2">
                                                                    Drop suspicious media here
                                                                </p>
                                                                <p className="text-sm text-red-400">
                                                                    or click to upload for forensic analysis
                                                                </p>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="relative z-20">
                                                            {trackFile.type.startsWith('image/') ? (
                                                                <img src={trackFilePreview!} alt="Preview" className="max-h-48 mx-auto rounded-md shadow-lg border border-red-900/50" />
                                                            ) : trackFile.type.startsWith('audio/') ? (
                                                                <div className="flex flex-col items-center justify-center p-4 bg-black/40 rounded-lg border border-red-900/30">
                                                                    <Music className="w-16 h-16 text-red-400 mb-2" />
                                                                    <audio controls src={trackFilePreview!} className="w-full mt-2"></audio>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center justify-center p-4 bg-black/40 rounded-lg border border-red-900/30">
                                                                    <FileIcon className="w-16 h-16 text-red-400" />
                                                                </div>
                                                            )}
                                                            <p className="mt-4 text-lg font-medium text-red-200 truncate">{trackFile.name}</p>

                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setTrackFile(null);
                                                                    setTrackFilePreview(null);
                                                                    setTrackResult(null);
                                                                }}
                                                                className="absolute -top-4 -right-4 p-2 bg-red-600 rounded-full hover:bg-red-700 text-white shadow-lg z-30 transform hover:scale-110 transition-all"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {trackFile && !trackResult && !trackLoading && (
                                                    <div className="text-center">
                                                        <button
                                                            onClick={handleAnalyze}
                                                            className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-red-600/20 transition-all transform hover:scale-105"
                                                        >
                                                            Run Analysis
                                                        </button>
                                                    </div>
                                                )}

                                                {trackLoading && (
                                                    <div className="text-center py-8">
                                                        <div className="w-12 h-12 border-4 border-red-900 border-t-red-500 rounded-full animate-spin mx-auto mb-4"></div>
                                                        <p className="text-red-400 animate-pulse">Decrypting matrix structure...</p>
                                                    </div>
                                                )}

                                                {trackError && (
                                                    <div className="bg-red-950/50 border border-red-800 p-4 rounded-lg text-center mt-6">
                                                        <p className="text-red-400 font-bold">Analysis Failed</p>
                                                        <p className="text-sm text-red-300 mt-1">{trackError}</p>
                                                    </div>
                                                )}

                                                {trackResult && (
                                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                        {trackResult.found ? (
                                                            <div className="bg-green-950/20 border border-green-900/50 p-6 rounded-xl mt-6">
                                                                <div className="flex items-center gap-3 mb-4 text-green-400 border-b border-green-900/30 pb-4">
                                                                    <Lock size={24} />
                                                                    <h3 className="text-xl font-bold">Steganography Detected</h3>
                                                                </div>

                                                                <div className="space-y-4">
                                                                    {trackResult.secrets.map((secret: any, i: number) => (
                                                                        <div key={i} className="bg-black/40 p-4 rounded-lg border border-green-900/30">
                                                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                                                <div>
                                                                                    <p className="text-green-600/70 mb-1 flex items-center gap-1"><User size={12} /> Creator Identity</p>
                                                                                    <p className="text-green-100 font-mono">{secret.creator_name}</p>
                                                                                    <p className="text-green-300/60 text-xs">{secret.creator_email}</p>
                                                                                </div>
                                                                                {secret.receiver_email && (
                                                                                    <div>
                                                                                        <p className="text-green-600/70 mb-1 flex items-center gap-1"><User size={12} /> Receiver Identity</p>
                                                                                        <p className="text-green-100 font-mono">{secret.receiver_name}</p>
                                                                                        <p className="text-green-300/60 text-xs">{secret.receiver_email}</p>
                                                                                    </div>
                                                                                )}
                                                                                <div>
                                                                                    <p className="text-green-600/70 mb-1 flex items-center gap-1"><Calendar size={12} /> Timestamp</p>
                                                                                    <p className="text-green-100 font-mono">{new Date(secret.timestamp).toLocaleString()}</p>
                                                                                </div>
                                                                                <div className="col-span-2">
                                                                                    <p className="text-green-600/70 mb-1 font-xs">Key Signature Hash</p>
                                                                                    <p className="text-green-500/50 font-mono text-xs break-all">{secret.key_hash}</p>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-gray-900/50 border border-gray-800 p-6 rounded-xl mt-6 text-center">
                                                                <p className="text-gray-400">{trackResult.message}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
}
