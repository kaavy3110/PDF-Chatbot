'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  Send,
  Trash2,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { extractTextFromPdf } from '@/lib/pdf';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function Home() {
  // File & Extraction States
  const [file, setFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState<string>('');
  const [pageCount, setPageCount] = useState<number>(0);
  const [charCount, setCharCount] = useState<number>(0);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Chat States
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [streamingText, setStreamingText] = useState<string>('');

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Refs for UI scroll behavior
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  // Handle Drag Events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setUploadError(null);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const selectedFile = droppedFiles[0];
      await processFile(selectedFile);
    }
  };

  // Handle File Input Change
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const selectedFile = selectedFiles[0];
      await processFile(selectedFile);
    }
  };

  // Process and parse PDF file
  const processFile = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
      setUploadError('Invalid file format. Please upload a valid .pdf file.');
      return;
    }

    // 30MB limit check
    const MAX_SIZE = 30 * 1024 * 1024;
    if (selectedFile.size > MAX_SIZE) {
      setUploadError('File is too large. Please upload a PDF under 30MB to avoid browser performance lag.');
      return;
    }

    setFile(selectedFile);
    setIsExtracting(true);
    setPdfText('');
    setPageCount(0);
    setCharCount(0);
    setMessages([]);
    setStreamingText('');

    try {
      const result = await extractTextFromPdf(selectedFile, (current, total) => {
        setExtractionProgress({ current, total });
      });

      if (!result.text || result.text.trim().length === 0) {
        throw new Error('No selectable text found in the PDF. The document might be scanned or image-only.');
      }

      setPdfText(result.text);
      setPageCount(result.pageCount);
      setCharCount(result.text.length);
    } catch (err: any) {
      console.error(err);
      setUploadError(err.message || 'An error occurred during PDF text extraction.');
      setFile(null);
    } finally {
      setIsExtracting(false);
      setExtractionProgress({ current: 0, total: 0 });
    }
  };

  // Trigger file selection dialog
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Reset current document
  const handleReset = () => {
    setFile(null);
    setPdfText('');
    setPageCount(0);
    setCharCount(0);
    setMessages([]);
    setStreamingText('');
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Format File Size
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Send message and get AI streaming response
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !pdfText || isGenerating) return;

    const userQuestion = input.trim();
    setInput('');

    // Add user message to history
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userQuestion,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsGenerating(true);
    setStreamingText('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfText,
          question: userQuestion,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to stream response from Gemini API.');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body stream is not readable.');
      }

      const decoder = new TextDecoder();
      let completeResponse = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        completeResponse += chunk;
        setStreamingText(completeResponse);
      }

      // Add finalized assistant message to history
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: completeResponse,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error(err);
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ Error: ${err.message || 'An error occurred while generating the response. Please check your API key setup.'}`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
      setStreamingText('');
    }
  };

  // Quick prompt selection handler
  const handleQuickPrompt = (promptText: string) => {
    if (isGenerating || !pdfText) return;
    setInput(promptText);
  };

  return (
    <div className="flex flex-col flex-1 h-screen overflow-hidden">
      {/* Sleek Modern Header */}
      <header className="h-16 shrink-0 glass-panel border-b flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-lg tracking-tight text-white flex items-center gap-2">
              DocuMind <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-accent font-medium uppercase border border-primary/20">RAG-Less</span>
            </h1>
            <p className="text-xs text-zinc-400">Context-First Full Document QA</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/40 border border-zinc-700/30 text-xs">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-zinc-300 font-medium">Gemini API Active</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Grid */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left Side: PDF Manager and Metadata */}
        <aside className="w-full md:w-80 lg:w-[350px] shrink-0 border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-950/40 flex flex-col p-5 overflow-y-auto">
          
          <div className="mb-4">
            <h2 className="text-sm font-semibold tracking-wider text-zinc-400 uppercase">Document Scope</h2>
            <p className="text-xs text-zinc-500 mt-1">Upload a PDF document to inject directly into the LLM context pool.</p>
          </div>

          {/* Upload Box / Drag & Drop Zone */}
          {!file && !isExtracting && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={triggerFileInput}
              className={`flex-1 min-h-[200px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center cursor-pointer transition-all duration-300 ${
                isDragging
                  ? 'border-primary bg-primary/5 scale-[0.98]'
                  : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/10'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf"
                className="hidden"
              />
              <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-850 mb-4 transition-transform group-hover:scale-110">
                <UploadCloud className="h-6 w-6 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-200">Drag & drop your PDF here</p>
              <p className="text-xs text-zinc-500 mt-1.5">or click to browse local files</p>
              <div className="mt-4 px-3 py-1 bg-zinc-900/60 rounded text-[10px] text-zinc-500 border border-zinc-850">
                Maximum size: 30MB
              </div>
            </div>
          )}

          {/* Extraction Loader Progress */}
          {isExtracting && (
            <div className="flex-1 border border-zinc-800 rounded-xl flex flex-col items-center justify-center p-6 text-center bg-zinc-900/10">
              <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
              <h3 className="text-sm font-medium text-zinc-200">Extracting Document Text</h3>
              <p className="text-xs text-zinc-500 mt-1">Reading pages and cleaning layout whitespace...</p>
              
              {/* Progress Bar */}
              {extractionProgress.total > 0 && (
                <div className="w-full mt-6">
                  <div className="flex justify-between text-[11px] font-medium text-zinc-400 mb-1">
                    <span>Processing Pages</span>
                    <span>{extractionProgress.current} / {extractionProgress.total}</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${(extractionProgress.current / extractionProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upload Errors */}
          {uploadError && !file && !isExtracting && (
            <div className="mt-3 p-3 rounded-lg border border-red-900/30 bg-red-950/10 text-red-400 text-xs flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Extraction Failed</p>
                <p className="mt-0.5">{uploadError}</p>
              </div>
            </div>
          )}

          {/* Document Metadata & Info */}
          {file && !isExtracting && (
            <div className="flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                {/* File Pill */}
                <div className="p-3.5 rounded-xl bg-zinc-900/50 border border-zinc-850 flex items-start gap-3">
                  <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                    <FileText className="h-4.5 w-4.5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{file.name}</p>
                    <p className="text-[10px] text-zinc-500 font-medium mt-0.5">{formatBytes(file.size)}</p>
                  </div>
                  <button 
                    onClick={handleReset}
                    className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800/40 rounded transition-colors"
                    title="Remove document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Extraction Stats Grid */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="p-3.5 rounded-xl bg-zinc-900/20 border border-zinc-850/50">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Pages</p>
                    <p className="text-lg font-semibold text-zinc-200 mt-1">{pageCount}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-zinc-900/20 border border-zinc-850/50">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Total Characters</p>
                    <p className="text-lg font-semibold text-zinc-200 mt-1">{(charCount / 1000).toFixed(1)}k</p>
                  </div>
                </div>

                {/* Token Usage Estimator */}
                <div className="p-3.5 rounded-xl bg-zinc-900/20 border border-zinc-850/50">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">Estimated Tokens</p>
                    <span className="text-[10px] text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded font-mono">
                      ~4 chars/token
                    </span>
                  </div>
                  <p className="text-base font-semibold text-zinc-200 mt-1.5">
                    {Math.round(charCount / 4).toLocaleString()}
                  </p>
                  <div className="w-full h-1 bg-zinc-800 rounded-full mt-3 overflow-hidden">
                    {/* Visual context scope compared to Gemini's 2M limit */}
                    <div 
                      className="h-full bg-emerald-550" 
                      style={{ width: `${Math.min(((charCount / 4) / 2000000) * 100, 100)}%` }} 
                    />
                  </div>
                  <p className="text-[9px] text-zinc-500 mt-1.5 flex justify-between">
                    <span>Context Window Utilization</span>
                    <span>{(((charCount / 4) / 2000000) * 100).toFixed(4)}% of 2M</span>
                  </p>
                </div>

                {/* Extracted Text Snippet Preview */}
                <div className="flex flex-col rounded-xl bg-zinc-900/10 border border-zinc-850/50 overflow-hidden">
                  <div className="bg-zinc-900/30 px-3 py-2 border-b border-zinc-850/50 flex justify-between items-center">
                    <span className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">Context Snapshot</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  </div>
                  <div className="p-3 max-h-32 overflow-y-auto text-[11px] text-zinc-500 leading-relaxed font-mono select-none">
                    {pdfText.slice(0, 350)}...
                  </div>
                </div>
              </div>

              {/* Start Over Button */}
              <button
                onClick={handleReset}
                className="mt-6 w-full py-2.5 rounded-lg border border-zinc-850 hover:bg-zinc-900/40 text-xs font-semibold text-zinc-300 hover:text-white flex items-center justify-center gap-2 transition-all"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Upload New Document
              </button>
            </div>
          )}

          {/* Quick Help Guide */}
          {!file && !isExtracting && (
            <div className="mt-auto p-4 rounded-xl border border-zinc-850/50 bg-zinc-900/10">
              <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-primary" />
                How it works
              </h3>
              <ol className="text-[11px] text-zinc-500 mt-2 space-y-2 list-decimal list-inside">
                <li>Provide your Gemini API Key in the environment file.</li>
                <li>Upload your PDF. The text is parsed locally in your browser.</li>
                <li>The complete text context is sent to the LLM directly on each chat request.</li>
                <li>No chunking, vector indexing, or database storing. No RAG.</li>
              </ol>
            </div>
          )}
        </aside>

        {/* Right Side: Chat Panel */}
        <main className="flex-1 flex flex-col bg-zinc-950/20 overflow-hidden h-full">
          
          {/* Chat locked overlay / prompt to upload */}
          {!file && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="h-14 w-14 rounded-full bg-zinc-900/80 border border-zinc-850 flex items-center justify-center mb-5 text-zinc-500">
                <MessageSquare className="h-6 w-6" />
              </div>
              <h3 className="text-base font-semibold text-zinc-300">No Active Document Context</h3>
              <p className="text-sm text-zinc-500 max-w-sm mt-1.5">
                Please upload a PDF document in the side panel to initiate the context scope and begin chatting.
              </p>
            </div>
          )}

          {/* Chat Feed */}
          {file && (
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
              
              {/* Inline Success Notice */}
              <div className="p-3.5 rounded-xl border border-primary/10 bg-primary/5 flex items-start gap-3 max-w-xl mx-auto">
                <CheckCircle2 className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Scope Initialized Successfully</h4>
                  <p className="text-[11px] text-zinc-500 leading-normal mt-0.5">
                    The prompt compiler will automatically inject the complete extracted text ({charCount.toLocaleString()} chars) with every question you submit.
                  </p>
                </div>
              </div>

              {/* Message List */}
              <div className="max-w-2xl mx-auto space-y-5">
                {messages.length === 0 && !isGenerating && (
                  <div className="text-center py-12">
                    <Sparkles className="h-7 w-7 text-primary mx-auto opacity-40 mb-3 animate-pulse" />
                    <h4 className="text-sm font-semibold text-zinc-400">Context is loaded and ready</h4>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1 leading-normal">
                      Ask any questions about the uploaded file. The model will consult only the document text to answer.
                    </p>

                    {/* Quick Suggestions Chips */}
                    <div className="flex flex-wrap gap-2.5 justify-center mt-6 max-w-md mx-auto">
                      <button 
                        onClick={() => handleQuickPrompt("Summarize the entire document's key findings.")}
                        className="px-3 py-1.5 rounded-lg border border-zinc-850/80 bg-zinc-900/10 hover:border-zinc-700 hover:bg-zinc-900/30 text-[11px] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                      >
                        Summarize document
                      </button>
                      <button 
                        onClick={() => handleQuickPrompt("Identify the top 3 most important points covered in this text.")}
                        className="px-3 py-1.5 rounded-lg border border-zinc-850/80 bg-zinc-900/10 hover:border-zinc-700 hover:bg-zinc-900/30 text-[11px] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                      >
                        List top 3 key points
                      </button>
                      <button 
                        onClick={() => handleQuickPrompt("Find any potential contradictions or main arguments in this text.")}
                        className="px-3 py-1.5 rounded-lg border border-zinc-850/80 bg-zinc-900/10 hover:border-zinc-700 hover:bg-zinc-900/30 text-[11px] text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer"
                      >
                        Analyze arguments
                      </button>
                    </div>
                  </div>
                )}

                {/* Messages Bubbles */}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed border transition-all ${
                        message.role === 'user'
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-150 rounded-tr-none'
                          : 'bg-chat-ai border-chat-ai-border text-zinc-200 rounded-tl-none font-medium'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}

                {/* AI Streaming Chat Bubble */}
                {isGenerating && streamingText && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-chat-ai border border-chat-ai-border text-zinc-200 rounded-tl-none font-medium">
                      <p className="whitespace-pre-wrap">
                        {streamingText}
                        <span className="streaming-dot" />
                      </p>
                    </div>
                  </div>
                )}

                {/* AI Loading Bubble (before text stream starts) */}
                {isGenerating && !streamingText && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl px-4 py-3 text-sm bg-chat-ai border border-chat-ai-border text-zinc-400 rounded-tl-none flex items-center gap-2.5">
                      <Loader2 className="h-4 w-4 text-primary animate-spin" />
                      <span>Gemini is reading context...</span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>
          )}

          {/* Bottom Chat Input Form */}
          {file && (
            <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/20 shrink-0">
              <form onSubmit={handleSendMessage} className="max-w-2xl mx-auto flex gap-2 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question about this document..."
                  disabled={isGenerating || isExtracting}
                  className="flex-1 bg-zinc-900/80 border border-zinc-850 hover:border-zinc-850 focus:border-primary/80 focus:ring-1 focus:ring-primary/40 focus:outline-none rounded-xl py-3.5 px-4 pr-12 text-sm text-zinc-200 placeholder-zinc-500 disabled:opacity-50 transition-all"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isGenerating || isExtracting}
                  className="absolute right-2.5 top-[7.5px] p-2 bg-primary hover:bg-primary-hover text-white rounded-lg disabled:opacity-30 disabled:hover:bg-primary transition-all flex items-center justify-center cursor-pointer shadow-md shadow-primary/20"
                >
                  <Send className="h-4.5 w-4.5" />
                </button>
              </form>
              <div className="max-w-2xl mx-auto flex items-center justify-between mt-2.5 px-1">
                <p className="text-[10px] text-zinc-500 flex items-center gap-1 font-medium">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Gemini evaluates the complete text payload directly (RAG-less)
                </p>
                <p className="text-[10px] text-zinc-500">
                  {input.length} characters
                </p>
              </div>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
