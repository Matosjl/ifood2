import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
};

const messageVariants = {
  hidden: { opacity: 0, y: 8, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.12, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: { opacity: 0, x: -10, transition: { duration: 0.08 } },
};

const glowHover = {
  rest: { boxShadow: "0 0 0px rgba(0,229,89,0)" },
  hover: {
    boxShadow: "0 0 12px rgba(0,229,89,0.15)",
    transition: { duration: 0.2 },
  },
};

export const ChatInterface = ({ messages, isLoading, onSendMessage }) => {
  const [inputValue, setInputValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Remove <think>...</think> blocks from DeepSeek-R1 reasoning traces
  const formatContent = (content, streaming) => {
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    return streaming && !cleaned ? "..." : cleaned || content;
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSendMessage(inputValue);
    setInputValue("");
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-black min-w-0 relative">
      {/* Subtle scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,229,89,0.03) 2px, rgba(0,229,89,0.03) 4px)",
          zIndex: 10,
        }}
      />

      <motion.div
        className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <AnimatePresence mode="popLayout">
          {messages.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="text-[#71717A] text-center mt-20"
            >
              <motion.div
                className="text-[#00E559] text-lg mb-2"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                AJAX AI Agent v1.0
              </motion.div>
              <div>Start a conversation or execute code...</div>
              <div className="mt-4 text-xs text-[#71717A]">
                Type <span className="text-[#00E559]">/help</span> for commands
              </div>
            </motion.div>
          )}

          {messages.map((msg, idx) => (
            <motion.div
              key={`${idx}-${msg.timestamp?.getTime()}`}
              variants={messageVariants}
              initial="hidden"
              animate="show"
              exit="exit"
              layout
              className={`group relative p-2 rounded-sm ${
                msg.type === "user"
                  ? "text-[#A1A1AA]"
                  : "text-[#EDEDED] bg-[#0A0A0A] border border-[#27272A]"
              }`}
              data-testid={`message-${idx}`}
              whileHover={{ backgroundColor: msg.type === "ai" ? "rgba(18,18,18,1)" : "transparent" }}
            >
              {msg.type === "ai" && (
                <motion.div
                  className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#00E559]"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.2, delay: 0.05 }}
                  style={{ originY: 0 }}
                />
              )}
              <span
                className={
                  msg.type === "user" ? "text-[#00E559]" : "text-[#FFB000]"
                }
              >
                {msg.type === "user" ? ">" : "AJAX:"}
              </span>{" "}
              <span className="whitespace-pre-wrap">{formatContent(msg.content, msg.streaming)}</span>
              {msg.streaming && (
                <motion.span
                  className="inline-block w-[7px] h-[13px] bg-[#FFB000] ml-1 align-middle"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
              )}
              <motion.div
                className="text-[10px] text-[#71717A] mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {msg.timestamp?.toLocaleTimeString()}
              </motion.div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[#FFB000] font-mono text-sm flex items-center gap-2 p-2"
            data-testid="typing-indicator"
          >
            <span>AJAX:</span>
            <motion.span
              className="inline-block w-2 h-4 bg-[#FFB000]"
              animate={{ opacity: [1, 0.3, 1], scaleY: [1, 0.7, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.span
              className="inline-block w-2 h-4 bg-[#FFB000]"
              animate={{ opacity: [1, 0.3, 1], scaleY: [1, 0.7, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.15 }}
            />
            <motion.span
              className="inline-block w-2 h-4 bg-[#FFB000]"
              animate={{ opacity: [1, 0.3, 1], scaleY: [1, 0.7, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
            />
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </motion.div>

      {/* Input Area */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className={`p-3 border-t bg-[#0A0A0A] transition-all duration-200 ${
          isFocused ? "border-[#00E559]" : "border-[#27272A]"
        }`}
        style={{
          boxShadow: isFocused ? "0 -4px 20px rgba(0,229,89,0.08)" : "none",
        }}
      >
        <div className="flex gap-2 items-center">
          <motion.span
            className="text-[#00E559] font-mono text-sm"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            {">"}
          </motion.span>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Enter command or message..."
            className="flex-1 bg-transparent border-none outline-none text-[#EDEDED] font-mono text-sm placeholder:text-[#71717A] focus:ring-0"
            data-testid="chat-input"
          />
          <motion.button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="px-4 py-1 bg-[#00E559] text-black font-mono text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="send-message-btn"
            variants={glowHover}
            initial="rest"
            whileHover={!isLoading && inputValue.trim() ? "hover" : "rest"}
            whileTap={{ scale: 0.95 }}
          >
            SEND
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};
