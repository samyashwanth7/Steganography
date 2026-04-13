"use client";

import { useState, useEffect } from 'react';
import { Shield, ArrowLeft, Download, Mail, Clock, File as FileIcon, Search, User, Trash2, AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import NeuralNetworkAnimation from '../components/NeuralNetworkAnimation';

export default function InboxPage() {
    const [messages, setMessages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [messageToDelete, setMessageToDelete] = useState<number | null>(null);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        if (!storedToken) {
            window.location.href = '/';
            return;
        }
        setToken(storedToken);
        fetchInbox(storedToken);
    }, []);

    const fetchInbox = async (authToken: string) => {
        try {
            const response = await fetch('http://127.0.0.1:8000/api/inbox', {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMessages(data);
            } else {
                setError("Failed to load inbox.");
            }
        } catch (err) {
            setError("Network error.");
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (filename: string, originalName: string) => {
        try {
            const response = await fetch(`http://127.0.0.1:8000/api/uploads/${filename}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = originalName;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (err) {
            console.error("Download failed", err);
        }
    };

    const handleDelete = (messageId: number) => {
        if (!token) {
            alert("Authentication token not found. Please log in again.");
            return;
        }
        setMessageToDelete(messageId);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!messageToDelete || !token) return;

        try {
            const response = await fetch(`http://127.0.0.1:8000/api/inbox/${messageToDelete}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                setMessages(messages.filter(m => m.id !== messageToDelete));
                setDeleteModalOpen(false);
                setMessageToDelete(null);
            } else {
                alert("Failed to delete message");
            }
        } catch (err) {
            alert("Network error deleting message");
        }
    };

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
                                <Mail className="text-yellow-500" size={32} /> Secure Inbox
                            </h1>
                            <p className="text-red-200 mt-2">Manage your encrypted transfers</p>
                        </div>

                        {/* Content Card */}
                        <div className="p-4 sm:p-6 bg-red-950/70 rounded-lg shadow-lg relative overflow-hidden min-h-[400px]">
                            {loading ? (
                                <div className="flex items-center justify-center h-64 text-red-400 animate-pulse">Loading secure messages...</div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-64 text-red-400">
                                    <AlertTriangle size={48} className="mb-4 text-red-600" />
                                    <p className="text-lg font-bold text-white">{error}</p>
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-red-400">
                                    <Mail size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>No messages in your secure inbox.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {messages.map((msg) => (
                                        <div key={msg.id} className="p-4 bg-black/20 hover:bg-black/40 border border-red-900/30 rounded-lg transition-all flex items-center justify-between group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-red-950/50 border border-red-900 flex items-center justify-center shrink-0">
                                                    <User size={18} className="text-red-400" />
                                                </div>
                                                <div>
                                                    <p className="text-white font-bold mb-0.5">{msg.sender_name}</p>
                                                    <p className="text-red-300/70 text-xs flex items-center gap-2 mb-0.5">
                                                        <Mail size={10} /> {msg.sender_email}
                                                    </p>
                                                    <p className="text-gray-400/60 text-[10px] flex items-center gap-2 font-mono">
                                                        <Clock size={10} /> {new Date(msg.timestamp).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className="text-right hidden sm:block mr-2">
                                                    <p className="text-yellow-500 font-medium flex items-center gap-2 justify-end text-sm">
                                                        <FileIcon size={12} /> {msg.filename}
                                                    </p>
                                                    <span className="text-[10px] uppercase tracking-wider text-green-500 bg-green-950/30 px-2 py-0.5 rounded border border-green-900/30 mt-1 inline-block">Encrypted</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleDownload(msg.stored_filename, msg.filename)}
                                                        className="p-2 bg-red-900/20 hover:bg-yellow-600 hover:text-white text-red-400 rounded-lg border border-red-800 transition-all shadow-lg hover:shadow-yellow-500/20"
                                                        title="Download Decryptable File"
                                                    >
                                                        <Download size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(msg.id)}
                                                        className="p-2 bg-red-950/30 hover:bg-red-600 hover:text-white text-red-500 rounded-lg border border-red-900/50 hover:border-red-500 transition-all shadow-lg"
                                                        title="Delete Message"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            <AnimatePresence>
                {deleteModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-red-950 border border-red-800 rounded-xl p-6 max-w-sm w-full shadow-2xl relative"
                        >
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                className="absolute top-4 right-4 text-red-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <div className="flex flex-col items-center text-center">
                                <div className="w-16 h-16 bg-red-900/50 rounded-full flex items-center justify-center mb-4">
                                    <AlertTriangle size={32} className="text-red-500" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">Delete Message?</h3>
                                <p className="text-red-200/70 mb-6">
                                    Are you sure you want to delete this message? This action cannot be undone.
                                </p>
                                <div className="flex gap-3 w-full">
                                    <button
                                        onClick={() => setDeleteModalOpen(false)}
                                        className="flex-1 py-2 px-4 rounded-lg border border-red-800 text-red-300 hover:bg-red-900/30 transition-colors font-semibold"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmDelete}
                                        className="flex-1 py-2 px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/20 transition-all font-bold"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
