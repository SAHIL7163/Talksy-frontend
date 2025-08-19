import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router";
import useAuthUser from "../hooks/useAuthUser";
import { SendHorizontal, ArrowLeft, Smile, Video, MoreVertical, Check, CheckCheck, Paperclip, VideoIcon } from "lucide-react";
import { useThemeStore } from "../store/useThemeStore";
import { axiosInstance } from "../lib/axios";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data";
import { DeleteMessage, fetchFriend, fetchMessages } from "../lib/api";
import { useSocket } from "../context/SocketContext";

const themes = {
  base: {
    bg: "bg-base-100",
    chatBg: "bg-base-200",
    sender: "bg-primary text-primary-content",
    receiver: "bg-base-300 text-base-content",
    parentsender: "bg-primary text-primary-content/70", // 70% opacity for contrast
    parentreceiver: "bg-base-300 text-base-content/70",
    input: "bg-base-200 text-base-content",
    border: "border-base-300",
    inputRing: "focus:ring-primary",
    sendBtn: "bg-primary text-primary-content hover:bg-primary-focus",
    headerBg: "bg-slate-200",
    headerBorder: "border-slate-300",
    headerText: "text-slate-800",
    menuIcon: "text-gray-500",
  },
  dark: {
    bg: "bg-[#111b21]",
    chatBg: "bg-[#222e35]",
    sender: "bg-[#005c4b] text-white",
    receiver: "bg-[#202c33] text-white",
    parentsender: "bg-[#005c4b]/70 text-white bottom-border",
    parentreceiver: "bg-[#202c33]/70 text-white",
    input: "bg-[#2a3942] text-white",
    border: "border-[#222e35]",
    inputRing: "focus:ring-[#25d366]",
    sendBtn: "bg-[#25d366] text-white hover:bg-[#128c7e]",
    headerBg: "bg-gray-800",
    headerBorder: "border-gray-600",
    headerText: "text-gray-200",
    menuIcon: "text-gray-300",
  },
  light: {
    bg: "bg-[#f0f2f5]",
    chatBg: "bg-white",
    sender: "bg-[#d9fdd3] text-black",
    receiver: "bg-white text-black border border-gray-200",
    parentsender: "bg-[#d9fdd3]/70 text-black",
    parentreceiver: "bg-white/70 text-black",
    input: "bg-white text-black",
    border: "border-gray-200",
    inputRing: "focus:ring-[#25d366]",
    sendBtn: "bg-[#25d366] text-white hover:bg-[#128c7e]",
    headerBg: "bg-gray-50",
    headerBorder: "border-gray-200",
    headerText: "text-gray-800",
    menuIcon: "text-gray-600",
  },
};


