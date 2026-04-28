import { motion } from "framer-motion";

export const HistorySidebar = ({ history, onNewChat, onSelectChat }) => {
  return (
    <motion.aside
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="w-64 bg-[#0A0A0A] border-r border-[#27272A] flex flex-col hidden md:flex"
    >
      <div className="p-3 border-b border-[#27272A]">
        <button
          onClick={onNewChat}
          className="w-full py-2 px-3 bg-[#121212] border border-[#27272A] text-[#00E559] font-mono text-xs hover:bg-[#1a1a1a] hover:border-[#00E559] transition-all"
          data-testid="new-chat-btn"
        >
          + NEW SESSION
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="text-xs text-[#71717A] font-mono uppercase tracking-wider px-2 py-2">
          History
        </div>
        {history.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            onClick={() => onSelectChat(item)}
            className="p-2 text-xs text-[#A1A1AA] hover:bg-[#121212] hover:text-[#EDEDED] cursor-pointer font-mono border-l-2 border-transparent hover:border-[#00E559] transition-all"
            data-testid={`history-item-${item.id}`}
          >
            <div className="truncate">{item.title}</div>
            <div className="text-[10px] text-[#71717A] mt-1">{item.timestamp}</div>
          </motion.div>
        ))}
      </div>
    </motion.aside>
  );
};
