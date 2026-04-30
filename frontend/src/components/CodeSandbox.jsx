import { motion } from "framer-motion";

export const CodeSandbox = () => {
  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col p-4"
    >
      <div className="flex-1 bg-[#0A0A0A] border border-[#27272A] p-4 font-mono text-sm overflow-auto">
        <div className="text-[#71717A] mb-2">// Code execution environment</div>
        <div className="text-[#FFB000]">[SYSTEM] Code sandbox ready. Connect backend for execution.</div>
        <div className="mt-4 text-[#A1A1AA]">
          Supported languages: JavaScript, Python, Bash
        </div>
        <div className="mt-4 p-3 bg-[#121212] border border-[#27272A]">
          <div className="text-[#71717A] text-xs mb-2">Example:</div>
          <code className="text-[#EDEDED] text-xs">
            <span className="text-[#00E559]">const</span> result = <span className="text-[#FFB000]">await</span> fetch(<span className="text-[#007AFF]">'/api/execute'</span>);
          </code>
        </div>
      </div>
    </motion.div>
  );
};