export default function ChatPage() {
  const socket = useSocket();
  const { authUser } = useAuthUser();
  const { id: targetUserId } = useParams();
  const [friendUser, setFriendUser] = useState(null);
  const { theme: currentTheme } = useThemeStore();
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [showInputEmoji, setShowInputEmoji] = useState(false);
  const [isFriendTyping, setIsFriendTyping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editText, setEditText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const [showJitsi, setShowJitsi] = useState(false);
  const [showCallBanner, setShowCallBanner] = useState(false);

  const messagesEndRef = useRef();
  const typingTimeout = useRef(null);
  const emojiPickerRef = useRef(null);
  const menuRef = useRef(null);
  const messageRefs = useRef({});
  const fileInputRef = useRef(null);

  const channelId = [authUser._id, targetUserId].sort().join("-");

  useEffect(() => {
    if (!channelId) return;

    const handlefetchFriend = async () => {
      try {
        const data = await fetchFriend(targetUserId);
        setFriendUser(data);
      } catch (err) {
        console.error("Error fetching friend data:", err);
      }
    };

    const handlefetchMessages = async () => {
      try {
        const data = await fetchMessages(channelId);
        setMessages(data);
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    };

    handlefetchFriend();
    handlefetchMessages();

    socket.emit("join_room", channelId);

    socket.on("receive_message", (message) => {
      console.log("Received message:", message);

      setMessages((prev) => [...prev, message]);
    });
    socket.on("typing", (userId) => {
      if (userId !== authUser._id) setIsFriendTyping(true);
    });
    socket.on("stop_typing", (userId) => {
      if (userId !== authUser._id) setIsFriendTyping(false);
    });

    socket.on("message_deleted", ({ messageId }) => {
      setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
    });

    socket.on("message_edited", (updatedMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === updatedMessage._id ? updatedMessage : msg))
      );
    });

    socket.on("message_read", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId ? { ...msg, isRead: true } : msg
        )
      );
    })

    return () => {
      socket.off("receive_message");
      socket.off("typing");
      socket.off("stop_typing");
      socket.off("message_deleted");
      socket.off("message_edited");
      socket.off("message_read");
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowInputEmoji(false);
      }
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(async (entry) => {
          if (entry.isIntersecting) {
            const messageId = entry.target.dataset.messageId;
            const message = messages.find((msg) => msg._id === messageId);
            if (message && message.sender._id !== authUser._id && !message.isRead) {
              try {
                await axiosInstance.put(`/chat/message/${messageId}/read`);
                socket.emit("message_read", { messageId, channelId });
              } catch (err) {
                console.error("Error marking message as read:", err);
              }
            }
          }
        });
      },
      { threshold: 0.5 }
    );

    Object.values(messageRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      Object.values(messageRefs.current).forEach((ref) => {
        if (ref) observer.unobserve(ref);
      });
    };
  }, [messages, authUser._id, channelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  useEffect(() => {
    socket.on("start_video_call", ({ channelId: incomingChannelId }) => {
      if (incomingChannelId === channelId) {
        setShowCallBanner(true);
        setShowJitsi(true);
      }
    });
    socket.on("end_video_call", ({ channelId: incomingChannelId }) => {
      if (incomingChannelId === channelId) {
        setShowJitsi(false);
        setShowCallBanner(false);
      }
    });
    return () => {
      socket.off("start_video_call");
    };
  }, [channelId]);

  // End call: hide banner for both users
  const handleEndCall = () => {
    setShowJitsi(false);
    setShowCallBanner(false);
    socket.emit("end_video_call", { channelId, targetUserId });
  };

const handleDeleteMessage = async (messageId) => {
    try {
      await DeleteMessage(messageId);
      setMessages((prev) => prev.filter((msg) => msg._id !== messageId));
      setMenuOpen(null);
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  };

const handleEditMessage = async (messageId) => {
    if (!editText.trim()) return;
    try {
      await axiosInstance.put(`/chat/message/${messageId}`, { text: editText });
      console.log("Message edited:", messageId, editText);
      setMessages((prev) =>
        prev.map((msg) =>
        { 
          console.log(msg._id, messageId, msg._id === messageId);
          return  msg._id === messageId ? { ...msg, text: editText, isEdited: true } : msg
        }
        )
      );
      setEditingMessageId(null);
      setEditText("");
      setMenuOpen(null);
    } catch (err) {
      console.error("Error editing message:", err);
    }
  };

const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("channelId", channelId);
    formData.append("senderId", authUser._id);

    try {
      const response = await axiosInstance.post("/chat/message/file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSelectedFile(null);
      fileInputRef.current.value = null;
    } catch (err) {
      console.error("Error uploading file:", err);
      setSelectedFile(null);
      fileInputRef.current.value = null;
    }
  };

const handleReplyMessage = (message) => {
    setReplyingTo(message);
    setMenuOpen(null);
  };

const handleSendMessage = (text) => {
    console.log("Sending message:", text, "Replying to:", replyingTo);
    if (!text.trim()) return;
    const messageData = { channelId, senderId: authUser._id, text, isRead: false , parentMessage: replyingTo ? replyingTo._id : null};
    socket.emit("send_message", messageData);
    setMessageText("");
    setShowInputEmoji(false);
    setReplyingTo(null);
    socket.emit("stop_typing", { channelId, userId: authUser._id });
  };

const handleTyping = () => {
    socket.emit("typing", { channelId, userId: authUser._id });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socket.emit("stop_typing", { channelId, userId: authUser._id }), 1500);
  };

const handleCallUser = async() => {
    setShowJitsi(true);
    setShowCallBanner(true);
    socket.emit("start_video_call", { channelId, targetUserId });
}

  const theme = themes[currentTheme] || themes.base;
  return (
    <div className={`w-full min-h-[100dvh] flex flex-col ${theme.bg} font-sans`}>
      {/* Header */}
      <header className={`fixed top-25 left-0 right-0 z-40 px-4 py-3 ${theme.headerBg} ${theme.headerBorder} border-b shadow-sm`}>
        <div className="flex items-center justify-between max-w-full gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => window.history.back()} className="md:hidden">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            {friendUser?.user?.profilePic && (
              <img src={friendUser.user.profilePic} alt="" className="w-8 h-8 rounded-full border-2 border-gray-300" />
            )}
            <h2 className={`text-base sm:text-lg font-semibold ${theme.headerText}`}>
              {friendUser?.user?.fullName}
              {isFriendTyping && <span className="ml-2 text-xs italic text-gray-500">typing...</span>}
            </h2>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCallUser} className="p-2 rounded-full hover:bg-gray-200">
              <Video />
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
  
    <main className={`flex-1 px-4 sm:px-5 py-5 mt-[58px] mb-[60px] ${theme.chatBg}`}>
      {messages.length === 0 && <p className="text-gray-400 italic text-center">No messages yet</p>}
      <div className="flex flex-col gap-2">
        {messages.map((msg) => {
          const isSender = msg.sender._id === authUser._id;
          return (
            <div
              key={msg._id}
              ref={(el) => (messageRefs.current[msg._id] = el)}
              data-message-id={msg._id}
              className={`flex ${isSender ? "justify-end" : "justify-start"} w-full group`}
              onClick={() => {
                if (!msg.parentMessage) return;
                const parentMsgRef = messageRefs.current[msg.parentMessage._id];
                if (parentMsgRef) {
                  parentMsgRef.scrollIntoView({ behavior: "smooth", block: "center" });
                  const shadowClass =
                    msg.parentMessage.sender._id === authUser._id
                      ? `shadow-[0_0_2px] ${theme.sender.replace("bg-", "shadow-")}/60`
                      : `shadow-[0_0_2px] ${theme.receiver.replace("bg-", "shadow-")}/60`;
                  parentMsgRef.classList.add(...shadowClass.split(" "));
                  setTimeout(() => parentMsgRef.classList.remove(...shadowClass.split(" ")), 2000);
                }
              }}
            >
              <div className={`relative flex items-center ${isSender ? "flex-row-reverse" : "flex-row"} gap-1 max-w-full sm:max-w-[70%]`}>
                <div
                  style={{ '--sender-bg': theme.senderColor, '--receiver-bg': theme.receiverColor }}
                  className={`relative px-3 sm:px-4 py-2 shadow 
                    ${isSender
                      ? `${theme.sender} rounded-t-2xl rounded-bl-2xl  `
                      : `${theme.receiver} rounded-t-2xl rounded-br-2xl`
                    }`}
                >
                  {editingMessageId === msg._id ? (
                    <div className="flex gap-2">
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className={`flex-1 p-2 rounded border ${theme.border} ${theme.input} focus:outline-none ${theme.inputRing}`}
                        autoFocus
                      />
                      <button onClick={() => handleEditMessage(msg._id)} className={`px-2 py-1 ${theme.sendBtn} rounded`}>
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingMessageId(null);
                          setEditText("");
                        }}
                        className="px-2 py-1 bg-gray-300 text-black rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      {msg.file ? (
                        <div className="flex flex-col gap-2">
                          {msg.file.type?.startsWith("image/") ? (
                            <div className="relative">
                              <img
                                src={msg.file.url}
                                alt="Uploaded image"
                                className="max-w-[200px] max-h-[200px] rounded-lg object-contain"
                                onError={(e) => console.error("Image load error:", e)}
                              />
                              <a
                                href={msg.file.url}
                                download={msg.file.name || "image"}
                                className={`absolute bottom-2 right-2 px-2 py-1 rounded text-xs ${theme.sendBtn}`}
                                title="Download image"
                              >
                                Download
                              </a>
                            </div>
                          ) : msg.file.type?.startsWith("application/pdf") ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <a
                                  href={msg.file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-500 underline"
                                >
                                  View PDF: {msg.file.name || "Document"}
                                </a>
                                <a
                                  href={msg.file.url}
                                  download={msg.file.name || "document.pdf"}
                                  className={`px-2 py-1 rounded text-xs ${theme.sendBtn}`}
                                  title="Download PDF"
                                >
                                  Download
                                </a>
                              </div>
                              <iframe
                                src={`${msg.file.url}#toolbar=0`}
                                className="w-[200px] h-[200px] rounded-lg border border-gray-200"
                                title="PDF Preview"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <a
                                href={msg.file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 underline"
                              >
                                {msg.file.name || msg.file.type?.split("/")[1]?.toUpperCase() || "File"}
                              </a>
                              <a
                                href={msg.file.url}
                                download={msg.file.name || "file"}
                                className={`px-2 py-1 rounded text-xs ${theme.sendBtn}`}
                                title="Download file"
                              >
                                Download
                              </a>
                            </div>
                          )}
                        </div>
                      ) : null}
                      {msg.parentMessage && (
                        <div
                          className={`px-3 py-2 rounded-t-2xl rounded-b-none cursor-pointer ${
                            msg.parentMessage.sender._id === authUser._id ? theme.parentsender : theme.parentreceiver
                          } -mx-3 sm:-mx-4 -mt-2 border-b border-gray-300 shadow-sm`}
                        >
                          <span className="text-xs italic text-gray-600 block">Replying to:</span>
                          <div className="text-sm truncate">{msg.parentMessage.text}</div>
                        </div>
                      )}
                      {msg.text && <div className="whitespace-pre-wrap">{msg.text}</div>}
                      <div className="flex justify-end items-center mt-1 text-xs text-gray-400 gap-1">
                        {msg.isEdited && <span className="italic">Edited</span>}
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {isSender && (
                          <span>
                            {msg.isRead ? (
                              <CheckCheck className="w-4 h-4 text-blue-500" />
                            ) : (
                              <Check className="w-4 h-4 text-gray-400" />
                            )}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setMenuOpen(menuOpen === msg._id ? null : msg._id)}
                  className={`p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity ${
                    isSender ? "mr-1" : "ml-1"
                  } self-start mt-2`}
                >
                  <MoreVertical className={`w-4 h-4 ${theme.menuIcon}`} />
                </button>
                {menuOpen === msg._id && (
                  <div
                    ref={menuRef}
                    className={`absolute ${isSender ? "right-6" : "left-6"} top-0 mt-1 z-50 bg-white border ${theme.border} shadow-lg rounded-lg min-w-[120px]`}
                  >
                    {isSender && msg.text &&
                    <button
                      onClick={() => handleDeleteMessage(msg._id)}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600"
                    >
                      Delete
                    </button>
                    }
                    {isSender && msg.text && !msg.file && (
                      <button
                        onClick={() => {
                          setEditingMessageId(msg._id);
                          setEditText(msg.text);
                          setMenuOpen(null);
                        }}
                        className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleReplyMessage(msg)}
                      className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                    >
                      Reply
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      </main>

      {showCallBanner && !showJitsi && (
        <div className="flex justify-center my-2">
          <button
            onClick={() => setShowJitsi(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
          >
            <VideoIcon className="w-5 h-5" />
            Join Video Call
          </button>
        </div>
      )}

      {/* Jitsi Meet Modal */}
      {showJitsi && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="relative w-full max-w-2xl h-[70vh] bg-white rounded-lg shadow-lg">
            <button
              onClick={handleEndCall}
              className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded"
            >
              End Call
            </button>
            <iframe
              src={`https://meet.jit.si/streamify-${channelId}`}
              style={{ width: "100%", height: "100%", border: 0, borderRadius: "8px" }}
              allow="camera; microphone; fullscreen; display-capture"
              title="Jitsi Video Call"
            />
          </div>
        </div>
      )}


      {/* Footer */}
      <footer className={`fixed bottom-0 left-0 right-0 p-3 border-t ${theme.border} ${theme.chatBg} flex flex-col gap-2`}>
        {replyingTo && (
          <div className={`flex items-centezr justify-between ${replyingTo.sender._id === authUser._id
                      ? theme.sender
                      : theme.receiver
                    } p-2 rounded `}>
            <span className="text-sm italic">Replying to: {replyingTo.text}</span>
            <button onClick={() => setReplyingTo(null)} className="text-red-500">
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowInputEmoji((prev) => !prev);
              }}
              className="p-1 rounded-full hover:bg-gray-200"
            >
              <Smile className="w-5 h-5 text-gray-500" />
            </button>
            {showInputEmoji && (
              <div
                ref={emojiPickerRef}
                className="absolute -top-[450px] left-0 z-50 emoji-picker"
                onClick={(e) => e.stopPropagation()}
              >
                <Picker data={emojiData} onEmojiSelect={(emoji) => setMessageText((prev) => prev + emoji.native)} />
              </div>
            )}
          </div>
          <button onClick={() => fileInputRef.current.click()} className="p-1 rounded-full hover:bg-gray-200">
            <Paperclip className="w-5 h-5 text-gray-500" />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*,application/pdf"
            className="hidden"
          />
          <input
            value={messageText}
            type="text"
            placeholder="Type your message"
            className={`flex-1 p-2 sm:p-3 rounded-full border ${theme.border} ${theme.input} focus:outline-none ${theme.inputRing}`}
            onChange={(e) => {
              setMessageText(e.target.value);
              handleTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSendMessage(messageText);
            }}
          />
          <button
            onClick={() => handleSendMessage(messageText)}
            className={`rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center ${theme.sendBtn}`}
          >
            <SendHorizontal className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </footer>
    </div>
  );
}





  

