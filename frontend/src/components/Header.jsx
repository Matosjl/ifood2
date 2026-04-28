import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export const Header = ({ backendStatus }) => {
  const navigate = useNavigate();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isOnline = backendStatus?.api === true;
  const dotColor = isOnline ? "#00E559" : "#FF4444";
  const label = isOnline
    ? `API ONLINE${backendStatus?.mongo ? " · DB OK" : " · DB OFF"}`
    : "API OFFLINE";

  return (
    <motion.header
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="h-12 bg-[#0A0A0A] border-b border-[#27272A] flex items-center justify-between px-4 shrink-0 relative overflow-hidden"
      data-testid="header"
    >
      <motion.div
        className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#00E559] to-transparent opacity-30"
        animate={{ opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 4, repeat: Infinity }}
      />

      <div className="flex items-center gap-3 relative z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            boxShadow: [`0 0 0px ${dotColor}00`, `0 0 8px ${dotColor}66`, `0 0 0px ${dotColor}00`],
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <motion.h1
          className="font-mono text-sm font-bold tracking-[0.2em] uppercase text-[#00E559]"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          AJAX AI Agent
        </motion.h1>
      </div>

      <motion.div
        className="flex items-center gap-4 text-xs text-[#71717A] font-mono relative z-10"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
      >
        <button
          onClick={() => navigate("/owner/login")}
          className="font-mono text-xs text-[#3F3F46] hover:text-[#71717A] transition-colors"
        >
          OWNER
        </button>
        <motion.span
          className="flex items-center gap-2"
          style={{ color: isOnline ? "#71717A" : "#FF4444" }}
        >
          <motion.span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: dotColor }}
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          {label}
        </motion.span>
        <motion.span
          key={time.toLocaleTimeString()}
          initial={{ opacity: 0.5, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {time.toLocaleTimeString()}
        </motion.span>
      </motion.div>
    </motion.header>
  );
};
