import { motion } from "framer-motion";
import { FaGoogle, FaWhatsapp, FaInstagram, FaTwitter } from "react-icons/fa";

export const IntegrationsPanel = ({ integrations }) => {
  return (
    <motion.aside
      initial={{ x: 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="w-72 bg-[#0A0A0A] border-l border-[#27272A] flex flex-col hidden lg:flex"
    >
      <div className="p-3 border-b border-[#27272A]">
        <div className="text-xs text-[#71717A] font-mono uppercase tracking-wider">
          Integrations
        </div>
      </div>
      <div className="p-3 space-y-3">
        {integrations.map((integration, index) => {
          const IconComponent = {
            gmail: FaGoogle,
            whatsapp: FaWhatsapp,
            instagram: FaInstagram,
            twitter: FaTwitter,
          }[integration.id];

          return (
            <motion.div
              key={integration.id}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="p-3 bg-[#121212] border border-[#27272A] hover:border-[#3F3F46] transition-colors"
              data-testid={`integration-${integration.id}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {IconComponent && <IconComponent className="w-4 h-4 text-[#A1A1AA]" />}
                  <span className="text-xs font-mono text-[#EDEDED]">{integration.name}</span>
                </div>
                <motion.span
                  animate={integration.connected ? {
                    scale: [1, 1.3, 1],
                    opacity: [1, 0.7, 1]
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  className={`w-2 h-2 rounded-full ${
                    integration.connected ? "bg-[#00E559]" : "bg-[#71717A]"
                  }`}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-mono ${integration.connected ? "text-[#00E559]" : "text-[#71717A]"}`}>
                  {integration.connected ? "CONNECTED" : "DISCONNECTED"}
                </span>
                {integration.connected && (
                  <span className="text-[10px] text-[#A1A1AA] font-mono">2 active</span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="flex-1 border-t border-[#27272A] p-3">
        <div className="text-xs text-[#71717A] font-mono uppercase tracking-wider mb-2">
          RAG Reasoning
        </div>
        <div className="space-y-2">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="text-[10px] text-[#A1A1AA] font-mono p-2 bg-[#121212] border border-[#27272A]"
          >
            <span className="text-[#FFB000]">[RETRIEVAL]</span> Searching knowledge base...
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
            className="text-[10px] text-[#A1A1AA] font-mono p-2 bg-[#121212] border border-[#27272A]"
          >
            <span className="text-[#00E559]">[CONTEXT]</span> 3 documents matched
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            className="text-[10px] text-[#A1A1AA] font-mono p-2 bg-[#121212] border border-[#27272A]"
          >
            <span className="text-[#007AFF]">[REASONING]</span> Generating response...
          </motion.div>
        </div>
      </div>
    </motion.aside>
  );
};

