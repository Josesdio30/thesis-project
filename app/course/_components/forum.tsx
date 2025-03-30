'use client';

import { useState, useRef, useEffect } from "react";

type Message = {
  id: number;
  sender: string;
  content: string;
  timestamp: string;
  isSender: boolean;
  type: "text" | "file";
  fileUrl?: string;
};

const Forum = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      sender: "Benedictus Dhaniar Adra",
      content: "Halo semua, ada yang bisa bantu jelaskan tentang materi minggu ini?",
      timestamp: "10:30 AM",
      isSender: false,
      type: "text",
    },
    {
      id: 2,
      sender: "You",
      content: "Tentu, materi minggu ini tentang pengulangan variabel. Aku bisa bantu jelaskan.",
      timestamp: "10:32 AM",
      isSender: true,
      type: "text",
    },
    {
      id: 3,
      sender: "Benedictus Dhaniar Adra",
      content: "Terima kasih! Bisa kasih contoh soal?",
      timestamp: "10:35 AM",
      isSender: false,
      type: "text",
    },
  ]);

  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSendMessage = () => {
    if (newMessage.trim() === "") return;
    const newMsg: Message = {
      id: messages.length + 1,
      sender: "You",
      content: newMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSender: true,
      type: "text",
    };
    setMessages([...messages, newMsg]);
    setNewMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSendMessage();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const newFileMsg: Message = {
      id: messages.length + 1,
      sender: "You",
      content: file.name,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isSender: true,
      type: "file",
      fileUrl: URL.createObjectURL(file),
    };
    setMessages([...messages, newFileMsg]);
    e.target.value = "";
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] bg-gray-100 rounded-lg shadow-sm border border-gray-300">
      <div className="flex-1 p-4 overflow-y-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.isSender ? "justify-end" : "justify-start"} mb-4`}
          >
            <div
              className={`max-w-xs md:max-w-md p-3 rounded-lg ${
                message.isSender
                  ? "bg-blue-500 text-white"
                  : "bg-white text-gray-800 border border-gray-300"
              }`}
            >
              <p className="text-sm font-semibold">{message.sender}</p>
              {message.type === "text" ? (
                <p className="text-base">{message.content}</p>
              ) : (
                <a
                  href={message.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center text-base underline"
                >
                  <span className="mr-2">📄</span>
                  {message.content}
                </a>
              )}
              <p className="text-xs text-gray-400 mt-1">{message.timestamp}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 bg-white border-t border-gray-300">
        <div className="flex items-center space-x-3">
          <label className="cursor-pointer">
            <input
              type="file"
              onChange={handleFileUpload}
              className="hidden"
            />
            <span className="text-gray-600 hover:text-blue-500">📎</span>
          </label>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message..."
            className="flex-1 p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSendMessage}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default Forum;